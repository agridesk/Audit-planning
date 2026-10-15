import test from 'node:test';
import assert from 'node:assert/strict';
import {planLegacyHardMigration} from './availability-legacy-hard-migration-plan-20.js';
const headers=['Date','Auditor_Email','Available','First_Audit_Start_Time','First_Audit_End_Time','Audit_ID_1','Audit_ID_2','Status_1','Status_2'];
const uid='auditor-uid-immutable';
const roster=[{email:'new@example.com',auditorId:uid}];
const aliases=[{oldEmail:'old@example.com',newEmail:'new@example.com',uid}];
const manual=(mail='old@example.com')=>['2026-11-02',mail,'NO','08:00','18:00','','','MANUAL_AUDITOR_BLOCKED_SOFT','USER_MANUAL'];
test('renamed auditor retains manual HARD block through UID',()=>{
 const result=planLegacyHardMigration({rows:[headers,manual()],roster,verifiedEmailAliases:aliases});
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].auditorId,uid);
 assert.equal(result.candidates[0].targetState,'HARD');
 assert.equal(result.quarantined.length,0);
 assert.equal(result.writeApplied,false);
});
test('unmapped legacy email quarantines rather than misattributes',()=>{
 const result=planLegacyHardMigration({rows:[headers,manual()],roster});
 assert.equal(result.candidates.length,0);
 assert.deepEqual(result.quarantined[0].problems,['AUDITOR_UID_UNRESOLVED']);
});
test('wrong UID cannot impersonate current auditor identity',()=>{
 assert.throws(()=>planLegacyHardMigration({rows:[headers,manual()],roster,verifiedEmailAliases:[{...aliases[0],uid:'different'}]}),/MIGRATION_ALIAS_UNVERIFIED/);
});
test('generated defaults and audit occupancy never become HARD',()=>{
 const generated=['2026-11-03','old@example.com','NO','08:00','18:00','','','DEFAULT_AUDITOR_BLOCKED_SOFT',''];
 const occupied=['2026-11-04','old@example.com','NO','08:00','18:00','audit-id','','MANUAL_AUDITOR_BLOCKED_SOFT','USER_MANUAL'];
 const result=planLegacyHardMigration({rows:[headers,generated,occupied],roster,verifiedEmailAliases:aliases});
 assert.equal(result.candidates.length,0);
 assert.equal(result.counts.generated,1);
 assert.equal(result.counts.audit,1);
});
