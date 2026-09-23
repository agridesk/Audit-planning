/**
 * FILE: AnnualPlanningWorkspaceBridgeTests.gs
 * BUILD: 2026-09-23_AMS03_ANNUAL_WORKSPACE_BRIDGE_TEST_R1
 * PURPOSE: Non-destructive acceptance of Annual Planning -> Planning Workspace routing.
 ***********************************************************************/
var ANNUAL_PLANNING_WORKSPACE_BRIDGE_TEST_BUILD='2026-09-23_AMS03_ANNUAL_WORKSPACE_BRIDGE_TEST_R1';

function RUN_AMS03_ANNUAL_WORKSPACE_BRIDGE_ACCEPTANCE(){
  var year=2027,r=getAnnualPlanningWorkspaceBridgeV5({year:year}),items=r&&Array.isArray(r.items)?r.items:[];
  var validStates={WORKSPACE_READY:true,MATERIALIZATION_REQUIRED:true,BLOCKED:true};
  var gates={
    success:r&&r.success===true,
    readOnly:r&&r.readOnly===true,
    noWrites:r&&r.writesPerformed===false,
    year:r&&Number(r.year)===year,
    itemsPresent:items.length>0,
    validStates:items.every(function(x){return !!validStates[String(x&&x.state||'')];}),
    linkedRoutesUseAuditId:items.filter(function(x){return x.state==='WORKSPACE_READY';}).every(function(x){return !!(x.auditId&&x.workspaceRoute&&x.workspaceRoute.auditId===x.auditId);}),
    unlinkedRequireMaterialization:items.filter(function(x){return x.state==='MATERIALIZATION_REQUIRED';}).every(function(x){return !x.auditId&&x.materialization&&x.materialization.required===true;}),
    noSecondPlanningEngine:!!(r&&r.diagnostics&&r.diagnostics.newPlanningEngine===false),
    noNewSsot:!!(r&&r.diagnostics&&r.diagnostics.newSsot===false),
    workspaceOwner:!!(r&&r.diagnostics&&String(r.diagnostics.workspaceOwner||'').indexOf('PlanningWorkspace')>=0),
    noDirectPlanningWrites:!!(r&&r.diagnostics&&r.diagnostics.directPlanningWrites===false)
  };
  var passed=0,total=0;Object.keys(gates).forEach(function(k){total++;if(gates[k])passed++;});
  var out={ok:passed===total,build:ANNUAL_PLANNING_WORKSPACE_BRIDGE_TEST_BUILD,year:year,passed:passed,total:total,gates:gates,counts:r?r.counts:{},sample:items.length?items[0]:null,meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false,materializationWrites:false}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
