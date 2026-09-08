/**
 * FILE: zz_AMS01_StatusCorePerfOverride.js
 * BUILD: AMS01_STATUS_CORE_PERF_ZZ_20260908_R6_SINGLE_LIFECYCLE_SPAN
 * DEV-only hot-path performance overrides.
 * - synchronous diagnostics -> Logger only
 * - status cache invalidation keeps Audit-ID row index intact
 * - lifecycle metadata uses one bounded span read/write instead of multiple writes
 * - no status/planning/availability/notification truth changes
 */
var AMS01_STATUS_CORE_PERF_ZZ_BUILD='AMS01_STATUS_CORE_PERF_ZZ_20260908_R6_SINGLE_LIFECYCLE_SPAN';

function Status_diagLog_(diagType,auditId,details){
  try{Logger.log('[AMS01_STATUS_DIAG] '+JSON.stringify({build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,type:String(diagType||''),auditId:String(auditId||''),details:details||{}}));}catch(e){}
  return {success:true,loggerOnly:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
}

function ManagerDiagnostics_RecordActionTiming(action,auditId,durationMs,success,extra){
  try{Logger.log('[AMS01_ACTION_TIMING] '+JSON.stringify({build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,action:String(action||''),auditId:String(auditId||''),durationMs:Number(durationMs||0),success:success!==false,extra:extra||{}}));}catch(e){}
  return {success:true,loggerOnly:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
}

function Status_invalidateAuditPlanningPack_(){
  var t0=Date.now();
  var stages=[];
  function run_(name,fn){
    var s=Date.now();
    try{fn();stages.push({name:name,wallMs:Date.now()-s,ok:true});}
    catch(e){stages.push({name:name,wallMs:Date.now()-s,ok:false,error:String(e&&e.message?e.message:e)});}
  }

  run_('__mp_apRowGenBump_',function(){ if(typeof __mp_apRowGenBump_==='function') __mp_apRowGenBump_(); });
  run_('__MP_EXEC_CACHE clear',function(){
    if(typeof __MP_EXEC_CACHE==='object'&&__MP_EXEC_CACHE){
      try{delete __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];}catch(e0){}
      try{delete __MP_EXEC_CACHE['SHEET:Audit planning'];}catch(e1){}
    }
  });
  run_('Native Audit planning persist keys',function(){
    var c=CacheService.getScriptCache();
    c.remove('MP_PERSIST::mp_readonly_sheet::sheet::Audit planning');
    c.remove('MP_PERSIST::Audit planning');
  });

  var out={success:true,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,mode:'STATUS_ROW_PAYLOAD_NATIVE_KEYS_ONLY',wallMs:Date.now()-t0,stages:stages};
  try{Logger.log('[AMS01_STATUS_INVALIDATE] '+JSON.stringify(out));}catch(eLog){}
  return out;
}

// Canonical AuditLifecycleService remains owner of metadata semantics.
// This late-load writer changes only physical persistence: all distinct values
// are merged into one bounded row span, preserving untouched cells in-between.
function lifecycle_writeUpdates_(sheet,rowIndex,updates,label){
  updates=updates||[];
  if(!sheet||!rowIndex) return {success:false,written:false,warning:'Missing sheet target for '+label};
  if(!updates.length) return {success:true,written:false,warning:'No matching columns for '+label};
  try{
    var seen={};
    for(var i=0;i<updates.length;i++){
      var c=Number(updates[i]&&updates[i].col||0);
      if(c>0) seen[c]={col:c,value:updates[i].value};
    }
    var normalized=Object.keys(seen).map(function(k){return seen[k];}).sort(function(a,b){return a.col-b.col;});
    if(!normalized.length) return {success:true,written:false,warning:'No valid columns for '+label};
    var first=normalized[0].col;
    var last=normalized[normalized.length-1].col;
    var width=last-first+1;
    var range=sheet.getRange(rowIndex,first,1,width);
    var row=range.getValues()[0]||new Array(width);
    for(var n=0;n<normalized.length;n++) row[normalized[n].col-first]=normalized[n].value;
    range.setValues([row]);
    return {success:true,written:true,count:normalized.length,batches:1,spanWidth:width,build:AMS01_STATUS_CORE_PERF_ZZ_BUILD};
  }catch(e){
    return {success:false,written:false,warning:'Write failed for '+label+': '+String(e&&e.message?e.message:e)};
  }
}

function AMS01_StatusCorePerfZZStatus(){
  var t0=Date.now();
  var a=Status_diagLog_('AMS01_STATUS','TEST',{action:'STATUS'});
  var b=ManagerDiagnostics_RecordActionTiming('status','TEST',0,true,{});
  return {
    success:true,
    active:!!(a&&a.loggerOnly&&a.build===AMS01_STATUS_CORE_PERF_ZZ_BUILD&&b&&b.loggerOnly&&b.build===AMS01_STATUS_CORE_PERF_ZZ_BUILD),
    build:AMS01_STATUS_CORE_PERF_ZZ_BUILD,
    wallMs:Date.now()-t0,
    statusDiagnostics:'LOGGER_ONLY',
    managerActionTiming:'LOGGER_ONLY',
    statusInvalidation:'ROW_PAYLOAD_NATIVE_KEYS_ONLY',
    lifecycleWrites:'SINGLE_BOUNDED_SPAN'
  };
}
