// netlify/functions/get-rides.js

const fetch = require('node-fetch');

let cachedRides = [];
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

exports.handler = async (event, context) => {
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const refresh_token = process.env.STRAVA_REFRESH_TOKEN;

  const currentTime = Date.now();
  const forceRefresh = event.queryStringParameters.refresh === "true";

  try {
    // ✅ Use cache only if not forcing refresh
    if (!forceRefresh && cachedRides.length > 0 && (currentTime - cacheTimestamp < CACHE_DURATION)) {
      return {
        statusCode: 200,
        body: JSON.stringify(cachedRides),
      };
    }

    // Refresh access token
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id,
        client_secret,
        grant_type: "refresh_token",
        refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to refresh access token");
    }

    const { access_token } = await tokenResponse.json();

    // Fetch activities from last 12 months
    const twelveMonthsAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    let page = 1;
    const per_page = 200;
    let allActivities = [];
    let activities = [];

    do {
      const response = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${per_page}&after=${twelveMonthsAgo}`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      if (!response.ok) throw new Error("Failed to fetch activities");

      activities = await response.json();
      allActivities = allActivities.concat(activities);
      page++;
    } while (activities.length === per_page);

    // Filter for rides marked as commute
    const rides = allActivities.filter(
      (activity) => activity.type === "Ride" && activity.commute === true
    );

    // ✅ Update cache
    cachedRides = rides;
    cacheTimestamp = currentTime;

    return {
      statusCode: 200,
      body: JSON.stringify(rides),
    };
  } catch (error) {
    console.error("Error fetching rides:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch ride data" }),
    };
  }
};
