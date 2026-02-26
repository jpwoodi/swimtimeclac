const fetch = require('node-fetch');

module.exports = async (req, res) => {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_TOKEN;
    const tableName = 'SwimmingPools';

    const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Failed to fetch data: ${response.statusText}`
            });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching pools:', error);
        res.status(500).json({ error: 'Failed to fetch pool data' });
    }
};
