import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./server-r12.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function clean('),source.indexOf('function b64url('));
const comments=source.slice(source.indexOf('function commentsFrom('),source.indexOf('async function enrichOpen('));
const reader=source.slice(source.indexOf('function offsitePolicyForAuditRow('),source.indexOf('function actionRelayUrl('));
const header=['Audit ID','Status','Hours planned','Assigned to','Planning JSON','Date planned','Required hours','ABC'];
const pending=['audit-1','Pending Planning','5','auditor@example.test','{"blocks":[1]}','2027-01-01','5','YES'];
const accepted=['audit-2','Accepted','4','auditor@example.test','{"blocks":[2]}','2027-02-01','4','YES'];
const scopes=[['SlotKey','ScopeCode','DisplayName','Active','Max_Offsite_Hours'],['ABC','ABC','ABC','YES','2']];
let batches=[],singles=[],failBatch=false,shortBatch=false,emptyBatchScopes=false,rows=[pending,accepted];
const context={BUILD:'test',process:{env:{AMS_RUNTIME_ENV:'DEV'}},batchValues:async ranges=>{
  batches.push(Array.from(ranges));
  if(failBatch)throw Error('SHEETS_API_429');
  if(shortBatch)return [[header],rows];
  const second=ranges[1].includes('A2:BW483')?rows:[rows[Number(ranges[1].match(/A(\d+)/)[1])-2]].filter(Boolean);
  return [[header],second,emptyBatchScopes?[]:scopes];
},values:async range=>{
  singles.push(range);
  if(range==='Audit planning!A2:BW483')return rows;
  if(range==='Audit planning!A1:BW1')return [header];
  if(range==='Config_Scopes!A1:Z128')return scopes;
  throw Error('Unexpected read: '+range);
}};
vm.runInNewContext(helpers+comments+reader+';this.readAuditPatch=readAuditPatch;',context);

let result=await context.readAuditPatch('audit-1');
assert.equal(batches.length,1);
assert.deepEqual(batches[0],['Audit planning!A1:BW1','Audit planning!A2:BW483','Config_Scopes!A1:Z128']);
assert.equal(singles.length,0);
assert.equal(result.sourceRow,2);
assert.equal(result.assignedTo,'');
assert.equal(result.planningJson,'');
assert.equal(result.hoursPlanned,'');
assert.equal(result.maxOffsiteHours,2);

const committed='{"blocks":[{"date":"2027-02-01","start":"08:00","end":"12:00"},{"date":"2027-02-02","start":"13:00","end":"15:00"}]}';
// Sheet column 'Hours planned' (9) and Required hours (4) must be ignored: Planned = sum of committed blocks.
rows=[pending,['audit-2','Accepted','9','auditor@example.test',committed,'2027-02-01','4','YES']];
result=await context.readAuditPatch('audit-2');
assert.equal(batches.length,2,'Each request must read fresh data');
assert.equal(result.sourceRow,3);
assert.equal(result.hoursPlanned,6);
assert.equal(result.planningJson,committed);
rows=[pending,['audit-2','Pending Approval','4','auditor@example.test','{"formalHours":4}','2027-02-01','4','YES']];
result=await context.readAuditPatch('audit-2');
assert.equal(result.hoursPlanned,'','No committed blocks means no Hours planned, never Required or sheet fallback');
rows=[pending,['audit-2','Accepted','9','auditor@example.test',committed,'2027-02-01','4','YES']];

batches=[];singles=[];
result=await context.readAuditPatch('audit-2',3);
assert.equal(result.sourceRow,3);
assert.equal(batches.length,1);
assert.equal(singles.length,0);
result=await context.readAuditPatch('audit-2',2);
assert.equal(result.sourceRow,3,'A stale row hint must be verified and reread');
assert.deepEqual(singles,['Audit planning!A2:BW483']);

batches=[];singles=[];
result=await context.readAuditPatch('missing');
assert.equal(result.success,false);
assert.equal(result.error,'AUDIT_NOT_FOUND');
assert.equal(batches.length,1);
assert.equal(singles.length,0);
shortBatch=true;
await assert.rejects(()=>context.readAuditPatch('audit-1'),/MANAGER_AUDIT_BATCH_READ_INCOMPLETE/);
shortBatch=false;failBatch=true;
await assert.rejects(()=>context.readAuditPatch('audit-1'),/SHEETS_API_429/);
failBatch=false;batches=[];singles=[];emptyBatchScopes=true;
result=await context.readAuditPatch('audit-1');
assert.equal(result.maxOffsiteHours,2);
assert.deepEqual(singles,['Config_Scopes!A1:Z128'],'Empty batch scopes retain the existing fallback');
emptyBatchScopes=false;batches=[];singles=[];context.process.env.AMS_RUNTIME_ENV='PROD';
result=await context.readAuditPatch('audit-1');
assert.equal(result.sourceRow,2);
assert.equal(batches.length,0);
assert.deepEqual(singles,['Audit planning!A1:BW1','Audit planning!A2:BW483','Config_Scopes!A1:Z128']);

const requests=[];
let response={ok:true,status:200,json:async()=>({valueRanges:[{values:[header]},{values:rows},{}]})};
const sheetsContext={URL,SID:'test-sheet',accessToken:async()=>'test-token',fetch:async(url,options)=>{
  requests.push({url:new URL(url),options});
  return response;
}};
const sheets=source.slice(source.indexOf('async function values('),source.indexOf('async function innerSession('));
vm.runInNewContext(sheets+';this.batchValues=batchValues;',sheetsContext);
const ranges=['Audit planning!A1:BW1','Audit planning!A2:BW483','Config_Scopes!A1:Z128'];
const actual=await sheetsContext.batchValues(ranges);
assert.equal(requests.length,1);
assert.equal(requests[0].url.pathname,'/v4/spreadsheets/test-sheet/values:batchGet');
assert.deepEqual(requests[0].url.searchParams.getAll('ranges'),ranges);
assert.equal(requests[0].url.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');
assert.equal(requests[0].url.searchParams.get('dateTimeRenderOption'),'FORMATTED_STRING');
assert.equal(actual.length,3);
assert.equal(actual[2].length,0);
response={ok:false,status:429,json:async()=>({error:{code:429}})};
await assert.rejects(()=>sheetsContext.batchValues(ranges),/SHEETS_API_429/);
console.log('PASS manager audit fresh batched reads and row-hint verification');
