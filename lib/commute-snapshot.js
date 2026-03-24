const { get, put } = require('@vercel/blob');
const { getAccessToken, fetchRecentActivities } = require('./strava');
const { enrichRidesWithWeather } = require('./weather');

const COMMUTE_SNAPSHOT_PATH = 'commute/rides.json';
const COMMUTE_SNAPSHOT_SCHEMA_VERSION = 1;

function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function filterCommuteRides(activities) {
  return activities
    .filter((activity) => activity.type === 'Ride' && activity.commute === true)
    .sort((a, b) => new Date(b.start_date_local || b.start_date) - new Date(a.start_date_local || a.start_date));
}

async function fetchLatestCommuteRides() {
  const accessToken = await getAccessToken();
  const allActivities = await fetchRecentActivities(accessToken);
  return filterCommuteRides(allActivities);
}

function buildCommuteSnapshot(rides, meta = {}) {
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: COMMUTE_SNAPSHOT_SCHEMA_VERSION,
    kind: 'commute-rides',
    generatedAt,
    rideCount: rides.length,
    source: meta.source || 'manual',
    rides,
  };
}

function getSnapshotRides(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  if (snapshot && Array.isArray(snapshot.rides)) return snapshot.rides;
  return [];
}

async function readCommuteSnapshot() {
  if (!isBlobConfigured()) {
    return null;
  }

  const result = await get(COMMUTE_SNAPSHOT_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function writeCommuteSnapshot(snapshot) {
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return put(
    COMMUTE_SNAPSHOT_PATH,
    JSON.stringify(snapshot, null, 2),
    {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }
  );
}

async function syncCommuteSnapshot(options = {}) {
  const rides = await fetchLatestCommuteRides();
  const enrichedRides = await enrichRidesWithWeather(rides);
  const snapshot = buildCommuteSnapshot(enrichedRides, options);
  const blob = await writeCommuteSnapshot(snapshot);

  return {
    snapshot,
    blob,
  };
}

module.exports = {
  COMMUTE_SNAPSHOT_PATH,
  buildCommuteSnapshot,
  enrichRidesWithWeather,
  fetchLatestCommuteRides,
  filterCommuteRides,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
  syncCommuteSnapshot,
};
