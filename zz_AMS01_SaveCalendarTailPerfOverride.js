/**
 * FILE: zz_AMS01_SaveCalendarTailPerfOverride.js
 * BUILD: AMS01_SAVE_CALENDAR_TAIL_PERF_ZZ_20260908_R1
 * DEV-only late-load override.
 *
 * AvailabilityService.writeBack is the canonical availability writer and already
 * invalidates the affected Toolkit month cache as part of the write transaction.
 * saveManagerPlanning subsequently calls _mp_calInvalidateForAuditLite_ for the
 * same auditor/months. That second invalidation is redundant on the successful
 * PLAN path and measured ~1.9s in a natural save.
 *
 * This override suppresses only that duplicate cache-only tail invalidation.
 * It does not change availability validation, availability persistence, status,
 * Planning JSON, or the canonical invalidation performed by AvailabilityService.
 */
var AMS01_SAVE_CALENDAR_TAIL_PERF_ZZ_BUILD='AMS01_SAVE_CALENDAR_TAIL_PERF_ZZ_20260908_R1';

(function(){
  if(typeof _mp_calInvalidateForAuditLite_!=='function') return;
  var canonical_=_mp_calInvalidateForAuditLite_;
  _mp_calInvalidateForAuditLite_=function(auditId,auditorEmail,blocks){
    try{
      Logger.log('[AMS01_SAVE_CAL_TAIL_SKIP] '+JSON.stringify({
        build:AMS01_SAVE_CALENDAR_TAIL_PERF_ZZ_BUILD,
        auditId:String(auditId||'').trim(),
        auditorEmail:String(auditorEmail||'').trim(),
        blocks:Array.isArray(blocks)?blocks.length:0,
        reason:'AvailabilityService.writeBack already invalidated affected Toolkit month cache'
      }));
    }catch(eLog){}
    return {success:true,skipped:true,duplicate:true,build:AMS01_SAVE_CALENDAR_TAIL_PERF_ZZ_BUILD};
  };
  try{this.__AMS01_SAVE_CALENDAR_TAIL_CANONICAL=canonical_;}catch(eStore){}
})();

function AMS01_SaveCalendarTailPerfStatus(){
  return {success:true,active:true,build:AMS01_SAVE_CALENDAR_TAIL_PERF_ZZ_BUILD};
}
