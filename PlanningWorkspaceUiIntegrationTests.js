/***********************************************************************
 * PlanningWorkspaceUiIntegrationTests.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_INTEGRATION_TESTS_R4_DATA_INDEPENDENT_SHELL
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_INTEGRATION_TEST_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_INTEGRATION_TESTS_R4_DATA_INDEPENDENT_SHELL';
function RUN_PLANNING_WORKSPACE_UI_INTEGRATION_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceUi_contract();
  t('rendererBuild',c.build===PLANNING_WORKSPACE_UI_RENDERER_BUILD,c.build);
  t('evaluatedTemplate',c.evaluatedTemplate===true);
  t('serverSeedRemoved',c.serverSeed===false);
  t('dataIndependentShell',c.dataIndependentShell===true);
  t('decisionDataDeferred',c.decisionDataDeferred===true);
  t('noPlanningServiceReadsDuringRender',c.planningServiceReadsDuringRender===false);
  t('noNewSsot',c.newSsot===false);
  t('noDirectSheetReads',c.directSheetReads===false);
  t('noDirectSheetWrites',c.directSheetWrites===false);
  t('rendererPresent',typeof PlanningWorkspaceUi_render==='function');
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_UI_INTEGRATION_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contractOnly:true,serverSeed:false,dataIndependentShell:true,decisionDataDeferred:true,nextStep:'Measure Shell Interactive separately from Planning Decision-Ready in DEV browser.'}};console.log(JSON.stringify(out,null,2));return out;
}
