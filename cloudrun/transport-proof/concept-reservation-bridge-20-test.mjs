import assert from 'node:assert/strict';
import { createConceptReservationBridge20 } from './concept-reservation-bridge-20.js';

const calls = [];
let resolvedRole = '';
const identity = {
  manager: { auditorUid: 'manager-uid', role: 'manager', active: true },
  auditor: { auditorUid: 'auditor-uid', role: 'auditor', active: true }
};
const store = {
  async list(input) { calls.push(['list', input]); return []; },
  async upsert(input) { calls.push(['upsert', input]); return { saved: true }; },
  async upsertBatch(input) { calls.push(['upsertBatch', input]); return { saved: true }; },
  async release(input) { calls.push(['release', input]); return { released: true }; }
};
const bridge = createConceptReservationBridge20({
  enabled: true,
  runtimeEnv: 'DEV',
  serviceName: 'ams-fase12-dev',
  bridgeKey: 'trusted-bridge-secret-which-is-long-enough',
  resolveIdentity: async (email, role) => {
    resolvedRole = role;
    return identity[email];
  },
  store
});
const request = (body, options = {}) => bridge.handle({
  method: 'POST',
  path: '/api/v1/internal/concept-reservations',
  headers: { 'x-ams-bridge-key': options.key || 'trusted-bridge-secret-which-is-long-enough' },
  body
});

assert.equal((await request({ action: 'read', actorEmail: 'manager', actorRole: 'manager' }, { key: 'wrong' })).status, 403);
assert.equal((await request({ action: 'read', actorEmail: 'manager', actorRole: 'auditor' })).status, 403);
assert.equal((await request({ action: 'read', actorEmail: 'auditor', actorRole: 'auditor', auditorUids: [] })).status, 403);

const auditorRead = await request({
  action: 'read',
  actorEmail: 'auditor',
  actorRole: 'auditor',
  from: '2026-12-01',
  to: '2026-12-31',
  auditorUids: ['auditor-uid']
});
assert.equal(auditorRead.status, 200);
assert.deepEqual(calls.at(-1), ['list', {
  from: '2026-12-01',
  to: '2026-12-31',
  auditorUids: ['auditor-uid']
}]);

const deniedWrite = await request({
  action: 'upsert',
  actorEmail: 'auditor',
  actorRole: 'auditor',
  reservation: { auditId: 'AUDIT-1', auditorUid: 'other-uid' }
});
assert.equal(deniedWrite.status, 403);

const managerWrite = await request({
  action: 'upsert',
  actorEmail: 'manager',
  actorRole: 'manager',
  reservation: { auditId: 'AUDIT-1', auditorUid: 'auditor-uid' }
});
assert.equal(managerWrite.status, 200);
assert.equal(resolvedRole, 'MANAGER');
assert.deepEqual(calls.at(-1), ['upsert', {
  auditId: 'AUDIT-1',
  auditorUid: 'auditor-uid',
  actorUid: 'manager-uid',
  actorRole: 'MANAGER'
}]);

const auditorRelease = await request({
  action: 'release',
  actorEmail: 'auditor',
  actorRole: 'auditor',
  auditId: 'AUDIT-1',
  reason: 'MANUAL_RELEASE'
});
assert.equal(auditorRelease.status, 200);
assert.deepEqual(calls.at(-1), ['release', {
  auditId: 'AUDIT-1',
  actorUid: 'auditor-uid',
  actorRole: 'AUDITOR',
  reason: 'MANUAL_RELEASE'
}]);

const disabled = createConceptReservationBridge20({
  enabled: false,
  runtimeEnv: 'DEV',
  serviceName: 'ams-fase12-dev',
  bridgeKey: 'trusted-bridge-secret-which-is-long-enough',
  resolveIdentity: async () => identity.manager,
  store
});
assert.equal((await disabled.handle({
  method: 'POST',
  path: '/api/v1/internal/concept-reservations',
  headers: { 'x-ams-bridge-key': 'trusted-bridge-secret-which-is-long-enough' },
  body: { action: 'read', actorEmail: 'manager', actorRole: 'manager' }
})).status, 404);

console.log('concept-reservation-bridge-20-test: PASS');
