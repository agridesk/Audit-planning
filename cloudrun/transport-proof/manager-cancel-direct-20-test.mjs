import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const start=source.indexOf('async function directManagerCancel(');
const end=source.indexOf('async function directManagerReject(',start);
assert.ok(start>=0&&end>start);
const headers=['Audit ID','Status','Assigned to','Auditor_UID','Assigned_Auditor_UID',
 'Planning JSON','Hours planned','Date - Planned','Last manager decision',
 'Last auditor decision','Last decision timestamp','Auditor comment (last)','Company'];
const availabilityHeaders=['Available','First_Audit_Start_Time','First_Audit_End_Time','Audit_ID_1',
 'Status_1','Second_Audit_Start_Time','Second_Audit_End_Time','Audit_ID_2','Status_2','Last_Updated'];
let writes=[],appends=[],auditRow;
const context={
 process:{env:{AMS_RUNTIME_ENV:'DEV',AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED:'true'}},
 clean:x=>String(x??'').trim(),
 col:(h,names)=>h.findIndex(x=>names.includes(x)),
 val:(row,index)=>row[index]??'',
 findAudit:(rows,id)=>rows[1][0]===id?{h:rows[0],row:rows[1],sourceRow:2}:null,
 directStatusKey:s=>String(s).toUpperCase().replace(/[\s-]+/g,'_'),
 directRowRevision:()=> 'rev-1',
 directResolveAuditorEmail:()=> 'auditor@example.test',
 directSoftAvailabilityStatus:s=>s==='TENTATIVE',
 isoLocalStamp:()=> '2026-11-19T12:34:00',
 withDirectManagerActionLock:(_id,fn)=>fn(),
 sheetsBatchGet:async()=>[
  {values:[headers,auditRow]},
  {values:[availabilityHeaders,
   ['NO','09:00','10:00','audit-1','BOOKED','10:00','11:00','audit-2','BOOKED','old']]},
  {values:[['E-mail']]},{values:[['Type']]},{values:[['EVENT_KEY']]}
 ],
 sheetsValuesBatchUpdate:async data=>{writes.push(structuredClone(data));},
 sheetsValuesAppend:async(range,values)=>{appends.push({range,values});},
 directPrepareEcasLifecycle20:()=>({eligible:false,reason:'NOT_APPLICABLE'}),
 directEcasLifecycleQueueRow20:()=>null,
 canonicalManagerRecipient:()=> 'manager@example.test',
 a1col:n=>String.fromCharCode(64+n),
 createHash
};
const cancel=vm.runInNewContext('('+source.slice(start,end).trim()+')',context);
const makeRow=()=>['audit-1','Pending Approval','auditor@example.test','uid-1','uid-1',
 '{"blocks":[{}]}','8','2026-12-01','','','','','Company'];
const input={auditId:'audit-1',authorityPreflight:true,options:{reason:'reschedule',expectedRevision:'rev-1'}};
for(const auditorMode of [false,true]){
 writes=[];appends=[];auditRow=makeRow();
 const result=await cancel({email:'auditor@example.test',auditorId:'uid-1'},input,auditorMode);
 assert.equal(result.success,true);
 const row=writes[0][0].values[0],availability=writes[0][1].values[0];
 assert.equal(row[1],'Pending Planning');
 assert.equal(row[2],'');assert.equal(row[3],'');assert.equal(row[4],'');
 assert.equal(row[5],'');assert.equal(row[6],'');assert.equal(row[7],'');
 assert.equal(row[auditorMode?9:8],'CANCEL');
 assert.deepEqual(availability.slice(0,9),['NO','','','','','10:00','11:00','audit-2','BOOKED']);
 assert.equal(appends.length,1);
}
writes=[];auditRow=makeRow();
await assert.rejects(()=>cancel({auditorId:'other'},input,true),/AUDITOR_CANCEL_OWNERSHIP_DENIED/);
assert.equal(writes.length,0);
writes=[];auditRow=makeRow();
await assert.rejects(()=>cancel({auditorId:'uid-1'},{...input,options:{reason:'reschedule',expectedRevision:'stale'}},true),/MANAGER_ACTION_SOURCE_REVISION_CONFLICT/);
assert.equal(writes.length,0);
// The legacy auditor replay still depends on the retained UID.
writes=[];auditRow=makeRow();
await cancel({email:'auditor@example.test',auditorId:'uid-1'},{...input,authorityPreflight:false},true);
assert.equal(writes[0][0].values[0][3],'uid-1');
console.log('Cancel: atomic owner reset, retained other booking, authorization and legacy compatibility passed');
