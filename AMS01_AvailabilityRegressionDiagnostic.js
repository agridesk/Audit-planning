/**
 * FILE: AMS01_AvailabilityRegressionDiagnostic.js
 * BUILD: AMS01_AVAILABILITY_REGRESSION_DIAG_20260908_R1
 * PURPOSE:
 *   Read-only regression comparison between the current promoted lite route
 *   and the untouched canonical raw availability representation.
 *
 * SAFE:
 *   - no writes
 *   - no status/planning changes
 *   - compares logical day/interval output only
 */
var AMS01_AVAILABILITY_REGRESSION_DIAG_BUILD='AMS01_AVAILABILITY_REGRESSION_DIAG_20260908_R1';

function AMS01_RunAvailabilityRegressionDiagnostic(){
  var auditor='david@agriqa.es';
  var start='2026-09-01';
  var end='2026-09-30';

  var tRaw=Date.now();
  var raw=AvailabilityService.getAuditorAvailabilityRaw(auditor,start,end,{});
  var rawMs=Date.now()-tRaw;

  var tLite=Date.now();
  var lite=AvailabilityService.getAuditorAvailabilityLite(auditor,start,end,{});
  var liteMs=Date.now()-tLite;

  function stableDay_(d){
    d=d||{};
    var meta=d.meta||{};
    var intervals=(d.intervals||[]).map(function(x){
      x=x||{};
      return {
        startTime:String(x.startTime||''),
        endTime:String(x.endTime||''),
        reason:String(x.reason||''),
        state:String(x.state||''),
        kind:String(x.kind||''),
        hard:x.hard===false?false:true,
        auditId:String(x.auditId||''),
        slot:String(x.slot||'')
      };
    }).sort(function(a,b){
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });
    return {
      intervals:intervals,
      meta:{
        availableCell:String(meta.availableCell||''),
        plannedAuditIds:(meta.plannedAuditIds||[]).map(String).sort(),
        auditId1:String(meta.auditId1||''),
        auditId2:String(meta.auditId2||''),
        slot1Start:String(meta.slot1Start||''),
        slot1End:String(meta.slot1End||''),
        slot2Start:String(meta.slot2Start||''),
        slot2End:String(meta.slot2End||''),
        status1:String(meta.status1||''),
        status2:String(meta.status2||''),
        softFullDay:!!meta.softFullDay
      }
    };
  }

  function stableDays_(days){
    var out={};
    Object.keys(days||{}).sort().forEach(function(k){out[k]=stableDay_(days[k]);});
    return out;
  }

  var a=stableDays_(raw&&raw.days);
  var b=stableDays_(lite&&lite.days);
  var allKeys={};
  Object.keys(a).forEach(function(k){allKeys[k]=true;});
  Object.keys(b).forEach(function(k){allKeys[k]=true;});
  var diffs=[];
  Object.keys(allKeys).sort().forEach(function(k){
    var sa=JSON.stringify(a[k]||null);
    var sb=JSON.stringify(b[k]||null);
    if(sa!==sb) diffs.push({date:k,raw:a[k]||null,lite:b[k]||null});
  });

  var out={
    build:AMS01_AVAILABILITY_REGRESSION_DIAG_BUILD,
    auditor:auditor,
    rangeStart:start,
    rangeEnd:end,
    rawMs:rawMs,
    liteMs:liteMs,
    rawDays:Object.keys(a).length,
    liteDays:Object.keys(b).length,
    equal:diffs.length===0,
    diffCount:diffs.length,
    diffs:diffs.slice(0,20),
    liteMeta:lite&&lite.meta?lite.meta:{},
    rawMeta:raw&&raw.meta?raw.meta:{}
  };
  Logger.log('[AMS01_AVAIL_REGRESSION] '+JSON.stringify(out));
  return out;
}
