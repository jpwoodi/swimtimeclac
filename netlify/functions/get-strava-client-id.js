exports.handler = async (event, context) => {
    const clientId = process.env.CLIENT_ID_STRAVA;

    return {
        statusCode: 200,
        body: JSON.stringify({ clientId }),
    };
};
