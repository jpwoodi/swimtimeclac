// Post-set analysis: compares a recorded Strava swim (lap-by-lap) against
// what a training block session actually prescribed, and turns the
// comparison into deterministic, advisory suggestions — never silently
// auto-applied. lib/trainingBlock.js's ?action=applyAdjustment is the only
// thing that writes a suggestion into future plans, and only when the
// swimmer explicitly asks for it.
//
// Two levels of comparison, deliberately different in confidence:
//   - Session-level: works for every session (real corpus sessions and
//     race-pace-generated ones alike) — total distance and overall pace
//     vs. a reference pace. For race-pace sessions the reference is the
//     exact goal pace; for real corpus sessions there's no single correct
//     target buried in the free text, so CSS itself is used as an
//     approximate reference and the result is labelled as such.
//   - Rep-level: only possible for race-pace sessions, because those are
//     the only ones with an exact machine-known structure (built by
//     lib/raceSpecificSet.js) — reps, distance-per-rep, and target time are
//     read from structured fields on the session, not re-parsed from text.

const { formatSecondsToTime } = require("./cssPacing");
const { interpolateFadeFactor } = require("./raceSpecificSet");

const PACE_DELTA_THRESHOLD_SECONDS = 3; // per 100m — beyond this, suggest a CSS re-baseline
const FADE_THRESHOLD_SECONDS = 3; // per 100m — second-half vs first-half, beyond this, flag fade
const REST_OVERAGE_THRESHOLD_SECONDS = 15; // extra rest beyond prescribed, flags fatigue
const COMPLETION_WARNING_RATIO = 0.8; // below this fraction of prescribed distance, treat pace deltas cautiously

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Strava's swim "laps" are one pool length each. Field names below match
// Strava's documented Lap object; this is defensive against variation
// since it hasn't been validated against a live account.
function normalizeStravaLaps(rawLaps) {
  if (!Array.isArray(rawLaps)) return [];

  return rawLaps
    .map((lap) => {
      const distance = toFiniteNumber(lap?.distance);
      const movingTimeSeconds = toFiniteNumber(lap?.moving_time);
      const elapsedTimeSeconds = toFiniteNumber(lap?.elapsed_time ?? lap?.moving_time);
      const startDate = typeof lap?.start_date === "string" ? lap.start_date : null;
      const lapIndex = toFiniteNumber(lap?.lap_index ?? lap?.split);

      if (distance === null || distance <= 0 || movingTimeSeconds === null || movingTimeSeconds <= 0) {
        return null;
      }

      return { distance, movingTimeSeconds, elapsedTimeSeconds: elapsedTimeSeconds ?? movingTimeSeconds, startDate, lapIndex };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.lapIndex !== null && b.lapIndex !== null) return a.lapIndex - b.lapIndex;
      if (a.startDate && b.startDate) return new Date(a.startDate) - new Date(b.startDate);
      return 0;
    });
}

function paceSecondsPer100(distanceM, timeSeconds) {
  if (!distanceM || distanceM <= 0) return null;
  return (timeSeconds / distanceM) * 100;
}

function computeSessionSummary(laps) {
  const totalDistance = laps.reduce((sum, l) => sum + l.distance, 0);
  const totalMovingTimeSeconds = laps.reduce((sum, l) => sum + l.movingTimeSeconds, 0);
  const totalElapsedTimeSeconds = laps.reduce((sum, l) => sum + l.elapsedTimeSeconds, 0);

  return {
    totalDistanceM: Math.round(totalDistance),
    totalMovingTimeSeconds: Math.round(totalMovingTimeSeconds),
    totalElapsedTimeSeconds: Math.round(totalElapsedTimeSeconds),
    avgPaceSecondsPer100: paceSecondsPer100(totalDistance, totalMovingTimeSeconds),
  };
}

// Greedily groups consecutive laps into chunks close to targetChunkDistance,
// e.g. turning a flat list of 25m pool lengths into "reps" of a 400m
// race-pace set. Closes a chunk whenever stopping is at least as close to
// the target as adding the next lap would be — a "closest sum" match
// rather than a fixed percentage threshold, so it lands exactly on clean
// divisions (16 x 25m = 400m) instead of drifting early. Rest before a
// chunk is inferred from the gap between the previous chunk's last lap and
// this chunk's first lap, when start_date is available.
function groupLapsIntoReps(laps, targetChunkDistance) {
  if (!Array.isArray(laps) || !laps.length || !targetChunkDistance) return [];

  const reps = [];
  let current = [];
  let currentDistance = 0;

  for (const lap of laps) {
    const distanceIfAdded = currentDistance + lap.distance;
    const shouldCloseBeforeAdding =
      current.length > 0 &&
      Math.abs(currentDistance - targetChunkDistance) <= Math.abs(distanceIfAdded - targetChunkDistance);

    if (shouldCloseBeforeAdding) {
      reps.push(current);
      current = [lap];
      currentDistance = lap.distance;
    } else {
      current.push(lap);
      currentDistance = distanceIfAdded;
    }
  }
  if (current.length) reps.push(current);

  return reps.map((chunkLaps, index) => {
    const distanceM = chunkLaps.reduce((sum, l) => sum + l.distance, 0);
    const swimSeconds = chunkLaps.reduce((sum, l) => sum + l.movingTimeSeconds, 0);

    let restBeforeSeconds = null;
    const prevChunkLaps = reps[index - 1];
    if (prevChunkLaps) {
      const prevLast = prevChunkLaps[prevChunkLaps.length - 1];
      const thisFirst = chunkLaps[0];
      if (prevLast?.startDate && thisFirst?.startDate) {
        const gapSeconds =
          (new Date(thisFirst.startDate) - new Date(prevLast.startDate)) / 1000 - prevLast.movingTimeSeconds;
        if (Number.isFinite(gapSeconds) && gapSeconds >= 0) restBeforeSeconds = Math.round(gapSeconds);
      }
    }

    return {
      distanceM: Math.round(distanceM),
      swimSeconds: Math.round(swimSeconds),
      paceSecondsPer100: paceSecondsPer100(distanceM, swimSeconds),
      restBeforeSeconds,
    };
  });
}

// A recorded swim includes the warm-up/build-set/cool-down laps too, not
// just the main set. Trims cumulative distance off the front and back
// (using the prescribed lead-in/lead-out distances) so rep-grouping only
// ever sees main-set laps. Falls back to the full lap list if the trim
// would remove everything (e.g. a badly cut-short session).
function isolateMainSetLaps(laps, leadInDistanceM, leadOutDistanceM) {
  if (!Array.isArray(laps) || !laps.length) return [];

  let startIndex = 0;
  if (leadInDistanceM > 0) {
    let cumulative = 0;
    while (startIndex < laps.length && cumulative < leadInDistanceM) {
      cumulative += laps[startIndex].distance;
      startIndex++;
    }
  }

  let endIndex = laps.length;
  if (leadOutDistanceM > 0) {
    let cumulative = 0;
    while (endIndex > startIndex && cumulative < leadOutDistanceM) {
      endIndex--;
      cumulative += laps[endIndex].distance;
    }
  }

  const isolated = laps.slice(startIndex, endIndex);
  return isolated.length ? isolated : laps;
}

function standardDeviation(values) {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function analyzeReps(reps, prescribed) {
  if (!reps.length) return null;

  const paces = reps.map((r) => r.paceSecondsPer100).filter((p) => p !== null);
  const avgSwimSecondsPerRep = reps.reduce((sum, r) => sum + r.swimSeconds, 0) / reps.length;
  const avgPaceSecondsPer100 = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : null;

  const half = Math.floor(paces.length / 2);
  const firstHalfAvg = half > 0 ? paces.slice(0, half).reduce((a, b) => a + b, 0) / half : null;
  const secondHalfAvg = half > 0 ? paces.slice(-half).reduce((a, b) => a + b, 0) / half : null;
  const fadeSecondsPer100 =
    firstHalfAvg !== null && secondHalfAvg !== null ? secondHalfAvg - firstHalfAvg : null;

  const restValues = reps.map((r) => r.restBeforeSeconds).filter((r) => r !== null);
  const avgRestSeconds = restValues.length ? restValues.reduce((a, b) => a + b, 0) / restValues.length : null;

  return {
    repCount: reps.length,
    prescribedRepCount: prescribed?.reps ?? null,
    avgSwimSecondsPerRep: Math.round(avgSwimSecondsPerRep),
    prescribedSwimSecondsPerRep: prescribed?.swimSecondsPerRep ?? null,
    avgPaceSecondsPer100,
    consistencyStdevSeconds: standardDeviation(paces),
    fadeSecondsPer100,
    avgRestSeconds: avgRestSeconds !== null ? Math.round(avgRestSeconds) : null,
    prescribedRestSeconds: prescribed?.restSeconds ?? null,
  };
}

// options:
//   rawStravaLaps    - raw lap array from Strava's activity laps endpoint
//   prescribedSession - a session object from a persisted training block
//                        (see lib/trainingBlockComposer.js / lib/raceSpecificSet.js)
//   cssSecondsPer100  - swimmer's current CSS, used as the reference pace
//                        for non-race-pace (real corpus) sessions
function compareSessionToPrescription({ rawStravaLaps, prescribedSession, cssSecondsPer100 }) {
  const laps = normalizeStravaLaps(rawStravaLaps);
  const summary = computeSessionSummary(laps);

  const prescribedDistanceM = toFiniteNumber(prescribedSession?.total_distance_m);
  const completionRatio =
    prescribedDistanceM && prescribedDistanceM > 0 ? summary.totalDistanceM / prescribedDistanceM : null;

  const isRacePace = prescribedSession?.source === "race-pace" && toFiniteNumber(prescribedSession?.prescribedPaceSecondsPer100) !== null;
  const referencePaceSecondsPer100 = isRacePace
    ? prescribedSession.prescribedPaceSecondsPer100
    : cssSecondsPer100;

  let repAnalysis = null;
  if (isRacePace && toFiniteNumber(prescribedSession?.prescribedDistancePerRep)) {
    const mainSetLaps = isolateMainSetLaps(
      laps,
      toFiniteNumber(prescribedSession.prescribedLeadInDistanceM) || 0,
      toFiniteNumber(prescribedSession.prescribedLeadOutDistanceM) || 0
    );
    const reps = groupLapsIntoReps(mainSetLaps, prescribedSession.prescribedDistancePerRep);
    repAnalysis = analyzeReps(reps, {
      reps: prescribedSession.prescribedReps,
      swimSecondsPerRep: prescribedSession.prescribedSwimSecondsPerRep,
      restSeconds: prescribedSession.prescribedRestSeconds,
    });
  }

  // For race-pace sessions, compare against the main set's own pace, not
  // the whole session's — warm-up/build/cool-down are deliberately swum
  // easier than goal pace, so a whole-session average always reads
  // artificially slow next to a race-pace target. Real corpus sessions have
  // no such clean main-set isolation, so they fall back to the whole
  // session's average against CSS (already labelled as approximate).
  const comparisonPaceSecondsPer100 =
    isRacePace && repAnalysis?.avgPaceSecondsPer100 !== null && repAnalysis?.avgPaceSecondsPer100 !== undefined
      ? repAnalysis.avgPaceSecondsPer100
      : summary.avgPaceSecondsPer100;

  const paceDeltaSecondsPer100 =
    comparisonPaceSecondsPer100 !== null && referencePaceSecondsPer100
      ? comparisonPaceSecondsPer100 - referencePaceSecondsPer100
      : null;

  return {
    summary,
    prescribedDistanceM,
    completionRatio,
    referenceType: isRacePace ? "goal-pace" : "css-approximate",
    referencePaceSecondsPer100,
    comparisonPaceSecondsPer100,
    paceDeltaSecondsPer100,
    repAnalysis,
  };
}

function secondsToMinSec(totalSeconds) {
  const t = Math.max(0, Math.round(totalSeconds));
  return { minutes: Math.floor(t / 60), seconds: t % 60 };
}

// Turns a comparison into advisory suggestions. Every suggestion is
// descriptive; only 'updateCss' suggestions carry a concrete action
// (?action=applyAdjustment), and only when there's enough signal to trust —
// a badly incomplete session never proposes a CSS change.
function generateAdvisorySuggestions(comparison, context = {}) {
  const suggestions = [];
  const { cssSecondsPer100, raceDistanceM } = context;
  const { completionRatio, paceDeltaSecondsPer100, referenceType, comparisonPaceSecondsPer100, repAnalysis, summary } = comparison;

  const trustworthy = completionRatio === null || completionRatio >= COMPLETION_WARNING_RATIO;

  if (completionRatio !== null && completionRatio < COMPLETION_WARNING_RATIO) {
    suggestions.push({
      id: "incomplete",
      type: "note",
      severity: "info",
      message: `You covered ${Math.round(completionRatio * 100)}% of the prescribed distance — pace comparisons below are rougher than usual with a partial session.`,
    });
  }

  if (trustworthy && paceDeltaSecondsPer100 !== null && Math.abs(paceDeltaSecondsPer100) >= PACE_DELTA_THRESHOLD_SECONDS && cssSecondsPer100) {
    const direction = paceDeltaSecondsPer100 < 0 ? "faster" : "slower";

    // Goal race pace and CSS live in different reference frames — CSS
    // approximates a ~15-20 minute effort, goal pace is CSS scaled down by
    // a race-distance fade factor (see lib/raceSpecificSet.js). A delta
    // measured against goal pace has to go back through that same fade
    // factor to imply a CSS, not be added to CSS directly — otherwise a
    // swimmer comfortably ahead of a conservative goal pace gets a wildly
    // overstated "you're this much faster" CSS suggestion.
    const impliedCssSecondsPer100 =
      referenceType === "goal-pace" && raceDistanceM && comparisonPaceSecondsPer100
        ? comparisonPaceSecondsPer100 / interpolateFadeFactor(raceDistanceM)
        : cssSecondsPer100 + paceDeltaSecondsPer100;
    const { minutes, seconds } = secondsToMinSec(impliedCssSecondsPer100);

    suggestions.push({
      id: "updateCss",
      type: "updateCss",
      severity: "info",
      message:
        referenceType === "goal-pace"
          ? `You averaged ${Math.abs(paceDeltaSecondsPer100).toFixed(1)}s/100m ${direction} than goal pace on this session. One session isn't a retest, but if this holds up across a few more, your CSS may now be closer to ${formatSecondsToTime(impliedCssSecondsPer100)}/100m.`
          : `You averaged ${Math.abs(paceDeltaSecondsPer100).toFixed(1)}s/100m ${direction} than your current CSS (${formatSecondsToTime(cssSecondsPer100)}) on this session. If that's a pattern rather than a one-off, your CSS may now be closer to ${formatSecondsToTime(impliedCssSecondsPer100)}/100m.`,
      proposedCssMinutes: minutes,
      proposedCssSeconds: seconds,
    });
  }

  if (repAnalysis && repAnalysis.fadeSecondsPer100 !== null && repAnalysis.fadeSecondsPer100 >= FADE_THRESHOLD_SECONDS) {
    suggestions.push({
      id: "fade",
      type: "note",
      severity: "warning",
      message: `You faded ${repAnalysis.fadeSecondsPer100.toFixed(1)}s/100m from the first half of the set to the second half — the pace may be a bit aggressive to hold for the full set yet, even though the average looked on target.`,
    });
  }

  if (
    repAnalysis &&
    repAnalysis.avgRestSeconds !== null &&
    repAnalysis.prescribedRestSeconds !== null &&
    repAnalysis.avgRestSeconds - repAnalysis.prescribedRestSeconds >= REST_OVERAGE_THRESHOLD_SECONDS
  ) {
    suggestions.push({
      id: "rest-overage",
      type: "note",
      severity: "warning",
      message: `You took about ${Math.round(repAnalysis.avgRestSeconds - repAnalysis.prescribedRestSeconds)}s more rest per rep than prescribed (${repAnalysis.avgRestSeconds}s vs ${repAnalysis.prescribedRestSeconds}s) — a sign the set was harder than intended today.`,
    });
  }

  if (!suggestions.length && summary.totalDistanceM > 0) {
    suggestions.push({
      id: "on-track",
      type: "note",
      severity: "positive",
      message: "Right on target — no adjustments suggested from this session.",
    });
  }

  return suggestions;
}

module.exports = {
  PACE_DELTA_THRESHOLD_SECONDS,
  FADE_THRESHOLD_SECONDS,
  REST_OVERAGE_THRESHOLD_SECONDS,
  COMPLETION_WARNING_RATIO,
  normalizeStravaLaps,
  computeSessionSummary,
  isolateMainSetLaps,
  groupLapsIntoReps,
  analyzeReps,
  compareSessionToPrescription,
  generateAdvisorySuggestions,
};
