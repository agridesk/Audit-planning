/** FILE: PlanningWorkspaceRedesignClosureGateTests.gs
 * BUILD: 2026-09-19_WORKSPACE_REDESIGN_CLOSURE_GATE_R2_CONCEPT_STORE
 * RUN: RUN_WORKSPACE_REDESIGN_CLOSURE_GATE
 */
function RUN_WORKSPACE_REDESIGN_CLOSURE_GATE(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),d=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent(),svc=BatchPlanningConfirmation_validateCanonical_.toString(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('periodPrimary',h.indexOf('id="pwFrom"')>=0&&h.indexOf('id="pwTo"')>=0);
 t('workQueuePrimary',h.indexOf('Planning work queue')>=0&&h.indexOf('Batch selection')<0);
 t('priorityDefault',h.indexOf('<option value="priority">Planning priority</option>')>=0);
 t('allRequiredGroups', ['region','auditor','week','month','scope','company'].every(function(x){return h.indexOf('<option value="'+x+'">')>=0;}));
 t('canonicalPriorityBands',c.indexOf("return'Nu plannen'")>=0&&c.indexOf("return'Binnenkort plannen'")>=0&&c.indexOf("return'Later / nog geen druk'")>=0);
 t('selectionOrderPreserved',c.indexOf('state.selectionOrder.push(id)')>=0);
 t('generatedConceptReadOnlyFirst',c.indexOf('applyGeneratedConcept(res)')>=0&&c.indexOf('preview only')>=0);
 t('generatedConceptVisibleInGrid',c.indexOf('conceptStore:{generated:{},saved:{}}')>=0&&c.indexOf('visibleConcepts()')>=0);
 t('generatedPromotionExplicit',c.indexOf('function promoteGeneratedConcept')>=0&&d.indexOf("save.textContent='Save concept'")>=0);
 t('noGeneratedDirectPlan',d.indexOf("actions.appendChild(save);card.appendChild(actions);return")>=0);
 t('savedConceptBatchPreview',b.indexOf('Preview saved concepts')>=0&&b.indexOf('PlanningWorkspaceRpc_batchPreflight')>=0);
 t('explicitConfirmSecondStep',b.indexOf('Confirm plan selected')>=0&&b.indexOf('pendingPreview')>=0);
 t('selectionChangeInvalidatesPreview',b.indexOf('Selection or concept changed. Preview again.')>=0);
 t('noWorkspaceWeekendBypass',b.indexOf('allowWeekendOverride:true')<0);
 t('backendWeekendExplicitOnly',svc.indexOf('allowWeekend:req.allowWeekendOverride===true')>=0);
 t('batchMaxBounded',b.indexOf('rows.length>20')>=0);
 t('generatedSaveCanonicalPreflight',c.indexOf('.PlanningWorkspaceRpc_saveConcept({auditId:clean(g.auditId)')>=0);
 t('savedConceptRetainsExceptionTools',d.indexOf("detail.textContent='Details'")>=0&&d.indexOf("release.textContent='Release'")>=0&&d.indexOf("btn.textContent='Plan'")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-23_WORKSPACE_REDESIGN_CLOSURE_GATE_R2_CONCEPT_STORE',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Planning Workspace redesign closure: period-first queue, canonical planning priority, flexible grouping, generated read-only route preview, explicit canonical concept promotion, Preview then Confirm, and no implicit weekend bypass.'}};console.info(JSON.stringify(out,null,2));return out;
}