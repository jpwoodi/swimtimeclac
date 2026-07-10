// Fills in a periodization plan (lib/periodization.js) with actual
// sessions — no LLM involved. Base/build weeks pull real sessions from the
// template corpus and rewrite their intervals to the swimmer's CSS; peak/
// taper "fast" slots use goal-pace-specific sessions instead, since the
// corpus has nothing written for a specific race goal.

const {
  pickTemplateByTypeAndDistance,
  trueDistanceMeters,
} = require("./templateSelection");
const {
  estimateTargetDistanceMeters,
  normalizeSetIntervals,
  convertPaceTableText,
  roundUpToNearest5,
} = require("./cssPacing");
const { buildRacePaceSession } = require("./raceSpecificSet");

const MIN_SESSION_DISTANCE = 800;
const MAX_SESSION_DISTANCE = 6000;

function yardsToMeters(yards) {
  return roundUpToNearest5(Math.round((yards * 0.9144) / 25) * 25);
}

// Converts "N x D" and bare leading "D <word>" distance figures in a
// template's text from yards to metres. Only meaningful for SCY (Short
// Course Yards) templates; a no-op otherwise. Must run before interval-time
// normalization so the swim-time math is computed against true metres.
function convertScyDistancesToMeters(text) {
  if (typeof text !== "string" || !text) return text;

  let converted = text.replace(/\b(\d+)\s*([x×])\s*(\d{2,4})\b/gi, (match, reps, sep, dist) => {
    return `${reps} ${sep} ${yardsToMeters(Number(dist))}`;
  });

  // Bare leading distance at the start of a line (e.g. "300 Swim") that
  // isn't actually a "N x D" pattern already handled above.
  converted = converted.replace(
    /^(\s*)(\d{2,4})(?!\s*[x×]\s*\d)(\s+(?=[A-Za-z]))/gm,
    (match, indent, dist, tail) => `${indent}${yardsToMeters(Number(dist))}${tail}`
  );

  return converted;
}

function sessionDistanceForWeek(cssMinutes, cssSeconds, sessionDurationMin, volumeMultiplier) {
  const base = estimateTargetDistanceMeters(cssMinutes, cssSeconds, sessionDurationMin) || 2400;
  const scaled = Math.round((base * volumeMultiplier) / 50) * 50;
  return Math.max(MIN_SESSION_DISTANCE, Math.min(MAX_SESSION_DISTANCE, scaled));
}

// Trims blank lines only — unlike templateSelection's cleanTemplateText,
// this never truncates. That function's line/char cap exists to fit an
// LLM prompt budget; a real person reading their own workout should see
// all of it.
function cleanFullText(rawText) {
  return String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// The corpus's raw text often ends with a "Notes for this Set:" /
// "Note for this set:" block explaining drill names and abbreviations
// (e.g. "DPS = Distance Per Stroke..."). That's reference material, not
// part of the set itself, so it's split out to be shown separately rather
// than rendered as more set bullets.
function splitTrailingNotes(text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => /^notes?\s+for\s+this\s+set:?\s*$/i.test(line.trim()));
  if (idx === -1) return { main: text, notes: "" };

  return {
    main: lines.slice(0, idx).join("\n").trim(),
    notes: lines.slice(idx + 1).join("\n").trim(),
  };
}

// Builds one session from a real corpus template, CSS-personalized.
function composeTemplateSession({ templatesData, type, targetDistanceMeters, usedSourceFiles, cssSecondsPer100 }) {
  const template = pickTemplateByTypeAndDistance(templatesData, type, targetDistanceMeters, usedSourceFiles);
  if (!template) return null;

  usedSourceFiles.add(template.source_file);

  const isScy = template.metadata && template.metadata.pool_type === "SCY";
  let text = cleanFullText(template.raw_text);
  if (isScy) {
    // Must run before any interval math: distances feed the pace calc below.
    text = convertScyDistancesToMeters(text);
  }

  // Collapse the corpus's generic multi-column pace tables to one sendoff
  // computed for this swimmer, then catch any remaining single-value
  // "on TIME" / "@ TIME" phrasing the pace-table pass didn't touch.
  text = convertPaceTableText(text, "main_set", cssSecondsPer100).text;
  const normalized = normalizeSetIntervals(text, "main_set", cssSecondsPer100);
  const { main, notes } = splitTrailingNotes(normalized.text);
  const totalDistance = trueDistanceMeters(template) || targetDistanceMeters;

  return {
    session_type: type,
    source: "template",
    source_file: template.source_file,
    warm_up: "",
    build_set: "",
    main_set: main,
    cool_down: "",
    notes,
    total_distance_m: totalDistance,
  };
}

function composeRacePaceSession({ raceDistanceM, paceInfo, cssSecondsPer100, sessionDurationMin, phase }) {
  const built = buildRacePaceSession({
    raceDistanceM,
    paceSecondsPer100: paceInfo.paceSecondsPer100,
    cssSecondsPer100,
    sessionDurationMin,
    phase,
  });

  return {
    session_type: "fast",
    source: "race-pace",
    source_file: null,
    estimated_pace: paceInfo.estimated,
    ...built,
  };
}

// options:
//   periodizationPlan  - from lib/periodization.js buildPeriodizationPlan()
//   templatesData      - from lib/templates.js loadTemplates()
//   cssMinutes, cssSeconds, cssSecondsPer100 - swimmer's CSS
//   sessionDurationMin - target minutes per session
//   raceDistanceM      - goal race distance in metres
//   paceInfo           - from lib/raceSpecificSet.js computeGoalPaceSecondsPer100()
function composeTrainingBlock(options) {
  const {
    periodizationPlan,
    templatesData,
    cssMinutes,
    cssSeconds,
    cssSecondsPer100,
    sessionDurationMin,
    raceDistanceM,
    paceInfo,
  } = options;

  const usedSourceFiles = new Set();

  const weeks = periodizationPlan.weeks.map((week) => {
    const targetDistanceMeters = sessionDistanceForWeek(
      cssMinutes,
      cssSeconds,
      sessionDurationMin,
      week.volumeMultiplier
    );

    const sessions = week.sessionTypes.map((type, index) => {
      const isRacePaceSlot =
        type === "fast" && (week.phase === "peak" || week.phase === "taper") && paceInfo;

      const built = isRacePaceSlot
        ? composeRacePaceSession({
            raceDistanceM,
            paceInfo,
            cssSecondsPer100,
            sessionDurationMin,
            phase: week.phase,
          })
        : composeTemplateSession({
            templatesData,
            type,
            targetDistanceMeters,
            usedSourceFiles,
            cssSecondsPer100,
          });

      return {
        week: week.weekNumber,
        session: index + 1,
        ...(built || {
          session_type: type,
          source: "unavailable",
          source_file: null,
          warm_up: "",
          build_set: "",
          main_set: "No matching template was available for this slot.",
          cool_down: "",
          total_distance_m: 0,
        }),
      };
    });

    return {
      weekNumber: week.weekNumber,
      phase: week.phase,
      phaseLabel: week.phaseLabel,
      isDeload: week.isDeload,
      targetDistanceMeters,
      sessions,
    };
  });

  return {
    totalWeeks: periodizationPlan.totalWeeks,
    sessionsPerWeek: periodizationPlan.sessionsPerWeek,
    phases: periodizationPlan.phases,
    weeks,
  };
}

module.exports = {
  convertScyDistancesToMeters,
  sessionDistanceForWeek,
  composeTrainingBlock,
};
