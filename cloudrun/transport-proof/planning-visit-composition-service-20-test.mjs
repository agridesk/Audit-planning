import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPlanningVisitCompositionService20} from './planning-visit-composition-service-20.js';

const revision=createHash('sha256').update('A-1|Pending Planning||||').digest('hex').slice(0,24);
const obligations=[
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
];
const blocks=[
 {date:'2026-11-18',start:'08:00',end:'16:00'},
 {date:'2026-11-19',start:'09:00',end:'12:00'}
];
const allocations=[
 {blockIndex:0,obligationId:'O-1',start:'08:00',end:'16:00',minutes:480},
 {blockIndex:1,obligationId:'O-2',start:'09:00',end:'12:00',minutes:180}
];
const actor={role:'manager',auditorId:'manager-uid'};
const body={auditId:'A-1',companyUid:'C-1',sourceRevision:revision,mode:'TOGETHER',blocks,allocations:allocations.map(({minutes,...a})=>a)};
const requiredProofs=['SOURCE_REVISION_CAS','CANONICAL_MODEL_C_LINKS','CANONICAL_VISIT_IDENTITIES',
 'AVAILABILITY_CLAIM_PARITY','SHEETS_PREIMAGE_PARITY','NOTIFICATION_OUTBOX_INTENTS'];
let token=null,commits=0,applies=0,notifications=0,marked=0,uncertain=0,preflights=0;
const outbox=new Map();
const snapshot={auditId:'A-1',companyUid:'C-1',sourceRevision:revision,status:'Approved',scopeAllocations:allocations};
const sourceEvidence={
 readAuditRows:[['Audit ID','Company_UID','Status'],['A-1','C-1','Pending Planning']],
 readObligationRows:[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State','Planning_Window_From','Planning_Window_To'],['O-1','C-1','GAP',8,'OPEN','2026-11-01','2026-12-01'],['O-2','C-1','GRASP',3,'OPEN','01/11/2026','30/11/2026']],
 readLinkRows:[['Audit_ID','Obligation_ID','Link_State'],['A-1','O-1','ACTIVE'],['A-1','O-2','ACTIVE']],
 emptyAppendRows:[]
};
const proof={sourceEvidence,authorityPreflight:true,success:true,auditId:'A-1',companyUid:'C-1',
 sourceRevision:revision,expectedSourceRevision:revision,obligations,
 obligationIds:['O-1','O-2'],mode:'TOGETHER',writerVerified:true,
 requiredProofs,canonicalSnapshot:snapshot,
 projectionWrites:[{range:'Audit planning!A2:B2',values:[['A-1','Approved']]}],
 projectionPreconditions:[{range:'Audit planning!A2:B2',before:['A-1','Pending Planning']}],
 appendIntents:[{range:'Notification Queue!A:M',values:[['2026-11-11T17:10:00','PENDING','COMPOSE_VISIT','manager@example.com','A-1','Company','Composition planned','Audit composition recorded',0,'','sha256:event:composition','','']]}],
 entities:[{auditId:'A-1',expectedRevision:2,remove:false,auditorId:'auditor-uid',blocks,
  nextSnapshot:snapshot}]
};
let overrideProof={},failProjection=false;
const store={
 async readOutbox(id){return outbox.get(id)||null},
 async readAudit(){return {auditId:'A-1',revision:2,pendingOperationId:null,snapshot:{sourceRevision:revision}}},
 async commitMulti({operationId,actorId,action,entities,projectionPlan}){
  commits++;assert.equal(action,'COMPOSE_VISIT');
  assert.equal(entities.length,1);
  outbox.set(operationId,{auditId:'A-1',actorId,action,state:'PENDING',snapshot:projectionPlan});
  return {replayed:false,entities:[{auditId:'A-1',revision:3}]};
 },
 async markProjected({auditId,operationId,proof}){marked++;assert.equal(proof.verified,true);outbox.get(operationId).state='PROJECTED'},
 async markUncertain(){uncertain++}
};
const gate={
 async acquire({operationId}){assert.equal(token,null);token={token:'global-unique',operationId};return token},
 async release(){assert.notEqual(token,null);token=null},
 async uncertain(){uncertain++;token={...token,uncertain:true}}
};
const projector={
 async apply(){applies++;if(failProjection)throw Error('SIMULATED_PROJECTOR_TIMEOUT')},
 async inspect(){return {state:'MATCH',detail:[{range:'Audit planning!A2:B2',target:true}]}}
};
const appendProjector={
 async apply(){notifications++},
 async inspect(){return {state:'MATCH',count:1}}
};
const preflight=async({operationId})=>{preflights++;return {...structuredClone(proof),...overrideProof,gateOperationId:operationId}};
let sourceRowsOverride=null;
const canonicalReader={async read(){return structuredClone(sourceRowsOverride||sourceEvidence)}};
let capacityLeases=0,capacityReleased=0,capacityUncertain=0,failCapacityRelease=false;
const capacityGate={async acquire(){
 capacityLeases++;
 return {async release(){if(failCapacityRelease)throw Error('SIMULATED_LEASE_RELEASE_FAILURE');capacityReleased++},async uncertain(){capacityUncertain++}};
}};
const args={store,gate,projector,appendProjector,preflight,canonicalReader,capacityGate};
const disabled=createPlanningVisitCompositionService20(args);
await assert.rejects(()=>disabled.commit({actor,body}),/COMPOSITION_SERVICE_NOT_ENABLED/);
assert.equal(commits,0);
const service=createPlanningVisitCompositionService20({...args,enabled:true});
overrideProof={requiredProofs:[]};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_PROOF_INCOMPLETE/);
assert.equal(commits,0);assert.equal(token,null);
overrideProof={appendIntents:[{range:'Notification Queue!A:M',values:[['only','three','cells']]}]};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_NOTIFICATION_INTENT_INVALID/);
assert.equal(commits,0);assert.equal(token,null);
overrideProof={projectionWrites:[{range:'Companies!A2:B2',values:[['A-1','Approved']]}],
 projectionPreconditions:[{range:'Companies!A2:B2',before:['A-1','Pending Planning']}]};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_PROJECTION_SCOPE_FORBIDDEN/);
assert.equal(commits,0);assert.equal(token,null);
overrideProof={appendIntents:[{range:'Notification Queue!A:M',
 values:[[...proof.appendIntents[0].values[0].slice(0,4),'NOT_THE_SOURCE_AUDIT',...proof.appendIntents[0].values[0].slice(5)]]}]};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_NOTIFICATION_AUDIT_OR_STATE_MISMATCH/);
assert.equal(commits,0);assert.equal(token,null);
overrideProof={projectionWrites:[
 ...proof.projectionWrites,
 {range:'Audit_Visit_Obligations!A8:B8',values:[['A-1','O-1']]}
],projectionPreconditions:[
 ...proof.projectionPreconditions,
 {range:'Audit_Visit_Obligations!A8:B8',before:[]}
]};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_TOGETHER_BUSINESS_PROJECTION_INVALID/);
assert.equal(commits,0);assert.equal(token,null);
overrideProof={};
sourceRowsOverride={...sourceEvidence,
 readAuditRows:[['Audit ID','Company_UID','Status'],['A-1','OTHER','Pending Planning']]};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SOURCE_COMPANY_MISMATCH/);
assert.equal(commits,0);assert.equal(token,null);
sourceRowsOverride=null;
overrideProof={obligations:obligations.map((x,i)=>({...x,scopeCode:i===0?'GRASP':'GAP'}))};
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_SOURCE_EVIDENCE_MISMATCH/);
assert.equal(commits,0);assert.equal(token,null);
overrideProof={};
const first=await service.commit({actor,body});
assert.equal(first.success,true);assert.equal(first.mode,'TOGETHER');
assert.equal(commits,1);assert.equal(applies,1);assert.equal(notifications,1);assert.equal(marked,1);
assert.equal(capacityLeases,1);assert.equal(capacityReleased,1);
assert.equal(token,null);
const replay=await service.commit({actor,body});
assert.equal(replay.replayed,true);assert.equal(commits,1);assert.equal(applies,1);assert.equal(notifications,1);
await assert.rejects(()=>service.commit({actor:{role:'auditor',auditorId:'auditor-uid'},body}),/COMPOSITION_SERVICE_MANAGER_ONLY/);
failCapacityRelease=true;
await assert.rejects(()=>service.commit({actor,body:{...body,requestNonce:'lease-release-case'}}),/SIMULATED_LEASE_RELEASE_FAILURE/);
assert.equal(token.uncertain,true);
assert.equal(capacityUncertain,1);
failCapacityRelease=false;
token=null; // Simulated out-of-band recovery of global gate before the next independent scenario.
const different={...body,requestNonce:'timeout-case'};
failProjection=true;
await assert.rejects(()=>service.commit({actor,body:different}),/SIMULATED_PROJECTOR_TIMEOUT/);
assert.equal(commits,3);assert.equal(uncertain>=2,true);
assert.equal(token.uncertain,true);
assert.equal(capacityUncertain,2);
await assert.rejects(()=>service.commit({actor,body:different}),/COMPOSITION_SERVICE_RECOVERY_REQUIRED/);
console.log('VISIT_COMPOSITION_ATOMIC_SERVICE_20_PASS: disabled, proof rejection, commit, verified outbox, replay, uncertainty; no HTTP route');
