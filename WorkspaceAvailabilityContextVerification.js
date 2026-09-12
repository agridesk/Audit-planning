/***********************************************************************
 * WorkspaceAvailabilityContextVerification.js
 * BUILD: 2026-09-12_WORKSPACE_AVAILABILITY_CONTEXT_VERIFY_R1
 * Read-only verification of planner context completeness + read shape.
 ***********************************************************************/
var WORKSPACE_AVAILABILITY_CONTEXT_VERIFY_BUILD='2026-09-12_WORKSPACE_AVAILABILITY_CONTEXT_VERIFY_R1';
function RUN_WORKSPACE_AVAILABILITY_CONTEXT_VERIFICATION(){
  var from='2026-09-01',to='2026-12-31';
  var emails=['david@agriqa.es','isalia@agriqa.es','leen@agriqa.es','paco@agriqa.es'];
  var out=PlanningWorkspaceOverlayBundle_get({from:from,to:to,auditorEmails:emails});
  var by=out&&out.availability&&out.availability.byAuditorEmail||{},plannedSlots=0,contextComplete=0,contextMissing=[];
  Object.keys(by).forEach(function(email){(by[email]||[]).forEach(function(day){(day.slots||[]).forEach(function(s){if(String(s.status||'').trim().toLowerCase()!=='manager planned')return;plannedSlots++;var ok=!!String(s.company||'').trim()&&Array.isArray(s.scopes)&&s.scopes.length>0;if(ok)contextComplete++;else if(contextMissing.length<20)contextMissing.push({auditorEmail:email,date:day.date,start:s.start,end:s.end,status:s.status,auditRef:s.auditRef||'',company:s.company||'',scopes:s.scopes||[]});});});});
  var result={ok:contextMissing.length===0,build:WORKSPACE_AVAILABILITY_CONTEXT_VERIFY_BUILD,period:{from:from,to:to},plannedSlots:plannedSlots,contextComplete:contextComplete,contextMissingCount:plannedSlots-contextComplete,contextMissingSamples:contextMissing,overlayMeta:out&&out.meta||{},devPerformance:out&&out.devPerformance||null,meta:{readOnly:true,writes:false,expectedReadShape:'1 Availability batch + 1 Audit planning context batch + 1 Concept Reservation batch; 0 per-audit reads'}};
  console.log(JSON.stringify(result,null,2));return result;
}
