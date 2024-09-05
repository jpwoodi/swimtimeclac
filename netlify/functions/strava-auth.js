const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    const REDIRECT_URI = process.env.REDIRECT_URI_STRAVA;

    const code = event.queryStringParameters.code;
    let refreshToken = process.env.REFRESH_TOKEN_STRAVA; // Store the refresh token in environment variables or securely elsewhere

    if (!code && !refreshToken) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing authorization code and refresh token' }),
        };
    }

    try {
        // If there is no refresh token, exchange the authorization code for access/refresh tokens
        if (!refreshToken) {
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
            if (!tokenData.access_token || !tokenData.refresh_token) {
                throw new Error('Failed to obtain access or refresh token');
            }

            refreshToken = tokenData.refresh_token; // Store this for future use

            // Use the access token to fetch activities
            return await fetchActivities(tokenData.access_token);
        } else {
            // If we already have a refresh token, use it to get a new access token
            return await refreshAccessTokenAndFetchActivities(refreshToken);
        }

    } catch (error) {
        console.error('Error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error', details: error.message }),
        };
    }
};

// Function to fetch activities using an access token
async function fetchActivities(accessToken) {
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
}

// Function to refresh the access token using the refresh token
async function refreshAccessTokenAndFetchActivities(refreshToken) {
    const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: process.env.CLIENT_ID_STRAVA,
            client_secret: process.env.CLIENT_SECRET_STRAVA,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    const refreshData = await refreshResponse.json();
    if (!refreshData.access_token) {
        throw new Error('Failed to refresh access token');
    }

    // Use the new access token to fetch activities
    return await fetchActivities(refreshData.access_token);
}
