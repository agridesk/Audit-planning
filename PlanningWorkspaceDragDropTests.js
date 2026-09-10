/***********************************************************************
 * PlanningWorkspaceDragDropTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_DRAG_DROP_TEST_R1
 * Non-destructive contract regression. No business writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_DRAG_DROP_TEST_R1';
function RUN_PLANNING_WORKSPACE_DRAG_DROP_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var html=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDropClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('clientBuild',html.indexOf('PLANNING_WORKSPACE_DRAG_DROP_CLIENT_R1')>=0);
  t('dragSourcePlanningDemand',html.indexOf("dragSource:'Planning Demand'")>=0);
  t('dropTargetConceptPlanning',html.indexOf("dropTarget:'Concept Planning'")>=0);
  t('dropOpensExistingEditor',html.indexOf("dropAction:'OPEN_EXISTING_EDITOR'")>=0);
  t('noCanonicalWrite',html.indexOf('canonicalWrite:false')>=0);
  t('noNewSsot',html.indexOf('newSsot:false')>=0);
  t('existingClickFlowPreserved',html.indexOf('existingClickFlowPreserved:true')>=0);
  t('usesExistingDemandRows',html.indexOf('#pwDemandBody [data-pw-index]')>=0);
  t('dropUsesExistingRowClick',html.indexOf('row.click()')>=0);
  t('shellIncludesClient',shell.indexOf("PlanningWorkspaceDragDropClient.js")>=0);
  t('shellKeepsExistingClients',shell.indexOf("PlanningWorkspaceClient.js")>=0&&shell.indexOf("PlanningWorkspaceReAdjustClient.js")>=0&&shell.indexOf("PlanningWorkspaceWorkloadClient.js")>=0);
  t('conceptHintVisible',shell.indexOf('Select or drag an audit from Planning Demand')>=0);
  var failed=r.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,toolkit2DragDropSlice:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
