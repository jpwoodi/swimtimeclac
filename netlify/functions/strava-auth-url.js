// /.netlify/functions/strava-auth-url.js
const CLIENT_ID = process.env.CLIENT_ID_STRAVA;
const REDIRECT_URI = process.env.REDIRECT_URI_STRAVA;

exports.handler = async function(event, context) {
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=activity:read_all`;
    
    return {
        statusCode: 200,
        body: JSON.stringify({ authUrl }),
    };
};
