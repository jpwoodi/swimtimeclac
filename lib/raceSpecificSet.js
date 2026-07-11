// Generates race-pace-specific sessions for the peak/taper phases of a
// training block. The real plan corpus (data/templates.v2.json) is a bank
// of general masters practice sets — it has nothing written for "your 10k
// in 6 weeks", so this phase's main sets are computed directly from the
// swimmer's goal pace instead of pulled from the corpus.

const {
  roundUpToNearest5,
  formatSecondsToTime,
  calculateIntervalSendoffSeconds,
  estimateTargetDistanceMetersFromSeconds,
} = require("./cssPacing");

// Fade-factor anchors: how much slower than CSS pace (per 100m) a swimmer's
// sustainable pace typically is at a given race distance. CSS approximates
// sustainable pace for a ~15-20 minute effort; longer races are swum
// noticeably slower per 100m. Piecewise-linear between anchors, clamped at
// the ends. This is a coarse estimate — a supplied target time is always
// preferred over this fallback.
const FADE_ANCHORS = [
  [400, 0.98],
  [1500, 1.00],
  [3000, 1.04],
  [5000, 1.08],
  [10000, 1.15],
  [20000, 1.20],
];

function interpolateFadeFactor(distanceM) {
  if (distanceM <= FADE_ANCHORS[0][0]) return FADE_ANCHORS[0][1];
  const last = FADE_ANCHORS[FADE_ANCHORS.length - 1];
  if (distanceM >= last[0]) return last[1];

  for (let i = 0; i < FADE_ANCHORS.length - 1; i++) {
    const [d0, f0] = FADE_ANCHORS[i];
    const [d1, f1] = FADE_ANCHORS[i + 1];
    if (distanceM >= d0 && distanceM <= d1) {
      const t = (distanceM - d0) / (d1 - d0);
      return f0 + (f1 - f0) * t;
    }
  }
  return last[1];
}

// Returns { paceSecondsPer100, estimated } or null if neither a target
// time nor a CSS pace is available to derive a pace from.
function computeGoalPaceSecondsPer100({ targetTimeSeconds, raceDistanceM, cssSecondsPer100 }) {
  if (
    typeof targetTimeSeconds === "number" &&
    targetTimeSeconds > 0 &&
    typeof raceDistanceM === "number" &&
    raceDistanceM > 0
  ) {
    return {
      paceSecondsPer100: (targetTimeSeconds / raceDistanceM) * 100,
      estimated: false,
    };
  }

  if (
    typeof cssSecondsPer100 === "number" &&
    cssSecondsPer100 > 0 &&
    typeof raceDistanceM === "number" &&
    raceDistanceM > 0
  ) {
    const fade = interpolateFadeFactor(raceDistanceM);
    return {
      paceSecondsPer100: cssSecondsPer100 * fade,
      estimated: true,
    };
  }

  return null;
}

// Pick a main-set repeat "chunk" distance appropriate to the race distance:
// short races get shorter repeats, long ones get longer repeats, always a
// round number of metres.
function chooseChunkDistance(raceDistanceM) {
  const raw = raceDistanceM * 0.04;
  const rounded = Math.round(raw / 50) * 50;
  return Math.max(200, Math.min(800, rounded));
}

// Builds one race-pace-specific session: warm-up, a short CSS-paced build
// primer, a main set of repeats at goal race pace, and an easy cool-down.
//
// options:
//   raceDistanceM       - target race distance in metres
//   paceSecondsPer100    - goal race pace, seconds per 100m
//   cssSecondsPer100     - swimmer's CSS, seconds per 100m (for warm-up/build pacing)
//   sessionDurationMin   - target session length in minutes
//   phase                - 'peak' | 'taper' (taper uses shorter rest / lighter volume)
function buildRacePaceSession({ raceDistanceM, paceSecondsPer100, cssSecondsPer100, sessionDurationMin, phase }) {
  const totalDistance =
    estimateTargetDistanceMetersFromSeconds(cssSecondsPer100, sessionDurationMin) || 2400;

  const warmupDistance = Math.max(200, Math.min(600, Math.round((totalDistance * 0.15) / 50) * 50));
  const buildSetReps = 4;
  const buildSetDistanceEach = 100;
  const coolDownDistance = phase === "taper" ? 150 : 200;

  const nonMainDistance = warmupDistance + buildSetReps * buildSetDistanceEach + coolDownDistance;
  const mainSetTargetDistance = Math.max(400, totalDistance - nonMainDistance);

  const chunkDistance = chooseChunkDistance(raceDistanceM);
  const repeatCount = Math.max(2, Math.round(mainSetTargetDistance / chunkDistance));
  const restSeconds = phase === "taper" ? 15 : 20;

  const chunkSwimSeconds = roundUpToNearest5((paceSecondsPer100 * chunkDistance) / 100);
  const chunkSendoffSeconds = roundUpToNearest5(chunkSwimSeconds + restSeconds);

  const buildSendoffSeconds = calculateIntervalSendoffSeconds(cssSecondsPer100, buildSetDistanceEach, "z2");

  const warm_up = `${warmupDistance - 100} Easy Free + 100 Pull, build the last 100 to moderate`;
  const build_set = `${buildSetReps} x ${buildSetDistanceEach} Descend 1-4 to CSS pace on ${formatSecondsToTime(buildSendoffSeconds)}`;
  const main_set = `${repeatCount} x ${chunkDistance} Free @ goal race pace (${formatSecondsToTime(chunkSwimSeconds)}/${chunkDistance}m) on ${formatSecondsToTime(chunkSendoffSeconds)}`;
  const cool_down = `${coolDownDistance} Easy Free`;

  const total_distance_m =
    warmupDistance + buildSetReps * buildSetDistanceEach + repeatCount * chunkDistance + coolDownDistance;

  return {
    warm_up,
    build_set,
    main_set,
    cool_down,
    total_distance_m,
    // Structured, exact main-set targets — kept alongside the human-readable
    // text so post-set analysis (lib/setAnalysis.js) never has to re-parse
    // its own generated prose to know what was actually prescribed.
    prescribedReps: repeatCount,
    prescribedDistancePerRep: chunkDistance,
    prescribedSwimSecondsPerRep: chunkSwimSeconds,
    prescribedRestSeconds: restSeconds,
    prescribedPaceSecondsPer100: paceSecondsPer100,
    // Distance either side of the main set, so analysis can isolate the
    // main-set laps out of a full recorded session before grouping them
    // into reps (a recorded swim includes the warm-up/build/cool-down too).
    prescribedLeadInDistanceM: warmupDistance + buildSetReps * buildSetDistanceEach,
    prescribedLeadOutDistanceM: coolDownDistance,
  };
}

module.exports = {
  FADE_ANCHORS,
  interpolateFadeFactor,
  computeGoalPaceSecondsPer100,
  chooseChunkDistance,
  buildRacePaceSession,
};
