const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');

const router = express.Router();

async function recalculateDoctorReviewSummary(doctorId) {
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

router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { doctorId, appointmentId, rating, title = '', comment = '' } = req.body;

    const numericRating = Number(rating);

    if (!doctorId || !appointmentId || !numericRating || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Doctor, appointment, rating and comment are required',
      });
    }

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      userId: req.user.id,
      doctorId,
      status: 'completed',
    });

    if (!appointment) {
      return res.status(400).json({
        success: false,
        message: 'You can review only completed appointments that belong to you',
      });
    }

    if (appointment.review) {
      return res.status(409).json({
        success: false,
        message: 'A review already exists for this appointment',
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const review = await Review.create({
      doctorId,
      userId: req.user.id,
      appointmentId,
      rating: numericRating,
      title: title.trim(),
      comment: comment.trim(),
      isApproved: false,
      isFlagged: false,
      helpfulCount: 0,
    });

    appointment.review = review._id;
    await appointment.save();

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: review,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to submit review' });
  }
});

router.get('/my-reviews', authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.user.id })
      .populate('doctorId', 'name specialty hospital city')
      .sort({ createdAt: -1 });

    const data = reviews.map((review) => ({
      _id: review._id,
      doctorId: review.doctorId?._id,
      doctorName: review.doctorId?.name || 'Doctor',
      doctorSpecialty: review.doctorId?.specialty || '',
      doctorHospital: review.doctorId?.hospital || '',
      rating: review.rating,
      title: review.title || '',
      comment: review.comment || '',
      isApproved: review.isApproved,
      isFlagged: review.isFlagged,
      createdAt: review.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch your reviews' });
  }
});

router.get('/doctor/:doctorId', authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ doctorId: req.params.doctorId, isApproved: true })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    const data = reviews.map((review) => ({
      _id: review._id,
      rating: review.rating,
      title: review.title || '',
      comment: review.comment || '',
      patientName: review.userId?.name || 'Patient',
      createdAt: review.createdAt,
    }));

    return res.json({ success: true, data, count: data.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch doctor reviews' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, userId: req.user.id });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.isApproved) {
      return res.status(400).json({ success: false, message: 'Approved reviews cannot be edited' });
    }

    const { rating, title = '', comment = '' } = req.body;
    if (!rating || !comment.trim()) {
      return res.status(400).json({ success: false, message: 'Rating and comment are required' });
    }

    review.rating = Number(rating);
    review.title = title.trim();
    review.comment = comment.trim();
    await review.save();

    return res.json({ success: true, message: 'Review updated successfully', data: review });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update review' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, userId: req.user.id });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.isApproved) {
      return res.status(400).json({ success: false, message: 'Approved reviews cannot be deleted' });
    }

    await Appointment.findOneAndUpdate({ review: review._id }, { $unset: { review: 1 } });
    await review.deleteOne();

    return res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete review' });
  }
});

router.post('/:id/recalculate', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await recalculateDoctorReviewSummary(review.doctorId);
    return res.json({ success: true, message: 'Review summary recalculated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to recalculate review summary' });
  }
});

module.exports = router;