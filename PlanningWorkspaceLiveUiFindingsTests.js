/** FILE: PlanningWorkspaceLiveUiFindingsTests.gs
 * BUILD: 2026-09-19_WORKSPACE_LIVE_UI_FINDINGS_R1
 * RUN: RUN_WORKSPACE_LIVE_UI_FINDINGS_REGRESSION
 */
function RUN_WORKSPACE_LIVE_UI_FINDINGS_REGRESSION(){
 var cp=ConceptPlanningService_get.toString(),ci=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('companyMetaRequestedByDefault',cp.indexOf("if(!Object.prototype.hasOwnProperty.call(input,'includeCompanyMeta'))input.includeCompanyMeta=true")>=0);
 t('regionProjectedFromCanonicalCompanyData',cp.indexOf('region:CPS_clean_(d.region)')>=0);
 t('selectedSavedConceptCountUsed',ci.indexOf("saved=reservations().filter")>=0);
 t('generatedPreviewCountUsed',ci.indexOf("generated=generatedConcepts().filter")>=0);
 t('previewButtonRequiresSelectedSavedConcept',ci.indexOf("if(p)p.disabled=saved===0")>=0);
 t('uiExplainsGeneratedPreviewNextStep',ci.indexOf("in planning grid · save reviewed concept")>=0);
 t('uiExplainsGenerateNextStep',ci.indexOf("choose auditor and Generate concept")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_LIVE_UI_FINDINGS_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Live UI findings: work-queue region is populated from canonical company metadata; Preview is enabled only for selected saved concepts; generated previews clearly direct the planner to save reviewed concepts in the planning grid first.'}};console.info(JSON.stringify(out,null,2));return out;
}