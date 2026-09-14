/***********************************************************************
 * PlanningModifyWindowVerification.js
 * BUILD: 2026-09-14_MODIFY_WINDOW_VERIFICATION_R1
 *
 * Grouped non-destructive verification for the Modify planning-window fix.
 ***********************************************************************/
var PLANNING_MODIFY_WINDOW_VERIFICATION_BUILD='2026-09-14_MODIFY_WINDOW_VERIFICATION_R1';
function RUN_PLANNING_MODIFY_WINDOW_VERIFICATION(){
  var suites=[];
  function run(name,fn){try{var x=fn();suites.push({name:name,ok:!!(x&&x.ok),total:Number(x&&x.total||0),passed:Number(x&&x.passed||0),failed:Number(x&&x.failed||0),build:x&&x.build||'',result:x});}catch(e){suites.push({name:name,ok:false,total:0,passed:0,failed:1,build:'',error:String(e&&e.message||e)});}}
  run('canonicalModifyWindowLeading',RUN_PLANNING_CANONICAL_MODIFY_GRANDFATHER_REGRESSION);
  run('workspaceModifyWindowGuard',RUN_PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_REGRESSION);
  run('workspacePlannedAuditActions',RUN_PLANNING_WORKSPACE_PLANNED_AUDIT_ACTIONS_REGRESSION);
  var total=suites.reduce(function(a,s){return a+s.total;},0),passed=suites.reduce(function(a,s){return a+s.passed;},0),failed=suites.reduce(function(a,s){return a+s.failed;},0);if(suites.some(function(s){return!s.ok;})&&failed===0)failed=1;
  var out={ok:suites.every(function(s){return s.ok;}),build:PLANNING_MODIFY_WINDOW_VERIFICATION_BUILD,total:total,passed:passed,failed:failed,suites:suites,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Planning window is a hard canonical constraint for Modify and is surfaced in the Modify calendar UI.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
