const {
  COMMUTE_SNAPSHOT_PATH,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
  syncCommuteSnapshot,
} = require('../lib/commute-snapshot');
const {
  PHOTO_SNAPSHOT_PATH,
  getSnapshotPhotoActivities,
  readPhotoSnapshot,
  syncPhotoSnapshot,
} = require('../lib/photo-snapshot');
const {
  SEGMENT_SNAPSHOT_PATH,
  getSnapshotSegmentPayload,
  readSegmentSnapshot,
  syncSegmentSnapshot,
} = require('../lib/segment-snapshot');
const {
  allowSecretBearer,
  isAuthenticatedSiteRequest,
  requireSameOriginWrite,
} = require('../lib/server-security');
const { buildRateLimitMessage, getNextQuarterHourIso } = require('../lib/strava');

function matchesSharedSecret(req) {
  return (
    allowSecretBearer(req, process.env.COMMUTE_SYNC_SECRET) ||
    allowSecretBearer(req, process.env.CRON_SECRET)
  );
}

function isAuthorized(req) {
  if (req.method === 'GET') {
    return matchesSharedSecret(req);
  }
  return matchesSharedSecret(req) || isAuthenticatedSiteRequest(req);
}

function handleSyncError(res, error, label) {
  console.error(`Error syncing ${label} snapshot:`, error);
  if (error && error.code === 'STRAVA_RATE_LIMIT') {
    res.setHeader('Retry-After', new Date(getNextQuarterHourIso()).toUTCString());
    return res.status(429).json({
      error: `${buildRateLimitMessage()} Your current stored ${label} snapshot is still available.`,
    });
  }
  return res.status(500).json({ error: `Failed to sync ${label} snapshot` });
}

async function syncCommuteRides(req, res) {
  if (!isBlobConfigured()) {
    return res.status(500).json({
      error: 'Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN before syncing commute rides.',
    });
  }

  try {
    const beforeSnapshot = await readCommuteSnapshot();
    const beforeRideCount = getSnapshotRides(beforeSnapshot).length;

    const { snapshot, blob } = await syncCommuteSnapshot({
      source: req.method === 'POST' ? 'manual-post' : 'cron-get',
    });

    return res.status(200).json({
      ok: true,
      pathname: blob.pathname,
      generatedAt: snapshot.generatedAt,
      rideCount: snapshot.rideCount,
      previousRideCount: beforeRideCount,
      delta: snapshot.rideCount - beforeRideCount,
      snapshotPath: COMMUTE_SNAPSHOT_PATH,
    });
  } catch (error) {
    return handleSyncError(res, error, 'commute rides');
  }
}

async function syncRidePhotos(req, res) {
  if (!isBlobConfigured()) {
    return res.status(500).json({
      error: 'Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN before syncing photo data.',
    });
  }

  try {
    const beforeSnapshot = await readPhotoSnapshot();
    const beforeActivities = getSnapshotPhotoActivities(beforeSnapshot);
    const beforePhotoCount = beforeActivities.reduce((sum, activity) => sum + (activity.photos?.length || 0), 0);

    const { snapshot, blob, activities } = await syncPhotoSnapshot({
      source: req.method === 'POST' ? 'manual-post' : 'cron-get',
    });

    return res.status(200).json({
      ok: true,
      pathname: blob.pathname,
      generatedAt: snapshot.generatedAt,
      activityCount: snapshot.activityCount,
      photoCount: snapshot.photoCount,
      previousActivityCount: beforeActivities.length,
      previousPhotoCount: beforePhotoCount,
      deltaPhotos: snapshot.photoCount - beforePhotoCount,
      snapshotPath: PHOTO_SNAPSHOT_PATH,
      syncedActivities: activities.length,
    });
  } catch (error) {
    return handleSyncError(res, error, 'photo');
  }
}

async function syncSegmentTimes(req, res) {
  if (!isBlobConfigured()) {
    return res.status(500).json({
      error: 'Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN before syncing segment data.',
    });
  }

  try {
    const beforeSnapshot = await readSegmentSnapshot();
    const beforePayload = getSnapshotSegmentPayload(beforeSnapshot);

    const { snapshot, blob, payload, batchRideCount } = await syncSegmentSnapshot({
      source: req.method === 'POST' ? 'manual-post' : 'cron-get',
    });

    return res.status(200).json({
      ok: true,
      pathname: blob.pathname,
      generatedAt: snapshot.generatedAt,
      activityCount: payload.activityCount,
      syncedRideCount: payload.syncedRideCount,
      pendingRideCount: payload.pendingRideCount,
      batchRideCount,
      isBackfillComplete: payload.isBackfillComplete,
      segmentCount: snapshot.segmentCount,
      effortCount: snapshot.effortCount,
      previousEffortCount: beforePayload.efforts.length,
      deltaEfforts: snapshot.effortCount - beforePayload.efforts.length,
      snapshotPath: SEGMENT_SNAPSHOT_PATH,
    });
  } catch (error) {
    return handleSyncError(res, error, 'segment');
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: 'Unauthorized. Provide a valid session or bearer secret.',
    });
  }

  if (req.method === 'POST' && !matchesSharedSecret(req) && !requireSameOriginWrite(req, res)) {
    return;
  }

  const target = req.query.target;
  if (target === 'commute-rides') return syncCommuteRides(req, res);
  if (target === 'ride-photos') return syncRidePhotos(req, res);
  if (target === 'segment-times') return syncSegmentTimes(req, res);

  return res.status(400).json({
    error: 'Invalid target. Use ?target=commute-rides|ride-photos|segment-times',
  });
};
