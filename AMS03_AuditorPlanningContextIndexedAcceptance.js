/***********************************************************************
 * AMS03_AuditorPlanningContextIndexedAcceptance.js
 * BUILD: 2026-09-23_AMS03_AUDITOR_PLANNING_CONTEXT_INDEXED_ACCEPTANCE_R1
 ***********************************************************************/
function RUN_AMS03_AUDITOR_PLANNING_CONTEXT_INDEXED_ACCEPTANCE(){
 var s=String(v5_resolvePlanningContext),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('usesCanonicalRowIndex',s.indexOf('__mp_getAuditPlanningRow_')>=0);
 q('noFullPlanningScan',s.indexOf('getDataRange')<0);
 q('preservesExpiry',s.indexOf('V5_H_EXPIRY_FINAL')>=0);
 q('preservesScopeWindows',s.indexOf('scopeWindows')>=0&&s.indexOf('intersection')>=0);
 q('preservesAssignedStatus',s.indexOf('V5_H_ASSIGNED_TO')>=0&&s.indexOf('V5_H_STATUS')>=0);
 q('readOnly',s.indexOf('setValue')<0&&s.indexOf('setValues')<0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_AUDITOR_PLANNING_CONTEXT_INDEXED_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}