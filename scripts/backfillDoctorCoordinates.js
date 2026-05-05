const connectDB = require('../config/db');
const Doctor = require('../models/Doctor');

const CITY_COORDINATES = {
  ahmedabad: [72.5714, 23.0225],
  bengaluru: [77.5946, 12.9716],
  bangalore: [77.5946, 12.9716],
  chennai: [80.2707, 13.0827],
  delhi: [77.1025, 28.7041],
  hyderabad: [78.4867, 17.385],
  jaipur: [75.7873, 26.9124],
  kolkata: [88.3639, 22.5726],
  lucknow: [80.9462, 26.8467],
  mumbai: [72.8777, 19.076],
  pune: [73.8567, 18.5204],
};

const normalizeCity = (value = '') => String(value).trim().toLowerCase();

async function run() {
  await connectDB();

  const doctors = await Doctor.find({
    $or: [
      { coordinates: { $exists: false } },
      { coordinates: null },
      { 'coordinates.coordinates.0': { $exists: false } },
    ],
  }).select('_id name city state coordinates');

  let updated = 0;
  let skipped = 0;

  for (const doctor of doctors) {
    const key = normalizeCity(doctor.city);
    const mappedCoordinates = CITY_COORDINATES[key];

    if (!mappedCoordinates) {
      skipped += 1;
      continue;
    }

    doctor.coordinates = {
      type: 'Point',
      coordinates: mappedCoordinates,
    };

    await doctor.save();
    updated += 1;
  }

  console.log('Doctor coordinate backfill complete.');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (unknown city): ${skipped}`);

  process.exit(0);
}

run().catch((error) => {
  console.error('Coordinate backfill failed:', error.message || error);
  process.exit(1);
});
