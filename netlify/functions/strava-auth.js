const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
    const CLIENT_SECRET = process.env.CLIENT_SECRET_STRAVA;
    const ACCESS_TOKEN = process.env.ACCESS_TOKEN_STRAVA; // Directly use the access token

    try {
        // Fetch activities using the stored access token
        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
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
    } catch (error) {
        console.error('Error fetching activities:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server error', details: error.message }),
        };
    }
};
