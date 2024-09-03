const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'counter.json');

exports.handler = async (event, context) => {
    let counterData;

    try {
        // Read the counter file
        counterData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        counterData = { visits: 0 };
    }

    // Increment the counter
    counterData.visits += 1;

    // Write the updated counter back to the file
    fs.writeFileSync(filePath, JSON.stringify(counterData), 'utf8');

    return {
        statusCode: 200,
        body: JSON.stringify({ visits: counterData.visits }),
    };
};
