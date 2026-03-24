const fetch = require('node-fetch');
const { get, put } = require('@vercel/blob');
const { filterCommuteRides, isBlobConfigured } = require('./commute-snapshot');
const { buildStravaApiError, getAccessToken, fetchAllActivities } = require('./strava');

const SEGMENT_SNAPSHOT_PATH = 'commute/segments.json';
const SEGMENT_SNAPSHOT_SCHEMA_VERSION = 2;
const DETAIL_REQUEST_BUDGET = 80;
const DETAIL_BATCH_SIZE = 10;

function selectRidesForSync(unsyncedRides, limit) {
  if (unsyncedRides.length <= limit) {
    return unsyncedRides;
  }

  const selected = [];
  let newestIndex = 0;
  let oldestIndex = unsyncedRides.length - 1;

  while (selected.length < limit && newestIndex <= oldestIndex) {
    selected.push(unsyncedRides[newestIndex]);
    newestIndex += 1;

    if (selected.length >= limit || newestIndex > oldestIndex) {
      break;
    }

    selected.push(unsyncedRides[oldestIndex]);
    oldestIndex -= 1;
  }

  return selected.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
}

function getSnapshotSegmentPayload(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      segments: {},
      efforts: [],
      activityCount: 0,
      syncedRideCount: 0,
      pendingRideCount: 0,
      oldestActivityDate: null,
      newestActivityDate: null,
      isBackfillComplete: false,
    };
  }

  return {
    segments: snapshot.segments && typeof snapshot.segments === 'object' ? snapshot.segments : {},
    efforts: Array.isArray(snapshot.efforts) ? snapshot.efforts : [],
    activityCount: Number.isFinite(snapshot.activityCount) ? snapshot.activityCount : 0,
    syncedRideCount: Number.isFinite(snapshot.syncedRideCount) ? snapshot.syncedRideCount : 0,
    pendingRideCount: Number.isFinite(snapshot.pendingRideCount) ? snapshot.pendingRideCount : 0,
    oldestActivityDate: snapshot.oldestActivityDate || null,
    newestActivityDate: snapshot.newestActivityDate || null,
    isBackfillComplete: Boolean(snapshot.isBackfillComplete),
  };
}

function getSnapshotSyncedRideIds(snapshot) {
  if (snapshot && Array.isArray(snapshot.syncedRideIds)) {
    return snapshot.syncedRideIds.map(id => String(id));
  }

  const payload = getSnapshotSegmentPayload(snapshot);
  return [...new Set(payload.efforts.map(effort => String(effort.activityId)))];
}

function buildSegmentSnapshot(payload, meta = {}) {
  const generatedAt = new Date().toISOString();
  return {
    schemaVersion: SEGMENT_SNAPSHOT_SCHEMA_VERSION,
    kind: 'commute-segments',
    generatedAt,
    source: meta.source || 'manual',
    activityCount: payload.activityCount || 0,
    syncedRideCount: payload.syncedRideCount || 0,
    pendingRideCount: payload.pendingRideCount || 0,
    segmentCount: Object.keys(payload.segments || {}).length,
    effortCount: Array.isArray(payload.efforts) ? payload.efforts.length : 0,
    oldestActivityDate: payload.oldestActivityDate || null,
    newestActivityDate: payload.newestActivityDate || null,
    isBackfillComplete: Boolean(payload.isBackfillComplete),
    syncedRideIds: Array.isArray(payload.syncedRideIds) ? payload.syncedRideIds : [],
    segments: payload.segments || {},
    efforts: Array.isArray(payload.efforts) ? payload.efforts : [],
  };
}

async function readSegmentSnapshot() {
  if (!isBlobConfigured()) {
    return null;
  }

  const result = await get(SEGMENT_SNAPSHOT_PATH, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function writeSegmentSnapshot(snapshot) {
  if (!isBlobConfigured()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return put(
    SEGMENT_SNAPSHOT_PATH,
    JSON.stringify(snapshot, null, 2),
    {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }
  );
}

async function fetchRideDetails(accessToken, rides) {
  const segments = {};
  const efforts = [];

  for (let i = 0; i < rides.length; i += DETAIL_BATCH_SIZE) {
    const batch = rides.slice(i, i + DETAIL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (ride) => {
        const response = await fetch(
          `https://www.strava.com/api/v3/activities/${ride.id}?include_all_efforts=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!response.ok) {
          throw buildStravaApiError(response, 'activity detail fetch');
        }

        return response.json();
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value || !Array.isArray(result.value.segment_efforts)) {
        if (result.status === 'rejected') {
          throw result.reason;
        }
        continue;
      }

      for (const effort of result.value.segment_efforts) {
        if (!segments[effort.segment.id]) {
          segments[effort.segment.id] = {
            id: effort.segment.id,
            name: effort.segment.name
          };
        }

        efforts.push({
          segmentId: effort.segment.id,
          activityId: result.value.id,
          activityDate: effort.start_date,
          elapsedTime: effort.elapsed_time,
          movingTime: effort.moving_time
        });
      }
    }
  }

  return { efforts, segments };
}

async function syncSegmentSnapshot(options = {}) {
  const accessToken = await getAccessToken();
  const allActivities = await fetchAllActivities(accessToken);
  const commuteRides = filterCommuteRides(allActivities);
  const existingSnapshot = await readSegmentSnapshot();
  const existingPayload = getSnapshotSegmentPayload(existingSnapshot);
  const existingSyncedRideIds = new Set(getSnapshotSyncedRideIds(existingSnapshot));

  const unsyncedRides = commuteRides.filter(ride => !existingSyncedRideIds.has(String(ride.id)));
  const ridesToSync = selectRidesForSync(unsyncedRides, DETAIL_REQUEST_BUDGET);
  const fetched = await fetchRideDetails(accessToken, ridesToSync);

  const nextSyncedRideIds = [...existingSyncedRideIds];
  ridesToSync.forEach(ride => {
    const rideId = String(ride.id);
    if (!existingSyncedRideIds.has(rideId)) {
      existingSyncedRideIds.add(rideId);
      nextSyncedRideIds.push(rideId);
    }
  });

  const mergedSegments = {
    ...existingPayload.segments,
    ...fetched.segments,
  };
  const mergedEfforts = existingPayload.efforts.concat(fetched.efforts)
    .sort((a, b) => new Date(a.activityDate) - new Date(b.activityDate));

  const snapshotPayload = {
    activityCount: commuteRides.length,
    syncedRideCount: nextSyncedRideIds.length,
    pendingRideCount: Math.max(0, commuteRides.length - nextSyncedRideIds.length),
    oldestActivityDate: commuteRides.length
      ? (commuteRides[commuteRides.length - 1].start_date_local || commuteRides[commuteRides.length - 1].start_date)
      : null,
    newestActivityDate: commuteRides.length
      ? (commuteRides[0].start_date_local || commuteRides[0].start_date)
      : null,
    isBackfillComplete: nextSyncedRideIds.length >= commuteRides.length,
    syncedRideIds: nextSyncedRideIds,
    segments: mergedSegments,
    efforts: mergedEfforts,
  };

  const snapshot = buildSegmentSnapshot(snapshotPayload, options);
  const blob = await writeSegmentSnapshot(snapshot);

  return {
    blob,
    snapshot,
    payload: snapshotPayload,
    batchRideCount: ridesToSync.length,
  };
}

module.exports = {
  SEGMENT_SNAPSHOT_PATH,
  buildSegmentSnapshot,
  getSnapshotSegmentPayload,
  getSnapshotSyncedRideIds,
  readSegmentSnapshot,
  syncSegmentSnapshot,
  writeSegmentSnapshot,
};
