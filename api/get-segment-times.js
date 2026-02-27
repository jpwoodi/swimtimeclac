const fetch = require('node-fetch');
const { getAccessToken, fetchRecentActivities } = require('./lib/strava');

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const BATCH_SIZE = 10;
let cached = null;
let cacheTimestamp = null;

module.exports = async (req, res) => {
  const now = Date.now();
  const forceRefresh = req.query?.refresh === 'true';

  try {
    if (!forceRefresh && cacheTimestamp !== null && (now - cacheTimestamp < CACHE_DURATION)) {
      return res.status(200).json(cached);
    }

    const accessToken = await getAccessToken();
    const allActivities = await fetchRecentActivities(accessToken);
    // Cap at the 75 most recent commute rides to stay within Strava's rate limits
    const rides = allActivities
      .filter(a => a.type === 'Ride' && a.commute === true)
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
      .slice(0, 75);

    const segments = {};
    const efforts = [];

    // Fetch detailed activity data in parallel batches
    for (let i = 0; i < rides.length; i += BATCH_SIZE) {
      const batch = rides.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(ride =>
          fetch(
            `https://www.strava.com/api/v3/activities/${ride.id}?include_all_efforts=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          ).then(r => r.ok ? r.json() : null)
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && result.value.segment_efforts) {
          for (const effort of result.value.segment_efforts) {
            if (!segments[effort.segment.id]) {
              segments[effort.segment.id] = {
                id: effort.segment.id,
                name: effort.segment.name
              };
            }

            efforts.push({
              segmentId: effort.segment.id,
              activityId: result.value.id,
              activityDate: effort.start_date,
              elapsedTime: effort.elapsed_time,
              movingTime: effort.moving_time
            });
          }
        }
      }
    }

    cached = { segments, efforts };
    cacheTimestamp = now;
    res.status(200).json(cached);
  } catch (error) {
    console.error('Error fetching segment times:', error);
    if (cacheTimestamp !== null) {
      return res.status(200).json(cached);
    }
    res.status(500).json({ error: 'Failed to fetch segment times' });
  }
};
