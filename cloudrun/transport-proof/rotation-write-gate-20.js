'use strict';
const {canonicalRotationContexts}=require('./rotation-source-adapter-20');
const {preassignmentRotationDecision}=require('./rotation-preassignment-20');
// Canonical writers must call this inside their write lock with server-loaded data.
// Never accept client-provided completed history, policy or manager approval.
async function enforceRotationAtWrite20({loadCanonical,phase,companyUid,auditorUid,auditId}={}){
 if(typeof loadCanonical!=='function'||!companyUid||!auditorUid||!auditId)throw Error('ROTATION_WRITE_GATE_CONTEXT_MISSING');
 if(!['PREASSIGN','COMMIT'].includes(phase))throw Error('ROTATION_WRITE_GATE_PHASE_INVALID');
 const canonical=await loadCanonical({companyUid,auditorUid,auditId});
 if(!canonical||canonical.companyUid!==companyUid||canonical.auditorUid!==auditorUid)throw Error('ROTATION_WRITE_GATE_SOURCE_MISMATCH');
 const contexts=canonicalRotationContexts(canonical);
 const decision=preassignmentRotationDecision(contexts,phase);
 if(decision.decision==='BLOCK')throw Error('ROTATION_WRITE_BLOCKED:'+decision.results.map(r=>r.reason).filter(Boolean).join(','));
 return {decision:decision.decision,requiresManagerReview:decision.requiresManagerReview===true,results:decision.results};
}
module.exports={enforceRotationAtWrite20};
