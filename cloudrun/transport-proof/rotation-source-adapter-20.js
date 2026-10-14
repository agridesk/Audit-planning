'use strict';
const {consecutiveCompleted}=require('./rotation-history-20');
const {evaluateCombinedRotation}=require('./rotation-policy-20');
// Explicit canonical input contract. Never infer missing UID or scope from a display name.
function canonicalRotationContexts(input){
 const {companyUid,auditorUid,scopePolicies,completedAudits,approvedExceptions=[]}=input||{};
 if(!companyUid||!auditorUid||!Array.isArray(scopePolicies)||!scopePolicies.length||!Array.isArray(completedAudits)||!Array.isArray(approvedExceptions))throw Error('ROTATION_CANONICAL_SOURCE_MISSING');
 const seen=new Set();
 return scopePolicies.map(p=>{
  if(!p||!p.scopeKey||seen.has(p.scopeKey))throw Error('ROTATION_SCOPE_DUPLICATE_OR_MISSING');
  seen.add(p.scopeKey);
  if(!Number.isInteger(p.normalMaximum)||p.normalMaximum<1)throw Error('ROTATION_SCOPE_POLICY_INVALID');
  const hist=consecutiveCompleted(completedAudits,companyUid,p.scopeKey,auditorUid);
  const exceptions=approvedExceptions.filter(x=>x.companyUid===companyUid&&x.scopeKey===p.scopeKey&&x.auditorUid===auditorUid&&x.status==='APPROVED');
  if(exceptions.some(x=>!x.auditId||!x.justification||!x.approvedByManagerUid))throw Error('ROTATION_EXCEPTION_AUDIT_TRAIL_INCOMPLETE');
  const seriesExceptions=exceptions.filter(x=>hist.auditIds.includes(x.auditId));
  if(seriesExceptions.length>1)throw Error('ROTATION_MULTIPLE_PLUS_ONE_APPROVALS');
  return {scopeKey:p.scopeKey,consecutiveCompleted:hist.count,normalMaximum:p.normalMaximum,identityResolved:true,policyResolved:true,rotationApplies:true,extensionPermitted:true,extensionUsedInSeries:seriesExceptions.length>0,managerApproved:false,assignmentBound:false,justification:''};
 });
}
function rotationDecisionFromCanonical(input){const contexts=canonicalRotationContexts(input);return {contexts,decision:evaluateCombinedRotation(contexts)};}
module.exports={canonicalRotationContexts,rotationDecisionFromCanonical};
