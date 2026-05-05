const DEFAULT_RADIUS_KM = 50;

const uniqueStrings = (values = []) =>
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];

const parseCsvInput = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((item) => parseCsvInput(item)));
  }

  return uniqueStrings(String(value).split(','));
};

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getDoctorLanguagePool = (doctor = {}) =>
  uniqueStrings([
    ...(doctor.languages || []),
    ...(doctor.localLanguages || []),
    ...(doctor.foreignLanguages || []),
  ]);

const getLanguageMatchRatio = (doctor, preferredLanguages = []) => {
  const preferred = parseCsvInput(preferredLanguages).map((lang) => lang.toLowerCase());
  if (preferred.length === 0) return 0;

  const spoken = new Set(getDoctorLanguagePool(doctor).map((lang) => lang.toLowerCase()));
  const matched = preferred.filter((lang) => spoken.has(lang)).length;

  return matched / preferred.length;
};

const computeTravelerTrustScore = (doctor, options = {}) => {
  const distanceKm = toNumber(options.distanceKm);
  const radiusKm = clamp(toNumber(options.radiusKm, DEFAULT_RADIUS_KM), 1, 500);
  const preferredLanguages = parseCsvInput(options.preferredLanguages);

  const verifiedScore = doctor.verified ? 35 : 0;

  const distanceScore = Number.isFinite(distanceKm)
    ? Math.max(0, 30 * (1 - distanceKm / radiusKm))
    : 0;

  const languageScore = getLanguageMatchRatio(doctor, preferredLanguages) * 20;

  const rating = clamp(toNumber(doctor.rate, 0), 0, 5);
  const ratingScore = (rating / 5) * 10;

  const reviewCount = Math.max(0, toNumber(doctor.reviewCount, 0));
  const reviewScore = Math.min(reviewCount / 50, 1) * 5;

  const touristFriendlyBonus = doctor.touristFriendly ? 5 : 0;

  return Number(
    (
      verifiedScore +
      distanceScore +
      languageScore +
      ratingScore +
      reviewScore +
      touristFriendlyBonus
    ).toFixed(2)
  );
};

const buildMatchReasons = (doctor, options = {}) => {
  const preferredLanguages = parseCsvInput(options.preferredLanguages).map((lang) => lang.toLowerCase());
  const spoken = getDoctorLanguagePool(doctor);
  const spokenLookup = new Set(spoken.map((lang) => lang.toLowerCase()));

  const reasons = [];

  if (doctor.verified) reasons.push('Verified credentials');

  if (Number.isFinite(toNumber(options.distanceKm))) {
    reasons.push(`${Number(options.distanceKm).toFixed(1)} km away`);
  }

  if (preferredLanguages.length > 0) {
    const matched = spoken.filter((lang) => spokenLookup.has(lang.toLowerCase()) && preferredLanguages.includes(lang.toLowerCase()));
    if (matched.length > 0) reasons.push(`Speaks ${matched.slice(0, 2).join(', ')}`);
  }

  if (doctor.touristFriendly) reasons.push('Tourist friendly');

  if (toNumber(doctor.rate, 0) > 0) {
    reasons.push(`Rated ${Number(doctor.rate).toFixed(1)}`);
  }

  return reasons.slice(0, 4);
};

const rankDoctorsForTraveler = (doctors = [], options = {}) =>
  doctors
    .map((doctor) => {
      const distanceKm = toNumber(doctor.distanceKm);
      const trustScore = computeTravelerTrustScore(doctor, {
        preferredLanguages: options.preferredLanguages,
        radiusKm: options.radiusKm,
        distanceKm,
      });

      return {
        ...doctor,
        trustScore,
        matchReasons: buildMatchReasons(doctor, {
          preferredLanguages: options.preferredLanguages,
          distanceKm,
        }),
      };
    })
    .sort((a, b) => {
      if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;

      const distanceA = Number.isFinite(toNumber(a.distanceKm)) ? Number(a.distanceKm) : Infinity;
      const distanceB = Number.isFinite(toNumber(b.distanceKm)) ? Number(b.distanceKm) : Infinity;
      if (distanceA !== distanceB) return distanceA - distanceB;

      const ratingDiff = (Number(b.rate) || 0) - (Number(a.rate) || 0);
      if (ratingDiff !== 0) return ratingDiff;

      return (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0);
    });

module.exports = {
  parseCsvInput,
  getDoctorLanguagePool,
  computeTravelerTrustScore,
  rankDoctorsForTraveler,
};
