const {
  buildPhotoSnapshot,
  fetchLatestRidePhotos,
  getSnapshotPhotoActivities,
  readPhotoSnapshot,
} = require('../lib/photo-snapshot');
const { isBlobConfigured } = require('../lib/commute-snapshot');
const { requireSiteAuth } = require('../lib/server-security');

module.exports = async (req, res) => {
  const forceRefresh = req.query?.refresh === 'true';

  if (!requireSiteAuth(req, res)) {
    return;
  }

  try {
    if (!forceRefresh) {
      const snapshot = await readPhotoSnapshot();
      const snapshotActivities = getSnapshotPhotoActivities(snapshot);

      if (snapshot) {
        res.setHeader('X-Photo-Data-Source', snapshotActivities.length > 0 ? 'blob' : 'blob-empty');
        if (snapshot && snapshot.generatedAt) {
          res.setHeader('X-Photo-Generated-At', snapshot.generatedAt);
        }
        return res.status(200).json(snapshotActivities);
      }
    }

    const activities = await fetchLatestRidePhotos();
    const snapshot = buildPhotoSnapshot(activities, {
      source: forceRefresh ? 'live-refresh-fallback' : 'live-fallback',
    });

    res.setHeader('X-Photo-Data-Source', isBlobConfigured() ? 'strava-fallback' : 'strava-live');
    res.setHeader('X-Photo-Generated-At', snapshot.generatedAt);
    return res.status(200).json(snapshot.activities);
  } catch (error) {
    console.error('Error fetching ride photos:', error);

    try {
      const snapshot = await readPhotoSnapshot();
      const snapshotActivities = getSnapshotPhotoActivities(snapshot);

      if (snapshot) {
        res.setHeader('X-Photo-Data-Source', snapshotActivities.length > 0 ? 'blob-stale' : 'blob-empty-stale');
        if (snapshot && snapshot.generatedAt) {
          res.setHeader('X-Photo-Generated-At', snapshot.generatedAt);
        }
        return res.status(200).json(snapshotActivities);
      }
    } catch (snapshotError) {
      console.error('Error reading fallback photo snapshot:', snapshotError);
    }

    res.status(500).json({ error: 'Failed to fetch ride photos' });
  }
};
