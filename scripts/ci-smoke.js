// CI smoke test: loads every serverless function and lib module, validates
// the checked-in template bundle, and exercises the browseSwimPlans and
// trainingBlock handlers end-to-end. Exits non-zero on the first failure.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.AUTH_ENABLED = 'false';

const root = path.join(__dirname, '..');

// 1. Every module must load cleanly.
for (const dir of ['api', 'lib']) {
  for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js'))) {
    require(path.join(root, dir, file));
    console.log(`loaded ${dir}/${file}`);
  }
}

// 2. The template bundle must parse and look like a v2 bundle.
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'data', 'templates.v2.json'), 'utf-8'));
assert(Array.isArray(bundle.templates) && bundle.templates.length > 0, 'bundle has templates');
const planIds = new Set(bundle.templates.map((t) => t.plan_id));
assert.strictEqual(planIds.size, bundle.templates.length, 'plan_ids are unique');
for (const t of bundle.templates.slice(0, 5)) {
  assert(typeof t.raw_text === 'string' && t.raw_text.length > 0, 'templates have raw_text');
  assert(typeof t.plan_type_key === 'string', 'templates have plan_type_key');
}
console.log(`bundle ok: ${bundle.templates.length} plans, version ${bundle.version}`);

// 3. Session tokens must round-trip.
const { createSessionToken, verifySessionToken } = require(path.join(root, 'lib', 'auth-utils'));
assert(verifySessionToken(createSessionToken('s3cret'), 's3cret'), 'valid token verifies');
assert(!verifySessionToken(createSessionToken('s3cret'), 'other'), 'wrong secret rejected');
console.log('auth token round-trip ok');

// 4. browseSwimPlans handler end-to-end.
const browse = require(path.join(root, 'api', 'browseSwimPlans'));

function mockRes() {
  return {
    statusCode: null,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; },
  };
}

(async () => {
  let res = mockRes();
  await browse({ method: 'GET', query: {}, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200, 'list returns 200');
  assert(res.body.plans.length > 0, 'list returns plans');
  assert(!res.body.plans.some((p) => 'raw_text' in p), 'list omits raw_text');

  res = mockRes();
  await browse({ method: 'GET', query: { action: 'getFilterOptions' }, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200, 'filter options return 200');
  assert(res.body.totalPlans > 0, 'filter options include totals');

  res = mockRes();
  const planId = bundle.templates[0].plan_id;
  await browse({ method: 'GET', query: { action: 'getPlan', planId }, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200, 'plan detail returns 200');
  assert(res.body.plan.raw_text.length > 0, 'plan detail includes raw_text');

  res = mockRes();
  await browse({ method: 'GET', query: { action: 'getPlan', planId: 'missing' }, headers: {} }, res);
  assert.strictEqual(res.statusCode, 404, 'unknown plan returns 404');

  console.log('browseSwimPlans smoke ok');

  // 5. Periodization invariants: session/week counts and phase contiguity
  // hold across a spread of block lengths and weekly session counts.
  const { buildPeriodizationPlan } = require(path.join(root, 'lib', 'periodization'));
  for (const weeks of [1, 2, 3, 6, 8, 16, 26]) {
    for (const sessionsPerWeek of [2, 4, 6]) {
      const plan = buildPeriodizationPlan({ weeksUntilRace: weeks, sessionsPerWeek });
      assert.strictEqual(plan.weeks.length, weeks, `week count for ${weeks}w`);
      plan.weeks.forEach((w) => {
        assert.strictEqual(w.sessionTypes.length, sessionsPerWeek, `session count for ${weeks}w/${sessionsPerWeek}spw`);
        assert(w.volumeMultiplier > 0, 'positive volume multiplier');
      });
      const phaseSum = plan.phases.reduce((sum, p) => sum + p.length, 0);
      assert.strictEqual(phaseSum, weeks, `phase lengths sum for ${weeks}w`);
    }
  }
  console.log('periodization invariants ok');

  // 6. Corpus footnote/legend extraction: real source docs run a "Notes
  // for this set:" header straight into the preceding line with no line
  // break (e.g. "Cool DownNote for this set:") - that must end up in the
  // notes side, not stuck in the visible main set. Term/abbreviation
  // definitions with no header at all ("DPS = Distance Per Stroke") get
  // the same treatment. But a per-rep instruction ("#1, 4 = Build",
  // "Odds = Kick") is real set content, not a footnote, and must NOT be
  // extracted - it tells the swimmer what specific reps actually do.
  const { splitTrailingNotes, extractLegendLines } = require(path.join(root, 'lib', 'trainingBlockComposer'));

  const merged = splitTrailingNotes('1 x 100 Easy\nCool DownNote for this set:\nDPS = Distance Per Stroke');
  assert.strictEqual(merged.main, '1 x 100 Easy\nCool Down', 'merged header line splits at the header, keeping real content');
  assert.strictEqual(merged.notes, 'DPS = Distance Per Stroke', 'merged header line moves the definition to notes');

  const definitions = extractLegendLines('4 x 50 IMO - Drill / Swim by 25 on :15 Rest\nDPS = Distance Per Stroke\nIMO = Individual Medley Order');
  assert.strictEqual(definitions.main, '4 x 50 IMO - Drill / Swim by 25 on :15 Rest', 'header-less term definitions are pulled out of the main set');
  assert.strictEqual(definitions.legendNotes, 'DPS = Distance Per Stroke\nIMO = Individual Medley Order', 'extracted definitions preserve original order');

  const repInstructions = extractLegendLines('8 x 50 Swim - Speed Play on 1:00\n#1, 4 = Build\nOdds = Kick\n1 x 50 Easy');
  assert.strictEqual(
    repInstructions.main,
    '8 x 50 Swim - Speed Play on 1:00\n#1, 4 = Build\nOdds = Kick\n1 x 50 Easy',
    'per-rep instructions ("#1, 4 = Build", "Odds = Kick") stay visible - they are real set content, not footnotes'
  );
  assert.strictEqual(repInstructions.legendNotes, '', 'per-rep instructions are never mistaken for legend definitions');

  const realInterval = extractLegendLines('4 x 100 Free - Rotate FAST 25 on 1:40\nCool Down');
  assert.strictEqual(realInterval.legendNotes, '', 'a real interval line is never mistaken for a legend line');

  console.log('corpus footnote/legend extraction ok');

  // 6b. Pace-table conversion carries a rep-count/distance anchor forward
  // to sub-rows that split those same reps into pace groups without
  // restating the distance (e.g. "10 x 50 Free" followed by
  // "#1 -> 3 = Descend\t1:00\t1:05\t1:15\t1:20\t[:20 Rest]"). Without the
  // fallback, those sub-rows fell through unconverted and showed raw
  // generic-ability-group times instead of one CSS-personalized sendoff -
  // exactly the bug surfaced by a real generated session.
  const { convertPaceTableText } = require(path.join(root, 'lib', 'cssPacing'));
  const subGroupText = [
    '10 x 50 Free',
    '#1 -> 3 = Descend \t1:00\t1:05\t1:15\t1:20\t[:20 Rest]',
    '#5 -> 7 = Fast in the Black\t0:55\t1:00\t1:10\t[1:15]\t[:20 Rest]',
  ].join('\n');
  const converted = convertPaceTableText(subGroupText, 'main_set', 95).text;
  assert(!/\d:\d\d\t/.test(converted), 'pace sub-group rows no longer leak raw tab-separated generic times');
  assert(/#1 -> 3 = Descend on \d:\d\d/.test(converted), 'pace sub-group row gets one CSS-personalized sendoff, inheriting distance from the "10 x 50" line above it');

  console.log('pace-table distance carry-through ok');

  // 7. trainingBlock ?action=generate handler end-to-end (fully
  // deterministic, no external API call).
  const trainingBlock = require(path.join(root, 'api', 'trainingBlock'));
  const reqHeaders = { origin: 'http://localhost', host: 'localhost' };

  res = mockRes();
  await trainingBlock({
    method: 'POST',
    headers: reqHeaders,
    query: { action: 'generate' },
    body: {
      raceDistanceM: 10000,
      weeksUntilRace: 8,
      sessionsPerWeek: 4,
      sessionDurationMin: 60,
      cssMinutes: 1,
      cssSeconds: 35,
      targetTimeSeconds: 2.5 * 3600,
    },
  }, res);
  assert.strictEqual(res.statusCode, 200, 'training block generates');
  assert.strictEqual(res.body.weeks.length, 8, 'training block has 8 weeks');
  assert.strictEqual(res.body.weeks[0].sessions.length, 4, 'each week has 4 sessions');
  assert(res.body.weeks.every((w) => w.sessions.every((s) => s.main_set && s.main_set.length > 0)), 'every session has content');
  assert(res.body.goalPace && res.body.goalPace.estimated === false, 'goal pace uses supplied target time');

  res = mockRes();
  await trainingBlock({ method: 'POST', headers: reqHeaders, query: { action: 'generate' }, body: {} }, res);
  assert.strictEqual(res.statusCode, 400, 'missing fields rejected');

  res = mockRes();
  await trainingBlock({ method: 'POST', headers: reqHeaders, query: {}, body: {} }, res);
  assert.strictEqual(res.statusCode, 400, 'missing action rejected');

  console.log('trainingBlock smoke ok');

  // 7b. Training block history: every generated block is archived, not
  // just the active one. Blob isn't configured in CI, so the endpoints
  // must degrade gracefully (empty list, 404 for an unknown id) rather
  // than error - and the pure summarize/find helpers are checked directly.
  const { summarizeHistoryEntry, findHistoryBlockById } = require(path.join(root, 'lib', 'trainingBlockSnapshot'));

  const fakeEntry = {
    id: 'abc123',
    generatedAt: '2026-01-01T00:00:00.000Z',
    input: { raceDistanceM: 5000 },
    block: { totalWeeks: 12, sessionsPerWeek: 3, goalPace: { formatted: '1:30', estimated: true } },
  };
  const summary = summarizeHistoryEntry(fakeEntry);
  assert.deepStrictEqual(summary, {
    id: 'abc123',
    generatedAt: '2026-01-01T00:00:00.000Z',
    raceDistanceM: 5000,
    totalWeeks: 12,
    sessionsPerWeek: 3,
    goalPace: { formatted: '1:30', estimated: true },
    label: null,
  }, 'summarizeHistoryEntry pulls a lightweight summary, not the full block');
  assert.strictEqual(summarizeHistoryEntry({ ...fakeEntry, label: 'Dart 10k prep' }).label, 'Dart 10k prep', 'summarizeHistoryEntry carries a custom label through');
  assert.strictEqual(findHistoryBlockById([fakeEntry], 'abc123'), fakeEntry, 'findHistoryBlockById finds a matching entry');
  assert.strictEqual(findHistoryBlockById([fakeEntry], 'missing'), null, 'findHistoryBlockById returns null for an unknown id');

  res = mockRes();
  await trainingBlock({ method: 'GET', headers: reqHeaders, query: { action: 'listBlockHistory' } }, res);
  assert.strictEqual(res.statusCode, 200, 'listBlockHistory returns 200 even without Blob configured');
  assert.deepStrictEqual(res.body.blocks, [], 'listBlockHistory returns an empty list without Blob configured');

  res = mockRes();
  await trainingBlock({ method: 'GET', headers: reqHeaders, query: { action: 'getBlockFromHistory', id: 'nonexistent' } }, res);
  assert.strictEqual(res.statusCode, 404, 'getBlockFromHistory 404s for an unknown id');

  res = mockRes();
  await trainingBlock({ method: 'GET', headers: reqHeaders, query: { action: 'getBlockFromHistory' } }, res);
  assert.strictEqual(res.statusCode, 400, 'getBlockFromHistory requires an id');

  // Managing history (rename/delete): without Blob configured, delete is a
  // no-op success (nothing to delete) and rename correctly 404s (nothing
  // to rename), rather than throwing.
  res = mockRes();
  await trainingBlock({ method: 'POST', headers: reqHeaders, query: { action: 'deleteBlockFromHistory' }, body: { id: 'nonexistent' } }, res);
  assert.strictEqual(res.statusCode, 200, 'deleteBlockFromHistory is a no-op success for an unknown id');
  assert.deepStrictEqual(res.body.blocks, [], 'deleteBlockFromHistory returns the (empty) remaining list');

  res = mockRes();
  await trainingBlock({ method: 'POST', headers: reqHeaders, query: { action: 'deleteBlockFromHistory' }, body: {} }, res);
  assert.strictEqual(res.statusCode, 400, 'deleteBlockFromHistory requires an id');

  res = mockRes();
  await trainingBlock({ method: 'POST', headers: reqHeaders, query: { action: 'renameBlockInHistory' }, body: { id: 'nonexistent', label: 'Test' } }, res);
  assert.strictEqual(res.statusCode, 404, 'renameBlockInHistory 404s for an unknown id');

  res = mockRes();
  await trainingBlock({ method: 'POST', headers: reqHeaders, query: { action: 'renameBlockInHistory' }, body: { label: 'Test' } }, res);
  assert.strictEqual(res.statusCode, 400, 'renameBlockInHistory requires an id');

  // Backfill: a block generated before archiving existed (or from any
  // other partial-write gap) has no matching history entry - it should
  // get archived automatically the next time it's read as the active
  // block, rather than sitting there forever un-archived. A no-op when
  // there's no active block to backfill in the first place.
  const { backfillActiveBlockIntoHistory } = require(path.join(root, 'lib', 'trainingBlockSnapshot'));
  assert.strictEqual(await backfillActiveBlockIntoHistory(null), null, 'backfill is a no-op when there is no active block');

  res = mockRes();
  await trainingBlock({ method: 'GET', headers: reqHeaders, query: { action: 'getActiveBlock' } }, res);
  assert.strictEqual(res.statusCode, 200, 'getActiveBlock returns 200 even without Blob configured');
  assert.deepStrictEqual(res.body, { active: false }, 'getActiveBlock reports inactive without Blob configured');

  console.log('trainingBlock history smoke ok');

  // 8. Post-set analysis math: build a race-pace session, synthesize laps
  // that match it almost exactly, and confirm the comparison reports a
  // clean on-target result. This guards the rep-grouping/pace-comparison
  // logic specifically - both bugs found while building it (chunk
  // boundaries drifting on coarse lap sizes, and comparing against the
  // whole session's pace instead of the isolated main set) would silently
  // reappear here if regressed.
  const { buildRacePaceSession } = require(path.join(root, 'lib', 'raceSpecificSet'));
  const { compareSessionToPrescription, generateAdvisorySuggestions } = require(path.join(root, 'lib', 'setAnalysis'));

  const prescribed = { session_type: 'fast', source: 'race-pace', ...buildRacePaceSession({
    raceDistanceM: 10000, paceSecondsPer100: 90, cssSecondsPer100: 95, sessionDurationMin: 60, phase: 'peak',
  }) };

  const syntheticLaps = (() => {
    const laps = [];
    let t = 0;
    const start = new Date('2026-01-01T09:00:00Z').getTime();
    const addBlock = (totalDist, totalTime, poolLength = 25) => {
      const lengths = Math.round(totalDist / poolLength);
      const perLen = totalTime / lengths;
      for (let l = 0; l < lengths; l++) {
        laps.push({ distance: poolLength, moving_time: perLen, elapsed_time: perLen, start_date: new Date(start + t * 1000).toISOString(), lap_index: laps.length + 1 });
        t += perLen;
      }
    };
    addBlock(prescribed.prescribedLeadInDistanceM, prescribed.prescribedLeadInDistanceM / 100 * 130);
    for (let r = 0; r < prescribed.prescribedReps; r++) {
      addBlock(prescribed.prescribedDistancePerRep, prescribed.prescribedSwimSecondsPerRep);
      t += prescribed.prescribedRestSeconds;
    }
    addBlock(prescribed.prescribedLeadOutDistanceM, prescribed.prescribedLeadOutDistanceM / 100 * 130);
    return laps;
  })();

  const comparison = compareSessionToPrescription({ rawStravaLaps: syntheticLaps, prescribedSession: prescribed, cssSecondsPer100: 95 });
  assert.strictEqual(comparison.repAnalysis.repCount, prescribed.prescribedReps, 'rep grouping matches prescribed rep count exactly');
  assert(Math.abs(comparison.repAnalysis.avgRestSeconds - prescribed.prescribedRestSeconds) <= 1, 'rest detection matches prescribed rest');
  assert(Math.abs(comparison.paceDeltaSecondsPer100) < 1, 'on-target synthetic swim should show ~0 pace delta');

  const suggestions = generateAdvisorySuggestions(comparison, { cssSecondsPer100: 95, raceDistanceM: 10000 });
  assert(suggestions.some((s) => s.id === 'on-track'), 'on-target session should suggest on-track, not a CSS change');

  console.log('setAnalysis smoke ok');
  console.log('ALL CHECKS PASSED');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
