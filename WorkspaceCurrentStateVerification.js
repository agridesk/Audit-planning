/***********************************************************************
 * WorkspaceCurrentStateVerification.js
 * BUILD: 2026-09-12_WORKSPACE_CURRENT_STATE_VERIFY_R1
 * Read-only verification of the current Planning Workspace decision data.
 ***********************************************************************/
var WORKSPACE_CURRENT_STATE_VERIFY_BUILD='2026-09-12_WORKSPACE_CURRENT_STATE_VERIFY_R1';
function WCSV_clean_(v){return String(v==null?'':v).trim();}
function WCSV_norm_(v){return WCSV_clean_(v).toLowerCase();}
function RUN_WORKSPACE_CURRENT_STATE_VERIFICATION(){
  var from='2026-09-01',to='2026-12-31';
  var advisory=ConceptPlanningService_get({from:from,to:to,maxCandidates:20});
  var rows=advisory&&Array.isArray(advisory.rows)?advisory.rows:[];
  var emails={};
  rows.forEach(function(r){(r.candidateAuditors||[]).forEach(function(a){var e=WCSV_norm_(a&&a.email);if(e)emails[e]=1;});});
  var overlay=PlanningWorkspaceOverlayBundle_get({from:from,to:to,auditorEmails:Object.keys(emails)});
  var byAudit={};rows.forEach(function(r){var id=WCSV_clean_(r&&r.auditId);if(id)byAudit[id]=r;});
  var linked=0,unmatched=[],contextSamples=[];
  var av=overlay&&overlay.availability&&overlay.availability.byAuditorEmail||{};
  Object.keys(av).forEach(function(email){(av[email]||[]).forEach(function(day){(day.slots||[]).forEach(function(slot){var ref=WCSV_clean_(slot&&slot.auditRef);if(!ref)return;linked++;var r=byAudit[ref]||null;if(!r){unmatched.push({auditorEmail:email,date:day.date,auditRef:ref,status:WCSV_clean_(slot.status)});return;}if(contextSamples.length<12)contextSamples.push({auditorEmail:email,date:day.date,start:slot.start,end:slot.end,company:r.company,scopes:r.scopes});});});});
  var traceRows=rows.filter(function(r){return (r.scopes||[]).some(function(s){return WCSV_norm_(s).indexOf('tracecert')>=0;});});
  var traceLeenMissing=traceRows.filter(function(r){return !(r.candidateAuditors||[]).some(function(a){return WCSV_norm_(a&&a.email)==='leen@agriqa.es';});});
  var out={
    ok:(advisory&&advisory.totals&&Number(advisory.totals.refreshRequired||0)===0&&traceLeenMissing.length===0),
    build:WORKSPACE_CURRENT_STATE_VERIFY_BUILD,
    period:{from:from,to:to},
    advisoryTotals:advisory&&advisory.totals||{},
    tracecertAudits:traceRows.length,
    tracecertLeenMissing:traceLeenMissing.map(function(r){return{auditId:r.auditId,company:r.company,state:r.advisoryState,reason:r.advisoryReason};}),
    availabilityAuditRefs:linked,
    availabilityAuditRefsUnmatched:unmatched.length,
    unmatchedSamples:unmatched.slice(0,12),
    contextSamples:contextSamples,
    meta:{readOnly:true,writes:false,canonicalAdvisory:'ConceptPlanningService',canonicalAvailability:'AvailabilityPeriodReadModel via PlanningWorkspaceOverlayBundle',browserStillRequiredForVisualVerification:true}
  };
  console.log(JSON.stringify(out,null,2));return out;
}
