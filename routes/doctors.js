const express = require('express');
const Doctor = require('../models/Doctor');
const Review = require('../models/Review');
const { parseCsvInput, rankDoctorsForTraveler } = require('../utils/trustScore');

const router = express.Router();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_TRUST_RANK_POOL = 1000;

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toBoolean = (value) => String(value).toLowerCase() === 'true';

const toPlainDoctor = (doctor) =>
  doctor && typeof doctor.toObject === 'function' ? doctor.toObject() : doctor;

const withDistance = (doctor) => ({
  ...doctor,
  distanceKm: Number(Number((doctor.distanceMeters || 0) / 1000).toFixed(2)),
});

const getSortClause = (sortBy, useGeo) => {
  const normalizedSort = String(sortBy || '').toLowerCase();

  if (useGeo) {
    if (normalizedSort === 'latest') return { createdAt: -1, distanceMeters: 1 };
    if (normalizedSort === 'rating') return { rate: -1, reviewCount: -1, distanceMeters: 1 };
    return { distanceMeters: 1, rate: -1, reviewCount: -1 };
  }

  if (normalizedSort === 'latest') return { createdAt: -1 };
  return { verified: -1, rate: -1, reviewCount: -1 };
};

const buildDoctorFilter = (query = {}) => {
  const filter = { verified: true, flagged: false };

  const city = String(query.city || '').trim();
  const state = String(query.state || '').trim();
  const specialty = String(query.specialty || '').trim();
  const search = String(query.search || '').trim();

  const requestedLanguages = [
    ...parseCsvInput(query.language),
    ...parseCsvInput(query.languages),
  ];
  const foreignLanguageFilter = parseCsvInput(query.foreignLanguage);
  const preferredLanguages = [...new Set([...requestedLanguages, ...foreignLanguageFilter])];

  if (city) filter.city = city;
  if (state) filter.state = state;
  if (specialty) filter.specialty = specialty;

  if (requestedLanguages.length > 0) {
    filter.languages = { $in: requestedLanguages };
  }

  if (foreignLanguageFilter.length > 0) {
    filter.foreignLanguages = { $in: foreignLanguageFilter };
  }

  if (toBoolean(query.available) || toBoolean(query.teleconsultation)) {
    filter.teleconsultation = true;
  }

  if (toBoolean(query.availableToday)) {
    filter.availableToday = true;
  }

  if (toBoolean(query.touristFriendly)) {
    filter.touristFriendly = true;
  }

  const minRating = toNumber(query.minRating);
  if (Number.isFinite(minRating)) {
    filter.rate = { $gte: clamp(minRating, 0, 5) };
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { specialty: { $regex: search, $options: 'i' } },
      { hospital: { $regex: search, $options: 'i' } },
    ];
  }

  return { filter, preferredLanguages };
};

const fetchDoctors = async (query = {}, options = {}) => {
  const { filter, preferredLanguages } = buildDoctorFilter(query);

  const page = clamp(toNumber(query.page, DEFAULT_PAGE), 1, Number.MAX_SAFE_INTEGER);
  const limit = clamp(toNumber(query.limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const skip = (page - 1) * limit;

  const latitude = toNumber(query.lat);
  const longitude = toNumber(query.lng);
  const hasGeo = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (options.requireGeo && !hasGeo) {
    const error = new Error('Latitude and longitude are required for nearby search');
    error.status = 400;
    throw error;
  }

  const requestedSort = String(query.sortBy || options.defaultSort || '').toLowerCase();
  const sortBy = ['trust', 'rating', 'distance', 'latest'].includes(requestedSort)
    ? requestedSort
    : hasGeo
      ? 'distance'
      : 'rating';

  if (hasGeo) {
    const radiusKm = clamp(toNumber(query.radiusKm, 50), 1, 500);
    const geoQuery = {
      ...filter,
      coordinates: { $exists: true },
      'coordinates.coordinates.0': { $exists: true },
    };

    const baseGeoStage = {
      $geoNear: {
        near: { type: 'Point', coordinates: [longitude, latitude] },
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: geoQuery,
      },
    };

    if (sortBy === 'trust') {
      const [rawDoctors, countRows] = await Promise.all([
        Doctor.aggregate([baseGeoStage, { $project: { availability: 0 } }, { $limit: MAX_TRUST_RANK_POOL }]),
        Doctor.aggregate([baseGeoStage, { $count: 'total' }]),
      ]);

      const total = countRows[0]?.total || 0;
      const ranked = rankDoctorsForTraveler(rawDoctors.map(withDistance), {
        preferredLanguages,
        radiusKm,
      });

      return {
        data: ranked.slice(skip, skip + limit),
        total,
        page,
        limit,
        sortBy,
        usedGeo: true,
        radiusKm,
      };
    }

    const sortClause = getSortClause(sortBy, true);

    const [rawDoctors, countRows] = await Promise.all([
      Doctor.aggregate([
        baseGeoStage,
        { $project: { availability: 0 } },
        { $sort: sortClause },
        { $skip: skip },
        { $limit: limit },
      ]),
      Doctor.aggregate([baseGeoStage, { $count: 'total' }]),
    ]);

    const total = countRows[0]?.total || 0;

    return {
      data: rawDoctors.map(withDistance),
      total,
      page,
      limit,
      sortBy,
      usedGeo: true,
      radiusKm,
    };
  }

  if (sortBy === 'trust') {
    const [rawDoctors, total] = await Promise.all([
      Doctor.find(filter).select('-availability').limit(MAX_TRUST_RANK_POOL),
      Doctor.countDocuments(filter),
    ]);

    const ranked = rankDoctorsForTraveler(rawDoctors.map(toPlainDoctor), {
      preferredLanguages,
    });

    return {
      data: ranked.slice(skip, skip + limit),
      total,
      page,
      limit,
      sortBy,
      usedGeo: false,
    };
  }

  const sortClause = getSortClause(sortBy, false);

  const [rawDoctors, total] = await Promise.all([
    Doctor.find(filter)
      .select('-availability')
      .skip(skip)
      .limit(limit)
      .sort(sortClause),
    Doctor.countDocuments(filter),
  ]);

  return {
    data: rawDoctors.map(toPlainDoctor),
    total,
    page,
    limit,
    sortBy,
    usedGeo: false,
  };
};

const listDoctorsHandler = async (req, res, options = {}) => {
  try {
    const result = await fetchDoctors(req.query, options);

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        pages: Math.ceil(result.total / result.limit),
        limit: result.limit,
      },
      meta: {
        sortBy: result.sortBy,
        usedGeo: result.usedGeo,
        radiusKm: result.radiusKm || null,
      },
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    const statusCode = error.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Error fetching doctors',
      error: error.message,
    });
  }
};

// =====================
// GET ALL VERIFIED DOCTORS (with filtering)
// =====================
router.get('/', async (req, res) => listDoctorsHandler(req, res, { defaultSort: 'rating' }));

// =====================
// GET NEARBY VERIFIED DOCTORS
// =====================
router.get('/nearby', async (req, res) => listDoctorsHandler(req, res, {
  requireGeo: true,
  defaultSort: 'trust',
}));

// =====================
// GET CITY FILTER OPTIONS
// =====================
router.get('/cities', async (req, res) => {
  try {
    const cities = await Doctor.distinct('city', { verified: true, flagged: false });
    const data = cities.filter(Boolean).sort((a, b) => a.localeCompare(b));
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch cities' });
  }
});

// =====================
// GET SPECIALTY FILTER OPTIONS
// =====================
router.get('/specialties', async (req, res) => {
  try {
    const specialties = await Doctor.distinct('specialty', { verified: true, flagged: false });
    const data = specialties.filter(Boolean).sort((a, b) => a.localeCompare(b));
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch specialties' });
  }
});

// =====================
// GET LANGUAGE FILTER OPTIONS
// =====================
router.get('/languages', async (req, res) => {
  try {
    const baseFilter = { verified: true, flagged: false };
    const [allLanguages, localLanguages, foreignLanguages] = await Promise.all([
      Doctor.distinct('languages', baseFilter),
      Doctor.distinct('localLanguages', baseFilter),
      Doctor.distinct('foreignLanguages', baseFilter),
    ]);

    const uniqueSorted = (values = []) =>
      [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    return res.json({
      success: true,
      data: {
        all: uniqueSorted(allLanguages),
        local: uniqueSorted(localLanguages),
        foreign: uniqueSorted(foreignLanguages),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch languages' });
  }
});

const searchDoctors = async (queryTerm, res) => {
  try {
    const term = String(queryTerm || '').trim();
    if (!term) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const doctors = await Doctor.find({
      verified: true,
      flagged: false,
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { specialty: { $regex: term, $options: 'i' } },
        { hospital: { $regex: term, $options: 'i' } },
      ],
    })
      .select('-availability')
      .limit(20)
      .sort({ verified: -1, rate: -1, reviewCount: -1 });

    return res.status(200).json({ success: true, data: doctors.map(toPlainDoctor), count: doctors.length });
  } catch (error) {
    console.error('Error searching doctors:', error);
    return res.status(500).json({
      success: false,
      message: 'Error searching doctors',
      error: error.message,
    });
  }
};

// =====================
// SEARCH DOCTORS (query param style)
// =====================
router.get('/search', async (req, res) => searchDoctors(req.query.q || req.query.query, res));

// =====================
// SEARCH DOCTORS (legacy path style)
// =====================
router.get('/search/:query', async (req, res) => searchDoctors(req.params.query, res));

// =====================
// GET DOCTORS BY CITY
// =====================
router.get('/city/:city', async (req, res) => {
  try {
    const city = String(req.params.city || '').trim();
    const specialty = String(req.query.specialty || '').trim();
    const limit = clamp(toNumber(req.query.limit, 50), 1, 100);

    const filter = { city, verified: true, flagged: false };
    if (specialty) filter.specialty = specialty;

    const doctors = await Doctor.find(filter)
      .select('-availability')
      .limit(limit)
      .sort({ verified: -1, rate: -1, reviewCount: -1 });

    return res.status(200).json({ success: true, data: doctors.map(toPlainDoctor) });
  } catch (error) {
    console.error('Error fetching doctors by city:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching doctors',
      error: error.message,
    });
  }
});

// =====================
// GET DOCTORS BY SPECIALTY
// =====================
router.get('/specialty/:specialty', async (req, res) => {
  try {
    const specialty = String(req.params.specialty || '').trim();
    const city = String(req.query.city || '').trim();
    const limit = clamp(toNumber(req.query.limit, 50), 1, 100);

    const filter = { specialty, verified: true, flagged: false };
    if (city) filter.city = city;

    const doctors = await Doctor.find(filter)
      .select('-availability')
      .limit(limit)
      .sort({ verified: -1, rate: -1, reviewCount: -1 });

    return res.status(200).json({ success: true, data: doctors.map(toPlainDoctor) });
  } catch (error) {
    console.error('Error fetching doctors by specialty:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching doctors',
      error: error.message,
    });
  }
});

// =====================
// GET SINGLE DOCTOR BY ID
// =====================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await Doctor.findById(id).populate('userId', 'name email phone');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found',
      });
    }

    if (!doctor.verified || doctor.flagged) {
      return res.status(403).json({
        success: false,
        message: 'Doctor is not available',
      });
    }

    const reviews = await Review.find({ doctorId: id, isApproved: true })
      .populate('userId', 'name')
      .select('rating comment createdAt title userId')
      .limit(10)
      .sort({ createdAt: -1 });

    const approvedReviews = reviews.map((review) => ({
      _id: review._id,
      rating: review.rating,
      title: review.title || '',
      comment: review.comment || '',
      createdAt: review.createdAt,
      patientName: review.userId?.name || 'Patient',
    }));

    return res.status(200).json({
      success: true,
      data: {
        ...doctor.toObject(),
        reviews: approvedReviews,
      },
    });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching doctor details',
      error: error.message,
    });
  }
});

module.exports = router;
