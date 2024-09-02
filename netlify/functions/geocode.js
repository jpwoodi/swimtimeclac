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

        if (!response.ok) {
            console.error(`Failed to fetch from ${apiUrl}: ${response.statusText}`);
            throw new Error(`Error fetching data: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
        });

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch data' })
        };
    }
};
