// netlify/functions/get-swims.js

const fetch = require('node-fetch');

let cachedSwims = [];
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // Cache duration in milliseconds (e.g., 1 hour)

exports.handler = async (event, context) => {
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const refresh_token = process.env.STRAVA_REFRESH_TOKEN;

  const currentTime = new Date().getTime();

  try {
    // Check if cached data is available and valid
    if (cachedSwims.length > 0 && (currentTime - cacheTimestamp < CACHE_DURATION)) {
      return {
        statusCode: 200,
        body: JSON.stringify(cachedSwims),
      };
    }

    // Refresh the access token
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id,
        client_secret,
        grant_type: 'refresh_token',
        refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to refresh access token');
    }

    const tokenData = await tokenResponse.json();
    const access_token = tokenData.access_token;

    // Fetch activities from the last 12 months
    const twelveMonthsAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000); // Unix timestamp in seconds
    let page = 1;
    const per_page = 200; // Max per_page allowed by Strava API
    let allActivities = [];
    let activities = [];

    do {
      const activitiesResponse = await fetch(`https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${per_page}&after=${twelveMonthsAgo}`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (!activitiesResponse.ok) {
        throw new Error('Failed to fetch activities');
      }

      activities = await activitiesResponse.json();
      allActivities = allActivities.concat(activities);
      page++;
    } while (activities.length === per_page);

    // Filter for swim activities
    const swims = allActivities.filter(activity => activity.type === 'Swim');

    // Cache the swims
    cachedSwims = swims;
    cacheTimestamp = currentTime;

    return {
      statusCode: 200,
      body: JSON.stringify(swims),
    };
  } catch (error) {
    console.error('Error fetching swims:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch swim data' }),
    };
  }
};
