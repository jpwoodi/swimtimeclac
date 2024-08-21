const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const { goal, cssMinutes, cssSeconds, duration, sessions, sessionDuration } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;  // Ensure you set this in your environment variables

    const cssTime = `${cssMinutes} minutes ${cssSeconds} seconds per 100m`;

    const messages = [
        {
            role: "system",
            content: "You are a swim coach who creates detailed and personalized swim plans."
        },
        {
            role: "user",
            content: `Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${cssTime}. Their goal is to ${goal}. The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes. Please include drills in the Build Set and vary the skills across sessions. Format the output as a table with the following headers: "Session Number", "Warm Up", "Build Set", "Main Set", "Cool Down", and "Total Distance".`
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
            max_tokens: 1000,  // Adjust based on the expected length of the response
            temperature: 0.7
        })
    });

    const data = await response.json();

    if (response.ok) {
        return {
            statusCode: 200,
            body: JSON.stringify({ plan: data.choices[0].message.content.trim() })
        };
    } else {
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: data.error.message })
        };
    }
};
