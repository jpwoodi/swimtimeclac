const fetch = require("node-fetch");
const { loadTemplates } = require("../lib/templates");
const { requireSameOriginWrite, requireSiteAuth } = require("../lib/server-security");
const {
  toNumber,
  buildCSSZones,
  estimateTargetDistanceMeters,
  normalizePlanSessionsIntervals,
} = require("../lib/cssPacing");
const {
  TEMPLATE_TYPES,
  FOCUS_TYPE_LABELS,
  TYPE_HINTS,
  calcTemplatesPerType,
  tokenizeGoal,
  preferredTypesFromGoal,
  cleanTemplateText,
  selectTemplatesFromFullDataset,
} = require("../lib/templateSelection");

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 3000;

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

  if (!requireSiteAuth(req, res) || !requireSameOriginWrite(req, res)) {
    return;
  }

  const parsed = req.body || {};

  const {
    goal,
    focusTypes,
    cssMinutes,
    cssSeconds,
    duration,
    sessions,
    sessionDuration,
    comments,
    conversationHistory,
  } = parsed;

  const hasFocus = (Array.isArray(focusTypes) && focusTypes.length > 0) || !!goal;
  const hasInitialInputs =
    hasFocus &&
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
  let goalDescription = "";

  try {
    templatesData = loadTemplates();

    let goalTokens, preferredTypes;
    if (Array.isArray(focusTypes) && focusTypes.length > 0) {
      const validTypes = focusTypes.filter((t) => TEMPLATE_TYPES.includes(t));
      preferredTypes = new Set(validTypes);
      goalTokens = validTypes.flatMap((t) => TYPE_HINTS[t] || []);
      goalDescription = "Their training focus is: " + validTypes.map((t) => FOCUS_TYPE_LABELS[t] || t).join(", ") + ".";
    } else {
      goalTokens = tokenizeGoal(goal);
      preferredTypes = preferredTypesFromGoal(goalTokens);
      goalDescription = goal ? `Their goal is to ${goal}.` : "";
    }

    const context = {
      goalTokens,
      preferredTypes,
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
    const cssZones = buildCSSZones(cssMinutes, cssSeconds);
    const initialMessage = {
      role: "user",
      content: `Create a swim plan for a swimmer with a Critical Swim Speed (CSS) of ${cssTime}. ${goalDescription} The plan should last ${duration} weeks, with ${sessions} sessions per week. Each session should last ${sessionDuration} minutes.
${cssZones}
IMPORTANT INSTRUCTIONS:
- The session-to-template assignment is listed in the template block below — for each session, directly adapt the assigned template
- Use the assigned template for set structure and rep counts ONLY. The templates come from faster swimmers — their interval times WILL be wrong for this swimmer. Discard all interval times from the templates and replace them entirely using the PRE-CALCULATED INTERVAL REFERENCE above.
- Do NOT invent new set structures; if a session has no assignment, use the closest template from the same type
- Rotate session types in order: Mileage, IM, Fast, Kitchen Sink (cycling if sessions per week < 4)
- Keep warm-up FIXED to "300 free + 100 pull" always
- Keep cool-down FIXED to "100 free" always
- Set ALL interval times using the PRE-CALCULATED INTERVAL REFERENCE above — copy those values directly
- Do not use '+' as a separator between set items; write each item as a complete standalone description
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
  let parsedPlanObject = null;
  try {
    parsedPlanObject = JSON.parse(assistantContent);
    planSessions = Array.isArray(parsedPlanObject.sessions) ? parsedPlanObject.sessions : [];
  } catch (e) {
    console.error("Failed to parse plan JSON:", e.message);
  }

  const normalizedPlan = normalizePlanSessionsIntervals(planSessions, cssMinutes, cssSeconds);
  planSessions = normalizedPlan.sessions;
  if (parsedPlanObject && Array.isArray(parsedPlanObject.sessions) && normalizedPlan.changed) {
    parsedPlanObject.sessions = planSessions;
  }

  const assistantContentOut =
    parsedPlanObject && normalizedPlan.changed ? JSON.stringify(parsedPlanObject) : assistantContent;

  const assistantMessage = {
    role: "assistant",
    content: assistantContentOut,
  };

  const conversationHistoryOut = [...normalizedHistory, ...historyDelta, assistantMessage].slice(
    -MAX_HISTORY_MESSAGES
  );

  const templateSources = selectionInfo
    ? selectionInfo.selected.map((e) => e.template.source_file)
    : [];

  const responseBody = {
    plan: assistantMessage.content,
    sessions: planSessions,
    templateSources,
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
