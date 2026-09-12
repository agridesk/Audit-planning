/***********************************************************************
 * PlanningWorkspaceDragDropTests.js
 * BUILD: 2026-09-12_ROADMAP_2_4_WORKSPACE_DRAG_DROP_TESTS_R10_ASSERTIONS
 ***********************************************************************/
var PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD='2026-09-12_ROADMAP_2_4_WORKSPACE_DRAG_DROP_TESTS_R10_ASSERTIONS';
function RUN_PLANNING_WORKSPACE_DRAG_DROP_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var rpc=PlanningWorkspaceRpc_contract();
  var saveSource=String(PWR_saveConcept_);
  var hydrateSource=String(PWR_conceptInput_);
  var preflightSource=String(PWR_conceptPreflight_);
  var overlaySource=String(PlanningWorkspaceOverlayBundle_get)+'\n'+String(PWOB_availabilityIndex_);
  var dragSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  var detailSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDetailToolkit.js').getContent();
  var contextEnhancerSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceContextEnhancer.js').getContent();
  var attentionSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAttentionEnhancer.js').getContent();
  var clientSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  var shellSource=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();

  t('dragDropInclude',ui.dragDropInclude==='PlanningWorkspaceDragDrop.js',ui.dragDropInclude);
  t('detailToolkitInclude',ui.detailToolkitInclude==='PlanningWorkspaceDetailToolkit.js',ui.detailToolkitInclude);
  t('contextEnhancerInclude',ui.contextEnhancerInclude==='PlanningWorkspaceContextEnhancer.js',ui.contextEnhancerInclude);
  t('attentionEnhancerInclude',ui.attentionEnhancerInclude==='PlanningWorkspaceAttentionEnhancer.js',ui.attentionEnhancerInclude);
  t('dragDropClientOnly',ui.dragDropClientOnly===true);
  t('detailToolkitClientOnly',ui.detailToolkitClientOnly===true);
  t('contextEnhancerClientOnly',ui.contextEnhancerClientOnly===true);
  t('attentionEnhancerClientOnly',ui.attentionEnhancerClientOnly===true);
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

  t('availabilityInternalAuditRefProjected',overlaySource.indexOf('auditRef:id')>=0&&overlaySource.indexOf('PWOB_clean_(s&&s.auditId)')>=0);
  t('availabilityAuditIdNotUserField',overlaySource.indexOf('auditId:PWOB_clean_(s.auditId)')<0);
  t('availabilitySingleBatchRead',overlaySource.indexOf('availabilityBatchReads:1')>=0&&overlaySource.indexOf('perAuditorReads:0')>=0);
  t('contextUsesExistingClientState',contextEnhancerSource.indexOf('PlanningWorkspaceClient')>=0&&contextEnhancerSource.indexOf("typeof c.state==='function'")>=0);
  t('contextJoinsAuditRefToAdvisory',contextEnhancerSource.indexOf('map[clean(slot.auditRef)]')>=0&&contextEnhancerSource.indexOf('r.company')>=0&&contextEnhancerSource.indexOf('r.scopes')>=0);
  t('contextShowsTimeCompanyScopes',contextEnhancerSource.indexOf("clean(slot.start)")>=0&&contextEnhancerSource.indexOf("p.push(clean(r.company))")>=0&&contextEnhancerSource.indexOf("p.push(r.scopes.join(', '))")>=0);
  t('contextHumanizesWeekend',contextEnhancerSource.indexOf("return'Weekend'")>=0);
  t('contextFallbackPlannedAudit',contextEnhancerSource.indexOf("return'Planned audit'")>=0);
  t('contextNoUserVisibleAuditId',contextEnhancerSource.indexOf("p.push(clean(slot.auditRef))")<0&&contextEnhancerSource.indexOf("textContent=clean(slot.auditRef)")<0);
  t('contextNoExtraRpc',contextEnhancerSource.indexOf('google.script.run')<0);
  t('contextNoSheetRead',contextEnhancerSource.indexOf('SpreadsheetApp')<0&&contextEnhancerSource.indexOf('getRange(')<0&&contextEnhancerSource.indexOf('getDataRange(')<0);

  t('attentionUsesExistingClientState',attentionSource.indexOf('PlanningWorkspaceClient')>=0&&attentionSource.indexOf('PlanningWorkspaceClient.state')>=0);
  t('attentionLimit12',attentionSource.indexOf('ATTENTION_LIMIT=12')>=0&&attentionSource.indexOf('.slice(0,ATTENTION_LIMIT)')>=0);
  t('attentionPriorityDeadlineFirst',attentionSource.indexOf("if(ap.wt!==bp.wt)return ap.wt.localeCompare(bp.wt)")>=0);
  t('attentionNoExtraRpc',attentionSource.indexOf('google.script.run')<0);
  t('attentionNoSheetRead',attentionSource.indexOf('SpreadsheetApp')<0&&attentionSource.indexOf('getRange(')<0);

  t('conceptSaveLocalApply',dragSource.indexOf('localApplyReservation(saved)')>=0&&dragSource.indexOf('res.data.reservation')>=0);
  t('conceptSaveNoMandatoryBootstrapReload',dragSource.indexOf("if(!applied){var c=client();if(c&&typeof c.load==='function')c.load('load')}")>=0);
  t('conceptSaveWallTimeTelemetry',dragSource.indexOf('__AMS_WORKSPACE_LAST_CONCEPT_SAVE_MS')>=0);
  t('localApplyNoServerRead',String(dragSource.match(/function localApplyReservation[\s\S]*?function markDemand/)||'').indexOf('google.script.run')<0);

  t('noLegacyPlanningWriter',dragSource.indexOf('ManagerPlanning')<0&&saveSource.indexOf('ManagerPlanning')<0);
  t('noDirectSheetReads',rpc.meta.directSheetReads===false&&ui.directSheetReads===false&&saveSource.indexOf('SpreadsheetApp')<0&&detailSource.indexOf('SpreadsheetApp')<0);
  t('noDirectSheetWrites',rpc.meta.directSheetWrites===false&&ui.directSheetWrites===false&&saveSource.indexOf('setValue')<0&&saveSource.indexOf('setValues')<0&&detailSource.indexOf('setValue')<0&&detailSource.indexOf('setValues')<0);
  t('noNewSsot',rpc.meta.newSsot===false&&ui.newSsot===false);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contractOnly:true,targetFlow:'Workspace audit -> auditor x date -> canonical preflight -> Concept Reservation -> Individual Toolkit 2.0 -> direct canonical commit',availabilityContext:'existing Availability batch overlay -> internal auditRef -> already-loaded advisory company/scopes; no user-visible Audit ID; no extra RPC or Spreadsheet read',attention:'top 12 by planningWindowTo, planningWindowFrom, blocker state; client-only',conceptSaveUx:'server-confirmed concept applied locally; full Workspace reload only as fallback'}};
  console.log(JSON.stringify(out,null,2));return out;
}
