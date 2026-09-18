/** FILE: PlanningWorkspaceExplicitBatchConfirmationTests.gs
 * BUILD: 2026-09-18_WORKSPACE_EXPLICIT_BATCH_CONFIRM_R2
 * RUN: RUN_WORKSPACE_EXPLICIT_BATCH_CONFIRM_REGRESSION
 */
function RUN_WORKSPACE_EXPLICIT_BATCH_CONFIRM_REGRESSION(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('configureButtonAddressable',h.indexOf('id="configureNextSelected"')>=0);
 t('configureStartsSafelyDisabled',h.indexOf('id="configureNextSelected" class="btn primary" type="button" disabled')>=0);\n t('configureEnabledByRuntimeWhenStaged',b.indexOf('if(cfg)cfg.disabled=n===0')>=0);
 t('configureHandlerPresent',b.indexOf('function configureNext()')>=0);
 t('configureOpensToolkit',b.indexOf("t.open(clean(rows[0].auditId))")>=0);
 t('previewButtonLabel',b.indexOf("Preview selected")>=0);
 t('previewDoesNotCommitDirectly',b.indexOf("pendingPreview={rows:rows.slice()")>=0);
 t('explicitConfirmLabel',b.indexOf("Confirm plan selected (")>=0);
 t('explicitConfirmRequiredStatus',b.indexOf('explicit confirmation required')>=0);
 t('secondActionCommits',b.indexOf('if(pendingPreview)')>=0&&b.indexOf('doCommit(approved,b,previewWall)')>=0);
 t('changedSelectionInvalidatesPreview',b.indexOf("Selection or concept changed. Preview again.")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-18_WORKSPACE_EXPLICIT_BATCH_CONFIRM_R2',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Configure is actionable for staged concepts; Preview is read-only; canonical batch write requires a separate explicit confirmation action.'}};console.info(JSON.stringify(out,null,2));return out;
}