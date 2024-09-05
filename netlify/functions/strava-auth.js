const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    let accessToken = process.env.ACCESS_TOKEN_STRAVA;
    let refreshToken = process.env.REFRESH_TOKEN_STRAVA;

    try {
        // Function to refresh access token if expired
        const refreshAccessToken = async () => {
            console.log('Refreshing access token...');
            const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
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

            const refreshData = await refreshResponse.json();

            if (!refreshData.access_token) {
                throw new Error('Failed to refresh access token');
            }

            // Update tokens in your environment (you might store them in a DB or some external storage)
            accessToken = refreshData.access_token;
            refreshToken = refreshData.refresh_token;

            console.log('New access token:', accessToken);
            console.log('New refresh token:', refreshToken);

            // Optionally update your environment variables (or use an external storage for this)
            // Process environment variables can't be updated at runtime in Netlify
            // You could write these tokens to a database or a secure storage solution
        };

        // Fetch swim activities
        const fetchActivities = async () => {
            const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            const activities = await activitiesResponse.json();

            if (activities.errors) {
                throw new Error('Authorization error: Missing read permissions.');
            }

            // Filter for swim activities
            const swimActivities = activities.filter(activity => activity.type === 'Swim');

            return swimActivities;
        };

        // First, try to fetch activities using the current access token
        let activities;
        try {
            activities = await fetchActivities();
        } catch (error) {
            console.log('Access token might be expired, trying to refresh...');
            // Refresh access token and retry fetching activities
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
