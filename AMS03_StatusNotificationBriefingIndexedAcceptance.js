// BUILD: 2026-09-23_AMS03_STATUS_NOTIFICATION_BRIEFING_INDEXED_ACCEPTANCE_R3
function RUN_AMS03_STATUS_NOTIFICATION_BRIEFING_INDEXED_ACCEPTANCE(){
 var s=String(StatusNotificationBridge_LoadEcasAuditBriefing_),r=[],d=String(StatusNotificationBridge_Diag_);function q(n,v){r.push({name:n,ok:!!v});}
 q('usesCanonicalAuditRowIndex',s.indexOf('__mp_getAuditPlanningRow_')>=0);
 q('noAuditPlanningTextFinder',s.indexOf('createTextFinder')<0);
 q('noAuditPlanningRangeScan',s.indexOf("getSheetByName('Audit planning')")<0);
 q('preservesCompanyNumberOwner',s.indexOf('StatusNotificationBridge_LoadMpsNumberFromCompaniesByUid_')>=0);
 q('preservesPlanningParser',s.indexOf('StatusNotificationBridge_ParsePlanningJson_')>=0);
 q('preservesDiagnostics',s.indexOf('StatusNotificationBridge_Diag_')>=0&&d.length>20);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_STATUS_NOTIFICATION_BRIEFING_INDEXED_ACCEPTANCE_R3',total:r.length,passed:r.length-f,failed:f,results:r,meta:{writes:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}