/***********************************************************************
 * AnnualPlanningIntegratedPhase4Tests.js
 * BUILD: 2026-09-23_AMS03_ANNUAL_PLANNER_PHASE4_R2_WORKSPACE_LAUNCH
 ***********************************************************************/
var AMS03_ANNUAL_PHASE4_TEST_BUILD='2026-09-23_AMS03_ANNUAL_PLANNER_PHASE4_R2_WORKSPACE_LAUNCH';
function RUN_AMS03_ANNUAL_PLANNER_PHASE4_ACCEPTANCE(){
 var base=getAnnualPlanningIntegratedV5({year:2027}),d=AnnualPlanningIntegrated_drilldownV5({year:2027}),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('integratedSuccess',base&&base.success===true);q('workloadCapacityJoined',Array.isArray(base&&base.auditors));q('regionDrilldownAvailable',Array.isArray(base&&base.byRegion));q('scopeDrilldownAvailable',Array.isArray(base&&base.byScope));q('monthDrilldownAvailable',Array.isArray(base&&base.byMonth));q('drilldownReadOnly',d&&d.meta&&d.meta.readOnly===true&&d.meta.writes===false);q('conceptLaunchAuditIds',d&&d.conceptPlanningLaunch&&Array.isArray(d.conceptPlanningLaunch.auditIds));q('conceptLaunchTargetsWorkspace',d&&d.conceptPlanningLaunch&&d.conceptPlanningLaunch.target==='Planning Workspace 2.0');q('conceptLaunchAction',d&&d.conceptPlanningLaunch&&d.conceptPlanningLaunch.action==='planningworkspace');q('conceptLaunchCarriesAuditIds',d&&d.conceptPlanningLaunch&&d.conceptPlanningLaunch.workspaceRequest&&Array.isArray(d.conceptPlanningLaunch.workspaceRequest.auditIds));q('rotationWarningProjection',d&&d.summary&&Object.prototype.hasOwnProperty.call(d.summary,'rotationWarnings'));q('noNewSsot',d&&d.meta&&d.meta.newSsot===false);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS03_ANNUAL_PHASE4_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,summary:base&&base.summary||{},drilldown:d&&d.summary||{},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
