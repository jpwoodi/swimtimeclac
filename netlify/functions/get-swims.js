// netlify/functions/get-swims.js

const fetch = require('node-fetch');

let cachedSwims = [];
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 1000; // Cache duration in milliseconds (e.g., 60 seconds)

exports.handler = async (event, context) => {
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const refresh_token = process.env.STRAVA_REFRESH_TOKEN;

  // Get query parameters for pagination
  const page = parseInt(event.queryStringParameters.page) || 1;
  const per_page = parseInt(event.queryStringParameters.per_page) || 10;

  const currentTime = new Date().getTime();

  try {
    // Check if cached data is available and valid
    if (cachedSwims.length > 0 && (currentTime - cacheTimestamp < CACHE_DURATION)) {
      // Return the requested page from cached data
      const startIndex = (page - 1) * per_page;
      const endIndex = startIndex + per_page;
      const pageSwims = cachedSwims.slice(startIndex, endIndex);

      return {
        statusCode: 200,
        body: JSON.stringify(pageSwims),
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

    // Fetch activities (we'll fetch more to cache them)
    const activitiesResponse = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=50`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!activitiesResponse.ok) {
      throw new Error('Failed to fetch activities');
    }

    const activities = await activitiesResponse.json();

    // Filter for swim activities and cache them
    const swims = activities.filter(activity => activity.type === 'Swim');

    cachedSwims = swims;
    cacheTimestamp = currentTime;

    // Return the requested page
    const startIndex = (page - 1) * per_page;
    const endIndex = startIndex + per_page;
    const pageSwims = swims.slice(startIndex, endIndex);

    return {
      statusCode: 200,
      body: JSON.stringify(pageSwims),
    };
  } catch (error) {
    console.error('Error fetching swims:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch swim data' }),
    };
  }
};
