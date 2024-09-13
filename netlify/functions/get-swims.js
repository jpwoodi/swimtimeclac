// netlify/functions/get-swims.js

exports.handler = async (event, context) => {
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const refresh_token = process.env.STRAVA_REFRESH_TOKEN;

  try {
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

    const tokenData = await tokenResponse.json();
    const access_token = tokenData.access_token;

    // Fetch activities
    const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const activities = await activitiesResponse.json();

    // Filter for swim activities
    const swims = activities.filter(activity => activity.type === 'Swim');

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
