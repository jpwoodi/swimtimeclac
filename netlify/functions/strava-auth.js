const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const accessToken = process.env.ACCESS_TOKEN_STRAVA; // Access token from your environment variables

    try {
        // Fetch swim activities using the access token
        const activitiesResponse = await fetch('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const activities = await activitiesResponse.json();

        if (activities.errors) {
            console.error('Authorization error:', activities);
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
