// Export all models from one file for easier imports
module.exports = {
  User: require('./User'),
  Doctor: require('./Doctor'),
  Appointment: require('./Appointment'),
  Review: require('./Review'),
  Complaint: require('./Complaint'),
  Chat: require('./Chat'),
  Prescription: require('./Prescription'),
  AuditLog: require('./AuditLog'),
};
