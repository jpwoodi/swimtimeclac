const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    const REDIRECT_URI = process.env.REDIRECT_URI_STRAVA;

    const code = event.queryStringParameters.code;
    let refreshToken = process.env.REFRESH_TOKEN_STRAVA; // Assuming you store it in the environment

    if (!code && !refreshToken) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing authorization code and refresh token' }),
        };
    }

    try {
        if (!refreshToken) {
            console.log('No refresh token found, exchanging authorization code...');
            return await exchangeAuthCodeForTokens(code, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
        } else {
            console.log('Using refresh token to get new access token...');
            return await refreshAccessTokenAndFetchActivities(refreshToken, CLIENT_ID, CLIENT_SECRET);
        }
    } catch (error) {
        console.error('Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error', details: error.message }),
        };
    }
};

// Function to exchange authorization code for access/refresh tokens
async function exchangeAuthCodeForTokens(code, clientId, clientSecret, redirectUri) {
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
    });

    const tokenData = await tokenResponse.json();
    console.log('Token exchange response:', tokenData); // Log the response for debugging

    if (!tokenData.access_token || !tokenData.refresh_token) {
        throw new Error('Failed to obtain access or refresh token');
    }

    refreshToken = tokenData.refresh_token; // You should securely store this refresh token for later use

    return await fetchActivities(tokenData.access_token);
}

// Function to fetch activities using an access token
async function fetchActivities(accessToken) {
    const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    const activities = await activitiesResponse.json();
    console.log('Fetched activities:', activities); // Log the response for debugging

    if (activities.errors) {
        throw new Error('Authorization error: Missing read permissions.');
    }

    // Filter for swim activities
    const swimActivities = activities.filter(activity => activity.type === 'Swim');

    return {
        statusCode: 200,
        body: JSON.stringify(swimActivities),
    };
}

// Function to refresh the access token using the refresh token
async function refreshAccessTokenAndFetchActivities(refreshToken, clientId, clientSecret) {
    const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    const refreshData = await refreshResponse.json();
    console.log('Refresh token response:', refreshData); // Log the full refresh token response for debugging

    if (!refreshData.access_token) {
        throw new Error('Failed to refresh access token');
    }

    return await fetchActivities(refreshData.access_token);
}
