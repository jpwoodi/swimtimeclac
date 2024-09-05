// functions/strava-auth.js
const fetch = require('node-fetch');

exports.handler = async function (event, context) {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    const REDIRECT_URI = process.env.REDIRECT_URI_STRAVA;

    const params = event.queryStringParameters;

    if (params.code) {
        // Step 1: Exchange the authorization code for an access token
        const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: params.code,
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.access_token) {
            // Step 2: Use the access token to fetch Strava activities
            const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                },
            });

            const activities = await activitiesResponse.json();

            return {
                statusCode: 200,
                body: JSON.stringify(activities),
            };
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Failed to get access token' }),
            };
        }
    } else {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No authorization code provided' }),
        };
    }
};
