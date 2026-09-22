/** FILE: BatchPlanningManagerUiContractTests.gs
 * BUILD: 2026-09-22_BATCH_PLANNING_MANAGER_UI_CONTRACT_TESTS_R2_STRUCTURE
 * RUN: RUN_BATCH_PLANNING_MANAGER_UI_CONTRACT_REGRESSION
 */
function RUN_BATCH_PLANNING_MANAGER_UI_CONTRACT_REGRESSION(){
  var r=[];
  function t(n,ok,d){r.push({name:n,ok:!!ok,detail:ok?'':String(d||'')});}
  var src=HtmlService.createHtmlOutputFromFile('ManagerV5ToolsUI').getContent();
  var modalStart=src.indexOf('id="m5tPlanningModal"');
  var batchStart=src.indexOf('id="m5tBatchPlanningPanel"');
  var scriptStart=src.indexOf('<script>',batchStart);
  t('planningModalPresent',modalStart>=0);
  t('panelPresent',batchStart>=0);
  t('batchNestedBeforePlanningScript',modalStart>=0&&batchStart>modalStart&&scriptStart>batchStart,'Batch Planning must be markup inside Planning Overview before its client script.');
  t('auditorControl',src.indexOf('id="m5tBatchAuditor"')>=0);
  t('periodControls',src.indexOf('id="m5tBatchFrom"')>=0&&src.indexOf('id="m5tBatchTo"')>=0);
  t('generateAction',src.indexOf('m5t_generateBatchPlanning')>=0);
  t('managerApiCanonical',src.indexOf('.getBatchPlanningConceptV5(')>=0);
  t('validateAction',src.indexOf('previewBatchPlanningConfirmationV5')>=0);
  t('atomicConfirmAction',src.indexOf('confirmBatchPlanningV5')>=0);
  t('noLegacyPlanningWriteRpc',src.indexOf('.planAuditV5_(')<0&&src.indexOf('.saveManagerPlanning(')<0);
  t('candidateSummary',src.indexOf('candidateCount')>=0&&src.indexOf('routedCandidateCount')>=0);
  t('plannerAttention',src.indexOf('pendingPlannerAllocationCount')>=0);
  t('unresolvedVisible',src.indexOf('unresolved')>=0);
  t('dayCards',src.indexOf('conceptAudits')>=0);
  t('noDuplicateBatchPanel',src.indexOf('id="m5tBatchPlanningPanel"')===src.lastIndexOf('id="m5tBatchPlanningPanel"'));
  var passed=r.filter(function(x){return x.ok;}).length;
  var out={ok:passed===r.length,build:'2026-09-22_BATCH_PLANNING_MANAGER_UI_CONTRACT_TESTS_R2_STRUCTURE',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Batch Planning is structurally contained inside Manager Planning Overview and uses the canonical preview plus atomic confirmation APIs.'}};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
