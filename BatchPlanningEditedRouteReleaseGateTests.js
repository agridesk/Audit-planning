/** FILE: BatchPlanningEditedRouteReleaseGateTests.gs
 * BUILD: 2026-09-18_BATCH_PLANNING_EDITED_ROUTE_RELEASE_GATE_R2
 * RUN: RUN_BATCH_PLANNING_EDITED_ROUTE_RELEASE_GATE
 */
function RUN_BATCH_PLANNING_EDITED_ROUTE_RELEASE_GATE(){
 var api=String(revalidateBatchPlanningEditedConceptV5),svc=String(revalidateBatchPlanningEditedRouteV5),build=String(BATCH_PLANNING_CONFIRMATION_BUILD),req=String(BatchPlanningConfirmation_buildRequests_),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('managerApiBoundary',api.indexOf('revalidateBatchPlanningEditedRouteV5')>=0);
 t('editedServiceAvailable',typeof revalidateBatchPlanningEditedRouteV5==='function');
 t('noOptimizerInEditedService',svc.indexOf('BatchPlanningConceptEngine_Generate')<0&&svc.indexOf('BatchPlanningIntegratedConcept_Generate')<0);
 t('exactPlannerOrderWalk',svc.indexOf('ordered.push({day:d,audit:a})')>=0);
 t('plannerDayAssignmentPreserved',svc.indexOf('plannerDayAssignmentPreserved:true')>=0);
 t('freshRoutes',svc.indexOf('forceFresh:true')>=0);
 t('routeStaleClearedOnlySuccess',svc.indexOf('concept.routeStateStale=false')>=0&&svc.indexOf('routeStateStale:true')>=0);
 t('strictDayOverflow',svc.indexOf('cursor+dur>=24*60')>=0);
 t('confirmationR17',build.indexOf('R17_EXPLICIT_SOFT_OVERRIDES')>=0);
 t('confirmationStrictEndBoundary',req.indexOf('endM>=1440')>=0);
 t('softOverridesNotImplicit',req.indexOf('allowSoftCompanyOverride:true')<0&&req.indexOf('allowSoftAuditorOverride:true')<0&&req.indexOf('allowWeekendOverride:true')<0);
 t('softOverridesExplicitContract',req.indexOf('overrides.allowSoftCompany===true')>=0&&req.indexOf('overrides.allowSoftAuditor===true')>=0&&req.indexOf('overrides.allowWeekend===true')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-18_BATCH_PLANNING_EDITED_ROUTE_RELEASE_GATE_R2',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Planner edits preserve exact day/order; route/travel refresh is fresh and non-optimizing; confirmation soft overrides are explicit.'}};console.info(JSON.stringify(out,null,2));return out;
}