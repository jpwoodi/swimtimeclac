const fetch = require('node-fetch');
const { requireSiteAuth } = require('./server-security');

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

function buildStravaApiError(response, context) {
  const status = response.status;
  const shortUsage = response.headers.get('x-readratelimit-usage') || response.headers.get('x-ratelimit-usage') || '';
  const shortLimit = response.headers.get('x-readratelimit-limit') || response.headers.get('x-ratelimit-limit') || '';
  const error = new Error(`Strava ${context} failed with status ${status}`);
  error.status = status;
  error.shortUsage = shortUsage;
  error.shortLimit = shortLimit;

  if (status === 429 || status === 403) {
    error.code = 'STRAVA_RATE_LIMIT';
  }

  return error;
}

function getNextQuarterHourIso(now = new Date()) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const nextQuarterMinutes = Math.ceil((next.getMinutes() + 1) / 15) * 15;
  next.setMinutes(nextQuarterMinutes);
  return next.toISOString();
}

function buildRateLimitMessage(now = new Date()) {
  const nextReset = new Date(getNextQuarterHourIso(now));
  const formatted = nextReset.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
  return `Strava's short-term read limit is currently exhausted. Try again after ${formatted}.`;
}

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
    throw buildStravaApiError(response, 'token refresh');
  }

  const data = await response.json();
  return data.access_token;
}

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
      throw buildStravaApiError(response, 'activity fetch');
    }

    activities = await response.json();
    allActivities = allActivities.concat(activities);
    page++;
  } while (activities.length === perPage);

  return allActivities;
}

function createStravaHandler(filterFn, errorLabel) {
  let cached = [];
  let cacheTimestamp = null;

  return async (req, res) => {
    const now = Date.now();
    const forceRefresh = req.query?.refresh === 'true';

    if (!requireSiteAuth(req, res)) {
      return;
    }

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
      if (cacheTimestamp !== null) {
        return res.status(200).json(cached);
      }
      res.status(500).json({ error: `Failed to fetch ${errorLabel}` });
    }
  };
}

module.exports = {
  buildRateLimitMessage,
  fetchRecentActivities,
  getAccessToken,
  getNextQuarterHourIso,
  createStravaHandler,
};
