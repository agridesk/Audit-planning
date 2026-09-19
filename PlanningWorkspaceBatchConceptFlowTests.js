/** FILE: PlanningWorkspaceBatchConceptFlowTests.gs
 * BUILD: 2026-09-19_WORKSPACE_BATCH_CONCEPT_FLOW_R1
 * RUN: RUN_WORKSPACE_BATCH_CONCEPT_FLOW_REGRESSION
 */
function RUN_WORKSPACE_BATCH_CONCEPT_FLOW_REGRESSION(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('auditorControlPresent',h.indexOf('id="batchConceptAuditor"')>=0);
 t('generateSelectedControlPresent',h.indexOf('id="generateSelectedConcept"')>=0);
 t('noConfigureNextControl',h.indexOf('configureNextSelected')<0);
 t('selectionOrderFeedsGenerator',c.indexOf('function selectedAuditIds()')>=0&&c.indexOf('state.selectionOrder')>=0);
 t('periodPassedToGenerator',c.indexOf('periodFrom:req.from')>=0&&c.indexOf('periodTo:req.to')>=0);
 t('selectedAuditIdsPassedToGenerator',c.indexOf('auditIds:ids')>=0);
 t('auditorPassedToGenerator',c.indexOf('auditorEmail:auditor')>=0);
 t('readOnlyConceptApiUsed',c.indexOf('.getBatchPlanningConceptV5(')>=0);
 t('generationDoesNotCallCommit',c.indexOf('function generateSelectedConcept()')>=0&&c.substring(c.indexOf('function generateSelectedConcept()'),c.indexOf('function metricWall')).indexOf('batchCommit')<0);
 t('resultExplicitlyNothingSaved',c.indexOf('nothing saved')>=0);
 t('obsoleteConfigureNextRemoved',b.indexOf('function configureNext')<0);
 t('confirmationLimitedToSavedConcepts',b.indexOf('Preview saved concepts')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_BATCH_CONCEPT_FLOW_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Planner selects a period, selects audits from that work queue, selects an auditor, and generates one read-only route concept. No audit is saved or planned by generation.'}};console.info(JSON.stringify(out,null,2));return out;
}