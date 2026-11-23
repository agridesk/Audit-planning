import assert from 'node:assert/strict';
import {migrateAuditorQualificationsSheets20 as migrate} from './auditor-scope-qualifications-migration-sheets-20.js';

let reads=0,writes=0,locks=0;
await assert.rejects(migrate({
 runtimeEnv:'DEV',
 spreadsheetId:'1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs',
 verifiedProject:'audit-management-system-dev',
 enabled:true,
 confirmation:'MIGRATE_DEV_AUDITOR_QUALIFICATIONS',
 batchGet:async()=>{reads++;return[];},
 append:async()=>{writes++;},
 withExclusiveLock:async work=>{locks++;return work();}
}),/SHEETS_QUALIFICATION_MIGRATION_RETIRED/);
assert.equal(reads,0);
assert.equal(writes,0);
assert.equal(locks,0);
console.log('Scope20 Sheets qualification migration retired: no reads, writes or lock acquisition');
