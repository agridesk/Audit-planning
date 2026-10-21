import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const rows=[['UID','Email','Active'],['auditor-001','one@example.com','YES'],['auditor-002','two@example.com','YES']];
const context={
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-ssot'})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>rows.map(row=>row.slice())})})})},
 PlanningWorkspacePlannedAuditReadService_get:({auditId})=>({success:true,normalizedStatus:'ACCEPTED',auditorEmail:auditId==='A'?'one@example.com':'two@example.com'}),
 Error,String,Array
};
runInNewContext(readFileSync(new URL('Swap20AuditorIdentityResolver.js',root),'utf8'),context);
assert.equal(context.Swap20_resolveAuditorUidByEmail_('ONE@example.com'),'auditor-001');
assert.equal(context.Swap20_resolveAuditorUidForAudit_('B'),'auditor-002');
rows.push(['auditor-003','one@example.com','YES']);
assert.throws(()=>context.Swap20_resolveAuditorUidByEmail_('one@example.com'),/Duplicate canonical auditor identity/);
console.log('Swap auditor identity tests passed');
