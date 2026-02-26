const fetch = require('node-fetch');

module.exports = async (req, res) => {
    console.log('Function triggered');

    const address = req.query.q;

    if (!address) {
        return res.status(400).json({ error: 'Address query parameter is required' });
    }

    const apiUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;

    try {
        const response = await fetch(apiUrl);

        if (!response.ok) {
            console.error(`Failed to fetch from ${apiUrl}: ${response.statusText}`);
            throw new Error(`Error fetching data: ${response.statusText}`);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
        });

        res.status(500).json({ error: 'Failed to fetch data' });
    }
};
