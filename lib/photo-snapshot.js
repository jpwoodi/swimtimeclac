const fetch = require('node-fetch');
const { get, put } = require('@vercel/blob');
const {
  buildStravaApiError,
  getAccessToken,
} = require('./strava');
const {
  fetchLatestCommuteRides,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
} = require('./commute-snapshot');

const PHOTO_SNAPSHOT_PATH = 'commute/photos.json';
const PHOTO_SNAPSHOT_SCHEMA_VERSION = 1;

function buildPhotoSnapshot(activities, meta = {}) {
  const generatedAt = new Date().toISOString();
  const photoCount = activities.reduce((total, activity) => total + (activity.photos?.length || 0), 0);
  return {
    schemaVersion: PHOTO_SNAPSHOT_SCHEMA_VERSION,
    kind: 'commute-photos',
    generatedAt,
    source: meta.source || 'manual',
    activityCount: activities.length,
    photoCount,
    activities,
  };
}

function getSnapshotPhotoActivities(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  if (snapshot && Array.isArray(snapshot.activities)) return snapshot.activities;
  return [];
}

async function readPhotoSnapshot() {
  if (!isBlobConfigured()) {
    return null;
  }

  const result = await get(PHOTO_SNAPSHOT_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function writePhotoSnapshot(snapshot) {
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return put(
    PHOTO_SNAPSHOT_PATH,
    JSON.stringify(snapshot, null, 2),
    {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }
  );
}

async function getPhotoSourceRides() {
  const rideSnapshot = await readCommuteSnapshot();
  const snapshotRides = getSnapshotRides(rideSnapshot);
  if (snapshotRides.length > 0) {
    return snapshotRides;
  }
  return fetchLatestCommuteRides();
}

async function fetchLatestRidePhotos() {
  const sourceRides = await getPhotoSourceRides();
  const ridesWithPhotos = sourceRides.filter((ride) => ride.total_photo_count > 0);

  if (ridesWithPhotos.length === 0) {
    return [];
  }

  const accessToken = await getAccessToken();
  const activities = [];

  for (const ride of ridesWithPhotos) {
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${ride.id}/photos?size=2048`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      throw buildStravaApiError(response, 'activity photo fetch');
    }

    const photos = await response.json();
    if (!Array.isArray(photos) || photos.length === 0) {
      continue;
    }

    activities.push({
      activityId: ride.id,
      activityName: ride.name,
      activityDate: ride.start_date_local || ride.start_date,
      totalPhotoCount: ride.total_photo_count || photos.length,
      photos,
    });
  }

  return activities;
}

async function syncPhotoSnapshot(options = {}) {
  const activities = await fetchLatestRidePhotos();
  const snapshot = buildPhotoSnapshot(activities, options);
  const blob = await writePhotoSnapshot(snapshot);

  return {
    snapshot,
    blob,
    activities,
  };
}

module.exports = {
  PHOTO_SNAPSHOT_PATH,
  buildPhotoSnapshot,
  fetchLatestRidePhotos,
  getSnapshotPhotoActivities,
  readPhotoSnapshot,
  syncPhotoSnapshot,
  writePhotoSnapshot,
};
