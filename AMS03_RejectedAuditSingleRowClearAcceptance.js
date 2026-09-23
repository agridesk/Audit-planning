/***********************************************************************
 * AMS03_RejectedAuditSingleRowClearAcceptance.js
 * BUILD: 2026-09-23_AMS03_REJECTED_AUDIT_SINGLE_ROW_CLEAR_ACCEPTANCE_R1
 ***********************************************************************/
function RUN_AMS03_REJECTED_AUDIT_SINGLE_ROW_CLEAR_ACCEPTANCE(){
 var s=String(ClearPlanningFields),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('usesCanonicalRowIndex',s.indexOf('__mp_getAuditPlanningRow_')>=0);
 q('noFullPlanningScan',s.indexOf('getLastRow')<0&&s.indexOf('getDataRange')<0);
 q('singleRowWrite',s.indexOf('getRange(pack.rowNumber,1,1,headers.length).setValues([row])')>=0);
 q('invalidatesIndex',s.indexOf('__mp_invalidateAuditPlanningPack_')>=0);
 q('preservesProtectedLifecycle',s.indexOf('Lifecycle_snapshotProtectedPlanningFields_')>=0&&s.indexOf('Lifecycle_restoreProtectedPlanningFields_')>=0);
 q('clearsCanonicalPlanningFields',s.indexOf('assignedTo')>=0&&s.indexOf('datePlanned')>=0&&s.indexOf('dateApproved')>=0&&s.indexOf('planningJson')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_REJECTED_AUDIT_SINGLE_ROW_CLEAR_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{writePathChanged:true,writeScope:'SINGLE_AUDIT_ROW',newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
