/**
 * FILE: zz_AMS01_StatusCorePerfOverride.js
 * BUILD: AMS01_STATUS_CORE_PERF_ZZ_20260908_R1
 * DEV-only late-load override for synchronous status diagnostics.
 * No status/planning/availability/notification truth changes.
 */
var AMS01_STATUS_CORE_PERF_ZZ_BUILD='AMS01_STATUS_CORE_PERF_ZZ_20260908_R1';

function Status_diagLog_(diagType,auditId,details){
  try{Logger.log('[AMS01_STATUS_DIAG] '+JSON.stringify({build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,type:String(diagType||''),auditId:String(auditId||''),details:details||{}}));}catch(e){}
  return {success:true,loggerOnly:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
}

function ManagerDiagnostics_RecordActionTiming(action,auditId,durationMs,success,extra){
  try{Logger.log('[AMS01_ACTION_TIMING] '+JSON.stringify({build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,action:String(action||''),auditId:String(auditId||''),durationMs:Number(durationMs||0),success:success!==false,extra:extra||{}}));}catch(e){}
  return {success:true,loggerOnly:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
}

function AMS01_StatusCorePerfZZStatus(){
  var t0=Date.now();
  var a=Status_diagLog_('AMS01_STATUS','TEST',{action:'STATUS'});
  var b=ManagerDiagnostics_RecordActionTiming('status','TEST',0,true,{});
  return {success:true,active:!!(a&&a.loggerOnly&&a.build===AMS01_STATUS_CORE_PERF_ZZ_BUILD&&b&&b.loggerOnly&&b.build===AMS01_STATUS_CORE_PERF_ZZ_BUILD),build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,wallMs:Date.now()-t0,statusDiagnostics:'LOGGER_ONLY',managerActionTiming:'LOGGER_ONLY'};
}
