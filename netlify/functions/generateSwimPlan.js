require('dotenv').config();

exports.handler = async function(event) {
  try {
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

    const messages = conversationHistory ? conversationHistory.slice(-4) : [];

    if (cssMinutes && cssSeconds && duration && sessions && sessionDuration) {
      const prompt = `Create a structured swim plan with these details:
      - CSS: ${cssMinutes}m ${cssSeconds}s per 100m
      - Goal: ${goal}
      - Duration: ${duration} weeks
      - Sessions per week: ${sessions}
      - Session Duration: ${sessionDuration} mins

      Always include:
      - Warm-up: 300m free, 100m pull
      - Cool down: 100m free
      - Clearly defined build and main sets
      - Equipment: specify use of pull buoy, fins, kickboard

      Format response as Markdown table (Columns: Week, Session, Warm-up, Build, Main Set, Cool Down, Total Distance). Always use metres.`;

      messages.push({ role: "user", content: prompt });
    }

    if (comments) {
      messages.push({ role: "user", content: comments });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages,
        temperature: 0.5
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error.message || 'OpenAI API request failed');
    }

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        response: data.choices[0].message.content.trim(),
        usage: data.usage
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
