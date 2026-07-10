// Shared CSS (Critical Swim Speed) pacing math: zone tables, interval
// sendoff calculation, and rewriting set text to a swimmer's own CSS.
// Used by both the single-session AI generator and the deterministic
// training block composer.

const SECTION_INTERVAL_KEYS = ["warm_up", "build_set", "main_set", "cool_down"];

// Zone pace offsets in seconds per 100m (positive = slower, negative = faster)
const ZONES = [
  { key: "Z1", name: "Easy / Recovery", low: 25,  high: 35, mid: 30  },
  { key: "Z2", name: "Aerobic",         low: 10,  high: 18, mid: 14  },
  { key: "Z3", name: "Threshold / CSS", low: -3,  high: 3,  mid: 0   },
  { key: "Z4", name: "Hard / VO2max",   low: -12, high: -5, mid: -8  },
  { key: "Z5", name: "Sprint",          low: -20, high: -12, mid: -16 },
];

const INTERVAL_ZONE_OFFSETS = {
  z1: 30,
  z2: 14,
  z3: 0,
  z4: -8,
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTimeToSeconds(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const mins = Number(match[1]);
  const secs = Number(match[2]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs > 59) return null;
  return mins * 60 + secs;
}

function formatSecondsToTime(totalSeconds) {
  const t = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function roundUpToNearest5(value) {
  return Math.ceil(value / 5) * 5;
}

function cssSecondsPer100FromParts(cssMinutes, cssSeconds) {
  const cssMin = toNumber(cssMinutes);
  const cssSec = toNumber(cssSeconds);
  if (cssMin === null || cssSec === null || cssMin < 0 || cssSec < 0 || cssSec > 59) return null;
  const total = cssMin * 60 + cssSec;
  return total > 0 ? total : null;
}

function estimateTargetDistanceMetersFromSeconds(secondsPer100m, sessionDurationMin) {
  if (secondsPer100m === null || secondsPer100m <= 0 || sessionDurationMin === null || sessionDurationMin <= 0) {
    return null;
  }

  const metersPerMinute = (100 / secondsPer100m) * 60;
  const estimate = Math.round((metersPerMinute * sessionDurationMin) / 50) * 50;
  return Math.max(1200, Math.min(5000, estimate));
}

function estimateTargetDistanceMeters(cssMinutes, cssSeconds, sessionDuration) {
  const sessionDurationMin = toNumber(sessionDuration);
  const secondsPer100m = cssSecondsPer100FromParts(cssMinutes, cssSeconds);
  return estimateTargetDistanceMetersFromSeconds(secondsPer100m, sessionDurationMin);
}

function buildCSSZones(cssMinutes, cssSeconds) {
  const cssTotalSec = cssSecondsPer100FromParts(cssMinutes, cssSeconds);
  if (cssTotalSec === null) return "";

  function secsToTime(s) {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }

  function roundUp5(s) {
    return Math.ceil(s / 5) * 5;
  }

  const lines = [
    `\n## CSS TRAINING ZONES (CSS = ${secsToTime(cssTotalSec)}/100m)`,
    "",
  ];
  for (const zone of ZONES) {
    lines.push(`- ${zone.key} ${zone.name}: ${secsToTime(cssTotalSec + zone.low)}–${secsToTime(cssTotalSec + zone.high)}/100m`);
  }

  // Pre-calculated interval reference table (swim time + 15s rest, rounded up to nearest 0:05)
  // This prevents GPT from reusing template intervals designed for faster swimmers.
  lines.push("");
  lines.push("## PRE-CALCULATED INTERVAL REFERENCE — use these directly, ignore template interval times");
  lines.push("(swim time at zone midpoint + 15s rest, rounded up to nearest 0:05)");
  lines.push("");

  const distances = [25, 50, 75, 100, 150, 200, 400];
  for (const dist of distances) {
    const factor = dist / 100;
    const cols = ZONES.slice(0, 4).map(z => {
      const swimSec = (cssTotalSec + z.mid) * factor;
      return `${z.key}=${secsToTime(roundUp5(swimSec + 15))}`;
    });
    lines.push(`${dist}m: ${cols.join(" | ")}`);
  }

  lines.push("");
  lines.push(
    `HARD RULE: An interval shorter than the CSS swim time for that distance is physically impossible ` +
    `and must never appear in the plan. ` +
    `CSS swim times: 25m=${secsToTime(Math.round(cssTotalSec * 0.25))} | ` +
    `50m=${secsToTime(Math.round(cssTotalSec * 0.5))} | ` +
    `100m=${secsToTime(cssTotalSec)} | ` +
    `200m=${secsToTime(cssTotalSec * 2)} | ` +
    `400m=${secsToTime(cssTotalSec * 4)}`
  );
  lines.push("");
  return lines.join("\n");
}

function inferIntervalZone(lineText, sectionKey) {
  const text = String(lineText || "").toLowerCase();

  if (/\b(sprint|fast|race|all out|max|vo2|anaerobic)\b/.test(text)) {
    return "z4";
  }
  if (/\b(threshold|css|pace|descend)\b/.test(text)) {
    return "z3";
  }
  if (/\b(easy|recovery|warm|cool)\b/.test(text)) {
    return "z1";
  }
  if (/\b(aerobic|pull|dps|moderate|build|choice|drill|technique)\b/.test(text)) {
    return "z2";
  }

  if (sectionKey === "warm_up" || sectionKey === "cool_down") return "z1";
  if (sectionKey === "build_set") return "z2";
  return "z3";
}

function calculateIntervalSendoffSeconds(cssSecondsPer100, distanceM, zoneKey) {
  const offset = INTERVAL_ZONE_OFFSETS[zoneKey] ?? INTERVAL_ZONE_OFFSETS.z3;
  const swimSeconds = (cssSecondsPer100 + offset) * (distanceM / 100);
  return roundUpToNearest5(swimSeconds + 15);
}

function cleanSetLine(line) {
  if (typeof line !== "string") return line;

  let cleaned = line.trim();
  cleaned = cleaned.replace(/\s*[,;]\s*(?=(?:\d+\s*[x×]\s+\d))/gi, " ");
  cleaned = cleaned.replace(/\b(each|rest)\s*,\s*$/gi, "$1");
  cleaned = cleaned.replace(/\s*[,+;]\s*$/g, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  return cleaned;
}

function cleanSetText(setText) {
  if (typeof setText !== "string") return setText;
  return setText
    .split(/\r?\n/)
    .map((line) => cleanSetLine(line))
    .join("\n")
    .trim();
}

function normalizeSetIntervals(setText, sectionKey, cssSecondsPer100) {
  if (typeof setText !== "string" || !setText.trim()) {
    return { text: setText, changed: false };
  }

  let changed = false;
  const segmentBoundary = /(?=\b\d+\s*[x×]\s*\d{2,4}\b)/i;
  const segments = setText.split(segmentBoundary);
  const normalizedSegments = segments.map((segment) => {
    const anchor = segment.match(/\b\d+\s*[x×]\s*(\d{2,4})\b/i);
    if (anchor) {
      const distanceM = Number(anchor[1]);
      const zone = inferIntervalZone(segment, sectionKey);
      const targetSendoffSeconds = calculateIntervalSendoffSeconds(cssSecondsPer100, distanceM, zone);
      const sendoffText = formatSecondsToTime(targetSendoffSeconds);
      return segment.replace(/(\bon|@)\s*(\d{1,2}:\d{2}|\d{1,3})/gi, (fullMatch, separator, currentTime) => {
        if (sendoffText === currentTime) return fullMatch;
        changed = true;
        return `${separator} ${sendoffText}`;
      });
    }

    return segment.replace(
      /(\b(\d{2,4})(?=\s|m\b|meters?\b)\s*(?:m|meters?)?[^\n]{0,120}?)(\bon|@)\s*(\d{1,2}:\d{2}|\d{1,3})/gi,
      (fullMatch, prefix, distanceStr, separator, currentTime) => {
        const distanceM = Number(distanceStr);
        const currentSeconds = parseTimeToSeconds(currentTime);
        if (!Number.isFinite(distanceM) || distanceM < 25 || currentSeconds === null) {
          return fullMatch;
        }

        const zone = inferIntervalZone(prefix, sectionKey);
        const targetSendoffSeconds = calculateIntervalSendoffSeconds(cssSecondsPer100, distanceM, zone);
        const sendoffText = formatSecondsToTime(targetSendoffSeconds);
        if (sendoffText === currentTime) return fullMatch;

        changed = true;
        return `${prefix}${separator} ${sendoffText}`;
      }
    );
  });

  const normalizedText = normalizedSegments.join("");

  const cleanedText = cleanSetText(normalizedText);
  if (cleanedText !== normalizedText) changed = true;

  return { text: cleanedText, changed };
}

// The template corpus mostly expresses intervals as a row of tab-separated
// times for several generic ability groups, e.g.:
//   "3 x 100 Drill / Swim by 50\t1:35\t1:45\t2:00\t2:15\t:20 Rest"
// normalizeSetIntervals (above) only recognizes an explicit "on TIME" /
// "@ TIME" phrase, so it never touches this shape. This collapses a
// multi-column pace-table line down to one sendoff computed for this
// swimmer's own CSS, dropping the generic columns entirely.
function isPaceTableTimeToken(field) {
  return /^\d{1,2}:\d{2}(\(\d+\))?$/.test(String(field || "").trim());
}

function convertPaceTableLine(line, sectionKey, cssSecondsPer100) {
  if (typeof line !== "string" || !line.includes("\t")) {
    return { line, changed: false };
  }

  const fields = line.split("\t");
  if (fields.length < 3) return { line, changed: false };

  const descriptor = fields[0];
  const timeColumnCount = fields.slice(1).filter(isPaceTableTimeToken).length;
  if (timeColumnCount < 2) return { line, changed: false };

  const anchor = descriptor.match(/\b\d+\s*[x×]\s*(\d{2,4})\b/i);
  if (!anchor) return { line, changed: false };

  const distanceM = Number(anchor[1]);
  const zone = inferIntervalZone(descriptor, sectionKey);
  const sendoffSeconds = calculateIntervalSendoffSeconds(cssSecondsPer100, distanceM, zone);
  return { line: `${descriptor.trim()} on ${formatSecondsToTime(sendoffSeconds)}`, changed: true };
}

function convertPaceTableText(text, sectionKey, cssSecondsPer100) {
  if (typeof text !== "string" || !text) return { text, changed: false };

  let changed = false;
  const lines = text.split(/\r?\n/).map((line) => {
    const result = convertPaceTableLine(line, sectionKey, cssSecondsPer100);
    if (result.changed) changed = true;
    return result.line;
  });

  return { text: lines.join("\n"), changed };
}

function normalizePlanSessionsIntervals(sessions, cssMinutes, cssSeconds) {
  const cssSecondsPer100 = parseTimeToSeconds(`${cssMinutes}:${String(cssSeconds).padStart(2, "0")}`);
  if (!Array.isArray(sessions) || !sessions.length || cssSecondsPer100 === null || cssSecondsPer100 <= 0) {
    return { sessions, changed: false };
  }

  let changed = false;
  const normalizedSessions = sessions.map((session) => {
    if (!session || typeof session !== "object") return session;

    const nextSession = { ...session };
    for (const key of SECTION_INTERVAL_KEYS) {
      const result = normalizeSetIntervals(nextSession[key], key, cssSecondsPer100);
      nextSession[key] = result.text;
      if (result.changed) changed = true;
    }
    return nextSession;
  });

  return { sessions: normalizedSessions, changed };
}

module.exports = {
  SECTION_INTERVAL_KEYS,
  ZONES,
  toNumber,
  parseTimeToSeconds,
  formatSecondsToTime,
  roundUpToNearest5,
  cssSecondsPer100FromParts,
  estimateTargetDistanceMeters,
  estimateTargetDistanceMetersFromSeconds,
  buildCSSZones,
  inferIntervalZone,
  calculateIntervalSendoffSeconds,
  cleanSetLine,
  cleanSetText,
  normalizeSetIntervals,
  normalizePlanSessionsIntervals,
  convertPaceTableText,
};
