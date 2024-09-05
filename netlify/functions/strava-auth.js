// /.netlify/functions/strava-auth.js
const fetch = require('node-fetch');

const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;

async function getAccessToken(refreshToken) {
    // Exchange refresh token for a new access token
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }),
    });

    const tokenData = await tokenResponse.json();
    return tokenData;
}

exports.handler = async function(event, context) {
    const code = event.queryStringParameters.code;

    if (code) {
        // If code is present, exchange it for an access token and refresh token
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

        // Return access token, refresh token, and expiration data to the client
        return {
            statusCode: 200,
            body: JSON.stringify({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: tokenData.expires_at, // UNIX timestamp for when the token expires
            }),
        };
    }

    const refreshToken = event.queryStringParameters.refresh_token;
    if (refreshToken) {
        // Use the refresh token to get a new access token
        const tokenData = await getAccessToken(refreshToken);

        // Return the new tokens to the client
        return {
            statusCode: 200,
            body: JSON.stringify({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: tokenData.expires_at,
            }),
        };
    }

    return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing authorization code or refresh token' }),
    };
};
