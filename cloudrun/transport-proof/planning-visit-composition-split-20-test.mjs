import assert from 'node:assert/strict';
import {createPlanningVisitCompositionService20} from './planning-visit-composition-service-20.js';

const rev='a'.repeat(24),issuer='b'.repeat(24);
const actor={role:'manager',auditorId:'M-1'};
const obligations=[
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
];
const visits=[
 {auditId:'A-1',obligationId:'O-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {auditId:'A-2',obligationId:'O-2',identityIssuedBy:'CANONICAL',identityIssueRevision:issuer,
  blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
];
const snapshot={
 auditId:'A-1',companyUid:'C-1',sourceRevision:rev,status:'Approved',
 obligationId:'O-1'
};
const successor={auditId:'A-2',companyUid:'C-1',sourceRevision:'c'.repeat(24),status:'Approved',obligationId:'O-2'};
const header=['Audit_ID','Obligation_ID','Link_State','Linked_At','Unlinked_At'];
const before=['A-1','O-2','ACTIVE','2026-01-01',''];
const inactive=['A-1','O-2','INACTIVE','2026-01-01','2026-11-11T17:10:00'];
const active=['A-2','O-2','ACTIVE','2026-11-11T17:10:00',''];
const planRows=[
 {range:'Audit_Visit_Obligations!A3:E3',values:[inactive]},
 {range:'Audit_Visit_Obligations!A5:E5',values:[active]}
];
const prerequisites=[
 {range:planRows[0].range,before},
 {range:planRows[1].range,before:[]}
];
let writes=0,projections=0,appends=0,uncertain=0,lock=null,wrong=false;
const store={
 async readOutbox(){return null},
 async readAudit(){return {revision:2,pendingOperationId:null,snapshot:{sourceRevision:rev}}},
 async commitMulti({entities,projectionPlan,action}){writes++;assert.equal(action,'COMPOSE_VISIT');assert.equal(entities.length,2);assert.equal(projectionPlan.projectionWrites.length,2);return {replayed:false,entities:[]}},
 async markProjected({proof}){assert.equal(proof.verified,true)},
 async markUncertain(){uncertain++}
};
const gate={
 async acquire({operationId}){lock={token:'G-1',operationId};return lock},
 async release(){lock=null},
 async uncertain(){uncertain++;lock=null}
};
const projector={
 async apply(){projections++},
 async inspect(){return {state:'MATCH',detail:[]}}
};
const appendProjector={
 async apply(){appends++},
 async inspect(){return {state:'MATCH',count:1}}
};
const proof={
 success:true,authorityPreflight:true,auditId:'A-1',companyUid:'C-1',
 sourceRevision:rev,expectedSourceRevision:rev,writerVerified:true,
 obligations,obligationIds:['O-1','O-2'],mode:'SEPARATELY',
 visits,linkValues:[header,['A-1','O-1','ACTIVE','2026-01-01',''],before],
 appendRowNumbers:[5],now:'2026-11-11T17:10:00',verifiedEmptyAppendRows:true,
 requiredProofs:['SOURCE_REVISION_CAS','CANONICAL_MODEL_C_LINKS','CANONICAL_VISIT_IDENTITIES','AVAILABILITY_CLAIM_PARITY','SHEETS_PREIMAGE_PARITY','NOTIFICATION_OUTBOX_INTENTS'],
 projectionWrites:planRows,projectionPreconditions:prerequisites,
 appendIntents:[{range:'Notification Queue!A:M',values:[['now','COMPOSE_VISIT','A-1','A-2']]}],
 canonicalSnapshot:snapshot,
 entities:[
 {auditId:'A-1',expectedRevision:2,remove:false,auditorId:'aud-1',blocks:visits[0].blocks,nextSnapshot:snapshot},
 {auditId:'A-2',expectedRevision:null,remove:false,auditorId:'aud-1',blocks:visits[1].blocks,nextSnapshot:successor}
 ]
};
const service=createPlanningVisitCompositionService20({enabled:true,store,gate,projector,appendProjector,
 preflight:async({operationId})=>({...structuredClone(proof),verifiedEmptyAppendRows:!wrong,gateOperationId:operationId})});
const body={auditId:'A-1',companyUid:'C-1',sourceRevision:rev,mode:'SEPARATELY'};
wrong=true;
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_APPEND_ROWS_NOT_VERIFIED/);
assert.equal(writes,0);assert.equal(lock,null);
wrong=false;
const receipt=await service.commit({actor,body});
assert.equal(receipt.success,true);
assert.equal(receipt.mode,'SEPARATELY');
assert.deepEqual(receipt.visitAuditIds,['A-1','A-2']);
assert.equal(writes,1);assert.equal(projections,1);assert.equal(appends,1);
assert.equal(uncertain,0);
assert.equal(lock,null);
console.log('VISIT_COMPOSITION_ATOMIC_SPLIT_20_PASS: complete Model C links, Firestore multi, outbox, verified projection; isolated');
