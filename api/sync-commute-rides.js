const crypto = require('crypto');
const { getAuthCookie, verifySessionToken } = require('../lib/auth-utils');
const {
  COMMUTE_SNAPSHOT_PATH,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
  syncCommuteSnapshot,
} = require('../lib/commute-snapshot');

function getHeader(headers, name) {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return headers[key] || '';
    }
  }
  return '';
}

function safeEqual(left, right) {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function matchesSharedSecret(req) {
  const expected = process.env.COMMUTE_SYNC_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;

  const providedHeader = getHeader(req.headers, 'authorization');
  if (providedHeader && safeEqual(providedHeader, `Bearer ${expected}`)) {
    return true;
  }

  const providedQuery = typeof req.query?.secret === 'string' ? req.query.secret : '';
  return providedQuery ? safeEqual(providedQuery, expected) : false;
}

function hasValidSession(req) {
  const authEnabled = process.env.AUTH_ENABLED !== 'false';
  if (!authEnabled) return true;

  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret) return false;

  const token = getAuthCookie(req.headers);
  return verifySessionToken(token, sessionSecret);
}

function isAuthorized(req) {
  return matchesSharedSecret(req) || hasValidSession(req);
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
      error: 'Unauthorized. Provide a valid session, COMMUTE_SYNC_SECRET, or CRON_SECRET.',
    });
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
      source: req.method === 'POST' ? 'manual-post' : 'manual-get',
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
