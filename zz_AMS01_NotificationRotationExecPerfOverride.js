/**
 * FILE: zz_AMS01_NotificationRotationExecPerfOverride.js
 * BUILD: AMS01_NOTIFICATION_ROTATION_EXEC_PERF_ZZ_20260908_R1
 * DEV-only performance override.
 *
 * RotationAuditorService pack is large (~180 KB) and routed through the
 * overflow cache. Notification validation can request the same pack once per
 * scope. This override preserves the canonical pack exactly, but retains it
 * in execution memory after the first canonical read/build so later scope
 * checks do not re-read the overflow cache.
 */
var AMS01_NOTIFICATION_ROTATION_EXEC_PERF_BUILD='AMS01_NOTIFICATION_ROTATION_EXEC_PERF_ZZ_20260908_R1';
var AMS01_ROTATION_PACK_EXEC_CACHE=null;

(function(){
  if(typeof RotationAuditorService_getPack_!=='function') return;
  var canonicalGetPack_=RotationAuditorService_getPack_;

  RotationAuditorService_getPack_=function(ss,forceFresh){
    var t0=Date.now();
    if(!forceFresh&&AMS01_ROTATION_PACK_EXEC_CACHE){
      return AMS01_ROTATION_PACK_EXEC_CACHE;
    }
    var pack=canonicalGetPack_(ss,!!forceFresh);
    if(pack) AMS01_ROTATION_PACK_EXEC_CACHE=pack;
    try{Logger.log('[AMS01_ROTATION_PACK] '+JSON.stringify({build:AMS01_NOTIFICATION_ROTATION_EXEC_PERF_BUILD,forceFresh:!!forceFresh,source:'CANONICAL_ONCE',ms:Date.now()-t0,rows:pack&&pack.rows?pack.rows.length:null}));}catch(eLog){}
    return pack;
  };

  if(typeof NB_evaluateAuditorRotationAndQualification_==='function'){
    var canonicalEval_=NB_evaluateAuditorRotationAndQualification_;
    NB_evaluateAuditorRotationAndQualification_=function(data,briefing,scopes){
      var t0=Date.now();
      var out=canonicalEval_(data,briefing,scopes);
      try{Logger.log('[AMS01_NB_ROTATION_QUAL] '+JSON.stringify({build:AMS01_NOTIFICATION_ROTATION_EXEC_PERF_BUILD,scopes:(scopes||[]).length,ms:Date.now()-t0,rotation:out&&out.rotation?out.rotation.length:0,qualification:out&&out.qualification?out.qualification.length:0,sources:out&&out.sources?out.sources:[]}));}catch(eLog){}
      return out;
    };
  }
})();

function AMS01_NotificationRotationExecPerfStatus(){
  return {success:true,active:true,build:AMS01_NOTIFICATION_ROTATION_EXEC_PERF_BUILD,packCached:!!AMS01_ROTATION_PACK_EXEC_CACHE};
}
