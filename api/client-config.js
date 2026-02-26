module.exports = async (req, res) => {
    const clientId = process.env.CLIENT_ID_STRAVA;
    const redirectUri = process.env.REDIRECT_URI_STRAVA;

    res.status(200).json({ clientId, redirectUri });
};
