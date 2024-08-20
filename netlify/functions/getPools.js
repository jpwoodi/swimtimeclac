const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const baseId = process.env.AIRTABLE_BASE_ID; // Your Airtable Base ID
    const token = process.env.AIRTABLE_TOKEN;    // Ensure this is set in your Netlify environment variables
    const tableName = 'SwimmingPools';           // Your Airtable Table Name

    // Construct the URL with the base ID and table name
    const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`   // Use the Personal Access Token here
        }
    });

    if (!response.ok) {
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: `Failed to fetch data: ${response.statusText}` }),
        };
    }

    const data = await response.json();

    return {
        statusCode: 200,
        body: JSON.stringify(data)
    };
};
