import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAtomicExtensionWriteset20} from './planning-atomic-extension-writeset-20.mjs';
import {createAtomicExtensionService20} from './planning-atomic-extension-service-20.js';
const ph=['Audit ID','Status','Extension applied','Extended Expiration Date','Planning window from','Planning window to'],
 oh=['Obligation_ID','Extension_Applied','Extension_Metadata_JSON','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To'];
const before=['audit-1','Pending Planning','','2027-01-01','2026-12-01','2027-03-01'];
const obligation=['ob-1','','','2027-01-01','2026-12-01','2027-03-01'];
const source={planningRows:[ph,before],obligationRows:[oh,obligation]};
const values=['Yes','{"source":"AMS_DEV_MODEL_C_SCOPE_EXTENSION_20"}','2028-01-01','2027-12-01','2028-03-01'];
const updates=[
 ...[1,2,3,4,5].map((col,i)=>({range:"'Audit_Obligations'!"+'ABCDEF'[col]+'2',values:[[values[i]]]})),
 ...[2,3,4,5].map((col,i)=>({range:"'Audit planning'!"+'ABCDEF'[col]+'2',values:[['Yes','2028-01-01','2027-12-01','2028-03-01'][i]]]}))
];
const plan={auditId:'audit-1',obligationId:'ob-1',command:'apply',operationId:'request-1',
 updates,expected:{effectiveExpiry:'2028-01-01'},
 patch:{auditId:'audit-1',extensionApplied:true}};
const cbEvent={eventId:'CB_EXT_request-1',values:Array.from({length:16},(_,i)=>'field-'+i),
 certificationBodyId:'CB-1',notBefore:'2026-11-20T00:00:00Z'};
const rev=(headers,row)=>row[2]==='Yes'?'new-rev':'old-rev';
const proof=buildAtomicExtensionWriteset20({plan,source,cbEvent,revisionOf:rev});
assert.equal(proof.projectionWrites.length,9);
assert.equal(proof.projectionPreconditions.length,9);
assert.equal(proof.expectedSourceRevision,'old-rev');
assert.equal(proof.canonicalSnapshot.sourceRevision,'new-rev');
assert.deepEqual(proof.sourceRowBefore,before);
assert.equal(proof.appendIntents[0].range,'CB_Extension_Outbox!A:P');
assert.throws(()=>buildAtomicExtensionWriteset20({plan:{...plan,updates:updates.slice(1)},source,cbEvent,revisionOf:rev}),
 /SOURCE_INCOMPLETE/);
assert.throws(()=>buildAtomicExtensionWriteset20({plan:{...plan,updates:[...updates.slice(0,8),updates[0]]},source,cbEvent,revisionOf:rev}),
 /DUPLICATE/);
const previous={auditId:'audit-1',revision:6,pendingOperationId:null,
 claimIds:[],blocks:[],snapshot:{auditId:'audit-1',status:'Pending Planning',
 sourceRevision:'old-rev',headers:ph,row:before,managerCommentLast:'KEEP'}};
const actor={role:'manager',auditorId:'manager-1'};
const body={auditId:'audit-1',companyUid:'company-1',obligationId:'ob-1',command:'apply',requestId:'request-1'};
function setup({preflight=proof,inspection='MATCH',appendInspection='MATCH',outbox=null,old=previous}={}){
 const events=[];
 const instance=createAtomicExtensionService20({
  store:{
   readAudit:async()=>{events.push('readAudit');return old},
   readOutbox:async()=>outbox,
   commit:async args=>{events.push('commit');assert.equal(args.action,'EXT_APPLY');
    assert.equal(args.nextSnapshot.managerCommentLast,'KEEP');
    assert.equal(args.nextSnapshot.appendIntents[0].range,'CB_Extension_Outbox!A:P');
    return {revision:7}},
   markProjected:async()=>events.push('marked'),
   markUncertain:async()=>events.push('uncertainStore')
  },
  gate:{
   acquire:async()=>{events.push('gateAcquire');return{token:'token'}},
   release:async()=>events.push('gateRelease'),
   uncertain:async()=>events.push('uncertainGate')
  },
  preflight:async()=>{events.push('preflight');return preflight},
  projector:{
   apply:async()=>events.push('projectRows'),
   inspect:async()=>({state:inspection,detail:[{matched:true}]})
  },
  appendProjector:{
   apply:async()=>events.push('appendOutbox'),
   inspect:async()=>({state:appendInspection,count:1})
  }
 });
 return {instance,events};
}
{
 const {instance,events}=setup(),result=await instance.commit({actor,body});
 assert.equal(result.success,true);assert.equal(result.projection,'PROJECTED');
 assert.equal(result.cbNotification.certificationBodyId,'CB-1');
 assert.deepEqual(events,['gateAcquire','readAudit','preflight','commit',
  'projectRows','appendOutbox','marked','gateRelease']);
}
{
 const {instance,events}=setup({preflight:{...proof,sourceRowBefore:['other']}});
 await assert.rejects(instance.commit({actor,body}),/PREFLIGHT_NOT_AUTHORITATIVE/);
 assert.ok(!events.includes('commit'));assert.ok(events.includes('gateRelease'));
}
{
 const {instance,events}=setup({appendInspection:'MISSING'});
 await assert.rejects(instance.commit({actor,body}),/PROJECTION_NOT_VERIFIED/);
 assert.ok(events.includes('uncertainStore'));assert.ok(events.includes('uncertainGate'));
 assert.ok(!events.includes('marked'));
}
{
 const {instance,events}=setup({outbox:{auditId:'audit-1',actorId:'manager-1',
  state:'PROJECTED',snapshot:{scopeExtension:{patch:plan.patch,cbNotification:proof.cbNotification}}}});
 const result=await instance.commit({actor,body});
 assert.equal(result.idempotent,true);assert.equal(events.length,0);
}
{
 const {instance,events}=setup();
 await assert.rejects(instance.commit({actor:{...actor,role:'auditor'},body}),/INPUT_INVALID/);
 assert.equal(events.length,0);
}
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
assert.ok(server.includes("u.pathname==='/api/v1/manager/extension-obligation-command'&&planningAtomicExtension"));
assert.ok(r4.includes("return buildAtomicExtensionWriteset20({plan,source,cbEvent,revisionOf:directRowRevision})"));
assert.ok(r4.includes("EXT_ATOMIC_LEGACY_SHEETS_WRITERS_NOT_FROZEN"));
console.log('Issue #87 EXT/Undo atomic: 9-cell CAS + CB outbox + failure/replay PASS');
