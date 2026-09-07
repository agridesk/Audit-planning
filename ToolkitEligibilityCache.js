// FILE: ToolkitEligibilityCache.js
// BUILD: ToolkitEligibilityCache_d3_CANONICAL_TEC_FIX_PLUS_TIER3_20260516
//
// Purpose:
//   Canonical Toolkit Eligibility Cache (TEC) projection layer.
//   Cache sits ABOVE _mp_getEligibleAuditorsList_.
//   _mp_getEligibleAuditorsList_ remains the only canonical compute owner.
//
// Contract:
//   - Tier 1: execution map
//   - Tier 2: ScriptCache, TTL 1500s
//   - Tier 3: Eligibility_Cache sheet via EligibilityService d15 namespace
//   - No build-string invalidation for TEC keys
//   - Fingerprint mismatch invalidates automatically
//   - Cache accelerates only; cache never owns truth.

var TOOLKIT_ELIG_CACHE_BUILD = 'ToolkitEligibilityCache_d3_CANONICAL_TEC_FIX_PLUS_TIER3_20260516';
var TOOLKIT_ELIG_CACHE_VERSION = 'TEC_V3_20260516';
var TOOLKIT_ELIG_CACHE_TTL_SECONDS = 1500;
var __TEC_EXEC_CACHE__ = {};

function _tec_norm_(v) {
  return String(v == null ? '' : v).trim();
}

function _tec_normLower_(v) {
  return _tec_norm_(v).toLowerCase();
}

function _tec_sha1_(input) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    String(input == null ? '' : input)
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    hex += h.length === 1 ? ('0' + h) : h;
  }
  return hex;
}

function _tec_cloneJson_(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return null;
  }
}

function _tec_nowIso_() {
  try {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Madrid', "yyyy-MM-dd'T'HH:mm:ss");
  } catch (e) {
    return String(new Date());
  }
}

function _tec_findHeaderIdxCI_(hdr, candidates) {
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

function _tec_isYes_(v) {
  var s = _tec_normLower_(v);
  return s === 'x' || s === 'yes' || s === 'true' || s === '1' || s === 'ja';
}

/**
 * Fingerprint helper for Auditors sheet.
 *
 * v3 deliberately hashes only active auditor identity + role + all qualification-like cells.
 * It is deterministic and does not use deploy/build strings.
 */
function _tec_auditorsSheetQualificationHash_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Auditors');
  if (!sh) return 'NO_AUDITORS_SHEET';

  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return 'EMPTY_AUDITORS_SHEET';

  var hdr = data[0] || [];
  var idxName = _tec_findHeaderIdxCI_(hdr, ['Name', 'Auditor', 'Auditor name']);
  var idxEmail = _tec_findHeaderIdxCI_(hdr, ['E-mail', 'Email', 'E-mail address', 'Mail']);
  var idxActive = _tec_findHeaderIdxCI_(hdr, ['Active', 'Is active']);
  var idxRole = _tec_findHeaderIdxCI_(hdr, ['Role', 'Function']);

  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r] || [];
    if (idxActive >= 0 && !_tec_isYes_(row[idxActive])) continue;

    var parts = [];
    parts.push(idxName >= 0 ? _tec_normLower_(row[idxName]) : '');
    parts.push(idxEmail >= 0 ? _tec_normLower_(row[idxEmail]) : '');
    parts.push(idxActive >= 0 ? _tec_normLower_(row[idxActive]) : '');
    parts.push(idxRole >= 0 ? _tec_normLower_(row[idxRole]) : '');

    for (var c = 0; c < hdr.length; c++) {
      var h = _tec_norm_(hdr[c]);
      if (!h) continue;
      if (c === idxName || c === idxEmail || c === idxActive || c === idxRole) continue;
      parts.push(h + '=' + _tec_norm_(row[c]));
    }

    rows.push(parts.join('\u001f'));
  }

  rows.sort();
  return _tec_sha1_(rows.join('\u001e'));
}

function _tec_scopeHash_(requiredScopes) {
  var arr = (requiredScopes || []).map(function(s) {
    return _tec_normLower_(s);
  }).filter(function(s) {
    return !!s;
  });
  arr.sort();
  return _tec_sha1_(arr.join('|'));
}

function _tec_preassignedHash_(preassignedName) {
  return _tec_sha1_(_tec_normLower_(preassignedName));
}

/**
 * Builds canonical TEC context from caller-provided values.
 * Toolkit_Eligibility should normally pass all hashes already.
 */
function elig_cacheNormalizeCtx_(ctx) {
  ctx = ctx || {};
  if (typeof ctx === 'string') ctx = { auditId: ctx };

  var auditId = _tec_norm_(ctx.auditId || ctx.auditID || ctx.id);
  var requiredScopes = ctx.requiredScopes || ctx.scopes || [];
  if (!Array.isArray(requiredScopes)) requiredScopes = String(requiredScopes || '').split(',');

  var scopeHash = _tec_norm_(ctx.scopeHash);
  if (!scopeHash) scopeHash = _tec_scopeHash_(requiredScopes);

  var auditorBuildHash = _tec_norm_(ctx.auditorBuildHash || ctx.auditorsHash || ctx.auditorSheetHash);
  if (!auditorBuildHash) {
    try {
      auditorBuildHash = _tec_auditorsSheetQualificationHash_(SpreadsheetApp.getActiveSpreadsheet());
    } catch (eAudHash) {
      auditorBuildHash = 'AUDITOR_HASH_ERROR';
    }
  }

  var preassignedHash = _tec_norm_(ctx.preassignedHash);
  if (!preassignedHash) preassignedHash = _tec_preassignedHash_(ctx.preassigned || ctx.preassignedName || ctx.preassignedAuditor || '');

  return {
    auditId: auditId,
    scopeHash: scopeHash,
    auditorBuildHash: auditorBuildHash,
    preassignedHash: preassignedHash
  };
}

function elig_cacheKey_(ctx) {
  ctx = elig_cacheNormalizeCtx_(ctx);
  return [
    TOOLKIT_ELIG_CACHE_VERSION,
    'AUD',
    ctx.auditId,
    'SC',
    ctx.scopeHash,
    'AUD',
    ctx.auditorBuildHash,
    'PRE',
    ctx.preassignedHash
  ].join('|');
}

function _tec_payloadForStore_(payload, key) {
  var clone = _tec_cloneJson_(payload || {});
  if (!clone || typeof clone !== 'object') return null;
  if (clone.success === false) return null;
  clone.meta = clone.meta || {};
  clone.meta.__tecFingerprint = key;
  clone.meta.__tecCacheBuild = TOOLKIT_ELIG_CACHE_BUILD;
  clone.meta.__tecCachedAt = clone.meta.__tecCachedAt || _tec_nowIso_();
  return clone;
}

function _tec_promoteToExecAndScript_(key, payload) {
  if (!key || !payload) return false;

  __TEC_EXEC_CACHE__[key] = payload;

  try {
    var raw = JSON.stringify(payload);
    if (raw.length < 95000) {
      CacheService.getScriptCache().put(key, raw, TOOLKIT_ELIG_CACHE_TTL_SECONDS);
    }
  } catch (e) {}

  return true;
}

/**
 * Primary TEC read.
 *
 * IMPORTANT bug fix:
 * old d3 draft used key.indexOf('AUD|') >= 0, which rejects every valid key.
 * This version validates only the TEC prefix.
 */
function elig_cacheGet_(ctx) {
  ctx = elig_cacheNormalizeCtx_(ctx);
  var key = elig_cacheKey_(ctx);

  Logger.log('[D35_TEC_GET] ' + JSON.stringify({
    auditId: ctx.auditId || '',
    hasScopeHash: !!ctx.scopeHash,
    hasAuditorHash: !!ctx.auditorBuildHash,
    hasPreassignedHash: !!ctx.preassignedHash
  }));

  if (!key || key.indexOf(TOOLKIT_ELIG_CACHE_VERSION + '|') !== 0) {
    return null;
  }

  // Tier 1 — execution map
  if (__TEC_EXEC_CACHE__.hasOwnProperty(key)) {
    Logger.log('[D35_TEC_HIT] ' + JSON.stringify({ tier: 'exec', auditId: ctx.auditId }));
    return __TEC_EXEC_CACHE__[key];
  }

  // Tier 2 — ScriptCache
  try {
    var raw = CacheService.getScriptCache().get(key);
    if (raw) {
      var obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        __TEC_EXEC_CACHE__[key] = obj;
        Logger.log('[D35_TEC_HIT] ' + JSON.stringify({ tier: 'script', auditId: ctx.auditId }));
        return obj;
      }
    }
  } catch (eScript) {}

  // Tier 3 — persistent Eligibility_Cache via EligibilityService d15 namespace
  try {
    if (typeof eligService_cacheRead_ === 'function' && ctx.auditId) {
      var sheetHit = eligService_cacheRead_(ctx.auditId);
      if (sheetHit && !sheetHit.stale && sheetHit.meta && sheetHit.meta.__tecFingerprint === key) {
        _tec_promoteToExecAndScript_(key, sheetHit);
        Logger.log('[D35_TEC_HIT] ' + JSON.stringify({ tier: 'sheet', auditId: ctx.auditId }));
        return sheetHit;
      }

      if (sheetHit && sheetHit.meta && sheetHit.meta.__tecFingerprint && sheetHit.meta.__tecFingerprint !== key) {
        Logger.log('[D35_TEC_MISS_FP_CHANGED] ' + JSON.stringify({
          auditId: ctx.auditId,
          fpChanged: 'AUDITORS'
        }));
        return null;
      }
    }
  } catch (eSheet) {
    Logger.log('[D35_TEC_SHEET_READ_ERROR] ' + String(eSheet && eSheet.message ? eSheet.message : eSheet));
  }

  Logger.log('[D35_TEC_MISS_FIRSTOPEN] ' + JSON.stringify({ auditId: ctx.auditId }));
  return null;
}

// Alias requested in some d35 notes. TEC is the owner now because EligibilityService was renamed.
function elig_cacheRead_(ctx) {
  return elig_cacheGet_(ctx);
}

/**
 * Primary TEC write.
 * Mirrors to script cache and persistent Eligibility_Cache.
 */
function elig_cachePut_(ctx, payload) {
  ctx = elig_cacheNormalizeCtx_(ctx);
  if (!ctx.auditId || !payload) return false;

  var key = elig_cacheKey_(ctx);
  var safePayload = _tec_payloadForStore_(payload, key);
  if (!safePayload) return false;

  _tec_promoteToExecAndScript_(key, safePayload);

  try {
    if (typeof eligService_cacheWrite_ === 'function') {
      eligService_cacheWrite_(ctx.auditId, safePayload);
    }
  } catch (eSheet) {
    Logger.log('[D35_TEC_SHEET_WRITE_ERROR] ' + String(eSheet && eSheet.message ? eSheet.message : eSheet));
  }

  return true;
}

// Alias requested in some d35 notes.
function elig_cacheWrite_(ctx, payload) {
  return elig_cachePut_(ctx, payload);
}

function elig_cacheInvalidate_(ctx) {
  ctx = elig_cacheNormalizeCtx_(ctx);
  var key = elig_cacheKey_(ctx);

  try { delete __TEC_EXEC_CACHE__[key]; } catch (eExec) {}
  try { CacheService.getScriptCache().remove(key); } catch (eScript) {}

  try {
    if (typeof eligService_cacheInvalidate_ === 'function' && ctx.auditId) {
      eligService_cacheInvalidate_({ auditId: ctx.auditId });
    }
  } catch (eSheet) {}

  return true;
}

function TEST_TOOLKIT_ELIGIBILITY_CACHE_LOADED() {
  var out = {
    success: true,
    build: TOOLKIT_ELIG_CACHE_BUILD,
    version: TOOLKIT_ELIG_CACHE_VERSION,
    functions: {
      elig_cacheGet_: typeof elig_cacheGet_,
      elig_cacheRead_: typeof elig_cacheRead_,
      elig_cachePut_: typeof elig_cachePut_,
      elig_cacheWrite_: typeof elig_cacheWrite_,
      elig_cacheInvalidate_: typeof elig_cacheInvalidate_,
      eligService_cacheRead_: typeof eligService_cacheRead_,
      eligService_cacheWrite_: typeof eligService_cacheWrite_,
      eligService_cacheInvalidate_: typeof eligService_cacheInvalidate_
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function TEST_D35_RUNTIME() {
  return {
    TEC_BUILD:
      (typeof TOOLKIT_ELIG_CACHE_BUILD !== 'undefined')
        ? TOOLKIT_ELIG_CACHE_BUILD
        : 'MISSING',

    TEC_VERSION:
      (typeof TOOLKIT_ELIG_CACHE_VERSION !== 'undefined')
        ? TOOLKIT_ELIG_CACHE_VERSION
        : 'MISSING',

    elig_cacheGet_:
      typeof elig_cacheGet_,

    eligService_cacheRead_:
      typeof eligService_cacheRead_
  };
}
function TEST_D35_RUNTIME_THROW() {
  throw new Error(JSON.stringify({
    TEC_BUILD:
      (typeof TOOLKIT_ELIG_CACHE_BUILD !== 'undefined')
        ? TOOLKIT_ELIG_CACHE_BUILD
        : 'MISSING',
    TEC_VERSION:
      (typeof TOOLKIT_ELIG_CACHE_VERSION !== 'undefined')
        ? TOOLKIT_ELIG_CACHE_VERSION
        : 'MISSING',
    elig_cacheGet_: typeof elig_cacheGet_,
    eligService_cacheRead_: typeof eligService_cacheRead_
  }, null, 2));
}

function TEST_D35_ONE_AUDIT_THROW() {
  var auditId = 'AUD_CultiusTianaSAT_HQ_1777555340805_105';

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ctx = TK3S_readAuditContext_R24_(auditId);

  var required = ctx.requiredScopes || [];

  var cacheCtx = {
    auditId: auditId,
    scopeHash: _tec_sha1_(required.slice().sort().join('|')),
    auditorBuildHash: _tec_auditorsSheetQualificationHash_(ss),
    preassignedHash: _tec_sha1_(String(ctx.preassigned || '').trim().toLowerCase())
  };

  var hit = elig_cacheRead_(cacheCtx);

  throw new Error(JSON.stringify({
    cacheCtx: cacheCtx,
    hit: !!hit,
    hitSource: hit && hit.source,
    hitAuditors: hit && hit.auditors ? hit.auditors.length : 0,
    hitMeta: hit && hit.meta ? hit.meta.__tecFingerprint : '',
    expectedKey: elig_cacheKey_(cacheCtx),
    TEC_BUILD: TOOLKIT_ELIG_CACHE_BUILD,
    TEC_VERSION: TOOLKIT_ELIG_CACHE_VERSION
  }, null, 2));
}

function TEST_D35_WRITE_READ_THROW() {
  var auditId = 'AUD_AlmendretaPlantasyCult_HQ_1777555342222_107';
  var ctx = TK3S_readAuditContext_R24_(AUD_CultiusTianaSAT_HQ_1777555340805_105);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var cacheCtx = {
    auditId: auditId,
    scopeHash: _tec_sha1_((ctx.requiredScopes || []).slice().sort().join('|')),
    auditorBuildHash: _tec_auditorsSheetQualificationHash_(ss),
    preassignedHash: _tec_sha1_(String(ctx.preassigned || '').trim().toLowerCase())
  };

  var payload = _mp_getEligibleAuditorsList_(ss, ctx.requiredScopes || [], ctx.preassigned || '', ctx.hdr || [], ctx.row || []);
  var wrote = elig_cacheWrite_(cacheCtx, payload);
  var hit = elig_cacheRead_(cacheCtx);

  throw new Error(JSON.stringify({
    wrote: wrote,
    hit: !!hit,
    auditors: hit && hit.auditors ? hit.auditors.length : 0,
    expectedKey: elig_cacheKey_(cacheCtx),
    metaFp: hit && hit.meta ? hit.meta.__tecFingerprint : ''
  }, null, 2));
}
function TEST_D36_WARM_ONE_THROW() {
  var auditId = 'AUD_AlmendretaPlantasyCult_HQ_1777555342222_107';
  var first = ToolkitEligibilityCache_WarmOneD35(auditId);
  var second = ToolkitEligibilityCache_WarmOneD35(auditId);
  throw new Error(JSON.stringify({ first: first, second: second }, null, 2));
}

function TEST_D36_WARM_COPLANT_THROW() {
  var r = ToolkitEligibilityCache_WarmOneD35('AUD_Coplant_HQ_1777531729194_11');
  throw new Error(JSON.stringify(r, null, 2));
}