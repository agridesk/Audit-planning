'use strict';
const {loadAmsRotationBundle20}=require('./rotation-ams-canonical-bundle-20.cjs');
const {enforceRotationAtWrite20}=require('./rotation-write-gate-20.cjs');
// The caller MUST execute this function inside the existing canonical writer lock.
// loadSheets MUST read both sheets fresh while holding that same lock.
// A read-only preview or a client payload is not an authorization.
async function enforceAmsRotationAtWrite20({loadSheets,phase,companyUid,auditorUid,auditId,scopeKeys}={}){
 if(typeof loadSheets!=='function'||!companyUid||!auditorUid||!auditId||!Array.isArray(scopeKeys)||scopeKeys.length===0||scopeKeys.some(x=>typeof x!=='string'||!x.trim())||new Set(scopeKeys).size!==scopeKeys.length)throw Error('ROTATION_AMS_WRITE_CONTEXT_INVALID');
 return enforceRotationAtWrite20({phase,companyUid,auditorUid,auditId,loadCanonical:async()=>{
  const source=await loadSheets({companyUid,auditorUid,auditId});
  if(!source||!Array.isArray(source.scopeRows)||!Array.isArray(source.completedRows)||!Array.isArray(source.approvedExceptions))throw Error('ROTATION_AMS_SERVER_SOURCES_MISSING');
  if(source.assignmentAuditId!==auditId||source.assignmentCompanyUid!==companyUid||source.assignmentAuditorUid!==auditorUid)throw Error('ROTATION_AMS_ASSIGNMENT_IDENTITY_MISMATCH');
  if(!Array.isArray(source.assignmentScopeKeys)||source.assignmentScopeKeys.length===0||source.assignmentScopeKeys.some(x=>typeof x!=='string'||!x.trim())||new Set(source.assignmentScopeKeys).size!==source.assignmentScopeKeys.length)throw Error('ROTATION_AMS_ASSIGNMENT_SCOPES_UNRESOLVED');
  if(source.assignmentScopeKeys.length!==scopeKeys.length||source.assignmentScopeKeys.some(x=>!scopeKeys.includes(x)))throw Error('ROTATION_AMS_ASSIGNMENT_SCOPE_MISMATCH');
  if(source.resolveAuditorUid!=null&&typeof source.resolveAuditorUid!=='function')throw Error('ROTATION_AMS_AUDITOR_RESOLVER_INVALID');
  if(source.approvedExceptions.some(x=>!x||typeof x!=='object'))throw Error('ROTATION_AMS_APPROVAL_RECORD_INVALID');
  const {scopePolicies,completedAudits}=loadAmsRotationBundle20(source);
  const byScope=new Map(scopePolicies.map(p=>[p.scopeKey,p]));
  const selected=scopeKeys.map(key=>byScope.get(key));
  if(selected.some(p=>!p))throw Error('ROTATION_AMS_SCOPE_POLICY_NOT_FOUND');
  return {companyUid,auditorUid,scopePolicies:selected,completedAudits,approvedExceptions:source.approvedExceptions};
 }});
}
module.exports={enforceAmsRotationAtWrite20};
