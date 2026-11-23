import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createPlanningSheetsWritesetProjector} from './planning-sheets-writeset-projector-20.js';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';
import {createPlanningLifecycleAtomicService} from './planning-lifecycle-atomic-service-20.js';
import {normalizeLifecycleWriteset} from './planning-lifecycle-writeset-20.js';

const original=new Map([
 ['Audit planning!A2:D2',['audit-1','Approved','auditor@example.test','plan']],
 ['Auditor Availability!A3:D3',['2027-01-01','auditor-1','NO','audit-1']]
]);
const plan={
 projectionWrites:[
  {range:'Audit planning!A2:D2',values:[['audit-1','Pending Planning','','']]},
  {range:'Auditor Availability!A3:D3',values:[['2027-01-01','auditor-1','YES','']]}
 ],
 projectionPreconditions:[
  {range:'Audit planning!A2:D2',before:original.get('Audit planning!A2:D2')},
  {range:'Auditor Availability!A3:D3',before:original.get('Auditor Availability!A3:D3')}
 ]
};
function fixture({initial=original,failFence=0,dropWrite=false,failRead=false}={}){
 const current=new Map([...initial].map(([range,values])=>[range,values.slice()]));
 const calls=[];let fenceChecks=0;
 const ok=data=>({ok:true,status:200,json:async()=>structuredClone(data)});
 const projector=createPlanningSheetsWritesetProjector({
  spreadsheetId:'sheet',getToken:async()=> 'test',
  verifyFence:async()=>{if(++fenceChecks===failFence)throw Error('FENCE_LOST');},
  fetchImpl:async(url,init={})=>{
   const u=new URL(url),method=init.method||'GET';
   calls.push({method,path:u.pathname,ranges:u.searchParams.getAll('ranges')});
   if(method==='GET'&&u.pathname.endsWith('/values:batchGet')){
    if(failRead)return {ok:false,status:429};
    return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>({
     values:current.get(range)?.length?[current.get(range)]:[]
    }))});
   }
   if(method==='GET')return ok({sheets:['Audit planning','Auditor Availability','Concept Reservations']
    .map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100}}}))});
   if(method==='POST'&&u.pathname.endsWith('/values:batchUpdate')){
    if(!dropWrite)for(const item of JSON.parse(init.body).data)current.set(item.range,item.values[0]);
    return ok({});
   }
   throw Error('UNEXPECTED_TEST_REQUEST');
  }
 });
 return {projector,current,calls,reads:()=>calls.filter(x=>x.method==='GET').length,
  writes:()=>calls.filter(x=>x.method==='POST').length};
}
const args={operationId:'cancel-1',gateToken:'gate-1',plan};
const baseline=fixture();
await baseline.projector.apply(args);
assert.equal(baseline.reads(),4,'The previous path reads rows, metadata, rows, and readback');
assert.equal(baseline.writes(),1);

const optimized=fixture();
await optimized.projector.apply({...args,existingRowsOnly:true});
assert.equal(optimized.reads(),2,'Existing CANCEL rows need only a fresh check and readback');
assert.equal(optimized.writes(),1);
assert.deepEqual([...optimized.current],[...baseline.current]);
assert.deepEqual(optimized.calls.filter(x=>x.method==='GET').map(x=>x.ranges),[
 ['Audit planning!A2:D2','Auditor Availability!A3:D3'],
 ['Audit planning!A2:D2','Auditor Availability!A3:D3']
]);

const conflictInitial=new Map(original);
conflictInitial.set('Auditor Availability!A3:D3',['2027-01-01','different','NO','audit-1']);
const conflict=fixture({initial:conflictInitial});
await assert.rejects(()=>conflict.projector.apply({...args,existingRowsOnly:true}),/SHEETS_PROJECTION_PRECONDITION_CONFLICT/);
assert.equal(conflict.writes(),0);
const lostFence=fixture({failFence:2});
await assert.rejects(()=>lostFence.projector.apply({...args,existingRowsOnly:true}),/FENCE_LOST/);
assert.equal(lostFence.writes(),0);
const invalidReadback=fixture({dropWrite:true});
await assert.rejects(()=>invalidReadback.projector.apply({...args,existingRowsOnly:true}),/SHEETS_PROJECTION_VERIFY_FAILED/);
const rateLimited=fixture({failRead:true});
await assert.rejects(()=>rateLimited.projector.apply({...args,existingRowsOnly:true}),/SHEETS_PROJECTOR_HTTP_429/);
assert.equal(rateLimited.writes(),0);

const emptyInitial=new Map(original);
emptyInitial.set('Auditor Availability!A3:D3',[]);
const emptyPlan=structuredClone(plan);
emptyPlan.projectionPreconditions[1].before=[];
const missing=fixture({initial:emptyInitial});
await missing.projector.apply({...args,plan:emptyPlan,existingRowsOnly:true});
assert.equal(missing.reads(),4,'An empty before-image must retain metadata and both prewrite checks');
const unsupportedPlan=structuredClone(plan);
unsupportedPlan.projectionWrites[1].range='Concept Reservations!A3:D3';
unsupportedPlan.projectionPreconditions[1].range='Concept Reservations!A3:D3';
const unsupportedInitial=new Map(original);
unsupportedInitial.set('Concept Reservations!A3:D3',unsupportedInitial.get('Auditor Availability!A3:D3'));
const unsupported=fixture({initial:unsupportedInitial});
await unsupported.projector.apply({...args,plan:unsupportedPlan,existingRowsOnly:true});
assert.equal(unsupported.reads(),4,'Other sheets keep the original projection checks');

const applied=[],finalChecks=[];
const sourceHeaders=['Planning JSON'];
const sourceRow=['{"blocks":[{"date":"2027-01-01","start":"09:00","end":"10:00"}]}'];
const audit={revision:1,auditorId:'auditor-1',pendingOperationId:null,
 snapshot:{sourceRevision:'before',status:'PENDING_APPROVAL',headers:sourceHeaders,row:sourceRow}};
const state={
 async readOutbox(){return null;},async readAudit(){return audit;},
 async commit(){return {revision:2,replayed:false};},async markProjected(){},async markUncertain(){}
};
const gate={async acquire(){return {token:'gate'};},async release(){},async uncertain(){}};
const lifecycle=createPlanningLifecycleAtomicService({
 atomicStore:state,gate,
 projector:{
  async apply(input){applied.push(input.existingRowsOnly);},
  async inspect(){finalChecks.push('rows');return {state:'MATCH',detail:[]};}
 },
 appendProjector:{
  async apply(){},
  async inspect(){finalChecks.push('appends');return {state:'MATCH',count:0};}
 },
 preflight:async({action})=>{
  const status=action==='CANCEL'?'Pending Planning':'Approved';
  return {success:true,authorityPreflight:true,auditId:'audit-1',expectedSourceRevision:'before',
   sourceRowBefore:sourceRow,
   projectionWrites:plan.projectionWrites,projectionPreconditions:plan.projectionPreconditions,appendIntents:[],
   canonicalSnapshot:{status,assignedTo:'auditor@example.test',sourceRevision:'after',
    headers:sourceHeaders,row:sourceRow}};
 },
 roster:async()=>[{role:'auditor',active:true,email:'auditor@example.test',auditorId:'auditor-1'}]
});
for(const action of ['CANCEL','APPROVE','ACCEPT'])
 await lifecycle.commit({actor:{role:'manager',auditorId:'manager-1'},body:{auditId:'audit-1'},action});
await lifecycle.commit({actor:{role:'auditor',auditorId:'auditor-1'},body:{auditId:'audit-1'},action:'CANCEL'});
assert.deepEqual(applied,[true,false,false,false],'Only manager CANCEL may use the existing-row optimization');
assert.deepEqual(finalChecks,['rows','appends','rows','appends','rows','appends','rows','appends']);

function integratedCancel(useLegacyRows){
 const current=new Map([...original].map(([range,values])=>[range,values.slice()]));
 const queue=[['Timestamp','Status','Type']],calls=[];
 let locked=false,proof=null;
 const ok=data=>({ok:true,status:200,json:async()=>structuredClone(data)});
 const verifyFence=async()=>{if(!locked)throw Error('FENCE_LOST');};
 const fetchImpl=async(url,init={})=>{
  const u=new URL(url),method=init.method||'GET';
  calls.push({method,path:u.pathname});
  if(method==='GET'&&u.pathname.endsWith('/values:batchGet')){
   return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>({
    values:range==='Notification Queue!A1:M5000'?queue:
     current.get(range)?.length?[current.get(range)]:[]
   }))});
  }
  if(method==='GET')return ok({sheets:['Audit planning','Auditor Availability','Notification Queue']
   .map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:100}}}))});
  const body=JSON.parse(init.body);
  if(u.pathname.endsWith('/values:batchUpdate')){
   for(const item of body.data)current.set(item.range,item.values[0]);
   return ok({});
  }
  if(u.pathname.endsWith(':batchUpdate')){
   for(const item of body.requests){
    assert.equal(item.appendCells.sheetId,2);
    for(const entry of item.appendCells.rows)queue.push(entry.values.map(cell=>{
     const value=cell.userEnteredValue;
     return value.stringValue??value.numberValue??value.boolValue??'';
    }));
   }
   return ok({});
  }
  throw Error('UNEXPECTED_INTEGRATED_REQUEST');
 };
 const rows=createPlanningSheetsWritesetProjector({spreadsheetId:'sheet',getToken:async()=> 'test',fetchImpl,verifyFence});
 const appends=createPlanningSheetsAppendProjector({spreadsheetId:'sheet',getToken:async()=> 'test',fetchImpl,verifyFence});
 const store={
  async readOutbox(){return null;},async readAudit(){return audit;},
  async commit(){return {revision:2,replayed:false};},
  async markProjected(input){proof=input.proof;},async markUncertain(){throw Error('UNEXPECTED_UNCERTAINTY');}
 };
 const lifecycle=createPlanningLifecycleAtomicService({
  atomicStore:store,
  gate:{async acquire(){locked=true;return {token:'gate'};},async release(){locked=false;},async uncertain(){throw Error('UNEXPECTED_UNCERTAIN_GATE');}},
  projector:useLegacyRows?{inspect:rows.inspect,apply:input=>rows.apply({...input,existingRowsOnly:false})}:rows,
  appendProjector:appends,roster:async()=>[],
  preflight:async()=>({success:true,authorityPreflight:true,auditId:'audit-1',expectedSourceRevision:'before',
   sourceRowBefore:sourceRow,
   projectionWrites:plan.projectionWrites,projectionPreconditions:plan.projectionPreconditions,
   appendIntents:[{range:'Notification Queue!A:M',values:[
    ['now','PENDING','AUDIT_CANCELLED_BY_MANAGER','auditor@example.test','audit-1','','','','','','cancel-hash']
   ]}],canonicalSnapshot:{status:'Pending Planning',assignedTo:'',sourceRevision:'after',headers:sourceHeaders,row:sourceRow}})
 });
 return {run:()=>lifecycle.commit({actor:{role:'manager',auditorId:'manager-1'},body:{auditId:'audit-1'},action:'CANCEL'}),
  calls,current,queue,proof:()=>proof};
}
const integratedOld=integratedCancel(true),integratedNew=integratedCancel(false);
const oldResult=await integratedOld.run(),newResult=await integratedNew.run();
assert.deepEqual(newResult,oldResult);
assert.deepEqual([...integratedNew.current],[...integratedOld.current]);
assert.deepEqual(integratedNew.queue,integratedOld.queue);
assert.deepEqual(integratedNew.proof(),integratedOld.proof());
assert.equal(integratedOld.calls.filter(x=>x.method==='GET').length,10);
assert.equal(integratedNew.calls.filter(x=>x.method==='GET').length,8,
 'A complete CANCEL keeps queue deduplication and final verification while saving two reads');
console.log('PASS CANCEL saves two Sheets reads while preserving row checks, fences and final verification');

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
function fragment(start,end){
 const from=r4.indexOf(start),to=r4.indexOf(end,from);
 assert.ok(from>=0&&to>from);
 return r4.slice(from,to);
}
const sheetFunctions=fragment('function sheetsBatchGet(', 'async function sheetsAtomicAuditorCreate(');
const preflightFunction=fragment('async function lifecycleAuthorityPreflight20(', 'async function canonicalManagerAction(');
const cancelFunction=fragment('async function directManagerCancel(', 'async function directManagerReject(');
const makeR4=new Function(
 'process','fetch','accessToken','SID','lifecyclePreviewContext20','assertScopeExtensionLegacyWriteFenced20',
 'normalizeLifecycleWriteset','clean','findAudit','col','val','directStatusKey','directRowRevision',
 'withDirectManagerActionLock','directResolveAuditorEmail','isoLocalStamp','directSoftAvailabilityStatus',
 'a1col','directPrepareEcasLifecycle20','directEcasLifecycleQueueRow20','canonicalManagerRecipient','createHash',
 `${sheetFunctions}\n${preflightFunction}\n${cancelFunction}\nreturn {lifecycleAuthorityPreflight20,directManagerCancel};`
);
function preflightFixture({status='Approved',mutateAvailability=false}={}){
 const h=['Audit ID','Status','Assigned to','Auditor_UID','Date - Planned','Date - Approved','Audit days textual',
  'Planning JSON','Hours planned','Status since','Last manager decision','Last decision timestamp',
  'Manager comment (last)','Company'];
 const planning=[h,['audit-1',status,'auditor@example.test','auditor-1','2027-01-01','2027-01-01','1 day',
  '{"blocks":[]}',8,'yesterday','','','','Test Farm']];
 const ah=['Auditor_UID','Available','First_Audit_Start_Time','First_Audit_End_Time','Audit_ID_1',
  'Second_Audit_Start_Time','Second_Audit_End_Time','Audit_ID_2','Status_1','Status_2','Last_Updated'];
 const availability=[ah,['auditor-1','NO','09:00','10:00','audit-1','','','','Approved','','yesterday']];
 const originalAvailability=structuredClone(availability[1]),calls=[];
 let posts=0,changed=false;
 const col=(headers,names)=>{for(const name of names){const i=headers.indexOf(name);if(i>=0)return i;}return -1;};
 const clean=value=>String(value??'').trim();
 const rowFor=range=>{
  const tables={
   'Audit planning!A1:BW2000':planning,
   'Auditor Availability!A:P':availability,
   'Auditors!A1:Z256':[['E-mail'],['auditor@example.test']],
   'Notification Queue!A1:M5000':[['Timestamp']],
   'Notification_Config!A1:AF200':[['EVENT_KEY']]
  };
  if(Object.hasOwn(tables,range))return structuredClone(tables[range]);
  const match=/^(Audit planning|Auditor Availability)!([A-Z]+)(\d+):([A-Z]+)\d+$/.exec(range);
  if(!match)throw Error('UNEXPECTED_PREFLIGHT_RANGE_'+range);
  const number=letters=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  const rows=match[1]==='Audit planning'?planning:availability;
  const row=rows[Number(match[3])-1];
  return row?[row.slice(number(match[2])-1,number(match[4]))]:[];
 };
 const fetchImpl=async(url,init={})=>{
  const method=init.method||'GET',u=new URL(url),ranges=u.searchParams.getAll('ranges');
  calls.push({method,ranges});
  if(method!=='GET'){posts++;throw Error('PREFLIGHT_MUST_NOT_WRITE');}
  if(!u.pathname.endsWith('/values:batchGet'))throw Error('UNEXPECTED_PREFLIGHT_REQUEST');
  const valueRanges=ranges.map(range=>({values:rowFor(range)}));
  if(mutateAvailability&&!changed&&ranges.includes('Auditor Availability!A:P')){
   availability[1][0]='another-auditor';changed=true;
  }
  return {ok:true,status:200,json:async()=>({valueRanges})};
 };
 const context=new AsyncLocalStorage();
 const api=makeR4(
  {env:{AMS_RUNTIME_ENV:'DEV',AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED:'true'}},
  fetchImpl,async()=> 'test-token','test-sheet',context,()=>{},normalizeLifecycleWriteset,clean,
  (rows,id)=>{
   const index=rows.findIndex((row,i)=>i>0&&row[col(rows[0],['Audit ID'])]===id);
   return index<0?null:{h:rows[0],row:rows[index],sourceRow:index+1};
  },
  col,(row,index)=>index<0?'':clean(row[index]),
  value=>clean(value).toUpperCase().replace(/[\s-]+/g,'_'),
  (_headers,row)=>JSON.stringify(row),
  (_auditId,fn)=>fn(),()=> 'auditor@example.test',()=> '2027-01-02T10:00:00',
  ()=>false,n=>{let label='';for(;n>0;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label;},
  ()=>({eligible:false,reason:''}),()=>null,()=> 'manager@example.test',createHash
 );
 return {api,calls,fetchImpl,planning,availability,originalAvailability,posts:()=>posts};
}
async function previewCancel(fixture,{auditor=false}={}){
 const identity=auditor?{email:'auditor@example.test',auditorUid:'auditor-1'}:{email:'manager@example.test'};
 const body={auditId:'audit-1',options:{reason:'test'},authorityPreflight:true};
 if(auditor)body.options.expectedRevision=JSON.stringify(fixture.planning[1]);
 return fixture.api.lifecycleAuthorityPreflight20(identity,body,'CANCEL',
  ()=>fixture.api.directManagerCancel(identity,body,auditor));
}
const managerPreflight=preflightFixture(),managerPreview=await previewCancel(managerPreflight);
assert.equal(managerPreflight.calls.length,1,'manager CANCEL preflight reuses the availability batch');
assert.equal(managerPreflight.posts(),0,'the preflight must not issue Sheets writes');
assert.equal(managerPreview.canonicalSnapshot.status,'Pending Planning');
assert.deepEqual(managerPreview.projectionPreconditions.find(x=>x.range.startsWith('Auditor Availability!')).before,
 managerPreflight.originalAvailability);
assert.equal(managerPreview.projectionWrites.find(x=>x.range.startsWith('Auditor Availability!')).values[0][1],'YES');
assert.equal(managerPreview.appendIntents.length,1);

const concurrent=preflightFixture({mutateAvailability:true}),concurrentPreview=await previewCancel(concurrent);
assert.equal(concurrent.calls.length,1);
assert.deepEqual(concurrentPreview.projectionPreconditions.find(x=>x.range.startsWith('Auditor Availability!')).before,
 concurrent.originalAvailability,'the before-image must be the one used to construct the update');
const concurrentProjector=createPlanningSheetsWritesetProjector({
 spreadsheetId:'test-sheet',getToken:async()=> 'test-token',fetchImpl:concurrent.fetchImpl,verifyFence:async()=>{}
});
await assert.rejects(()=>concurrentProjector.apply({
 operationId:'cancel-concurrent',gateToken:'test-gate',plan:concurrentPreview,existingRowsOnly:true
}),/SHEETS_PROJECTION_PRECONDITION_CONFLICT/);
assert.equal(concurrent.posts(),0,'a concurrent availability change must prevent the projection write');

const auditorPreflight=preflightFixture({status:'Pending Approval'});
await previewCancel(auditorPreflight,{auditor:true});
assert.equal(auditorPreflight.calls.length,2,'auditor CANCEL retains the existing fresh-read path');
assert.deepEqual(auditorPreflight.calls[1].ranges,['Auditor Availability!A2:K2']);
assert.equal(auditorPreflight.posts(),0);
console.log('PASS manager CANCEL saves two projector reads and one preflight read while preserving row checks and fences');
