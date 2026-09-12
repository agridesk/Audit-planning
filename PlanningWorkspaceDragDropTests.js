/***********************************************************************
 * PlanningWorkspaceDragDropTests.js
 * BUILD: 2026-09-12_ROADMAP_2_4_WORKSPACE_DRAG_DROP_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD='2026-09-12_ROADMAP_2_4_WORKSPACE_DRAG_DROP_TESTS_R1';
function RUN_PLANNING_WORKSPACE_DRAG_DROP_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var rpc=PlanningWorkspaceRpc_contract();
  var rpcSource=String(PlanningWorkspaceRpc_saveConcept);
  var hydrateSource=String(PWR_conceptInput_);
  t('dragDropInclude',ui.dragDropInclude==='PlanningWorkspaceDragDrop.js',ui.dragDropInclude);
  t('dragDropClientOnly',ui.dragDropClientOnly===true);
  t('shellStillDataIndependent',ui.dataIndependentShell===true&&ui.planningServiceReadsDuringRender===false);
  t('saveConceptEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_saveConcept')>=0);
  t('revisionHydrationDeclared',rpc.meta.conceptDropRevisionHydration===true);
  t('saveConceptUsesHydrator',rpcSource.indexOf('PWR_conceptInput_')>=0);
  t('canonicalRevisionOwnerUsed',hydrateSource.indexOf('PlanningRevisionTokenService_get')>=0);
  t('noDirectSheetReads',rpc.meta.directSheetReads===false&&ui.directSheetReads===false);
  t('noDirectSheetWrites',rpc.meta.directSheetWrites===false&&ui.directSheetWrites===false);
  t('noNewSsot',rpc.meta.newSsot===false&&ui.newSsot===false);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contractOnly:true,targetFlow:'Workspace drag/drop -> Concept Reservation -> later canonical commit'}};
  console.log(JSON.stringify(out,null,2));return out;
}
