const fetch = require("node-fetch");
const crypto = require("crypto");
const { loadTemplates } = require("../lib/templates");
const { requireSameOriginWrite, requireSiteAuth } = require("../lib/server-security");
const { buildPeriodizationPlan } = require("../lib/periodization");
const { computeGoalPaceSecondsPer100 } = require("../lib/raceSpecificSet");
const { composeTrainingBlock } = require("../lib/trainingBlockComposer");
const { cssSecondsPer100FromParts, formatSecondsToTime } = require("../lib/cssPacing");
const { getAccessToken, fetchActivityLaps, buildRateLimitMessage, getNextQuarterHourIso } = require("../lib/strava");
const {
  buildTrainingBlockSnapshot,
  readActiveTrainingBlock,
  writeActiveTrainingBlock,
  findPrescribedSession,
  appendSessionAnalysis,
  readTrainingBlockHistory,
  archiveTrainingBlock,
  backfillActiveBlockIntoHistory,
  summarizeHistoryEntry,
  findHistoryBlockById,
  deleteTrainingBlockFromHistory,
  renameTrainingBlockInHistory,
} = require("../lib/trainingBlockSnapshot");
const { readSwimmerProfile, applyCssAdjustment } = require("../lib/swimmerProfile");
const { compareSessionToPrescription, generateAdvisorySuggestions } = require("../lib/setAnalysis");

const MAX_TEXT_CHARS = 2000;

const ACTION_HANDLERS = {
  parseGoal: handleParseGoal,
  generate: handleGenerate,
  getActiveBlock: handleGetActiveBlock,
  getProfile: handleGetProfile,
  analyzeSession: handleAnalyzeSession,
  applyAdjustment: handleApplyAdjustment,
  listBlockHistory: handleListBlockHistory,
  getBlockFromHistory: handleGetBlockFromHistory,
  deleteBlockFromHistory: handleDeleteBlockFromHistory,
  renameBlockInHistory: handleRenameBlockInHistory,
};

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  const handler = ACTION_HANDLERS[req.query.action];
  if (!handler) {
    return res.status(400).json({
      error:
        "Invalid action. Use ?action=parseGoal|generate|getActiveBlock|getProfile|analyzeSession|applyAdjustment|listBlockHistory|getBlockFromHistory|deleteBlockFromHistory|renameBlockInHistory",
    });
  }

  return handler(req, res);
};

// ---- ?action=parseGoal — free text -> structured race-goal fields (OpenAI) ----

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

async function handleParseGoal(req, res) {
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
}

// ---- ?action=generate — structured fields -> deterministic periodized plan ----

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toPositiveInt(value) {
  const n = toPositiveNumber(value);
  return n === null ? null : Math.round(n);
}

async function handleGenerate(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const body = req.body || {};

  const raceDistanceM = toPositiveNumber(body.raceDistanceM);
  const weeksUntilRace = toPositiveInt(body.weeksUntilRace);
  const sessionsPerWeek = toPositiveInt(body.sessionsPerWeek);
  const sessionDurationMin = toPositiveInt(body.sessionDurationMin);
  const cssMinutes = Number(body.cssMinutes);
  const cssSeconds = Number(body.cssSeconds);
  const targetTimeSeconds = toPositiveNumber(body.targetTimeSeconds);

  const errors = [];
  if (!raceDistanceM) errors.push("raceDistanceM must be a positive number.");
  if (!weeksUntilRace) errors.push("weeksUntilRace must be a positive integer.");
  if (!sessionsPerWeek) errors.push("sessionsPerWeek must be a positive integer.");
  if (!sessionDurationMin) errors.push("sessionDurationMin must be a positive integer.");

  const cssSecondsPer100 = cssSecondsPer100FromParts(cssMinutes, cssSeconds);
  if (cssSecondsPer100 === null) errors.push("cssMinutes/cssSeconds must describe a valid CSS pace.");

  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  let templatesData;
  try {
    templatesData = loadTemplates();
  } catch (error) {
    console.error("Template loading error:", error.message);
    return res.status(500).json({ error: "Template data not available. " + error.message });
  }

  const paceInfo = computeGoalPaceSecondsPer100({ targetTimeSeconds, raceDistanceM, cssSecondsPer100 });
  if (!paceInfo) {
    return res.status(400).json({ error: "Could not determine a goal pace from the supplied inputs." });
  }

  const periodizationPlan = buildPeriodizationPlan({ weeksUntilRace, sessionsPerWeek });

  const block = composeTrainingBlock({
    periodizationPlan,
    templatesData,
    cssMinutes,
    cssSeconds,
    cssSecondsPer100,
    sessionDurationMin,
    raceDistanceM,
    paceInfo,
  });

  const responseBody = {
    ...block,
    raceDistanceM,
    targetTimeSeconds: targetTimeSeconds || null,
    goalPace: {
      secondsPer100: Math.round(paceInfo.paceSecondsPer100),
      formatted: formatSecondsToTime(paceInfo.paceSecondsPer100),
      estimated: paceInfo.estimated,
    },
  };

  // Persisting the block is what makes ?action=analyzeSession possible later
  // (it needs to know what was actually prescribed). Best-effort: a swimmer
  // without Blob configured still gets their plan, just can't analyze
  // against it yet.
  const snapshot = buildTrainingBlockSnapshot(
    { raceDistanceM, weeksUntilRace, sessionsPerWeek, sessionDurationMin, cssMinutes, cssSeconds, targetTimeSeconds: targetTimeSeconds || null },
    responseBody
  );

  try {
    await writeActiveTrainingBlock(snapshot);
    responseBody.persisted = true;
  } catch (error) {
    console.error("Could not persist training block:", error.message);
    responseBody.persisted = false;
  }

  // Archiving is separate from (and best-effort independent of) becoming
  // the active block - every generation should be kept, not just the
  // latest, so a swimmer can look back at what an earlier plan actually
  // prescribed.
  try {
    await archiveTrainingBlock(snapshot);
  } catch (error) {
    console.error("Could not archive training block:", error.message);
  }

  res.status(200).json(responseBody);
}

// ---- ?action=getActiveBlock — the most recently generated + persisted block ----

async function handleGetActiveBlock(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res)) {
    return;
  }

  try {
    const snapshot = await readActiveTrainingBlock();
    if (!snapshot) {
      return res.status(200).json({ active: false });
    }

    // Self-heals blocks generated before archiving existed - best-effort,
    // and awaited (not fire-and-forget) so the swimmer sees it in their
    // history on this same page load rather than needing to reload once.
    try {
      await backfillActiveBlockIntoHistory(snapshot);
    } catch (error) {
      console.error("Could not backfill active block into history:", error.message);
    }

    return res.status(200).json({ active: true, ...snapshot });
  } catch (error) {
    console.error("Error reading active training block:", error.message);
    return res.status(500).json({ error: "Failed to read the active training block." });
  }
}

// ---- ?action=listBlockHistory — lightweight list of every past generated block ----

async function handleListBlockHistory(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res)) {
    return;
  }

  try {
    const history = await readTrainingBlockHistory();
    const summaries = history.map(summarizeHistoryEntry).reverse(); // most recent first
    return res.status(200).json({ blocks: summaries });
  } catch (error) {
    console.error("Error reading training block history:", error.message);
    return res.status(500).json({ error: "Failed to read training block history." });
  }
}

// ---- ?action=getBlockFromHistory — one full archived block by id ----

async function handleGetBlockFromHistory(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res)) {
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }

  try {
    const history = await readTrainingBlockHistory();
    const entry = findHistoryBlockById(history, id);
    if (!entry) {
      return res.status(404).json({ error: "No archived block found with that id." });
    }
    return res.status(200).json(entry);
  } catch (error) {
    console.error("Error reading archived training block:", error.message);
    return res.status(500).json({ error: "Failed to read the archived training block." });
  }
}

// ---- ?action=deleteBlockFromHistory — remove one archived block ----

async function handleDeleteBlockFromHistory(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const id = typeof (req.body || {}).id === "string" ? req.body.id : "";
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }

  try {
    const remaining = await deleteTrainingBlockFromHistory(id);
    return res.status(200).json({ blocks: remaining.reverse() }); // most recent first
  } catch (error) {
    console.error("Error deleting archived training block:", error.message);
    return res.status(500).json({ error: "Failed to delete the archived training block. " + error.message });
  }
}

// ---- ?action=renameBlockInHistory — set/clear a custom label on an archived block ----

async function handleRenameBlockInHistory(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const body = req.body || {};
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";

  try {
    const summary = await renameTrainingBlockInHistory(id, label);
    return res.status(200).json({ block: summary });
  } catch (error) {
    console.error("Error renaming archived training block:", error.message);
    const status = /no archived block/i.test(error.message) ? 404 : 500;
    return res.status(status).json({ error: error.message });
  }
}

// ---- ?action=getProfile — persisted swimmer CSS baseline, for pre-filling the form ----

async function handleGetProfile(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res)) {
    return;
  }

  try {
    const profile = await readSwimmerProfile();
    return res.status(200).json({ profile });
  } catch (error) {
    console.error("Error reading swimmer profile:", error.message);
    return res.status(500).json({ error: "Failed to read the swimmer profile." });
  }
}

// ---- ?action=analyzeSession — compare a recorded Strava swim to what was prescribed ----

function toPositiveIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

async function handleAnalyzeSession(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const body = req.body || {};
  const weekNumber = toPositiveIntOrNull(body.weekNumber);
  const session = toPositiveIntOrNull(body.session);
  const stravaActivityId = body.stravaActivityId;

  if (!weekNumber || !session || !stravaActivityId) {
    return res.status(400).json({ error: "weekNumber, session, and stravaActivityId are required." });
  }

  let activeBlock;
  try {
    activeBlock = await readActiveTrainingBlock();
  } catch (error) {
    console.error("Error reading active training block:", error.message);
    return res.status(500).json({ error: "Failed to read the active training block." });
  }

  if (!activeBlock) {
    return res.status(404).json({ error: "No active training block. Generate one first." });
  }

  const prescribedSession = findPrescribedSession(activeBlock, weekNumber, session);
  if (!prescribedSession) {
    return res.status(404).json({ error: `Week ${weekNumber} Session ${session} was not found in the active block.` });
  }

  const cssSecondsPer100 = cssSecondsPer100FromParts(activeBlock.input?.cssMinutes, activeBlock.input?.cssSeconds);

  let rawLaps;
  try {
    const accessToken = await getAccessToken();
    rawLaps = await fetchActivityLaps(accessToken, stravaActivityId);
  } catch (error) {
    console.error("Error fetching Strava laps:", error.message);
    if (error && error.code === "STRAVA_RATE_LIMIT") {
      res.setHeader("Retry-After", new Date(getNextQuarterHourIso()).toUTCString());
      return res.status(429).json({ error: buildRateLimitMessage() });
    }
    return res.status(502).json({ error: "Failed to fetch lap data from Strava for that activity." });
  }

  const comparison = compareSessionToPrescription({ rawStravaLaps: rawLaps, prescribedSession, cssSecondsPer100 });
  const suggestions = generateAdvisorySuggestions(comparison, {
    cssSecondsPer100,
    raceDistanceM: toPositiveNumber(activeBlock.input?.raceDistanceM),
  });

  const analysisRecord = {
    id: crypto.randomUUID(),
    weekNumber,
    session,
    stravaActivityId,
    analyzedAt: new Date().toISOString(),
    comparison,
    suggestions,
  };

  try {
    await appendSessionAnalysis(analysisRecord);
  } catch (error) {
    // The analysis itself is still useful even if it couldn't be saved —
    // return it, just flag that it won't be there on next page load.
    console.error("Could not persist session analysis:", error.message);
    analysisRecord.persisted = false;
    return res.status(200).json(analysisRecord);
  }

  analysisRecord.persisted = true;
  res.status(200).json(analysisRecord);
}

// ---- ?action=applyAdjustment — write an advisory suggestion into the swimmer profile ----

async function handleApplyAdjustment(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const body = req.body || {};
  if (body.type !== "updateCss") {
    return res.status(400).json({ error: "Only type='updateCss' adjustments are supported." });
  }

  const cssMinutes = Number(body.cssMinutes);
  const cssSeconds = Number(body.cssSeconds);

  if (cssSecondsPer100FromParts(cssMinutes, cssSeconds) === null || cssMinutes > 10) {
    return res.status(400).json({ error: "cssMinutes/cssSeconds must describe a valid CSS pace." });
  }

  try {
    const profile = await applyCssAdjustment({
      cssMinutes,
      cssSeconds,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
    });
    res.status(200).json({ profile });
  } catch (error) {
    console.error("Could not apply adjustment:", error.message);
    res.status(500).json({ error: "Failed to save the adjustment. " + error.message });
  }
}
