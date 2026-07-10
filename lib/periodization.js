// Deterministic periodization: turns "N weeks until race day" into a
// week-by-week training block (base / build / peak / taper phases), each
// week carrying a volume multiplier and a target session-type mix.
//
// This is coaching structure, not something mined from the template corpus
// (the corpus is a curated bank of individual real sessions spanning years,
// not a continuous training log) — see lib/trainingBlockComposer.js for how
// this plan gets filled in with real sets.

const { TEMPLATE_TYPES } = require("./templateSelection");

const MIN_WEEKS = 1;
const MAX_WEEKS = 52;

// Fraction of a week's sessions that should be each type, per phase.
const PHASE_TYPE_FRACTIONS = {
  base:  { mileage: 0.40, im: 0.25, kitchen_sink: 0.25, fast: 0.10 },
  build: { mileage: 0.30, im: 0.20, kitchen_sink: 0.15, fast: 0.35 },
  peak:  { mileage: 0.20, im: 0.10, kitchen_sink: 0.10, fast: 0.60 },
  taper: { mileage: 0.50, im: 0.15, kitchen_sink: 0.15, fast: 0.20 },
};

const PHASE_LABELS = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

const PHASE_DESCRIPTIONS = {
  base: "Build your aerobic engine — mostly steady mileage with variety, volume ramping up gradually.",
  build: "Add threshold and race-pace work on top of the aerobic base; volume holds steady.",
  peak: "Race-pace-specific work takes over; total volume eases slightly so quality goes up.",
  taper: "Cut volume sharply, keep a little race-pace sharpness, arrive fresh.",
};

function clampWeeks(weeks) {
  const w = Math.round(Number(weeks));
  if (!Number.isFinite(w)) return MIN_WEEKS;
  return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, w));
}

// Split total weeks into base/build/peak/taper phase lengths.
function allocatePhaseLengths(totalWeeks) {
  const w = totalWeeks;

  if (w <= 2) {
    return [{ phase: "taper", length: w }];
  }
  if (w === 3) {
    return [{ phase: "peak", length: 1 }, { phase: "taper", length: 2 }];
  }
  if (w <= 5) {
    const taper = 1;
    const peak = 1;
    const build = Math.max(0, w - taper - peak);
    const phases = [];
    if (build > 0) phases.push({ phase: "build", length: build });
    phases.push({ phase: "peak", length: peak });
    phases.push({ phase: "taper", length: taper });
    return phases;
  }

  const taper = w <= 10 ? 1 : 2;
  let peak = Math.max(1, Math.round(w * 0.15));
  let build = Math.max(1, Math.round(w * 0.30));
  let base = w - taper - peak - build;

  if (base < 1) {
    let deficit = 1 - base;
    const reduceFromBuild = Math.min(deficit, Math.max(0, build - 1));
    build -= reduceFromBuild;
    deficit -= reduceFromBuild;
    const reduceFromPeak = Math.min(deficit, Math.max(0, peak - 1));
    peak -= reduceFromPeak;
    base = w - taper - peak - build;
  }

  return [
    { phase: "base", length: base },
    { phase: "build", length: build },
    { phase: "peak", length: peak },
    { phase: "taper", length: taper },
  ];
}

// Linear ramp helper: index i of [0, length) maps to a value between
// `from` and `to` (inclusive at both ends when length > 1).
function rampValue(i, length, from, to) {
  if (length <= 1) return (from + to) / 2;
  return from + (to - from) * (i / (length - 1));
}

function volumeMultiplierFor(phase, indexInPhase, phaseLength) {
  switch (phase) {
    case "base":
      return rampValue(indexInPhase, phaseLength, 0.70, 1.00);
    case "build":
      return rampValue(indexInPhase, phaseLength, 1.00, 1.05);
    case "peak":
      return rampValue(indexInPhase, phaseLength, 0.95, 0.85);
    case "taper":
      return rampValue(indexInPhase, phaseLength, 0.65, 0.45);
    default:
      return 1.0;
  }
}

// Largest-remainder rounding: turn fractional type targets into integer
// counts that sum to exactly `sessionsPerWeek`.
function allocateSessionCounts(sessionsPerWeek, fractions) {
  const types = TEMPLATE_TYPES.filter((t) => t in fractions);
  const exact = types.map((type) => ({ type, value: sessionsPerWeek * fractions[type] }));
  const floors = exact.map(({ type, value }) => ({ type, count: Math.floor(value), remainder: value - Math.floor(value) }));

  const allocated = floors.reduce((sum, f) => sum + f.count, 0);
  const remaining = sessionsPerWeek - allocated;
  const byRemainder = [...floors].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < remaining; i++) {
    byRemainder[i % byRemainder.length].count += 1;
  }

  const counts = {};
  floors.forEach((f) => { counts[f.type] = f.count; });
  return counts;
}

// Turn {mileage: 2, fast: 1, ...} into an ordered array of length S,
// interleaving types so the same type doesn't repeat back-to-back
// when an alternative is available.
function orderSessionTypes(counts) {
  const remaining = { ...counts };
  const order = [];
  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  let last = null;

  for (let i = 0; i < total; i++) {
    const candidates = Object.entries(remaining)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!candidates.length) break;

    const pick = candidates.find(([type]) => type !== last) || candidates[0];
    order.push(pick[0]);
    remaining[pick[0]] -= 1;
    last = pick[0];
  }

  return order;
}

// Build the full week-by-week plan.
//
// options:
//   weeksUntilRace   - integer, required
//   sessionsPerWeek  - integer, required
function buildPeriodizationPlan(options) {
  const { weeksUntilRace, sessionsPerWeek } = options || {};
  const totalWeeks = clampWeeks(weeksUntilRace);
  const sessionsPerWeekClamped = Math.max(1, Math.min(14, Math.round(Number(sessionsPerWeek) || 1)));

  const phaseLengths = allocatePhaseLengths(totalWeeks);

  const phases = [];
  const weeks = [];
  let weekNumber = 0;
  let phaseStartWeek = 1;

  for (const { phase, length } of phaseLengths) {
    if (length <= 0) continue;

    for (let i = 0; i < length; i++) {
      weekNumber += 1;
      let volumeMultiplier = volumeMultiplierFor(phase, i, length);

      // Deload every 4th week of accumulation phases — a standard way to
      // avoid grinding straight through 6+ weeks of rising volume.
      const isDeload = (phase === "base" || phase === "build") && weekNumber % 4 === 0;
      if (isDeload) volumeMultiplier *= 0.8;

      const counts = allocateSessionCounts(sessionsPerWeekClamped, PHASE_TYPE_FRACTIONS[phase]);
      const sessionTypes = orderSessionTypes(counts);

      weeks.push({
        weekNumber,
        phase,
        phaseLabel: PHASE_LABELS[phase],
        volumeMultiplier: Math.round(volumeMultiplier * 100) / 100,
        isDeload,
        sessionTypes,
      });
    }

    phases.push({
      phase,
      label: PHASE_LABELS[phase],
      description: PHASE_DESCRIPTIONS[phase],
      startWeek: phaseStartWeek,
      endWeek: phaseStartWeek + length - 1,
      length,
    });
    phaseStartWeek += length;
  }

  return {
    totalWeeks,
    sessionsPerWeek: sessionsPerWeekClamped,
    phases,
    weeks,
  };
}

module.exports = {
  PHASE_TYPE_FRACTIONS,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  allocatePhaseLengths,
  allocateSessionCounts,
  orderSessionTypes,
  buildPeriodizationPlan,
};
