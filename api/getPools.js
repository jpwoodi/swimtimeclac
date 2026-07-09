const fetch = require('node-fetch');
const { requireSiteAuth } = require('../lib/server-security');

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
let cached = null;
let cacheTimestamp = null;

// Airtable returns at most 100 records per request; follow the offset
// token until the table is exhausted.
async function fetchAllPoolRecords(baseId, token, tableName) {
    const records = [];
    let offset;

    do {
        const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableName}`);
        if (offset) url.searchParams.set('offset', offset);

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = new Error(`Airtable request failed: ${response.statusText}`);
            error.status = response.status;
            throw error;
        }

        const data = await response.json();
        records.push(...(data.records || []));
        offset = data.offset;
    } while (offset);

    return records;
}

module.exports = async (req, res) => {
    if (!requireSiteAuth(req, res)) {
        return;
    }

    const now = Date.now();
    const forceRefresh = req.query?.refresh === 'true';

    if (!forceRefresh && cached && cacheTimestamp !== null && now - cacheTimestamp < CACHE_DURATION) {
        return res.status(200).json(cached);
    }

    try {
        const records = await fetchAllPoolRecords(
            process.env.AIRTABLE_BASE_ID,
            process.env.AIRTABLE_TOKEN,
            'SwimmingPools'
        );

        cached = { records };
        cacheTimestamp = now;
        res.status(200).json(cached);
    } catch (error) {
        console.error('Error fetching pools:', error);
        if (cached) {
            return res.status(200).json(cached);
        }
        res.status(error.status || 500).json({ error: 'Failed to fetch pool data' });
    }
};
