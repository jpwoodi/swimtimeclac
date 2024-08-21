const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const { goal, experience, sessions, duration } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;  // Ensure you set this in your environment variables

    const prompt = `Create a swim plan for a ${experience} swimmer whose goal is to ${goal}. They will swim ${sessions} times per week, with each session lasting ${duration} minutes.`;

    const response = await fetch('https://api.openai.com/v1/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 150,
            temperature: 0.7
        })
    });

    const data = await response.json();

    if (response.ok) {
        return {
            statusCode: 200,
            body: JSON.stringify({ plan: data.choices[0].text.trim() })
        };
    } else {
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: data.error.message })
        };
    }
};
