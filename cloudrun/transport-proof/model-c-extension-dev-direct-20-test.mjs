import assert from 'node:assert/strict';
import {inspectDevScopeExtension20 as inspect,planDevScopeExtension20 as plan} from './model-c-extension-dev-direct-20.mjs';
import {buildAtomicExtensionWriteset20} from './planning-atomic-extension-writeset-20.mjs';
const oh=['Obligation_ID','Company_UID','ScopeCode','Trigger_Source','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To','Extension_Applied','Extension_Metadata_JSON'];
const lh=['Audit_ID','Obligation_ID','Link_State'],ph=['Audit ID','Status','Extended Expiration Date','Extension applied','Planning window from','Planning window to'];
const sh=['ScopeCode','Extension','Planning from','Planning to'];
const obs=[oh,['O1','C1','MPS-GAP','CERTIFICATE','2027-01-31','2027-01-31','2026-10-01','2027-01-31','',''],['O2','C1','MPS-GAP','CERTIFICATE','2027-02-28','2027-02-28','2026-11-01','2027-02-28','',''],['O3','C1','MPS-ABC','CERTIFICATE','2027-03-31','2027-03-31','2026-12-01','2027-03-31','','']];
const links=[lh,['A1','O1','ACTIVE'],['A1','O2','ACTIVE'],['A1','O3','ACTIVE']];
const planning=[ph,['A1','Pending Planning','2027-01-31','','2026-12-01','2027-01-31']];
const scopes=[sh,['MPS-GAP',4,-4,-1],['MPS-ABC','',-12,-1]];
const inputs=()=>({obligationRows:obs,linkRows:links,planningRows:planning,scopeRows:scopes,companyUid:'C1'});
const initial=inspect(inputs());
assert.equal(initial.mode,'DEV_MODEL_C_DIRECT');
assert.equal(initial.records.length,3);
assert.equal(initial.records[0].canApply,true);
assert.equal(initial.records[2].canApply,false);
const applied=plan({snapshot:initial,auditId:'A1',companyUid:'C1',obligationId:'O1',command:'apply',requestId:'REQ1',actorUid:'M1'});
assert.equal(applied.updates.length,9);
assert.equal(applied.expected.effectiveExpiry,'2027-05-31');
assert.equal(applied.expected.aggregateExpiry,'2027-02-28');
assert.equal(applied.direct,true);
assert.equal(applied.projection,'PROJECTED');
const applyVals={Extension_Applied:'Yes',Extension_Metadata_JSON:applied.expected.extensionMetadata,Effective_Expiry_Date:'31/05/2027',Planning_Window_From:'31/01/2027',Planning_Window_To:'30/04/2027'};
for(const [k,v] of Object.entries(applyVals))obs[1][oh.indexOf(k)]=v;
const mid=inspect(inputs());
assert.equal(mid.records[0].canUndo,true);
const undone=plan({snapshot:mid,auditId:'A1',companyUid:'C1',obligationId:'O1',command:'undo',requestId:'REQ2',actorUid:'M1'});
assert.equal(undone.expected.effectiveExpiry,'2027-01-31');
assert.equal(undone.expected.extensionApplied,false);
assert.equal(undone.expected.extensionMetadata,'');
assert.throws(()=>plan({snapshot:initial,auditId:'A1',companyUid:'C1',obligationId:'O3',command:'apply',requestId:'REQ3',actorUid:'M1'}),/NOT_ELIGIBLE/);
assert.throws(()=>plan({snapshot:initial,auditId:'A1',companyUid:'OTHER',obligationId:'O1',command:'apply',requestId:'REQ3',actorUid:'M1'}),/NOT_ELIGIBLE/);
const oldSingleObs=[oh,['OLD1','C2','MPS-GAP','CERTIFICATE','2027-01-31','2027-05-31','2027-01-31','2027-04-30','Yes',JSON.stringify({source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',months:4,undo:false})]];
const oldSingle=inspect({obligationRows:oldSingleObs,linkRows:[lh,['OLD_A','OLD1','ACTIVE']],planningRows:[ph,['OLD_A','Pending Planning','2027-05-31','Yes','2027-01-31','2027-04-30']],scopeRows:scopes,companyUid:'C2'});
assert.equal(oldSingle.records[0].canUndo,true);
const oldUndo=plan({snapshot:oldSingle,auditId:'OLD_A',companyUid:'C2',obligationId:'OLD1',command:'undo',requestId:'OLD_REQ',actorUid:'M1'});
assert.equal(oldUndo.expected.effectiveExpiry,'2027-01-31');
assert.equal(oldUndo.expected.extensionApplied,false);
assert.equal(oldUndo.expected.extensionMetadata,'');
const legacyRevertedMeta=JSON.stringify({source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',months:4,undo:true,actorEmail:'manager@example.test'});
const revertedRows=[oh,['REVERTED1','C3','MPS-GAP','CERTIFICATE_LIFECYCLE','2027-01-31','2027-01-31','2026-09-30','2026-12-31','',legacyRevertedMeta]];
const revertedLinks=[lh,['REVERTED_A','REVERTED1','ACTIVE']];
const revertedPlanning=[ph,['REVERTED_A','Pending Planning','2027-01-31','','2026-09-30','2026-12-31']];
const revertedInput=()=>({obligationRows:revertedRows,linkRows:revertedLinks,planningRows:revertedPlanning,scopeRows:scopes,companyUid:'C3'});
const reverted=inspect(revertedInput());
assert.equal(reverted.records[0].canApply,true,'verified legacy undone flag does not permanently block EXT');
const reapplied=plan({snapshot:reverted,auditId:'REVERTED_A',companyUid:'C3',obligationId:'REVERTED1',command:'apply',requestId:'REAPPLY1',actorUid:'M1'});
const newMeta=JSON.parse(reapplied.expected.extensionMetadata);
assert.equal(newMeta.priorLegacyUndoMetadata,legacyRevertedMeta,'legacy source evidence retained in transaction');
assert.equal(newMeta.before.extensionMetadata,'','new Undo must restore a clean non-extended canonical state');
const rec=revertedRows[1];
for(const [k,v] of Object.entries({Extension_Applied:'Yes',Extension_Metadata_JSON:reapplied.expected.extensionMetadata,Effective_Expiry_Date:reapplied.expected.effectiveExpiry,Planning_Window_From:reapplied.expected.windowFrom,Planning_Window_To:reapplied.expected.windowTo}))rec[oh.indexOf(k)]=v;
const reapplyUndo=plan({snapshot:inspect(revertedInput()),auditId:'REVERTED_A',companyUid:'C3',obligationId:'REVERTED1',command:'undo',requestId:'REUNDO1',actorUid:'M1'});
assert.equal(reapplyUndo.expected.effectiveExpiry,'2027-01-31');
assert.equal(reapplyUndo.expected.extensionMetadata,'');
assert.equal(reapplyUndo.expected.windowFrom,'2026-09-30','legacy revert must normalize its planning-from baseline');
assert.equal(reapplyUndo.expected.windowTo,'2026-12-31','policy-matching legacy window remains unchanged');
assert.equal(newMeta.priorLegacyUndoWindow.from,'2026-09-30','original legacy window preserved for governance');
assert.equal(newMeta.priorLegacyUndoWindow.to,'2026-12-31','original historical window end preserved');
const driftLegacyMeta=JSON.stringify({source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',months:4,undo:true,actorEmail:'legacy.manager@example.test',timestamp:'2026-10-05 05:44:06'});
const driftRows=[oh,
 ['MOTHER','C5','MPS-GAP','CERTIFICATE_LIFECYCLE','2026-12-02','2027-04-02','2026-12-02','2027-03-02','Yes',JSON.stringify({source:'AMS_DEV_MODEL_C_SCOPE_EXTENSION_20',transactionId:'EXISTING_MOTHER',scopeCode:'MPS-GAP',months:4,before:{effectiveExpiry:'2026-12-02',windowFrom:'2026-08-02',windowTo:'2026-11-02',extensionApplied:false,extensionMetadata:''}})],
 ['CHILD','C5','GRASP','CERTIFICATE_LIFECYCLE','2026-12-02','2026-12-02','2026-08-02','2026-11-02','',driftLegacyMeta]
];
const driftScopeRows=[sh,['MPS-GAP',4,-4,-1],['GRASP',4,-4,-2]];
const driftLinks=[lh,['DRIFT_AUDIT','MOTHER','ACTIVE'],['DRIFT_AUDIT','CHILD','ACTIVE']];
const driftPlanning=[ph,['DRIFT_AUDIT','Pending Planning','2026-12-02','Yes','','']];
const driftInput=()=>({obligationRows:driftRows,linkRows:driftLinks,planningRows:driftPlanning,scopeRows:driftScopeRows,companyUid:'C5'});
const drift=inspect(driftInput());
assert.equal(drift.obligations.get('CHILD').canApply,true,'GRASP historical Undo with -4/-1 window may reapply under current -4/-2 policy');
assert.equal(drift.obligations.get('MOTHER').canUndo,true,'applied mother scope remains independently reversible');
const driftApply=plan({snapshot:drift,auditId:'DRIFT_AUDIT',companyUid:'C5',obligationId:'CHILD',command:'apply',requestId:'DRIFT_APPLY',actorUid:'M1'});
assert.equal(driftApply.expected.effectiveExpiry,'2027-04-02');
assert.equal(driftApply.expected.windowFrom,'2026-12-02');
assert.equal(driftApply.expected.windowTo,'2027-02-02','new EXT uses current scope planning policy');
assert.equal(driftApply.expected.aggregateExpiry,'2027-04-02','aggregate no longer controlled by unextended GRASP');
const driftMeta=JSON.parse(driftApply.expected.extensionMetadata);
assert.deepEqual(driftMeta.priorLegacyUndoWindow,{from:'2026-08-02',to:'2026-11-02'},'previous historic window retained explicitly');
assert.deepEqual({from:driftMeta.before.windowFrom,to:driftMeta.before.windowTo},{from:'2026-08-02',to:'2026-10-02'},'post-Undo baseline normalized to current policy');
for(const [key,value] of Object.entries({Extension_Applied:'Yes',Extension_Metadata_JSON:driftApply.expected.extensionMetadata,Effective_Expiry_Date:driftApply.expected.effectiveExpiry,Planning_Window_From:driftApply.expected.windowFrom,Planning_Window_To:driftApply.expected.windowTo}))driftRows[2][oh.indexOf(key)]=value;
const driftAfter=inspect(driftInput());
const driftUndo=plan({snapshot:driftAfter,auditId:'DRIFT_AUDIT',companyUid:'C5',obligationId:'CHILD',command:'undo',requestId:'DRIFT_UNDO',actorUid:'M1'});
assert.equal(driftUndo.expected.effectiveExpiry,'2026-12-02');
assert.equal(driftUndo.expected.windowFrom,'2026-08-02');
assert.equal(driftUndo.expected.windowTo,'2026-10-02','Undo must not reinstate outdated planning window');
assert.equal(driftUndo.expected.extensionMetadata,'','stale legacy Undo marker no longer blocks future application');
for(const [key,value] of Object.entries({Extension_Applied:'',Extension_Metadata_JSON:'',Effective_Expiry_Date:driftUndo.expected.effectiveExpiry,Planning_Window_From:driftUndo.expected.windowFrom,Planning_Window_To:driftUndo.expected.windowTo}))driftRows[2][oh.indexOf(key)]=value;
assert.equal(inspect(driftInput()).obligations.get('CHILD').canApply,true,'repeated apply must remain possible');
const changedMonthsMeta=JSON.stringify({source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',months:3,undo:true,actorEmail:'legacy.manager@example.test'});
const changedMonthsRows=[oh,['NEWPOL','C7','GRASP','CERTIFICATE_LIFECYCLE','2026-12-02','2026-12-02','2026-08-02','2026-11-02','',changedMonthsMeta]];
const changedMonthsInput={obligationRows:changedMonthsRows,linkRows:[lh,['CHANGED_AUDIT','NEWPOL','ACTIVE']],planningRows:[ph,['CHANGED_AUDIT','Pending Planning','2026-12-02','','2026-08-02','2026-11-02']],scopeRows:driftScopeRows,companyUid:'C7'};
const changedMonths=inspect(changedMonthsInput);
assert.equal(changedMonths.records[0].canApply,true,'historical EXT duration may differ from current governed scope policy after Undo');
const changedPlan=plan({snapshot:changedMonths,auditId:'CHANGED_AUDIT',companyUid:'C7',obligationId:'NEWPOL',command:'apply',requestId:'POLICY_NEW_MONTHS',actorUid:'M1'});
assert.equal(changedPlan.expected.effectiveExpiry,'2027-04-02','new Apply must use current policy months, not historical EXT duration');
const invalidDurationRows=[oh,['BAD_DURATION','C8','GRASP','CERTIFICATE_LIFECYCLE','2026-12-02','2026-12-02','2026-08-02','2026-11-02','',JSON.stringify({source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',months:99,undo:true})]];
assert.equal(inspect({obligationRows:invalidDurationRows,linkRows:[lh,['BAD_DUR_A','BAD_DURATION','ACTIVE']],planningRows:[ph,['BAD_DUR_A','Pending Planning','2026-12-02','','2026-08-02','2026-11-02']],scopeRows:driftScopeRows,companyUid:'C8'}).records[0].canApply,false,'unbounded legacy months must not grant EXT authorization');

const staleWindow=[oh,['BAD2','C6','GRASP','CERTIFICATE_LIFECYCLE','2026-12-02','2026-12-02','2026-07-15','2026-11-02','',driftLegacyMeta]];
assert.equal(inspect({obligationRows:staleWindow,linkRows:[lh,['BAD_A2','BAD2','ACTIVE']],planningRows:[ph,['BAD_A2','Pending Planning','2026-12-02','','2026-07-15','2026-11-02']],scopeRows:driftScopeRows,companyUid:'C6'}).records[0].canApply,false,'arbitrary historic dates are not accepted as policy-aligned Undo');

const incompatible=[oh,['BAD1','C4','MPS-GAP','CERTIFICATE_LIFECYCLE','2027-01-31','2027-01-31','2026-10-01','2027-01-31','',legacyRevertedMeta]];
const blocked=inspect({obligationRows:incompatible,linkRows:[lh,['BAD_A','BAD1','ACTIVE']],planningRows:[ph,['BAD_A','Pending Planning','2027-01-31','','2026-10-01','2027-01-31']],scopeRows:scopes,companyUid:'C4'});
assert.equal(blocked.records[0].canApply,false,'mismatched legacy provenance cannot bypass policy');

console.log('PASS DEV Model C direct per-obligation multi-scope Apply and Undo, readback dates, individual extension policy and aggregated expiry');

const pairHeaders=[...oh,'Cycle_Key','Obligation_State'];
const pairRows=[pairHeaders,
 ['G','C','MPS-GAP','CERTIFICATE','2027-01-31','2027-01-31','2026-09-30','2026-12-31','','','2027','OPEN'],
 ['R','C','GRASP','CERTIFICATE','2027-01-31','2027-01-31','2026-09-30','2026-11-30','','','2027','OPEN']];
const pairSource={obligationRows:pairRows,linkRows:[lh,['P','G','ACTIVE'],['P','R','ACTIVE']],
 planningRows:[ph,['P','Pending Planning','2027-01-31','','2026-09-30','2026-11-30']],
 scopeRows:driftScopeRows,companyUid:'C',
 sharedExpiryPairs:[{parentScopeCode:'MPS-GAP',childScopeCode:'GRASP',shareExpiry:true}]};
const pairCommand={auditId:'P',companyUid:'C',obligationId:'R',command:'apply',requestId:'TX',actorUid:'M1'};
const parentOnly={...pairSource,obligationRows:[pairHeaders,[...pairRows[1]]],
 linkRows:[lh,['P','G','ACTIVE']]};
const parentCommand={...pairCommand,obligationId:'G'};
const singleApply=plan({...parentCommand,snapshot:inspect(parentOnly)});
assert.deepEqual(singleApply.obligationChanges.map(x=>x.obligationId),['G'],'parent without an active child can be extended alone');
const singleValues=Array(16).fill('');
singleValues[0]='event-G';singleValues[3]='G';
const singleEvent={eventId:singleValues[0],values:singleValues};
const singleProof=buildAtomicExtensionWriteset20({plan:singleApply,source:parentOnly,cbEvent:singleEvent,revisionOf:()=> 'revision'});
assert.equal(singleProof.projectionWrites.length,9,'single EXT prepares only its obligation and audit projection');
assert.equal(singleProof.projectionPreconditions.length,9);
assert.deepEqual(singleProof.appendIntents[0].values,[singleValues],'single EXT prepares one notification intent, not a missing child');
const separateScope={...pairSource,obligationRows:[pairHeaders,[...pairRows[1]],
 ['S','C','MPS-SQ','CERTIFICATE','2027-01-31','2027-01-31','2026-09-30','2026-12-31','','','2027','OPEN']],
 linkRows:[lh,['P','G','ACTIVE'],['P','S','ACTIVE']],
 scopeRows:[...driftScopeRows,['MPS-SQ',4,-4,-1]]};
const separatePlan=plan({...parentCommand,snapshot:inspect(separateScope)});
assert.deepEqual(separatePlan.obligationChanges.map(x=>x.obligationId),['G'],'an unrelated scope does not make the absent child mandatory');
assert.equal(separatePlan.expected.aggregateExpiry,'2027-01-31','unchanged independent scope still controls aggregate expiry');
parentOnly.obligationRows[1].splice(5,5,singleApply.expected.effectiveExpiry,singleApply.expected.windowFrom,singleApply.expected.windowTo,'Yes',singleApply.expected.extensionMetadata);
const singleUndo=plan({...parentCommand,command:'undo',requestId:'SINGLE_UNDO',snapshot:inspect(parentOnly)});
assert.deepEqual(singleUndo.obligationChanges.map(x=>x.obligationId),['G']);
assert.equal(singleUndo.expected.effectiveExpiry,'2027-01-31');
const otherCycle={...pairSource,obligationRows:[pairHeaders,[...pairRows[1]],[...pairRows[2]]]};
otherCycle.obligationRows[2][pairHeaders.indexOf('Cycle_Key')]='2028';
assert.deepEqual(plan({...parentCommand,snapshot:inspect(otherCycle)}).obligationChanges.map(x=>x.obligationId),['G'],'child in another cycle does not force coupling');
const duplicateParent={...parentOnly,obligationRows:[pairHeaders,[...pairRows[1]],[...pairRows[1]]]};
duplicateParent.obligationRows[2][0]='G2';
assert.throws(()=>plan({...parentCommand,snapshot:inspect(duplicateParent)}),/SHARED_EXPIRY_GROUP_NOT_ELIGIBLE/,'duplicate active parent prevents independent mutation');
const childOnly={...pairSource,obligationRows:[pairHeaders,[...pairRows[2]]],
 linkRows:[lh,['P','R','ACTIVE']]};
assert.throws(()=>plan({...pairCommand,snapshot:inspect(childOnly)}),/SHARED_EXPIRY_GROUP_NOT_ELIGIBLE/,'child still requires its parent');
const missingCycle={...pairSource,obligationRows:[pairHeaders,[...pairRows[1]],[...pairRows[2]]]};
missingCycle.obligationRows[2][pairHeaders.indexOf('Cycle_Key')]='';
assert.throws(()=>plan({...parentCommand,snapshot:inspect(missingCycle)}),/SHARED_EXPIRY_CYCLE_REQUIRED/,'an unidentifiable active child cannot be ignored');
const otherVisit={...pairSource,linkRows:[lh,['P','G','ACTIVE'],['OTHER','R','ACTIVE']],
 planningRows:[ph,['P','Pending Planning','2027-01-31','','2026-09-30','2026-12-31'],['OTHER','Pending Planning','2027-01-31','','2026-09-30','2026-11-30']]};
assert.throws(()=>plan({...parentCommand,snapshot:inspect(otherVisit)}),/SHARED_EXPIRY_GROUP_NOT_ELIGIBLE/,'an active child on another visit cannot be ignored');
const unlinkedChild={...pairSource,linkRows:[lh,['P','G','ACTIVE']]};
assert.throws(()=>plan({...parentCommand,snapshot:inspect(unlinkedChild)}),/SHARED_EXPIRY_GROUP_NOT_ELIGIBLE/,'an unlinked active child cannot be ignored');
const paired=plan({...pairCommand,snapshot:inspect(pairSource)});
const pairedFromParent=plan({...parentCommand,snapshot:inspect(pairSource)});
const groupResult=({obligationId,scopeCode,expected,...result})=>result;
assert.deepEqual(groupResult(pairedFromParent),groupResult(paired),'both scope entrypoints must produce the same complete paired writes and provenance');
assert.equal(paired.updates.length,14);
assert.deepEqual(paired.obligationChanges.map(x=>x.expected.effectiveExpiry),['2027-05-31','2027-05-31']);
for(const {obligationId,expected} of paired.obligationChanges){
 const row=pairRows.find(r=>r[0]===obligationId);
 row.splice(5,5,expected.effectiveExpiry,expected.windowFrom,expected.windowTo,'Yes',expected.extensionMetadata);
}
const pairUndo=plan({...pairCommand,command:'undo',requestId:'UNDO',obligationId:'G',snapshot:inspect(pairSource)});
const pairUndoFromChild=plan({...pairCommand,command:'undo',requestId:'UNDO',snapshot:inspect(pairSource)});
assert.deepEqual(groupResult(pairUndoFromChild),groupResult(pairUndo),'Undo from either scope must restore both members using identical writes');
assert.deepEqual(pairUndo.obligationChanges.map(x=>x.expected.effectiveExpiry),['2027-01-31','2027-01-31']);
pairRows[2][9]=pairRows[2][9].replace('"transactionId":"TX"','"transactionId":"OTHER"');
assert.throws(()=>plan({...pairCommand,command:'undo',snapshot:inspect(pairSource)}),/SHARED_EXPIRY_PROVENANCE_CONFLICT/);
console.log('Shared expiry planner: paired Apply, paired Undo, and mismatched transaction rejection PASS');
const events=paired.obligationChanges.map(({obligationId})=>{
 const values=Array(16).fill('');
 values[0]='event-'+obligationId; values[3]=obligationId;
 return {values,eventId:values[0]};
});
const pairedProof=buildAtomicExtensionWriteset20({plan:paired,source:pairSource,cbEvents:events,cbEvent:events[0],revisionOf:()=> 'revision'});
assert.equal(pairedProof.projectionWrites.length,14);
assert.equal(pairedProof.projectionPreconditions.length,14);
assert.equal(pairedProof.appendIntents[0].values.length,2);
const parentProof=buildAtomicExtensionWriteset20({plan:pairedFromParent,source:pairSource,cbEvents:events,cbEvent:events[0],revisionOf:()=> 'revision'});
assert.deepEqual(parentProof.projectionWrites,pairedProof.projectionWrites);
assert.deepEqual(parentProof.projectionPreconditions,pairedProof.projectionPreconditions);
assert.deepEqual(parentProof.appendIntents,pairedProof.appendIntents,'single-parent fix must retain both paired notification intents');
assert.throws(()=>buildAtomicExtensionWriteset20({plan:paired,source:pairSource,cbEvents:[events[0],events[0]],cbEvent:events[0],revisionOf:()=> 'revision'}),/MEMBERSHIP_INVALID/);
console.log('Shared expiry writeset: both obligations and both event intents verified');

// Reconcile only the missing member after proving the prior member's CB event.
const cbHeaders=['Event_ID','Operation_ID','Audit_ID','Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','Action','State_After','Created_At','Status','Details_JSON'];
const recoveryHeaders=[...pairHeaders,'Certification_Body_ID'];
const recoverySource=()=>{
 const rows=[recoveryHeaders,
  ['G','C','MPS-GAP','CERTIFICATE','2027-01-31','2027-01-31','2026-09-30','2026-12-31','','','2027','OPEN','CB1'],
  ['R','C','GRASP','CERTIFICATE','2027-01-31','2027-01-31','2026-09-30','2026-11-30','','','2027','OPEN','CB1']];
 const source={...pairSource,obligationRows:rows,cbOutboxRows:[cbHeaders]};
 const normal=plan({...pairCommand,snapshot:inspect(source)});
 const first=normal.obligationChanges.find(x=>x.obligationId==='G').expected;
 rows[1].splice(5,5,first.effectiveExpiry,first.windowFrom,first.windowTo,'Yes',first.extensionMetadata);
 source.cbOutboxRows.push(['CB_EXT_TX','TX','P','G','C','MPS-GAP','CB1','APPLY','APPLIED','2026-11-18T10:00:00Z','BUFFERED',
  JSON.stringify({scopeCode:'MPS-GAP',certificationBodyId:'CB1',previousExpiry:'2027-01-31',effectiveExpiry:'2027-05-31'})]);
 return source;
};
const partial=recoverySource();
const repaired=plan({...pairCommand,requestId:'REPAIR',snapshot:inspect(partial)});
assert.deepEqual(repaired.obligationChanges.map(x=>x.obligationId),['R']);
assert.equal(JSON.parse(repaired.expected.extensionMetadata).transactionId,'TX');
assert.equal(repaired.expected.aggregateExpiry,'2027-05-31');
assert.deepEqual(repaired.patch.scopeChanges,[{scopeCode:'GRASP',extensionApplied:true}]);
const repairEvent=Array(16).fill('');repairEvent[0]='CB_EXT_REPAIR';repairEvent[3]='R';
const repairProof=buildAtomicExtensionWriteset20({plan:repaired,source:partial,cbEvent:{eventId:repairEvent[0],values:repairEvent},revisionOf:()=> 'revision'});
assert.equal(repairProof.projectionWrites.length,9);
assert.deepEqual(repairProof.appendIntents[0].values,[repairEvent]);
partial.obligationRows[2].splice(5,5,repaired.expected.effectiveExpiry,repaired.expected.windowFrom,repaired.expected.windowTo,'Yes',repaired.expected.extensionMetadata);
const fullUndo=plan({...pairCommand,command:'undo',obligationId:'G',requestId:'UNDO_REPAIRED',snapshot:inspect(partial)});
assert.deepEqual(fullUndo.obligationChanges.map(x=>x.obligationId),['G','R']);
const partialUndoSource=recoverySource();
const partialUndo=plan({...pairCommand,command:'undo',obligationId:'G',requestId:'UNDO_PARTIAL',snapshot:inspect(partialUndoSource)});
assert.deepEqual(partialUndo.obligationChanges.map(x=>x.obligationId),['G']);
assert.equal(partialUndo.expected.aggregateExpiry,'2027-01-31');
const missingEvidence=recoverySource();missingEvidence.cbOutboxRows.pop();
assert.throws(()=>plan({...pairCommand,snapshot:inspect(missingEvidence)}),/PARTIAL_CB_EVIDENCE_INVALID/);
const duplicateEvidence=recoverySource();duplicateEvidence.cbOutboxRows.push([...duplicateEvidence.cbOutboxRows[1]]);
assert.throws(()=>plan({...pairCommand,snapshot:inspect(duplicateEvidence)}),/PARTIAL_CB_EVIDENCE_INVALID/);
const changedEvidence=recoverySource();changedEvidence.cbOutboxRows[1][11]=JSON.stringify({scopeCode:'MPS-GAP',certificationBodyId:'CB1',previousExpiry:'2027-01-31',effectiveExpiry:'2027-06-30'});
assert.throws(()=>plan({...pairCommand,snapshot:inspect(changedEvidence)}),/PARTIAL_CB_EVIDENCE_INVALID/);
const newerEvidence=recoverySource();const newer=[...newerEvidence.cbOutboxRows[1]];newer[0]='CB_EXT_NEWER';newer[1]='NEWER';newer[9]='2026-11-18T10:01:00Z';newerEvidence.cbOutboxRows.push(newer);
assert.throws(()=>plan({...pairCommand,snapshot:inspect(newerEvidence)}),/PARTIAL_CB_EVIDENCE_INVALID/);
const conflictingBefore=recoverySource();
const conflictingMeta=JSON.parse(conflictingBefore.obligationRows[1][9]);conflictingMeta.months=3;
conflictingBefore.obligationRows[1][9]=JSON.stringify(conflictingMeta);
assert.throws(()=>plan({...pairCommand,snapshot:inspect(conflictingBefore)}),/PARTIAL_PROVENANCE_INVALID/);

// Required-together dependencies remain coupled even when expiry is not shared.
const nonShared=recoverySource();
nonShared.obligationRows[1].splice(5,5,'2027-01-31','2026-09-30','2026-12-31','','');
nonShared.obligationRows[2][4]='2027-02-28';nonShared.obligationRows[2][5]='2027-02-28';
nonShared.sharedExpiryPairs=[{parentScopeCode:'MPS-GAP',childScopeCode:'GRASP',shareExpiry:false}];
const nonSharedPlan=plan({...pairCommand,snapshot:inspect(nonShared)});
assert.deepEqual(nonSharedPlan.obligationChanges.map(x=>x.obligationId),['G','R']);
assert.deepEqual(nonSharedPlan.obligationChanges.map(x=>x.expected.effectiveExpiry),['2027-05-31','2027-06-28']);
assert.deepEqual(nonSharedPlan.patch.scopeChanges.map(x=>x.scopeCode),['MPS-GAP','GRASP']);
console.log('Partial dependency reconciliation: prior CB proof, one changed member, coupled undo and fail-closed guards passed');
