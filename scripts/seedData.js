const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Review = require('../models/Review');

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

const seedData = async () => {
  try {
    console.log('\n🌱 Starting Database Seed...\n');

    // Clear existing data
    await User.deleteMany({});
    await Doctor.deleteMany({});
    await Appointment.deleteMany({});
    await Review.deleteMany({});

    // Create users
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@mediaguide.com',
      password: 'admin123',
      role: 'admin',
      isVerified: true,
    });

    const touristUser = await User.create({
      name: 'John Traveler',
      email: 'user@mediaguide.com',
      password: 'user123',
      role: 'tourist',
      nationality: 'American',
      isVerified: true,
    });

    console.log('✅ Created Users');

    // Create doctors
    const doctors = await Doctor.insertMany([
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Priya Sharma',
        specialty: 'General Physician',
        city: 'Delhi',
        languages: ['English', 'Hindi', 'Punjabi'],
        experience: 12,
        education: 'MBBS, MD - AIIMS Delhi',
        medicalRegistrationNumber: 'MCI-2012-75234',
        registrationCouncil: 'Delhi Medical Council',
        hospital: 'Apollo Clinic, Connaught Place',
        about:
          'Experienced general physician specializing in travel medicine and tourist health care.',
        consultationFee: 800,
        teleconsultationFee: 600,
        rate: 4.8,
        verified: true,
        touristFriendly: true,
        teleconsultation: true,
        symptoms: [
          'fever',
          'cold',
          'cough',
          'headache',
          'fatigue',
          'nausea',
          'diarrhea',
          'vomiting',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Arjun Mehta',
        specialty: 'Orthopedic',
        city: 'Mumbai',
        languages: ['English', 'Hindi', 'Marathi'],
        experience: 15,
        education: 'MBBS, MS Orthopedics - KEM Mumbai',
        medicalRegistrationNumber: 'MCI-2009-62847',
        registrationCouncil: 'Maharashtra Medical Council',
        hospital: 'Lilavati Hospital, Bandra',
        about:
          'Specialist in sports injuries and orthopedic conditions common in travelers.',
        consultationFee: 1200,
        teleconsultationFee: 900,
        rate: 4.7,
        verified: true,
        touristFriendly: true,
        teleconsultation: false,
        symptoms: [
          'joint pain',
          'back pain',
          'knee pain',
          'fracture',
          'sprain',
          'muscle pain',
          'swelling',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Kavitha Reddy',
        specialty: 'Gastroenterologist',
        city: 'Bangalore',
        languages: ['English', 'Kannada', 'Telugu'],
        experience: 18,
        education: 'MBBS, MD, DM Gastroenterology - NIMHANS',
        medicalRegistrationNumber: 'MCI-2006-41567',
        registrationCouncil: 'Karnataka Medical Council',
        hospital: 'Manipal Hospital, Whitefield',
        about:
          'Expert in digestive disorders and food-related illnesses common among travelers.',
        consultationFee: 1500,
        teleconsultationFee: 1200,
        rate: 4.9,
        verified: true,
        touristFriendly: true,
        teleconsultation: true,
        symptoms: [
          'stomach pain',
          'diarrhea',
          'vomiting',
          'food poisoning',
          'indigestion',
          'bloating',
          'nausea',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Rajesh Kumar',
        specialty: 'Dermatologist',
        city: 'Jaipur',
        languages: ['English', 'Hindi', 'Rajasthani'],
        experience: 10,
        education: 'MBBS, MD Dermatology - SMS Medical College',
        medicalRegistrationNumber: 'MCI-2014-58932',
        registrationCouncil: 'Rajasthan Medical Council',
        hospital: 'SMS Medical College Hospital',
        about:
          'Dermatology specialist dealing with sun exposure, allergies, and skin infections.',
        consultationFee: 900,
        teleconsultationFee: 700,
        rate: 4.6,
        verified: true,
        touristFriendly: true,
        teleconsultation: true,
        symptoms: [
          'rash',
          'itching',
          'sunburn',
          'skin allergy',
          'hives',
          'eczema',
          'insect bite',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Ananya Das',
        specialty: 'ENT Specialist',
        city: 'Kolkata',
        languages: ['English', 'Hindi', 'Bengali'],
        experience: 8,
        education: 'MBBS, MS ENT - Calcutta Medical College',
        medicalRegistrationNumber: 'MCI-2016-39283',
        registrationCouncil: 'West Bengal Medical Council',
        hospital: 'AMRI Hospitals, Salt Lake',
        about: 'ENT specialist experienced with altitude sickness and respiratory issues in travelers.',
        consultationFee: 700,
        teleconsultationFee: 500,
        rate: 4.5,
        verified: true,
        touristFriendly: false,
        teleconsultation: true,
        symptoms: [
          'ear pain',
          'sore throat',
          'nasal congestion',
          'sinusitis',
          'hearing loss',
          'tonsils',
          'cold',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Vikram Singh',
        specialty: 'Cardiologist',
        city: 'Delhi',
        languages: ['English', 'Hindi'],
        experience: 22,
        education: 'MBBS, MD, DM Cardiology - AIIMS',
        medicalRegistrationNumber: 'MCI-2004-28476',
        registrationCouncil: 'Delhi Medical Council',
        hospital: 'Fortis Hospital, Vasant Kunj',
        about: 'Senior cardiologist with expertise in emergency cardiac care for travelers.',
        consultationFee: 2000,
        teleconsultationFee: 1500,
        rate: 4.9,
        verified: true,
        touristFriendly: true,
        teleconsultation: true,
        symptoms: [
          'chest pain',
          'shortness of breath',
          'heart palpitations',
          'dizziness',
          'fainting',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Sunita Patel',
        specialty: 'Ophthalmologist',
        city: 'Ahmedabad',
        languages: ['English', 'Hindi', 'Gujarati'],
        experience: 14,
        education: 'MBBS, MS Ophthalmology - BJ Medical College',
        medicalRegistrationNumber: 'MCI-2010-45621',
        registrationCouncil: 'Gujarat Medical Council',
        hospital: 'L.G. Hospital, Maninagar',
        about: 'Eye specialist handling dust-related eye issues common among tourists.',
        consultationFee: 800,
        teleconsultationFee: 600,
        rate: 4.7,
        verified: true,
        touristFriendly: true,
        teleconsultation: false,
        symptoms: [
          'eye pain',
          'red eye',
          'blurred vision',
          'eye irritation',
          'eye infection',
          'dust in eye',
        ],
      },
      {
        userId: new mongoose.Types.ObjectId(),
        name: 'Dr. Mohammed Farhan',
        specialty: 'General Physician',
        city: 'Hyderabad',
        languages: ['English', 'Hindi', 'Urdu', 'Telugu'],
        experience: 16,
        education: 'MBBS, MD Internal Medicine - Osmania Medical College',
        medicalRegistrationNumber: 'MCI-2008-53847',
        registrationCouncil: 'Telangana Medical Council',
        hospital: 'Care Hospital, Banjara Hills',
        about:
          'Multilingual general physician specializing in travel health and tropical diseases.',
        consultationFee: 750,
        teleconsultationFee: 550,
        rate: 4.8,
        verified: true,
        touristFriendly: true,
        teleconsultation: true,
        symptoms: [
          'fever',
          'typhoid',
          'malaria',
          'dengue',
          'fatigue',
          'body ache',
          'headache',
          'cold',
          'cough',
        ],
      },
    ]);

    console.log('✅ Created 8 Doctors');

    // Create reviews
    await Review.insertMany([
      {
        doctorId: doctors[0]._id,
        userId: touristUser._id,
        rating: 5,
        title: 'Excellent Doctor',
        comment: 'Very professional and helpful. Highly recommended!',
        isApproved: true,
      },
      {
        doctorId: doctors[0]._id,
        userId: touristUser._id,
        rating: 4,
        title: 'Good Experience',
        comment: 'Great doctor, quick diagnosis.',
        isApproved: true,
      },
    ]);

    console.log('✅ Created Sample Reviews');
    console.log('\n✅ Database Seeding Complete!\n');
    console.log('Demo Accounts:');
    console.log('  Admin: admin@mediaguide.com / admin123');
    console.log('  Tourist: user@mediaguide.com / user123\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding Error:', err);
    process.exit(1);
  }
};

connectDB().then(() => seedData());
