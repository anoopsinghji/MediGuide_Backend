const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

const createAdminUser = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || 'mongodb://localhost:27017/mediaguide-nextgen',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@mediaguide.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      mongoose.connection.close();
      return;
    }

    // Create new admin user
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@mediaguide.com',
      password: 'admin123',
      role: 'admin',
      isVerified: true,
    });

    console.log('✅ Admin user created successfully');
    console.log('Email: admin@mediaguide.com');
    console.log('Password: admin123');

    mongoose.connection.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

createAdminUser();
