// BUILD: 2026-09-23_AMS03_AUDITOR_ACTION_INDEXED_ACCEPTANCE_R1
function RUN_AMS03_AUDITOR_ACTION_INDEXED_ACCEPTANCE(){
 var s=String(AuditorV5_Action_U20260410),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('usesCanonicalRowIndex',s.indexOf('__mp_getAuditPlanningRow_')>=0);
 q('noFullAuditPlanningRead',s.indexOf('getDataRange')<0);
 q('preservesStatusMachineOwner',s.indexOf("Status_applyAction('AUDITOR', 'ACCEPT'")>=0&&s.indexOf("Status_applyAction('AUDITOR', actionUpper")>=0);
 q('preservesCompletionOwner',s.indexOf('CompletionService_CommitCompletion')>=0);
 q('preservesGridInvalidation',s.indexOf('auditorV5_invalidateGridCacheForAuditActors_')>=0);
 q('usesPhysicalRowNumber',s.indexOf('rowPack.rowNumber - 1')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_AUDITOR_ACTION_INDEXED_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReads:false,liveWrites:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
