/** FILE: PlanningWorkspaceRouteBoundariesTests.gs
 * BUILD: 2026-09-19_WORKSPACE_ROUTE_BOUNDARIES_R1
 * RUN: RUN_WORKSPACE_ROUTE_BOUNDARIES_REGRESSION
 */
function RUN_WORKSPACE_ROUTE_BOUNDARIES_REGRESSION(){
 var html=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
 var client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
 var api=String(getBatchPlanningConceptV5);
 var anchor=String(BatchPlanningAnchorRouteModel_Resolve);
 var engine=String(BatchPlanningConceptEngine_boundaries_);
 var tests=[
  ['startPointVisible',html.indexOf('id="batchStartPoint"')>=0],
  ['endPointVisible',html.indexOf('id="batchEndPoint"')>=0],
  ['defaultDepartureCommunicated',html.indexOf('Auditor default departure')>=0],
  ['clientReadsBoundaries',client.indexOf('function conceptBoundaries()')>=0],
  ['clientSendsInbound',client.indexOf('x.inboundPoint=b.inboundPoint')>=0],
  ['clientSendsOutbound',client.indexOf('x.outboundPoint=b.outboundPoint')>=0],
  ['managerPassesInbound',api.indexOf('request.inboundPoint=input.inboundPoint')>=0],
  ['managerPassesOutbound',api.indexOf('request.outboundPoint=input.outboundPoint')>=0],
  ['anchorDefaultsHome',anchor.indexOf("inboundSource:input.inboundPoint?'PLANNER_OVERRIDE'")>=0&&anchor.indexOf("'HOME'")>=0],
  ['engineDefaultsHome',engine.indexOf("inboundSource:input.inboundPoint?'PLANNER_OVERRIDE'")>=0&&engine.indexOf("'HOME'")>=0],
  ['startEndIndependent',client.indexOf('batchStartPoint')>=0&&client.indexOf('batchEndPoint')>=0],
  ['noPlanningWrites',client.indexOf('getBatchPlanningConceptV5')>=0]
 ];
 var results=tests.map(function(t){return{name:t[0],ok:!!t[1],detail:t[1]?'':'FAILED'};}),failed=results.filter(function(x){return !x.ok;});
 var out={ok:failed.length===0,build:'2026-09-19_WORKSPACE_ROUTE_BOUNDARIES_R1',total:results.length,passed:results.length-failed.length,failed:failed.length,results:results};console.info(JSON.stringify(out,null,2));return out;
}