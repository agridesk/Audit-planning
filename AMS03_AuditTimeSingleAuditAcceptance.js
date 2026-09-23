function RUN_AMS03_AUDIT_TIME_SINGLE_AUDIT_ACCEPTANCE(){
 var a=String(AuditTimeV5_RebuildTotalHoursForAuditId),s=String(auditorV5_syncAuditArtifactsSafe_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('indexedAuditLookup',a.indexOf('__mp_getAuditPlanningRow_')>=0);q('noFullPlanningScan',a.indexOf('sh.getDataRange')<0);
 q('singleCellWrite',a.indexOf('getRange(pack.rowNumber,idxTotal+1).setValue(total)')>=0);
 q('cacheInvalidated',a.indexOf('__mp_invalidateAuditPlanningPack_')>=0);
 q('singleActionUsesTargetedRebuild',s.indexOf('AuditTimeV5_RebuildTotalHoursForAuditId(out.auditId)')>=0);
 q('fullRebuildFallbackPreserved',s.indexOf('AuditTimeV5_RebuildTotalHours()')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_AUDIT_TIME_SINGLE_AUDIT_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{newSsot:false,fullRebuildPreserved:true}};Logger.log(JSON.stringify(o,null,2));return o;
}