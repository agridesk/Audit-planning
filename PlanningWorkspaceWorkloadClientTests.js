/***********************************************************************
 * PlanningWorkspaceWorkloadClientTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_WORKLOAD_CLIENT_TEST_R1_EMAIL_VARIANT
 ***********************************************************************/
var PLANNING_WORKSPACE_WORKLOAD_CLIENT_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_WORKLOAD_CLIENT_TEST_R1_EMAIL_VARIANT';
function RUN_PLANNING_WORKSPACE_WORKLOAD_CLIENT_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceWorkloadClient.js').getContent();
  t('clientBuildR4',src.indexOf('WORKLOAD_CLIENT_R4_EMAIL_VARIANT_WARNING')>=0);
  t('variantDetection',src.indexOf('function variantMap')>=0&&src.indexOf('localPart')>=0);
  t('warningVisible',src.indexOf('CHECK EMAIL')>=0&&src.indexOf('pw-workload-data-warning')>=0);
  t('sameLocalPartDifferentDomains',src.indexOf('mails.length>1')>=0);
  t('noAutoCorrection',src.indexOf('noAutoCorrection:true')>=0);
  t('readOnlyContract',src.indexOf('readOnly:true')>=0);
  t('existingWorkloadRpcPreserved',src.indexOf('PlanningWorkspaceRpc_loadWorkloadSummary')>=0);
  t('plannerFocusMetadataPreserved',src.indexOf('plannerFocusMetadata:true')>=0&&src.indexOf('data-pw-workload-auditor')>=0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  t('noCanonicalWrite',src.indexOf('PlanningCanonicalCommitService')<0&&src.indexOf('AvailabilityService')<0);
  var f=r.filter(function(x){return!x.ok;}).length,out={ok:f===0,build:PLANNING_WORKSPACE_WORKLOAD_CLIENT_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,emailVariantWarning:true,noAutoCorrection:true,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
