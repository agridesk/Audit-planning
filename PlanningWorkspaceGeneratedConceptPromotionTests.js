/** FILE: PlanningWorkspaceGeneratedConceptPromotionTests.gs
 * BUILD: 2026-09-19_WORKSPACE_GENERATED_CONCEPT_PROMOTION_R1
 * RUN: RUN_WORKSPACE_GENERATED_CONCEPT_PROMOTION_REGRESSION
 */
function RUN_WORKSPACE_GENERATED_CONCEPT_PROMOTION_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),d=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('generatedLookupExists',c.indexOf('function generatedConceptById(id)')>=0);
 t('promotionUsesCanonicalConceptRpc',c.indexOf('function promoteGeneratedConcept')>=0&&c.indexOf('.PlanningWorkspaceRpc_saveConcept({auditId:clean(g.auditId)')>=0);
 t('promotionCarriesGeneratedAuditor',c.indexOf("auditorEmail:clean(g.auditorEmail).toLowerCase()")>=0);
 t('promotionCarriesGeneratedBlocks',c.indexOf('blocks:Array.isArray(g.blocks)?g.blocks:[]')>=0);
 t('promotionDoesNotPlan',c.substring(c.indexOf('function promoteGeneratedConcept'),c.indexOf('function generateSelectedConcept')).indexOf('PlanningWorkspaceRpc_commit')<0);
 t('generatedPreviewHasSaveConceptAction',d.indexOf("save.textContent='Save concept'")>=0);
 t('generatedPreviewHasNoDirectPlanAction',d.indexOf("if(generated){")>=0&&d.indexOf("actions.appendChild(save);card.appendChild(actions);return")>=0);
 t('savedConceptRetainsDetailsReleasePlan',d.indexOf("detail.textContent='Details'")>=0&&d.indexOf("release.textContent='Release'")>=0&&d.indexOf("btn.textContent='Plan'")>=0);
 t('successfulPromotionRemovesGeneratedDuplicate',c.indexOf('o.generatedConceptReservations=a.filter')>=0);
 t('successfulPromotionAppliesSavedReservation',c.indexOf("d.localApplyReservation(saved)")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_GENERATED_CONCEPT_PROMOTION_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Generated batch route output is review-only. Planner explicitly saves a generated audit as a canonical concept before Details/Release/Plan become available. There is no generated-preview to direct-plan bypass.'}};console.info(JSON.stringify(out,null,2));return out;
}