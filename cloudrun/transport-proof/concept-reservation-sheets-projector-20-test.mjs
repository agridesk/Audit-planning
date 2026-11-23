import assert from 'node:assert/strict';
import {createConceptReservationSheetsProjector20} from './concept-reservation-sheets-projector-20.js';

const clone = value => structuredClone(value);
const reservation = (version, state = 'ACTIVE') => ({
  schemaVersion: 1,
  auditId: 'AUDIT-1',
  reservationId: 'CR-AUDIT-1',
  auditorUid: 'uid-auditor-1',
  blocks: [{date: '2026-12-15', start: '09:00', end: '10:00', hours: 1}],
  sourceRevision: `revision-${version}`,
  state,
  purpose: 'PRELIMINARY_COMPANY_CONFIRMATION',
  note: '',
  createdByUid: 'uid-manager-1',
  createdAt: '2026-11-22T12:00:00.000Z',
  updatedAt: `2026-11-22T12:0${version}:00.000Z`,
  version
});
const operation = (reservationValue, suffix) => ({
  id: `p_${suffix.repeat(64)}`,
  updateTime: `update-${suffix}`,
  value: {operationId: `p_${suffix.repeat(64)}`, state: 'PENDING', reservation: reservationValue}
});
let current = reservation(1);
let sheet = [];
let outbox = [operation(current, 'a')];
let writes = 0;
let acknowledgements = 0;
let mutateAfterFirstWrite = false;

const store = {
  async listAll() { return [clone(current)]; },
  async listOutbox() { return clone(outbox); },
  async markProjected({operationId, updateTime}) {
    assert.ok(writes > 0, 'outbox ack follows the verified Sheets projection');
    const item = outbox.find(entry => entry.value.operationId === operationId);
    if (!item || item.updateTime !== updateTime) return {marked: false};
    item.value.state = 'PROJECTED';
    acknowledgements++;
    return {marked: true};
  }
};
const projector = createConceptReservationSheetsProjector20({
  store,
  getRoster: async () => [{auditorId: 'uid-auditor-1', email: 'auditor@example.test', displayName: 'Auditor One'}],
  readSheet: async () => clone(sheet),
  ensureRows: async count => assert.ok(count >= 1),
  writeSheet: async rows => {
    writes++;
    sheet = clone(rows);
    if (mutateAfterFirstWrite && writes === 1) {
      current = reservation(2);
      outbox.push(operation(current, 'b'));
    }
  }
});

mutateAfterFirstWrite = true;
const result = await projector.reconcile();
assert.equal(result.success, true);
assert.equal(result.verified, true);
assert.equal(result.projectedRows, 1);
assert.equal(result.acknowledgedOutboxCount, 2);
assert.equal(result.pendingOutboxCount, 0);
assert.equal(writes, 2, 'a concurrent Firestore revision is reprojected before acknowledgement');
assert.equal(acknowledgements, 2);
assert.equal(sheet[0].at(-1), 'Auditor_UID');
assert.equal(sheet[1][2], 'auditor@example.test');
assert.equal(sheet[1][15], 'uid-auditor-1');
assert.equal(sheet[1][6], 'revision-2');

let writeFailureAcknowledgements = 0;
const failed = createConceptReservationSheetsProjector20({
  store: {
    ...store,
    async markProjected() { writeFailureAcknowledgements++; return {marked: true}; }
  },
  getRoster: async () => [],
  readSheet: async () => [],
  ensureRows: async () => {},
  writeSheet: async () => { throw Error('SHEETS_WRITE_FAILED'); }
});
await assert.rejects(() => failed.reconcile(), /SHEETS_WRITE_FAILED/);
assert.equal(writeFailureAcknowledgements, 0, 'failed projection must leave outbox events pending');

console.log('concept-reservation-sheets-projector-20-test: PASS');
