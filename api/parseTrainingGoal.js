const fetch = require("node-fetch");
const { requireSameOriginWrite, requireSiteAuth } = require("../lib/server-security");

const MAX_TEXT_CHARS = 2000;

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableInt(value) {
  const n = toNullableNumber(value);
  return n === null ? null : Math.round(n);
}

function toNullableBool(value) {
  if (typeof value === "boolean") return value;
  return null;
}

// Coerce and bound whatever the model returned into safe, typed fields.
// Anything malformed or out of a sane range comes back as null rather than
// being trusted verbatim.
function sanitizeExtractedGoal(raw) {
  const fields = raw && typeof raw === "object" ? raw : {};

  const raceDistanceM = toNullableNumber(fields.raceDistanceM);
  const weeksUntilRace = toNullableInt(fields.weeksUntilRace);
  const targetTimeSeconds = toNullableNumber(fields.targetTimeSeconds);
  const cssMinutes = toNullableInt(fields.cssMinutes);
  const cssSeconds = toNullableInt(fields.cssSeconds);
  const sessionsPerWeek = toNullableInt(fields.sessionsPerWeek);
  const sessionDurationMin = toNullableInt(fields.sessionDurationMinutes ?? fields.sessionDurationMin);

  return {
    raceName: typeof fields.raceName === "string" ? fields.raceName.slice(0, 200) : null,
    raceDistanceM: raceDistanceM !== null && raceDistanceM > 0 && raceDistanceM <= 100000 ? raceDistanceM : null,
    weeksUntilRace: weeksUntilRace !== null && weeksUntilRace >= 1 && weeksUntilRace <= 104 ? weeksUntilRace : null,
    targetTimeSeconds: targetTimeSeconds !== null && targetTimeSeconds > 0 && targetTimeSeconds <= 172800 ? targetTimeSeconds : null,
    cssMinutes: cssMinutes !== null && cssMinutes >= 0 && cssMinutes <= 10 ? cssMinutes : null,
    cssSeconds: cssSeconds !== null && cssSeconds >= 0 && cssSeconds <= 59 ? cssSeconds : null,
    sessionsPerWeek: sessionsPerWeek !== null && sessionsPerWeek >= 1 && sessionsPerWeek <= 14 ? sessionsPerWeek : null,
    sessionDurationMin: sessionDurationMin !== null && sessionDurationMin >= 15 && sessionDurationMin <= 240 ? sessionDurationMin : null,
    openWater: toNullableBool(fields.openWater),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const body = req.body || {};
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ error: "Request must include a non-empty 'text' field." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  const boundedText = text.slice(0, MAX_TEXT_CHARS);
  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `You extract structured swim race-goal data from a swimmer's free-text description. Today's date is ${today}.

Return a JSON object with exactly these keys (use null for anything not stated or not inferable — do not guess wildly):
- "raceName": string or null — the race's name if mentioned
- "raceDistanceM": number or null — race distance in METRES. Convert common phrasings: "10k"/"10km" -> 10000, "5k" -> 5000, "1 mile" -> 1609, "1500m" -> 1500. If the distance is ambiguous, use null.
- "weeksUntilRace": integer or null — whole weeks between today (${today}) and the race date. Resolve relative phrases ("in 2 months" -> ~8, "6 weeks from now" -> 6) and explicit dates against today's date.
- "targetTimeSeconds": number or null — the swimmer's target finishing time, in seconds. Convert "3:30:00" -> 12600, "90 minutes" -> 5400, "2.5 hours" -> 9000.
- "cssMinutes": integer or null, "cssSeconds": integer or null — the swimmer's Critical Swim Speed per 100m, if mentioned (e.g. "CSS is 1:35" -> cssMinutes=1, cssSeconds=35).
- "sessionsPerWeek": integer or null — how many swim sessions per week they can do, if mentioned.
- "sessionDurationMinutes": integer or null — typical session length in minutes, if mentioned.
- "openWater": boolean or null — true if clearly an open water/lake/sea/river race, false if clearly a pool race, null if unclear.

Respond with ONLY the JSON object, no markdown, no prose.`;

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: boundedText },
        ],
        max_tokens: 500,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    console.error("OpenAI request failed:", error.message);
    return res.status(502).json({ error: "Failed to reach OpenAI API." });
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const apiError = data && data.error && data.error.message ? data.error.message : "OpenAI request failed.";
    console.error("OpenAI API error:", apiError);
    return res.status(response.status).json({ error: apiError });
  }

  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
      ? data.choices[0].message.content.trim()
      : "";

  if (!content) {
    return res.status(502).json({ error: "OpenAI returned an empty response." });
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse goal extraction JSON:", error.message);
    return res.status(502).json({ error: "Could not parse the extracted goal." });
  }

  res.status(200).json({ fields: sanitizeExtractedGoal(parsed) });
};
