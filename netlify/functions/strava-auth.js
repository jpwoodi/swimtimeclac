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

            return {
                accessToken: refreshData.access_token,
                refreshToken: refreshData.refresh_token,
            };
        };

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
                throw new Error('Failed to get access or refresh token');
            }

            refreshToken = tokenData.refresh_token;

            return {
                statusCode: 200,
                body: JSON.stringify(tokenData),
            };
        }

        const { accessToken } = await refreshAccessToken(refreshToken);

        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const activities = await activitiesResponse.json();

        return {
            statusCode: 200,
            body: JSON.stringify(activities),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error', details: error.message }),
        };
    }
};
