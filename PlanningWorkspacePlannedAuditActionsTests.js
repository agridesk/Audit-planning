/***********************************************************************
 * PlanningWorkspacePlannedAuditActionsTests.js
 * BUILD: 2026-09-13_WORKSPACE_PLANNED_AUDIT_ACTIONS_TESTS_R2_AVAILABILITY_CONTEXT
 ***********************************************************************/
var PLANNING_WORKSPACE_PLANNED_AUDIT_ACTIONS_TEST_BUILD='2026-09-13_WORKSPACE_PLANNED_AUDIT_ACTIONS_TESTS_R2_AVAILABILITY_CONTEXT';
function RUN_PLANNING_WORKSPACE_PLANNED_AUDIT_ACTIONS_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract(),rpc=PlanningWorkspaceRpc_contract(),svc=PlanningWorkspaceService_contract();
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedAuditActions.js').getContent();
  var readSrc=String(PlanningWorkspacePlannedAuditReadService_get);
  t('plannedActionsIncluded',ui.plannedActionsInclude==='PlanningWorkspacePlannedAuditActions.js',ui.plannedActionsInclude);
  t('clientOnly',ui.plannedActionsClientOnly===true);
  t('noBootstrapReadCost',ui.plannedDetailOnDemand===true&&rpc.meta.plannedDetailOnDemand===true);
  t('detailRpcPresent',rpc.endpoints.indexOf('PlanningWorkspaceRpc_getPlannedAudit')>=0);
  t('modifyRpcPresent',rpc.endpoints.indexOf('PlanningWorkspaceRpc_modifyPlanned')>=0);
  t('cancelRpcPresent',rpc.endpoints.indexOf('PlanningWorkspaceRpc_cancelPlanned')>=0);
  t('detailServiceOwner',svc.endpoints.plannedDetail==='PlanningWorkspacePlannedAuditReadService_get',svc.endpoints.plannedDetail);
  t('detailUsesRevisionOwner',readSrc.indexOf('PlanningRevisionTokenService_get')>=0);
  t('detailReadOnly',readSrc.indexOf('writes:false')>=0&&readSrc.indexOf('readOnly:true')>=0);
  t('plannedCardsUseExistingOverlay',src.indexOf('o.availability&&o.availability.byAuditorEmail')>=0&&src.indexOf('slot.auditRef')>=0);
  t('plannedCardsNoExtraListRpc',String(src.match(/function enhance\(\)[\s\S]*?function schedule/)||'').indexOf('google.script.run')<0);
  t('modifyAction',src.indexOf("button('Modify'")>=0&&src.indexOf('openModify(id)')>=0);
  t('cancelAction',src.indexOf("button('Cancel'")>=0&&src.indexOf('openCancel(id)')>=0);
  t('acceptedModifyDisabled',src.indexOf("status==='ACCEPTED'")>=0&&src.indexOf('re-acceptance policy')>=0);
  t('modifySameAuditorNoSelector',src.indexOf('Date/time only in R1')>=0&&src.indexOf('auditorEmail:detail.auditorEmail')>=0);
  t('modifyEditableBlocks',src.indexOf("field('Date','date'")>=0&&src.indexOf("field('Start','time'")>=0&&src.indexOf("field('End','time'")>=0);
  t('modifyCanAddRemoveBlocks',src.indexOf("button('Add block'")>=0&&src.indexOf("button('Remove'")>=0);
  t('modifyUsesRevision',src.indexOf('expectedRevision:detail.revision')>=0);
  t('cancelReasonRequiredClient',src.indexOf('A cancel reason is required.')>=0);
  t('cancelUsesRevision',src.indexOf('expectedRevision:detail.revision')>=0&&src.indexOf('reason:why')>=0);
  t('cancelExplainsPendingPlanning',src.indexOf('returns the audit to Pending Planning')>=0);
  t('refreshAfterModifyCancel',src.indexOf("c.load('load')")>=0);
  t('modifyUsesLoadedAvailability',src.indexOf('function occupiedSlots(')>=0&&src.indexOf('records(email,date)')>=0);
  t('knownOverlapDetectedClientSide',src.indexOf('function firstKnownConflict(')>=0&&src.indexOf('function overlaps(')>=0);
  t('secondAuditNonOverlapExplained',src.indexOf('A second audit is allowed when times do not overlap.')>=0);
  t('knownOverlapBlocksSaveBeforeRpc',src.indexOf("toast('Blocked: selected time overlaps '")>=0);
  t('finalCanonicalValidationRetained',src.indexOf('Final canonical validation still runs on Save.')>=0);
  t('availabilityContextNoExtraRpc',String(src.match(/function renderAvailabilityContext\([\s\S]*?function openModify/)||'').indexOf('google.script.run')<0);
  t('noDirectSheetAccess',src.indexOf('SpreadsheetApp')<0&&readSrc.indexOf('setValue(')<0&&readSrc.indexOf('setValues(')<0);
  t('noNewSsot',readSrc.indexOf('newSsot:false')>=0&&rpc.meta.newSsot===false&&svc.meta.newSsot===false);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_PLANNED_AUDIT_ACTIONS_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,liveReadsPerformed:false,liveWritesPerformed:false,ux:'Modify uses the already-loaded Workspace Availability overlay to show occupied slots immediately and block known overlaps without another RPC.',modify:'Same auditor; editable date/time blocks; second audit on same day allowed when non-overlapping; final canonical validation remains authoritative.',cancel:'Browser-proven: reason required; canonical StatusMachine CANCEL; audit returns to Pending Planning.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
