// FILE: ToolkitEligibilityCacheWarmer_d1_20260517.js
// BUILD: ToolkitEligibilityCacheWarmer_d1_20260517
//
// Purpose:
//   d36 warmer helper for TEC d3.
//   Additive only. Does not modify TEC d3, EligibilityService d15, or Toolkit_Eligibility d19.
//
// Contract:
//   - Reads audit row/context.
//   - Computes the exact TEC fingerprint context.
//   - Calls _mp_getEligibleAuditorsList_ as canonical compute owner.
//   - Writes projection through elig_cacheWrite_(ctx, result).
//   - Does NOT call getToolkitAuditorsV5.
//   - Does NOT write planning/status/availability.

var TOOLKIT_ELIG_CACHE_WARMER_BUILD = 'ToolkitEligibilityCacheWarmer_d1_20260517';

function TECW_findHeaderIdxCI_(hdr, candidates) {
  hdr = hdr || [];
  candidates = candidates || [];
  var lc = hdr.map(function(x) { return String(x || '').trim().toLowerCase(); });
  for (var j = 0; j < candidates.length; j++) {
    var t = String(candidates[j] || '').trim().toLowerCase();
    var ix = lc.indexOf(t);
    if (ix !== -1) return ix;
  }
  return -1;
}

function TECW_readAuditContext_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) throw new Error('ToolkitEligibilityCache_WarmOneD35: missing auditId');

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (typeof TK3S_readAuditContext_R24_ === 'function') {
    var ctx = TK3S_readAuditContext_R24_(auditId);
    if (ctx && ctx.row && ctx.hdr) return ctx;
  }

  var pack = (typeof __mp_getSheetDataCached_ === 'function')
    ? __mp_getSheetDataCached_(ss, 'Audit planning')
    : null;

  if (!pack || !pack.sh) {
    var sh = ss.getSheetByName('Audit planning');
    if (!sh) throw new Error("ToolkitEligibilityCache_WarmOneD35: missing sheet 'Audit planning'");
    var data = sh.getDataRange().getValues();
    pack = { sh: sh, data: data, hdr: data[0] || [] };
  }

  var data2 = pack.data || [];
  var hdr = pack.hdr || data2[0] || [];
  var colAI = TECW_findHeaderIdxCI_(hdr, ['Audit ID','Audit_ID','AuditId','Audit Id']);
  if (colAI < 0) throw new Error("ToolkitEligibilityCache_WarmOneD35: missing 'Audit ID' column");

  var row = null;
  for (var r = 1; r < data2.length; r++) {
    if (String(data2[r][colAI] || '').trim() === auditId) {
      row = data2[r];
      break;
    }
  }
  if (!row) throw new Error('ToolkitEligibilityCache_WarmOneD35: audit not found: ' + auditId);

  var scopesRes = (typeof v5_extractScopesForAuditPlanningRow_ === 'function')
    ? v5_extractScopesForAuditPlanningRow_(hdr, row)
    : { scopes: [], scopesText: '' };

  var requiredScopes = (scopesRes && scopesRes.scopes ? scopesRes.scopes : []).map(function(s) {
    return String((s && (s.name || s.code || s.slot)) || '').trim();
  }).filter(function(x) { return !!x; });

  var cPre = TECW_findHeaderIdxCI_(hdr, ['Preassigned auditor','Pre assigned auditor','Pre-assigned auditor','Preassigned Auditor','Preassigned']);
  var preassigned = cPre >= 0 ? String(row[cPre] || '').trim() : '';

  return {
    ss: ss,
    auditId: auditId,
    hdr: hdr,
    row: row,
    requiredScopes: requiredScopes,
    scopesRes: scopesRes || { scopes: [], scopesText: '' },
    preassigned: preassigned
  };
}

function ToolkitEligibilityCache_WarmOneD35(auditId) {
  var t0 = Date.now();
  auditId = String(auditId || '').trim();

  try {
    if (!auditId) throw new Error('Missing auditId');
    if (typeof _mp_getEligibleAuditorsList_ !== 'function') {
      throw new Error('Missing _mp_getEligibleAuditorsList_');
    }
    if (typeof elig_cacheWrite_ !== 'function') {
      throw new Error('Missing elig_cacheWrite_');
    }
    if (typeof elig_cacheRead_ !== 'function') {
      throw new Error('Missing elig_cacheRead_');
    }
    if (typeof _tec_sha1_ !== 'function') {
      throw new Error('Missing _tec_sha1_');
    }
    if (typeof _tec_auditorsSheetQualificationHash_ !== 'function') {
      throw new Error('Missing _tec_auditorsSheetQualificationHash_');
    }

    var ctx = TECW_readAuditContext_(auditId);
    var ss = ctx.ss || SpreadsheetApp.getActiveSpreadsheet();
    var required = (ctx.requiredScopes || []).slice();

    var cacheCtx = {
      auditId: auditId,
      scopeHash: _tec_sha1_(required.slice().sort().join('|')),
      auditorBuildHash: _tec_auditorsSheetQualificationHash_(ss),
      preassignedHash: _tec_sha1_(String(ctx.preassigned || '').trim().toLowerCase())
    };

    var before = elig_cacheRead_(cacheCtx);
    if (before && Array.isArray(before.auditors)) {
      Logger.log('[D36_WARM_TEC] aid=' + auditId + ' ms=' + (Date.now() - t0) + ' cache=HIT auditors=' + before.auditors.length);
      return {
        success: true,
        build: TOOLKIT_ELIG_CACHE_WARMER_BUILD,
        auditId: auditId,
        cache: 'HIT',
        auditors: before.auditors.length,
        ms: Date.now() - t0
      };
    }

    var projection = _mp_getEligibleAuditorsList_(
      ss,
      required,
      ctx.preassigned || '',
      ctx.hdr || [],
      ctx.row || []
    );

    var wrote = elig_cacheWrite_(cacheCtx, projection);
    var after = elig_cacheRead_(cacheCtx);

    Logger.log('[D36_WARM_TEC] aid=' + auditId + ' ms=' + (Date.now() - t0) + ' cache=WRITE wrote=' + wrote + ' hitAfter=' + !!after + ' auditors=' + ((after && after.auditors) ? after.auditors.length : 0));

    return {
      success: true,
      build: TOOLKIT_ELIG_CACHE_WARMER_BUILD,
      auditId: auditId,
      cache: 'WRITE',
      wrote: !!wrote,
      hitAfter: !!after,
      auditors: (after && after.auditors) ? after.auditors.length : ((projection && projection.auditors) ? projection.auditors.length : 0),
      ms: Date.now() - t0
    };

  } catch (e) {
    Logger.log('[D36_WARM_TEC] aid=' + auditId + ' ms=' + (Date.now() - t0) + ' error=' + String(e && e.message ? e.message : e));
    return {
      success: false,
      build: TOOLKIT_ELIG_CACHE_WARMER_BUILD,
      auditId: auditId,
      message: String(e && e.message ? e.message : e),
      ms: Date.now() - t0
    };
  }
}

function TEST_D36_WARM_ONE_THROW() {
  var auditId = 'AUD_AlmendretaPlantasyCult_HQ_1777555342222_107';
  var first = ToolkitEligibilityCache_WarmOneD35(auditId);
  var second = ToolkitEligibilityCache_WarmOneD35(auditId);
  throw new Error(JSON.stringify({ first: first, second: second }, null, 2));
}

function TEST_WARM_ORNAMENTALES() {
  return ToolkitEligibilityCache_WarmOneD35(
    'AUD_OrnamentalesLumbrera_HQ_1777531729415_56'
  );
}

function TEST_WARM_ACCEPTED_DELTA() {
  return ToolkitEligibilityCache_WarmOneD35(
    'AUD_TEST_AcceptedDelta_HQ_1777979469906_101'
  );
}

function TEST_D38_BARBERETBLANC_THROW() {

  var auditorEmail = 'leen@agriqa.es';
  var monthKey = '2026-10';

  var res = getToolkitAvailabilityMonthDirectV5(
    auditorEmail,
    monthKey,
    {
      reason: 'd38-test-barberet',
      auditId: 'AUD_BarberetBlanc_HQ_1777555351956_117'
    }
  );

  throw new Error(JSON.stringify({
    ok: !!res,
    auditorEmail: auditorEmail,
    monthKey: monthKey,
    days: (res && res.days ? Object.keys(res.days).length : 0)
  }, null, 2));
}