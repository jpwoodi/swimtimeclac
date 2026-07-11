// Persists the most recently generated training block (and the post-set
// analyses run against it) in Vercel Blob, mirroring lib/commute-snapshot.js.
// Without this there'd be nothing for a later "analyze this swim against
// Week 3 Session 2" request to compare against — generation is otherwise
// stateless (lib/trainingBlockComposer.js takes inputs, returns a plan,
// keeps nothing).

const { get, put } = require('@vercel/blob');
const { isBlobConfigured } = require('./commute-snapshot');

const TRAINING_BLOCK_SNAPSHOT_PATH = 'training-block/active.json';
const TRAINING_BLOCK_SCHEMA_VERSION = 1;

function buildTrainingBlockSnapshot(input, block) {
  return {
    schemaVersion: TRAINING_BLOCK_SCHEMA_VERSION,
    kind: 'training-block',
    generatedAt: new Date().toISOString(),
    input,
    block,
    analyses: [],
  };
}

async function readActiveTrainingBlock() {
  if (!isBlobConfigured()) {
    return null;
  }

  const result = await get(TRAINING_BLOCK_SNAPSHOT_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function writeActiveTrainingBlock(snapshot) {
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return put(
    TRAINING_BLOCK_SNAPSHOT_PATH,
    JSON.stringify(snapshot, null, 2),
    {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }
  );
}

// Finds the prescribed session for {weekNumber, session} inside a
// persisted block, or null if the block doesn't have one (e.g. stale block
// from a differently-sized plan).
function findPrescribedSession(snapshot, weekNumber, session) {
  const week = snapshot?.block?.weeks?.find((w) => w.weekNumber === weekNumber);
  if (!week) return null;
  return week.sessions?.find((s) => s.session === session) || null;
}

// Read-append-write: fetches the current active block, appends one
// analysis record, writes it back, and returns the updated snapshot. Not
// atomic (Vercel Blob has no transactions) — acceptable here since this is
// a single-swimmer site with no concurrent-write scenario in practice.
async function appendSessionAnalysis(analysisRecord) {
  const snapshot = await readActiveTrainingBlock();
  if (!snapshot) {
    throw new Error('No active training block to analyze against. Generate a block first.');
  }

  snapshot.analyses = Array.isArray(snapshot.analyses) ? snapshot.analyses : [];
  snapshot.analyses.push(analysisRecord);

  await writeActiveTrainingBlock(snapshot);
  return snapshot;
}

module.exports = {
  TRAINING_BLOCK_SNAPSHOT_PATH,
  buildTrainingBlockSnapshot,
  readActiveTrainingBlock,
  writeActiveTrainingBlock,
  findPrescribedSession,
  appendSessionAnalysis,
};
