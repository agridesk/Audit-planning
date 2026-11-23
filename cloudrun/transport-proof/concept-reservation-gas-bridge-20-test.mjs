import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../ConceptReservationFirestoreBridge20.js', import.meta.url), 'utf8');
const releaseBridgeSource = await readFile(new URL('../../ConceptReservationCommitReleaseBridge.js', import.meta.url), 'utf8');
const serviceSource = await readFile(new URL('../../PlanningWorkspaceService.js', import.meta.url), 'utf8');
const properties = new Map([
  ['AMS_DEV_CONCEPT_RESERVATIONS_FIRESTORE_ENABLED', 'true'],
  ['AMS_DEV_CONCEPT_RESERVATIONS_FULL_CUTOVER_ENABLED', 'true'],
  ['AMS_EXTERNAL_WRITE_BRIDGE_KEY', 'x'.repeat(40)],
  ['AMS_CLOUD_RUN_CONCEPT_RESERVATIONS_URL', 'https://dev.example.test/api/v1/internal/concept-reservations']
]);
const requests = [];
const auditorRows = [
  { auditorUid: 'uid-auditor-1', email: 'auditor@example.test', name: 'Auditor One' },
  { auditorUid: 'uid-auditor-2', email: 'other@example.test', name: 'Auditor Two' }
];
let nextResponse;
const context = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || '' }) },
  V5_ENTRY_isDevEnv_: () => true,
  V5_AUTH: {
    validateTrustedTokenByRole: (token, role) => token
      ? { ok: true, email: role === 'Auditor' ? 'auditor@example.test' : 'manager@example.test' }
      : { ok: false }
  },
  AuditorsIndex_GetDirectory: () => ({
    ok: true,
    byEmail: Object.fromEntries(auditorRows.map(row => [row.email, row])),
    byUid: Object.fromEntries(auditorRows.map(row => [row.auditorUid, row]))
  }),
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()]
  },
  UrlFetchApp: {
    fetch: (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.payload) });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify(nextResponse)
      };
    }
  }
};
vm.runInNewContext(source, context);
vm.runInNewContext(releaseBridgeSource, context);
vm.runInNewContext(serviceSource, context);
context.PWS_assert_ = () => {};

assert.equal(context.CRFB_enabled_(), true);
properties.delete('AMS_DEV_CONCEPT_RESERVATIONS_FULL_CUTOVER_ENABLED');
assert.equal(context.CRFB_enabled_(), false);
properties.set('AMS_DEV_CONCEPT_RESERVATIONS_FULL_CUTOVER_ENABLED', 'true');
context.V5_ENTRY_isDevEnv_ = () => false;
assert.equal(context.CRFB_enabled_(), false);
context.V5_ENTRY_isDevEnv_ = () => true;

nextResponse = {
  success: true,
  saved: true,
  reason: 'SAVED',
  reservation: {
    auditId: 'AUDIT-1', reservationId: 'CR-AUDIT-1', auditorUid: 'uid-auditor-1',
    blocks: [{ date: '2026-12-01', start: '09:00', end: '10:00', hours: 1 }],
    sourceRevision: 'rev-1', state: 'ACTIVE', createdByUid: 'manager_1'
  }
};
const saved = context.CRFB_upsert_({
  actorRole: 'Manager', actorEmail: 'manager@example.test', trustedToken: 'manager-token',
  deviceFingerprint: 'device-1',
  reservation: {
    auditId: 'AUDIT-1', auditorEmail: 'auditor@example.test', auditorName: 'Should not persist',
    sourceRevision: 'rev-1', blocks: [{ date: '2026-12-01', start: '09:00', end: '10:00', hours: 1 }]
  }
});
assert.equal(saved.saved, true);
assert.equal(saved.reservation.auditorUid, 'uid-auditor-1');
assert.equal(saved.reservation.auditorEmail, 'auditor@example.test');
assert.equal('auditorEmail' in requests[0].body.reservation, false);
assert.equal('auditorName' in requests[0].body.reservation, false);
assert.equal(requests[0].body.reservation.auditorUid, 'uid-auditor-1');
assert.equal(requests[0].body.actorEmail, 'manager@example.test');

const beforeForbiddenWrite = requests.length;
assert.throws(() => context.CRFB_upsert_({
  actorRole: 'Auditor', trustedToken: 'auditor-token', deviceFingerprint: 'device-1',
  reservation: {
    auditId: 'AUDIT-2', auditorEmail: 'other@example.test', sourceRevision: 'rev-2',
    blocks: [{ date: '2026-12-02', start: '09:00', end: '10:00', hours: 1 }]
  }
}), /CONCEPT_RESERVATION_OWNER_MISMATCH/);
assert.equal(requests.length, beforeForbiddenWrite);

nextResponse = {
  success: true,
  rows: [{
    auditId: 'AUDIT-1', reservationId: 'CR-AUDIT-1', auditorUid: 'uid-auditor-1',
    blocks: [], sourceRevision: 'rev-1', state: 'ACTIVE'
  }]
};
const read = context.CRFB_read_({
  actorRole: 'Manager', trustedToken: 'manager-token', deviceFingerprint: 'device-1',
  from: '2026-12-01', to: '2026-12-31', auditorEmails: ['auditor@example.test']
});
assert.equal(read.meta.readOnly, true);
assert.equal(read.meta.identityKey, 'Auditor_UID');
assert.equal(read.rows[0].auditorUid, 'uid-auditor-1');
assert.equal(read.rows[0].auditorEmail, 'auditor@example.test');
assert.deepEqual(requests.at(-1).body.auditorUids, ['uid-auditor-1']);

let releasedInput;
const firestoreRelease = context.CRFB_release_;
context.CRFB_release_ = input => {
  releasedInput = input;
  return { success: true, released: true, reason: 'RELEASED', meta: { writes: true } };
};
context.CRFB_REQUEST_CONTEXT_ = {
  actorRole: 'Manager', actorEmail: 'manager@example.test',
  trustedToken: 'manager-token', deviceFingerprint: 'device-1'
};
const released = context.ConceptReservationCommitReleaseBridge_releaseLocked({
  auditId: 'AUDIT-1', releasedBy: 'manager@example.test', reason: 'CANONICAL_COMMIT'
});
assert.equal(released.released, true);
assert.equal(released.meta.nestedLock, false);
assert.equal(releasedInput.trustedToken, 'manager-token');
assert.equal(releasedInput.actorRole, 'Manager');
context.CRFB_REQUEST_CONTEXT_ = null;
context.CRFB_release_ = firestoreRelease;

nextResponse = { success: true, released: true, reason: 'RELEASED' };
assert.throws(() => context.CRFB_withRequestContext_({
  actorRole: 'Manager', actorEmail: 'manager@example.test', serverBridgeAuthorized: true
}, () => context.CRFB_release_({
  actorRole: 'Manager', actorEmail: 'manager@example.test', auditId: 'AUDIT-2'
})), /CONCEPT_RESERVATION_AUTH_REQUIRED/);
const internalRelease = context.CRFB_withServerBridgeContext_({
  actorRole: 'Manager', actorEmail: 'manager@example.test'
}, () => context.ConceptReservationCommitReleaseBridge_releaseLocked({
  auditId: 'AUDIT-2', releasedBy: 'manager@example.test', reason: 'CANONICAL_COMBINED_VISIT_COMMIT'
}));
assert.equal(internalRelease.released, true);
assert.equal(requests.at(-1).body.action, 'release');
assert.equal(requests.at(-1).body.actorRole, 'MANAGER');
assert.equal(requests.at(-1).body.actorEmail, 'manager@example.test');
const beforeMismatchedInternalRelease = requests.length;
assert.throws(() => context.CRFB_withServerBridgeContext_({
  actorRole: 'Manager', actorEmail: 'manager@example.test'
}, () => context.CRFB_release_({
  actorRole: 'Manager', actorEmail: 'other@example.test', auditId: 'AUDIT-2'
})), /CONCEPT_RESERVATION_AUTH_REQUIRED/);
assert.equal(requests.length, beforeMismatchedInternalRelease);

const serviceCalls = [];
context.CRFB_enabled_ = () => true;
context.CRFB_commandUpsert_ = input => { serviceCalls.push(['firestore-upsert', input]); return { saved: true }; };
context.CRFB_commandUpsertBatch_ = input => { serviceCalls.push(['firestore-batch', input]); return { saved: true }; };
context.CRFB_commandRelease_ = input => { serviceCalls.push(['firestore-release', input]); return { released: true }; };
context.CRFB_withRequestContext_ = (input, fn) => {
  const prior = context.CRFB_REQUEST_CONTEXT_;
  context.CRFB_REQUEST_CONTEXT_ = input;
  try { return fn(); } finally { context.CRFB_REQUEST_CONTEXT_ = prior; }
};
context.PlanningWorkspaceOverlayBundle_get = () => ({
  tokenSeen: context.CRFB_REQUEST_CONTEXT_?.trustedToken || ''
});
context.PlanningCanonicalCommitService_commit = () => ({
  tokenSeen: context.CRFB_REQUEST_CONTEXT_?.trustedToken || ''
});
context.ConceptReservationCommandService_upsert = () => { throw Error('SHEET_UPSERT_USED'); };
context.ConceptReservationCommandService_upsertBatch = () => { throw Error('SHEET_BATCH_USED'); };
context.ConceptReservationCommandService_release = () => { throw Error('SHEET_RELEASE_USED'); };
const serviceInput = { actorRole: 'Manager', trustedToken: 'manager-token', auditId: 'AUDIT-1' };
assert.equal(context.PlanningWorkspaceService_saveConcept(serviceInput).saved, true);
assert.equal(context.PlanningWorkspaceService_saveConceptsBatch({ ...serviceInput, items: [] }).saved, true);
assert.equal(context.PlanningWorkspaceService_releaseConcept(serviceInput).released, true);
assert.equal(context.PlanningWorkspaceService_getOverlays(serviceInput).tokenSeen, 'manager-token');
assert.equal(context.PlanningWorkspaceService_commit(serviceInput).tokenSeen, 'manager-token');
assert.deepEqual(serviceCalls.map(call => call[0]), [
  'firestore-upsert', 'firestore-batch', 'firestore-release'
]);
context.CRFB_enabled_ = () => false;
context.ConceptReservationCommandService_upsert = () => ({ source: 'sheets' });
assert.equal(context.PlanningWorkspaceService_saveConcept(serviceInput).source, 'sheets');

properties.set('AMS_CLOUD_RUN_CONCEPT_RESERVATIONS_URL', 'http://example.test/api/v1/internal/concept-reservations');
assert.throws(() => context.CRFB_release_({
  actorRole: 'Manager', trustedToken: 'manager-token', deviceFingerprint: 'device-1', auditId: 'AUDIT-1'
}), /CONCEPT_RESERVATION_BRIDGE_NOT_CONFIGURED/);

console.log('concept-reservation-gas-bridge-20-test: PASS');
