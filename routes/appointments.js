const express = require('express');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const MIN_BOOKING_LEAD_MINUTES = 30;
const MIN_BOOKING_LEAD_MS = MIN_BOOKING_LEAD_MINUTES * 60 * 1000;

function parseDateParts(dateValue) {
  const dateText = String(dateValue || '').trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function parseTimeParts(timeValue) {
  const timeText = String(timeValue || '').trim();
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function toUtcDateFromIst(dateValue, timeValue = '00:00') {
  const dateParts = parseDateParts(dateValue);
  const timeParts = parseTimeParts(timeValue);
  if (!dateParts || !timeParts) return null;

  const utcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0
  ) - IST_OFFSET_MS;

  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCurrentIstDateString() {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istNow.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateFutureAppointmentDateTime(dateValue, timeValue) {
  const appointmentDateTime = toUtcDateFromIst(dateValue, timeValue);
  if (!appointmentDateTime) {
    return { valid: false, reason: 'Invalid appointment date or time' };
  }

  const minAllowedTime = Date.now() + MIN_BOOKING_LEAD_MS;
  if (appointmentDateTime.getTime() < minAllowedTime) {
    return {
      valid: false,
      reason: `Appointments must be scheduled at least ${MIN_BOOKING_LEAD_MINUTES} minutes in advance (IST).`,
    };
  }

  return { valid: true, appointmentDateTime };
}

function getDoctorSlotsForDate(doctor, appointmentDate) {
  const parsedDate = toUtcDateFromIst(appointmentDate, '00:00');
  if (!parsedDate) {
    return { slots: [], dayKey: null, parsedDate: null };
  }

  const dayIndex = new Date(parsedDate.getTime() + IST_OFFSET_MS).getUTCDay();
  const dayKey = DAY_KEYS[dayIndex];
  const dayAvailability = Array.isArray(doctor?.availability?.[dayKey])
    ? doctor.availability[dayKey]
    : [];

  const slots = dayAvailability
    .map((slot) => (slot?.startTime || '').trim())
    .filter(Boolean);

  return { slots, dayKey, parsedDate };
}

// Get doctor available slots for a date
router.get('/available-slots', authMiddleware, async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    const normalizedDate = String(date || '').trim();

    if (!doctorId || !normalizedDate) {
      return res.status(400).json({
        success: false,
        message: 'doctorId and date are required',
      });
    }

    if (normalizedDate < getCurrentIstDateString()) {
      return res.status(400).json({
        success: false,
        message: 'Past dates are not allowed for booking (IST).',
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.verified || doctor.flagged) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not available',
      });
    }

    if (!doctor.availableToday) {
      return res.status(200).json({
        success: true,
        message: 'Doctor is unavailable today',
        data: {
          doctorId,
          date,
          day: null,
          slots: [],
          availableToday: false,
        },
      });
    }

    const { slots, dayKey, parsedDate } = getDoctorSlotsForDate(doctor, normalizedDate);
    if (!dayKey || !parsedDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    const dayStart = new Date(parsedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(parsedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const bookedAppointments = await Appointment.find({
      doctorId,
      appointmentDate: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ['booked', 'confirmed'] },
    }).select('time -_id');

    const bookedSlots = bookedAppointments.map((appointment) => (appointment.time || '').trim());

    const nowPlusBuffer = Date.now() + MIN_BOOKING_LEAD_MS;
    const todayIst = getCurrentIstDateString();

    const availableSlots = slots.filter((slot) => {
      if (bookedSlots.includes(slot)) return false;

      if (normalizedDate === todayIst) {
        const slotDateTime = toUtcDateFromIst(normalizedDate, slot);
        if (!slotDateTime) return false;
        return slotDateTime.getTime() >= nowPlusBuffer;
      }

      return true;
    });

    return res.status(200).json({
      success: true,
      message: 'Available slots fetched successfully',
      data: {
        doctorId,
        date: normalizedDate,
        day: dayKey,
        slots: availableSlots,
      },
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch available slots',
    });
  }
});

// Book appointment
router.post('/book', authMiddleware, async (req, res) => {
  try {
    const { doctorId, appointmentDate, timeSlot, appointmentType, reason, notes } = req.body;
    const normalizedDate = String(appointmentDate || '').trim();
    const normalizedTime = String(timeSlot || '').trim();

    if (!doctorId || !normalizedDate || !normalizedTime) {
      return res.status(400).json({
        success: false,
        message: 'doctorId, appointmentDate and timeSlot are required',
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.verified || doctor.flagged) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not available for booking',
      });
    }

    if (!doctor.availableToday) {
      return res.status(400).json({
        success: false,
        message: 'Doctor is unavailable today',
      });
    }

    const { slots, parsedDate } = getDoctorSlotsForDate(doctor, normalizedDate);
    if (!parsedDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointmentDate',
      });
    }

    if (!slots.includes(normalizedTime)) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is not available for this doctor on selected date',
      });
    }

    const futureValidation = validateFutureAppointmentDateTime(normalizedDate, normalizedTime);
    if (!futureValidation.valid) {
      return res.status(400).json({
        success: false,
        message: futureValidation.reason,
      });
    }

    const dayStart = new Date(parsedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(parsedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const existingAppointment = await Appointment.findOne({
      doctorId,
      appointmentDate: { $gte: dayStart, $lte: dayEnd },
      time: normalizedTime,
      status: { $in: ['booked', 'confirmed'] },
    });

    if (existingAppointment) {
      return res.status(409).json({
        success: false,
        message: 'This slot has already been booked. Please choose another time.',
      });
    }

    const appointment = await Appointment.create({
      doctorId,
      userId: req.user.id,
      appointmentDate: parsedDate,
      time: normalizedTime,
      type: appointmentType === 'Teleconsultation' ? 'teleconsultation' : 'in-person',
      notes: notes || reason || '',
      consultationFee: doctor.consultationFee,
      status: 'booked',
    });

    const populated = await Appointment.findById(appointment._id).populate(
      'doctorId',
      'name specialty hospital consultationFee'
    );

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: populated,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This appointment could not be created due to a duplicate record. Please choose another time slot.',
      });
    }

    console.error('Book appointment error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to book appointment',
    });
  }
});

// My appointments
router.get('/my-appointments', authMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.id })
      .populate('doctorId', 'name specialty hospital consultationFee')
      .populate('review', '_id rating createdAt')
      .sort({ appointmentDate: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Appointments fetched successfully',
      data: appointments,
      count: appointments.length,
    });
  } catch (error) {
    console.error('Get my appointments error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch appointments',
    });
  }
});

// Get appointment by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ _id: req.params.id, userId: req.user.id })
      .populate('doctorId', 'name specialty hospital consultationFee profileImage')
      .populate('userId', 'name email phone nationality');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Appointment fetched successfully',
      appointment,
    });
  } catch (error) {
    console.error('Get appointment by id error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch appointment',
    });
  }
});

// Cancel appointment
router.put('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Appointment is already cancelled',
      });
    }

    appointment.status = 'cancelled';
    appointment.cancellationReason = reason || 'Cancelled by patient';
    appointment.cancelledAt = new Date();
    await appointment.save();

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: appointment,
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel appointment',
    });
  }
});

module.exports = router;
