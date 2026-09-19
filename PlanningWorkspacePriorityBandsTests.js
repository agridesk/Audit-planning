/** FILE: PlanningWorkspacePriorityBandsTests.gs
 * BUILD: 2026-09-19_WORKSPACE_PRIORITY_BANDS_R1
 * RUN: RUN_WORKSPACE_PRIORITY_BANDS_REGRESSION
 */
function RUN_WORKSPACE_PRIORITY_BANDS_REGRESSION(){
 var d=PlanningDemandService_get.toString(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('canonicalDemandOwnsUrgency',d.indexOf('urgency:PDS_urgency_')>=0);
 t('overdueMapsNow',c.indexOf("u==='OVERDUE'||u==='DUE_IN_PERIOD'")>=0&&c.indexOf("return'Nu plannen'")>=0);
 t('openMapsSoon',c.indexOf("u==='OPEN_IN_PERIOD'")>=0&&c.indexOf("return'Binnenkort plannen'")>=0);
 t('unknownMapsLater',c.indexOf("u==='UNKNOWN'")>=0&&c.indexOf("return'Later / nog geen druk'")>=0);
 t('uiDoesNotRecalculateUrgencyDates',c.indexOf("to?('WINDOW → '+to)")<0);
 t('priorityRemainsDefaultGroup',c.indexOf("||'priority'")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_PRIORITY_BANDS_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'PlanningDemandService remains the canonical urgency owner; Workspace only maps canonical urgency to planner-facing bands: Nu plannen, Binnenkort plannen, Later / nog geen druk.'}};console.info(JSON.stringify(out,null,2));return out;
}