const fetch = require('node-fetch');

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Refreshes the Strava access token using the stored refresh token.
 */
async function getAccessToken() {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Fetches all Strava activities from the last 12 months, paginating automatically.
 */
async function fetchRecentActivities(accessToken) {
  const twelveMonthsAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
  const perPage = 200;
  let page = 1;
  let allActivities = [];
  let activities;

  do {
    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}&after=${twelveMonthsAgo}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch activities');
    }

    activities = await response.json();
    allActivities = allActivities.concat(activities);
    page++;
  } while (activities.length === perPage);

  return allActivities;
}

/**
 * Creates a cached Strava endpoint handler.
 *
 * @param {function} filterFn - Filters raw activities (e.g. by type)
 * @param {string} errorLabel - Label for error messages (e.g. "swim data")
 */
function createStravaHandler(filterFn, errorLabel) {
  let cached = [];
  let cacheTimestamp = null;

  return async (req, res) => {
    const now = Date.now();
    const forceRefresh = req.query?.refresh === 'true';

    try {
      if (!forceRefresh && cacheTimestamp !== null && (now - cacheTimestamp < CACHE_DURATION)) {
        return res.status(200).json(cached);
      }

      const accessToken = await getAccessToken();
      const allActivities = await fetchRecentActivities(accessToken);
      cached = filterFn(allActivities);
      cacheTimestamp = now;

      res.status(200).json(cached);
    } catch (error) {
      console.error(`Error fetching ${errorLabel}:`, error);
      // Return stale cache rather than an error if we have previously fetched data
      if (cacheTimestamp !== null) {
        return res.status(200).json(cached);
      }
      res.status(500).json({ error: `Failed to fetch ${errorLabel}` });
    }
  };
}

module.exports = { getAccessToken, fetchRecentActivities, createStravaHandler };
