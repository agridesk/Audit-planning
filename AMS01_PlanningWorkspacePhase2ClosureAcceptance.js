/***********************************************************************
 * AMS01_PlanningWorkspacePhase2ClosureAcceptance.js
 * BUILD: 2026-09-23_AMS01_2_WORKSPACE_PHASE2_CLOSURE_R1
 * Read-only consolidated closure gate for Planning 2.0 performance
 * baseline + browser architecture before moving into the fast read layer.
 ***********************************************************************/
var AMS01_PW_PHASE2_CLOSURE_BUILD='2026-09-23_AMS01_2_WORKSPACE_PHASE2_CLOSURE_R1';
function RUN_AMS01_2_WORKSPACE_PHASE2_CLOSURE_ACCEPTANCE(){
  var r=[];function t(n,x){r.push({name:n,ok:!!(x&&x.ok===true),build:x&&x.build||'',failed:x&&x.failed||0});}
  t('staticFastPath',RUN_AMS01_2_WORKSPACE_STATIC_FASTPATH_ACCEPTANCE());
  t('htmlShell',RUN_PLANNING_WORKSPACE_HTML_SHELL_REGRESSION());
  t('uiIntegration',RUN_PLANNING_WORKSPACE_UI_INTEGRATION_REGRESSION());
  t('rendererOwnership',RUN_WORKSPACE_RUNTIME_RENDERER_OWNERSHIP_REGRESSION());
  t('routeBoundaries',RUN_WORKSPACE_ROUTE_BOUNDARIES_REGRESSION());
  var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS01_PW_PHASE2_CLOSURE_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,nextStep:'Runtime shell/performance evidence, then AMS-01 fast read layer.'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
