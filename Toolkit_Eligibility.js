// FILE: Toolkit_Eligibility.js
// BUILD: Toolkit_Eligibility_d19_TEC_WIRING_FP_20260516
// PURPOSE:
//   Extracted from ManagerPlanningBackend_CORE_SPLIT_d17.js (lines 1530-2240)
//   Owns the auditor-eligibility and rotation metadata cluster:
//   HARD qualification, SOFT rotation/consecutive, log indexing, alias maps.
//
// Public functions (kept globally, no behavior change):
//   _mp_norm_, _mp_normLower_, _mp_isYes_,
//   _mp_headerMap_, _mp_findHeaderIdxCI_,
//   _mp_getPerformedCountFromAuditRow_, _mp_getMaxAllowedFromStandards_,
//   _mp_getCurrentCycleYearFromAuditRow_, _mp_shouldCountLogStatus_,
//   _mp_scopeAliasMetaForRotation_, _mp_scopeCanonicalForRotation_,
//   _mp_rotationMaxByScopeFromConfig_,
//   _mp_buildAuditorAliasMap_, _mp_buildLogIndexForCompany_,
//   _mp_consecutiveCountFromLog_,
//   _mp_rotationProfileForAuditor_, _mp_rotationProfileForAuditorFromIndex_,
//   _mp_lookupAuditorBasic_, _mp_getEligibleAuditorsList_,
//   _mp_getToolkitEligibleAuditorsForRow_, _mp_findAuditorInList_,
//   _mp_assertAuditorQualifiedForPlanning_
//
// Ownership note 2026-05-14:
//   Rotation helpers are canonical here. ManagerPlanningBackend_CORE_SPLIT.js
//   must not define _mp_rotationProfileForAuditorFromIndex_,
//   _mp_rotationMaxByScopeFromConfig_, or _mp_buildLogIndexForCompany_.
//
// Dependencies (resolved globally via GAS single-namespace):
//   ManagerV5_buildIndex_, V5_normalizeEmail_, v5_extractScopesForAuditPlanningRow_,
//   v5_getScopesConfig_, __mp_getCached_, __mp_getSheetDataCached_,
//   V5_getSheetByNameCaseInsensitive_, findHeaderIndex_.

// ============================================================
// Auditor eligibility (Qualification = HARD, Rotation/Consecutive = SOFT)
// ============================================================

function _mp_norm_(v){ return String(v||'').trim(); }
function _mp_normLower_(v){ return _mp_norm_(v).toLowerCase(); }
function _mp_isYes_(v){
  var s = _mp_normLower_(v);
  return s === 'x' || s === 'yes' || s === 'true' || s === '1';
}
function _mp_headerMap_(hdr){
  var map = {};
  for (var i=0;i<hdr.length;i++){
    var k = String(hdr[i]||'').trim();
    if (k) map[k] = i;
  }
  return map;
}

// Try to find a header index by candidate list (case-insensitive exact match)
function _mp_findHeaderIdxCI_(hdr, candidates){
  var lc = hdr.map(function(x){ return String(x||'').trim().toLowerCase(); });
  for (var j=0;j<candidates.length;j++){
    var t = String(candidates[j]||'').trim().toLowerCase();
    var ix = lc.indexOf(t);
    if (ix !== -1) return ix;
  }
  return -1;
}

function _mp_getPerformedCountFromAuditRow_(hdr, row){
  var ix = _mp_findHeaderIdxCI_(hdr, [
    'Number of audits already performed',
    'Audits already performed',
    'Audits performed',
    'Performed audits',
    'Consecutive audits',
    'Performed count'
  ]);
  if (ix < 0) return 0;
  var v = row[ix];
  var n = (typeof v === 'number') ? v : Number(String(v||'').replace(',','.'));
  return isFinite(n) ? n : 0;
}

// Standards-based max allowed (per scope), returns strictest (min) across required scopes.
// Looks for a max column if present; if missing, returns null (no soft block possible).
function _mp_getMaxAllowedFromStandards_(ss, requiredScopeNames){
  // PERF-PHASE1: route through persist cache (was raw getDataRange every call)
  var pack = __mp_getSheetDataPersistCached_(ss, 'Standards', 600);
  var data = pack.data || [];
  if (data.length < 2) return null;

  var hdr = (pack.hdr || data[0] || []).map(function(x){ return String(x||'').trim(); });
  var idxName = _mp_findHeaderIdxCI_(hdr, ['Name','Standard','Scope']);
  if (idxName < 0) return null;

  var idxMax = _mp_findHeaderIdxCI_(hdr, [
    'Max number audits',
    'Max number of audits',
    'Max audits',
    'Max consecutive audits',
    'Max consecutive',
    'Max performed',
    'Rotation max'
  ]);
  if (idxMax < 0) return null;

  var map = {};
  for (var r=1;r<data.length;r++){
    var nm = String(data[r][idxName]||'').trim();
    if (!nm) continue;
    var v = data[r][idxMax];
    var n = (typeof v === 'number') ? v : Number(String(v||'').replace(',','.'));
    map[nm] = isFinite(n) ? n : null;
  }

  var strictest = null;
  (requiredScopeNames||[]).forEach(function(sc){
    if (!sc) return;
    var mx = map[String(sc).trim()];
    if (mx == null) return;
    if (strictest == null) strictest = mx;
    else strictest = Math.min(strictest, mx);
  });

  return strictest;
}

// ---- Rotation / consecutive counts (authoritative from Log realized audits) ----
//
// Counts "already performed" as the number of consecutive completed cycles
// (currentYear-1 backwards) for the same company + auditor + scope.
// Uses Log realized audits as source of truth.
// NOTE: Company matching uses the Company name in Log realized audits.
// If you later introduce Company_UID in the log, this function can be upgraded safely.

function _mp_getCurrentCycleYearFromAuditRow_(hdr, row){
  // Prefer explicit Year field if present; else derive from "Date - Will Expire"; else use current year.
  var nowY = new Date().getFullYear();
  try {
    var ixY = _mp_findHeaderIdxCI_(hdr, ['Year','Cycle year','Audit year']);
    if (ixY >= 0) {
      var v = row[ixY];
      var n = (typeof v === 'number') ? v : Number(String(v||'').trim());
      if (isFinite(n) && n > 2000 && n < 3000) return Math.floor(n);
    }
    var ixExp = _mp_findHeaderIdxCI_(hdr, ['Date - Will Expire','Will expire date','Expiry date','Date - Will Expire']);
    if (ixExp >= 0 && row[ixExp]) {
      var d = row[ixExp];
      if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime())) return d.getFullYear();
      var s = String(d||'').trim();
      var m = s.match(/^(\d{4})[-\/]/);
      if (m) return Number(m[1]);
    }
  } catch(e){}
  return nowY;
}

function _mp_shouldCountLogStatus_(statusRaw){
  // Count only completed/realized audits; exclude cancelled/rejected/denied.
  var s = String(statusRaw||'').trim().toLowerCase();
  if (!s) return true; // log usually contains realized items; treat blank as countable
  if (s.indexOf('cancel') !== -1) return false;
  if (s.indexOf('reject') !== -1) return false;
  if (s.indexOf('deny') !== -1) return false;
  if (s.indexOf('complete') !== -1) return true;
  if (s.indexOf('realized') !== -1) return true;
  // Default conservative: do not count unknown statuses
  return false;
}


function _mp_scopeAliasMetaForRotation_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var meta = { byAnyKey: {}, aliasesByCanonical: {} };
  try {
    if (typeof m5t_scopeAliasMeta_ === 'function') {
      var m = m5t_scopeAliasMeta_(ss);
      if (m && m.byAnyKey) return m;
    }
  } catch(eBridge) {}

  var sh = ss.getSheetByName('Config_Scopes');
  if (!sh) return meta;
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return meta;
  var hm = _mp_headerMap_(values[0]);
  var slotCol = _mp_findHeaderIdxCI_(values[0], ['SlotKey','Slot key','Slot']);
  var codeCol = _mp_findHeaderIdxCI_(values[0], ['ScopeCode','Scope code','Code']);
  var nameCol = _mp_findHeaderIdxCI_(values[0], ['DisplayName','Display name','Name','ScopeName','Scope']);

  function norm_(v){ return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s\-]/g, ''); }
  function addKey_(key, canonical) {
    key = String(key || '').trim();
    canonical = String(canonical || '').trim();
    if (!key || !canonical) return;
    meta.byAnyKey[norm_(key)] = canonical;
    if (!meta.aliasesByCanonical[canonical]) meta.aliasesByCanonical[canonical] = [];
    if (meta.aliasesByCanonical[canonical].indexOf(key) < 0) meta.aliasesByCanonical[canonical].push(key);
  }

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var canonical = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
    if (!canonical) continue;
    addKey_(canonical, canonical);
    if (slotCol >= 0) addKey_(row[slotCol], canonical);
    if (codeCol >= 0) addKey_(row[codeCol], canonical);
    if (canonical === 'Florimark Tracecert') {
      addKey_('Florimark Tracecert', canonical);
      addKey_('FLORIMARK_TF', canonical);
    }
    if (canonical === 'Florimark GTP') addKey_('FLORIMARK_G', canonical);
  }
  return meta;
}

function _mp_scopeCanonicalForRotation_(ss, rawScope) {
  var raw = String(rawScope || '').trim();
  if (!raw) return '';
  try {
    if (typeof m5t_scopeCanonicalName_ === 'function') return m5t_scopeCanonicalName_(ss, raw) || raw;
  } catch(eBridge) {}
  var meta = _mp_scopeAliasMetaForRotation_(ss);
  var key = raw.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s\-]/g, '').trim();
  return (meta.byAnyKey && meta.byAnyKey[key]) ? meta.byAnyKey[key] : raw;
}

/**
 * BUILD 2026-05-14: canonical Toolkit_Eligibility owner.
 * Rotation max comes from RotationAuditorService when available.
 */
function _mp_rotationMaxByScopeFromConfig_(ss) {
  if (typeof RotationAuditorService_getMaxByScope === 'function') {
    return RotationAuditorService_getMaxByScope() || {};
  }
  return {};
}

/**
 * PATCH F (T11_PATCHF_20260427_ELIGIBILITY_ALIASMAP)
 * --------------------------------------------------
 * Build ONCE per execution: lower-cased name/email key -> array of all
 * aliases (lower-cased) for the same auditor. Replaces the per-log-row
 * call to _mp_lookupAuditorBasic_(...) inside _mp_consecutiveCountFromLog_,
 * which was costing ~15ms per call x ~30 log rows x ~3 scopes x ~10 auditors
 * = ~12 seconds in getToolkitAuditorsV5. Diagnostic baseline (5 cold samples,
 * AUD_Barberet&Blanc_HQ_..., 3 auditors): auditors server p50=12596ms with
 * variance only ±2.5%, confirming it is structural cost, not Apps Script
 * noise. After alias-map preload: O(1) per lookup.
 */
function _mp_buildAuditorAliasMap_(ss){
  return __mp_getCached_('AUDITOR_ALIAS_MAP', function(){
    var map = {};
    try {
      var pack = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
      if (!pack || !pack.sh) return map;
      var data = pack.data || [];
      if (data.length < 2) return map;
      var hdr = data[0] || [];
      var idxName  = _mp_findHeaderIdxCI_(hdr, ['Name','Auditor','Auditor name']);
      var idxEmail = _mp_findHeaderIdxCI_(hdr, ['E-mail','Email','E-mail address','Mail']);
      if (idxName < 0 && idxEmail < 0) return map;
      for (var r=1; r<data.length; r++){
        var row = data[r] || [];
        var nm = (idxName  >= 0) ? String(row[idxName]  || '').trim().toLowerCase() : '';
        var em = (idxEmail >= 0) ? String(row[idxEmail] || '').trim().toLowerCase() : '';
        if (!nm && !em) continue;
        var aliases = [];
        if (nm) aliases.push(nm);
        if (em) aliases.push(em);
        // Every alias key points to the SAME shared array, so any-key lookup
        // returns all aliases for that auditor in one O(1) read.
        for (var ai=0; ai<aliases.length; ai++){
          var k = aliases[ai];
          if (!map[k]) map[k] = aliases;
        }
      }
    } catch (eMap) {}
    return map;
  });
}

/**
 * BUILD 2026-05-14: canonical Toolkit_Eligibility owner.
 * Enhanced log index with companyName/companyUid for RotationAuditorService bridge.
 */
function _mp_buildLogIndexForCompany_(ss, companyUid, companyName){
  // δ1 (2026-05-03): switch from exec-only cache to persist cache (300s TTL).
  // Invalidation owned by LogRealizedAuditService writers (append + update).
  var pack = __mp_getSheetDataPersistCached_(ss, 'Log realized audits', 300);
  // PATCH F: aliasMap shared across all log-index callers (built once per execution).
  var aliasMap = _mp_buildAuditorAliasMap_(ss);
  if (!pack.sh) return null;
  var data = pack.data || [];
  if (data.length < 2) return { hdr: data[0] || [], rows: [], companyName: String(companyName || '').trim(), companyUid: String(companyUid || '').trim(), aliasMap: aliasMap };

  var hdr = data[0] || [];
  var idxCompanyUid = _mp_findHeaderIdxCI_(hdr, ['Company_UID','Company UID','CompanyUid']);
  var idxCompany = _mp_findHeaderIdxCI_(hdr, ['Company']);
  var idxAuditor = _mp_findHeaderIdxCI_(hdr, ['Auditor']);
  var idxStatus  = _mp_findHeaderIdxCI_(hdr, ['Status']);
  var idxYear    = _mp_findHeaderIdxCI_(hdr, ['Year']);

  if (idxAuditor < 0 || idxYear < 0) return { hdr: hdr, rows: [], companyName: String(companyName || '').trim(), companyUid: String(companyUid || '').trim(), aliasMap: aliasMap };

  var scopeCols = {};
  (hdr || []).forEach(function(h, i){
    var key = String(h||'').trim();
    if (!key) return;
    scopeCols[key] = i;
    var canon = _mp_scopeCanonicalForRotation_(ss, key);
    if (canon) scopeCols[canon] = i;
  });

  var targetUid = String(companyUid||'').trim().toLowerCase();
  var targetName = String(companyName||'').trim().toLowerCase();

  var rows = [];
  var matchedCompanyName = String(companyName || '').trim();
  for (var r=1;r<data.length;r++){
    var row = data[r];
    if (!row) continue;

    var match = false;
    if (idxCompanyUid >= 0 && targetUid) {
      var u = String(row[idxCompanyUid]||'').trim().toLowerCase();
      if (u && u === targetUid) match = true;
    }
    if (!match && idxCompany >= 0 && targetName) {
      var c = String(row[idxCompany]||'').trim().toLowerCase();
      if (c && c === targetName) match = true;
    }
    if (!match) continue;

    if (!matchedCompanyName && idxCompany >= 0) matchedCompanyName = String(row[idxCompany] || '').trim();
    if (idxStatus >= 0 && !_mp_shouldCountLogStatus_(row[idxStatus])) continue;
    rows.push(row);
  }

  return {
    hdr: hdr,
    rows: rows,
    idxAuditor: idxAuditor,
    idxYear: idxYear,
    scopeCols: scopeCols,
    companyName: matchedCompanyName,
    companyUid: String(companyUid || '').trim(),
    aliasMap: aliasMap
  };
}

function _mp_consecutiveCountFromLog_(logIndex, auditorKeyLower, scopeName, currentYear){
  if (!logIndex || !logIndex.rows) return 0;
  var idxAud = logIndex.idxAuditor;
  var idxYear = logIndex.idxYear;
  var scName = String(scopeName||'').trim();
  var scIdx = (logIndex.scopeCols || {})[scName];
  if (scIdx === undefined) scIdx = (logIndex.scopeCols || {})[_mp_scopeCanonicalForRotation_(SpreadsheetApp.getActiveSpreadsheet(), scName)];
  if (scIdx === undefined) return 0;

  // Rotation rule 2026-04-25:
  // missing audit years do NOT break the chain.
  // The chain resets only when another auditor performed the same company+scope.
  var ownersByYear = {};
  for (var i=0;i<logIndex.rows.length;i++){
    var row = logIndex.rows[i];
    var y = row[idxYear];
    var yy = (typeof y === 'number') ? y : Number(String(y||'').trim());
    if (!isFinite(yy)) continue;
    yy = Math.floor(yy);
    if (currentYear && yy >= currentYear) continue;
    if (!_mp_isYes_(row[scIdx])) continue;
    var aud = String(row[idxAud]||'').trim().toLowerCase();
    if (!aud) continue;
    if (!ownersByYear[yy]) ownersByYear[yy] = {};
    ownersByYear[yy][aud] = true;

    // PATCH F (T11_PATCHF_20260427_ELIGIBILITY_ALIASMAP):
    // Replaces the per-log-row _mp_lookupAuditorBasic_ call (~15ms each, with
    // a SpreadsheetApp.getActiveSpreadsheet() inside) by an O(1) lookup in the
    // pre-built aliasMap. Same semantics: log row may contain auditor name OR
    // email; we mark BOTH aliases as owners so the rotation engine returns the
    // correct count regardless of which alias the Toolkit asks for.
    var __aliases = (logIndex && logIndex.aliasMap) ? logIndex.aliasMap[aud] : null;
    if (__aliases) {
      for (var __ai=0; __ai<__aliases.length; __ai++) {
        ownersByYear[yy][__aliases[__ai]] = true;
      }
    } else if (logIndex && !logIndex.aliasMap) {
      // Legacy fallback only when caller built logIndex without aliasMap.
      // Will not run in normal V5 flow; preserves backward compat.
      try {
        var basicAud = _mp_lookupAuditorBasic_(SpreadsheetApp.getActiveSpreadsheet(), aud);
        if (basicAud && basicAud.found) {
          var emAlias = String(basicAud.email || '').trim().toLowerCase();
          var nmAlias = String(basicAud.name || '').trim().toLowerCase();
          if (emAlias) ownersByYear[yy][emAlias] = true;
          if (nmAlias) ownersByYear[yy][nmAlias] = true;
        }
      } catch(eAlias) {}
    }
  }

  var years = Object.keys(ownersByYear).map(function(y){ return parseInt(y, 10); })
    .filter(function(n){ return !isNaN(n); })
    .sort(function(a,b){ return b-a; });

  var target = String(auditorKeyLower || '').trim().toLowerCase();
  if (!target || !years.length) return 0;

  var count = 0;
  for (var j=0; j<years.length; j++){
    var owners = ownersByYear[years[j]] || {};
    if (!owners[target]) break;
    count++;
    for (var other in owners) {
      if (owners.hasOwnProperty(other) && other !== target) return count;
    }
  }
  return count;
}

function _mp_rotationProfileForAuditor_(ss, companyUid, companyName, auditorNameOrEmail, requiredScopeNames, currentYear){
  var auditorKey = String(auditorNameOrEmail||'').trim().toLowerCase();
  var logIndex = _mp_buildLogIndexForCompany_(ss, companyUid, companyName);
  var counts = {};
  (requiredScopeNames || []).forEach(function(sc){
    var s = String(sc||'').trim();
    if (!s) return;
    counts[s] = _mp_consecutiveCountFromLog_(logIndex, auditorKey, s, currentYear);
  });
  return counts;
}

/**
 * BUILD 2026-05-14: canonical Toolkit_Eligibility owner.
 * Rotation profile bridge: RotationAuditorService -> ManagerTools fallback -> local log fallback.
 */
function _mp_rotationProfileForAuditorFromIndex_(logIndex, auditorNameOrEmail, requiredScopeNames, currentYear){
  var counts = {};
  var companyName = logIndex && logIndex.companyName ? String(logIndex.companyName || '').trim() : '';
  var companyUid = logIndex && logIndex.companyUid ? String(logIndex.companyUid || '').trim() : '';
  var auditorKey = String(auditorNameOrEmail || '').trim();

  (requiredScopeNames || []).forEach(function(sc){
    var canonicalScope = sc;
    try {
      if (typeof _mp_scopeCanonicalForRotation_ === 'function') {
        canonicalScope = _mp_scopeCanonicalForRotation_(SpreadsheetApp.getActiveSpreadsheet(), sc) || sc;
      }
    } catch(e0) {}

    if (typeof RotationAuditorService_getAuditorScopeResult === 'function') {
      try {
        var r = RotationAuditorService_getAuditorScopeResult({
          companyUid: companyUid,
          companyName: companyName,
          auditorEmail: auditorKey,
          scope: canonicalScope
        });
        counts[canonicalScope] = r && r.success ? (Number(r.consecutiveYears || 0) || 0) : 0;
        return;
      } catch (e1) {}
    }

    if (typeof m5t_countConsecutiveFor_ === 'function') {
      try {
        counts[canonicalScope] = m5t_countConsecutiveFor_(SpreadsheetApp.getActiveSpreadsheet(), auditorKey, companyName, canonicalScope);
        return;
      } catch (e2) {}
    }

    counts[canonicalScope] = _mp_consecutiveCountFromLog_(logIndex, String(auditorKey || '').toLowerCase(), canonicalScope, currentYear);
  });
  return counts;
}

// Returns {auditors:[...], meta:{...}} where auditors are already HARD-filtered by qualification.
// Soft flag: softBlockRotation = true if performed >= maxAllowed (when maxAllowed is known and >0).

// Lookup auditor row in Auditors sheet by name or email (case-insensitive).
// Returns {name,email,blockedWeekdays,active,role,found:true} or {found:false}.
function _mp_lookupAuditorBasic_(ss, key){
  var pack = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
  if (!pack.sh) return { found:false };
  var data = pack.data || [];
  if (data.length < 2) return { found:false };

  var hdr = data[0] || [];
  var idxName   = _mp_findHeaderIdxCI_(hdr, ['Name','Auditor','Auditor name']);
  var idxEmail  = _mp_findHeaderIdxCI_(hdr, ['E-mail','Email','E-mail address','Mail']);
  var idxActive = _mp_findHeaderIdxCI_(hdr, ['Active','Is active']);
  var idxRole   = _mp_findHeaderIdxCI_(hdr, ['Role','Function']);
  var idxBW     = _mp_findHeaderIdxCI_(hdr, ['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);

  if (idxName < 0 && idxEmail < 0) return { found:false };

  var k = String(key||'').trim().toLowerCase();
  if (!k) return { found:false };

  for (var r=1;r<data.length;r++){
    var row = data[r];
    var nm = (idxName>=0) ? String(row[idxName]||'').trim() : '';
    var em = (idxEmail>=0) ? String(row[idxEmail]||'').trim() : '';
    if ((nm && nm.toLowerCase() === k) || (em && em.toLowerCase() === k)){
      return {
        found:true,
        name: nm,
        email: em,
        blockedWeekdays: (idxBW>=0) ? String(row[idxBW]||'').trim() : '',
        active: (idxActive>=0) ? _mp_isYes_(row[idxActive]) : null,
        role: (idxRole>=0) ? String(row[idxRole]||'').trim() : ''
      };
    }
  }
  return { found:false };
}

function _mp_getEligibleAuditorsList_(ss, requiredScopes, preassignedName, auditHdr, auditRow, opts){
  opts = opts || {};
  /**
   * BUILD: TOOLKIT_ELIGIBILITY_d22_3S_CANONICAL_OWNER_20260514
   *
   * 3S contract:
   * - Membership owner is this function only.
   * - Membership = Active YES + Role auditor + HARD qualification for all required scopes.
   * - Rotation/consecutive is metadata only; it never removes auditors from membership.
   * - Auditors sheet is read live here to avoid stale qualification after manual sheet edits.
   * - Cache may be reintroduced only above this canonical output with an Auditors fingerprint.
   */
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  auditHdr = auditHdr || [];
  auditRow = auditRow || [];

  var required = (requiredScopes || []).map(function(x){
    return _mp_scopeCanonicalForRotation_(ss, x);
  }).filter(function(x){ return !!String(x || '').trim(); });

  var __d35_cacheCtx = null;
  try {
    var __d35_auditId = String(opts.auditId || '').trim();
    if (!__d35_auditId) {
      var __d35_colAI = _mp_findHeaderIdxCI_(auditHdr || [], ['Audit ID','Audit_ID','AuditId','Audit Id']);
      if (__d35_colAI >= 0 && auditRow && auditRow.length) {
        __d35_auditId = String(auditRow[__d35_colAI] || '').trim();
      }
    }

    var __d35_scopeHash = (typeof _tec_sha1_ === 'function')
      ? _tec_sha1_(required.slice().sort().join('|'))
      : '';

    var __d35_auditorBuildHash = (typeof _tec_auditorsSheetQualificationHash_ === 'function')
      ? _tec_auditorsSheetQualificationHash_(ss)
      : '';

    var __d35_preassignedHash = (typeof _tec_sha1_ === 'function')
      ? _tec_sha1_(String(preassignedName || '').trim().toLowerCase())
      : '';

    __d35_cacheCtx = {
      auditId: __d35_auditId,
      scopeHash: __d35_scopeHash,
      auditorBuildHash: __d35_auditorBuildHash,
      preassignedHash: __d35_preassignedHash
    };

    if (__d35_auditId && typeof elig_cacheRead_ === 'function') {
      var __d35_hit = elig_cacheRead_(__d35_cacheCtx);
      if (__d35_hit && Array.isArray(__d35_hit.auditors)) {
        return __d35_hit;
      }
    } else {
      Logger.log('[D35_TEC_SKIP] ' + JSON.stringify({
        auditId: __d35_auditId || '',
        cacheReadType: typeof elig_cacheRead_
      }));
    }
  } catch(eD35Lookup) {
    Logger.log('[D35_TEC_LOOKUP_ERROR] ' + String(eD35Lookup && eD35Lookup.message ? eD35Lookup.message : eD35Lookup));
  }

  var ctxCompanyUid = '';
  var ctxCompanyName = '';
  try {
    var ixUid = _mp_findHeaderIdxCI_(auditHdr, ['Company_UID','Company UID','CompanyUid','Company_UID (Companies)']);
    if (ixUid >= 0 && auditRow && auditRow.length) ctxCompanyUid = String(auditRow[ixUid] || '').trim();
    var ixComp = _mp_findHeaderIdxCI_(auditHdr, ['Company']);
    if (ixComp >= 0 && auditRow && auditRow.length) ctxCompanyName = String(auditRow[ixComp] || '').trim();
  } catch(eCtx) {}

  var currentYear = _mp_getCurrentCycleYearFromAuditRow_(auditHdr, auditRow);
  var maxByScope = _mp_rotationMaxByScopeFromConfig_(ss) || {};
  var strictestMax = null;
  required.forEach(function(sc){
    var mx = maxByScope.hasOwnProperty(sc) ? maxByScope[sc] : null;
    if (mx == null || !isFinite(mx)) return;
    strictestMax = (strictestMax == null) ? mx : Math.min(strictestMax, mx);
  });

  var shAud = ss.getSheetByName('Auditors');
  if (!shAud) return { auditors:[], meta:{ build:'d22_3S_CANONICAL_OWNER', requiredScopes:required, note:'Missing Auditors sheet' } };

  var data = shAud.getDataRange().getValues();
  if (!data || data.length < 2) return { auditors:[], meta:{ build:'d22_3S_CANONICAL_OWNER', requiredScopes:required, note:'No auditors' } };

  var hdr = data[0] || [];
  var idxName   = _mp_findHeaderIdxCI_(hdr, ['Name','Auditor','Auditor name']);
  var idxEmail  = _mp_findHeaderIdxCI_(hdr, ['E-mail','Email','E-mail address','Mail']);
  var idxActive = _mp_findHeaderIdxCI_(hdr, ['Active','Is active']);
  var idxRole   = _mp_findHeaderIdxCI_(hdr, ['Role','Function']);
  var idxBW     = _mp_findHeaderIdxCI_(hdr, ['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);

  if (idxName < 0 || idxEmail < 0 || idxActive < 0 || idxRole < 0) {
    return { auditors:[], meta:{ build:'d22_3S_CANONICAL_OWNER', requiredScopes:required, note:'Auditors headers missing (Name/E-mail/Active/Role)' } };
  }

  var qMap = {};
  for (var qi = 0; qi < hdr.length; qi++) {
    var raw = String(hdr[qi] || '').trim();
    if (!raw) continue;
    qMap[raw] = qi;
    var canon = _mp_scopeCanonicalForRotation_(ss, raw);
    if (canon) qMap[canon] = qi;
  }

  function qualified_(rowVals) {
    for (var i = 0; i < required.length; i++) {
      var sc = required[i];
      if (!sc) continue;
      if (!qMap.hasOwnProperty(sc)) return false;
      if (!_mp_isYes_(rowVals[qMap[sc]])) return false;
    }
    return true;
  }

  var logIndex = _mp_buildLogIndexForCompany_(ss, ctxCompanyUid, ctxCompanyName);
  var pre = String(preassignedName || '').trim().toLowerCase();
  var out = [];

  for (var r = 1; r < data.length; r++) {
    var row = data[r] || [];
    if (!_mp_isYes_(row[idxActive])) continue;
    var role = String(row[idxRole] || '').trim().toLowerCase();
    if (role !== 'auditor') continue;
    if (!qualified_(row)) continue;

    var name = String(row[idxName] || '').trim();
    var email = String(row[idxEmail] || '').trim();
    if (!name && !email) continue;

    var performedByScope = {};
    try {
      performedByScope = _mp_rotationProfileForAuditorFromIndex_(logIndex, (email || name), required, currentYear) || {};
    } catch(eRot) {
      performedByScope = {};
    }

    var soft = false;
    for (var k = 0; k < required.length; k++) {
      var sc2 = required[k];
      var mx = maxByScope.hasOwnProperty(sc2) ? maxByScope[sc2] : null;
      if (mx == null || !isFinite(mx) || mx <= 0) continue;
      var pc = performedByScope.hasOwnProperty(sc2) ? Number(performedByScope[sc2] || 0) : 0;
      if (pc >= mx) soft = true;
    }

    var isPre = false;
    if (pre) {
      if (String(name || '').trim().toLowerCase() === pre) isPre = true;
      if (String(email || '').trim().toLowerCase() === pre) isPre = true;
    }

    var performedCount = 0;
    for (var kk = 0; kk < required.length; kk++) {
      var sc3 = required[kk];
      var pc3 = performedByScope.hasOwnProperty(sc3) ? Number(performedByScope[sc3] || 0) : 0;
      if (pc3 > performedCount) performedCount = pc3;
    }

    out.push({
      name: name,
      email: email,
      blockedWeekdays: (idxBW >= 0) ? String(row[idxBW] || '').trim() : '',
      isPreassigned: isPre,
      softBlockRotation: soft,
      nearRotationLimit: false,
      ineligible: false,
      hardBlockQualification: false,
      ineligibleReason: '',
      performedByScope: performedByScope,
      performedCount: performedCount,
      maxAllowed: strictestMax,
      qualifiedCanonical: true,
      eligibilityOwner: 'Toolkit_Eligibility_d22_3S_CANONICAL_OWNER'
    });
  }

  out.sort(function(a,b){
    if (!!a.softBlockRotation !== !!b.softBlockRotation) return a.softBlockRotation ? 1 : -1;
    if (!!a.isPreassigned !== !!b.isPreassigned) return a.isPreassigned ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  var __d35_result = {
    auditors: out,
    meta: {
      build: 'd22_3S_CANONICAL_OWNER',
      membershipOwner: '_mp_getEligibleAuditorsList_',
      requiredScopes: required,
      currentYear: currentYear,
      maxByScope: maxByScope,
      strictestMax: strictestMax,
      preassigned: preassignedName,
      companyUid: ctxCompanyUid,
      company: ctxCompanyName,
      auditorsReadMode: 'LIVE_SHEET',
      rotationMode: 'SOFT_METADATA_ONLY',
      membershipMode: 'HARD_QUALIFICATION_ONLY'
    }
  };

  try {
    if (__d35_cacheCtx && __d35_cacheCtx.auditId && typeof elig_cacheWrite_ === 'function') {
      elig_cacheWrite_(__d35_cacheCtx, __d35_result);
    }
  } catch(eD35Write) {
    Logger.log('[D35_TEC_WRITE_ERROR] ' + String(eD35Write && eD35Write.message ? eD35Write.message : eD35Write));
  }

  return __d35_result;
}

function _mp_getCanonicalQualifiedAuditorMembership_(ss, requiredScopes, preassignedName, auditHdr, auditRow, opts) {
  opts = opts || {};
  var res = _mp_getEligibleAuditorsList_(ss, requiredScopes || [], preassignedName || '', auditHdr || [], auditRow || [], opts || {});
  var auditors = (res && Array.isArray(res.auditors)) ? res.auditors.map(function(a){
    var c = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a,k)) c[k] = a[k];
    // Fast projection keeps membership identical, but callers may ignore rotation metadata.
    c.rotationPending = true;
    c.qualifiedFast = true;
    return c;
  }) : [];
  return { auditors:auditors, meta:(res && res.meta) ? res.meta : { requiredScopes:requiredScopes || [] } };
}

function RUN_TOOLKIT_ELIGIBILITY_OWNER_LOADED() {
  var out = {
    success:true,
    build:'Toolkit_Eligibility_d22_3S_CANONICAL_OWNER_20260514',
    owner:'_mp_getEligibleAuditorsList_',
    functions:{
      _mp_getEligibleAuditorsList_: typeof _mp_getEligibleAuditorsList_,
      _mp_getCanonicalQualifiedAuditorMembership_: typeof _mp_getCanonicalQualifiedAuditorMembership_,
      _mp_rotationProfileForAuditorFromIndex_: typeof _mp_rotationProfileForAuditorFromIndex_
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * MVP qualification owner for Planning Toolkit.
 * Manager dropdowns must be built from this function only. It uses the same
 * HARD qualification filter and SOFT rotation metadata as the normal toolkit
 * eligibility path. Basic/unqualified auditor lists are intentionally not used
 * for manager planning.
 */
function _mp_getToolkitEligibleAuditorsForRow_(ss, hdr, row, preassignedName) {
  var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr || [], row || []);
  var reqScopeNames = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){
    return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
  }).filter(function(x){ return !!x; }) : [];

  var elig = _mp_getEligibleAuditorsList_(ss, reqScopeNames, preassignedName || '', hdr || [], row || [], {});
  return {
    auditors: (elig && elig.auditors) ? elig.auditors : [],
    meta: (elig && elig.meta) ? elig.meta : { requiredScopes: reqScopeNames },
    requiredScopes: reqScopeNames,
    scopesRes: scopesRes || { scopes: [], scopesText: '' }
  };
}

function _mp_findAuditorInList_(auditors, rawKey) {
  var key = V5_normalizeEmail_(rawKey || '');
  var keyRaw = String(rawKey || '').trim().toLowerCase();
  if (!key && !keyRaw) return null;
  for (var i = 0; i < (auditors || []).length; i++) {
    var a = auditors[i] || {};
    var em = V5_normalizeEmail_(a.email || '');
    var nm = String(a.name || '').trim().toLowerCase();
    if ((key && em === key) || (keyRaw && nm === keyRaw)) return a;
  }
  return null;
}

function _mp_assertAuditorQualifiedForPlanning_(ss, hdr, row, auditorEmail, auditorName) {
  var key = V5_normalizeEmail_(auditorEmail || '') || String(auditorName || '').trim().toLowerCase();
  if (!key) return { success:false, message:'Missing auditor for qualification check' };
  var eligPack = _mp_getToolkitEligibleAuditorsForRow_(ss, hdr || [], row || [], '');
  var found = _mp_findAuditorInList_(eligPack.auditors || [], key);
  if (!found) {
    return {
      success:false,
      message:'Selected auditor is not qualified for the required scope(s): ' + ((eligPack.requiredScopes || []).join(', ') || 'unknown'),
      requiredScopes: eligPack.requiredScopes || [],
      eligibleAuditors: (eligPack.auditors || []).map(function(a){ return a.email || a.name || ''; }).filter(function(x){ return !!x; })
    };
  }
  return { success:true, auditor:found, requiredScopes:eligPack.requiredScopes || [] };
}





/* =====================================================================
 * R24 — 3S TOOLKIT BACKEND DECOMPOSITION ENDPOINTS
 * BUILD: TOOLKIT_3S_ENDPOINTS_R24_20260516
 *
 * Purpose:
 * - Keep Toolkit OPEN lightweight.
 * - Expose explicit non-open endpoints for qualification-light and selected
 *   auditor rotation metadata.
 * - No status writes, no availability writes, no planning writes.
 *
 * Governance:
 * - Qualification remains HARD membership.
 * - Rotation remains SOFT metadata only.
 * - Email remains auditor identity.
 * - Cache accelerates only; it never owns truth.
 * ===================================================================== */

function TK3S_readAuditContext_R24_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) throw new Error('Missing auditId');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pack = (typeof __mp_getAuditPlanningRow_ === 'function')
    ? __mp_getAuditPlanningRow_(ss, auditId)
    : null;

  var hdr = [];
  var row = null;
  var rowNumber = 0;

  if (pack && pack.row) {
    hdr = pack.hdr || [];
    row = pack.row || null;
    rowNumber = pack.rowNumber || 0;
  } else {
    var ap = (typeof __mp_getSheetDataCached_ === 'function')
      ? __mp_getSheetDataCached_(ss, 'Audit planning')
      : null;
    if (!ap || !ap.sh) throw new Error("Missing sheet 'Audit planning'");
    var data = ap.data || [];
    hdr = ap.hdr || data[0] || [];
    var colAI = (typeof _mp_findCol_ === 'function') ? _mp_findCol_(hdr, ['Audit ID']) : -1;
    if (colAI < 0) throw new Error("Missing 'Audit ID' column");
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colAI] || '').trim() === auditId) {
        row = data[r];
        rowNumber = r + 1;
        break;
      }
    }
  }

  if (!row) throw new Error('Audit not found: ' + auditId);

  function col_(names) {
    if (typeof _mp_findHeaderIdxCI_ === 'function') return _mp_findHeaderIdxCI_(hdr, names || []);
    if (typeof _mp_findCol_ === 'function') return _mp_findCol_(hdr, names || []);
    return -1;
  }

  var scopesRes = (typeof v5_extractScopesForAuditPlanningRow_ === 'function')
    ? v5_extractScopesForAuditPlanningRow_(hdr, row)
    : { scopes: [], scopesText: '' };

  var requiredScopes = (scopesRes && scopesRes.scopes ? scopesRes.scopes : []).map(function(s) {
    return String((s && (s.name || s.code || s.slot)) || '').trim();
  }).filter(function(x) { return !!x; });

  var cPre = col_(['Preassigned auditor', 'Pre assigned auditor', 'Pre-assigned auditor', 'Preassigned Auditor']);
  var cCompany = col_(['Company']);
  var cCompanyUid = col_(['Company_UID', 'Company UID', 'CompanyUid']);

  return {
    ss: ss,
    auditId: auditId,
    hdr: hdr,
    row: row,
    rowNumber: rowNumber,
    requiredScopes: requiredScopes,
    scopesRes: scopesRes || { scopes: [], scopesText: '' },
    preassigned: cPre >= 0 ? String(row[cPre] || '').trim() : '',
    company: cCompany >= 0 ? String(row[cCompany] || '').trim() : '',
    companyUid: cCompanyUid >= 0 ? String(row[cCompanyUid] || '').trim() : '',
    currentYear: (typeof _mp_getCurrentCycleYearFromAuditRow_ === 'function') ? _mp_getCurrentCycleYearFromAuditRow_(hdr, row) : new Date().getFullYear()
  };
}

function TK3S_isAuditorQualified_R24_(ss, auditorRow, auditorHdr, requiredScopes) {
  requiredScopes = requiredScopes || [];
  var qMap = {};
  for (var i = 0; i < (auditorHdr || []).length; i++) {
    var raw = String(auditorHdr[i] || '').trim();
    if (!raw) continue;
    qMap[raw] = i;
    try {
      var canon = _mp_scopeCanonicalForRotation_(ss, raw);
      if (canon) qMap[canon] = i;
    } catch(eCanon) {}
  }
  for (var r = 0; r < requiredScopes.length; r++) {
    var sc = String(requiredScopes[r] || '').trim();
    if (!sc) continue;
    try { sc = _mp_scopeCanonicalForRotation_(ss, sc) || sc; } catch(eSc) {}
    if (!qMap.hasOwnProperty(sc)) return false;
    if (!_mp_isYes_(auditorRow[qMap[sc]])) return false;
  }
  return true;
}

function getToolkitEligibilityLightV5(auditId) {
  var t0 = Date.now();
  try {
    var ctx = TK3S_readAuditContext_R24_(auditId);
    if (typeof _mp_getQualifiedAuditorsFastList_ !== 'function') {
      throw new Error('Missing _mp_getQualifiedAuditorsFastList_');
    }
    var auditors = _mp_getQualifiedAuditorsFastList_(ctx.ss, ctx.requiredScopes, ctx.preassigned, { auditId: ctx.auditId || auditId });
    return {
      success: true,
      build: 'TOOLKIT_3S_ENDPOINTS_R24_20260516',
      endpoint: 'getToolkitEligibilityLightV5',
      auditId: ctx.auditId,
      auditors: auditors || [],
      auditorEligibilityMeta: {
        requiredScopes: ctx.requiredScopes,
        membershipMode: 'HARD_QUALIFICATION_ONLY',
        rotationMode: 'NOT_INCLUDED',
        owner: '_mp_getQualifiedAuditorsFastList_'
      },
      __serverMs: Date.now() - t0
    };
  } catch(e) {
    return {
      success: false,
      build: 'TOOLKIT_3S_ENDPOINTS_R24_20260516',
      endpoint: 'getToolkitEligibilityLightV5',
      message: String(e && e.message ? e.message : e),
      __serverMs: Date.now() - t0
    };
  }
}

function getToolkitRotationMetaV5(auditId, auditorEmail) {
  var t0 = Date.now();
  try {
    var ctx = TK3S_readAuditContext_R24_(auditId);
    var ss = ctx.ss;
    var target = String(auditorEmail || '').trim().toLowerCase();
    if (!target) throw new Error('Missing auditorEmail');

    var audPack = (typeof __mp_getSheetDataPersistCached_ === 'function')
      ? __mp_getSheetDataPersistCached_(ss, 'Auditors', 300)
      : null;
    if (!audPack || !audPack.sh) throw new Error("Missing sheet 'Auditors'");

    var data = audPack.data || [];
    var ah = audPack.hdr || data[0] || [];
    var idxName = _mp_findHeaderIdxCI_(ah, ['Name','Auditor','Auditor name']);
    var idxEmail = _mp_findHeaderIdxCI_(ah, ['E-mail','Email','E-mail address','Mail']);
    var idxActive = _mp_findHeaderIdxCI_(ah, ['Active','Is active']);
    var idxRole = _mp_findHeaderIdxCI_(ah, ['Role','Function']);
    var idxBW = _mp_findHeaderIdxCI_(ah, ['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
    if (idxName < 0 || idxEmail < 0 || idxActive < 0 || idxRole < 0) {
      throw new Error('Auditors headers missing (Name/E-mail/Active/Role)');
    }

    var audRow = null;
    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var nm = String(row[idxName] || '').trim().toLowerCase();
      var em = String(row[idxEmail] || '').trim().toLowerCase();
      if ((em && em === target) || (nm && nm === target)) {
        audRow = row;
        break;
      }
    }
    if (!audRow) throw new Error('Auditor not found: ' + auditorEmail);

    var active = _mp_isYes_(audRow[idxActive]);
    var role = String(audRow[idxRole] || '').trim().toLowerCase();
    var isAuditor = role === 'auditor';
    var qualified = active && isAuditor && TK3S_isAuditorQualified_R24_(ss, audRow, ah, ctx.requiredScopes);

    var name = String(audRow[idxName] || '').trim();
    var email = String(audRow[idxEmail] || '').trim();
    var maxByScope = _mp_rotationMaxByScopeFromConfig_(ss) || {};
    var strictestMax = null;
    var requiredCanonical = ctx.requiredScopes.map(function(sc) {
      try { return _mp_scopeCanonicalForRotation_(ss, sc) || sc; } catch(e) { return sc; }
    });
    requiredCanonical.forEach(function(sc) {
      var mx = maxByScope.hasOwnProperty(sc) ? Number(maxByScope[sc]) : null;
      if (mx == null || !isFinite(mx)) return;
      strictestMax = (strictestMax == null) ? mx : Math.min(strictestMax, mx);
    });

    var logIndex = _mp_buildLogIndexForCompany_(ss, ctx.companyUid, ctx.company);
    var performedByScope = _mp_rotationProfileForAuditorFromIndex_(logIndex, email || name, requiredCanonical, ctx.currentYear) || {};
    var performedCount = 0;
    var softBlockRotation = false;
    requiredCanonical.forEach(function(sc) {
      var pc = performedByScope.hasOwnProperty(sc) ? Number(performedByScope[sc] || 0) : 0;
      if (pc > performedCount) performedCount = pc;
      var mx = maxByScope.hasOwnProperty(sc) ? Number(maxByScope[sc]) : null;
      if (mx != null && isFinite(mx) && mx > 0 && pc >= mx) softBlockRotation = true;
    });

    var auditor = {
      name: name,
      email: email,
      blockedWeekdays: idxBW >= 0 ? String(audRow[idxBW] || '').trim() : '',
      isPreassigned: String(ctx.preassigned || '').trim().toLowerCase() === String(email || name).trim().toLowerCase(),
      softBlockRotation: softBlockRotation,
      nearRotationLimit: !!(strictestMax && performedCount >= Math.max(0, Number(strictestMax) - 1)),
      ineligible: !qualified,
      hardBlockQualification: !qualified,
      ineligibleReason: qualified ? '' : 'Auditor is not active, not role=auditor, or not qualified for required scopes.',
      performedByScope: performedByScope,
      performedCount: performedCount,
      maxAllowed: strictestMax,
      qualifiedCanonical: qualified,
      eligibilityOwner: 'Toolkit_Eligibility_R24_SelectedRotationMeta'
    };

    return {
      success: true,
      build: 'TOOLKIT_3S_ENDPOINTS_R24_20260516',
      endpoint: 'getToolkitRotationMetaV5',
      auditId: ctx.auditId,
      auditor: auditor,
      auditorEligibilityMeta: {
        requiredScopes: requiredCanonical,
        currentYear: ctx.currentYear,
        maxByScope: maxByScope,
        strictestMax: strictestMax,
        companyUid: ctx.companyUid,
        company: ctx.company,
        membershipMode: 'SELECTED_AUDITOR_HARD_QUALIFICATION_CHECK',
        rotationMode: 'SELECTED_AUDITOR_SOFT_METADATA_ONLY'
      },
      __serverMs: Date.now() - t0
    };
  } catch(e) {
    return {
      success: false,
      build: 'TOOLKIT_3S_ENDPOINTS_R24_20260516',
      endpoint: 'getToolkitRotationMetaV5',
      auditId: String(auditId || '').trim(),
      auditorEmail: String(auditorEmail || '').trim(),
      message: String(e && e.message ? e.message : e),
      __serverMs: Date.now() - t0
    };
  }
}

function RUN_TOOLKIT_3S_ENDPOINTS_R24_SELFTEST() {
  var out = {
    success: true,
    build: 'TOOLKIT_3S_ENDPOINTS_R24_20260516',
    functions: {
      getToolkitEligibilityLightV5: typeof getToolkitEligibilityLightV5,
      getToolkitRotationMetaV5: typeof getToolkitRotationMetaV5,
      TK3S_readAuditContext_R24_: typeof TK3S_readAuditContext_R24_
    },
    governance: {
      mutatesSheets: false,
      mutatesAvailability: false,
      mutatesStatus: false,
      openPathOwnerChanged: false
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
