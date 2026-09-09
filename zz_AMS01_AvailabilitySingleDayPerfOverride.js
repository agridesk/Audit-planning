/**
 * FILE: zz_AMS01_AvailabilitySingleDayPerfOverride.js
 * BUILD: AMS01_AVAIL_SINGLE_DAY_ZZ_20260909_R1
 *
 * Single-day Availability UI write optimization.
 *
 * Canonical AvailabilityService.toggleManualSoftDay remains the write owner.
 * That canonical path already clears the exact affected month and the Toolkit
 * month cache. It additionally calls AV_clearMonthCachesForAuditor_(), which
 * clears every month for the auditor although a one-day toggle can only change
 * one month. During this endpoint only, suppress that redundant broad clear.
 *
 * Safety:
 * - no Availability classification/write logic is duplicated or bypassed;
 * - exact affected month cache invalidation still runs;
 * - Toolkit affected-month invalidation still runs;
 * - availability summary invalidation still runs;
 * - other Availability endpoints retain the normal all-month invalidation.
 */
var AMS01_AVAIL_SINGLE_DAY_ZZ_BUILD='AMS01_AVAIL_SINGLE_DAY_ZZ_20260909_R1';

(function(){
  if(typeof AV5_toggleManualSoftDayStandalone!=='function') return;

  var canonicalToggle_=AV5_toggleManualSoftDayStandalone;

  AV5_toggleManualSoftDayStandalone=function(req){
    var t0=Date.now();
    var originalClearAll=(typeof AV_clearMonthCachesForAuditor_==='function')
      ? AV_clearMonthCachesForAuditor_
      : null;
    var suppressed=false;

    if(originalClearAll){
      AV_clearMonthCachesForAuditor_=function(auditorEmail){
        suppressed=true;
        return {success:true,skippedBroadInvalidation:true,auditorEmail:String(auditorEmail||'').trim().toLowerCase()};
      };
    }

    try{
      var out=canonicalToggle_.apply(this,arguments);
      try{
        if(out&&typeof out==='object'){
          out.ams01SingleDayPerf={
            build:AMS01_AVAIL_SINGLE_DAY_ZZ_BUILD,
            broadInvalidationSuppressed:suppressed,
            serverMs:Date.now()-t0
          };
        }
      }catch(eMeta){}
      return out;
    }finally{
      if(originalClearAll) AV_clearMonthCachesForAuditor_=originalClearAll;
    }
  };
})();

function AMS01_AvailabilitySingleDayPerfStatus(){
  return {success:true,active:true,build:AMS01_AVAIL_SINGLE_DAY_ZZ_BUILD};
}
