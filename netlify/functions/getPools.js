const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_TOKEN;

    const url = `https://api.airtable.com/v0/${baseId}/SwimmingPools`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    console.log('Airtable response:', JSON.stringify(data, null, 2)); // Log the response to check its structure

    return {
        statusCode: 200,
        body: JSON.stringify(data)
    };
};
