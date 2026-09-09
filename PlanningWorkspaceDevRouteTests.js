/***********************************************************************
 * PlanningWorkspaceDevRouteTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_DEV_ROUTE_TESTS_R4
 ***********************************************************************/
var PLANNING_WORKSPACE_DEV_ROUTE_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_DEV_ROUTE_TESTS_R4';
function RUN_PLANNING_WORKSPACE_DEV_ROUTE_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceDevRoute_contract();
  t('contractPresent',!!c);t('build',String(c.build||'').indexOf('PLANNING_WORKSPACE_2_0_DEV_ROUTE_R2')>=0,c.build);
  t('devOnly',c.devOnly===true);t('entryOwnsAuth',c.authenticatedEntryOwner==='EntryV5');t('rendererOwner',c.renderer==='PlanningWorkspaceUi_render');t('noNewSsot',c.newSsot===false);
  t('runtimeDev',PlanningWorkspaceDevRoute_isEnabled()===true,'DEV route guard is not enabled in this runtime');
  var html='';try{html=PlanningWorkspaceDevRoute_render({email:'planning@agriqa.es',role:'Manager'});t('render',html.indexOf('PLANNING_WORKSPACE_2_0_HTML_SHELL_R4_SPLIT_FIRST_PAINT_PREFLIGHT')>=0,'R4 shell marker missing');}catch(e){t('render',false,e.message);html='';}
  t('clientIncluded',html.indexOf('PLANNING_WORKSPACE_2_0_CLIENT_R5_SPLIT_FIRST_PAINT_PREFLIGHT')>=0,'R5 client marker missing');
  t('advisoryBound',html.indexOf('PlanningWorkspaceRpc_loadAdvisory')>=0,'advisory RPC missing');
  t('overlayBound',html.indexOf('PlanningWorkspaceRpc_loadOverlays')>=0,'overlay RPC missing');
  t('preflightBound',html.indexOf('PlanningWorkspaceRpc_commitPreflight')>=0,'preflight RPC missing');
  t('canonicalCommitNotBrowserBound',html.indexOf('.PlanningWorkspaceRpc_commit(')<0,'canonical live commit browser-bound too early');
  t('noSheetAccess',html.indexOf('SpreadsheetApp')<0,'direct Sheet access in route output');
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_DEV_ROUTE_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,devOnly:true,splitFirstPaint:true,canonicalLiveWriteBrowserBound:false,nextStep:'Complete EntryV5 planningworkspace route and final consolidated DEV regression.'}};console.log(JSON.stringify(out,null,2));return out;
}
