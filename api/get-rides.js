const {
  buildCommuteSnapshot,
  enrichRidesWithWeather,
  fetchLatestCommuteRides,
  getSnapshotRides,
  isBlobConfigured,
  readCommuteSnapshot,
} = require('../lib/commute-snapshot');
const { requireSiteAuth } = require('../lib/server-security');

function needsWeatherEnrichment(rides) {
  if (!Array.isArray(rides) || rides.length === 0) return false;
  return rides.some((ride) => !ride || !ride.weather);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireSiteAuth(req, res)) {
    return;
  }

  const shouldRefresh = req.query?.refresh === 'true';

  try {
    if (!shouldRefresh) {
      const snapshot = await readCommuteSnapshot();
      const snapshotRides = getSnapshotRides(snapshot);

      if (snapshotRides.length > 0) {
        const ridesToReturn = needsWeatherEnrichment(snapshotRides)
          ? await enrichRidesWithWeather(snapshotRides)
          : snapshotRides;

        res.setHeader('X-Commute-Data-Source', needsWeatherEnrichment(snapshotRides) ? 'blob-enriched' : 'blob');
        if (snapshot && snapshot.generatedAt) {
          res.setHeader('X-Commute-Generated-At', snapshot.generatedAt);
        }
        return res.status(200).json(ridesToReturn);
      }
    }

    const liveRides = await fetchLatestCommuteRides();
    const enrichedRides = await enrichRidesWithWeather(liveRides);
    const snapshot = buildCommuteSnapshot(enrichedRides, {
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
        const ridesToReturn = needsWeatherEnrichment(snapshotRides)
          ? await enrichRidesWithWeather(snapshotRides)
          : snapshotRides;

        res.setHeader('X-Commute-Data-Source', needsWeatherEnrichment(snapshotRides) ? 'blob-stale-enriched' : 'blob-stale');
        if (snapshot && snapshot.generatedAt) {
          res.setHeader('X-Commute-Generated-At', snapshot.generatedAt);
        }
        return res.status(200).json(ridesToReturn);
      }
    } catch (snapshotError) {
      console.error('Error reading fallback snapshot:', snapshotError);
    }

    return res.status(500).json({ error: 'Failed to fetch ride data' });
  }
};
