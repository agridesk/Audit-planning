/**
 * FILE: AMS01_AvailabilityCandidate.js
 * BUILD: AMS01_AVAILABILITY_CANDIDATE_20260907_R2
 * PURPOSE:
 *   Read-only AMS-01 candidate for visible-month availability.
 *   Reuses canonical AvailabilityService.getAuditorAvailabilityLite and then
 *   applies the existing Toolkit Planning JSON overlay.
 *
 * SAFETY:
 *   - No business-data writes.
 *   - No cache writes by this candidate.
 *   - No canonical endpoint replacement.
 *   - No second availability model.
 */

var AMS01_AVAILABILITY_CANDIDATE_BUILD = 'AMS01_AVAILABILITY_CANDIDATE_20260907_R2';

function AMS01_GetAvailabilityMonthCandidate(auditorEmail, monthKey) {
  var t0 = Date.now();
  auditorEmail = _mp_tdm_normEmail_(auditorEmail);
  monthKey = _mp_tdm_clean_(monthKey);

  if (!auditorEmail) return { success:false, message:'Missing auditorEmail' };
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { success:false, message:'Invalid monthKey: ' + monthKey };
  if (typeof v5_getAuditorAvailabilityLite !== 'function') {
    return { success:false, message:'Missing canonical v5_getAuditorAvailabilityLite' };
  }

  var startISO = monthKey + '-01';
  var startD = _mp_parseISODate_(startISO);
  var endISO = _mp_formatISODate_(new Date(startD.getFullYear(), startD.getMonth() + 1, 0));

  var tCanonical = Date.now();
  var base = v5_getAuditorAvailabilityLite(auditorEmail, startISO, endISO, {
    forceFresh:true,
    bypassCache:true
  });
  var canonicalMs = Date.now() - tCanonical;

  if (!base || base.success === false) return base || { success:false, message:'Canonical availability returned no result' };

  base.auditorEmail = auditorEmail;
  base.auditorKey = auditorEmail;
  base.monthKey = monthKey;
  base.rangeStart = startISO;
  base.rangeEnd = endISO;
  base.meta = base.meta || {};
  base.meta.ams01CanonicalAvailabilityMs = canonicalMs;
  base.meta.ams01CandidateBuild = AMS01_AVAILABILITY_CANDIDATE_BUILD;
  base.meta.sourceMode = 'CANONICAL_AVAILABILITY_SERVICE_LITE';

  var tOverlay = Date.now();
  var overlayed = _mp_tdm_addPlanningJsonOverlay_(base, auditorEmail, monthKey, { failOnOverlayError:false });
  var overlayMs = Date.now() - tOverlay;

  overlayed.meta = overlayed.meta || {};
  overlayed.meta.build = AMS01_AVAILABILITY_CANDIDATE_BUILD;
  overlayed.meta.serverMs = Date.now() - t0;
  overlayed.meta.cacheHit = false;
  overlayed.meta.ams01CanonicalAvailabilityMs = canonicalMs;
  overlayed.meta.ams01OverlayWallMs = overlayMs;
  overlayed.meta.ams01CandidateBuild = AMS01_AVAILABILITY_CANDIDATE_BUILD;
  return overlayed;
}

function AMS01_NormalizeAvailabilityDaysForCompare_(days) {
  days = days || {};
  var out = {};
  Object.keys(days).sort().forEach(function(iso) {
    var day = days[iso] || {};
    var arr = Array.isArray(day.intervals) ? day.intervals : [];
    var normalized = [];
    for (var i = 0; i < arr.length; i++) {
      var iv = arr[i] || {};
      normalized.push({
        start:_mp_tdm_normTime_(iv.startTime || iv.start || ''),
        end:_mp_tdm_normTime_(iv.endTime || iv.end || ''),
        hard:iv.hard !== false,
        auditId:String(iv.auditId || '').trim()
      });
    }
    normalized.sort(function(a,b){
      var ka = [a.start,a.end,a.hard?'H':'S',a.auditId].join('|');
      var kb = [b.start,b.end,b.hard?'H':'S',b.auditId].join('|');
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });
    if (normalized.length) out[iso] = normalized;
  });
  return out;
}

function AMS01_CompareAvailabilityOldVsCandidate() {
  var auditorEmail = 'david@agriqa.es';
  var monthKey = '2026-09';

  var tOld = Date.now();
  var oldRes = getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, {
    forceFresh:true,
    bypassCache:true,
    verifyFreshness:false,
    failOnOverlayError:false
  });
  var oldMs = Date.now() - tOld;

  try {
    if (typeof AvailabilityService !== 'undefined' && AvailabilityService && typeof AvailabilityService.resetExecCache === 'function') {
      AvailabilityService.resetExecCache();
    }
  } catch (eReset) {}

  var tNew = Date.now();
  var newRes = AMS01_GetAvailabilityMonthCandidate(auditorEmail, monthKey);
  var newMs = Date.now() - tNew;

  var oldNorm = AMS01_NormalizeAvailabilityDaysForCompare_(oldRes && oldRes.days);
  var newNorm = AMS01_NormalizeAvailabilityDaysForCompare_(newRes && newRes.days);

  var result = {
    build:AMS01_AVAILABILITY_CANDIDATE_BUILD,
    auditorEmail:auditorEmail,
    monthKey:monthKey,
    oldMs:oldMs,
    candidateMs:newMs,
    improvementMs:oldMs-newMs,
    improvementPct:oldMs > 0 ? Math.round(((oldMs-newMs)/oldMs)*1000)/10 : 0,
    semanticOutputEqual:JSON.stringify(oldNorm) === JSON.stringify(newNorm),
    oldDayCount:Object.keys(oldNorm).length,
    candidateDayCount:Object.keys(newNorm).length,
    oldMeta:oldRes && oldRes.meta ? oldRes.meta : null,
    candidateMeta:newRes && newRes.meta ? newRes.meta : null
  };
  Logger.log('[AMS01_AVAIL_COMPARE] ' + JSON.stringify(result));
  return result;
}
