import assert from 'node:assert/strict';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';
const rows={'Notification Queue':[['Stamp','State','Event']], 'Rejected audits':[['Audit ID','Status']], 'Audit_Obligations':[['Obligation_ID','Formal_Hours','Formal_Hours_Source','Scope_Version_ID','Company_Hours_Override_ID','Company_Hours_Override_Revision','Hours_Resolved_At']]};
let appended=0,fenceChecks=0,deny=false,loseFenceAfterAppend=false,batchReads=0,batchWrites=0;
const ok=result=>({ok:true,status:200,async json(){return structuredClone(result)}});
const fetchImpl=async(url,init={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname),method=init.method||'GET';
 if(method==='GET'&&path.endsWith('/values:batchGet')){
  assert.equal(u.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');
  batchReads++;
  return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>({values:rows[range.split('!')[0]]}))});
 }
 if(method==='GET'&&path.endsWith('/spreadsheets/dev-sheet')){
  return ok({sheets:Object.keys(rows).map((title,sheetId)=>({properties:{title,sheetId}}))});
 }
 if(method==='POST'&&path.endsWith(':batchUpdate')){
  const body=JSON.parse(init.body);
  batchWrites++;
  for(const {appendCells:request} of body.requests){
   assert.equal(request.fields,'userEnteredValue');
   const sheet=Object.keys(rows)[request.sheetId];
   assert.ok(sheet,'appendCells must target an existing sheet');
   for(const row of request.rows){
   const values=row.values.map(cell=>{
    const v=cell.userEnteredValue;
    if(v.stringValue!==undefined)return v.stringValue;
    if(v.numberValue!==undefined)return v.numberValue;
    if(v.boolValue!==undefined)return v.boolValue;
    return '';
   });
    rows[sheet].push(values);
    appended++;
   }
  }
  if(loseFenceAfterAppend)deny=true;
  return ok({replies:[{}]});
 }
 throw Error('HTTP_FIXTURE_UNKNOWN');
};
const service=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,verifyFence:async()=>{fenceChecks++;if(deny)throw Error('FENCE_LOST')}});
const intents=[{range:'Notification Queue!A:M',values:[['2026-10-29','PENDING','PLANNED','','audit-1','','','','','','hash-1']]}];
assert.equal((await service.inspect(intents)).state,'MISSING');
assert.equal((await service.apply({operationId:'op',gateToken:'token',intents})).confirmed,true);
assert.equal(appended,1);
assert.equal((await service.inspect(intents)).state,'MATCH');
assert.equal((await service.apply({operationId:'op',gateToken:'token',intents})).replayed,true);
assert.equal(appended,1);
deny=true;
await assert.rejects(()=>service.apply({operationId:'op2',gateToken:'token',intents:[{range:'Rejected audits!A:Z',values:[['audit-2','Rejected']]}]}),/FENCE_LOST/);
assert.equal(appended,1);
await assert.rejects(()=>service.inspect([{range:'Unsafe!A:Z',values:[['x']]}]),/APPEND_INTENT_UNSUPPORTED/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!A:B',values:[['OB-1','5','SCOPE_DEFAULT']]}]),/APPEND_INTENT_WIDTH_INVALID/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!B:G',values:[['OB-1','5']]}]),/APPEND_INTENT_WIDTH_INVALID/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!A:G',values:[['OB-1',{formula:'=NOW()'}]]}]),/APPEND_INTENT_CELL_INVALID/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!A:G',values:[['OB-1',['mixed']]]}]),/APPEND_INTENT_CELL_INVALID/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!A:G',values:[['OB-1',NaN]]}]),/APPEND_INTENT_CELL_INVALID/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!A:G',values:[['OB-1',Infinity]]}]),/APPEND_INTENT_CELL_INVALID/);
await assert.rejects(()=>service.inspect([{range:'Audit_Obligations!A:AA',values:[Array(28).fill('x')]}]),/APPEND_INTENT_WIDTH_INVALID/);
assert.ok(fenceChecks>=3);
deny=false;loseFenceAfterAppend=true;
await assert.rejects(()=>service.apply({operationId:'op3',gateToken:'token',intents:[{range:'Rejected audits!A:Z',values:[['audit-3','Rejected']]}]}),/FENCE_LOST/);
assert.equal(appended,2);
assert.equal((await service.inspect([{range:'Rejected audits!A:Z',values:[['audit-3','Rejected']]}])).state,'MATCH');

await assert.rejects(()=>service.inspect([
 {range:'Notification Queue!A:C',values:[['event-a']]},
 {range:'Notification Queue!A:M',values:[['event-b']]}
]),/APPEND_INTENT_MIXED_RANGES/);
// A replay cannot be acknowledged if the global fence is lost during inspection.
let replayFenceChecks=0;
const replayFence=createPlanningSheetsAppendProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,
 verifyFence:async()=>{if(++replayFenceChecks===2)throw Error('REPLAY_FENCE_LOST');}
});
await assert.rejects(()=>replayFence.apply({operationId:'op-replay',gateToken:'token',intents}),/REPLAY_FENCE_LOST/);
assert.equal(appended,2);

// New obligation append replay must preserve formal-hour provenance byte-for-byte.
loseFenceAfterAppend=false;
deny=false;
const provenanceRow=['OB-01','5','COMPANY_OVERRIDE','SV-2026','OV-2026','R2','2026-10-31T12:00:00.000Z'];
const provenanceIntent=[{range:'Audit_Obligations!A:G',values:[provenanceRow]}];
const beforeProvenance=appended;
assert.equal((await service.apply({operationId:'op-obligation',gateToken:'token',intents:provenanceIntent})).confirmed,true);
assert.equal(appended,beforeProvenance+1);
assert.deepEqual(rows['Audit_Obligations'][1],provenanceRow);
assert.equal((await service.apply({operationId:'op-obligation',gateToken:'token',intents:provenanceIntent})).replayed,true);
assert.equal(appended,beforeProvenance+1);


const validHeader=rows['Audit_Obligations'][0];
rows['Audit_Obligations'][0]=null;
await assert.rejects(()=>service.inspect(provenanceIntent),/APPEND_PROJECTION_SOURCE_MALFORMED/);
rows['Audit_Obligations'][0]=validHeader;
const savedRows=rows['Audit_Obligations'];
rows['Audit_Obligations']=[];
await assert.rejects(()=>service.inspect(provenanceIntent),/APPEND_PROJECTION_SOURCE_MALFORMED/);
rows['Audit_Obligations']=savedRows;


// A successful HTTP response without values must never be interpreted as an empty sheet.
const missingValues=createPlanningSheetsAppendProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'token',
 fetchImpl:async()=>ok({range:'Audit_Obligations!A1:G5000'}),
 verifyFence:async()=>{}
});
await assert.rejects(()=>missingValues.inspect(provenanceIntent),/APPEND_PROJECTION_SOURCE_MALFORMED/);
await assert.rejects(()=>missingValues.apply({operationId:'op-missing-values',gateToken:'token',intents:provenanceIntent}),/APPEND_PROJECTION_SOURCE_MALFORMED/);

// Formula-looking content must remain literal, not interpreted as a Sheets formula.
const formulaIntent=[{range:'Audit_Obligations!A:G',values:[['OB-FORMULA','=1+1','SCOPE_DEFAULT','SV-2026','','','2026-10-31T12:00:00.000Z']]}];
assert.equal((await service.apply({operationId:'op-formula',gateToken:'token',intents:formulaIntent})).confirmed,true);
assert.equal(rows['Audit_Obligations'].at(-1)[1],'=1+1');
// Header text is not evidence of a previously appended data row.
const headerLike=[['Obligation_ID','Formal_Hours','Formal_Hours_Source','Scope_Version_ID','Company_Hours_Override_ID','Company_Hours_Override_Revision','Hours_Resolved_At']];
assert.equal((await service.inspect([{range:'Audit_Obligations!A:G',values:headerLike}])).state,'MISSING');
// R1C incident #111: same logical notification with a different sent timestamp.
const queue=rows['Notification Queue'];
const first=['2026-11-15','SENT_DEV_REDIRECT','AUDIT_PLANNED_BY_MANAGER','auditor@example.test','VIS-1','','','','','','payload-111','earlier'];
const later=[...first];later[11]='later';
queue.push(first,later);
const logicalIntent=[{range:'Notification Queue!A:M',values:[first]}];
await assert.rejects(()=>service.inspect(logicalIntent),/APPEND_NOTIFICATION_LOGICAL_DUPLICATE_PRESENT/);
queue.pop();
assert.equal((await service.inspect([{range:'Notification Queue!A:M',values:[later]}])).state,'MATCH');
const pending=[...first];pending[1]='PENDING';pending[11]='';
assert.equal((await service.inspect([{range:'Notification Queue!A:M',values:[pending]}])).state,'MATCH');
const conflicting=[...later];conflicting[3]='different@example.test';
await assert.rejects(()=>service.inspect([{range:'Notification Queue!A:M',values:[conflicting]}]),/APPEND_NOTIFICATION_HASH_CONFLICT/);
assert.equal((await service.inspect(logicalIntent)).state,'MATCH');
queue.pop();
assert.equal((await service.inspect(logicalIntent)).state,'MISSING');
// Live R1C evidence 2026-11-15: two duplicate pairs with different TimestampSent.
const incidentRows=[
 ['VIS-484C04B11EFE19B89477','6404230f22aa9a5f14053512d9a9788f'],
 ['VIS-A16060674CB60DFC43D6','723408192aa4fb21a19e3448ebf70273']
];
const incidentIntents=[];
for(const [visit,hash] of incidentRows){
 const row=['2026-11-15T10:14','SENT_DEV_REDIRECT','AUDIT_PLANNED_BY_MANAGER',
 'auditor@example.test',visit,'Finca Hermosa','Subject','Body',0,'',hash,46341.78402777778,''];
 const second=[...row];second[11]=46341.941666666666;
 queue.push(row,second);
 const pending=[...row];pending[1]='PENDING';pending[11]='';
 incidentIntents.push({range:'Notification Queue!A:M',values:[pending]});
}
const writesBeforeIncident=appended;
await assert.rejects(()=>service.inspect(incidentIntents),/APPEND_NOTIFICATION_LOGICAL_DUPLICATE_PRESENT/);
await assert.rejects(()=>service.apply({operationId:'incident-111',gateToken:'fenced',intents:incidentIntents}),/APPEND_NOTIFICATION_LOGICAL_DUPLICATE_PRESENT/);
assert.equal(appended,writesBeforeIncident);
queue.splice(-4,4);
// Reject malformed or internally contradictory notification batches before any I/O.
const queueWritesBeforeValidation=appended;
await assert.rejects(()=>service.inspect([{range:'Notification Queue!A:M',
 values:[['stamp','PENDING','EVENT','','VIS-EMPTY','','','','','','']]}]),/APPEND_NOTIFICATION_HASH_REQUIRED/);
await assert.rejects(()=>service.inspect([{range:'Notification Queue!A:M',
 values:[['stamp','PENDING','EVENT','','VIS-1','','','','','','same-hash'],
 ['stamp','PENDING','EVENT','','VIS-2','','','','','','same-hash']]}]),/APPEND_NOTIFICATION_DUPLICATE_HASH_INTENT/);
assert.equal(appended,queueWritesBeforeValidation);
// A concurrent writer can materialize a row after the first scan.
// The projector must re-inspect and avoid a duplicate append.
let scanCount=0,lateWrites=0;
const lateRows={'Notification Queue':[['Stamp','State','Event']]};
const lateFetch=async(url,init={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname);
 if(path.endsWith('/values:batchGet')){
  scanCount++;
  if(scanCount===2)lateRows['Notification Queue'].push(['now','PENDING','EVENT','','VIS-LATE','','','','','','hash-late']);
  return ok({valueRanges:[{values:lateRows['Notification Queue']}]});
 }
 if(path.endsWith('/spreadsheets/dev-sheet')){
  await Promise.resolve();
  assert.equal(scanCount,2,'metadata and final duplicate scan start together');
  return ok({sheets:[{properties:{title:'Notification Queue',sheetId:1}}]});
 }
 if(path.endsWith(':batchUpdate')){lateWrites++;return ok({replies:[{}]});}
 throw Error('LATE_FETCH_UNEXPECTED');
};
const lateProjector=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',
 fetchImpl:lateFetch,verifyFence:async()=>{}});
const lateIntent=[{range:'Notification Queue!A:M',values:[['now','PENDING','EVENT','','VIS-LATE','','','','','','hash-late']]}];
assert.equal((await lateProjector.apply({operationId:'late',gateToken:'fence',intents:lateIntent})).confirmed,true);
assert.equal(lateWrites,0);
assert.ok(scanCount>=3);
// Multiple rows and tabs require one atomic append request and three batched reads.
const groupedIntents=[
 {range:'Rejected audits!A:Z',values:[['batch-1','Rejected'],['batch-2','Rejected']]},
 {range:'Notification Queue!A:M',values:[['now','PENDING','EVENT','','VIS-BATCH','','','','','','hash-batch']]}
];
const readsBeforeBatch=batchReads,writesBeforeBatch=batchWrites,rowsBeforeBatch=appended;
assert.equal((await service.apply({operationId:'op-batch',gateToken:'token',intents:groupedIntents})).confirmed,true);
assert.equal(batchReads-readsBeforeBatch,3);
assert.equal(batchWrites-writesBeforeBatch,1);
assert.equal(appended-rowsBeforeBatch,3);
assert.equal((await service.apply({operationId:'op-batch',gateToken:'token',intents:groupedIntents})).replayed,true);
assert.equal(appended-rowsBeforeBatch,3);
// NotificationSender clears Reserved (M) after delivery. This must not
// cause a false hash conflict on recovery; conflicting payloads still fail.
const deliveredIntent=[{range:'Notification Queue!A:M',values:[['2026-11-15','PENDING','PLANNED','','VIS-D','','subject','body',0,'','hash-delivered','',JSON.stringify({payload:{auditId:'VIS-D'}})]]}];
rows['Notification Queue'].push(['2026-11-15','SENT_DEV_REDIRECT','PLANNED','','VIS-D','','subject','body',1,'','hash-delivered','2026-11-15T12:00:00','']);
assert.equal((await service.inspect(deliveredIntent)).state,'MATCH');
const deliveredRow=rows['Notification Queue'].at(-1);
deliveredRow[1]='PENDING';
await assert.rejects(()=>service.inspect(deliveredIntent),/APPEND_NOTIFICATION_HASH_CONFLICT/);
deliveredRow[1]='SENT_DEV_REDIRECT';
deliveredRow[12]='{"payload":{"auditId":"DIFFERENT"}}';
await assert.rejects(()=>service.inspect(deliveredIntent),/APPEND_NOTIFICATION_HASH_CONFLICT/);
rows['Notification Queue'].pop();
const preparedRow=['2026-11-15','PENDING','AUDIT_ACCEPTED','','VIS-PREPARED','','subject','body',0,'','hash-prepared'];
const preparedArgs={operationId:'op-prepared',gateToken:'token',intents:[{range:'Notification Queue!A:M',values:[preparedRow]}]};
const prepared=await service.prepare(preparedArgs);
assert.equal(prepared.before.state,'MISSING');
rows['Notification Queue'].push(preparedRow.slice());
const freshInspection=await service.inspect(preparedArgs.intents);
const beforePreparedApply=batchWrites;
const preparedResult=await service.apply({...preparedArgs,prepared,freshInspection});
assert.equal(preparedResult.verification.state,'MATCH');
assert.equal(batchWrites,beforePreparedApply,'The final scan must catch an append after preparation');
const readsBeforeMetadata=batchReads;
const metadataOnly=await service.prepare({...preparedArgs,metadataOnly:true});
assert.equal(batchReads,readsBeforeMetadata,'Metadata preparation must not scan the queue');
const exactInspection=await service.inspect(preparedArgs.intents);
assert.equal((await service.apply({...preparedArgs,prepared:metadataOnly,freshInspection:exactInspection})).verification.state,'MATCH');
assert.equal(batchReads,readsBeforeMetadata+1,'A previously projected intent only needs one verified queue read');
assert.equal(batchWrites,beforePreparedApply);
console.log('Append projector: dedupe, replay, fence and unsupported-target guards passed');

// Regression: a legacy append shifted into AG/BY must block any replay.
rows['Audit planning']=[['Company','Location'],Array(32).fill('').concat(['Finca Hermosa','HQ'])];
const shifted=[{range:'Audit planning!A:CN',values:[['Finca Hermosa','HQ','',8,'VIS-EXAMPLE']]}];
const writesBeforeShifted=appended;
await assert.rejects(()=>service.inspect(shifted),/APPEND_PROJECTION_SHIFTED_ROW_PRESENT/);
await assert.rejects(()=>service.apply({operationId:'op-shifted',gateToken:'token',intents:shifted}),/APPEND_PROJECTION_SHIFTED_ROW_PRESENT/);
assert.equal(appended,writesBeforeShifted);
