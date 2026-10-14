'use strict';
const {enforceAmsRotationAtWrite20}=require('./rotation-ams-write-integration-20.cjs');
const clean=x=>String(x??'').trim();
const norm=x=>clean(x).toLowerCase().replace(/[\s_-]/g,'');
function uniqueIndex(headers,name){
 const indices=headers.map(norm).flatMap((x,i)=>x===norm(name)?[i]:[]);
 if(indices.length!==1)throw Error('ROTATION_DIRECT_HEADER_UNRESOLVED:'+name);
 return indices[0];
}
function canonicalAssignment({auditId,auditorEmail,planningValues,auditorValues,scopeValues,logValues}={}){
 if(!auditId||!auditorEmail||![planningValues,auditorValues,scopeValues,logValues].every(x=>Array.isArray(x)&&Array.isArray(x[0])))throw Error('ROTATION_DIRECT_SOURCES_MISSING');
 const ah=planningValues[0],ai=uniqueIndex(ah,'Audit ID'),ci=uniqueIndex(ah,'Company_UID');
 const assignments=planningValues.slice(1).filter(r=>clean(r[ai])===auditId);
 if(assignments.length!==1)throw Error('ROTATION_DIRECT_ASSIGNMENT_NOT_UNIQUE');
 const row=assignments[0],companyUid=clean(row[ci]);
 if(!companyUid)throw Error('ROTATION_DIRECT_COMPANY_UID_MISSING');
 const uh=auditorValues[0],emailIdx=uniqueIndex(uh,'Email'),uidIdx=uniqueIndex(uh,'Auditor_UID');
 const matches=auditorValues.slice(1).filter(r=>clean(r[emailIdx]).toLowerCase()===auditorEmail.toLowerCase());
 if(matches.length!==1||!clean(matches[0][uidIdx]))throw Error('ROTATION_DIRECT_AUDITOR_UID_UNRESOLVED');
 const auditorUid=clean(matches[0][uidIdx]);
 const sh=scopeValues[0],slotIdx=uniqueIndex(sh,'SlotKey'),codeIdx=uniqueIndex(sh,'ScopeCode');
 const scopeKeys=[];
 for(const sr of scopeValues.slice(1)){
  const slot=clean(sr[slotIdx]);if(!/^SCOPE_0[1-8]$/.test(slot))continue;
  const col=uniqueIndex(ah,slot),scopeCode=clean(sr[codeIdx]);
  if(!scopeCode)throw Error('ROTATION_DIRECT_SCOPE_CODE_MISSING');
  const indicator=clean(row[col]).toLowerCase();
  if(['x','true','yes','1'].includes(indicator))scopeKeys.push(scopeCode);
  else if(!['','false','no','0'].includes(indicator))throw Error('ROTATION_DIRECT_SCOPE_INDICATOR_INVALID');
 }
 if(!scopeKeys.length||new Set(scopeKeys).size!==scopeKeys.length)throw Error('ROTATION_DIRECT_ASSIGNMENT_SCOPES_UNRESOLVED');
 return {auditId,companyUid,auditorUid,scopeKeys};
}
// Called ONLY inside the existing planning writer lock, using the same fresh
// server-side Sheets snapshot as the actual planning mutation.
async function enforceDirectPlanningRotation20({auditId,auditorEmail,planningValues,auditorValues,scopeValues,logValues,approvedExceptions}={}){
 if(!Array.isArray(approvedExceptions))throw Error('ROTATION_DIRECT_APPROVAL_SOURCE_MISSING');
 const assignment=canonicalAssignment({auditId,auditorEmail,planningValues,auditorValues,scopeValues,logValues});
 return enforceAmsRotationAtWrite20({...assignment,phase:'COMMIT',loadSheets:async()=>({
  scopeRows:scopeValues,completedRows:logValues,approvedExceptions,
  assignmentAuditId:assignment.auditId,assignmentCompanyUid:assignment.companyUid,
  assignmentAuditorUid:assignment.auditorUid,assignmentScopeKeys:assignment.scopeKeys
 })});
}
module.exports={canonicalAssignment,enforceDirectPlanningRotation20};
