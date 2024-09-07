const fetch = require('node-fetch');

// Helper function to refresh the access token
const refreshAccessToken = async () => {
    const clientId = process.env.CLIENT_ID_STRAVA;
    const clientSecret = process.env.CLIENT_SECRET_STRAVA;
    const refreshToken = process.env.REFRESH_TOKEN_STRAVA;

    const response = await fetch(`https://www.strava.com/api/v3/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    const data = await response.json();

    if (response.ok) {
        // Update environment variables or return new access token
        process.env.ACCESS_TOKEN_STRAVA = data.access_token;
        process.env.REFRESH_TOKEN_STRAVA = data.refresh_token;
        return data.access_token;
    } else {
        throw new Error(`Failed to refresh access token: ${data.message}`);
    }
};

// Main function to fetch activities
exports.handler = async (event, context) => {
    let accessToken = process.env.ACCESS_TOKEN_STRAVA;

    try {
        // Refresh the access token if needed
        accessToken = await refreshAccessToken();

        // Fetch activities from Strava
        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const activities = await activitiesResponse.json();

        if (activities.errors) {
            console.error('Strava API returned errors:', activities.errors);
            throw new Error('Authorization error: Invalid access token or permissions.');
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
