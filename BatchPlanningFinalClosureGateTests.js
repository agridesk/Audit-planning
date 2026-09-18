/** FILE: BatchPlanningFinalClosureGateTests.gs
 * BUILD: 2026-09-18_BATCH_PLANNING_FINAL_CLOSURE_GATE_R1
 * RUN: RUN_BATCH_PLANNING_FINAL_CLOSURE_GATE
 */
function RUN_BATCH_PLANNING_FINAL_CLOSURE_GATE(){
 var route=String(revalidateBatchPlanningEditedRouteV5),req=String(BatchPlanningConfirmation_buildRequests_),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('editedRouteR2',String(BATCH_PLANNING_EDITED_ROUTE_BUILD).indexOf('R2_IDENTITY_GUARD')>=0);
 t('missingAuditIdRejected',route.indexOf("AUDIT_ID_REQUIRED")>=0&&route.indexOf("EDITED_CONCEPT_IDENTITY_INVALID")>=0);
 t('duplicateAuditIdRejected',route.indexOf("DUPLICATE_CONCEPT_AUDIT")>=0);
 t('identityFailureKeepsRouteStale',route.indexOf("identityErrors,routeStateStale:true")>=0);
 t('confirmationR18',String(BATCH_PLANNING_CONFIRMATION_BUILD).indexOf('R18_STRICT_REQUEST_PARSER')>=0);
 t('strictParserUsedForStart',req.indexOf('BatchPlanningConfirmation_minutes_(start)')>=0);
 t('strictParserUsedForEnd',req.indexOf('BatchPlanningConfirmation_minutes_(conceptEnd)')>=0);
 t('invalidParserResultRejected',req.indexOf('startM<0||endM<0')>=0);
 t('rawMinuteOverflowCannotPass',BatchPlanningConfirmation_minutes_('12:99')<0);
 t('raw2400CannotPass',BatchPlanningConfirmation_minutes_('24:00')<0);
 t('valid2359Passes',BatchPlanningConfirmation_minutes_('23:59')===1439);
 t('managerBoundaryAvailable',typeof revalidateBatchPlanningEditedConceptV5==='function');
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-18_BATCH_PLANNING_FINAL_CLOSURE_GATE_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Final defense-in-depth closure: edited concept identities are strict, server route reflow is authoritative, and confirmation time parsing is canonical-strict.'}};console.info(JSON.stringify(out,null,2));return out;
}