const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_TOKEN;

    const url = `https://api.airtable.com/v0/${baseId}/your_table_name`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    return {
        statusCode: 200,
        body: JSON.stringify(data)
    };
};
