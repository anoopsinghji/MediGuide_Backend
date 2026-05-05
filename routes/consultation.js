const express = require('express');
const router = express.Router();
const { Appointment, Doctor } = require('../models');
const { authMiddleware } = require('../middleware/auth');

function getIceServers() {
  if (process.env.WEBRTC_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(process.env.WEBRTC_ICE_SERVERS);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      console.warn('Invalid WEBRTC_ICE_SERVERS JSON, using fallback STUN server');
    }
  }

  return [{ urls: ['stun:stun.l.google.com:19302'] }];
}

async function getConsultationAccess(appointment, userId) {
  const doctorId = appointment?.doctorId?._id || appointment?.doctorId;
  const patientId = appointment?.userId?._id || appointment?.userId;

  const doctor = doctorId ? await Doctor.findById(doctorId).select('userId name') : null;
  const isDoctorUser = !!doctor && doctor.userId?.toString() === userId;
  const isPatientUser = !!patientId && patientId.toString() === userId;

  return {
    isDoctorUser,
    isPatientUser,
    role: isDoctorUser ? 'doctor' : isPatientUser ? 'patient' : null,
  };
}

async function bootstrapWebRTCConsultation(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (appointment.type !== 'teleconsultation') {
      return res.status(400).json({ success: false, message: 'This is not a teleconsultation appointment' });
    }

    const access = await getConsultationAccess(appointment, req.user.id);
    if (!access.isDoctorUser && !access.isPatientUser) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this appointment' });
    }

    const now = new Date();
    const appointmentTime = new Date(appointment.appointmentDate);
    const timeDiff = (appointmentTime - now) / 1000 / 60;

    if (timeDiff > 60) {
      return res.status(400).json({
        success: false,
        message: 'You can only join 60 minutes before the appointment time',
        minutesUntilAvailable: Math.ceil(timeDiff - 60),
      });
    }

    const roomName = appointment.videoRoomName || appointment.videRoomName || `appointment-${appointment._id}`;
    const roomUpdated = appointment.videoRoomName !== roomName || appointment.videRoomName !== roomName;

    if (roomUpdated) {
      appointment.videoRoomName = roomName;
      appointment.videRoomName = roomName;
      if (!appointment.videoStatus) {
        appointment.videoStatus = 'not_started';
      }
      await appointment.save();
    }

    const forwardedProtoHeader = req.get('x-forwarded-proto');
    const forwardedHostHeader = req.get('x-forwarded-host');
    const forwardedProto = forwardedProtoHeader ? forwardedProtoHeader.split(',')[0].trim() : null;
    const forwardedHost = forwardedHostHeader ? forwardedHostHeader.split(',')[0].trim() : null;
    const requestProtocol = req.protocol;
    const requestHost = req.get('host');

    const signalingBaseUrl = process.env.SIGNALING_URL
      || (forwardedHost ? `${forwardedProto || 'https'}://${forwardedHost}` : `${requestProtocol}://${requestHost}`);
    const socketPath = process.env.SOCKET_IO_PATH || '/socket.io';

    return res.json({
      success: true,
      appointmentId: appointment._id,
      roomName,
      role: access.role,
      signaling: {
        url: signalingBaseUrl,
        path: socketPath,
      },
      iceServers: getIceServers(),
      videoStatus: appointment.videoStatus || 'not_started',
    });
  } catch (error) {
    console.error('Error bootstrapping WebRTC consultation:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while bootstrapping consultation',
      error: error.message,
    });
  }
}

/**
 * POST /api/consultation/webrtc-bootstrap/:appointmentId
 * Bootstrap native WebRTC consultation config
 */
router.post('/webrtc-bootstrap/:appointmentId', authMiddleware, bootstrapWebRTCConsultation);

/**
 * POST /api/consultation/video-room/:appointmentId
 * Backward compatible alias for existing frontend callers
 */
router.post('/video-room/:appointmentId', authMiddleware, bootstrapWebRTCConsultation);

/**
 * PATCH /api/consultation/start/:appointmentId
 * Mark consultation as started (begin time tracking)
 */
router.patch('/start/:appointmentId', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Check authorization (doctor only)
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the doctor can start the consultation' });
    }

    appointment.videoStatus = 'in_progress';
    appointment.videoStartTime = new Date();
    await appointment.save();

    res.json({
      success: true,
      message: 'Consultation started',
      appointment,
    });
  } catch (error) {
    console.error('Error starting consultation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * PATCH /api/consultation/end/:appointmentId
 * Mark consultation as completed (end time tracking and mark completed)
 */
router.patch('/end/:appointmentId', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Check authorization (doctor only)
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the doctor can end the consultation' });
    }

    const endTime = new Date();
    const duration = appointment.videoStartTime
      ? Math.round((endTime - appointment.videoStartTime) / 1000)
      : 0;

    appointment.videoStatus = 'completed';
    appointment.videoEndTime = endTime;
    appointment.videoDuration = duration;
    appointment.status = 'completed';
    appointment.completedAt = endTime;

    await appointment.save();

    res.json({
      success: true,
      message: 'Consultation ended',
      duration,
      appointment,
    });
  } catch (error) {
    console.error('Error ending consultation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * GET /api/consultation/status/:appointmentId
 * Get current video consultation status
 */
router.get('/status/:appointmentId', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId)
      .populate('doctorId')
      .populate('userId')
      .select('videoStatus videoStartTime videoEndTime videoDuration status type');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    const access = await getConsultationAccess(appointment, req.user.id);

    if (!access.isDoctorUser && !access.isPatientUser) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.json({
      success: true,
      videoStatus: appointment.videoStatus,
      videoStartTime: appointment.videoStartTime,
      videoEndTime: appointment.videoEndTime,
      videoDuration: appointment.videoDuration,
      appointmentStatus: appointment.status,
      type: appointment.type,
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

module.exports = router;
