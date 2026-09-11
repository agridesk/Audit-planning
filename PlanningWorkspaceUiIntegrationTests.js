/***********************************************************************
 * PlanningWorkspaceUiIntegrationTests.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_INTEGRATION_TESTS_R2_SERVER_SEED
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_INTEGRATION_TEST_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_INTEGRATION_TESTS_R2_SERVER_SEED';
function RUN_PLANNING_WORKSPACE_UI_INTEGRATION_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceUi_contract();
  t('rendererBuild',c.build===PLANNING_WORKSPACE_UI_RENDERER_BUILD,c.build);
  t('evaluatedTemplate',c.evaluatedTemplate===true);
  t('serverSeedContract',c.serverSeed===true&&c.seedReadOnly===true);
  t('noNewSsot',c.newSsot===false);
  t('noDirectSheetReads',c.directSheetReads===false);
  t('noDirectSheetWrites',c.directSheetWrites===false);
  t('rendererPresent',typeof PlanningWorkspaceUi_render==='function');
  t('seedBuilderPresent',typeof PWUI_seed_==='function');
  t('periodBuilderPresent',typeof PWUI_defaultPeriod_==='function');
  t('candidateProjectionPresent',typeof PWUI_candidateEmails_==='function');
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_UI_INTEGRATION_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contractOnly:true,serverSeed:true,nextStep:'Validate DEV route render and factual navigation wall-clock.'}};console.log(JSON.stringify(out,null,2));return out;
}
