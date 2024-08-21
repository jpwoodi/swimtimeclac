const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const { goal, css, duration, sessions, sessionDuration } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;  // Ensure you set this in your environment variables

    const messages = [
        {
            role: "system",
            content: "You are a swim coach who creates detailed and personalized swim plans."
        },
        {
            role: "user",
            content: `Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${css} m/s. Their goal is to ${goal}. The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes.`
        }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 2000,  // Adjust this based on the expected length of the response
            temperature: 0.7
        })
    });

    const data = await response.json();

    if (response.ok) {
        return {
            statusCode: 200,
            body: JSON.stringify({ plan: data.choices[0].message.content.trim().split('\n\n') }) // Splitting into weeks based on double new lines
        };
    } else {
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: data.error.message })
        };
    }
};
