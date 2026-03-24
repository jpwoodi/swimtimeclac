const fetch = require('node-fetch');
const { getAccessToken } = require('../lib/strava');
const { requireSiteAuth } = require('../lib/server-security');

// Segment routes don't change, cache for 24 hours
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const cache = {};

module.exports = async (req, res) => {
  if (!requireSiteAuth(req, res)) {
    return;
  }

  const segmentId = req.query.id;
  if (!segmentId) {
    return res.status(400).json({ error: 'Missing segment id' });
  }

  const now = Date.now();
  if (cache[segmentId] && (now - cache[segmentId].ts < CACHE_DURATION)) {
    return res.status(200).json(cache[segmentId].data);
  }

  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `https://www.strava.com/api/v3/segments/${segmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch segment' });
    }

    const seg = await response.json();
    const data = {
      id: seg.id,
      name: seg.name,
      polyline: seg.map && seg.map.polyline,
      distance: seg.distance,
      elevation_gain: seg.total_elevation_gain,
      average_grade: seg.average_grade,
      city: seg.city
    };

    cache[segmentId] = { data, ts: now };
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching segment detail:', error);
    res.status(500).json({ error: 'Failed to fetch segment detail' });
  }
};
