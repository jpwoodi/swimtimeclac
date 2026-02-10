const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load templates from JSON file
function loadTemplates() {
    const templatesPath = path.join(__dirname, '..', '..', 'data', 'templates.v1.json');

    if (!fs.existsSync(templatesPath)) {
        throw new Error('Templates file not found. Please run the ingestion script: npm run ingest-templates');
    }

    const rawData = fs.readFileSync(templatesPath, 'utf-8');
    return JSON.parse(rawData);
}

// Build template block for prompt
function buildTemplateBlock(templatesData) {
    if (!templatesData.templates || templatesData.templates.length === 0) {
        return '';
    }

    let block = '\n\n## REAL SWIM PLAN TEMPLATES\n\n';
    block += 'Use the following real masters swim plans as structural templates. Reuse and adapt these set structures rather than inventing wholly new patterns:\n\n';

    templatesData.templates.forEach(template => {
        block += `### ${template.plan_type_label} (from ${template.source_file})\n`;
        block += `Type: ${template.plan_type_key}\n\n`;
        block += template.raw_text;
        block += '\n\n---\n\n';
    });

    return block;
}

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    let parsed;
    try {
        parsed = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const {
        goal,
        cssMinutes,
        cssSeconds,
        duration,
        sessions,
        sessionDuration,
        comments,
        conversationHistory
    } = parsed;

    const apiKey = process.env.OPENAI_API_KEY;

    // Load templates
    let templatesData;
    let templateBlock = '';
    try {
        templatesData = loadTemplates();
        templateBlock = buildTemplateBlock(templatesData);
    } catch (error) {
        console.error('Template loading error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Template data not available. ' + error.message
            })
        };
    }

    let messages = [
        {
            role: "system",
            content: "You are a swim coach who creates detailed and personalized swim plans based on real masters swim training templates."
        },
        ...(conversationHistory || [])
    ];

    // If initial parameters are provided, construct the initial message
    if (goal && cssMinutes && cssSeconds && duration && sessions && sessionDuration) {
        const cssTime = `${cssMinutes} minutes ${cssSeconds} seconds per 100m`;

        const initialMessage = {
            role: "user",
            content: `Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${cssTime}. Their goal is to ${goal}. The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes.

IMPORTANT INSTRUCTIONS:
- Use the 4 session types each week: Mileage (distance), IM (strokes), Fast (speed), Kitchen Sink (mixed)
- Reuse and adapt structures from the templates below - do NOT invent wholly new set structures unless absolutely necessary
- Keep warm-up FIXED to "300 free + 100 pull" always
- Keep cool-down FIXED to "100 free" always
- Use the CSS to inform pacing for intervals
- Specify equipment (pull buoys, kickboards, fins) where applicable
- Always use metres
- Format output as a Markdown table ONLY with columns: Week | Session Number | Warm Up | Build Set | Main Set | Cool Down | Total Distance
- Do NOT include any additional text outside the table

${templateBlock}`
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
            model: 'gpt-4o-mini',
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
