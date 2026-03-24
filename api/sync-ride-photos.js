const {
  PHOTO_SNAPSHOT_PATH,
  getSnapshotPhotoActivities,
  readPhotoSnapshot,
  syncPhotoSnapshot,
} = require('../lib/photo-snapshot');
const {
  allowSecretBearer,
  isAuthenticatedSiteRequest,
  requireSameOriginWrite,
} = require('../lib/server-security');
const { buildRateLimitMessage, getNextQuarterHourIso } = require('../lib/strava');
const { isBlobConfigured } = require('../lib/commute-snapshot');

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
    console.error('Error syncing photo snapshot:', error);
    if (error && error.code === 'STRAVA_RATE_LIMIT') {
      res.setHeader('Retry-After', new Date(getNextQuarterHourIso()).toUTCString());
      return res.status(429).json({
        error: `${buildRateLimitMessage()} Your current stored photo snapshot is still available.`,
      });
    }
    return res.status(500).json({ error: 'Failed to sync photo snapshot' });
  }
};
