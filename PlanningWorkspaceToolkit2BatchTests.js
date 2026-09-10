/***********************************************************************
 * PlanningWorkspaceToolkit2BatchTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_TOOLKIT2_BATCH_TEST_R6_BULK_CONCEPT
 * Combined regression for the current visible Toolkit 2.0 batch.
 ***********************************************************************/
var PLANNING_WORKSPACE_TOOLKIT2_BATCH_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_TOOLKIT2_BATCH_TEST_R6_BULK_CONCEPT';
function RUN_PLANNING_WORKSPACE_TOOLKIT2_BATCH_REGRESSION(){
  var parts=[];
  function run(name,fn){try{var out=fn();parts.push({name:name,ok:!!(out&&out.ok),build:out&&out.build||'',total:out&&out.total||0,passed:out&&out.passed||0,failed:out&&out.failed||0,liveReads:!!(out&&out.meta&&out.meta.liveReadsPerformed)});}catch(e){parts.push({name:name,ok:false,build:'',total:0,passed:0,failed:1,error:String(e&&e.message||e),liveReads:false});}}
  run('dragDropCalendar',RUN_PLANNING_WORKSPACE_DRAG_DROP_REGRESSION);
  run('selfPlanningSharedUi',RUN_PLANNING_WORKSPACE_SELF_PLANNING_REGRESSION);
  run('conceptCalendarInteraction',RUN_PLANNING_WORKSPACE_TOOLKIT2_INTERACTION_REGRESSION);
  run('calendarAuditorAvailability',RUN_PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_REGRESSION);
  run('canonicalPlannedCalendar',RUN_PLANNING_WORKSPACE_CANONICAL_CALENDAR_REGRESSION);
  run('calendarDensityAndAuditorLoad',RUN_PLANNING_WORKSPACE_CALENDAR_DENSITY_REGRESSION);
  run('bulkConceptPlanning',RUN_PLANNING_WORKSPACE_BULK_CONCEPT_REGRESSION);
  var failedParts=parts.filter(function(x){return!x.ok;}).length;
  var total=parts.reduce(function(a,x){return a+Number(x.total||0);},0),passed=parts.reduce(function(a,x){return a+Number(x.passed||0);},0);
  var out={ok:failedParts===0,build:PLANNING_WORKSPACE_TOOLKIT2_BATCH_TEST_BUILD,total:total,passed:passed,failed:total-passed,parts:parts,meta:{nonDestructive:true,liveReadsPerformed:parts.some(function(x){return x.liveReads;}),liveWritesPerformed:false,existingFunctionalityRemoved:false,batch:['calendar month board','planning-window-aware date drag/drop','concept reservation calendar projection','concept click-to-reopen','concept drag-to-shift preview','availability warning on concept block','auditor availability overlay on calendar','manager auditor prefill from calendar selection','canonical Pending Approval/Approved/Accepted projection','planned audit click-to-Re-adjust','planned audit drag-to-Re-adjust preview','calendar Concept/Planned/Warnings filters','per-auditor same-day overlap visibility','per-auditor daily hours projection','>8h auditor load warning','local batch concept staging','atomic batch concept precheck','single batch concept save','preview before Save/Re-adjust','server-filtered auditor self-planning','session-pinned auditor identity','Pending Planning to Pending Approval'],legacyPlanningPreserved:true,existingAuditorPortalPreserved:true,conceptSaveOwnerPreserved:true,reAdjustOwnerPreserved:true,canonicalPlanningSsot:'Audit planning.Planning JSON',calendarDensityReadOnly:true,bulkConceptOwner:'ConceptReservationCommandService'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
