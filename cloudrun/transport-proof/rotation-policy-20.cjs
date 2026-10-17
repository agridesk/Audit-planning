'use strict';
// Rotation 2.0: pure policy gate. This module does not read or mutate canonical data.
// All inputs must be resolved server-side from Config_Scopes, Auditor UID and Completed history.
function evaluateRotation(input) {
  const i=input||{}, count=i.consecutiveCompleted, max=i.normalMaximum;
  if(i.identityResolved!==true||i.policyResolved!==true)
    return {status:'CONFIG_ERROR',allowed:false,reason:'UNRESOLVED_CANONICAL_CONTEXT'};
  if(i.rotationApplies===false){
    if(i.normalMaximum!==null||i.extensionPermitted!==false)return {status:'CONFIG_ERROR',allowed:false,reason:'INCONSISTENT_NON_ROTATION_POLICY'};
    return {status:'NOT_APPLICABLE',allowed:true,reason:null};
  }
  if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(max)||max<1)
    return {status:'CONFIG_ERROR',allowed:false,reason:'INVALID_ROTATION_CONTEXT'};
  if(i.rotationApplies!==true)return {status:'CONFIG_ERROR',allowed:false,reason:'ROTATION_POLICY_UNDEFINED'};
  if(count<max)return {status:count===max-1?'LAST_AVAILABLE':'OK',allowed:true,reason:null};
  if(count>max)return {status:'CONFLICT',allowed:false,reason:'ROTATION_LIMIT_EXCEEDED'};
  if(i.extensionPermitted!==true)return {status:'LIMIT_REACHED',allowed:false,reason:'ROTATION_LIMIT_REACHED'};
  if(i.extensionUsedInSeries===true)return {status:'CONFLICT',allowed:false,reason:'ROTATION_PLUS_ONE_ALREADY_USED'};
  if(i.extensionUsedInSeries!==false)return {status:'CONFIG_ERROR',allowed:false,reason:'EXTENSION_HISTORY_UNKNOWN'};
  if(i.managerApproved===true&&typeof i.justification==='string'&&i.justification.trim()&&i.assignmentBound===true)
    return {status:'PLUS_ONE_APPROVED',allowed:true,reason:null,requiresAuditTrail:true};
  return {status:'PLUS_ONE_POSSIBLE',allowed:false,reason:'MANAGER_APPROVAL_AND_JUSTIFICATION_REQUIRED'};
}
function evaluateCombinedRotation(contexts){
  if(!Array.isArray(contexts)||contexts.length===0)return {allowed:false,status:'CONFIG_ERROR',results:[]};
  const results=contexts.map(evaluateRotation);
  return {allowed:results.every(r=>r.allowed),status:results.every(r=>r.allowed)?'OK':'CONFLICT',results};
}
module.exports={evaluateRotation,evaluateCombinedRotation};
