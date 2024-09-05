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
        let refreshToken = process.env.REFRESH_TOKEN_STRAVA;

        // Function to refresh access token using refresh token
        const refreshAccessToken = async (refreshToken) => {
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
            console.log('Refresh token response:', refreshData);

            if (!refreshData.access_token) {
                throw new Error('Failed to refresh access token');
            }

            return {
                accessToken: refreshData.access_token,
                refreshToken: refreshData.refresh_token,
            };
        };

        // If no refresh token exists, exchange the authorization code for access/refresh tokens
        if (!refreshToken) {
            console.log('No refresh token found, fetching new tokens...');
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
            console.log('Token response:', tokenData);

            if (!tokenData.access_token || !tokenData.refresh_token) {
                throw new Error('Failed to get access or refresh token');
            }

            refreshToken = tokenData.refresh_token;

            return {
                statusCode: 200,
                body: JSON.stringify(tokenData),
            };
        }

        const { accessToken } = await refreshAccessToken(refreshToken);

        // Fetch activities using the new access token
        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const activities = await activitiesResponse.json();

        // Log the fetched activities for debugging purposes
        console.log('Fetched activities:', activities);

        // Filter out only swim activities
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
