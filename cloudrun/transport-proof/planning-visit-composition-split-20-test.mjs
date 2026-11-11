import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPlanningVisitCompositionService20} from './planning-visit-composition-service-20.js';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareModelCPlanningVisitSplitRows20} from './visit-model-c-planning-split-rows-20.mjs';
import {deriveVisitSplitIdentity20} from './visit-composition-identity-20.mjs';

const rev=createHash('sha256').update('A-1|Pending Planning||||').digest('hex').slice(0,24),issuer=rev;
const successorAuditId=deriveVisitSplitIdentity20({sourceAuditId:'A-1',obligationId:'O-2',sourceRevision:rev}).auditId;
const actor={role:'manager',auditorId:'M-1'};
const obligations=[
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
];
const visits=[
 {auditId:'A-1',obligationId:'O-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {auditId:successorAuditId,obligationId:'O-2',identityIssuedBy:'CANONICAL',identityIssueRevision:issuer,
  blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
];
const snapshot={
 auditId:'A-1',companyUid:'C-1',sourceRevision:rev,status:'Approved',
 obligationId:'O-1'
};
const successor={auditId:successorAuditId,companyUid:'C-1',sourceRevision:'c'.repeat(24),status:'Approved',obligationId:'O-2'};
const header=['Audit_ID','Obligation_ID','Link_State','Migration_Batch_ID','Linked_At','Unlinked_At'];
const before=['A-1','O-2','ACTIVE','BATCH-ORIGIN','2026-01-01',''];
const inactive=['A-1','O-2','INACTIVE','BATCH-ORIGIN','2026-01-01','2026-11-11T17:10:00'];
const active=[successorAuditId,'O-2','ACTIVE','BATCH-ORIGIN','2026-11-11T17:10:00',''];
const planRows=[
 {range:'Audit_Visit_Obligations!A3:F3',values:[inactive]},
 {range:'Audit_Visit_Obligations!A5:F5',values:[active]}
];
const prerequisites=[
 {range:planRows[0].range,before},
 {range:planRows[1].range,before:[]}
];
let writes=0,projections=0,appends=0,uncertain=0,lock=null,wrong=false;
const store={
 async readOutbox(){return null},
 async readAudit(){return {revision:2,pendingOperationId:null,snapshot:{sourceRevision:rev}}},
 async commitMulti({entities,projectionPlan,action}){writes++;assert.equal(action,'COMPOSE_VISIT');assert.equal(entities.length,2);assert.equal(projectionPlan.projectionWrites.length,4);return {replayed:false,entities:[]}},
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
const planningHeaders=['Company','Company_UID','Audit ID','Status','Assigned to','Planning JSON',
 'Total audit time in hours','Total audit time in days','Date - Planned','Date - Approved',
 'Scopes_List','SCOPE_01','Duration SCOPE_01','SCOPE_02','Duration SCOPE_02',...Array.from({length:26},(_,i)=>'Other_'+i)];
const planningSource=['A company','C-1','A-1','Pending Planning','','','11.00','','','','','x','8','x','3',...Array(26).fill('')];
const scopeConfig=[['SlotKey','ScopeCode'],['SCOPE_01','GAP'],['SCOPE_02','GRASP']];
const sourceEvidence={
 readAuditRows:[planningHeaders,planningSource],
 readObligationRows:[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State','Planning_Window_From','Planning_Window_To'],['O-1','C-1','GAP',8,'OPEN','2026-11-01','2026-12-01'],['O-2','C-1','GRASP',3,'LINKED_TO_VISIT','01/11/2026','30/11/2026']],
 readLinkRows:[header,['A-1','O-1','ACTIVE','BATCH-ORIGIN','2026-01-01',''],before],
 readConfigScopeRows:scopeConfig,
 emptyAppendRows:[{row:5,before:[]}],
 emptyPlanningRows:[{row:4,before:[]}]
};
const proof={sourceEvidence,
 success:true,authorityPreflight:true,auditId:'A-1',companyUid:'C-1',
 sourceRevision:rev,expectedSourceRevision:rev,writerVerified:true,
 obligations,obligationIds:['O-1','O-2'],mode:'SEPARATELY',
 visits,linkValues:[header,['A-1','O-1','ACTIVE','BATCH-ORIGIN','2026-01-01',''],before],
 appendRowNumbers:[5],planningAppendRowNumbers:[4],now:'2026-11-11T17:10:00',verifiedEmptyAppendRows:true,verifiedEmptyPlanningRows:true,
 requiredProofs:['SOURCE_REVISION_CAS','CANONICAL_MODEL_C_LINKS','CANONICAL_VISIT_IDENTITIES','AVAILABILITY_CLAIM_PARITY','SHEETS_PREIMAGE_PARITY','NOTIFICATION_OUTBOX_INTENTS'],
 projectionWrites:planRows,projectionPreconditions:prerequisites,
 appendIntents:[{range:'Notification Queue!A:M',values:[['2026-11-11T17:10:00','PENDING','COMPOSE_VISIT','manager@example.com','A-1','Company','Composition planned','Audit composition recorded',0,'','sha256:event:composition','','']]}],
 canonicalSnapshot:snapshot,
 entities:[
 {auditId:'A-1',expectedRevision:2,remove:false,auditorId:'aud-1',blocks:visits[0].blocks,nextSnapshot:snapshot},
 {auditId:successorAuditId,expectedRevision:null,remove:false,auditorId:'aud-1',blocks:visits[1].blocks,nextSnapshot:successor}
 ]
};
const prepared=prepareVisitCompositionCommand20({auditId:'A-1',companyUid:'C-1',sourceRevision:rev,
 obligations,mode:'SEPARATELY',visits});
const planningSplit=prepareModelCPlanningVisitSplitRows20({command:prepared,
 planningValues:sourceEvidence.readAuditRows,configScopeValues:scopeConfig,newRowNumbers:[4]});
proof.projectionWrites.push(...planningSplit.projectionWrites);
proof.projectionPreconditions.push(...planningSplit.projectionPreconditions);
const canonicalReader={async read(){return structuredClone(sourceEvidence)}};
let capacityAcquisitions=0,capacityReleased=0;
const capacityGate={async acquire({entities}){capacityAcquisitions++;assert.equal(entities.length,2);
 return {async release(){capacityReleased++},async uncertain(){throw Error('UNEXPECTED_UNCERTAIN')}};
}};
const service=createPlanningVisitCompositionService20({enabled:true,store,gate,projector,appendProjector,canonicalReader,capacityGate,
 preflight:async({operationId})=>({...structuredClone(proof),verifiedEmptyAppendRows:!wrong,gateOperationId:operationId})});
const body={auditId:'A-1',companyUid:'C-1',sourceRevision:rev,mode:'SEPARATELY'};
wrong=true;
await assert.rejects(()=>service.commit({actor,body}),/COMPOSITION_SERVICE_APPEND_ROWS_NOT_VERIFIED/);
assert.equal(writes,0);assert.equal(lock,null);
wrong=false;
const receipt=await service.commit({actor,body});
assert.equal(receipt.success,true);
assert.equal(receipt.mode,'SEPARATELY');
assert.deepEqual(receipt.visitAuditIds,['A-1',successorAuditId]);
assert.equal(writes,1);assert.equal(projections,1);assert.equal(appends,1);
assert.equal(capacityAcquisitions,1);assert.equal(capacityReleased,1);
assert.equal(uncertain,0);
assert.equal(lock,null);
console.log('VISIT_COMPOSITION_ATOMIC_SPLIT_20_PASS: complete Model C links, Firestore multi, outbox, verified projection; isolated');
