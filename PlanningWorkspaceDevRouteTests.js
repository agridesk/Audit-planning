/***********************************************************************
 * PlanningWorkspaceDevRouteTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_DEV_ROUTE_TESTS_R3
 ***********************************************************************/
var PLANNING_WORKSPACE_DEV_ROUTE_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_DEV_ROUTE_TESTS_R3';
function RUN_PLANNING_WORKSPACE_DEV_ROUTE_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceDevRoute_contract();
  t('contractPresent',!!c);t('build',String(c.build||'').indexOf('PLANNING_WORKSPACE_2_0_DEV_ROUTE_R2')>=0,c.build);
  t('devOnly',c.devOnly===true);t('entryOwnsAuth',c.authenticatedEntryOwner==='EntryV5');t('rendererOwner',c.renderer==='PlanningWorkspaceUi_render');t('noNewSsot',c.newSsot===false);
  t('runtimeDev',PlanningWorkspaceDevRoute_isEnabled()===true,'DEV route guard is not enabled in this runtime');
  var html='';try{html=PlanningWorkspaceDevRoute_render({email:'planning@agriqa.es',role:'Manager'});t('render',html.indexOf('PLANNING_WORKSPACE_2_0_HTML_SHELL_R2_CLIENT_BOUND')>=0,'client-bound shell marker missing');}catch(e){t('render',false,e.message);html='';}
  t('clientIncluded',html.indexOf('PLANNING_WORKSPACE_2_0_CLIENT_R2_SHELL_IDS')>=0,'client marker missing');
  t('bootstrapBound',html.indexOf('PlanningWorkspaceRpc_bootstrap')>=0,'bootstrap RPC missing');
  t('noSheetAccess',html.indexOf('SpreadsheetApp')<0,'direct Sheet access in route output');
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_DEV_ROUTE_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,devOnly:true,nextStep:'Wire planningworkspace action into authenticated EntryV5 routing; keep PROD hard-blocked.'}};console.log(JSON.stringify(out,null,2));return out;
}
