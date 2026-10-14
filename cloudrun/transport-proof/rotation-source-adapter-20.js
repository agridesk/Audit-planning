'use strict';
const {consecutiveCompleted}=require('./rotation-history-20');
const {evaluateCombinedRotation}=require('./rotation-policy-20');
// Explicit canonical input contract. Never infer missing UID or scope from a display name.
function canonicalRotationContexts(input){
 const {companyUid,auditorUid,scopePolicies,completedAudits,approvedExceptions=[],assignmentAuditId}=input||{};
 if(!companyUid||!auditorUid||!Array.isArray(scopePolicies)||!scopePolicies.length||!Array.isArray(completedAudits)||!Array.isArray(approvedExceptions))throw Error('ROTATION_CANONICAL_SOURCE_MISSING');
 const seen=new Set();
 return scopePolicies.map(p=>{
  if(!p||!p.scopeKey||seen.has(p.scopeKey))throw Error('ROTATION_SCOPE_DUPLICATE_OR_MISSING');
  seen.add(p.scopeKey);
  if(p.rotationApplies!==undefined&&typeof p.rotationApplies!=='boolean')throw Error('ROTATION_SCOPE_POLICY_INVALID');
  if((p.rotationApplies!==false&&(!Number.isInteger(p.normalMaximum)||p.normalMaximum<1))||typeof p.extensionPermitted!=='boolean')throw Error('ROTATION_SCOPE_POLICY_INVALID');
  const hist=consecutiveCompleted(completedAudits,companyUid,p.scopeKey,auditorUid);
  const exceptions=approvedExceptions.filter(x=>x.companyUid===companyUid&&x.scopeKey===p.scopeKey&&x.auditorUid===auditorUid&&x.status==='APPROVED');
  if(exceptions.some(x=>!x.auditId||!x.justification||!x.approvedByManagerUid))throw Error('ROTATION_EXCEPTION_AUDIT_TRAIL_INCOMPLETE');
  const seriesExceptions=exceptions.filter(x=>hist.auditIds.includes(x.auditId));
  if(seriesExceptions.length>1)throw Error('ROTATION_MULTIPLE_PLUS_ONE_APPROVALS');
  if(assignmentAuditId&&exceptions.filter(x=>x.auditId===assignmentAuditId).length>1)throw Error('ROTATION_DUPLICATE_ASSIGNMENT_APPROVAL');
  if(assignmentAuditId&&hist.auditIds.includes(assignmentAuditId))throw Error('ROTATION_ASSIGNMENT_AUDIT_ALREADY_COMPLETED');
  return {scopeKey:p.scopeKey,consecutiveCompleted:hist.count,normalMaximum:p.normalMaximum,identityResolved:true,policyResolved:true,rotationApplies:p.rotationApplies!==false,extensionPermitted:p.extensionPermitted,extensionUsedInSeries:seriesExceptions.length>0,managerApproved:!!assignmentAuditId&&seriesExceptions.length===0&&exceptions.some(x=>x.auditId===assignmentAuditId),assignmentBound:!!assignmentAuditId,justification:exceptions.find(x=>x.auditId===assignmentAuditId)?.justification||''};
 });
}
function rotationDecisionFromCanonical(input){const contexts=canonicalRotationContexts(input);return {contexts,decision:evaluateCombinedRotation(contexts)};}
module.exports={canonicalRotationContexts,rotationDecisionFromCanonical};
