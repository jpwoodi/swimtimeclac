const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

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
const MAX_TEMPLATES_IN_PROMPT = 12;
const MIN_PER_TYPE = 2;
const MAX_TEMPLATE_LINES = 16;
const MAX_TEMPLATE_CHARS = 950;

let templatesCache = null;

function loadTemplates() {
  if (templatesCache) return templatesCache;

  const candidatePaths = [
    path.join(__dirname, "..", "..", "data", "templates.v2.json"),
    path.join(process.cwd(), "data", "templates.v2.json"),
    path.join(__dirname, "data", "templates.v2.json"),
    path.join(__dirname, "..", "..", "data", "templates.v1.json"),
    path.join(process.cwd(), "data", "templates.v1.json"),
    path.join(__dirname, "data", "templates.v1.json"),
  ];

  const templatesPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!templatesPath) {
    throw new Error("Templates file not found. Please run: npm run ingest-templates-v2");
  }

  const rawData = fs.readFileSync(templatesPath, "utf-8");
  const parsed = JSON.parse(rawData);
  if (!Array.isArray(parsed.templates)) {
    parsed.templates = [];
  }

  parsed._sourcePath = templatesPath;
  templatesCache = parsed;
  return parsed;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

function selectTemplatesFromFullDataset(templatesData, context) {
  const allTemplates = Array.isArray(templatesData.templates) ? templatesData.templates : [];
  const scored = allTemplates
    .map((template) => ({
      template,
      score: scoreTemplate(template, context),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const seenPlanIds = new Set();

  for (const type of TEMPLATE_TYPES) {
    const perType = scored.filter((entry) => entry.template.plan_type_key === type).slice(0, MIN_PER_TYPE);
    for (const entry of perType) {
      const planId = entry.template.plan_id || `${entry.template.plan_type_key}:${entry.template.source_file}`;
      if (!seenPlanIds.has(planId)) {
        selected.push(entry);
        seenPlanIds.add(planId);
      }
    }
  }

  for (const entry of scored) {
    if (selected.length >= MAX_TEMPLATES_IN_PROMPT) break;
    const planId = entry.template.plan_id || `${entry.template.plan_type_key}:${entry.template.source_file}`;
    if (!seenPlanIds.has(planId)) {
      selected.push(entry);
      seenPlanIds.add(planId);
    }
  }

  return {
    selected,
    totalTemplates: allTemplates.length,
    byType: TEMPLATE_TYPES.reduce((acc, type) => {
      acc[type] = allTemplates.filter((template) => template.plan_type_key === type).length;
      return acc;
    }, {}),
  };
}

function buildTemplateBlock(templatesData, selectionInfo, context) {
  if (!selectionInfo.selected.length) return "";

  const lines = [];
  lines.push("");
  lines.push("## REAL SWIM PLAN TEMPLATES (FULL DATASET RETRIEVAL)");
  lines.push("");
  lines.push(
    `Use these reference templates selected from the full dataset (${selectionInfo.totalTemplates} total plans, version ${templatesData.version || "unknown"}). Reuse and adapt their set structures.`
  );
  lines.push(
    `Dataset mix: mileage=${selectionInfo.byType.mileage || 0}, im=${selectionInfo.byType.im || 0}, fast=${selectionInfo.byType.fast || 0}, kitchen_sink=${selectionInfo.byType.kitchen_sink || 0}.`
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

function shouldIncludeDebugMeta(event, parsed) {
  const headers = event && event.headers ? event.headers : {};
  const headerDebug =
    headers["x-swim-plan-debug"] === "1" || headers["X-Swim-Plan-Debug"] === "1";
  const bodyDebug = !!(parsed && parsed.debug === true);
  const envDebug = process.env.SWIM_PLAN_DEBUG_META === "true";
  const nonProdContext = process.env.CONTEXT && process.env.CONTEXT !== "production";

  return headerDebug || bodyDebug || envDebug || nonProdContext;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const {
    goal,
    cssMinutes,
    cssSeconds,
    duration,
    sessions,
    sessionDuration,
    comments,
    conversationHistory,
    debug,
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
    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "Request must include initial plan inputs or follow-up comments with conversation history.",
      }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "OPENAI_API_KEY is not configured." }),
    };
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

    selectionInfo = selectTemplatesFromFullDataset(templatesData, context);
    templateBlock = buildTemplateBlock(templatesData, selectionInfo, context);
  } catch (error) {
    console.error("Template loading/selection error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Template data not available. " + error.message,
      }),
    };
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
- Use the 4 session types each week: Mileage (distance), IM (strokes), Fast (speed), Kitchen Sink (mixed)
- Reuse and adapt structures from the templates below - do NOT invent wholly new set structures unless absolutely necessary
- Keep warm-up FIXED to "300 free + 100 pull" always
- Keep cool-down FIXED to "100 free" always
- Use the CSS to inform pacing for intervals
- Specify equipment (pull buoys, kickboards, fins) where applicable
- Always use metres
- Format output as a Markdown table ONLY with columns: Week | Session Number | Warm Up | Build Set | Main Set | Cool Down | Total Distance
- Do NOT include any additional text outside the table

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
        "Regenerate the plan as a clean Markdown table only, preserving the same constraints and using relevant templates.",
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
        model: "gpt-4o-mini",
        messages,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });
  } catch (error) {
    console.error("OpenAI request failed:", error.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to reach OpenAI API." }),
    };
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
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: apiError }),
    };
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
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "OpenAI returned an empty response." }),
    };
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
    conversationHistory: conversationHistoryOut,
  };

  if (shouldIncludeDebugMeta(event, { ...parsed, debug })) {
    responseBody.meta = {
      templates: {
        count: (templatesData.templates || []).length,
        version: templatesData.version || null,
        sourcePath: templatesData._sourcePath || null,
        selectedCount: selectionInfo.selected.length,
        selectedSources: selectionInfo.selected.map((entry) => entry.template.source_file),
      },
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(responseBody),
  };
};
