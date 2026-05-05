const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    specialty: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: undefined,
      },
      coordinates: {
        type: [Number],
        default: undefined,
        validate: {
          validator: (value) => !value || value.length === 2,
          message: 'Coordinates must be an array of [longitude, latitude]',
        },
      },
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    languages: [String],
    localLanguages: [String],
    foreignLanguages: [String],
    qualifications: [
      {
        degree: { type: String, trim: true },
        specialization: { type: String, trim: true },
        university: { type: String, trim: true },
        year: { type: String, trim: true },
      },
    ],
    experience: {
      type: Number,
      required: true,
    },
    education: {
      type: String,
      required: true,
    },
    medicalRegistrationNumber: {
      type: String,
      required: true,
      trim: true,
    },
    registrationCouncil: {
      type: String,
      required: true,
      trim: true,
    },
    clinicAddress: {
      type: String,
      default: '',
    },
    emergencyContactNumber: {
      type: String,
      default: '',
    },
    onboardingStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    verificationNotes: {
      type: String,
      default: '',
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    hospital: {
      type: String,
      required: true,
    },
    about: String,
    consultationFee: {
      type: Number,
      required: true,
    },
    teleconsultationFee: Number,
    inClinicFee: Number,
    videoConsultationFee: Number,
    rate: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    touristFriendly: {
      type: Boolean,
      default: false,
    },
    flagged: {
      type: Boolean,
      default: false,
    },
    flagReason: String,
    teleconsultation: {
      type: Boolean,
      default: false,
    },
    availableToday: {
      type: Boolean,
      default: false,
    },
    symptoms: [String],
    profileImage: String,
    availability: {
      monday: [{ startTime: String, endTime: String }],
      tuesday: [{ startTime: String, endTime: String }],
      wednesday: [{ startTime: String, endTime: String }],
      thursday: [{ startTime: String, endTime: String }],
      friday: [{ startTime: String, endTime: String }],
      saturday: [{ startTime: String, endTime: String }],
      sunday: [{ startTime: String, endTime: String }],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for search
doctorSchema.index({ name: 'text', specialty: 'text', hospital: 'text' });
doctorSchema.index({ city: 1, verified: 1 });
doctorSchema.index({ onboardingStatus: 1, createdAt: -1 });
doctorSchema.index({ coordinates: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Doctor', doctorSchema);
