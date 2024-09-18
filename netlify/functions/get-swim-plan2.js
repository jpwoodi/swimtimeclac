// netlify/functions/get-swim-plan.js

const fetch = require('node-fetch');

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

    if (!tokenResponse.ok) {
      throw new Error('Failed to refresh access token');
    }

    const tokenData = await tokenResponse.json();
    const access_token = tokenData.access_token;

    // Fetch activities from the last 12 months
    const twelveMonthsAgo = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    const activitiesResponse = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${twelveMonthsAgo}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!activitiesResponse.ok) {
      throw new Error('Failed to fetch activities');
    }

    const activities = await activitiesResponse.json();
    const swims = activities.filter(activity => activity.type === 'Swim');

    if (!swims.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: 'No swim activities found.' }),
      };
    }

    // Analyze recent swims and generate a personalized plan
    const swimPlan = generateSwimPlan(swims);

    return {
      statusCode: 200,
      body: JSON.stringify(swimPlan),
    };
  } catch (error) {
    console.error('Error fetching swims:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch swim data' }),
    };
  }
};

// Function to generate a personalized swim plan based on recent swim data
function generateSwimPlan(swims) {
  // Example logic for swim plan generation
  const recentSwim = swims[0]; // Get the most recent swim
  const { distance, average_speed, moving_time, name } = recentSwim;

  const avgPace = (100 / average_speed).toFixed(2);
  const plan = [];

  // Create a plan based on performance
  if (avgPace > 2) {
    // If pace is slower than 2 min/100m, suggest speed workouts
    plan.push({
      type: 'Speed Session',
      details: '5x100m sprints, rest 30 seconds between sets, focus on fast pace.',
    });
    plan.push({
      type: 'Technique Drill',
      details: '10x50m with 1 minute rest, work on improving stroke efficiency.',
    });
  } else {
    // If pace is faster, suggest endurance workouts
    plan.push({
      type: 'Endurance Swim',
      details: '2000m continuous swim at a steady pace, focus on breathing and form.',
    });
    plan.push({
      type: 'Pace Swim',
      details: '10x100m at race pace, 30 seconds rest between sets.',
    });
  }

  return { name, plan };
}
