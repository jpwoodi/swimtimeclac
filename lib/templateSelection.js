// Shared swim plan template scoring/selection over the real masters plan
// corpus (data/templates.v2.json). Used by both the single-session AI
// generator and the deterministic training block composer.

const { toNumber } = require("./cssPacing");

const TEMPLATE_TYPES = ["mileage", "im", "fast", "kitchen_sink"];
const FOCUS_TYPE_LABELS = {
  mileage:      "Endurance / Mileage",
  im:           "IM & Strokes",
  fast:         "Speed & Threshold",
  kitchen_sink: "Technique & Mixed",
};
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
const MIN_PER_TYPE = 2;
const MAX_PER_TYPE = 6;
const MAX_TEMPLATE_LINES = 40;
const MAX_TEMPLATE_CHARS = 2500;

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

// Pick a single template of the requested type, closest to targetDistanceMeters,
// excluding any source_file already in excludeSourceFiles (so a multi-week plan
// doesn't repeat the same real session over and over). Falls back to allowing
// repeats if every matching template has already been used.
function pickTemplateByTypeAndDistance(templatesData, type, targetDistanceMeters, excludeSourceFiles) {
  const allTemplates = Array.isArray(templatesData.templates) ? templatesData.templates : [];
  const candidates = allTemplates.filter((t) => t.plan_type_key === type);
  if (!candidates.length) return null;

  const exclude = excludeSourceFiles instanceof Set ? excludeSourceFiles : new Set(excludeSourceFiles || []);
  const fresh = candidates.filter((t) => !exclude.has(t.source_file));
  const pool = fresh.length ? fresh : candidates;

  const scored = pool
    .map((template) => {
      const dist = template.metadata && typeof template.metadata.distance_meters === "number"
        ? template.metadata.distance_meters
        : null;
      const delta = dist === null || targetDistanceMeters === null
        ? 1e9
        : Math.abs(dist - targetDistanceMeters);
      return { template, delta };
    })
    .sort((a, b) => a.delta - b.delta);

  return scored[0] ? scored[0].template : null;
}

module.exports = {
  TEMPLATE_TYPES,
  FOCUS_TYPE_LABELS,
  TYPE_HINTS,
  STOP_WORDS,
  calcTemplatesPerType,
  tokenizeGoal,
  preferredTypesFromGoal,
  scoreTemplate,
  cleanTemplateText,
  selectTemplatesFromFullDataset,
  pickTemplateByTypeAndDistance,
};
