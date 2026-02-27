const fetch = require("node-fetch");
const { loadTemplates } = require("./lib/templates");

const TEMPLATE_TYPES = ["mileage", "im", "fast", "kitchen_sink"];
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "you",
  "are", "per", "week", "weeks", "session", "sessions", "swim", "plan", "make",
  "more", "less", "about", "goal", "minutes", "minute", "each", "their", "them",
  "please", "want", "need", "like", "then", "than", "have", "has", "had", "will",
  "would", "could", "should", "very", "also", "just", "some", "over", "under"
]);
const TYPE_HINTS = {
  mileage: ["endurance", "aerobic", "volume", "distance", "base", "stamina"],
  im: ["im", "medley", "stroke", "strokes", "butterfly", "backstroke", "breaststroke"],
  fast: ["speed", "fast", "sprint", "anaerobic", "pace", "threshold", "race"],
  kitchen_sink: ["mixed", "variety", "technique", "drill", "skills", "combo"],
};
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 3000;
const MIN_PER_TYPE = 2;
const MAX_PER_TYPE = 6;
const MAX_TEMPLATE_LINES = 40;
const MAX_TEMPLATE_CHARS = 2500;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calcTemplatesPerType(weeks, sessionsPerWeek) {
  const w = toNumber(weeks);
  const s = toNumber(sessionsPerWeek);
  if (!w || !s || w <= 0 || s <= 0) return MIN_PER_TYPE;
  return Math.max(MIN_PER_TYPE, Math.min(MAX_PER_TYPE, Math.ceil((w * s) / 4)));
}

function toLowerSet(values) {
  return new Set((values || []).map((value) => String(value).toLowerCase()));
}

function tokenizeGoal(goalText) {
  const tokens = String(goalText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length >= 3 && !STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

function preferredTypesFromGoal(goalTokens) {
  const preferred = new Set();
  const tokenSet = toLowerSet(goalTokens);

  for (const [type, hints] of Object.entries(TYPE_HINTS)) {
    if (hints.some((hint) => tokenSet.has(hint))) {
      preferred.add(type);
    }
  }

  return preferred;
}

function estimateTargetDistanceMeters(cssMinutes, cssSeconds, sessionDuration) {
  const cssMin = toNumber(cssMinutes);
  const cssSec = toNumber(cssSeconds);
  const sessionDurationMin = toNumber(sessionDuration);

  if (
    cssMin === null ||
    cssSec === null ||
    sessionDurationMin === null ||
    cssMin < 0 ||
    cssSec < 0 ||
    cssSec > 59 ||
    sessionDurationMin <= 0
  ) {
    return null;
  }

  const secondsPer100m = cssMin * 60 + cssSec;
  if (secondsPer100m <= 0) return null;

  const metersPerMinute = (100 / secondsPer100m) * 60;
  const estimate = Math.round((metersPerMinute * sessionDurationMin) / 50) * 50;
  return Math.max(1200, Math.min(5000, estimate));
}

function scoreTemplate(template, context) {
  const metadata = template.metadata || {};
  const haystack = [
    template.plan_type_key,
    template.plan_type_label,
    template.source_file,
    metadata.difficulty,
    metadata.intensity,
    ...(metadata.focus_areas || []),
    template.raw_text || "",
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (context.preferredTypes.has(template.plan_type_key)) {
    score += 18;
  }

  for (const token of context.goalTokens) {
    if (haystack.includes(token)) {
      score += 3;
    }
  }

  if (typeof metadata.estimated_duration_minutes === "number" && context.sessionDurationMin !== null) {
    const delta = Math.abs(metadata.estimated_duration_minutes - context.sessionDurationMin);
    score += Math.max(0, 20 - delta);
  }

  if (typeof metadata.distance_meters === "number" && context.targetDistanceMeters !== null) {
    const delta = Math.abs(metadata.distance_meters - context.targetDistanceMeters);
    score += Math.max(0, 30 - delta / 80);
  }

  if (metadata.date) {
    const ageMs = Date.now() - Date.parse(metadata.date);
    if (Number.isFinite(ageMs) && ageMs > 0) {
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      score += Math.max(0, 4 - ageDays / 365);
    }
  }

  return score;
}

function cleanTemplateText(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const kept = [];
  let chars = 0;

  for (const line of lines) {
    if (kept.length >= MAX_TEMPLATE_LINES) break;
    if (chars + line.length > MAX_TEMPLATE_CHARS) break;
    kept.push(line);
    chars += line.length + 1;
  }

  if (kept.length < lines.length) {
    kept.push("[...]");
  }

  return kept.join("\n");
}

function selectTemplatesFromFullDataset(templatesData, context, perType) {
  const allTemplates = Array.isArray(templatesData.templates) ? templatesData.templates : [];
  const scored = allTemplates
    .map((template) => ({
      template,
      score: scoreTemplate(template, context),
    }))
    .sort((a, b) => b.score - a.score);

  const selectedByType = {};
  for (const type of TEMPLATE_TYPES) {
    selectedByType[type] = scored
      .filter((entry) => entry.template.plan_type_key === type)
      .slice(0, perType)
      .map((entry) => entry.template);
  }

  const selected = TEMPLATE_TYPES.flatMap((type) =>
    selectedByType[type].map((template) => ({
      template,
      score: scored.find((e) => e.template === template)?.score ?? 0,
    }))
  );

  return {
    selected,
    selectedByType,
    totalTemplates: allTemplates.length,
    byType: TEMPLATE_TYPES.reduce((acc, type) => {
      acc[type] = allTemplates.filter((template) => template.plan_type_key === type).length;
      return acc;
    }, {}),
  };
}

function buildSessionRotation(weeks, sessionsPerWeek, selectedByType) {
  const w = toNumber(weeks);
  const s = toNumber(sessionsPerWeek);
  if (!w || !s || w <= 0 || s <= 0) return "";

  const typeOrder = TEMPLATE_TYPES; // ["mileage", "im", "fast", "kitchen_sink"]
  const typeCounters = Object.fromEntries(TEMPLATE_TYPES.map((t) => [t, 0]));
  const lines = ["## SESSION-TO-TEMPLATE ASSIGNMENT", ""];

  let typeRollingIndex = 0;
  for (let week = 1; week <= w; week++) {
    for (let session = 1; session <= s; session++) {
      const type = typeOrder[typeRollingIndex % 4];
      typeRollingIndex++;
      const pool = selectedByType[type] || [];
      if (!pool.length) continue;
      const template = pool[typeCounters[type] % pool.length];
      typeCounters[type]++;
      lines.push(`Week ${week}, Session ${session} (${type}): Adapt "${template.source_file}"`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildTemplateBlock(templatesData, selectionInfo, context, sessionRotation) {
  if (!selectionInfo.selected.length) return "";

  const lines = [];
  lines.push("");
  lines.push("## REAL SWIM PLAN TEMPLATES (FULL DATASET RETRIEVAL)");
  lines.push("");

  if (sessionRotation) {
    lines.push(sessionRotation);
  }

  lines.push(
    `The templates below are the source workouts referenced in the assignment above (${selectionInfo.totalTemplates} total plans in dataset, version ${templatesData.version || "unknown"}).`
  );
  lines.push(
    `Dataset mix: mileage=${selectionInfo.byType.mileage || 0}, im=${selectionInfo.byType.im || 0}, fast=${selectionInfo.byType.fast || 0}, kitchen_sink=${selectionInfo.byType.kitchen_sink || 0}.`
  );
  lines.push(
    "UNIT NOTE: Templates marked Pool=SCY are in Short Course Yards. Convert all distances to metres (×0.914) and adjust interval times to suit the swimmer's CSS in metres. Templates marked Pool=LCM are already in metres."
  );
  if (context.targetDistanceMeters !== null) {
    lines.push(`Target distance per session estimate: ~${context.targetDistanceMeters}m.`);
  }
  lines.push("");

  selectionInfo.selected.forEach((entry, index) => {
    const template = entry.template;
    const metadata = template.metadata || {};
    const details = [
      `Type=${template.plan_type_key}`,
      metadata.distance_meters ? `Distance=${metadata.distance_meters}m` : null,
      metadata.estimated_duration_minutes ? `Duration=${metadata.estimated_duration_minutes}min` : null,
      metadata.difficulty ? `Difficulty=${metadata.difficulty}` : null,
      metadata.pool_type ? `Pool=${metadata.pool_type}` : null,
      Array.isArray(metadata.focus_areas) && metadata.focus_areas.length
        ? `Focus=${metadata.focus_areas.slice(0, 4).join(",")}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    lines.push(`### Template ${index + 1}: ${template.source_file}`);
    lines.push(details);
    lines.push(cleanTemplateText(template.raw_text));
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

function stripTemplateBlock(content) {
  const marker = "\n\n## REAL SWIM PLAN TEMPLATES";
  if (typeof content !== "string") return "";
  const idx = content.indexOf(marker);
  if (idx === -1) return content;
  return `${content.slice(0, idx).trim()}\n\n[template references omitted for follow-up turn]`;
}

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => {
      const content = stripTemplateBlock(String(message.content || "")).trim();
      const bounded = content.length > MAX_HISTORY_CHARS ? content.slice(0, MAX_HISTORY_CHARS) : content;
      return { role: message.role, content: bounded };
    })
    .filter((message) => message.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

function shouldIncludeDebugMeta(headers, parsed) {
  const headerDebug =
    headers["x-swim-plan-debug"] === "1" || headers["X-swim-plan-debug"] === "1";
  const bodyDebug = !!(parsed && parsed.debug === true);
  const envDebug = process.env.SWIM_PLAN_DEBUG_META === "true";
  const nonProdContext = process.env.CONTEXT && process.env.CONTEXT !== "production";

  return headerDebug || bodyDebug || envDebug || nonProdContext;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const parsed = req.body || {};

  const {
    goal,
    cssMinutes,
    cssSeconds,
    duration,
    sessions,
    sessionDuration,
    comments,
    conversationHistory,
  } = parsed;

  const hasInitialInputs =
    !!goal &&
    cssMinutes !== undefined &&
    cssSeconds !== undefined &&
    duration !== undefined &&
    sessions !== undefined &&
    sessionDuration !== undefined;

  const hasComment = typeof comments === "string" && comments.trim().length > 0;

  if (!hasInitialInputs && !hasComment && !Array.isArray(conversationHistory)) {
    return res.status(400).json({
      error:
        "Request must include initial plan inputs or follow-up comments with conversation history.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  let templatesData;
  let selectionInfo;
  let templateBlock = "";

  try {
    templatesData = loadTemplates();

    const goalTokens = tokenizeGoal(goal);
    const context = {
      goalTokens,
      preferredTypes: preferredTypesFromGoal(goalTokens),
      sessionDurationMin: toNumber(sessionDuration),
      targetDistanceMeters: estimateTargetDistanceMeters(cssMinutes, cssSeconds, sessionDuration),
    };

    const perType = calcTemplatesPerType(duration, sessions);
    selectionInfo = selectTemplatesFromFullDataset(templatesData, context, perType);
    const sessionRotation = buildSessionRotation(duration, sessions, selectionInfo.selectedByType);
    templateBlock = buildTemplateBlock(templatesData, selectionInfo, context, sessionRotation);
  } catch (error) {
    console.error("Template loading/selection error:", error.message);
    return res.status(500).json({
      error: "Template data not available. " + error.message,
    });
  }

  const normalizedHistory = normalizeConversationHistory(conversationHistory);
  const messages = [
    {
      role: "system",
      content:
        "You are a swim coach who creates detailed and personalized swim plans based on real masters swim training templates.",
    },
    ...normalizedHistory,
  ];

  const historyDelta = [];

  if (!normalizedHistory.length && hasInitialInputs) {
    const cssTime = `${cssMinutes} minutes ${cssSeconds} seconds per 100m`;
    const initialMessage = {
      role: "user",
      content: `Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${cssTime}. Their goal is to ${goal}. The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes.

IMPORTANT INSTRUCTIONS:
- The session-to-template assignment is listed in the template block below — for each session, directly adapt the assigned template
- Preserve the assigned template's set structure, rep counts, and rest intervals; adjust only the pace/interval times to match the swimmer's CSS
- Do NOT invent new set structures; if a session has no assignment, use the closest template from the same type
- Rotate session types in order: Mileage, IM, Fast, Kitchen Sink (cycling if sessions per week < 4)
- Keep warm-up FIXED to "300 free + 100 pull" always
- Keep cool-down FIXED to "100 free" always
- Use the CSS to calculate appropriate interval times for all main set reps
- Specify equipment (pull buoys, kickboards, fins) where the template uses them
- Always use metres for all distances — templates marked SCY are in yards, convert distances (×0.914) and recalculate interval times accordingly; LCM templates are already in metres
- Respond with valid JSON only — no markdown, no prose, no explanation outside the JSON
- The JSON must have a top-level "sessions" array. Each element must have exactly these keys:
  "week" (integer), "session" (integer), "session_type" (string: mileage/im/fast/kitchen_sink),
  "warm_up" (string), "build_set" (string), "main_set" (string), "cool_down" (string),
  "total_distance_m" (integer)

${templateBlock}`,
    };

    messages.push(initialMessage);
    historyDelta.push(initialMessage);
  }

  if (hasComment) {
    const feedbackMessage = {
      role: "user",
      content: comments.trim(),
    };
    messages.push(feedbackMessage);
    historyDelta.push(feedbackMessage);
  }

  if (!historyDelta.length && normalizedHistory.length) {
    const refreshMessage = {
      role: "user",
      content:
        "Regenerate the plan as valid JSON only, preserving the same constraints and using relevant templates. Use the same sessions array schema as before.",
    };
    messages.push(refreshMessage);
    historyDelta.push(refreshMessage);
  }

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
        messages,
        max_tokens: 4096,
        temperature: 0.7,
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

  const assistantContent =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
      ? data.choices[0].message.content.trim()
      : "";

  if (!assistantContent) {
    return res.status(502).json({ error: "OpenAI returned an empty response." });
  }

  let planSessions = [];
  try {
    const parsedPlan = JSON.parse(assistantContent);
    planSessions = Array.isArray(parsedPlan.sessions) ? parsedPlan.sessions : [];
  } catch (e) {
    console.error("Failed to parse plan JSON:", e.message);
  }

  const assistantMessage = {
    role: "assistant",
    content: assistantContent,
  };

  const conversationHistoryOut = [...normalizedHistory, ...historyDelta, assistantMessage].slice(
    -MAX_HISTORY_MESSAGES
  );

  const responseBody = {
    plan: assistantMessage.content,
    sessions: planSessions,
    conversationHistory: conversationHistoryOut,
  };

  if (shouldIncludeDebugMeta(req.headers, parsed)) {
    responseBody.meta = {
      templates: {
        count: (templatesData.templates || []).length,
        version: templatesData.version || null,
        selectedCount: selectionInfo.selected.length,
        selectedSources: selectionInfo.selected.map((entry) => entry.template.source_file),
      },
    };
  }

  res.status(200).json(responseBody);
};
