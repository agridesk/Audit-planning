/** FILE: PlanningWorkspaceBoundaryDefaultsTests.gs
 * BUILD: 2026-09-19_WORKSPACE_BOUNDARY_DEFAULTS_R1
 * RUN: RUN_WORKSPACE_BOUNDARY_DEFAULTS_REGRESSION
 */
function RUN_WORKSPACE_BOUNDARY_DEFAULTS_REGRESSION(){
 var client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),api=String(getBatchPlanningBoundaryDefaultsV5),route=String(BatchPlanningRouteMatrix_waypoint_),r=[];
 function t(n,v){r.push({name:n,ok:!!v,detail:v?'':'FAILED'});}
 t('auditorDefaultEndpointPresent',api.indexOf('BatchPlanningReadModel_GetAuditor')>=0);
 t('defaultDepartureReturned',api.indexOf('defaultDepartureFrom')>=0);
 t('sourceIsAuditorsDeparture',api.indexOf('Auditors.Default departure from')>=0);
 t('clientLoadsDefaultOnAuditorChange',client.indexOf('applyAuditorBoundaryDefaults')>=0&&client.indexOf('getBatchPlanningBoundaryDefaultsV5')>=0);
 t('startPopulatedFromDefault',client.indexOf("from.value=dep")>=0);
 t('endPopulatedFromDefault',client.indexOf("to.value=dep")>=0);
 t('startEndRemainEditable',client.indexOf('batchStartPoint')>=0&&client.indexOf('batchEndPoint')>=0);
 t('freeTextRouteAddressSupported',route.indexOf("address:String(p.label||p.gps||'')")>=0);
 t('coordinateRoutePointSupported',route.indexOf('latLng')>=0);
 t('noWrites',api.indexOf('setValue(')<0&&api.indexOf('setValues(')<0&&api.indexOf('appendRow(')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_BOUNDARY_DEFAULTS_R1',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}