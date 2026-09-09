/***********************************************************************
 * PlanningWorkspaceWorkloadSummary.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_R2_SCOPE_BREAKDOWN
 * Read-only planner workload projection; foundation for bulk/year planning.
 ***********************************************************************/
var PLANNING_WORKSPACE_WORKLOAD_SUMMARY_BUILD='2026-09-09_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_R2_SCOPE_BREAKDOWN';
function PWWS_clean_(v){return String(v==null?'':v).trim();}
function PWWS_key_(v){return PWWS_clean_(v).toLowerCase();}
function PWWS_round_(v){return Math.round((Number(v)||0)*100)/100;}
function PWWS_bucket_(email){return{auditorEmail:email||'',auditsToPlan:0,hoursToPlan:0,auditsDedicated:0,hoursDedicated:0,totalAudits:0,totalHours:0,auditIds:[],scopes:{}};}
function PWWS_scopeAdd_(bucket,scopes,hours,isToPlan){(scopes&&scopes.length?scopes:['Unspecified']).forEach(function(scope){scope=PWWS_clean_(scope)||'Unspecified';if(!bucket.scopes[scope])bucket.scopes[scope]={scope:scope,auditsToPlan:0,hoursToPlan:0,auditsDedicated:0,hoursDedicated:0,totalAudits:0,totalHours:0};var s=bucket.scopes[scope];s.totalAudits++;s.totalHours+=hours;if(isToPlan){s.auditsToPlan++;s.hoursToPlan+=hours;}else{s.auditsDedicated++;s.hoursDedicated+=hours;}});}
function PWWS_finalize_(b){b.hoursToPlan=PWWS_round_(b.hoursToPlan);b.hoursDedicated=PWWS_round_(b.hoursDedicated);b.totalHours=PWWS_round_(b.totalHours);b.scopeBreakdown=Object.keys(b.scopes).map(function(k){var s=b.scopes[k];s.hoursToPlan=PWWS_round_(s.hoursToPlan);s.hoursDedicated=PWWS_round_(s.hoursDedicated);s.totalHours=PWWS_round_(s.totalHours);return s;}).sort(function(a,b){if(b.hoursToPlan!==a.hoursToPlan)return b.hoursToPlan-a.hoursToPlan;return a.scope.localeCompare(b.scope);});delete b.scopes;return b;}
function PlanningWorkspaceWorkloadSummary_get(input){
  input=input||{};
  var demand=PlanningDemandService_get({from:input.from||input.start||input.periodFrom||'',to:input.to||input.end||input.periodTo||'',country:input.country||'',region:input.region||'',scope:input.scope||'',auditor:input.auditor||'',includeCompanyMeta:input.includeCompanyMeta!==false,limit:Math.max(1,Math.min(2000,Number(input.limit||2000)||2000))});
  var rows=(demand&&demand.rows)||[],byAuditor={},unassigned=PWWS_bucket_('');
  function bucket(email){email=PWWS_clean_(email);if(!email)return unassigned;var k=PWWS_key_(email);if(!byAuditor[k])byAuditor[k]=PWWS_bucket_(email);return byAuditor[k];}
  rows.forEach(function(r){r=r||{};var assigned=PWWS_clean_(r.assignedTo),preassigned=PWWS_clean_(r.preassignedAuditor),status=PWWS_key_(r.status).replace(/\s+/g,' '),hours=Number(r.hoursToPlan)||0,dedicated=Number(r.hoursDedicated)||0,b=bucket(assigned||preassigned),isToPlan=status==='pending planning',remaining=Math.max(0,hours-dedicated),scopeHours=isToPlan?remaining:(dedicated||hours);b.totalAudits++;b.totalHours+=hours;b.auditIds.push(PWWS_clean_(r.auditId));if(isToPlan){b.auditsToPlan++;b.hoursToPlan+=remaining;}else{b.auditsDedicated++;b.hoursDedicated+=dedicated||hours;}PWWS_scopeAdd_(b,r.scopes||[],scopeHours,isToPlan);});
  var auditors=Object.keys(byAuditor).map(function(k){return PWWS_finalize_(byAuditor[k]);});auditors.sort(function(a,b){if(b.hoursToPlan!==a.hoursToPlan)return b.hoursToPlan-a.hoursToPlan;return a.auditorEmail.localeCompare(b.auditorEmail);});PWWS_finalize_(unassigned);
  return{success:true,build:PLANNING_WORKSPACE_WORKLOAD_SUMMARY_BUILD,period:demand.period,auditors:auditors,unassigned:unassigned,totals:demand.totals||{},meta:{source:'PlanningDemandService',readOnly:true,newSsot:false,existingFunctionalityPreserved:true,bulkPlanningReadyProjection:true,scopeBreakdown:true}};
}
function PlanningWorkspaceWorkloadSummary_contract(){return{build:PLANNING_WORKSPACE_WORKLOAD_SUMMARY_BUILD,owner:'PlanningDemandService',readOnly:true,newSsot:false,existingFunctionalityPreserved:true,scopeBreakdown:true,fields:['auditorEmail','auditsToPlan','hoursToPlan','auditsDedicated','hoursDedicated','totalAudits','totalHours','scopeBreakdown']};}
