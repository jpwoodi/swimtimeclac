// /.netlify/functions/strava-auth.js
const fetch = require('node-fetch');

const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;

exports.handler = async function(event, context) {
    const code = event.queryStringParameters.code;

    // Exchange authorization code for an access token
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code'
        }),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch the user's activities
    const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    const activities = await activitiesResponse.json();

    return {
        statusCode: 200,
        body: JSON.stringify(activities),
    };
};
