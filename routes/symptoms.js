const express = require('express');
const Doctor = require('../models/Doctor');
const { parseCsvInput, rankDoctorsForTraveler } = require('../utils/trustScore');

const router = express.Router();

const COMMON_SYMPTOMS = [
  'fever',
  'cough',
  'headache',
  'stomach pain',
  'body ache',
  'fatigue',
  'sore throat',
  'nausea',
  'chest pain',
  'dizziness',
  'skin rash',
  'eye pain',
  'breathlessness',
  'shortness of breath',
  'diarrhea',
  'vomiting',
  'joint pain',
  'back pain',
  'palpitations',
  'cold',
];

const SPECIALTY_RULES = [
  {
    specialty: 'Cardiology',
    description: 'Heart and blood vessel related concerns',
    keywords: ['chest pain', 'palpitations', 'shortness of breath', 'breathlessness'],
  },
  {
    specialty: 'Gastroenterology',
    description: 'Digestive system related concerns',
    keywords: ['stomach pain', 'nausea', 'vomiting', 'diarrhea'],
  },
  {
    specialty: 'Orthopedics',
    description: 'Bone, joint and muscle related concerns',
    keywords: ['joint pain', 'back pain', 'body ache'],
  },
  {
    specialty: 'Dermatology',
    description: 'Skin, hair and nail related concerns',
    keywords: ['skin rash'],
  },
  {
    specialty: 'Ophthalmology',
    description: 'Eye and vision related concerns',
    keywords: ['eye pain'],
  },
  {
    specialty: 'General Physician',
    description: 'General primary care and first assessment',
    keywords: ['fever', 'cough', 'cold', 'headache', 'fatigue', 'sore throat', 'dizziness'],
  },
];

const CONDITION_RULES = [
  {
    name: 'Viral Infection',
    description: 'Common mild to moderate infection that often improves with rest and hydration.',
    keywords: ['fever', 'cough', 'cold', 'sore throat', 'fatigue'],
  },
  {
    name: 'Gastric Irritation',
    description: 'Digestive discomfort that may need short-term treatment and hydration.',
    keywords: ['stomach pain', 'nausea', 'vomiting', 'diarrhea'],
  },
  {
    name: 'Musculoskeletal Strain',
    description: 'Joint or muscle overload that may require rest, medication, or specialist review.',
    keywords: ['body ache', 'joint pain', 'back pain'],
  },
  {
    name: 'Cardiac Risk Symptoms',
    description: 'Potential heart-related symptoms that should be assessed urgently.',
    keywords: ['chest pain', 'shortness of breath', 'palpitations'],
  },
];

const URGENCY_KEYWORDS = {
  emergency: ['severe chest pain', 'unconscious', 'loss of consciousness', 'cannot breathe'],
  high: ['chest pain', 'shortness of breath', 'breathlessness', 'high fever', 'blood'],
  medium: ['fever', 'vomiting', 'diarrhea', 'persistent', 'dizziness'],
};

function normalizeText(text = '') {
  return String(text).toLowerCase().trim();
}

function titleCase(text = '') {
  return text
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ')
    .trim();
}

function detectSymptoms(text) {
  const normalized = normalizeText(text);
  const detected = COMMON_SYMPTOMS.filter((symptom) => normalized.includes(symptom));

  if (detected.length > 0) {
    return [...new Set(detected)];
  }

  const fallback = normalized
    .split(/[,.]| and /g)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 5);

  return fallback;
}

function inferUrgency(text, symptoms) {
  const normalized = normalizeText(text);
  const symptomBlob = ` ${symptoms.join(' ').toLowerCase()} `;

  const hasKeyword = (keywords) =>
    keywords.some((keyword) => normalized.includes(keyword) || symptomBlob.includes(` ${keyword} `));

  if (hasKeyword(URGENCY_KEYWORDS.emergency)) {
    return {
      level: 'emergency',
      label: 'Emergency',
      message: 'Please seek emergency care immediately or contact your local emergency number.',
    };
  }

  if (hasKeyword(URGENCY_KEYWORDS.high)) {
    return {
      level: 'high',
      label: 'High',
      message: 'Seek urgent medical attention as soon as possible.',
    };
  }

  if (hasKeyword(URGENCY_KEYWORDS.medium)) {
    return {
      level: 'medium',
      label: 'Medium',
      message: 'Book a consultation soon to evaluate your symptoms.',
    };
  }

  return {
    level: 'low',
    label: 'Low',
    message: 'Monitor symptoms and consult a doctor if they persist or worsen.',
  };
}

function inferSpecialties(symptoms) {
  const symptomSet = new Set(symptoms.map((s) => normalizeText(s)));

  const scored = SPECIALTY_RULES.map((rule) => {
    const score = rule.keywords.reduce((sum, keyword) => (symptomSet.has(keyword) ? sum + 1 : sum), 0);
    return {
      name: rule.specialty,
      description: rule.description,
      relevance: score,
    };
  })
    .filter((item) => item.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  if (scored.length > 0) {
    const maxScore = scored[0].relevance;
    return scored.map((item) => ({ ...item, relevance: Number(((item.relevance / maxScore) * 100).toFixed(0)) }));
  }

  return [
    {
      name: 'General Physician',
      description: 'Primary consultation to assess your condition and refer if required.',
      relevance: 100,
    },
  ];
}

function inferConditions(symptoms) {
  const symptomSet = new Set(symptoms.map((s) => normalizeText(s)));

  const conditions = CONDITION_RULES.map((rule) => {
    const matched = rule.keywords.filter((keyword) => symptomSet.has(keyword)).length;
    const probability = Math.min(95, Math.max(20, matched * 25));
    return {
      name: rule.name,
      description: rule.description,
      probability,
      matched,
    };
  })
    .filter((item) => item.matched > 0)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map(({ matched, ...condition }) => condition);

  if (conditions.length > 0) {
    return conditions;
  }

  return [
    {
      name: 'General Medical Review Suggested',
      description: 'Symptoms are nonspecific. A general physician can provide first-line assessment.',
      probability: 50,
    },
  ];
}

function buildAdvice(urgency) {
  const base = [
    'This output is supportive guidance and not a confirmed diagnosis.',
    'Consult a qualified doctor for medical evaluation.',
  ];

  if (urgency.level === 'emergency') {
    return [urgency.message, ...base];
  }

  if (urgency.level === 'high') {
    return [urgency.message, 'Prefer the earliest available in-person appointment.', ...base];
  }

  if (urgency.level === 'medium') {
    return [urgency.message, 'If symptoms worsen quickly, seek urgent care.', ...base];
  }

  return [urgency.message, ...base];
}

function analyze(text) {
  const detectedSymptoms = detectSymptoms(text).map((s) => titleCase(s));
  const urgency = inferUrgency(text, detectedSymptoms);
  const recommendedSpecialties = inferSpecialties(detectedSymptoms.map((s) => normalizeText(s)));
  const possibleConditions = inferConditions(detectedSymptoms.map((s) => normalizeText(s)));
  const advice = buildAdvice(urgency);

  return {
    urgency: urgency.label,
    urgencyLevel: urgency.level,
    message: urgency.message,
    detectedSymptoms,
    primarySpecialty: recommendedSpecialties[0]?.name || 'General Physician',
    possibleConditions,
    recommendedSpecialties,
    advice,
  };
}

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toPlainDoctor = (doctor) =>
  doctor && typeof doctor.toObject === 'function' ? doctor.toObject() : doctor;

const withDistance = (doctor) => {
  if (Number.isFinite(Number(doctor.distanceKm))) return doctor;
  if (!Number.isFinite(Number(doctor.distanceMeters))) return doctor;

  return {
    ...doctor,
    distanceKm: Number((Number(doctor.distanceMeters) / 1000).toFixed(2)),
  };
};

const toRecommendationDoctor = (doctor) => ({
  _id: doctor._id,
  name: doctor.name,
  specialty: doctor.specialty,
  city: doctor.city,
  state: doctor.state || '',
  hospital: doctor.hospital,
  consultationFee: doctor.inClinicFee ?? doctor.consultationFee ?? 0,
  inClinicFee: doctor.inClinicFee ?? doctor.consultationFee ?? 0,
  videoConsultationFee: doctor.videoConsultationFee ?? doctor.teleconsultationFee ?? 0,
  teleconsultationFee: doctor.videoConsultationFee ?? doctor.teleconsultationFee ?? 0,
  rate: doctor.rate || 0,
  reviewCount: doctor.reviewCount || 0,
  verified: !!doctor.verified,
  touristFriendly: !!doctor.touristFriendly,
  languages: doctor.languages || [],
  foreignLanguages: doctor.foreignLanguages || [],
  distanceKm: Number.isFinite(Number(doctor.distanceKm)) ? Number(doctor.distanceKm) : null,
  trustScore: Number.isFinite(Number(doctor.trustScore)) ? Number(doctor.trustScore) : 0,
  matchReasons: doctor.matchReasons || [],
});

// POST /api/symptoms/analyze-text
router.post('/analyze-text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, message: 'Symptoms text is required' });
    }

    const data = analyze(String(text));
    return res.json({ success: true, message: 'Symptoms analyzed', data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to analyze symptoms' });
  }
});

// POST /api/symptoms/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ success: false, message: 'Symptoms array is required' });
    }

    const text = symptoms.join(', ');
    const data = analyze(text);
    return res.json({ success: true, message: 'Symptoms analyzed', data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to analyze symptoms' });
  }
});

// POST /api/symptoms/recommend-doctors
router.post('/recommend-doctors', async (req, res) => {
  try {
    const {
      text,
      city,
      lat,
      lng,
      radiusKm: radiusKmInput,
      preferredLanguages,
      limit: limitInput,
    } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, message: 'Symptoms text is required' });
    }

    const analysis = analyze(String(text));
    const recommendationLimit = clamp(toNumber(limitInput, 5), 1, 10);
    const radiusKm = clamp(toNumber(radiusKmInput, 40), 1, 300);
    const latitude = toNumber(lat);
    const longitude = toNumber(lng);
    const hasGeo = Number.isFinite(latitude) && Number.isFinite(longitude);

    const preferredLanguageList = parseCsvInput(preferredLanguages);
    const specialty = analysis.primarySpecialty || 'General Physician';

    const baseFilter = {
      verified: true,
      flagged: false,
      specialty,
    };

    let doctors = [];

    if (hasGeo) {
      doctors = await Doctor.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            distanceField: 'distanceMeters',
            spherical: true,
            maxDistance: radiusKm * 1000,
            query: {
              ...baseFilter,
              coordinates: { $exists: true },
              'coordinates.coordinates.0': { $exists: true },
            },
          },
        },
        { $project: { availability: 0 } },
        { $limit: 250 },
      ]);
    }

    const normalizedCity = String(city || '').trim();

    if (doctors.length === 0 && normalizedCity) {
      doctors = await Doctor.find({
        ...baseFilter,
        city: normalizedCity,
      })
        .select('-availability')
        .limit(250);
    }

    if (doctors.length === 0) {
      doctors = await Doctor.find(baseFilter)
        .select('-availability')
        .sort({ rate: -1, reviewCount: -1 })
        .limit(250);
    }

    const rankedDoctors = rankDoctorsForTraveler(
      doctors.map(toPlainDoctor).map(withDistance),
      {
        preferredLanguages: preferredLanguageList,
        radiusKm,
      }
    )
      .slice(0, recommendationLimit)
      .map(toRecommendationDoctor);

    const isEmergency = analysis.urgencyLevel === 'emergency';

    return res.json({
      success: true,
      message: 'Symptoms analyzed and doctors recommended',
      data: {
        ...analysis,
        recommendedDoctors: rankedDoctors,
        safety: {
          isEmergency,
          disclaimer: 'This output is supportive guidance and not a confirmed diagnosis.',
          emergencyAction: isEmergency
            ? 'Call emergency services or visit the nearest emergency department immediately.'
            : null,
        },
        searchContext: {
          usedGeo: hasGeo,
          city: normalizedCity || null,
          radiusKm: hasGeo ? radiusKm : null,
          specialty,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate doctor recommendations',
    });
  }
});

// GET /api/symptoms/common
router.get('/common', async (req, res) => {
  const common = COMMON_SYMPTOMS.map((s) => titleCase(s));
  return res.json({ success: true, data: common });
});

// GET /api/symptoms/urgency-guidelines
router.get('/urgency-guidelines', async (req, res) => {
  return res.json({
    success: true,
    data: {
      low: 'Monitor symptoms and plan a routine consultation.',
      medium: 'Book a consultation soon for assessment and treatment advice.',
      high: 'Seek urgent medical care as soon as possible.',
      emergency: 'Call emergency services or go to the nearest emergency department immediately.',
    },
  });
});

module.exports = router;