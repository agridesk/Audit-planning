/***********************************************************************
 * AnnualPlanningPhase4ContractTests.js
 * BUILD: 2026-09-23_AMS03_ANNUAL_PHASE4_CONTRACT_R1
 * Static/non-destructive ownership contract for annual planner.
 ***********************************************************************/
var AMS03_ANNUAL_PHASE4_CONTRACT_BUILD='2026-09-23_AMS03_ANNUAL_PHASE4_CONTRACT_R1';
function RUN_AMS03_ANNUAL_PHASE4_CONTRACT_REGRESSION(){
 var i=String(getAnnualPlanningIntegratedV5),d=String(AnnualPlanningIntegrated_drilldownV5),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('workloadOwnerReused',i.indexOf('getAnnualWorkloadCapacity3SV5')>=0);
 q('capacityOwnerReused',i.indexOf('getAnnualAvailabilityCapacityV5')>=0);
 q('drilldownInMemory',d.indexOf('getRange(')<0&&d.indexOf('getDataRange(')<0&&d.indexOf('SpreadsheetApp')<0);
 q('regionFilter',d.indexOf('payload.region')>=0);
 q('scopeFilter',d.indexOf('payload.scope')>=0);
 q('monthFilter',d.indexOf('payload.month')>=0);
 q('workspaceLaunch',d.indexOf("action:'planningworkspace'")>=0);
 q('launchAuditIds',d.indexOf('auditIds:auditIds')>=0);
 q('rotationAdvisoryOnly',d.indexOf('rotationWarnings')>=0&&d.indexOf('hardBlockRotation')<0);
 q('noWrites',d.indexOf('setValue(')<0&&d.indexOf('setValues(')<0&&d.indexOf('appendRow(')<0);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS03_ANNUAL_PHASE4_CONTRACT_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
