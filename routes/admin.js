const express = require('express');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Review = require('../models/Review');
const Complaint = require('../models/Complaint');
const Appointment = require('../models/Appointment');
const AuditLog = require('../models/AuditLog');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin role
router.use(authMiddleware, roleMiddleware(['admin']));

async function addAuditLog(req, action, entityType, entityId, description, changes = {}) {
  try {
    await AuditLog.create({
      adminId: req.user.id,
      action,
      entityType,
      entityId,
      description,
      changes,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
  } catch (error) {
    // Keep route responses resilient even if audit logging fails.
    console.error('Audit log error:', error.message);
  }
}

async function refreshDoctorReviewStats(doctorId) {
  const approvedReviews = await Review.find({ doctorId, isApproved: true });
  const reviewCount = approvedReviews.length;
  const rating = reviewCount
    ? approvedReviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
    : 0;

  await Doctor.findByIdAndUpdate(doctorId, {
    reviewCount,
    rate: Number(rating.toFixed(1)),
  });
}

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [pendingDoctors, verifiedDoctors, rejectedDoctors, totalReviews, openComplaints, totalAppointments] = await Promise.all([
      Doctor.countDocuments({ onboardingStatus: 'pending' }),
      Doctor.countDocuments({ onboardingStatus: 'verified', verified: true }),
      Doctor.countDocuments({ onboardingStatus: 'rejected' }),
      Review.countDocuments({}),
      Complaint.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
      Appointment.countDocuments({}),
    ]);

    return res.json({
      success: true,
      stats: {
        pendingDoctors,
        verifiedDoctors,
        rejectedDoctors,
        totalReviews,
        openComplaints,
        totalAppointments,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch stats' });
  }
});

// GET /api/admin/doctors/pending
router.get('/doctors/pending', async (req, res) => {
  try {
    const doctors = await Doctor.find({ onboardingStatus: 'pending' })
      .populate('userId', 'name email createdAt')
      .sort({ createdAt: -1 });

    const data = doctors.map((doctor) => ({
      _id: doctor._id,
      userId: doctor.userId?._id,
      name: doctor.name,
      profileImage: doctor.profileImage || '',
      email: doctor.userId?.email || '',
      specialty: doctor.specialty,
      hospital: doctor.hospital,
      city: doctor.city,
      education: doctor.education,
      experience: doctor.experience,
      consultationFee: doctor.consultationFee,
      teleconsultationFee: doctor.teleconsultationFee,
      languages: doctor.languages || [],
      medicalRegistrationNumber: doctor.medicalRegistrationNumber || '',
      registrationCouncil: doctor.registrationCouncil || '',
      clinicAddress: doctor.clinicAddress || '',
      emergencyContactNumber: doctor.emergencyContactNumber || '',
      onboardingStatus: doctor.onboardingStatus,
      verified: doctor.verified,
      createdAt: doctor.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch pending doctors' });
  }
});

// GET /api/admin/doctors/all
router.get('/doctors/all', async (req, res) => {
  try {
    const doctors = await Doctor.find({})
      .populate('userId', 'name email createdAt')
      .sort({ createdAt: -1 });

    const data = doctors.map((doctor) => ({
      _id: doctor._id,
      userId: doctor.userId?._id,
      name: doctor.name,
      profileImage: doctor.profileImage || '',
      email: doctor.userId?.email || '',
      specialty: doctor.specialty,
      city: doctor.city,
      onboardingStatus: doctor.onboardingStatus,
      verified: doctor.verified,
      verificationNotes: doctor.verificationNotes || '',
      createdAt: doctor.createdAt,
      verifiedAt: doctor.verifiedAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch doctors' });
  }
});

// PATCH /api/admin/doctors/:id/verify
router.patch('/doctors/:id/verify', async (req, res) => {
  try {
    const { notes } = req.body;

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    doctor.verified = true;
    doctor.onboardingStatus = 'verified';
    doctor.verificationNotes = notes || 'Verified by admin';
    doctor.verifiedAt = new Date();
    doctor.verifiedBy = req.user.id;
    await doctor.save();

    await User.findByIdAndUpdate(doctor.userId, { isVerified: true });
    await addAuditLog(req, 'verify_doctor', 'doctor', doctor._id, `Verified doctor ${doctor.name}`, {
      onboardingStatus: 'verified',
      verified: true,
    });

    return res.json({
      success: true,
      message: 'Doctor verified successfully',
      data: {
        _id: doctor._id,
        verified: doctor.verified,
        onboardingStatus: doctor.onboardingStatus,
        verificationNotes: doctor.verificationNotes,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to verify doctor' });
  }
});

// PATCH /api/admin/doctors/:id/reject
router.patch('/doctors/:id/reject', async (req, res) => {
  try {
    const { notes } = req.body;

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    doctor.verified = false;
    doctor.onboardingStatus = 'rejected';
    doctor.verificationNotes = notes || 'Rejected by admin';
    doctor.verifiedAt = null;
    doctor.verifiedBy = null;
    await doctor.save();

    await User.findByIdAndUpdate(doctor.userId, { isVerified: false });
    await addAuditLog(req, 'reject_doctor', 'doctor', doctor._id, `Rejected doctor ${doctor.name}`, {
      onboardingStatus: 'rejected',
      verified: false,
    });

    return res.json({
      success: true,
      message: 'Doctor rejected',
      data: {
        _id: doctor._id,
        verified: doctor.verified,
        onboardingStatus: doctor.onboardingStatus,
        verificationNotes: doctor.verificationNotes,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to reject doctor' });
  }
});

// GET /api/admin/reviews
router.get('/reviews', async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const filter = {};

    if (status === 'pending') filter.isApproved = false;
    if (status === 'approved') filter.isApproved = true;
    if (status === 'flagged') filter.isFlagged = true;

    const reviews = await Review.find(filter)
      .populate('userId', 'name email')
      .populate('doctorId', 'name specialty city')
      .sort({ createdAt: -1 });

    const data = reviews.map((review) => ({
      _id: review._id,
      rating: review.rating,
      title: review.title || '',
      comment: review.comment || '',
      isApproved: review.isApproved,
      isFlagged: review.isFlagged,
      flagReason: review.flagReason || '',
      patientName: review.userId?.name || 'Patient',
      patientEmail: review.userId?.email || '',
      doctorName: review.doctorId?.name || 'Doctor',
      doctorSpecialty: review.doctorId?.specialty || '',
      createdAt: review.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch reviews' });
  }
});

// PATCH /api/admin/reviews/:id/approve
router.patch('/reviews/:id/approve', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.isApproved = true;
    review.isFlagged = false;
    review.flagReason = '';
    await review.save();
    await refreshDoctorReviewStats(review.doctorId);

    await addAuditLog(req, 'approve_review', 'review', review._id, 'Approved review', { isApproved: true });
    return res.json({ success: true, message: 'Review approved' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to approve review' });
  }
});

// PATCH /api/admin/reviews/:id/reject
router.patch('/reviews/:id/reject', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.isApproved = false;
    review.isFlagged = true;
    review.flagReason = req.body.reason || 'Rejected by admin';
    await review.save();
    await refreshDoctorReviewStats(review.doctorId);

    await addAuditLog(req, 'reject_review', 'review', review._id, 'Rejected review', {
      isApproved: false,
      isFlagged: true,
    });
    return res.json({ success: true, message: 'Review rejected' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to reject review' });
  }
});

// GET /api/admin/pricing
router.get('/pricing', async (req, res) => {
  try {
    const doctors = await Doctor.find({}).sort({ createdAt: -1 });
    const data = doctors.map((doctor) => ({
      _id: doctor._id,
      name: doctor.name,
      specialty: doctor.specialty,
      city: doctor.city,
      consultationFee: doctor.consultationFee,
      teleconsultationFee: doctor.teleconsultationFee,
      rate: doctor.rate || 0,
      reviewCount: doctor.reviewCount || 0,
      onboardingStatus: doctor.onboardingStatus,
    }));
    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch pricing data' });
  }
});

// PATCH /api/admin/pricing/:id
router.patch('/pricing/:id', async (req, res) => {
  try {
    const { consultationFee, teleconsultationFee } = req.body;
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    if (consultationFee !== undefined) doctor.consultationFee = Number(consultationFee);
    if (teleconsultationFee !== undefined) doctor.teleconsultationFee = Number(teleconsultationFee);
    await doctor.save();

    await addAuditLog(req, 'update_pricing', 'doctor', doctor._id, `Updated pricing for ${doctor.name}`, {
      consultationFee: doctor.consultationFee,
      teleconsultationFee: doctor.teleconsultationFee,
    });

    return res.json({ success: true, message: 'Pricing updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update pricing' });
  }
});

// GET /api/admin/complaints
router.get('/complaints', async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const filter = {};
    if (status !== 'all') filter.status = status;

    const complaints = await Complaint.find(filter)
      .populate('userId', 'name email')
      .populate('doctorId', 'name specialty')
      .sort({ createdAt: -1 });

    const data = complaints.map((complaint) => ({
      _id: complaint._id,
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      priority: complaint.priority,
      status: complaint.status,
      resolutionNotes: complaint.resolutionNotes || '',
      patientName: complaint.userId?.name || 'Patient',
      patientEmail: complaint.userId?.email || '',
      doctorName: complaint.doctorId?.name || 'N/A',
      createdAt: complaint.createdAt,
      updatedAt: complaint.updatedAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch complaints' });
  }
});

// PATCH /api/admin/complaints/:id/status
router.patch('/complaints/:id/status', async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body;
    const allowed = ['open', 'in-progress', 'resolved', 'closed'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid complaint status' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    complaint.status = status;
    if (resolutionNotes !== undefined) complaint.resolutionNotes = resolutionNotes;
    if (status === 'resolved' || status === 'closed') {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.user.id;
    }
    await complaint.save();

    await addAuditLog(req, 'resolve_complaint', 'complaint', complaint._id, `Updated complaint status to ${status}`, {
      status,
      resolutionNotes: complaint.resolutionNotes || '',
    });

    return res.json({ success: true, message: 'Complaint status updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update complaint status' });
  }
});

// GET /api/admin/appointments
router.get('/appointments', async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    const filter = {};
    if (status !== 'all') filter.status = status;

    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name specialty city')
      .populate('userId', 'name email')
      .sort({ appointmentDate: -1, createdAt: -1 });

    const data = appointments.map((appointment) => ({
      _id: appointment._id,
      appointmentDate: appointment.appointmentDate,
      time: appointment.time,
      type: appointment.type,
      status: appointment.status,
      consultationFee: appointment.consultationFee || 0,
      patientName: appointment.userId?.name || 'Patient',
      patientEmail: appointment.userId?.email || '',
      doctorName: appointment.doctorId?.name || 'Doctor',
      doctorSpecialty: appointment.doctorId?.specialty || '',
      doctorCity: appointment.doctorId?.city || '',
      createdAt: appointment.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch appointments' });
  }
});

// PATCH /api/admin/appointments/:id/status
router.patch('/appointments/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['booked', 'confirmed', 'completed', 'cancelled', 'no-show'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment status' });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    appointment.status = status;
    await appointment.save();

    await addAuditLog(req, 'update_appointment_status', 'appointment', appointment._id, `Updated appointment to ${status}`, {
      status,
    });

    return res.json({ success: true, message: 'Appointment updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update appointment' });
  }
});

// GET /api/admin/analytics
router.get('/analytics', async (req, res) => {
  try {
    const [appointmentsByStatus, complaintsByCategory, doctorsByCity, topRatedDoctors] = await Promise.all([
      Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Doctor.aggregate([{ $group: { _id: '$city', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
      Doctor.find({ verified: true }).sort({ rate: -1, reviewCount: -1 }).limit(5).select('name specialty city rate reviewCount'),
    ]);

    return res.json({
      success: true,
      data: {
        appointmentsByStatus,
        complaintsByCategory,
        doctorsByCity,
        topRatedDoctors,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch analytics' });
  }
});

// GET /api/admin/fraud
router.get('/fraud', async (req, res) => {
  try {
    const [flaggedDoctors, flaggedReviews, criticalComplaints] = await Promise.all([
      Doctor.find({ flagged: true }).select('name specialty city flagReason updatedAt').sort({ updatedAt: -1 }),
      Review.find({ isFlagged: true })
        .populate('doctorId', 'name specialty')
        .populate('userId', 'name email')
        .sort({ updatedAt: -1 })
        .limit(20),
      Complaint.find({ priority: 'critical', status: { $in: ['open', 'in-progress'] } })
        .populate('userId', 'name email')
        .populate('doctorId', 'name')
        .sort({ createdAt: -1 }),
    ]);

    return res.json({
      success: true,
      data: {
        flaggedDoctors,
        flaggedReviews,
        criticalComplaints,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch fraud insights' });
  }
});

// GET /api/admin/helpline
router.get('/helpline', async (req, res) => {
  try {
    const tickets = await Complaint.find({ category: 'other' })
      .populate('userId', 'name email')
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    const data = tickets.map((ticket) => ({
      _id: ticket._id,
      userName: ticket.userId?.name || 'Patient',
      userEmail: ticket.userId?.email || '',
      doctorName: ticket.doctorId?.name || 'N/A',
      title: ticket.title,
      message: ticket.description,
      status: ticket.status,
      createdAt: ticket.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch helpline tickets' });
  }
});

// GET /api/admin/clinics
router.get('/clinics', async (req, res) => {
  try {
    const grouped = await Doctor.aggregate([
      {
        $group: {
          _id: { hospital: '$hospital', city: '$city' },
          doctorsCount: { $sum: 1 },
          verifiedDoctors: {
            $sum: {
              $cond: [{ $eq: ['$onboardingStatus', 'verified'] }, 1, 0],
            },
          },
          avgConsultationFee: { $avg: '$consultationFee' },
        },
      },
      { $sort: { doctorsCount: -1 } },
      { $limit: 50 },
    ]);

    const data = grouped.map((item, index) => ({
      _id: `${item._id.hospital}-${item._id.city}-${index}`,
      hospital: item._id.hospital,
      city: item._id.city,
      doctorsCount: item.doctorsCount,
      verifiedDoctors: item.verifiedDoctors,
      avgConsultationFee: Math.round(item.avgConsultationFee || 0),
      status: item.verifiedDoctors > 0 ? 'active' : 'pending',
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch clinics' });
  }
});

// GET /api/admin/audit
router.get('/audit', async (req, res) => {
  try {
    const logs = await AuditLog.find({})
      .populate('adminId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(150);

    const data = logs.map((log) => ({
      _id: log._id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      description: log.description || '',
      changes: log.changes || {},
      adminName: log.adminId?.name || 'Admin',
      adminEmail: log.adminId?.email || '',
      createdAt: log.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch audit logs' });
  }
});

module.exports = router;
