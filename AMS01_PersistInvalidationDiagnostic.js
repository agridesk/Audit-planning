/**
 * FILE: AMS01_PersistInvalidationDiagnostic.js
 * BUILD: AMS01_PERSIST_INVALIDATION_DIAG_20260908_R1
 * Read-only cache invalidation timing diagnostic for Audit planning persist cache.
 */
var AMS01_PERSIST_INVALIDATION_DIAG_BUILD='AMS01_PERSIST_INVALIDATION_DIAG_20260908_R1';

function AMS01_RunPersistInvalidationDiagnostic(){
  var sheetName='Audit planning';
  var ns=(typeof __mp_cacheNamespaceForSheet_==='function')?__mp_cacheNamespaceForSheet_(sheetName):'mp_readonly_sheet';
  var key=(typeof __mp_cacheKeyForSheet_==='function')?__mp_cacheKeyForSheet_(sheetName):('sheet::'+sheetName);
  var out={build:AMS01_PERSIST_INVALIDATION_DIAG_BUILD,sheetName:sheetName,namespace:ns,key:key,probes:[],totalMs:0};
  var total0=Date.now();
  function probe_(label,fn){
    var t0=Date.now(),p={label:label,wallMs:0,ok:true,error:'',result:null};
    try{p.result=fn();}catch(e){p.ok=false;p.error=String(e&&e.message?e.message:e);}
    p.wallMs=Date.now()-t0;out.probes.push(p);return p;
  }

  probe_('AUDIT_CACHE.remove exact',function(){
    if(typeof AUDIT_CACHE!=='undefined'&&AUDIT_CACHE&&typeof AUDIT_CACHE.remove==='function') return AUDIT_CACHE.remove(ns,key);
    return {skipped:true};
  });

  probe_('AUDIT_CACHE.removeNamespace',function(){
    if(typeof AUDIT_CACHE!=='undefined'&&AUDIT_CACHE&&typeof AUDIT_CACHE.removeNamespace==='function') return AUDIT_CACHE.removeNamespace(ns);
    return {skipped:true};
  });

  probe_('Native MP_PERSIST exact',function(){
    CacheService.getScriptCache().remove('MP_PERSIST::'+ns+'::'+key);
    return true;
  });

  probe_('Native legacy MP_PERSIST sheet',function(){
    CacheService.getScriptCache().remove('MP_PERSIST::'+sheetName);
    return true;
  });

  out.totalMs=Date.now()-total0;
  try{Logger.log('[AMS01_PERSIST_INVALIDATION_DIAG] '+JSON.stringify(out));}catch(eLog){}
  return out;
}
