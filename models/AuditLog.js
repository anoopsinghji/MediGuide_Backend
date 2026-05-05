const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'verify_doctor',
        'reject_doctor',
        'flag_doctor',
        'approve_review',
        'reject_review',
        'delete_review',
        'update_pricing',
        'resolve_complaint',
        'update_appointment_status',
        'delete_doctor',
        'create_admin_user',
        'other',
      ],
    },
    entityType: {
      type: String,
      enum: ['doctor', 'review', 'complaint', 'appointment', 'user'],
    },
    entityId: mongoose.Schema.Types.ObjectId,
    changes: mongoose.Schema.Types.Mixed,
    description: String,
    ipAddress: String,
    userAgent: String,
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for admin queries
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
