const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const { goal, cssMinutes, cssSeconds, duration, sessions, sessionDuration, comments, conversationHistory } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;  // Ensure you set this in your environment variables

    // Construct the base message for the initial swim plan request
    const cssTime = `${cssMinutes} minutes ${cssSeconds} seconds per 100m`;

    const initialMessage = {
        role: "user",
        content: `Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${cssTime}. Their goal is to ${goal}. The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes. Please include drills in the Build Set and vary the skills across sessions. Format the output as a Markdown table with the following columns: "Week", "Session Number", "Warm Up", "Build Set", "Main Set", "Cool Down", and "Total Distance".`
    };

    const feedbackMessage = comments ? {
        role: "user",
        content: comments  // User feedback (e.g., "Make the sessions longer")
    } : null;

    // Create the conversation history
    const messages = [
        { role: "system", content: "You are a swim coach who creates detailed and personalized swim plans." },
        ...(conversationHistory || []),  // Include the previous conversation if it exists
        initialMessage,
    ];

    if (feedbackMessage) {
        messages.push(feedbackMessage);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 1500,
            temperature: 0.7
        })
    });

    const data = await response.json();

    if (response.ok) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                plan: data.choices[0].message.content.trim(),  // The updated swim plan
                conversationHistory: [...messages, { role: "assistant", content: data.choices[0].message.content.trim() }]  // Append new message to conversation history
            })
        };
    } else {
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: data.error.message })
        };
    }
};
