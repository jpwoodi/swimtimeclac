const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    const REDIRECT_URI = process.env.REDIRECT_URI_STRAVA;

    const code = event.queryStringParameters.code;

    if (!code) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing authorization code' }),
        };
    }

    try {
        // Exchange authorization code for access/refresh tokens
        const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error('Failed to obtain access token');
        }

        const accessToken = tokenData.access_token;

        // Fetch activities using the access token
        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const activities = await activitiesResponse.json();

        if (activities.errors) {
            throw new Error('Authorization error: Missing read permissions.');
        }

        // Filter for swim activities
        const swimActivities = activities.filter(activity => activity.type === 'Swim');

        return {
            statusCode: 200,
            body: JSON.stringify(swimActivities),
        };
    } catch (error) {
        console.error('Error fetching activities:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error', details: error.message }),
        };
    }
};
