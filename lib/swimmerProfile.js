// Persists the swimmer's current best-known CSS in Vercel Blob, plus a
// short audit trail of adjustments applied from post-set analysis
// (lib/setAnalysis.js). This is what "advisory analysis that can be
// implemented into future plans" actually means in the UI: applying a
// suggestion updates this profile, and the training block page pre-fills
// CSS from it next time it's opened. It never rewrites an already-generated
// block on its own.

const { get, put } = require('@vercel/blob');
const { isBlobConfigured } = require('./commute-snapshot');

const SWIMMER_PROFILE_PATH = 'training-block/profile.json';
const SWIMMER_PROFILE_SCHEMA_VERSION = 1;
const MAX_HISTORY_ENTRIES = 20;

async function readSwimmerProfile() {
  if (!isBlobConfigured()) {
    return null;
  }

  const result = await get(SWIMMER_PROFILE_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function writeSwimmerProfile(profile) {
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return put(
    SWIMMER_PROFILE_PATH,
    JSON.stringify(profile, null, 2),
    {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }
  );
}

// Read-append-write: applies a CSS adjustment on top of whatever profile
// currently exists (or a fresh one), keeping a bounded history.
async function applyCssAdjustment({ cssMinutes, cssSeconds, reason }) {
  const current = await readSwimmerProfile();
  const now = new Date().toISOString();

  const historyEntry = {
    appliedAt: now,
    previousCssMinutes: current?.cssMinutes ?? null,
    previousCssSeconds: current?.cssSeconds ?? null,
    newCssMinutes: cssMinutes,
    newCssSeconds: cssSeconds,
    reason: reason || null,
  };

  const history = Array.isArray(current?.history) ? current.history : [];
  const updatedHistory = [...history, historyEntry].slice(-MAX_HISTORY_ENTRIES);

  const profile = {
    schemaVersion: SWIMMER_PROFILE_SCHEMA_VERSION,
    kind: 'swimmer-profile',
    updatedAt: now,
    cssMinutes,
    cssSeconds,
    history: updatedHistory,
  };

  await writeSwimmerProfile(profile);
  return profile;
}

module.exports = {
  SWIMMER_PROFILE_PATH,
  readSwimmerProfile,
  writeSwimmerProfile,
  applyCssAdjustment,
};
