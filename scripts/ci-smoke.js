// CI smoke test: loads every serverless function and lib module, validates
// the checked-in template bundle, and exercises the browseSwimPlans handler
// end-to-end. Exits non-zero on the first failure.
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
  console.log('ALL CHECKS PASSED');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
