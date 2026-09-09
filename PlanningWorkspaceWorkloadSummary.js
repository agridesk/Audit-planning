/***********************************************************************
 * PlanningWorkspaceWorkloadSummary.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_R1
 *
 * PURPOSE
 *   Visible planner summary for Planning Workspace.
 *   Shows per auditor the audits/hours that are already dedicated and the
 *   remaining preassigned workload still to be planned in the selected period.
 *
 * GOVERNANCE
 *   - Read-only projection over canonical PlanningDemandService.
 *   - No new SSoT, no planning/status/availability writes.
 *   - Existing Toolkit/Company Map/workload functionality is preserved.
 *   - Designed as a first UI slice that can later feed bulk/annual planning.
 ***********************************************************************/
var PLANNING_WORKSPACE_WORKLOAD_SUMMARY_BUILD='2026-09-09_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_R1';

function PWWS_clean_(v){return String(v==null?'':v).trim();}
function PWWS_key_(v){return PWWS_clean_(v).toLowerCase();}
function PWWS_round_(v){return Math.round((Number(v)||0)*100)/100;}

function PlanningWorkspaceWorkloadSummary_get(input){
  input=input||{};
  var demand=PlanningDemandService_get({
    from:input.from||input.start||input.periodFrom||'',
    to:input.to||input.end||input.periodTo||'',
    country:input.country||'',
    region:input.region||'',
    scope:input.scope||'',
    includeCompanyMeta:input.includeCompanyMeta!==false,
    limit:Math.max(1,Math.min(2000,Number(input.limit||2000)||2000))
  });
  var rows=(demand&&demand.rows)||[];
  var byAuditor={};
  var unassigned={auditorEmail:'',auditsToPlan:0,hoursToPlan:0,auditsDedicated:0,hoursDedicated:0,totalAudits:0,totalHours:0,auditIds:[]};

  function bucket_(email){
    email=PWWS_clean_(email);
    if(!email)return unassigned;
    var k=PWWS_key_(email);
    if(!byAuditor[k])byAuditor[k]={auditorEmail:email,auditsToPlan:0,hoursToPlan:0,auditsDedicated:0,hoursDedicated:0,totalAudits:0,totalHours:0,auditIds:[]};
    return byAuditor[k];
  }

  rows.forEach(function(r){
    r=r||{};
    var assigned=PWWS_clean_(r.assignedTo);
    var preassigned=PWWS_clean_(r.preassignedAuditor);
    var status=PWWS_key_(r.status).replace(/\s+/g,' ');
    var hours=Number(r.hoursToPlan)||0;
    var dedicated=Number(r.hoursDedicated)||0;
    var target=assigned||preassigned;
    var b=bucket_(target);
    b.totalAudits++;
    b.totalHours+=hours;
    b.auditIds.push(PWWS_clean_(r.auditId));

    if(status==='pending planning'){
      b.auditsToPlan++;
      b.hoursToPlan+=Math.max(0,hours-dedicated);
    }else{
      b.auditsDedicated++;
      b.hoursDedicated+=dedicated||hours;
    }
  });

  var auditors=Object.keys(byAuditor).map(function(k){return byAuditor[k];});
  auditors.forEach(function(b){
    b.hoursToPlan=PWWS_round_(b.hoursToPlan);
    b.hoursDedicated=PWWS_round_(b.hoursDedicated);
    b.totalHours=PWWS_round_(b.totalHours);
  });
  auditors.sort(function(a,b){
    if(b.hoursToPlan!==a.hoursToPlan)return b.hoursToPlan-a.hoursToPlan;
    return a.auditorEmail.localeCompare(b.auditorEmail);
  });
  unassigned.hoursToPlan=PWWS_round_(unassigned.hoursToPlan);
  unassigned.hoursDedicated=PWWS_round_(unassigned.hoursDedicated);
  unassigned.totalHours=PWWS_round_(unassigned.totalHours);

  return{
    success:true,
    build:PLANNING_WORKSPACE_WORKLOAD_SUMMARY_BUILD,
    period:demand.period,
    auditors:auditors,
    unassigned:unassigned,
    totals:demand.totals||{},
    meta:{source:'PlanningDemandService',readOnly:true,newSsot:false,existingFunctionalityPreserved:true,bulkPlanningReadyProjection:true}
  };
}

function PlanningWorkspaceWorkloadSummary_contract(){
  return{build:PLANNING_WORKSPACE_WORKLOAD_SUMMARY_BUILD,owner:'PlanningDemandService',readOnly:true,newSsot:false,existingFunctionalityPreserved:true,fields:['auditorEmail','auditsToPlan','hoursToPlan','auditsDedicated','hoursDedicated','totalAudits','totalHours']};
}
