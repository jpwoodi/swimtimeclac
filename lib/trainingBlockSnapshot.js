// Persists the most recently generated training block (and the post-set
// analyses run against it) in Vercel Blob, mirroring lib/commute-snapshot.js.
// Without this there'd be nothing for a later "analyze this swim against
// Week 3 Session 2" request to compare against — generation is otherwise
// stateless (lib/trainingBlockComposer.js takes inputs, returns a plan,
// keeps nothing).

const { get, put } = require('@vercel/blob');
const { isBlobConfigured } = require('./commute-snapshot');

const TRAINING_BLOCK_SNAPSHOT_PATH = 'training-block/active.json';
const TRAINING_BLOCK_HISTORY_PATH = 'training-block/history.json';
const TRAINING_BLOCK_SCHEMA_VERSION = 1;

// Every generated block is archived here (in addition to becoming the
// active block), so past plans aren't lost the moment a new one is
// generated. Bounded to keep the blob a reasonable size - a single-swimmer
// site generating a block every so often won't come close to this in
// practice.
const MAX_HISTORY_BLOCKS = 30;

function generateBlockId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

async function readTrainingBlockHistory() {
  if (!isBlobConfigured()) {
    return [];
  }

  const result = await get(TRAINING_BLOCK_HISTORY_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return [];
  }

  const raw = await new Response(result.stream).text();
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeTrainingBlockHistory(history) {
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return put(
    TRAINING_BLOCK_HISTORY_PATH,
    JSON.stringify(history, null, 2),
    {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }
  );
}

// Read-append-write: archives a newly generated block into the bounded
// history list (oldest dropped first), independent of whatever is
// currently the active block. Returns the archived entry (with its id).
async function archiveTrainingBlock(snapshot) {
  const history = await readTrainingBlockHistory();
  const entry = { id: generateBlockId(), ...snapshot };
  const updated = [...history, entry].slice(-MAX_HISTORY_BLOCKS);
  await writeTrainingBlockHistory(updated);
  return entry;
}

// Lightweight summaries for a list view - the full block (every week's
// full session text) is only fetched for one entry at a time via
// findHistoryBlockById, not for the whole list.
function summarizeHistoryEntry(entry) {
  return {
    id: entry.id,
    generatedAt: entry.generatedAt,
    raceDistanceM: entry.input?.raceDistanceM ?? null,
    totalWeeks: entry.block?.totalWeeks ?? null,
    sessionsPerWeek: entry.block?.sessionsPerWeek ?? null,
    goalPace: entry.block?.goalPace ?? null,
  };
}

function findHistoryBlockById(history, id) {
  return history.find((entry) => entry.id === id) || null;
}

module.exports = {
  TRAINING_BLOCK_SNAPSHOT_PATH,
  TRAINING_BLOCK_HISTORY_PATH,
  buildTrainingBlockSnapshot,
  readActiveTrainingBlock,
  writeActiveTrainingBlock,
  findPrescribedSession,
  appendSessionAnalysis,
  readTrainingBlockHistory,
  archiveTrainingBlock,
  summarizeHistoryEntry,
  findHistoryBlockById,
};
