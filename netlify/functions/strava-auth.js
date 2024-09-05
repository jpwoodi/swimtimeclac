const fetch = require('node-fetch');

exports.handler = async function (event) {
    const { CLIENT_ID_STRAVA, CLIENT_SECRET_STRAVA, REDIRECT_URI_STRAVA } = process.env;

    // Extract the authorization code from the query params
    const code = event.queryStringParameters.code;

    if (!code) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Authorization code is missing.' }),
        };
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: CLIENT_ID_STRAVA,
            client_secret: CLIENT_SECRET_STRAVA,
            code: code,
            grant_type: 'authorization_code',
        }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenResponse.status !== 200) {
        return {
            statusCode: tokenResponse.status,
            body: JSON.stringify(tokenData),
        };
    }

    const accessToken = tokenData.access_token;

    // Fetch the user's activities
    const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const activitiesData = await activitiesResponse.json();

    return {
        statusCode: 200,
        body: JSON.stringify(activitiesData),
    };
};
