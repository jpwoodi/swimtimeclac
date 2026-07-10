// CI smoke test: loads every serverless function and lib module, validates
// the checked-in template bundle, and exercises the browseSwimPlans and
// generateTrainingBlock handlers end-to-end. Exits non-zero on the first
// failure.
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

  // 6. generateTrainingBlock handler end-to-end (fully deterministic, no
  // external API call).
  const generateTrainingBlock = require(path.join(root, 'api', 'generateTrainingBlock'));
  const reqHeaders = { origin: 'http://localhost', host: 'localhost' };

  res = mockRes();
  await generateTrainingBlock({
    method: 'POST',
    headers: reqHeaders,
    query: {},
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
  await generateTrainingBlock({ method: 'POST', headers: reqHeaders, query: {}, body: {} }, res);
  assert.strictEqual(res.statusCode, 400, 'missing fields rejected');

  console.log('generateTrainingBlock smoke ok');
  console.log('ALL CHECKS PASSED');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
