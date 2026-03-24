const fetch = require('node-fetch');
const { getAccessToken, fetchRecentActivities } = require('../lib/strava');

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
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
    const rides = allActivities.filter(a => a.type === 'Ride' && a.commute === true);

    // Filter to rides that have photos
    const ridesWithPhotos = rides.filter(a => a.total_photo_count > 0);

    // Fetch photos for each ride (sequential to respect rate limits)
    const results = [];
    for (const ride of ridesWithPhotos) {
      const photoResp = await fetch(
        `https://www.strava.com/api/v3/activities/${ride.id}/photos?size=2048`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (photoResp.ok) {
        const photos = await photoResp.json();
        if (photos.length > 0) {
          results.push({
            activityId: ride.id,
            activityName: ride.name,
            activityDate: ride.start_date_local,
            photos: photos
          });
        }
      }
    }

    cached = results;
    cacheTimestamp = now;
    res.status(200).json(cached);
  } catch (error) {
    console.error('Error fetching ride photos:', error);
    res.status(500).json({ error: 'Failed to fetch ride photos' });
  }
};
