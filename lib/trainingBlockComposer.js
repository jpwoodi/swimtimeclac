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

function isPlainNumberField(field) {
  return /^[\d,]{2,6}$/.test(String(field || "").trim());
}

// A bare separator token (e.g. a stray "/" between columns) that carries
// no instructional content of its own — only meaningful alongside actual
// number fields, never on its own.
function isBareSeparatorField(field) {
  return /^[/\-]$/.test(String(field || "").trim());
}

// Some source docs embed "cumulative distance so far" bookkeeping rows for
// each pace-group column — not real set content — e.g.
// "Cool Down\t3,200\t3,200\t2,700\t2,700\t2,000" or a bare "250\t250\t175\t175\t250".
// These have no rep pattern ("N x D") and no time format, so they slip past
// both the pace-table and interval converters below and would otherwise
// surface as confusing, unit-unconverted distance figures. Strip the
// numeric columns, keeping just the label; drop the line entirely if even
// the label is itself just a number.
function stripBookkeepingLines(text) {
  const lines = text.split(/\r?\n/);
  const kept = lines
    .map((line) => {
      if (isPlainNumberField(line)) return null;
      if (!line.includes("\t")) return line;

      const fields = line.split("\t");
      if (fields.length < 2) return line;

      const label = fields[0];
      const rest = fields.slice(1);
      if (!rest.some(isPlainNumberField) || !rest.every((f) => isPlainNumberField(f) || isBareSeparatorField(f))) {
        return line;
      }

      return isPlainNumberField(label) ? null : label.trim();
    })
    .filter((line) => line !== null);

  return kept.join("\n");
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
// than rendered as more set bullets. Some source docs run the header
// straight into the preceding line with no line break at all (e.g.
// "Cool DownNote for this set:") - matched as a substring rather than
// requiring the whole line, so that merged case still splits cleanly
// instead of leaking the entire notes block into the visible set.
const NOTES_HEADER_RE = /notes?\s+for\s+this\s+set:?/i;

function splitTrailingNotes(text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => NOTES_HEADER_RE.test(line));
  if (idx === -1) return { main: text, notes: "" };

  const headerMatch = lines[idx].match(NOTES_HEADER_RE);
  const before = lines[idx].slice(0, headerMatch.index).trim();
  const after = lines[idx].slice(headerMatch.index + headerMatch[0].length).trim();

  const mainLines = lines.slice(0, idx);
  if (before) mainLines.push(before);

  const notesLines = after ? [after] : [];
  notesLines.push(...lines.slice(idx + 1));

  return {
    main: mainLines.join("\n").trim(),
    notes: notesLines.join("\n").trim(),
  };
}

// Standalone drill-name/abbreviation legend lines that define a term used
// elsewhere in the set (e.g. "DPS = Distance Per Stroke...",
// "IMO = Individual Medley Order..."). Many corpus sessions have these
// with no "Notes for this set:" header at all, so splitTrailingNotes alone
// won't catch them. A line still carrying a tab is left alone - that
// means it has its own pace-table columns rather than being pure
// reference text, so pulling it out risks hiding a real instruction
// rather than just a definition.
//
// This is deliberately NOT the same thing as a per-rep instruction like
// "#1, 4 = Build" or "Odds = Kick" - those tell the swimmer what specific
// reps should actually do, so they're real set content and must stay
// visible rather than being filed away as a footnote. The distinguishing
// signal is the left-hand side: a term/abbreviation (DPS, IMO, Descend,
// Balance Drill) is a definition; a rep number/range or "Odds"/"Evens" is
// an instruction.
const LEGEND_LINE_RE = /^[#A-Za-z0-9,/\-\s]{1,28}=\s*\S/;
const REP_REFERENCE_LHS_RE = /^#\s*\d|^(odds|evens)$/i;

function isLegendLine(line) {
  if (line.includes("\t") || !LEGEND_LINE_RE.test(line) || /^\d+\s*[x×]/i.test(line)) {
    return false;
  }
  const lhs = line.split("=")[0].trim();
  return !REP_REFERENCE_LHS_RE.test(lhs);
}

function extractLegendLines(text) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  const legend = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (isLegendLine(trimmed)) legend.push(trimmed);
    else kept.push(line);
  }
  if (!legend.length) return { main: text, legendNotes: "" };
  return { main: kept.join("\n").trim(), legendNotes: legend.join("\n") };
}

// Builds one session from a real corpus template, CSS-personalized.
function composeTemplateSession({ templatesData, type, targetDistanceMeters, usedSourceFiles, cssSecondsPer100 }) {
  const template = pickTemplateByTypeAndDistance(templatesData, type, targetDistanceMeters, usedSourceFiles);
  if (!template) return null;

  usedSourceFiles.add(template.source_file);

  const isScy = template.metadata && template.metadata.pool_type === "SCY";
  let text = cleanFullText(template.raw_text);
  text = stripBookkeepingLines(text);
  if (isScy) {
    // Must run before any interval math: distances feed the pace calc below.
    text = convertScyDistancesToMeters(text);
  }

  // Collapse the corpus's generic multi-column pace tables to one sendoff
  // computed for this swimmer, then catch any remaining single-value
  // "on TIME" / "@ TIME" phrasing the pace-table pass didn't touch.
  text = convertPaceTableText(text, "main_set", cssSecondsPer100).text;
  const normalized = normalizeSetIntervals(text, "main_set", cssSecondsPer100);
  const { main: mainAfterHeader, notes: headerNotes } = splitTrailingNotes(normalized.text);
  const { main, legendNotes } = extractLegendLines(mainAfterHeader);
  const notes = [legendNotes, headerNotes].filter(Boolean).join("\n");
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
  stripBookkeepingLines,
  splitTrailingNotes,
  extractLegendLines,
  sessionDistanceForWeek,
  composeTrainingBlock,
};
