const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    let accessToken = process.env.ACCESS_TOKEN_STRAVA;
    let refreshToken = process.env.REFRESH_TOKEN_STRAVA;

    const refreshAccessToken = async () => {
        const response = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        const data = await response.json();
        if (!data.access_token) {
            throw new Error('Failed to refresh access token');
        }

        // Update the tokens (optional: store the new refresh token securely)
        accessToken = data.access_token;
        refreshToken = data.refresh_token;

        return accessToken;
    };

    try {
        // Fetch activities using the access token
        const fetchActivities = async () => {
            const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            const activities = await activitiesResponse.json();

            if (activities.errors) {
                console.log('Authorization error:', activities);
                throw new Error('Authorization error: Missing read permissions.');
            }

            // Filter for swim activities
            const swimActivities = activities.filter(activity => activity.type === 'Swim');
            return swimActivities;
        };

        // Try fetching activities; if the token is expired, refresh it
        let activities = await fetchActivities();
        if (activities.message === 'Authorization Error') {
            await refreshAccessToken();
            activities = await fetchActivities();
        }

        return {
            statusCode: 200,
            body: JSON.stringify(activities),
        };
    } catch (error) {
        console.error('Error fetching activities:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error', details: error.message }),
        };
    }
};
