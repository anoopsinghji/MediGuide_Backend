const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Review = require('../models/Review');
const Complaint = require('../models/Complaint');
const Chat = require('../models/Chat');
const Prescription = require('../models/Prescription');
const AuditLog = require('../models/AuditLog');

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || 'mongodb://localhost:27017/mediaguide-nextgen',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB Connection Failed:', err.message);
    process.exit(1);
  }
};

const resetDatabase = async () => {
  try {
    console.log('\n⚠️  WARNING: This will delete ALL data from the database!\n');
    console.log('Clearing all collections...\n');

    await User.deleteMany({});
    console.log('✅ Users cleared');

    await Doctor.deleteMany({});
    console.log('✅ Doctors cleared');

    await Appointment.deleteMany({});
    console.log('✅ Appointments cleared');

    await Review.deleteMany({});
    console.log('✅ Reviews cleared');

    await Complaint.deleteMany({});
    console.log('✅ Complaints cleared');

    await Chat.deleteMany({});
    console.log('✅ Chats cleared');

    await Prescription.deleteMany({});
    console.log('✅ Prescriptions cleared');

    await AuditLog.deleteMany({});
    console.log('✅ Audit Logs cleared');

    console.log('\n✅ Database Reset Complete!\n');
    console.log('Run: npm run seed   to populate with sample data\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Reset Error:', err);
    process.exit(1);
  }
};

connectDB().then(() => resetDatabase());
