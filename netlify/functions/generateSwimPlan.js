const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const {
        goal,
        cssMinutes,
        cssSeconds,
        duration,
        sessions,
        sessionDuration,
        comments,
        conversationHistory
    } = JSON.parse(event.body);

    const apiKey = process.env.OPENAI_API_KEY;

    let messages = [
        {
            role: "system",
            content: "You are a swim coach who creates detailed and personalized swim plans."
        },
        ...(conversationHistory || [])
    ];

    // If initial parameters are provided, construct the initial message
    if (goal && cssMinutes && cssSeconds && duration && sessions && sessionDuration) {
        const cssTime = `${cssMinutes} minutes ${cssSeconds} seconds per 100m`;

        const initialMessage = {
            role: "user",
            content: 'Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${cssTime}. Their goal is to ${goal}. The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes. Make sure that each week includes a mix of speed training and distance building and use the CSS to inform pacing. Pull from actual sets that include warm-up (make it 300 free and 100 pull always), build, main, and cool down (100 free always), and specify equipment such as pullbuoys, kickboards, and fins where applicable. Format the output as a Markdown table with the following columns: "Week", "Session Number", "Warm Up", "Build Set", "Main Set", "Cool Down", and "Total Distance.'
        };

        messages.push(initialMessage);
    }

    // If there is user feedback (comment), add it to the messages
    if (comments) {
        const feedbackMessage = {
            role: "user",
            content: comments
        };
        messages.push(feedbackMessage);
    }

    // Send the conversation to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 4096,
            temperature: 0.7
        })
    });

    const data = await response.json();

    if (response.ok) {
        const assistantMessage = {
            role: "assistant",
            content: data.choices[0].message.content.trim()
        };

        return {
            statusCode: 200,
            body: JSON.stringify({
                plan: assistantMessage.content,
                conversationHistory: [...messages, assistantMessage]
            })
        };
    } else {
        console.error('OpenAI API error:', data.error);
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: data.error.message })
        };
    }
};
