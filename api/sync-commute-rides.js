const {
  COMMUTE_SNAPSHOT_PATH,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
  syncCommuteSnapshot,
} = require('../lib/commute-snapshot');
const {
  allowSecretBearer,
  isAuthenticatedSiteRequest,
  requireSameOriginWrite,
} = require('../lib/server-security');

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
    console.error('Error syncing commute rides snapshot:', error);
    return res.status(500).json({ error: 'Failed to sync commute rides snapshot' });
  }
};
