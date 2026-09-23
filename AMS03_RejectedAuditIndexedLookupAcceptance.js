/***********************************************************************
 * AMS03_RejectedAuditIndexedLookupAcceptance.js
 * BUILD: 2026-09-23_AMS03_REJECTED_AUDIT_INDEXED_LOOKUP_ACCEPTANCE_R1
 ***********************************************************************/
function RUN_AMS03_REJECTED_AUDIT_INDEXED_LOOKUP_ACCEPTANCE(){
 var s=String(_raFindAuditRow),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('usesCanonicalRowIndex',s.indexOf('__mp_getAuditPlanningRow_')>=0);
 q('noFullPlanningScan',s.indexOf('getDataRange')<0&&s.indexOf('getRange(cfg.headerRow + 1')<0);
 q('preservesRowNumber',s.indexOf('pack.rowNumber')>=0);
 q('preservesHeadersAndRow',s.indexOf('headers:headers')>=0&&s.indexOf('row:row')>=0);
 q('preservesScopeFields',s.indexOf('mpsAbc')>=0&&s.indexOf('florimarkGtp')>=0&&s.indexOf('scope8')>=0);
 q('readOnlyLookup',s.indexOf('setValue')<0&&s.indexOf('setValues')<0&&s.indexOf('deleteRow')<0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_REJECTED_AUDIT_INDEXED_LOOKUP_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
