const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const address = event.queryStringParameters.q;

    if (!address) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Address query parameter is required' })
        };
    }

    const apiUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch data' })
        };
    }
};
