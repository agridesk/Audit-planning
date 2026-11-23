import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const bridgeSource = await readFile(new URL('../../ConceptReservationFirestoreBridge20.js', import.meta.url), 'utf8');
const readModelSource = await readFile(new URL('../../ConceptReservationReadModel.js', import.meta.url), 'utf8');
const properties = new Map([
  ['AMS_DEV_CONCEPT_RESERVATIONS_FIRESTORE_ENABLED', 'true'],
  ['AMS_DEV_CONCEPT_RESERVATIONS_FULL_CUTOVER_ENABLED', 'true'],
  ['AMS_EXTERNAL_WRITE_BRIDGE_KEY', 'x'.repeat(40)],
  ['AMS_CLOUD_RUN_CONCEPT_RESERVATIONS_URL', 'https://dev.example.test/api/v1/internal/concept-reservations']
]);
let sheetReads = 0;
let apiCalls = 0;
const context = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || '' }) },
  V5_ENTRY_isDevEnv_: () => true,
  V5_AUTH: { validateTrustedTokenByRole: () => ({ ok: true, email: 'manager@example.test' }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()]
  },
  AuditorsIndex_GetDirectory: () => ({
    ok: true,
    byEmail: { 'auditor@example.test': { auditorUid: 'uid-auditor-1', email: 'auditor@example.test', name: 'Auditor One' } },
    byUid: { 'uid-auditor-1': { auditorUid: 'uid-auditor-1', email: 'auditor@example.test', name: 'Auditor One' } }
  }),
  UrlFetchApp: {
    fetch: () => {
      apiCalls++;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          success: true,
          rows: [{
            auditId: 'AUDIT-1', reservationId: 'CR-AUDIT-1', auditorUid: 'uid-auditor-1',
            blocks: [{ date: '2026-12-01', start: '09:00', end: '10:00', hours: 1 }],
            sourceRevision: 'rev-1', state: 'ACTIVE'
          }]
        })
      };
    }
  },
  SpreadsheetApp: {
    getActive: () => ({
      getSheetByName: () => {
        sheetReads++;
        return null;
      }
    })
  }
};
vm.runInNewContext(bridgeSource + '\n' + readModelSource, context);

const readContext = {
  actorRole: 'Manager',
  trustedToken: 'manager-token',
  deviceFingerprint: 'device-1',
  auditorEmails: ['auditor@example.test']
};
const result = context.CRFB_withRequestContext_(readContext, () =>
  context.ConceptReservationReadModel_get({ from: '2026-12-01', to: '2026-12-31' })
);
assert.equal(result.rows.length, 1);
assert.equal(result.rows[0].auditorUid, 'uid-auditor-1');
assert.equal(result.rows[0].auditorEmail, 'auditor@example.test');
assert.equal(result.meta.source, 'Firestore');
assert.equal(result.meta.readOnly, true);
assert.equal(sheetReads, 0);
assert.equal(apiCalls, 1);
assert.equal(context.CRFB_REQUEST_CONTEXT_, null);

properties.set('AMS_DEV_CONCEPT_RESERVATIONS_FIRESTORE_ENABLED', 'false');
const legacy = context.ConceptReservationReadModel_get({ from: '2026-12-01', to: '2026-12-31' });
assert.equal(legacy.meta.sheet, 'Concept Reservations');
assert.equal(sheetReads, 1);
assert.equal(apiCalls, 1);

console.log('concept-reservation-read-model-20-test: PASS');
