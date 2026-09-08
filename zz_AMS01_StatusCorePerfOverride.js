/**
 * FILE: zz_AMS01_StatusCorePerfOverride.js
 * BUILD: AMS01_STATUS_CORE_PERF_ZZ_20260908_R2
 * DEV-only late-load overrides for status hot-path performance.
 * - synchronous diagnostics -> Logger only
 * - status cache invalidation keeps Audit-ID row index intact and invalidates
 *   only row payload generation + Audit planning persist cache.
 * No status/planning/availability/notification truth changes.
 */
var AMS01_STATUS_CORE_PERF_ZZ_BUILD='AMS01_STATUS_CORE_PERF_ZZ_20260908_R2';

function Status_diagLog_(diagType,auditId,details){
  try{Logger.log('[AMS01_STATUS_DIAG] '+JSON.stringify({build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,type:String(diagType||''),auditId:String(auditId||''),details:details||{}}));}catch(e){}
  return {success:true,loggerOnly:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
}

function ManagerDiagnostics_RecordActionTiming(action,auditId,durationMs,success,extra){
  try{Logger.log('[AMS01_ACTION_TIMING] '+JSON.stringify({build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,action:String(action||''),auditId:String(auditId||''),durationMs:Number(durationMs||0),success:success!==false,extra:extra||{}}));}catch(e){}
  return {success:true,loggerOnly:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
}

/**
 * Status hot-path invalidation.
 * Status/Plan/Reopen writes mutate values on an existing Audit planning row;
 * they do not change the Audit-ID -> row-number index. Keep that index warm.
 *
 * Required freshness retained:
 * - bump per-row payload generation so cached row content is stale immediately;
 * - clear request-scoped Audit planning caches;
 * - clear persistent Audit planning sheet cache used by grids/readers.
 *
 * Structural planning mutations outside CoreStatusMachine still call the
 * canonical __mp_invalidateAuditPlanningPack_ owner directly.
 */
function Status_invalidateAuditPlanningPack_(){
  var t0=Date.now();
  var stages=[];
  function run_(name,fn){
    var s=Date.now();
    try{fn();stages.push({name:name,wallMs:Date.now()-s,ok:true});}
    catch(e){stages.push({name:name,wallMs:Date.now()-s,ok:false,error:String(e&&e.message?e.message:e)});}
  }

  run_('__mp_apRowGenBump_',function(){
    if(typeof __mp_apRowGenBump_==='function') __mp_apRowGenBump_();
  });

  run_('__MP_EXEC_CACHE clear',function(){
    if(typeof __MP_EXEC_CACHE==='object'&&__MP_EXEC_CACHE){
      try{delete __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];}catch(e0){}
      try{delete __MP_EXEC_CACHE['SHEET:Audit planning'];}catch(e1){}
    }
  });

  run_('__mp_invalidatePersistCaches_:Audit planning',function(){
    if(typeof __mp_invalidatePersistCaches_==='function') __mp_invalidatePersistCaches_(['Audit planning']);
  });

  var out={success:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,mode:'STATUS_ROW_PAYLOAD_ONLY',wallMs:Date.now()-t0,stages:stages};
  try{Logger.log('[AMS01_STATUS_INVALIDATE] '+JSON.stringify(out));}catch(eLog){}
  return out;
}

function AMS01_StatusCorePerfZZStatus(){
  var t0=Date.now();
  var a=Status_diagLog_('AMS01_STATUS','TEST',{action:'STATUS'});
  var b=ManagerDiagnostics_RecordActionTiming('status','TEST',0,true,{});
  return {success:true,active:!!(a&&a.loggerOnly&&a.build===AMS01_STATUS_CORE_PERF_ZZ_BUILD&&b&&b.loggerOnly&&b.build===AMS01_STATUS_CORE_PERF_ZZ_BUILD),build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,wallMs:Date.now()-t0,statusDiagnostics:'LOGGER_ONLY',managerActionTiming:'LOGGER_ONLY',statusInvalidation:'ROW_PAYLOAD_ONLY'};
}
