import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const endpoints=[
 ['/api/v1/manager/auditor-management/qualifications/migration-lock-probe','POST'],
 ['/api/v1/manager/auditor-management/qualifications/migration-apply','POST'],
 ['/api/v1/manager/auditor-management/qualifications/migration-plan','GET'],
 ['/api/v1/manager/auditor-management/qualifications/parity-preview','GET'],
 ['/api/v1/manager/auditor-management/qualifications/migration-preview','GET']
];
for(const [url,method] of endpoints){
 const start=s.indexOf("if(u.pathname==='"+url+"'&&req.method==='"+method+"')");
 assert.ok(start>0,url+' must exist');
 const next=s.indexOf('  if(u.pathname===',start+8);
 const block=s.slice(start,next<0?s.length:next);
 assert.ok(block.includes("sessionFromRequestValidated(req)"),url+' must authenticate');
 assert.ok(block.includes("MANAGER_REQUIRED"),url+' must require manager');
}
assert.ok(s.includes("AMS_SCOPE20_QUALIFICATION_MIGRATION_WRITE_ENABLED!=='true'"));
assert.ok(s.includes("SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'"));
assert.ok(s.includes("withQualificationMigrationFirestoreLock20"));
assert.ok(s.includes("migrateAuditorQualificationsSheets20"));
assert.ok(s.includes("planAuditorQualificationMigration20"));
assert.ok(s.includes("compareAuditorQualificationParity20"));
assert.ok(s.includes("previewAuditorQualificationMigration20"));
console.log('Fase2.5 migration routes: manager auth, isolated DEV apply and lock prerequisites present');
