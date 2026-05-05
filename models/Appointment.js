const mongoose = require('mongoose');
const IST_OFFSET_MS = 330 * 60 * 1000;

function getIstDayStartTimestamp(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

const appointmentSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointmentDate: {
      type: Date,
      required: true,
      validate: {
        validator: function validateAppointmentDate(value) {
          if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
            return false;
          }

          if (!this.isNew && !this.isModified('appointmentDate')) {
            return true;
          }

          const now = new Date();
          return getIstDayStartTimestamp(value) >= getIstDayStartTimestamp(now);
        },
        message: 'appointmentDate cannot be in the past (IST).',
      },
    },
    time: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['in-person', 'teleconsultation'],
      required: true,
    },
    status: {
      type: String,
      enum: ['booked', 'confirmed', 'completed', 'cancelled', 'no-show'],
      default: 'booked',
    },
    notes: String,
    symptoms: [String],
    consultationFee: Number,
    cancellationReason: String,
    cancelledAt: Date,
    completedAt: Date,
    prescription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
    },
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
    },
    roomLink: String, // For teleconsultation
    videoRoomName: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Backward compatibility for earlier typo used in existing records.
    videRoomName: {
      type: String,
      default: undefined,
    },
    roomToken: {
      type: String,
      default: null,
    },
    videoStartTime: {
      type: Date,
      default: null,
    },
    videoEndTime: {
      type: Date,
      default: null,
    },
    videoDuration: {
      type: Number, // in seconds
      default: 0,
    },
    videoStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'missed'],
      default: 'not_started',
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

// Index for queries
appointmentSchema.index({ doctorId: 1, appointmentDate: 1 });
appointmentSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
