/***********************************************************************
 * PlanningWorkspaceServerHotPathDiagnostic.js
 * BUILD: 2026-09-12_WORKSPACE_SERVER_HOTPATH_DIAGNOSTIC_R1
 *
 * Read-only diagnostic for the actual Workspace server path.
 * Measures the canonical components separately using the normal Sep-Dec
 * 2026 Workspace period. No writes, refreshes or lifecycle effects.
 ***********************************************************************/
var PLANNING_WORKSPACE_SERVER_HOTPATH_DIAGNOSTIC_BUILD='2026-09-12_WORKSPACE_SERVER_HOTPATH_DIAGNOSTIC_R1';

function PWSHD_ms_(fn){var t=Date.now(),value=fn();return{ms:Date.now()-t,value:value};}
function PWSHD_clean_(v){return String(v==null?'':v).trim();}
function PWSHD_candidateEmails_(advisory){var out=[],seen={},rows=advisory&&Array.isArray(advisory.rows)?advisory.rows:[];for(var i=0;i<rows.length;i++){var a=Array.isArray(rows[i]&&rows[i].candidateAuditors)?rows[i].candidateAuditors:[];for(var j=0;j<a.length;j++){var e=PWSHD_clean_(a[j]&&a[j].email).toLowerCase();if(e&&!seen[e]){seen[e]=1;out.push(e);}}}return out;}
function PWSHD_auditIds_(demand){var out=[],seen={},rows=demand&&Array.isArray(demand.rows)?demand.rows:[];for(var i=0;i<rows.length;i++){var id=PWSHD_clean_(rows[i]&&rows[i].auditId);if(id&&!seen[id]){seen[id]=1;out.push(id);}}return out;}

function RUN_PLANNING_WORKSPACE_SERVER_HOTPATH_DIAGNOSTIC(){
  var input={from:'2026-09-01',to:'2026-12-31'};
  var demand=PWSHD_ms_(function(){return PlanningDemandService_get({from:input.from,to:input.to,includeCompanyMeta:false});});
  var ids=PWSHD_auditIds_(demand.value);
  var eligibility=PWSHD_ms_(function(){return EligibilityBatchReadModel_get({auditIds:ids});});
  var advisory=PWSHD_ms_(function(){return ConceptPlanningService_get(input);});
  var emails=PWSHD_candidateEmails_(advisory.value);
  var availability=PWSHD_ms_(function(){return AvailabilityPeriodReadModel_get({from:input.from,to:input.to,auditorEmails:emails});});
  var context=PWSHD_ms_(function(){return PlanningWorkspaceAvailabilityContext_get(availability.value&&availability.value.rows?availability.value.rows:[]);});
  var reservations=PWSHD_ms_(function(){return ConceptReservationReadModel_get({from:input.from,to:input.to});});
  var overlays=PWSHD_ms_(function(){return PlanningWorkspaceOverlayBundle_get({from:input.from,to:input.to,auditorEmails:emails});});
  var bootstrap=PWSHD_ms_(function(){return PlanningWorkspaceRpc_bootstrap(input);});
  var out={
    ok:true,
    build:PLANNING_WORKSPACE_SERVER_HOTPATH_DIAGNOSTIC_BUILD,
    period:input,
    counts:{demandRows:demand.value&&demand.value.rows?demand.value.rows.length:0,auditIds:ids.length,candidateAuditors:emails.length,availabilityRows:availability.value&&availability.value.rows?availability.value.rows.length:0,contextRequested:context.value&&context.value.meta?context.value.meta.requested||0:0,reservations:reservations.value&&reservations.value.rows?reservations.value.rows.length:0},
    timingsMs:{planningDemand:demand.ms,eligibilityBatch:eligibility.ms,conceptPlanningFull:advisory.ms,availabilityBatch:availability.ms,availabilityContext:context.ms,reservationBatch:reservations.ms,overlayBundleFull:overlays.ms,bootstrapFull:bootstrap.ms},
    embedded:{planningDemand:demand.value&&demand.value.devPerformance||null,conceptPlanning:advisory.value&&advisory.value.devPerformance||null,overlayBundle:overlays.value&&overlays.value.devPerformance||null,bootstrapStage:bootstrap.value&&bootstrap.value.data&&bootstrap.value.data.meta&&bootstrap.value.data.meta.stageMs||null},
    meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,eligibilityRefresh:false,lifecycleWrites:false,purpose:'Measure actual Workspace server hot path before optimization'}
  };
  console.log(JSON.stringify(out,null,2));return out;
}
