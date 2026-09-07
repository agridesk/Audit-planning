/**
 * FILE: AMS01_PromotionCheck.js
 * BUILD: AMS01_PROMOTION_CHECK_20260907_R5
 * PURPOSE:
 *   Read-only verification of promoted/candidate AMS-01 hot paths after DEV sync.
 */

function AMS01_RunPromotionCheck() {
  var auditId = 'AUD_CultiusItxartSCP_HQ_1777531729225_18';
  var monthKey = '2026-09';
  var auditorEmail = 'david@agriqa.es';
  var out = {
    build:'AMS01_PROMOTION_CHECK_20260907_R5',
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

  probe_('Auditor perf override status', function(){
    return (typeof AMS01_AuditorPerfOverrideStatus === 'function')
      ? AMS01_AuditorPerfOverrideStatus()
      : { success:false, active:false, message:'AMS01_AuditorPerfOverrideStatus missing' };
  });

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

  probe_('Auditor Portal planning-summary candidate', function(){
    return AMS01_RunPlanningSummaryCandidate();
  });

  probe_('Auditor Portal active grid COLD after timezone override', function(){
    try { if (typeof CompaniesIndex_ClearCache === 'function') CompaniesIndex_ClearCache(); } catch (e0) {}
    try { if (typeof AuditorV5B_ClearCache === 'function') AuditorV5B_ClearCache({auditorEmail:auditorEmail, view:'active'}); } catch (e1) {}
    return AuditorV5_GetAuditorGrid_U20409({ auditorEmail:auditorEmail, view:'active', noCache:true, diag:true });
  });

  probe_('Auditor Portal active grid WARM after timezone override', function(){
    return AuditorV5_GetAuditorGrid_U20409({ auditorEmail:auditorEmail, view:'active', noCache:true, diag:true });
  });

  var compact = out.probes.map(function(p){
    var r = p.result || {};
    return {
      label:p.label,
      ok:p.ok,
      wallMs:p.wallMs,
      active:r.active != null ? !!r.active : null,
      overrideBuild:r.build || '',
      resolvedTimeZone:r.resolvedTimeZone || '',
      bundleStage:r.__bundleStage || '',
      bundleServerMs:r.__bundleServerMs || null,
      openServerMs:r.__serverMs || null,
      liteManager:!!r.__ams01LiteContext,
      auditorBundleServerMs:r.auditorsBundle && r.auditorsBundle.__serverMs != null ? r.auditorsBundle.__serverMs : null,
      qualificationOnly:!!(r.auditorsBundle && r.auditorsBundle.auditorEligibilityMeta && r.auditorsBundle.auditorEligibilityMeta.ams01PromotedFirstPaint),
      rows:Array.isArray(r.auditors) ? r.auditors.length : (Array.isArray(r.rows) ? r.rows.length : (r.meta && r.meta.rowsMatched != null ? r.meta.rowsMatched : null)),
      semanticEqual:r.semanticEqual != null ? r.semanticEqual : null,
      oldMs:r.oldMs != null ? r.oldMs : null,
      candidateMs:r.candidateMs != null ? r.candidateMs : null,
      checked:r.checked != null ? r.checked : null,
      perf:r.perf || null,
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
