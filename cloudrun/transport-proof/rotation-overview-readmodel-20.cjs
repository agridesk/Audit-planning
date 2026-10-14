'use strict';
const {canonicalRotationContexts}=require('./rotation-source-adapter-20.cjs');
const {preassignmentRotationDecision}=require('./rotation-preassignment-20.cjs');
// Read-only manager projection. Never changes assignments or audit history.
function buildRotationOverview20(input){
 const {auditors,companies,completedAudits,scopePoliciesByCompany,upcomingByCompany,approvedExceptions=[]}=input||{};
 if(!Array.isArray(auditors)||!Array.isArray(companies)||!Array.isArray(completedAudits)||!scopePoliciesByCompany||!upcomingByCompany)throw Error('ROTATION_OVERVIEW_INPUT_INCOMPLETE');
 const sections=[];
 for(const auditor of auditors){
  if(!auditor.uid||!auditor.name)throw Error('ROTATION_OVERVIEW_AUDITOR_UID_REQUIRED');
  const rows=[];
  for(const company of companies){
   if(!company.uid||!company.name)throw Error('ROTATION_OVERVIEW_COMPANY_UID_REQUIRED');
   const policies=scopePoliciesByCompany[company.uid]||[];
   for(const policy of policies){
    const contexts=canonicalRotationContexts({companyUid:company.uid,auditorUid:auditor.uid,scopePolicies:[policy],completedAudits,approvedExceptions});
    const next=(upcomingByCompany[company.uid]||[]).filter(a=>Array.isArray(a.scopeKeys)&&a.scopeKeys.includes(policy.scopeKey)&&a.auditorUid===auditor.uid);
    const decision=preassignmentRotationDecision(contexts,'PREASSIGN');
    rows.push({companyUid:company.uid,company:company.name,scopeKey:policy.scopeKey,performed:contexts[0].consecutiveCompleted,maximum:contexts[0].normalMaximum,status:decision.results[0].status,decision:decision.decision,upcoming:next.map(a=>({auditId:a.auditId,phase:a.phase,date:a.date||null}))});
   }
  }
  sections.push({auditorUid:auditor.uid,auditor:auditor.name,rows});
 }
 return {readOnly:true,groupedBy:'AUDITOR',sections};
}
module.exports={buildRotationOverview20};
