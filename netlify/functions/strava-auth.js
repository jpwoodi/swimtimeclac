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
        let refreshToken = process.env.REFRESH_TOKEN_STRAVA; // Existing refresh token

        // Function to exchange authorization code for access and refresh tokens
        const exchangeCodeForTokens = async (code) => {
            console.log('Exchanging authorization code for tokens...');
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
            console.log('Token exchange response:', tokenData); // Log full response, including scope

            if (!tokenData.access_token || !tokenData.refresh_token) {
                throw new Error('Failed to get access or refresh token');
            }

            return tokenData; // Contains access token, refresh token, etc.
        };

        // Function to refresh access token using the refresh token
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
            console.log('Refresh token response:', refreshData); // Log full response

            if (!refreshData.access_token) {
                throw new Error('Failed to refresh access token');
            }

            return {
                accessToken: refreshData.access_token,
                refreshToken: refreshData.refresh_token,
            };
        };

        // Step 1: If there's no refresh token, exchange the authorization code for tokens
        if (!refreshToken) {
            console.log('No refresh token found. Exchanging authorization code...');
            const tokenData = await exchangeCodeForTokens(code);

            // Store refresh token for future use (save it securely)
            refreshToken = tokenData.refresh_token;

            return {
                statusCode: 200,
                body: JSON.stringify(tokenData), // Send back access token, refresh token, etc.
            };
        }

        // Step 2: If refresh token exists, use it to get a new access token
        const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(refreshToken);

        // (Optional) You can now save the new refresh token for future use (if it changes)
        refreshToken = newRefreshToken;

        // Step 3: Fetch activities using the new access token
        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const activities = await activitiesResponse.json();
        console.log('Fetched activities:', activities); // Log the activities response

        if (activities.errors) {
            throw new Error('Authorization error: Missing read permissions.');
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
