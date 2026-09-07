/***********************************************************************
 * EligibilityService.gs
 *
 * d15 — namespace cleanup for d35 TEC ownership. Sheet persistence helpers retained.
 *
 * Module: EligibilityService
 * Build:  EligibilityService_d15_NAMESPACE_RENAME_20260516
 *
 * CHANGES SINCE v1 (ELIG_V1_20260501)
 *   - Bumped ELIG_MAX_CELL_CHARS to 49500 (was 45000)
 *   - Added chunked sheet storage: up to 4 cells per audit row
 *     (Eligible_Auditors_JSON, _2, _3, _4) so large eligibility blobs
 *     (typical when rotation profiles are verbose) persist correctly.
 *   - Build bump: any v1 rows in Eligibility_Cache are treated as
 *     cache-miss and recomputed cleanly.
 *
 * PURPOSE
 *   Persistent, three-layer cache for Planning Toolkit eligibility data
 *   (qualified auditors + rotation profile + scope metadata) per audit.
 *
 *   Replaces the cold-path cost of:
 *     companyConstraints  (~1.4s cold)
 *     qualifiedAuditors   (~1.0s cold, includes rotation log scan)
 *
 *   In GATE B/C this module becomes the canonical source for both the
 *   toolkit-open path (getPlanningContextV5) and the save-pad
 *   qualification guard (_mp_assertAuditorQualifiedForPlanning_).
 *   GATE A only defines and tests the module — no caller is changed.
 *
 *
 * CACHE LAYERS (lookup order)
 *   1. Exec      — in-memory, lifetime: single google.script.run call
 *   2. Script    — CacheService.getScriptCache, TTL ELIG_SCRIPT_CACHE_TTL_SEC
 *   3. Sheet     — tab "Eligibility_Cache", persistent across container recycles
 *   4. Live      — wraps existing _mp_getToolkitEligibleAuditorsForRow_
 *
 *
 * PUBLIC DTO — EligibilityResult
 *   {
 *     auditId:        string,
 *     auditors:       Array<EligibleAuditor>,
 *     meta:           EligibilityMeta,
 *     requiredScopes: Array<string>,
 *     scopesRes:      { scopes: Array<...>, scopesText: string },
 *     computedAt:     string  (ISO 8601 with seconds)
 *     computedBuild:  string  (= ELIG_BUILD at time of compute)
 *     stale:          boolean
 *     source:         'exec' | 'script' | 'sheet' | 'live'
 *   }
 *
 *   EligibleAuditor:
 *     { name, email, blockedWeekdays, isPreassigned,
 *       softBlockRotation, performedByScope, performedCount, maxAllowed }
 *
 *   EligibilityMeta:
 *     { requiredScopes, currentYear, maxByScope, strictestMax,
 *       preassigned, companyUid, company }
 *
 *   This DTO is the wire-format target for a future REST endpoint.
 *   Sheet/row-index/CacheService details never leak into this object.
 *
 *
 * INVALIDATION CONTRACT
 *   eligService_cacheInvalidate_({ auditId? , companyUid? , all? })
 *     - auditId    — invalidate one entry
 *     - companyUid — invalidate all entries for that company
 *     - all        — invalidate everything (use sparingly: Auditors,
 *                    Standards, Config_Scopes edits)
 *   Invalidation marks Stale=1 in the sheet and clears script+exec
 *   layers. The compute happens lazily on next read.
 *
 *
 * SAFETY GUARANTEES
 *   - File is purely additive. No existing function is modified.
 *   - All external dependencies (functions defined in other backend
 *     files) are typeof-guarded. File parses safely in any project.
 *   - elig_compute_ wraps the existing canonical eligibility function
 *     and produces output structurally identical to current production.
 *   - Sheet bootstrap is idempotent and never destructive.
 *
 *
 * MIGRATION-FRIENDLY ORGANISATION
 *   Storage adapter (cacheRead/cacheWrite/cacheInvalidate) is a thin
 *   layer. Replacing Sheet+CacheService with Postgres+Redis is a
 *   self-contained substitution; callers use the public DTO only.
 ***********************************************************************/


/* =================================================================
 * SECTION 1 — CONSTANTS
 * ================================================================= */

var ELIG_BUILD = 'EligibilityService_d16_FORCE_REFRESH_20260702';
var ELIG_SHEET_NAME              = 'Eligibility_Cache';
var ELIG_SCRIPT_CACHE_TTL_SEC    = 1500;           // 25 minutes (d14: > full warmer pass 16min)
var ELIG_SCRIPT_CACHE_KEY_PREFIX = 'MP_ELIG::';
var ELIG_MAX_CELL_CHARS          = 49500;          // Apps Script cell limit is 50000
var ELIG_MAX_AUDITORS_CHUNKS     = 4;              // 4 * 49500 = ~198KB headroom
var ELIG_TZ_FALLBACK             = 'Europe/Madrid';

/**
 * Column order MUST match this array. Sheet bootstrap creates them in
 * this order; reads are by header lookup so manual reordering still
 * works. Any header rename invalidates all rows (treated as miss).
 *
 * v2: added Eligible_Auditors_JSON_2/_3/_4 for chunked storage.
 */
var ELIG_HEADERS = [
  'Audit_ID',
  'Company_UID',
  'Scopes_Hash',
  'Eligible_Auditors_JSON',
  'Eligible_Auditors_JSON_2',
  'Eligible_Auditors_JSON_3',
  'Eligible_Auditors_JSON_4',
  'Eligibility_Meta_JSON',
  'Computed_At',
  'Computed_Build',
  'Stale',
  'Source_Mtime_Hash',
  'Notes'
];

var ELIG_AUDITORS_CHUNK_HEADERS = [
  'Eligible_Auditors_JSON',
  'Eligible_Auditors_JSON_2',
  'Eligible_Auditors_JSON_3',
  'Eligible_Auditors_JSON_4'
];


/* =================================================================
 * SECTION 2 — SAFE EXTERNAL DEPENDENCY ACCESS
 *
 * All references to functions defined in other backend files go
 * through these guards so this file never breaks at parse time.
 * ================================================================= */

function elig_dep_findCol_(hdr, names) {
  if (typeof _mp_findCol_ === 'function') {
    return _mp_findCol_(hdr, names);
  }
  // Defensive fallback (header-insensitive substring match).
  if (!hdr || !hdr.length || !names || !names.length) return -1;
  for (var i = 0; i < hdr.length; i++) {
    var h = String(hdr[i] || '').trim().toLowerCase();
    for (var j = 0; j < names.length; j++) {
      var n = String(names[j] || '').trim().toLowerCase();
      if (n && h === n) return i;
    }
  }
  for (var ii = 0; ii < hdr.length; ii++) {
    var hh = String(hdr[ii] || '').trim().toLowerCase();
    for (var jj = 0; jj < names.length; jj++) {
      var nn = String(names[jj] || '').trim().toLowerCase();
      if (nn && hh.indexOf(nn) >= 0) return ii;
    }
  }
  return -1;
}

function elig_dep_getAuditPlanningPack_(ss) {
  if (typeof __mp_getSheetDataCached_ === 'function') {
    return __mp_getSheetDataCached_(ss, 'Audit planning');
  }
  // Fallback: direct read.
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { sh: null, data: [], hdr: [] };
  var data = sh.getDataRange().getValues();
  return { sh: sh, data: data, hdr: data[0] || [] };
}

function elig_dep_resetExecCache_() {
  if (typeof __mp_resetExecCache_ === 'function') {
    try { __mp_resetExecCache_(); } catch (e) {}
  }
}

function elig_dep_eligibleAuditorsForRow_(ss, hdr, row, preassignedName) {
  if (typeof _mp_getToolkitEligibleAuditorsForRow_ !== 'function') {
    throw new Error('EligibilityService: dependency _mp_getToolkitEligibleAuditorsForRow_ is missing');
  }
  return _mp_getToolkitEligibleAuditorsForRow_(ss, hdr || [], row || [], preassignedName || '');
}


/* =================================================================
 * SECTION 3 — UTILITIES
 * ================================================================= */

function elig_util_now_() {
  var tz = ELIG_TZ_FALLBACK;
  try { tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || tz; } catch (e) {}
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
}

function elig_util_sha1_(input) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    String(input == null ? '' : input)
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    var s = v.toString(16);
    hex += (s.length === 1 ? '0' : '') + s;
  }
  return hex;
}

function elig_util_hashScopes_(scopeArray) {
  var arr = (scopeArray || [])
    .map(function (x) { return String(x || '').trim().toLowerCase(); })
    .filter(function (x) { return !!x; });
  arr.sort();
  return elig_util_sha1_(arr.join('|'));
}

function elig_util_safeJsonStringify_(obj) {
  try {
    return JSON.stringify(obj == null ? null : obj);
  } catch (e) {
    return JSON.stringify({ __serializeError: String(e && e.message || e) });
  }
}

function elig_util_safeJsonParse_(s) {
  if (s == null || s === '') return null;
  try { return JSON.parse(String(s)); } catch (e) { return null; }
}

/**
 * Splits a string into N chunks, each at most maxChars long.
 * Returns array of N strings; empty strings pad to maxChunks.
 * If string exceeds maxChars*maxChunks, returns null.
 */
function elig_util_chunkString_(s, maxChars, maxChunks) {
  s = String(s == null ? '' : s);
  if (s.length === 0) {
    var empty = [];
    for (var z = 0; z < maxChunks; z++) empty.push('');
    return empty;
  }
  if (s.length > maxChars * maxChunks) return null;

  var out = [];
  for (var i = 0; i < s.length; i += maxChars) {
    out.push(s.substring(i, i + maxChars));
  }
  while (out.length < maxChunks) out.push('');
  return out;
}

function elig_util_assembleChunks_(chunks) {
  if (!chunks || !chunks.length) return '';
  var parts = [];
  for (var i = 0; i < chunks.length; i++) {
    var c = chunks[i];
    if (c == null || c === '') continue;
    parts.push(String(c));
  }
  return parts.join('');
}


/* =================================================================
 * SECTION 4 — SHEET BOOTSTRAP (idempotent)
 * ================================================================= */

function elig_bootstrapSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ELIG_SHEET_NAME);
  var created = false;

  if (!sh) {
    sh = ss.insertSheet(ELIG_SHEET_NAME);
    sh.getRange(1, 1, 1, ELIG_HEADERS.length).setValues([ELIG_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ELIG_HEADERS.length).setFontWeight('bold');
    try { sh.hideSheet(); } catch (e) {}
    created = true;
    return { ok: true, created: true, sheetName: ELIG_SHEET_NAME, headers: ELIG_HEADERS.slice() };
  }

  var lastCol = sh.getLastColumn();
  var existingHeaders = (lastCol > 0)
    ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v || '').trim(); })
    : [];

  var missing = [];
  for (var i = 0; i < ELIG_HEADERS.length; i++) {
    if (existingHeaders.indexOf(ELIG_HEADERS[i]) < 0) missing.push(ELIG_HEADERS[i]);
  }

  if (missing.length) {
    var startCol = (lastCol || 0) + 1;
    var add = missing.length;
    sh.getRange(1, startCol, 1, add).setValues([missing]);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  }

  return {
    ok: true,
    created: created,
    sheetName: ELIG_SHEET_NAME,
    headers: ELIG_HEADERS.slice(),
    addedHeaders: missing
  };
}

function elig_sheet_getOrThrow_(autoBootstrap) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(ELIG_SHEET_NAME);
  if (sh) return sh;
  if (autoBootstrap) {
    elig_bootstrapSheet_();
    sh = ss.getSheetByName(ELIG_SHEET_NAME);
    if (sh) return sh;
  }
  throw new Error("EligibilityService: sheet '" + ELIG_SHEET_NAME + "' not found. Run elig_bootstrapSheet_().");
}

function elig_sheet_headerMap_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return { idx: {}, lastCol: 0 };
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var i = 0; i < hdr.length; i++) {
    var name = String(hdr[i] || '').trim();
    if (name) idx[name] = i; // 0-based
  }
  return { idx: idx, lastCol: lastCol, hdr: hdr };
}

function elig_sheet_assertAllHeadersPresent_(headerMap) {
  for (var i = 0; i < ELIG_HEADERS.length; i++) {
    if (!headerMap.idx.hasOwnProperty(ELIG_HEADERS[i])) {
      return { ok: false, missing: ELIG_HEADERS[i] };
    }
  }
  return { ok: true };
}


/* =================================================================
 * SECTION 5 — EXEC LAYER (in-memory)
 * ================================================================= */

// Scoped to single google.script.run execution. Reset by elig_resetExec_.
var __ELIG_EXEC_MAP__ = {};

function elig_resetExec_() {
  __ELIG_EXEC_MAP__ = {};
}

function elig_exec_get_(auditId) {
  var k = String(auditId || '').trim();
  if (!k) return null;
  return __ELIG_EXEC_MAP__.hasOwnProperty(k) ? __ELIG_EXEC_MAP__[k] : null;
}

function elig_exec_put_(auditId, payload) {
  var k = String(auditId || '').trim();
  if (!k || !payload) return;
  __ELIG_EXEC_MAP__[k] = payload;
}

function elig_exec_remove_(auditId) {
  var k = String(auditId || '').trim();
  if (k && __ELIG_EXEC_MAP__.hasOwnProperty(k)) delete __ELIG_EXEC_MAP__[k];
}

function elig_exec_clear_() {
  __ELIG_EXEC_MAP__ = {};
}


/* =================================================================
 * SECTION 6 — SCRIPT CACHE LAYER (CacheService)
 * ================================================================= */

function elig_script_key_(auditId) {
  var generation = 'GEN_LEGACY';

  try {
    if (typeof AUDITOR_SCOPE_getCacheGeneration_ === 'function') {
      generation = AUDITOR_SCOPE_getCacheGeneration_();
    }
  } catch (e) {}

  return ELIG_SCRIPT_CACHE_KEY_PREFIX +
         String(auditId || '').trim() +
         '::' +
         ELIG_BUILD +
         '::' +
         generation;
}

function elig_script_get_(auditId) {
  try {
    var raw = CacheService.getScriptCache().get(elig_script_key_(auditId));
    if (!raw) return null;
    var obj = elig_util_safeJsonParse_(raw);
    if (!obj) return null;
    if (obj.computedBuild !== ELIG_BUILD) return null;
    return obj;
  } catch (e) {
    return null;
  }
}

function elig_script_put_(auditId, payload) {
  try {
    var s = elig_util_safeJsonStringify_(payload);
    if (s.length > 100000) return false; // CacheService per-key limit
    CacheService.getScriptCache().put(
      elig_script_key_(auditId),
      s,
      ELIG_SCRIPT_CACHE_TTL_SEC
    );
    return true;
  } catch (e) {
    return false;
  }
}

function elig_script_remove_(auditId) {
  try { CacheService.getScriptCache().remove(elig_script_key_(auditId)); } catch (e) {}
}

function elig_script_removeMany_(auditIds) {
  if (!auditIds || !auditIds.length) return;
  var keys = [];
  for (var i = 0; i < auditIds.length; i++) {
    keys.push(elig_script_key_(auditIds[i]));
  }
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) {}
}


/* =================================================================
 * SECTION 7 — SHEET CACHE LAYER (Eligibility_Cache tab)
 * v2: chunked auditors-blob storage
 * ================================================================= */

function elig_sheet_findRowIndexForAuditId_(sh, auditId) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var hm = elig_sheet_headerMap_(sh);
  if (!hm.idx.hasOwnProperty('Audit_ID')) return -1;
  var aiCol = hm.idx['Audit_ID'] + 1; // 1-based
  var values = sh.getRange(2, aiCol, lastRow - 1, 1).getValues();
  var target = String(auditId || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) return i + 2; // 1-based row
  }
  return -1;
}

function elig_sheet_get_(auditId) {
  var sh;
  try { sh = elig_sheet_getOrThrow_(false); } catch (e) { return null; }

  var hm = elig_sheet_headerMap_(sh);
  var hdrCheck = elig_sheet_assertAllHeadersPresent_(hm);
  if (!hdrCheck.ok) return null;

  var rowIx = elig_sheet_findRowIndexForAuditId_(sh, auditId);
  if (rowIx < 0) return null;

  var rowVals = sh.getRange(rowIx, 1, 1, hm.lastCol).getValues()[0];

  function cell(name) {
    var i = hm.idx[name];
    return (typeof i === 'number') ? rowVals[i] : '';
  }

  var build = String(cell('Computed_Build') || '').trim();
  if (build !== ELIG_BUILD) {
    // Stale due to deploy/version bump — treat as miss.
    return null;
  }

  var currentGeneration = 'GEN_LEGACY';

  try {
    if (typeof AUDITOR_SCOPE_getCacheGeneration_ === 'function') {
      currentGeneration = AUDITOR_SCOPE_getCacheGeneration_();
    }
  } catch (eGen) {}

  var notes = String(cell('Notes') || '').trim();

  if (
    notes &&
    notes.indexOf('auditorScopeGeneration=') >= 0 &&
    notes.indexOf('auditorScopeGeneration=' + currentGeneration) < 0
  ) {
    return null;
  }

  // Assemble auditors blob from up to 4 chunks (v2).
  var chunks = [];
  for (var c = 0; c < ELIG_AUDITORS_CHUNK_HEADERS.length; c++) {
    chunks.push(cell(ELIG_AUDITORS_CHUNK_HEADERS[c]));
  }
  var auditorsRaw = elig_util_assembleChunks_(chunks);
  var auditorsParsed = elig_util_safeJsonParse_(auditorsRaw);
  var metaParsed     = elig_util_safeJsonParse_(cell('Eligibility_Meta_JSON'));

  if (!auditorsParsed || !metaParsed) return null;

  return {
    auditId:        String(auditId || '').trim(),
    auditors:       (auditorsParsed && auditorsParsed.auditors) ? auditorsParsed.auditors : (Array.isArray(auditorsParsed) ? auditorsParsed : []),
    meta:           (metaParsed && metaParsed.meta) ? metaParsed.meta : (metaParsed || {}),
    requiredScopes: (metaParsed && metaParsed.requiredScopes) ? metaParsed.requiredScopes : ((metaParsed && metaParsed.meta && metaParsed.meta.requiredScopes) || []),
    scopesRes:      (metaParsed && metaParsed.scopesRes) ? metaParsed.scopesRes : { scopes: [], scopesText: '' },
    computedAt:     String(cell('Computed_At') || ''),
    computedBuild:  build,
    stale:          String(cell('Stale') || '').trim() === '1',
    source:         'sheet'
  };
}

function elig_sheet_put_(auditId, payload) {
  var sh = elig_sheet_getOrThrow_(true);
  var hm = elig_sheet_headerMap_(sh);
  var hdrCheck = elig_sheet_assertAllHeadersPresent_(hm);
  if (!hdrCheck.ok) {
    elig_bootstrapSheet_();
    hm = elig_sheet_headerMap_(sh);
    hdrCheck = elig_sheet_assertAllHeadersPresent_(hm);
    if (!hdrCheck.ok) {
      Logger.log('EligibilityService: sheet headers still missing after bootstrap: ' + hdrCheck.missing);
      return false;
    }
  }

  var auditorsBlob = elig_util_safeJsonStringify_({ auditors: payload.auditors || [] });
  var metaBlob = elig_util_safeJsonStringify_({
    meta:           payload.meta || {},
    requiredScopes: payload.requiredScopes || [],
    scopesRes:      payload.scopesRes || { scopes: [], scopesText: '' }
  });

  if (metaBlob.length > ELIG_MAX_CELL_CHARS) {
    Logger.log('EligibilityService: meta blob exceeds cell limit for ' + auditId + ' (' + metaBlob.length + ' chars). Skipping sheet write.');
    return false;
  }

  var auditorsChunks = elig_util_chunkString_(auditorsBlob, ELIG_MAX_CELL_CHARS, ELIG_MAX_AUDITORS_CHUNKS);
  var degradedNote = '';
  if (!auditorsChunks) {
    Logger.log('EligibilityService: auditors blob exceeds chunked-storage capacity for ' + auditId + ' (' + auditorsBlob.length + ' chars > ' + (ELIG_MAX_CELL_CHARS * ELIG_MAX_AUDITORS_CHUNKS) + '). Sheet write skipped; script cache still active.');
    return false;
  }

  var chunksUsed = 0;
  for (var k = 0; k < auditorsChunks.length; k++) {
    if (auditorsChunks[k] && auditorsChunks[k].length) chunksUsed++;
  }
  if (chunksUsed > 1) {
    degradedNote = 'chunks=' + chunksUsed + ' (auditorsBlob=' + auditorsBlob.length + ' chars)';
  }

  var values = new Array(hm.lastCol);
  for (var z = 0; z < values.length; z++) values[z] = '';

  function set(name, v) {
    var i = hm.idx[name];
    if (typeof i === 'number') values[i] = (v == null ? '' : v);
  }

  set('Audit_ID',               String(auditId || '').trim());
  set('Company_UID',            (payload.meta && payload.meta.companyUid) || '');
  set('Scopes_Hash',            elig_util_hashScopes_(payload.requiredScopes || []));
  set('Eligible_Auditors_JSON',   auditorsChunks[0] || '');
  set('Eligible_Auditors_JSON_2', auditorsChunks[1] || '');
  set('Eligible_Auditors_JSON_3', auditorsChunks[2] || '');
  set('Eligible_Auditors_JSON_4', auditorsChunks[3] || '');
  set('Eligibility_Meta_JSON',  metaBlob);
  set('Computed_At',            payload.computedAt || elig_util_now_());
  set('Computed_Build',         payload.computedBuild || ELIG_BUILD);
  set('Stale',                  '0');
  set('Source_Mtime_Hash',      payload.sourceMtimeHash || '');
  var genForNotes = 'GEN_LEGACY';

  try {
    if (typeof AUDITOR_SCOPE_getCacheGeneration_ === 'function') {
      genForNotes = AUDITOR_SCOPE_getCacheGeneration_();
    }
  } catch (eGen2) {}

  var noteParts = [];

  if (payload.notes) {
    noteParts.push(String(payload.notes));
  }

  if (degradedNote) {
    noteParts.push(String(degradedNote));
  }

  noteParts.push(
    'auditorScopeGeneration=' + genForNotes
  );

  set(
    'Notes',
    noteParts.join(' | ')
  );

  var rowIx = elig_sheet_findRowIndexForAuditId_(sh, auditId);
  if (rowIx > 0) {
    sh.getRange(rowIx, 1, 1, hm.lastCol).setValues([values]);
  } else {
    sh.appendRow(values);
  }
  return true;
}

function elig_sheet_markStale_(opts) {
  opts = opts || {};
  var sh;
  try { sh = elig_sheet_getOrThrow_(false); } catch (e) { return { ok: false, reason: 'no-sheet' }; }
  var hm = elig_sheet_headerMap_(sh);
  if (!hm.idx.hasOwnProperty('Audit_ID') || !hm.idx.hasOwnProperty('Stale')) {
    return { ok: false, reason: 'missing-headers' };
  }
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, marked: 0 };

  var aiColIx  = hm.idx['Audit_ID'];
  var cuColIx  = hm.idx['Company_UID'];
  var stColIx  = hm.idx['Stale'];

  var range = sh.getRange(2, 1, lastRow - 1, hm.lastCol);
  var data = range.getValues();
  var marked = 0;
  var auditIds = [];

  var matchAuditId = opts.auditId   ? String(opts.auditId).trim()                  : '';
  var matchCompany = opts.companyUid ? String(opts.companyUid).trim().toLowerCase() : '';
  var matchAll     = !!opts.all;

  for (var r = 0; r < data.length; r++) {
    var rowAi = String(data[r][aiColIx] || '').trim();
    if (!rowAi) continue;
    var rowCu = String(data[r][cuColIx] || '').trim().toLowerCase();
    var hit = false;
    if (matchAll) hit = true;
    else if (matchAuditId && rowAi === matchAuditId) hit = true;
    else if (matchCompany && rowCu === matchCompany) hit = true;
    if (hit && data[r][stColIx] !== '1') {
      data[r][stColIx] = '1';
      marked++;
      auditIds.push(rowAi);
    }
  }

  if (marked > 0) {
    range.setValues(data);
  }

  return { ok: true, marked: marked, auditIds: auditIds };
}


/* =================================================================
 * SECTION 8 — UNIFIED CACHE FACADE
 * ================================================================= */

function eligService_cacheRead_(auditId) {
  var key = String(auditId || '').trim();
  if (!key) return null;

  // 1. Exec
  var hit = elig_exec_get_(key);
  if (hit) {
    hit.source = 'exec';
    return hit;
  }

  // 2. Script
  hit = elig_script_get_(key);
  if (hit) {
    hit.source = 'script';
    elig_exec_put_(key, hit);
    return hit;
  }

  // 3. Sheet
  hit = elig_sheet_get_(key);
  if (hit) {
    hit.source = 'sheet';
    elig_script_put_(key, hit);
    elig_exec_put_(key, hit);
    return hit;
  }

  return null;
}

function eligService_cacheWrite_(auditId, payload) {
  var key = String(auditId || '').trim();
  if (!key || !payload) return { ok: false, reason: 'missing-args' };

  var enriched = {
    auditId:        key,
    auditors:       payload.auditors || [],
    meta:           payload.meta || {},
    requiredScopes: payload.requiredScopes || [],
    scopesRes:      payload.scopesRes || { scopes: [], scopesText: '' },
    computedAt:     payload.computedAt || elig_util_now_(),
    computedBuild:  payload.computedBuild || ELIG_BUILD,
    stale:          false,
    source:         'live'
  };

  var sheetOk = false;
  try {
    sheetOk = elig_sheet_put_(key, enriched);
  } catch (e) {
    Logger.log('EligibilityService: sheet write failed for ' + key + ': ' + e);
  }
  var scriptOk = elig_script_put_(key, enriched);
  elig_exec_put_(key, enriched);

  return { ok: true, sheetWritten: !!sheetOk, scriptWritten: !!scriptOk };
}

function eligService_cacheInvalidate_(scope) {
  scope = scope || {};
  var result = {
    requested: { auditId: scope.auditId || '', companyUid: scope.companyUid || '', all: !!scope.all },
    sheet: null,
    script: { removed: 0 },
    exec: { removed: 0 }
  };

  var sheetRes = elig_sheet_markStale_(scope);
  result.sheet = sheetRes;

  var affectedIds = (sheetRes && sheetRes.auditIds) ? sheetRes.auditIds.slice() : [];

  if (scope.all) {
    elig_exec_clear_();
    result.exec.removed = -1;
  } else {
    for (var i = 0; i < affectedIds.length; i++) {
      elig_exec_remove_(affectedIds[i]);
      result.exec.removed++;
    }
    if (scope.auditId && affectedIds.indexOf(scope.auditId) < 0) {
      elig_exec_remove_(scope.auditId);
      result.exec.removed++;
      affectedIds.push(scope.auditId);
    }
  }

  if (affectedIds.length) {
    elig_script_removeMany_(affectedIds);
    result.script.removed = affectedIds.length;
  } else if (scope.all) {
    result.script.note = 'CacheService cluster keys for "all" expire by TTL or via ELIG_BUILD bump.';
  }

  return result;
}


/* =================================================================
 * SECTION 9 — LIVE COMPUTE (wraps existing canonical function)
 * ================================================================= */

/**
 * Looks up audit by ID, calls the canonical eligibility computation,
 * normalises into EligibilityResult shape. Source 'live'.
 *
 * Throws on missing audit / dependency. Caller decides whether to
 * cache the result.
 */
function elig_compute_(auditId) {
  var id = String(auditId || '').trim();
  if (!id) throw new Error('elig_compute_: missing auditId');

  var ss = SpreadsheetApp.getActive();
  var pack = elig_dep_getAuditPlanningPack_(ss);
  var data = (pack && pack.data) || [];
  var hdr  = (pack && pack.hdr)  || (data[0] || []);
  if (!data.length) throw new Error("elig_compute_: 'Audit planning' sheet empty or missing");

  var colAI = elig_dep_findCol_(hdr, ['Audit ID']);
  if (colAI < 0) throw new Error("elig_compute_: 'Audit ID' column missing in 'Audit planning'");

  var row = null;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][colAI] || '').trim() === id) { row = data[r]; break; }
  }
  if (!row) throw new Error('elig_compute_: audit not found: ' + id);

  // Look up preassigned auditor from row (mirrors getPlanningContextV5).
  var preassigned = '';
  var colPre = -1;
  for (var i = 0; i < hdr.length; i++) {
    var hh = String(hdr[i] || '').trim().toLowerCase();
    if (hh.indexOf('pre') >= 0 && hh.indexOf('assigned') >= 0 && hh.indexOf('auditor') >= 0) {
      colPre = i;
      break;
    }
  }
  if (colPre >= 0) preassigned = String(row[colPre] || '').trim();

  var pack2 = elig_dep_eligibleAuditorsForRow_(ss, hdr, row, preassigned);

  var nowIso = elig_util_now_();
  return {
    auditId:        id,
    auditors:       (pack2 && pack2.auditors) ? pack2.auditors : [],
    meta:           (pack2 && pack2.meta) ? pack2.meta : {},
    requiredScopes: (pack2 && pack2.requiredScopes) ? pack2.requiredScopes : [],
    scopesRes:      (pack2 && pack2.scopesRes) ? pack2.scopesRes : { scopes: [], scopesText: '' },
    computedAt:     nowIso,
    computedBuild:  ELIG_BUILD,
    stale:          false,
    source:         'live'
  };
}


/* =================================================================
 * SECTION 10 — TOP-LEVEL ENTRY (for GATE B/C wiring)
 * ================================================================= */

/**
 * Cache-first read with lazy compute on miss.
 *
 * Behaviour:
 *   - Returns cached payload when present and fresh (Stale=0).
 *   - On miss: computes, writes to all 3 layers, returns fresh.
 *   - On stale-hit: returns cached payload immediately (callers may
 *     trigger a background refresh by calling elig_refreshAsync_).
 *   - Throws only on hard errors (missing audit, missing deps).
 */
function elig_getOrCompute_(auditId) {
  var hit = eligService_cacheRead_(auditId);
  if (hit && !hit.stale) return hit;

  var fresh = elig_compute_(auditId);
  eligService_cacheWrite_(auditId, fresh);
  return fresh;
}


/* =================================================================
 * SECTION 11 — NIGHTLY WARM-UP HANDLER
 *
 * NOT installed as a trigger in GATE A. Manual run only.
 * Will be installed via ScriptApp in GATE C.
 * ================================================================= */

/**
 * Iterates rows in 'Audit planning' and warms eligibility cache for each.
 *
 * Apps Script trigger budget is 6 minutes. This handler is designed for
 * manual invocation from the editor in GATE A. In GATE C it gets a
 * batched + resumable variant via PropertiesService.
 *
 * Options:
 *   { limit?: number, statusInclude?: Array<string>, dryRun?: boolean }
 */
function nightly_warmEligibilityCache_(options) {
  options = options || {};
  var limit = (typeof options.limit === 'number' && options.limit > 0) ? options.limit : 9999;
  var dryRun = !!options.dryRun;
  var includeSet = null;
  if (options.statusInclude && options.statusInclude.length) {
    includeSet = {};
    for (var i = 0; i < options.statusInclude.length; i++) {
      includeSet[String(options.statusInclude[i] || '').trim().toLowerCase()] = true;
    }
  }

  elig_resetExec_();
  elig_dep_resetExecCache_();

  var t0 = Date.now();
  var ss = SpreadsheetApp.getActive();
  var pack = elig_dep_getAuditPlanningPack_(ss);
  var data = (pack && pack.data) || [];
  var hdr  = (pack && pack.hdr)  || (data[0] || []);

  if (data.length < 2) {
    return { ok: false, reason: 'audit-planning-empty' };
  }

  var colAI     = elig_dep_findCol_(hdr, ['Audit ID']);
  var colStatus = elig_dep_findCol_(hdr, ['Status']);
  if (colAI < 0) return { ok: false, reason: 'missing-audit-id-col' };

  var processed = 0;
  var skipped = 0;
  var errors = [];
  var samples = [];
  var sheetWriteFailures = 0;

  for (var r = 1; r < data.length && processed < limit; r++) {
    var auditId = String(data[r][colAI] || '').trim();
    if (!auditId) { skipped++; continue; }

    if (includeSet && colStatus >= 0) {
      var st = String(data[r][colStatus] || '').trim().toLowerCase();
      if (!includeSet[st]) { skipped++; continue; }
    }

    if (dryRun) {
      samples.push({ auditId: auditId, action: 'would-compute' });
      processed++;
      continue;
    }

    try {
      var fresh = elig_compute_(auditId);
      var w = eligService_cacheWrite_(auditId, fresh);
      if (!w.sheetWritten) sheetWriteFailures++;
      processed++;
      if (samples.length < 5) {
        samples.push({
          auditId: auditId,
          auditors: (fresh.auditors || []).length,
          requiredScopes: (fresh.requiredScopes || []).length,
          sheetWritten: !!w.sheetWritten,
          scriptWritten: !!w.scriptWritten
        });
      }
    } catch (e) {
      errors.push({ auditId: auditId, message: String(e && e.message || e) });
    }

    if (Date.now() - t0 > 5 * 60 * 1000) {
      return {
        ok: true,
        processed: processed,
        skipped: skipped,
        errors: errors,
        samples: samples,
        sheetWriteFailures: sheetWriteFailures,
        truncated: true,
        reason: 'time-budget'
      };
    }
  }

  return {
    ok: true,
    processed: processed,
    skipped: skipped,
    errors: errors,
    samples: samples,
    sheetWriteFailures: sheetWriteFailures,
    elapsedMs: Date.now() - t0,
    dryRun: dryRun
  };
}


/* =================================================================
 * SECTION 12 — GATE A TEST FUNCTIONS
 *
 * Manual run from Apps Script editor. Each returns a JSON-friendly
 * report you can read in the execution log. Each also calls Logger.log
 * so individual runs are visible.
 * ================================================================= */

function GATE_A_TEST_bootstrap() {
  var res = elig_bootstrapSheet_();
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

function GATE_A_TEST_writeOne(auditId) {
  if (!auditId) {
    var msg = "Pass an Audit ID, e.g. GATE_A_TEST_writeOne('AUD_TEST_PendingPlanning_HQ_...')";
    Logger.log(msg);
    return { ok: false, message: msg };
  }
  elig_resetExec_();
  elig_dep_resetExecCache_();
  var t0 = Date.now();
  try {
    var fresh = elig_compute_(auditId);
    var w = eligService_cacheWrite_(auditId, fresh);
    var report = {
      ok: true,
      auditId: auditId,
      elapsedMs: Date.now() - t0,
      auditorsCount: (fresh.auditors || []).length,
      requiredScopes: fresh.requiredScopes || [],
      meta: fresh.meta || {},
      cacheWrite: w
    };
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  } catch (e) {
    var err = { ok: false, auditId: auditId, error: String(e && e.message || e), elapsedMs: Date.now() - t0 };
    Logger.log(JSON.stringify(err, null, 2));
    return err;
  }
}

function GATE_A_TEST_readOne(auditId) {
  if (!auditId) return { ok: false, message: "Pass an Audit ID" };

  elig_resetExec_();
  var execHit = elig_exec_get_(auditId);
  var scriptHit = elig_script_get_(auditId);
  var sheetHit = elig_sheet_get_(auditId);

  elig_resetExec_();
  var unified = eligService_cacheRead_(auditId);

  var report = {
    auditId: auditId,
    layerExec_BeforeRead:   execHit ? { found: true, source: execHit.source, auditors: (execHit.auditors||[]).length } : { found: false },
    layerScript:            scriptHit ? { found: true, computedBuild: scriptHit.computedBuild, auditors: (scriptHit.auditors||[]).length } : { found: false },
    layerSheet:             sheetHit ? { found: true, computedBuild: sheetHit.computedBuild, computedAt: sheetHit.computedAt, stale: sheetHit.stale, auditors: (sheetHit.auditors||[]).length } : { found: false },
    unified_FacadeResult:   unified ? { found: true, source: unified.source, auditors: (unified.auditors||[]).length, stale: unified.stale } : { found: false }
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function GATE_A_TEST_compareOutput(auditId) {
  if (!auditId) return { ok: false, message: "Pass an Audit ID" };

  elig_resetExec_();
  elig_dep_resetExecCache_();
  var live = elig_compute_(auditId);

  elig_resetExec_();
  elig_dep_resetExecCache_();
  var cached = eligService_cacheRead_(auditId);
  if (!cached) {
    return { ok: false, message: "No cache entry yet. Run GATE_A_TEST_writeOne first." };
  }

  function normAuditor(a) {
    return {
      name: String(a.name || '').trim().toLowerCase(),
      email: String(a.email || '').trim().toLowerCase(),
      isPreassigned: !!a.isPreassigned,
      softBlockRotation: !!a.softBlockRotation,
      performedCount: Number(a.performedCount || 0),
      maxAllowed: a.maxAllowed == null ? null : Number(a.maxAllowed)
    };
  }
  function normSet(arr) {
    return (arr || []).map(normAuditor).sort(function (a, b) {
      return (a.email || a.name).localeCompare(b.email || b.name);
    });
  }

  var liveSet = normSet(live.auditors);
  var cachedSet = normSet(cached.auditors);

  var differences = [];
  if (liveSet.length !== cachedSet.length) {
    differences.push({ field: 'auditorsCount', live: liveSet.length, cached: cachedSet.length });
  }
  var max = Math.max(liveSet.length, cachedSet.length);
  for (var i = 0; i < max; i++) {
    var L = liveSet[i] || null;
    var C = cachedSet[i] || null;
    if (!L || !C) {
      differences.push({ idx: i, live: L, cached: C });
      continue;
    }
    for (var k in L) {
      if (L.hasOwnProperty(k) && JSON.stringify(L[k]) !== JSON.stringify(C[k])) {
        differences.push({ idx: i, key: k, live: L[k], cached: C[k] });
      }
    }
  }

  var liveScopes   = (live.requiredScopes || []).slice().sort();
  var cachedScopes = (cached.requiredScopes || []).slice().sort();
  if (JSON.stringify(liveScopes) !== JSON.stringify(cachedScopes)) {
    differences.push({ field: 'requiredScopes', live: liveScopes, cached: cachedScopes });
  }

  var report = {
    ok: differences.length === 0,
    auditId: auditId,
    cachedSource: cached.source,
    cachedComputedAt: cached.computedAt,
    differences: differences
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function GATE_A_TEST_invalidateOne(auditId) {
  if (!auditId) return { ok: false, message: "Pass an Audit ID" };
  var inv = eligService_cacheInvalidate_({ auditId: auditId });
  var afterRead = eligService_cacheRead_(auditId);
  var report = {
    auditId: auditId,
    invalidate: inv,
    afterRead: afterRead ? { found: true, source: afterRead.source, stale: afterRead.stale } : { found: false }
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function GATE_A_TEST_warmFirst(N) {
  N = Number(N || 5);
  var res = nightly_warmEligibilityCache_({ limit: N });
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

function GATE_A_TEST_warmDryRun() {
  var res = nightly_warmEligibilityCache_({ dryRun: true });
  Logger.log(JSON.stringify({
    ok: res.ok,
    wouldProcess: res.processed,
    skipped: res.skipped,
    elapsedMs: res.elapsedMs
  }, null, 2));
  return res;
}


/* =================================================================
 * END OF FILE
 *
 * Next phase (GATE B) will:
 *   - Add ELIG_CACHE_ENABLED_OPEN feature flag
 *   - Modify getPlanningContextV5 to call elig_getOrCompute_
 *   - Add invalidation hooks to saveManagerPlanning, saveAuditor,
 *     addNewCompany, updateCompany
 *   - Compare measurements against current production
 * ================================================================= */
