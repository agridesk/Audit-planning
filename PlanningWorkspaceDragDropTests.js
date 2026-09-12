/***********************************************************************
 * PlanningWorkspaceDragDropTests.js
 * BUILD: 2026-09-12_ROADMAP_2_4_WORKSPACE_DRAG_DROP_TESTS_R5_REFRESH_SAFE
 ***********************************************************************/
var PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD='2026-09-12_ROADMAP_2_4_WORKSPACE_DRAG_DROP_TESTS_R5_REFRESH_SAFE';
function RUN_PLANNING_WORKSPACE_DRAG_DROP_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var rpc=PlanningWorkspaceRpc_contract();
  var saveSource=String(PWR_saveConcept_);
  var hydrateSource=String(PWR_conceptInput_);
  var preflightSource=String(PWR_conceptPreflight_);
  var dragSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  var detailSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDetailToolkit.js').getContent();
  var clientSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  var shellSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('dragDropInclude',ui.dragDropInclude==='PlanningWorkspaceDragDrop.js',ui.dragDropInclude);
  t('detailToolkitInclude',ui.detailToolkitInclude==='PlanningWorkspaceDetailToolkit.js',ui.detailToolkitInclude);
  t('dragDropClientOnly',ui.dragDropClientOnly===true);
  t('detailToolkitClientOnly',ui.detailToolkitClientOnly===true);
  t('shellStillDataIndependent',ui.dataIndependentShell===true&&ui.planningServiceReadsDuringRender===false);
  t('saveConceptEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_saveConcept')>=0);
  t('directCommitEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_commit')>=0);
  t('revisionHydrationDeclared',rpc.meta.conceptDropRevisionHydration===true);
  t('canonicalRevisionOwnerUsed',hydrateSource.indexOf('PlanningRevisionTokenService_get')>=0);
  t('canonicalPreflightDeclared',rpc.meta.conceptDropCanonicalPreflight===true);
  t('canonicalPreflightOwner',rpc.meta.conceptDropPreflightOwner==='PlanningCommitGateService_evaluate');
  t('canonicalConstraintSet',rpc.meta.conceptDropChecks.join('|')==='qualification|availability|planningWindow|rotation',rpc.meta.conceptDropChecks.join('|'));
  t('preflightUsesCanonicalGate',preflightSource.indexOf('PlanningCommitGateService_evaluate')>=0);
  t('blockedPreflightCannotSaveConcept',saveSource.indexOf('gate.canCommit!==true')>=0&&saveSource.indexOf('gate.canCommit!==true')<saveSource.indexOf('PlanningWorkspaceService_saveConcept'));
  t('auditorDateGridShell',shellSource.indexOf('auditor-date-grid')>=0&&shellSource.indexOf('auditor × date')>=0);
  t('dropTargetOwnsAuditorAndDate',dragSource.indexOf('data-auditor-email')>=0&&dragSource.indexOf('data-date')>=0);
  t('noSelectedAuditorDependency',dragSource.indexOf('selectedAuditor')<0);
  t('clientConstraintCues',dragSource.indexOf('candidate(row,email)')>=0&&dragSource.indexOf('availabilityNo(email,date)')>=0&&dragSource.indexOf('planningWindowFrom')>=0&&dragSource.indexOf('planningWindowTo')>=0);
  t('rotationWarningCue',dragSource.indexOf('rotationWarning===true')>=0);
  t('refreshRequiredNotHardBlocked',dragSource.indexOf('requiresCanonicalEligibility(row)')>=0&&dragSource.indexOf("if(!c&&!refresh)return{level:'BLOCK'")>=0);
  t('refreshRequiredCanonicalCheckCue',dragSource.indexOf("level:'CHECK'")>=0&&dragSource.indexOf('canonical qualification will be checked on drop')>=0);
  t('refreshRequiredStillUsesCanonicalPreflight',saveSource.indexOf('PWR_conceptPreflight_')>=0&&preflightSource.indexOf('PlanningCommitGateService_evaluate')>=0);
  t('validProposedTimeSlot',dragSource.indexOf('proposedSlot(hours)')>=0&&dragSource.indexOf('start:slot.start,end:slot.end')>=0&&dragSource.indexOf("start:'',end:''")<0);
  t('conceptBlocksRendered',clientSource.indexOf('Array.isArray(x.blocks)')>=0&&clientSource.indexOf('data-concept-audit')>=0);
  t('conceptActionBound',dragSource.indexOf('bindConceptActions')>=0&&dragSource.indexOf("btn.textContent='Plan'")>=0);
  t('detailActionBound',dragSource.indexOf("detail.textContent='Details'")>=0&&dragSource.indexOf('PlanningWorkspaceDetailToolkit.open')>=0);
  t('detailToolkitConceptOnly',detailSource.indexOf("note:'Planning Workspace Toolkit 2.0'")>=0&&detailSource.indexOf('PlanningWorkspaceRpc_saveConcept')>=0);
  t('detailToolkitCanonicalPlan',detailSource.indexOf('PlanningWorkspaceRpc_commit')>=0&&detailSource.indexOf('expectedRevision:clean(res.sourceRevision)')>=0);
  t('detailToolkitEditableFields',detailSource.indexOf('pwDetailAuditor')>=0&&detailSource.indexOf('pwDetailDate')>=0&&detailSource.indexOf('pwDetailStart')>=0&&detailSource.indexOf('pwDetailEnd')>=0);
  t('detailToolkitNoCanonicalBypass',detailSource.indexOf('SpreadsheetApp')<0&&detailSource.indexOf('ManagerPlanning')<0);
  t('directFinalizeUsesCanonicalRpc',dragSource.indexOf('PlanningWorkspaceRpc_commit')>=0&&dragSource.indexOf('expectedRevision:clean(r.sourceRevision)')>=0);
  t('directFinalizeUsesConceptBlocks',dragSource.indexOf('blocks:Array.isArray(r.blocks)?r.blocks:[]')>=0);
  t('noLegacyPlanningWriter',dragSource.indexOf('ManagerPlanning')<0&&saveSource.indexOf('ManagerPlanning')<0);
  t('noDirectSheetReads',rpc.meta.directSheetReads===false&&ui.directSheetReads===false&&saveSource.indexOf('SpreadsheetApp')<0&&detailSource.indexOf('SpreadsheetApp')<0);
  t('noDirectSheetWrites',rpc.meta.directSheetWrites===false&&ui.directSheetWrites===false&&saveSource.indexOf('setValue')<0&&saveSource.indexOf('setValues')<0&&detailSource.indexOf('setValue')<0&&detailSource.indexOf('setValues')<0);
  t('noNewSsot',rpc.meta.newSsot===false&&ui.newSsot===false);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contractOnly:true,targetFlow:'Workspace audit -> auditor x date -> canonical preflight -> Concept Reservation -> Individual Toolkit 2.0 -> direct canonical commit',refreshPolicy:'stale eligibility advisory does not hard-block client drop; canonical preflight decides'}};
  console.log(JSON.stringify(out,null,2));return out;
}
