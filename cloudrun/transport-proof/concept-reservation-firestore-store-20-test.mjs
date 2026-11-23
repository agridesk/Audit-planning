import assert from 'node:assert/strict';
import { createConceptReservationFirestoreStore } from './concept-reservation-firestore-store-20.js';

const projectId = 'audit-management-system-dev';
const databasePrefix = `projects/${projectId}/databases/(default)/documents/`;
const records = new Map();
let sequence = 0;
let failNextCommit = false;

const clone = value => structuredClone(value);
const encode = value => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
};
const decode = value => {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
};
const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return clone(body); }
});

const fetchImpl = async (input, init = {}) => {
  const url = new URL(input);
  const path = decodeURIComponent(url.pathname).replace(/^\/v1\//, '');
  const method = init.method || 'GET';
  if (path.endsWith('/documents:commit') && method === 'POST') {
    if (failNextCommit) {
      failNextCommit = false;
      return response(409, { error: { status: 'ABORTED' } });
    }
    const writes = JSON.parse(init.body).writes;
    for (const write of writes) {
      const name = write.update.name;
      assert.ok(name.startsWith(databasePrefix));
      const key = name.slice(databasePrefix.length);
      const prior = records.get(key);
      const condition = write.currentDocument;
      if (condition?.exists === false && prior) return response(409, {});
      if (condition?.updateTime && condition.updateTime !== prior?.updateTime) return response(409, {});
    }
    for (const write of writes) {
      const key = write.update.name.slice(databasePrefix.length);
      records.set(key, {
        name: `https://firestore.googleapis.com/v1/${write.update.name}`,
        updateTime: `update-${++sequence}`,
        fields: clone(write.update.fields)
      });
    }
    return response(200, { commitTime: '2026-11-22T00:00:00Z' });
  }
  if (method === 'GET' && path.includes('/documents/')) {
    const relative = path.split('/documents/')[1];
    if (relative.split('/').length > 1) {
      const found = records.get(relative);
      return found ? response(200, found) : response(404, {});
    }
    const collection = relative;
    const all = [...records.entries()].filter(([key]) => key.startsWith(collection + '/')).map(([, value]) => value);
    const size = Number(url.searchParams.get('pageSize') || 200);
    const offset = Number(url.searchParams.get('pageToken') || 0);
    const page = all.slice(offset, offset + size);
    return response(200, {
      documents: page,
      ...(offset + size < all.length ? { nextPageToken: String(offset + size) } : {})
    });
  }
  throw Error('MOCK_REQUEST_UNEXPECTED');
};

const store = createConceptReservationFirestoreStore({
  projectId,
  getToken: async () => 'test-token',
  fetchImpl,
  now: () => '2026-11-22T12:00:00.000Z'
});
const firstInput = {
  auditId: 'AUDIT-1',
  auditorUid: 'auditor-uid-1',
  actorUid: 'auditor-uid-1',
  actorRole: 'AUDITOR',
  sourceRevision: 'revision-1',
  blocks: [{ date: '2026-12-15', start: '09:00', end: '10:00', hours: 1 }]
};

assert.throws(
  () => createConceptReservationFirestoreStore({
    projectId: 'audit-management-system-prod',
    getToken: async () => 'test-token'
  }),
  /CONCEPT_RESERVATION_DEV_CONFIGURATION_REQUIRED/
);
await assert.rejects(
  () => store.upsert({ ...firstInput, auditorUid: 'other-uid' }),
  /CONCEPT_RESERVATION_OWNER_MISMATCH/
);
await assert.rejects(
  () => store.upsert({ ...firstInput, auditorUid: 'auditor@example.com' }),
  /CONCEPT_RESERVATION_UID_REQUIRED/
);

const created = await store.upsert(firstInput);
assert.equal(created.saved, true);
assert.equal(created.reservations[0].version, 1);
assert.equal(created.reservations[0].auditorUid, 'auditor-uid-1');
assert.equal('auditorEmail' in created.reservations[0], false);
assert.equal('auditorName' in created.reservations[0], false);
assert.equal((await store.read('AUDIT-1')).version, 1);

const second = await store.upsert({
  ...firstInput,
  auditId: 'AUDIT-2',
  auditorUid: 'auditor-uid-2',
  actorUid: 'manager-uid',
  actorRole: 'MANAGER',
  sourceRevision: 'revision-2'
});
assert.equal(second.saved, true);
const rows = await store.list({
  from: '2026-12-01',
  to: '2026-12-31',
  auditorUids: ['auditor-uid-2'],
  pageSize: 1
});
assert.deepEqual(rows.map(row => row.auditId), ['AUDIT-2']);

const outboxBeforeRelease = await store.listOutbox({ pageSize: 1 });
assert.equal(outboxBeforeRelease.length, 2);
assert.equal(outboxBeforeRelease.every(item => item.value.state === 'PENDING'), true);
const acknowledged = await store.markProjected({
  operationId: outboxBeforeRelease[0].value.operationId,
  updateTime: outboxBeforeRelease[0].updateTime
});
assert.equal(acknowledged.marked, true);
assert.equal(acknowledged.replayed, false);

const released = await store.release({
  auditId: 'AUDIT-1',
  actorUid: 'manager-uid',
  actorRole: 'MANAGER',
  reason: 'CANONICAL_COMMIT'
});
assert.equal(released.released, true);
assert.equal(released.reservation.state, 'RELEASED');
assert.equal(released.reservation.version, 2);
assert.deepEqual(await store.list({ from: '2026-12-01', to: '2026-12-31', auditorUids: ['auditor-uid-1'] }), []);
assert.deepEqual((await store.listAll()).map(item => [item.auditId, item.state]), [
  ['AUDIT-2', 'ACTIVE'],
  ['AUDIT-1', 'RELEASED']
]);
assert.equal((await store.release({
  auditId: 'AUDIT-1',
  actorUid: 'manager-uid',
  actorRole: 'MANAGER'
})).reason, 'ALREADY_RELEASED');

failNextCommit = true;
const conflict = await store.upsert({ ...firstInput, auditId: 'AUDIT-3' });
assert.equal(conflict.saved, false);
assert.equal(conflict.reason, 'CONFLICT');
assert.equal(await store.read('AUDIT-3'), null);

failNextCommit = true;
const batchConflict = await store.upsertBatch({
  items: [
    { ...firstInput, auditId: 'AUDIT-4' },
    { ...firstInput, auditId: 'AUDIT-5' }
  ]
});
assert.equal(batchConflict.saved, false);
assert.equal(await store.read('AUDIT-4'), null);
assert.equal(await store.read('AUDIT-5'), null);

await assert.rejects(
  () => store.list({ from: '2026-12-31', to: '2026-12-01' }),
  /CONCEPT_RESERVATION_READ_INPUT_INVALID/
);
await assert.rejects(
  () => store.list({ from: '2026-02-30', to: '2026-03-01' }),
  /CONCEPT_RESERVATION_READ_INPUT_INVALID/
);
await assert.rejects(
  () => store.upsert({ ...firstInput, blocks: [{ date: '2026-02-30', start: '09:00', end: '10:00', hours: 1 }] }),
  /CONCEPT_RESERVATION_BLOCK_INVALID/
);
await assert.rejects(
  () => store.listOutbox({ pageSize: 501 }),
  /CONCEPT_RESERVATION_SCAN_INPUT_INVALID/
);

console.log('concept-reservation-firestore-store-20-test: PASS');
