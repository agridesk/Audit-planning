/**
 * FILE: AMS01_PromotionCheck.js
 * BUILD: AMS01_PROMOTION_CHECK_20260907_R1
 * PURPOSE:
 *   Read-only verification of promoted AMS-01 hot paths after DEV sync.
 */

function AMS01_RunPromotionCheck() {
  var auditId = 'AUD_CultiusItxartSCP_HQ_1777531729225_18';
  var monthKey = '2026-09';
  var auditorEmail = 'david@agriqa.es';
  var out = {
    build:'AMS01_PROMOTION_CHECK_20260907_R1',
    generatedAt:new Date().toISOString(),
    runtimeEnv:(typeof AMS01_env_ === 'function' ? AMS01_env_() : 'UNKNOWN'),
    probes:[]
  };

  function probe_(label, fn) {
    var t0 = Date.now();
    var rec = { label:label, ok:false, wallMs:0, result:null, error:'' };
    try {
      var r = fn();
      rec.wallMs = Date.now() - t0;
      rec.ok = !(r && r.success === false);
      rec.result = r;
    } catch (e) {
      rec.wallMs = Date.now() - t0;
      rec.error = String(e && e.message ? e.message : e);
    }
    out.probes.push(rec);
  }

  probe_('Promoted manager Toolkit bundle', function(){
    return getToolkitOpenBundleV5_d13(auditId, monthKey, {
      role:'MANAGER',
      withCalendar:false,
      forceFresh:true
    });
  });

  probe_('Qualification-only candidate', function(){
    return AMS01_GetQualifiedAuditorsFastCandidate(auditId);
  });

  probe_('Canonical-lite availability candidate', function(){
    return AMS01_GetAvailabilityMonthCandidate(auditorEmail, monthKey);
  });

  var compact = out.probes.map(function(p){
    var r = p.result || {};
    return {
      label:p.label,
      ok:p.ok,
      wallMs:p.wallMs,
      bundleStage:r.__bundleStage || '',
      bundleServerMs:r.__bundleServerMs || null,
      openServerMs:r.__serverMs || null,
      auditorBundleServerMs:r.auditorsBundle && r.auditorsBundle.__serverMs != null ? r.auditorsBundle.__serverMs : null,
      qualificationOnly:!!(r.auditorsBundle && r.auditorsBundle.auditorEligibilityMeta && r.auditorsBundle.auditorEligibilityMeta.ams01PromotedFirstPaint),
      rows:Array.isArray(r.auditors) ? r.auditors.length : (r.meta && r.meta.rowsMatched != null ? r.meta.rowsMatched : null),
      meta:r.meta || null,
      error:p.error || ''
    };
  });

  var result = {
    build:out.build,
    generatedAt:out.generatedAt,
    runtimeEnv:out.runtimeEnv,
    probes:compact
  };
  Logger.log('[AMS01_PROMOTION_CHECK] ' + JSON.stringify(result));
  return result;
}
