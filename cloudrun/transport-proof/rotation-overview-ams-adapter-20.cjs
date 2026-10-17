'use strict';
const {loadAmsRotationBundle20}=require('./rotation-ams-canonical-bundle-20.cjs');
const {buildRotationOverview20}=require('./rotation-overview-readmodel-20.cjs');
// Trusted server-side adapter: no client-supplied history or policy and no display-name identity resolution.
// Company scope applicability must be explicitly supplied by the canonical company/scope owner.
function buildAmsRotationOverview20({scopeRows,completedRows,resolveAuditorUid,auditors,companies,companyScopeKeys,upcomingByCompany,approvedExceptions}={}){
 if(!Array.isArray(auditors)||!Array.isArray(companies)||!companyScopeKeys||typeof companyScopeKeys!=='object'||!upcomingByCompany||typeof upcomingByCompany!=='object'||!Array.isArray(approvedExceptions))
  throw Error('ROTATION_AMS_OVERVIEW_SOURCES_MISSING');
 const {scopePolicies,completedAudits}=loadAmsRotationBundle20({scopeRows,completedRows,resolveAuditorUid});
 const byScope=new Map(scopePolicies.map(p=>[p.scopeKey,p]));
 const scopePoliciesByCompany=Object.create(null);
 for(const company of companies){
  if(!company||typeof company.uid!=='string'||!company.uid.trim())throw Error('ROTATION_AMS_OVERVIEW_COMPANY_UID_REQUIRED');
  if(!Object.prototype.hasOwnProperty.call(companyScopeKeys,company.uid))throw Error('ROTATION_AMS_OVERVIEW_COMPANY_SCOPES_MISSING');
  const keys=companyScopeKeys[company.uid];
  if(!Array.isArray(keys)||!keys.length||keys.some(k=>typeof k!=='string'||!k.trim())||new Set(keys).size!==keys.length)throw Error('ROTATION_AMS_OVERVIEW_COMPANY_SCOPES_INVALID');
  const policies=keys.map(k=>byScope.get(k));
  if(policies.some(p=>!p))throw Error('ROTATION_AMS_OVERVIEW_POLICY_NOT_FOUND');
  scopePoliciesByCompany[company.uid]=policies;
  if(!Object.prototype.hasOwnProperty.call(upcomingByCompany,company.uid))throw Error('ROTATION_AMS_OVERVIEW_UPCOMING_MISSING');
  const assignments=upcomingByCompany[company.uid];
  if(!Array.isArray(assignments))throw Error('ROTATION_AMS_OVERVIEW_UPCOMING_INVALID');
  if(assignments.some(a=>!a||!Array.isArray(a.scopeKeys)||a.scopeKeys.some(k=>!keys.includes(k))))throw Error('ROTATION_AMS_OVERVIEW_UPCOMING_SCOPE_NOT_APPLICABLE');
 }
 return buildRotationOverview20({auditors,companies,completedAudits,scopePoliciesByCompany,upcomingByCompany,approvedExceptions});
}
module.exports={buildAmsRotationOverview20};
