/** FILE: PlanningWorkspaceSelectionIdentityTests.gs
 * BUILD: 2026-09-18_WORKSPACE_SELECTION_IDENTITY_R1
 * RUN: RUN_WORKSPACE_SELECTION_IDENTITY_REGRESSION
 */
function RUN_WORKSPACE_SELECTION_IDENTITY_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('selectionOrderState',c.indexOf('selectionOrder:[]')>=0);
 t('manualSelectAppendsIdentity',c.indexOf('state.selectionOrder.push(id)')>=0);
 t('manualDeselectRemovesIdentity',c.indexOf('state.selectionOrder=state.selectionOrder.filter')>=0);
 t('clearResetsOrder',c.indexOf('state.selectionOrder=[]')>=0);
 t('selectVisiblePreservesOrder',c.indexOf('if(!state.selected[x.auditId])state.selectionOrder.push(x.auditId)')>=0);
 t('stagedRowsRespectPlannerOrder',b.indexOf('Array.isArray(s.selectionOrder)')>=0&&b.indexOf('order.forEach(function(id)')>=0);
 t('configureUsesLatestSelection',b.indexOf('for(var i=order.length-1;i>=0;i--)')>=0);
 t('configureOpensResolvedIdentity',b.indexOf('t.open(id)')>=0);
 t('configureNoLongerBlindFirstRow',b.indexOf('t.open(clean(rows[0].auditId))')<0);
 t('previewStillExplicit',b.indexOf('pendingPreview')>=0&&b.indexOf('Confirm plan selected')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-18_WORKSPACE_SELECTION_IDENTITY_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Batch selection retains planner click order and Configure opens the most recently selected staged audit identity, never an unrelated first reservation.'}};console.info(JSON.stringify(out,null,2));return out;
}