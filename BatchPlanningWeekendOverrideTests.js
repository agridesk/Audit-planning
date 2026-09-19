/** FILE: BatchPlanningWeekendOverrideTests.gs
 * BUILD: 2026-09-19_BATCH_WEEKEND_OVERRIDE_R1
 * RUN: RUN_BATCH_PLANNING_WEEKEND_OVERRIDE_REGRESSION
 */
function RUN_BATCH_PLANNING_WEEKEND_OVERRIDE_REGRESSION(){
 var s=BatchPlanningConfirmation_validateCanonical_.toString(),b=BatchPlanningConfirmation_buildRequests_.toString(),w=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('canonicalWeekendRequiresTrue',s.indexOf('allowWeekend:req.allowWeekendOverride===true')>=0);
 t('canonicalWeekendNoImplicitDefault',s.indexOf('allowWeekend:req.allowWeekendOverride!==false')<0);
 t('batchRequestMapsExplicitOverride',b.indexOf('allowWeekendOverride:overrides.allowWeekend===true')>=0);
 t('workspaceDoesNotHardcodeWeekendOverride',w.indexOf('allowWeekendOverride:true')<0);
 t('workspaceItemStillCarriesWaiverOnlyWhenExplicit',w.indexOf('waiverAccepted:r&&r.waiverAccepted===true')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_WEEKEND_OVERRIDE_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Weekend remains a soft constraint, but bypass requires an explicit true override. Missing/false never silently authorizes weekend planning.'}};console.info(JSON.stringify(out,null,2));return out;
}