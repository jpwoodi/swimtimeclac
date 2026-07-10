const { loadTemplates } = require("../lib/templates");
const { requireSameOriginWrite, requireSiteAuth } = require("../lib/server-security");
const { buildPeriodizationPlan } = require("../lib/periodization");
const { computeGoalPaceSecondsPer100 } = require("../lib/raceSpecificSet");
const { composeTrainingBlock } = require("../lib/trainingBlockComposer");
const { cssSecondsPer100FromParts, formatSecondsToTime } = require("../lib/cssPacing");

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toPositiveInt(value) {
  const n = toPositiveNumber(value);
  return n === null ? null : Math.round(n);
}

module.exports = async function handler(req, res) {
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

  res.status(200).json({
    ...block,
    raceDistanceM,
    targetTimeSeconds: targetTimeSeconds || null,
    goalPace: {
      secondsPer100: Math.round(paceInfo.paceSecondsPer100),
      formatted: formatSecondsToTime(paceInfo.paceSecondsPer100),
      estimated: paceInfo.estimated,
    },
  });
};
