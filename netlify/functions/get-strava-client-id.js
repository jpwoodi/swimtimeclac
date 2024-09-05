exports.handler = async (event, context) => {
    const clientId = process.env.CLIENT_ID_STRAVA;
    const redirectUri = process.env.REDIRECT_URI_STRAVA; // Make sure this is set

    return {
        statusCode: 200,
        body: JSON.stringify({ clientId, redirectUri }),
    };
};
