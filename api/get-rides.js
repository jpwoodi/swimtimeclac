const {
  buildCommuteSnapshot,
  fetchLatestCommuteRides,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
} = require('../lib/commute-snapshot');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shouldRefresh = req.query?.refresh === 'true';

  try {
    if (!shouldRefresh) {
      const snapshot = await readCommuteSnapshot();
      const snapshotRides = getSnapshotRides(snapshot);

      if (snapshotRides.length > 0) {
        res.setHeader('X-Commute-Data-Source', 'blob');
        if (snapshot && snapshot.generatedAt) {
          res.setHeader('X-Commute-Generated-At', snapshot.generatedAt);
        }
        return res.status(200).json(snapshotRides);
      }
    }

    const liveRides = await fetchLatestCommuteRides();
    const snapshot = buildCommuteSnapshot(liveRides, {
      source: shouldRefresh ? 'live-refresh-fallback' : 'live-fallback',
    });

    res.setHeader('X-Commute-Data-Source', isBlobConfigured() ? 'strava-fallback' : 'strava-live');
    res.setHeader('X-Commute-Generated-At', snapshot.generatedAt);
    return res.status(200).json(snapshot.rides);
  } catch (error) {
    console.error('Error serving ride data:', error);

    try {
      const snapshot = await readCommuteSnapshot();
      const snapshotRides = getSnapshotRides(snapshot);

      if (snapshotRides.length > 0) {
        res.setHeader('X-Commute-Data-Source', 'blob-stale');
        if (snapshot && snapshot.generatedAt) {
          res.setHeader('X-Commute-Generated-At', snapshot.generatedAt);
        }
        return res.status(200).json(snapshotRides);
      }
    } catch (snapshotError) {
      console.error('Error reading fallback snapshot:', snapshotError);
    }

    return res.status(500).json({ error: 'Failed to fetch ride data' });
  }
};
