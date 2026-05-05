const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Chat = require('../models/Chat');
const Prescription = require('../models/Prescription');
const Review = require('../models/Review');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'secret_key');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;
const uploadRoot = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
const doctorUploadDir = path.join(uploadRoot, 'doctors');

fs.mkdirSync(doctorUploadDir, { recursive: true });

const profileImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, doctorUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `doctor-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const profileImageUpload = multer({
  storage: profileImageStorage,
  limits: { fileSize: MAX_PROFILE_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(new Error('Only JPG and PNG image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

function removeLocalDoctorPhoto(filePath = '') {
  if (!filePath.startsWith('/uploads/doctors/')) return;
  const fullPath = path.join(uploadRoot, filePath.replace('/uploads/', ''));
  fs.unlink(fullPath, () => {});
}

function uploadDoctorProfileImage(req, res, next) {
  profileImageUpload.single('profileImage')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Profile image must be 2MB or smaller',
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || 'Invalid profile image upload',
    });
  });
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function doctorAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Doctor access only' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function defaultAvailability() {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

function toMvpAvailability(availability = {}) {
  const output = {};
  DAYS.forEach((day) => {
    const entries = Array.isArray(availability[day]) ? availability[day] : [];
    output[day] = {
      open: entries.length > 0,
      slots: entries.map((s) => s.startTime).filter(Boolean),
    };
  });
  return output;
}

function toDbAvailability(availability = {}) {
  const output = defaultAvailability();
  DAYS.forEach((day) => {
    const dayData = availability[day] || { open: false, slots: [] };
    const slots = Array.isArray(dayData.slots) ? dayData.slots : [];
    output[day] = dayData.open
      ? slots.map((slot) => ({ startTime: slot, endTime: slot }))
      : [];
  });
  return output;
}

async function getDoctorByUserId(userId) {
  return Doctor.findOne({ userId });
}

function normalizeAppointmentStatus(status = '') {
  if (status === 'booked') return 'pending';
  if (status === 'no-show') return 'cancelled';
  return status;
}

function parseAppointmentTime(time = '') {
  const raw = String(time || '').trim();
  const hhmm24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm24) {
    return {
      hours: Math.min(23, Math.max(0, Number(hhmm24[1]))),
      minutes: Math.min(59, Math.max(0, Number(hhmm24[2]))),
    };
  }

  const hhmm12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (hhmm12) {
    let hours = Number(hhmm12[1]) % 12;
    const minutes = Math.min(59, Math.max(0, Number(hhmm12[2])));
    const period = hhmm12[3].toUpperCase();
    if (period === 'PM') hours += 12;
    return { hours, minutes };
  }

  return null;
}

function getAppointmentDateTime(appointmentDate, time) {
  const date = new Date(appointmentDate);
  if (Number.isNaN(date.getTime())) return null;

  const parsedTime = parseAppointmentTime(time);
  if (parsedTime) {
    date.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  }

  return date;
}

// IST offset (minutes -> ms) for date comparisons and formatting
const IST_OFFSET_MS = 330 * 60 * 1000;

function toIstDateString(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().split('T')[0];
}

function mapDashboardAppointment(appointment) {
  return {
    _id: appointment._id,
    patientName: appointment.userId?.name || 'Patient',
    patientEmail: appointment.userId?.email || '',
    nationality: appointment.userId?.nationality || '',
    age: appointment.userId?.age,
    gender: appointment.userId?.gender || '',
    bloodGroup: appointment.userId?.bloodGroup || '',
    existingConditions: appointment.userId?.existingConditions || [],
    date: toIstDateString(appointment.appointmentDate),
    time: appointment.time,
    type: appointment.type,
    symptoms: Array.isArray(appointment.symptoms) ? appointment.symptoms.join(', ') : '',
    status: normalizeAppointmentStatus(appointment.status),
    fee: appointment.consultationFee || 0,
    createdAt: appointment.createdAt,
  };
}

// POST /api/doctor/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), role: 'doctor' });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    let doctor = await getDoctorByUserId(user._id);
    if (!doctor) {
      doctor = await Doctor.create({
        userId: user._id,
        name: user.name,
        specialty: 'General Physician',
        city: 'N/A',
        state: 'N/A',
        languages: ['English'],
        localLanguages: ['Hindi'],
        foreignLanguages: ['English'],
        experience: 0,
        education: 'MBBS',
        hospital: 'N/A',
        consultationFee: 500,
        teleconsultationFee: 400,
        inClinicFee: 500,
        videoConsultationFee: 400,
        verified: false,
        teleconsultation: false,
        touristFriendly: false,
        availability: defaultAvailability(),
      });
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: 'doctor' }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({
      success: true,
      token,
      doctor: {
        _id: doctor._id,
        name: doctor.name,
        email: user.email,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        city: doctor.city,
        state: doctor.state || '',
        experience: doctor.experience,
        consultationFee: doctor.consultationFee,
        teleConsultationFee: doctor.teleconsultationFee || doctor.consultationFee,
        languages: doctor.languages || [],
        inClinicFee: doctor.inClinicFee || doctor.consultationFee,
        videoConsultationFee:
          doctor.videoConsultationFee || doctor.teleconsultationFee || doctor.consultationFee,
        localLanguages: doctor.localLanguages || doctor.languages || [],
        foreignLanguages: doctor.foreignLanguages || [],
        education: doctor.education,
        about: doctor.about,
        touristFriendly: !!doctor.touristFriendly,
        teleconsultation: !!doctor.teleconsultation,
        verified: !!doctor.verified,
        onboardingStatus: doctor.onboardingStatus || (doctor.verified ? 'verified' : 'pending'),
        medicalRegistrationNumber: doctor.medicalRegistrationNumber || '',
        registrationCouncil: doctor.registrationCouncil || '',
        clinicAddress: doctor.clinicAddress || '',
        emergencyContactNumber: doctor.emergencyContactNumber || '',
        verificationNotes: doctor.verificationNotes || '',
        availableToday: !!doctor.availableToday,
        rating: doctor.rate || 0,
        reviewCount: doctor.reviewCount || 0,
        profileImage: doctor.profileImage || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Login failed' });
  }
});

// POST /api/doctor/auth/register
router.post('/auth/register', uploadDoctorProfileImage, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      specialty,
      hospital,
      city,
      state,
      education,
      experience,
      consultationFee,
      teleConsultationFee,
      inClinicFee,
      videoConsultationFee,
      languages,
      localLanguages,
      foreignLanguages,
      qualifications,
      about,
      medicalRegistrationNumber,
      registrationCouncil,
      clinicAddress,
      emergencyContactNumber,
      clinicLat,
      clinicLng,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Doctor profile image is required (JPG/PNG, max 2MB)',
      });
    }

    if (!name || !email || !password || !specialty || !hospital || !city || !state) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, specialty, hospital, city and state are required',
      });
    }

    if (!medicalRegistrationNumber || !registrationCouncil) {
      return res.status(400).json({
        success: false,
        message: 'Medical registration number and council are required',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: 'doctor',
      isVerified: false,
    });

    const parseLanguageList = (value) => {
      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
      }
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return [];
    };

    const parseQualifications = (value) => {
      let parsed = [];
      if (Array.isArray(value)) {
        parsed = value;
      } else if (typeof value === 'string') {
        try {
          const asJson = JSON.parse(value);
          if (Array.isArray(asJson)) {
            parsed = asJson;
          }
        } catch (_) {
          parsed = [];
        }
      }

      return parsed
        .map((item) => ({
          degree: String(item?.degree || '').trim(),
          specialization: String(item?.specialization || '').trim(),
          university: String(item?.university || '').trim(),
          year: String(item?.year || '').trim(),
        }))
        .filter((item) => item.degree && item.specialization && item.university);
    };

    const parsedLanguages = Array.isArray(languages)
      ? languages
      : typeof languages === 'string'
        ? languages.split(',').map((item) => item.trim()).filter(Boolean)
        : [];

    const parsedLocalLanguages = parseLanguageList(localLanguages);
    const parsedForeignLanguages = parseLanguageList(foreignLanguages);
    const parsedQualifications = parseQualifications(qualifications);

    const mergedLanguages = Array.from(
      new Set([...parsedLanguages, ...parsedLocalLanguages, ...parsedForeignLanguages])
    );

    const computedInClinicFee = Number.isFinite(Number(inClinicFee))
      ? Number(inClinicFee)
      : Number.isFinite(Number(consultationFee))
        ? Number(consultationFee)
        : 500;

    const computedVideoConsultationFee = Number.isFinite(Number(videoConsultationFee))
      ? Number(videoConsultationFee)
      : Number.isFinite(Number(teleConsultationFee))
        ? Number(teleConsultationFee)
        : 400;

    const profileImage = `/uploads/doctors/${req.file.filename}`.replace(/\\/g, '/');

    // Build coordinates object if lat/lng provided
    const coordinates =
      Number.isFinite(Number(clinicLat)) && Number.isFinite(Number(clinicLng))
        ? {
            type: 'Point',
            coordinates: [Number(clinicLng), Number(clinicLat)],
          }
        : undefined;

    const doctor = await Doctor.create({
      userId: user._id,
      name,
      specialty,
      city,
      state,
      hospital,
      education: education || 'MBBS',
      experience: Number.isFinite(Number(experience)) ? Number(experience) : 0,
      consultationFee: computedInClinicFee,
      teleconsultationFee: computedVideoConsultationFee,
      inClinicFee: computedInClinicFee,
      videoConsultationFee: computedVideoConsultationFee,
      localLanguages: parsedLocalLanguages,
      foreignLanguages: parsedForeignLanguages,
      qualifications: parsedQualifications,
      languages: mergedLanguages.length > 0 ? mergedLanguages : ['English'],
      about: about || '',
      profileImage,
      medicalRegistrationNumber,
      registrationCouncil,
      clinicAddress: clinicAddress || '',
      emergencyContactNumber: emergencyContactNumber || '',
      onboardingStatus: 'pending',
      verified: false,
      teleconsultation: false,
      touristFriendly: false,
      availability: defaultAvailability(),
      ...(coordinates ? { coordinates } : {}),
    });

    const token = jwt.sign({ id: user._id, email: user.email, role: 'doctor' }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(201).json({
      success: true,
      token,
      doctor: {
        _id: doctor._id,
        name: doctor.name,
        email: user.email,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        city: doctor.city,
        state: doctor.state,
        experience: doctor.experience,
        consultationFee: doctor.consultationFee,
        teleConsultationFee: doctor.teleconsultationFee || doctor.consultationFee,
        languages: doctor.languages,
        inClinicFee: doctor.inClinicFee || doctor.consultationFee,
        videoConsultationFee:
          doctor.videoConsultationFee || doctor.teleconsultationFee || doctor.consultationFee,
        localLanguages: doctor.localLanguages || doctor.languages || [],
        foreignLanguages: doctor.foreignLanguages || [],
        qualifications: doctor.qualifications || [],
        education: doctor.education,
        about: doctor.about,
        touristFriendly: !!doctor.touristFriendly,
        teleconsultation: !!doctor.teleconsultation,
        verified: !!doctor.verified,
        onboardingStatus: doctor.onboardingStatus || 'pending',
        medicalRegistrationNumber: doctor.medicalRegistrationNumber || '',
        registrationCouncil: doctor.registrationCouncil || '',
        clinicAddress: doctor.clinicAddress || '',
        emergencyContactNumber: doctor.emergencyContactNumber || '',
        verificationNotes: doctor.verificationNotes || '',
        availableToday: !!doctor.availableToday,
        rating: doctor.rate || 0,
        reviewCount: doctor.reviewCount || 0,
        profileImage: doctor.profileImage || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Registration failed' });
  }
});

// PATCH /api/doctor/clinic-location
router.patch('/clinic-location', doctorAuth, async (req, res) => {
  try {
    const { clinicLat, clinicLng, clinicAddress } = req.body;

    if (!Number.isFinite(Number(clinicLat)) || !Number.isFinite(Number(clinicLng))) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude and longitude are required',
      });
    }

    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Update coordinates
    doctor.coordinates = {
      type: 'Point',
      coordinates: [Number(clinicLng), Number(clinicLat)],
    };

    if (clinicAddress) {
      doctor.clinicAddress = clinicAddress;
    }

    await doctor.save();

    return res.json({
      success: true,
      message: 'Clinic location updated successfully',
      data: {
        clinicLat: Number(clinicLat),
        clinicLng: Number(clinicLng),
        clinicAddress: doctor.clinicAddress,
      },
    });
  } catch (error) {
    console.error('Error updating clinic location:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update clinic location',
    });
  }
});

// GET /api/doctor/profile
router.get('/profile', doctorAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const doctor = await getDoctorByUserId(req.user.id);

    if (!user || !doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    return res.json({
      success: true,
      doctor: {
        _id: doctor._id,
        name: doctor.name,
        email: user.email,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        city: doctor.city,
        state: doctor.state || '',
        experience: doctor.experience,
        consultationFee: doctor.consultationFee,
        teleConsultationFee: doctor.teleconsultationFee || doctor.consultationFee,
        languages: doctor.languages || [],
        inClinicFee: doctor.inClinicFee || doctor.consultationFee,
        videoConsultationFee:
          doctor.videoConsultationFee || doctor.teleconsultationFee || doctor.consultationFee,
        localLanguages: doctor.localLanguages || doctor.languages || [],
        foreignLanguages: doctor.foreignLanguages || [],
        qualifications: doctor.qualifications || [],
        education: doctor.education,
        about: doctor.about,
        touristFriendly: !!doctor.touristFriendly,
        teleconsultation: !!doctor.teleconsultation,
        verified: !!doctor.verified,
        onboardingStatus: doctor.onboardingStatus || (doctor.verified ? 'verified' : 'pending'),
        medicalRegistrationNumber: doctor.medicalRegistrationNumber || '',
        registrationCouncil: doctor.registrationCouncil || '',
        clinicAddress: doctor.clinicAddress || '',
        emergencyContactNumber: doctor.emergencyContactNumber || '',
        verificationNotes: doctor.verificationNotes || '',
        availableToday: !!doctor.availableToday,
        rating: doctor.rate || 0,
        reviewCount: doctor.reviewCount || 0,
        profileImage: doctor.profileImage || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch profile' });
  }
});

// PUT /api/doctor/profile
router.put('/profile', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const updateBody = { ...req.body };
    if (updateBody.teleConsultationFee !== undefined && updateBody.teleconsultationFee === undefined) {
      updateBody.teleconsultationFee = updateBody.teleConsultationFee;
    }
    if (updateBody.videoConsultationFee !== undefined && updateBody.teleconsultationFee === undefined) {
      updateBody.teleconsultationFee = updateBody.videoConsultationFee;
    }
    if (updateBody.inClinicFee !== undefined && updateBody.consultationFee === undefined) {
      updateBody.consultationFee = updateBody.inClinicFee;
    }

    const fields = [
      'name',
      'specialty',
      'hospital',
      'city',
      'state',
      'experience',
      'consultationFee',
      'teleconsultationFee',
      'inClinicFee',
      'videoConsultationFee',
      'education',
      'medicalRegistrationNumber',
      'registrationCouncil',
      'clinicAddress',
      'emergencyContactNumber',
      'about',
      'touristFriendly',
      'teleconsultation',
      'availableToday',
    ];

    fields.forEach((field) => {
      if (updateBody[field] !== undefined) {
        doctor[field] = updateBody[field];
      }
    });

    const parseLanguageList = (value) => {
      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
      }
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return [];
    };

    const parsedLocalLanguages = parseLanguageList(updateBody.localLanguages);
    const parsedForeignLanguages = parseLanguageList(updateBody.foreignLanguages);

    if (parsedLocalLanguages.length > 0 || updateBody.localLanguages !== undefined) {
      doctor.localLanguages = parsedLocalLanguages;
    }

    if (parsedForeignLanguages.length > 0 || updateBody.foreignLanguages !== undefined) {
      doctor.foreignLanguages = parsedForeignLanguages;
    }

    if (Array.isArray(updateBody.languages) || typeof updateBody.languages === 'string') {
      doctor.languages = parseLanguageList(updateBody.languages);
    }

    if (updateBody.localLanguages !== undefined || updateBody.foreignLanguages !== undefined) {
      doctor.languages = Array.from(
        new Set([...(doctor.localLanguages || []), ...(doctor.foreignLanguages || [])])
      );
    }

    if (doctor.inClinicFee === undefined || doctor.inClinicFee === null) {
      doctor.inClinicFee = doctor.consultationFee;
    }
    if (doctor.videoConsultationFee === undefined || doctor.videoConsultationFee === null) {
      doctor.videoConsultationFee = doctor.teleconsultationFee || doctor.consultationFee;
    }

    // Keep legacy fields aligned for existing consumers.
    if (updateBody.inClinicFee !== undefined || updateBody.consultationFee !== undefined) {
      doctor.consultationFee = doctor.inClinicFee ?? doctor.consultationFee;
    }
    if (
      updateBody.videoConsultationFee !== undefined ||
      updateBody.teleConsultationFee !== undefined ||
      updateBody.teleconsultationFee !== undefined
    ) {
      doctor.teleconsultationFee = doctor.videoConsultationFee ?? doctor.teleconsultationFee;
    }

    await doctor.save();

    if (updateBody.name) {
      await User.findByIdAndUpdate(req.user.id, { name: updateBody.name });
    }

    const user = await User.findById(req.user.id);

    return res.json({
      success: true,
      message: 'Profile updated',
      doctor: {
        _id: doctor._id,
        name: doctor.name,
        email: user?.email,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        city: doctor.city,
        state: doctor.state || '',
        experience: doctor.experience,
        consultationFee: doctor.consultationFee,
        teleConsultationFee: doctor.teleconsultationFee || doctor.consultationFee,
        languages: doctor.languages || [],
        inClinicFee: doctor.inClinicFee || doctor.consultationFee,
        videoConsultationFee:
          doctor.videoConsultationFee || doctor.teleconsultationFee || doctor.consultationFee,
        localLanguages: doctor.localLanguages || doctor.languages || [],
        foreignLanguages: doctor.foreignLanguages || [],
        qualifications: doctor.qualifications || [],
        education: doctor.education,
        about: doctor.about,
        touristFriendly: !!doctor.touristFriendly,
        teleconsultation: !!doctor.teleconsultation,
        verified: !!doctor.verified,
        onboardingStatus: doctor.onboardingStatus || (doctor.verified ? 'verified' : 'pending'),
        medicalRegistrationNumber: doctor.medicalRegistrationNumber || '',
        registrationCouncil: doctor.registrationCouncil || '',
        clinicAddress: doctor.clinicAddress || '',
        emergencyContactNumber: doctor.emergencyContactNumber || '',
        verificationNotes: doctor.verificationNotes || '',
        availableToday: !!doctor.availableToday,
        rating: doctor.rate || 0,
        reviewCount: doctor.reviewCount || 0,
        profileImage: doctor.profileImage || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update profile' });
  }
});

// PUT /api/doctor/profile/photo
router.put('/profile/photo', doctorAuth, uploadDoctorProfileImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Profile image is required (JPG/PNG, max 2MB)',
      });
    }

    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const previousImage = doctor.profileImage || '';
    doctor.profileImage = `/uploads/doctors/${req.file.filename}`.replace(/\\/g, '/');
    await doctor.save();

    if (previousImage && previousImage !== doctor.profileImage) {
      removeLocalDoctorPhoto(previousImage);
    }

    const user = await User.findById(req.user.id);

    return res.json({
      success: true,
      message: 'Profile photo updated successfully',
      doctor: {
        _id: doctor._id,
        name: doctor.name,
        email: user?.email,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        city: doctor.city,
        state: doctor.state || '',
        experience: doctor.experience,
        consultationFee: doctor.consultationFee,
        teleConsultationFee: doctor.teleconsultationFee || doctor.consultationFee,
        languages: doctor.languages || [],
        inClinicFee: doctor.inClinicFee || doctor.consultationFee,
        videoConsultationFee:
          doctor.videoConsultationFee || doctor.teleconsultationFee || doctor.consultationFee,
        localLanguages: doctor.localLanguages || doctor.languages || [],
        foreignLanguages: doctor.foreignLanguages || [],
        education: doctor.education,
        about: doctor.about,
        touristFriendly: !!doctor.touristFriendly,
        teleconsultation: !!doctor.teleconsultation,
        verified: !!doctor.verified,
        onboardingStatus: doctor.onboardingStatus || (doctor.verified ? 'verified' : 'pending'),
        medicalRegistrationNumber: doctor.medicalRegistrationNumber || '',
        registrationCouncil: doctor.registrationCouncil || '',
        clinicAddress: doctor.clinicAddress || '',
        emergencyContactNumber: doctor.emergencyContactNumber || '',
        verificationNotes: doctor.verificationNotes || '',
        availableToday: !!doctor.availableToday,
        rating: doctor.rate || 0,
        reviewCount: doctor.reviewCount || 0,
        profileImage: doctor.profileImage || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update profile photo' });
  }
});

// GET /api/doctor/availability
router.get('/availability', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }
    return res.json({ success: true, availability: toMvpAvailability(doctor.availability) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch availability' });
  }
});

// PUT /api/doctor/availability
router.put('/availability', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    doctor.availability = toDbAvailability(req.body.availability || {});
    await doctor.save();

    return res.json({
      success: true,
      message: 'Availability updated',
      availability: toMvpAvailability(doctor.availability),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update availability' });
  }
});

// GET /api/doctor/appointments
router.get('/appointments', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { status, date } = req.query;
    const filter = { doctorId: doctor._id };

    if (status && status !== 'all') {
      if (status === 'pending') {
        filter.status = 'booked';
      } else {
        filter.status = status;
      }
    }

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.appointmentDate = { $gte: start, $lt: end };
    }

    const appointments = await Appointment.find(filter)
      .populate('userId', 'name email phone nationality age gender bloodGroup existingConditions emergencyContactNumber profileImage')
      .sort({ appointmentDate: -1, createdAt: -1 });

    const normalized = appointments.map((a) => ({
      _id: a._id,
      doctorId: a.doctorId,
      prescriptionId: a.prescription || null,
      patientName: a.userId?.name || 'Patient',
      patientEmail: a.userId?.email || '',
      patientPhone: a.userId?.phone || '',
      nationality: a.userId?.nationality || '',
      age: a.userId?.age,
      gender: a.userId?.gender || '',
      bloodGroup: a.userId?.bloodGroup || '',
      existingConditions: a.userId?.existingConditions || [],
      emergencyContactNumber: a.userId?.emergencyContactNumber || '',
      profileImage: a.userId?.profileImage || '',
      date: new Date(a.appointmentDate).toISOString().split('T')[0],
      time: a.time,
      type: a.type,
      symptoms: Array.isArray(a.symptoms) ? a.symptoms.join(', ') : '',
      status: a.status === 'booked' ? 'pending' : a.status,
      fee: a.consultationFee || 0,
      notes: a.notes || '',
      createdAt: a.createdAt,
    }));

    return res.json({ success: true, appointments: normalized });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch appointments' });
  }
});

// GET /api/doctor/appointments/:id
router.get('/appointments/:id', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const appointment = await Appointment.findOne({ _id: req.params.id, doctorId: doctor._id })
      .populate('userId', 'name email phone nationality age gender bloodGroup existingConditions emergencyContactNumber profileImage')
      .populate('doctorId', 'name specialty hospital consultationFee');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    return res.json({ success: true, appointment });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch appointment' });
  }
});

// PATCH /api/doctor/appointments/:id
router.patch('/appointments/:id', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const appt = await Appointment.findOne({ _id: req.params.id, doctorId: doctor._id });
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.body.status) {
      appt.status = req.body.status === 'pending' ? 'booked' : req.body.status;
    }

    if (req.body.notes !== undefined) {
      appt.notes = req.body.notes;
    }

    await appt.save();

    if (appt.status === 'confirmed') {
      await Chat.findOneAndUpdate(
        { userId: appt.userId, doctorId: doctor._id, isActive: true },
        {
          $setOnInsert: {
            userId: appt.userId,
            doctorId: doctor._id,
            appointmentId: appt._id,
            messages: [],
            isActive: true,
            lastMessageAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }

    return res.json({ success: true, message: 'Appointment updated', appointment: appt });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update appointment' });
  }
});

// GET /api/doctor/chats
router.get('/chats', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const chats = await Chat.find({ doctorId: doctor._id, isActive: true })
      .populate('userId', 'name email')
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    const formatted = chats.map((chat) => ({
      _id: chat._id,
      doctorId: chat.doctorId,
      patientName: chat.userId?.name || 'Patient',
      patientEmail: chat.userId?.email || '',
      messages: (chat.messages || []).map((m) => ({
        from: m.sender === 'doctor' ? 'doctor' : 'patient',
        text: m.text,
        time: m.timestamp,
      })),
      lastMessage: chat.lastMessageAt || chat.updatedAt,
    }));

    return res.json({ success: true, chats: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch chats' });
  }
});

// GET /api/doctor/chats/:id
router.get('/chats/:id', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const chat = await Chat.findOne({ _id: req.params.id, doctorId: doctor._id }).populate(
      'userId',
      'name email'
    );

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    return res.json({
      success: true,
      chat: {
        _id: chat._id,
        patientName: chat.userId?.name || 'Patient',
        patientEmail: chat.userId?.email || '',
        messages: (chat.messages || []).map((m) => ({
          from: m.sender === 'doctor' ? 'doctor' : 'patient',
          text: m.text,
          time: m.timestamp,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch chat' });
  }
});

// POST /api/doctor/chats/:id/message
router.post('/chats/:id/message', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const chat = await Chat.findOne({ _id: req.params.id, doctorId: doctor._id });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const text = req.body.text?.trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    const msg = {
      sender: 'doctor',
      senderId: req.user.id,
      text,
      timestamp: new Date(),
      isRead: false,
    };

    chat.messages.push(msg);
    chat.lastMessageAt = new Date();
    await chat.save();

    return res.json({ success: true, message: msg });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to send message' });
  }
});

// GET /api/doctor/prescriptions
router.get('/prescriptions', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const prescriptions = await Prescription.find({ doctorId: doctor._id })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    const output = prescriptions.map((p) => ({
      _id: p._id,
      patientName: p.patientName || p.userId?.name || 'Patient',
      patientEmail: p.patientEmail || p.userId?.email || '',
      date: new Date(p.createdAt).toISOString().split('T')[0],
      diagnosis: p.diagnosis || '',
      medications: p.medicationsText || (p.medicines || []).map((m) => `${m.name} ${m.dosage || ''}`.trim()).join(', '),
      instructions: p.notes || '',
      followUp: p.followUp || '',
      createdAt: p.createdAt,
    }));

    return res.json({ success: true, prescriptions: output });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch prescriptions' });
  }
});

// POST /api/doctor/prescriptions
router.post('/prescriptions', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const { appointmentId, patientName, patientEmail, diagnosis, medications, instructions, followUp } = req.body;

    let appointment = null;
    if (appointmentId) {
      appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctor._id }).populate('userId', 'name email');
      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found for this doctor' });
      }

      if (!['confirmed', 'completed'].includes(appointment.status)) {
        return res.status(400).json({ success: false, message: 'Prescription can be issued only for confirmed/completed appointments' });
      }

      if (appointment.prescription) {
        return res.status(409).json({ success: false, message: 'Prescription already exists for this appointment' });
      }
    }

    const derivedName = appointment?.userId?.name || patientName;
    const derivedEmail = appointment?.userId?.email || patientEmail;

    if (!derivedName || !diagnosis || !medications) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let user = appointment?.userId || null;
    if (!user && derivedEmail) {
      user = await User.findOne({ email: String(derivedEmail).toLowerCase() });
    }

    const prescription = await Prescription.create({
      appointmentId: appointmentId || undefined,
      doctorId: doctor._id,
      userId: user?._id,
      patientName: derivedName,
      patientEmail: derivedEmail || '',
      diagnosis,
      medicines: [],
      medicationsText: medications,
      notes: instructions || '',
      followUp: followUp || '',
    });

    if (appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, {
        status: 'completed',
        prescription: prescription._id,
      });
    }

    return res.status(201).json({ success: true, message: 'Prescription created', prescription });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to create prescription' });
  }
});

// GET /api/doctor/reviews
router.get('/reviews', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const reviews = await Review.find({ doctorId: doctor._id })
      .populate('userId', 'name email')
      .populate('appointmentId', 'appointmentDate time status')
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
      appointmentDate: review.appointmentId?.appointmentDate || null,
      appointmentTime: review.appointmentId?.time || '',
      appointmentStatus: review.appointmentId?.status || '',
      createdAt: review.createdAt,
    }));

    const averageRating = data.length
      ? data.reduce((sum, review) => sum + review.rating, 0) / data.length
      : 0;

    return res.json({
      success: true,
      reviews: data,
      summary: {
        averageRating: Number(averageRating.toFixed(1)),
        totalReviews: data.length,
        approvedReviews: data.filter((review) => review.isApproved).length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch reviews' });
  }
});

// GET /api/doctor/earnings
router.get('/earnings', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const completed = await Appointment.find({ doctorId: doctor._id, status: 'completed' });
    const confirmed = await Appointment.find({ doctorId: doctor._id, status: { $in: ['confirmed', 'booked'] } });

    const total = completed.reduce((sum, a) => sum + (a.consultationFee || 0), 0);
    const pending = confirmed.reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const now = new Date();
    const thisMonth = completed
      .filter((a) => {
        const d = new Date(a.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, a) => sum + (a.consultationFee || 0), 0);

    const monthly = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthAppts = completed.filter((a) => {
        const ad = new Date(a.createdAt);
        return ad.getMonth() === d.getMonth() && ad.getFullYear() === d.getFullYear();
      });
      monthly.push({
        month: d.toLocaleString('default', { month: 'short' }),
        earnings: monthAppts.reduce((sum, a) => sum + (a.consultationFee || 0), 0),
        count: monthAppts.length,
      });
    }

    return res.json({
      success: true,
      earnings: {
        total,
        thisMonth,
        pending,
        completedAppointments: completed.length,
        monthly,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch earnings' });
  }
});

// GET /api/doctor/dashboard
router.get('/dashboard', doctorAuth, async (req, res) => {
  try {
    const doctor = await getDoctorByUserId(req.user.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    }

    const appts = await Appointment.find({ doctorId: doctor._id })
      .populate('userId', 'name email nationality age gender bloodGroup existingConditions emergencyContactNumber profileImage')
      .sort({ createdAt: -1 });

    const chats = await Chat.find({ doctorId: doctor._id })
      .populate('userId', 'name email')
      .sort({ updatedAt: -1 });

    const now = new Date();
    const today = toIstDateString(now);
    const todayAppointments = appts.filter((a) => toIstDateString(a.appointmentDate) === today);

    const nextAppointmentRecord = appts
      .filter((a) => ['booked', 'confirmed'].includes(a.status))
      .map((a) => ({
        item: a,
        dateTime: getAppointmentDateTime(a.appointmentDate, a.time),
      }))
      .filter((entry) => entry.dateTime && entry.dateTime >= now)
      .sort((a, b) => a.dateTime - b.dateTime)[0]?.item;

    const statusBreakdown = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    const dayBuckets = [];
    const dayBucketMap = new Map();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().split('T')[0];
      const bucket = {
        key,
        day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        total: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        patients: 0,
      };
      dayBuckets.push(bucket);
      dayBucketMap.set(key, bucket);
    }

    const dayPatientSets = new Map(dayBuckets.map((bucket) => [bucket.key, new Set()]));

    appts.forEach((appointment) => {
      const normalized = normalizeAppointmentStatus(appointment.status);
      if (Object.prototype.hasOwnProperty.call(statusBreakdown, normalized)) {
        statusBreakdown[normalized] += 1;
      }

      const dateKey = toIstDateString(appointment.appointmentDate);
      const bucket = dayBucketMap.get(dateKey);
      if (!bucket) return;

      bucket.total += 1;
      if (Object.prototype.hasOwnProperty.call(bucket, normalized)) {
        bucket[normalized] += 1;
      }

      const patientEmail = appointment.userId?.email;
      if (patientEmail) {
        dayPatientSets.get(dateKey)?.add(patientEmail);
      }
    });

    dayBuckets.forEach((bucket) => {
      bucket.patients = dayPatientSets.get(bucket.key)?.size || 0;
      delete bucket.key;
    });

    const appointmentTypeBreakdown = [
      {
        name: 'Teleconsultation',
        value: appts.filter((a) => a.type === 'teleconsultation').length,
      },
      {
        name: 'In-Clinic',
        value: appts.filter((a) => a.type === 'in-person').length,
      },
    ];

    return res.json({
      success: true,
      stats: {
        todayAppointments: todayAppointments.length,
        pendingAppointments: appts.filter((a) => a.status === 'booked').length,
        totalPatients: new Set(appts.map((a) => a.userId?.email).filter(Boolean)).size,
        totalAppointments: appts.length,
        completedToday: todayAppointments.filter((a) => a.status === 'completed').length,
        upcomingToday: todayAppointments.filter((a) => ['booked', 'confirmed'].includes(a.status)).length,
        nextAppointment: nextAppointmentRecord ? mapDashboardAppointment(nextAppointmentRecord) : null,
        recentAppointments: appts.slice(0, 5).map(mapDashboardAppointment),
        appointmentsTrend: dayBuckets,
        appointmentStatusBreakdown: [
          { name: 'Pending', value: statusBreakdown.pending },
          { name: 'Confirmed', value: statusBreakdown.confirmed },
          { name: 'Completed', value: statusBreakdown.completed },
          { name: 'Cancelled', value: statusBreakdown.cancelled },
        ],
        appointmentTypeBreakdown,
        recentChats: chats.slice(0, 3).map((c) => ({
          _id: c._id,
          patientName: c.userId?.name || 'Patient',
          patientEmail: c.userId?.email || '',
          messages: (c.messages || []).map((m) => ({
            from: m.sender === 'doctor' ? 'doctor' : 'patient',
            text: m.text || '',
            time: m.timestamp ? new Date(m.timestamp).toISOString() : '',
          })),
          lastMessage: c.messages?.[c.messages.length - 1]?.text || '',
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch dashboard' });
  }
});

// GET /api/doctor/filter-by-city-language
// Query params: ?city=Mumbai&languages=English,Hindi
router.get('/filter-by-city-language', async (req, res) => {
  try {
    const { city, languages } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City query parameter is required',
      });
    }

    // Parse languages from comma-separated string to array
    let languageArray = [];
    if (languages) {
      languageArray = Array.isArray(languages)
        ? languages
        : languages.split(',').map((lang) => lang.trim()).filter(Boolean);
    }

    // Build query filter
    const query = {
      city: { $regex: city, $options: 'i' }, // case-insensitive city search
      verified: true, // only show verified doctors
    };

    // Add languages filter if languages provided
    if (languageArray.length > 0) {
      query.languages = { $in: languageArray };
    }

    const doctors = await Doctor.find(query)
      .select('name specialty city state languages localLanguages foreignLanguages experience hospital consultationFee teleconsultationFee inClinicFee videoConsultationFee rate reviewCount profileImage about verified')
      .lean();

    return res.json({
      success: true,
      count: doctors.length,
      doctors: doctors.map((doc) => ({
        _id: doc._id,
        name: doc.name,
        specialty: doc.specialty,
        city: doc.city,
        state: doc.state,
        languages: doc.languages,
        localLanguages: doc.localLanguages || doc.languages || [],
        foreignLanguages: doc.foreignLanguages || [],
        qualifications: doc.qualifications || [],
        experience: doc.experience,
        hospital: doc.hospital,
        consultationFee: doc.consultationFee,
        teleconsultationFee: doc.teleconsultationFee,
        inClinicFee: doc.inClinicFee || doc.consultationFee,
        videoConsultationFee: doc.videoConsultationFee || doc.teleconsultationFee || doc.consultationFee,
        rating: doc.rate,
        reviewCount: doc.reviewCount,
        profileImage: doc.profileImage,
        about: doc.about,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to filter doctors',
    });
  }
});

module.exports = router;
