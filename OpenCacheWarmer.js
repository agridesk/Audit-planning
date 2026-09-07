/**
 * OpenCacheWarmer_d2_D35_AWARE_STAGE2_20260517.gs
 *
 * GATE E (v5) — warm-all-eligible. Stage 4 added: every audit also
 *               warms calendar for ALL eligible (non-preassigned)
 *               auditors x 4 months. Dedup Set across the whole run
 *               keeps the call count to UNIQUE (email, monthKey)
 *               combos so cost scales with auditors x months, not
 *               audits x auditors x months.
 *               Result: dropdown-switch in UI hits sheet cache for
 *               every eligible auditor (consistent fast). No UI flow
 *               change needed.
 *
 * GATE D (v4) — calendar cache sheet-persistence + 4-month warming.
 *               Adds MP_CAL_SHEET_GET/PUT/INVALIDATE so calendar
 *               availability survives container/script-cache evictions.
 *               Warmer now warms 4 months × assigned auditor (was 1).
 *               Result: month-switching consistently fast for the
 *               assigned auditor's first 4 months without depending on
 *               the volatile 5-min CacheService TTL.
 *
 * GATE C+ (v3) — adds elig + calendar maand-1 warming to the nightly
 *                pre-warm cycle.
 *
 * GATE C — sheet-persistent cache layer for getToolkitOpenFastV5 +
 *          nightly pre-warm trigger for all PendingPlanning audits.
 *
 * Design:
 *   - Public API consumed by ManagerPlanningBackend_GATE_C_v1+:
 *       MP_OPEN_SHEET_GET(auditId)              -> payload | null
 *       MP_OPEN_SHEET_PUT(auditId, payload)     -> bool
 *       MP_OPEN_SHEET_INVALIDATE(auditId)       -> bool
 *   - Public API consumed by ManagerPlanningBackend_GATE_D_v1+ (calendar):
 *       MP_CAL_SHEET_GET(email, monthKey)              -> payload | null
 *       MP_CAL_SHEET_PUT(email, monthKey, payload)     -> bool
 *       MP_CAL_SHEET_INVALIDATE(email, monthKey)       -> bool
 *
 *   - Storage sheet `MP_OpenCache_Store` is auto-created on first write.
 *     Schema:
 *        Audit_ID | Computed_At | Computed_Build | Stale | Payload_Bytes |
 *        Payload_Chunk_1 ... Payload_Chunk_6
 *
 *   - JSON payload of openFast is chunked at 45000 chars × max 6 chunks =
 *     270000 chars total. Sheet cell limit is 50000 chars; we leave headroom.
 *     Build identifier MP_OPEN_BUILD invalidates ALL cached rows after a
 *     deploy (sheet read returns null when build mismatches).
 *
 *   - Stale flag is set on invalidate (cheap O(1) write) and treated as
 *     a miss by reads. Cleared on next put.
 *
 * Pre-warm:
 *   V5_runPreWarmNow()                 — manual run (test from editor)
 *   V5_warmAllPendingPlanning(opts)    — iterate Audit planning, warm each
 *   V5_setupNightlyPreWarmTrigger()    — install daily trigger 04:00
 *   V5_removeNightlyPreWarmTrigger()   — cleanup
 *   V5_openCacheStats()                — diagnostic counts
 *
 * Time budget: Apps Script trigger runtime is 6 min hard cap. The warmer
 * checks elapsed time before each audit and stops early to avoid hard kill.
 *
 * Removable: deleting this file reverts the backend to GATE B+ behavior
 * (script-cache only, 300s TTL). All hooks are typeof-guarded.
 */


/* =================================================================
 * SECTION 1 — CONFIG
 * ================================================================= */

var MP_OPEN_BUILD            = 'OPEN_V4_20260501';
var MP_OPEN_SHEET_NAME       = 'MP_OpenCache_Store';
var MP_OPEN_MAX_CELL_CHARS   = 45000;
var MP_OPEN_MAX_CHUNKS       = 6;
var MP_OPEN_HEADERS          = [
  'Audit_ID',
  'Computed_At',
  'Computed_Build',
  'Stale',
  'Payload_Bytes',
  'Payload_Chunk_1',
  'Payload_Chunk_2',
  'Payload_Chunk_3',
  'Payload_Chunk_4',
  'Payload_Chunk_5',
  'Payload_Chunk_6'
];

// Pre-warm safety budget (ms). Leaves >60s headroom under the 6 min cap.
var MP_OPEN_WARM_TIME_BUDGET_MS = 270000;
// Per-audit soft cap; if a single warm exceeds this, log & continue.
// Bumped from 8s -> 16s in GATE D because each audit now does 4 calendar
// months instead of 1 (~4-12s extra per audit on cold runs).
var MP_OPEN_WARM_PER_AUDIT_LOG_MS = 16000;

// Audit planning sheet (must match backend constants).
var MP_OPEN_AUDITS_SHEET_NAME = 'Audit planning';
var MP_OPEN_STATUS_HEADER     = 'Status';
var MP_OPEN_AUDIT_ID_HEADER   = 'Audit ID';

/* === GATE D — Calendar cache sheet config === */
var MP_CAL_BUILD            = 'CAL_V1_20260501';
var MP_CAL_SHEET_NAME       = 'MP_CalCache_Store';
var MP_CAL_MAX_CELL_CHARS   = 45000;
var MP_CAL_MAX_CHUNKS       = 4;   // per-month payloads are ~5-30KB; 4 chunks = 180KB cap
var MP_CAL_HEADERS          = [
  'Cache_Key',         // email|monthKey (lowercased)
  'Auditor_Email',
  'Month_Key',         // YYYY-MM
  'Computed_At',
  'Computed_Build',
  'Stale',
  'Payload_Bytes',
  'Payload_Chunk_1',
  'Payload_Chunk_2',
  'Payload_Chunk_3',
  'Payload_Chunk_4'
];

// Number of months ahead to warm per audit (assigned auditor).
// 4 months matches the rotation hydrate window in the UI toolkit.
var MP_CAL_WARM_MONTHS_AHEAD = 4;

// GATE E — warm calendar for ALL eligible auditors per audit (not just
// the preassigned one). Dedup Set (per warmer run) keeps the cost
// bounded by UNIQUE (email, monthKey) combos. Disable with
// V5_warmAllPendingPlanning({ warmAllEligible: false }).
var MP_CAL_WARM_ALL_ELIGIBLE = true;

// GATE E — soft cap on total cal warm calls per run. Hard safeguard
// against runaway cost when auditor count grows. Default 1500 leaves
// generous headroom for ~50 auditors x 12 months. Triggers stop early
// (logs reason).
var MP_CAL_WARM_MAX_CALLS_PER_RUN = 1500;


/* =================================================================
 * SECTION 2 — UTIL
 * ================================================================= */

function mpOpen_now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss');
}

function mpOpen_safeStringify_(obj) {
  try { return JSON.stringify(obj); } catch (e) { return ''; }
}

function mpOpen_safeParse_(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function mpOpen_chunkString_(s, chunkLen, maxChunks) {
  s = String(s == null ? '' : s);
  var out = [];
  if (!s.length) {
    for (var i = 0; i < maxChunks; i++) out.push('');
    return out;
  }
  var pos = 0;
  while (pos < s.length && out.length < maxChunks) {
    out.push(s.substr(pos, chunkLen));
    pos += chunkLen;
  }
  if (pos < s.length) return null; // overflow
  while (out.length < maxChunks) out.push('');
  return out;
}

function mpOpen_assembleChunks_(chunks) {
  if (!chunks || !chunks.length) return '';
  var out = '';
  for (var i = 0; i < chunks.length; i++) {
    var c = chunks[i];
    if (c == null || c === '') continue;
    out += String(c);
  }
  return out;
}


/* =================================================================
 * SECTION 3 — SHEET HELPERS
 * ================================================================= */

function mpOpen_getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_OPEN_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(MP_OPEN_SHEET_NAME);
    sh.getRange(1, 1, 1, MP_OPEN_HEADERS.length).setValues([MP_OPEN_HEADERS]);
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (_e) {}
  } else {
    // Ensure headers exist & match (idempotent).
    var firstRow = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), MP_OPEN_HEADERS.length)).getValues()[0] || [];
    var needsHeaderWrite = false;
    for (var i = 0; i < MP_OPEN_HEADERS.length; i++) {
      if (String(firstRow[i] || '').trim() !== MP_OPEN_HEADERS[i]) { needsHeaderWrite = true; break; }
    }
    if (needsHeaderWrite) {
      sh.getRange(1, 1, 1, MP_OPEN_HEADERS.length).setValues([MP_OPEN_HEADERS]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function mpOpen_headerMap_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), MP_OPEN_HEADERS.length);
  var hdrs = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var idx = {};
  for (var i = 0; i < hdrs.length; i++) {
    var h = String(hdrs[i] || '').trim();
    if (h) idx[h] = i;
  }
  return { idx: idx, lastCol: lastCol };
}

function mpOpen_findRowIndex_(sh, hm, auditId) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  if (!hm.idx.hasOwnProperty('Audit_ID')) return -1;
  var col = hm.idx['Audit_ID'] + 1;
  var values = sh.getRange(2, col, lastRow - 1, 1).getValues();
  var target = String(auditId || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) return i + 2;
  }
  return -1;
}


/* =================================================================
 * SECTION 4 — PUBLIC API (consumed by backend GATE C shim)
 * ================================================================= */

function MP_OPEN_SHEET_GET(auditId) {
  var key = String(auditId || '').trim();
  if (!key) return null;
  try {
    var sh = mpOpen_getOrCreateSheet_();
    var hm = mpOpen_headerMap_(sh);
    var rowIx = mpOpen_findRowIndex_(sh, hm, key);
    if (rowIx < 0) return null;

    var rowVals = sh.getRange(rowIx, 1, 1, hm.lastCol).getValues()[0];
    function mpOpenRowCell_(name) {
      var i = hm.idx[name];
      return (typeof i === 'number') ? rowVals[i] : '';
    }

    var build = String(mpOpenRowCell_('Computed_Build') || '').trim();
    if (build !== MP_OPEN_BUILD) return null;

    var stale = String(mpOpenRowCell_('Stale') || '').trim();
    if (stale === '1') return null;

    var chunks = [];
    for (var c = 1; c <= MP_OPEN_MAX_CHUNKS; c++) {
      chunks.push(mpOpenRowCell_('Payload_Chunk_' + c));
    }
    var raw = mpOpen_assembleChunks_(chunks);
    if (!raw) return null;
    var payload = mpOpen_safeParse_(raw);
    if (!payload || typeof payload !== 'object') return null;

    payload.__sheetCacheHit  = true;
    payload.__sheetComputedAt = String(mpOpenRowCell_('Computed_At') || '');
    return payload;
  } catch (e) {
    Logger.log('[GATE C] MP_OPEN_SHEET_GET failed for ' + key + ': ' + e);
    return null;
  }
}

function MP_OPEN_SHEET_PUT(auditId, payload) {
  var key = String(auditId || '').trim();
  if (!key) {
    throw new Error('MP_OPEN_SHEET_PUT: missing auditId');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('MP_OPEN_SHEET_PUT: invalid payload for key=' + key);
  }

  try {
    var sh = mpOpen_getOrCreateSheet_();
    var hm = mpOpen_headerMap_(sh);

    var copy = {};
    for (var k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        copy[k] = payload[k];
      }
    }

    delete copy.__cacheHit;
    delete copy.__cacheTier;
    delete copy.__sheetCacheHit;
    delete copy.__sheetComputedAt;

    var serialized = mpOpen_safeStringify_(copy);
    if (typeof serialized !== 'string') {
      throw new Error('MP_OPEN_SHEET_PUT: stringify failed for key=' + key);
    }
    if (!serialized) return false;

    var chunks = mpOpen_chunkString_(serialized, MP_OPEN_MAX_CELL_CHARS, MP_OPEN_MAX_CHUNKS);
    if (!chunks) {
      Logger.log('[GATE C] MP_OPEN_SHEET_PUT skipped: payload exceeds chunked capacity for ' + key + ' (' + serialized.length + ' chars > ' + (MP_OPEN_MAX_CELL_CHARS * MP_OPEN_MAX_CHUNKS) + ')');
      return false;
    }

    var values = new Array(hm.lastCol);
    for (var z = 0; z < values.length; z++) values[z] = '';
    function mpOpenRowSet_(name, v) {
      var i = hm.idx[name];
      if (typeof i === 'number') values[i] = (v == null ? '' : v);
    }
    mpOpenRowSet_('Audit_ID',       key);
    mpOpenRowSet_('Computed_At',    mpOpen_now_());
    mpOpenRowSet_('Computed_Build', MP_OPEN_BUILD);
    mpOpenRowSet_('Stale',          '0');
    mpOpenRowSet_('Payload_Bytes',  serialized.length);
    for (var c2 = 0; c2 < MP_OPEN_MAX_CHUNKS; c2++) {
      mpOpenRowSet_('Payload_Chunk_' + (c2 + 1), chunks[c2] || '');
    }

    var rowIx = mpOpen_findRowIndex_(sh, hm, key);
    if (rowIx > 0) {
      sh.getRange(rowIx, 1, 1, hm.lastCol).setValues([values]);
    } else {
      sh.appendRow(values);
    }
    return true;
  } catch (e) {
    Logger.log('[GATE C] MP_OPEN_SHEET_PUT failed for ' + key + ': ' + e);
    throw e;
  }
}

function MP_OPEN_SHEET_INVALIDATE(auditId) {
  var key = String(auditId || '').trim();
  if (!key) return false;
  try {
    var sh = mpOpen_getOrCreateSheet_();
    var hm = mpOpen_headerMap_(sh);
    var rowIx = mpOpen_findRowIndex_(sh, hm, key);
    if (rowIx < 0) return true; // nothing to invalidate
    if (!hm.idx.hasOwnProperty('Stale')) return false;
    sh.getRange(rowIx, hm.idx['Stale'] + 1, 1, 1).setValue('1');
    return true;
  } catch (e) {
    Logger.log('[GATE C] MP_OPEN_SHEET_INVALIDATE failed for ' + key + ': ' + e);
    return false;
  }
}


/* =================================================================
 * SECTION 4b — CALENDAR SHEET CACHE (GATE D)
 *
 * Mirrors openFast sheet-cache pattern but keyed by (email|monthKey).
 * Backend's _mp_tdm_cacheGet_/Put_/Invalidate_ delegate here when
 * MP_CAL_SHEET_GET/PUT/INVALIDATE are typeof 'function'.
 * ================================================================= */

function mpCal_normEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function mpCal_normMonth_(monthKey) {
  return String(monthKey || '').trim();
}

function mpCal_cacheKey_(email, monthKey) {
  return mpCal_normEmail_(email) + '|' + mpCal_normMonth_(monthKey);
}

function mpCal_getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_CAL_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(MP_CAL_SHEET_NAME);
    sh.getRange(1, 1, 1, MP_CAL_HEADERS.length).setValues([MP_CAL_HEADERS]);
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (_e) {}
  } else {
    var firstRow = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), MP_CAL_HEADERS.length)).getValues()[0] || [];
    var needsHeaderWrite = false;
    for (var i = 0; i < MP_CAL_HEADERS.length; i++) {
      if (String(firstRow[i] || '').trim() !== MP_CAL_HEADERS[i]) { needsHeaderWrite = true; break; }
    }
    if (needsHeaderWrite) {
      sh.getRange(1, 1, 1, MP_CAL_HEADERS.length).setValues([MP_CAL_HEADERS]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function mpCal_headerMap_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), MP_CAL_HEADERS.length);
  var hdrs = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var idx = {};
  for (var i = 0; i < hdrs.length; i++) {
    var h = String(hdrs[i] || '').trim();
    if (h) idx[h] = i;
  }
  return { idx: idx, lastCol: lastCol };
}

function mpCal_findRowIndex_(sh, hm, key) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  if (!hm.idx.hasOwnProperty('Cache_Key')) return -1;
  var col = hm.idx['Cache_Key'] + 1;
  var values = sh.getRange(2, col, lastRow - 1, 1).getValues();
  var target = String(key || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) return i + 2;
  }
  return -1;
}

function MP_CAL_SHEET_GET(email, monthKey) {
  var key = mpCal_cacheKey_(email, monthKey);
  if (!key || key === '|') return null;
  try {
    var sh = mpCal_getOrCreateSheet_();
    var hm = mpCal_headerMap_(sh);
    var rowIx = mpCal_findRowIndex_(sh, hm, key);
    if (rowIx < 0) return null;

    var rowVals = sh.getRange(rowIx, 1, 1, hm.lastCol).getValues()[0];
    function mpCalRowCell_(name) {
      var i = hm.idx[name];
      return (typeof i === 'number') ? rowVals[i] : '';
    }

    var build = String(mpCalRowCell_('Computed_Build') || '').trim();
    if (build !== MP_CAL_BUILD) return null;

    var stale = String(mpCalRowCell_('Stale') || '').trim();
    if (stale === '1') return null;

    var chunks = [];
    for (var c = 1; c <= MP_CAL_MAX_CHUNKS; c++) {
      chunks.push(mpCalRowCell_('Payload_Chunk_' + c));
    }
    var raw = mpOpen_assembleChunks_(chunks);
    if (!raw) return null;
    var payload = mpOpen_safeParse_(raw);
    if (!payload || typeof payload !== 'object') return null;

    payload.__sheetCacheHit  = true;
    payload.__sheetComputedAt = String(mpCalRowCell_('Computed_At') || '');
    return payload;
  } catch (e) {
    Logger.log('[GATE D] MP_CAL_SHEET_GET failed for ' + key + ': ' + e);
    return null;
  }
}

function MP_CAL_SHEET_PUT(email, monthKey, payload) {
  var key = mpCal_cacheKey_(email, monthKey);
  if (!key || key === '|' || !payload || typeof payload !== 'object') return false;
  try {
    var sh = mpCal_getOrCreateSheet_();
    var hm = mpCal_headerMap_(sh);

    var copy = {};
    for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload,k)) copy[k] = payload[k];
    delete copy.__cacheHit;
    delete copy.__cacheTier;
    delete copy.__sheetCacheHit;
    delete copy.__sheetComputedAt;
    if (copy.meta && typeof copy.meta === 'object') {
      var metaCopy = {};
      for (var mk in copy.meta) if (Object.prototype.hasOwnProperty.call(copy.meta, mk)) metaCopy[mk] = copy.meta[mk];
      delete metaCopy.cacheHit;
      delete metaCopy.cacheService;
      copy.meta = metaCopy;
    }

    var serialized = mpOpen_safeStringify_(copy);
    if (!serialized) return false;

    var chunks = mpOpen_chunkString_(serialized, MP_CAL_MAX_CELL_CHARS, MP_CAL_MAX_CHUNKS);
    if (!chunks) {
      Logger.log('[GATE D] MP_CAL_SHEET_PUT skipped: payload exceeds chunked capacity for ' + key + ' (' + serialized.length + ' chars > ' + (MP_CAL_MAX_CELL_CHARS * MP_CAL_MAX_CHUNKS) + ')');
      return false;
    }

    var values = new Array(hm.lastCol);
    for (var z = 0; z < values.length; z++) values[z] = '';
    function mpCalRowSet_(name, v) {
      var i = hm.idx[name];
      if (typeof i === 'number') values[i] = (v == null ? '' : v);
    }
    mpCalRowSet_('Cache_Key',      key);
    mpCalRowSet_('Auditor_Email',  mpCal_normEmail_(email));
    mpCalRowSet_('Month_Key',      mpCal_normMonth_(monthKey));
    mpCalRowSet_('Computed_At',    mpOpen_now_());
    mpCalRowSet_('Computed_Build', MP_CAL_BUILD);
    mpCalRowSet_('Stale',          '0');
    mpCalRowSet_('Payload_Bytes',  serialized.length);
    for (var c2 = 0; c2 < MP_CAL_MAX_CHUNKS; c2++) {
      mpCalRowSet_('Payload_Chunk_' + (c2 + 1), chunks[c2] || '');
    }

    var rowIx = mpCal_findRowIndex_(sh, hm, key);
    if (rowIx > 0) {
      sh.getRange(rowIx, 1, 1, hm.lastCol).setValues([values]);
    } else {
      sh.appendRow(values);
    }
    return true;
  } catch (e) {
    Logger.log('[GATE D] MP_CAL_SHEET_PUT failed for ' + key + ': ' + e);
    return false;
  }
}

function MP_CAL_SHEET_INVALIDATE(email, monthKey) {
  var key = mpCal_cacheKey_(email, monthKey);
  if (!key || key === '|') return false;
  try {
    var sh = mpCal_getOrCreateSheet_();
    var hm = mpCal_headerMap_(sh);
    var rowIx = mpCal_findRowIndex_(sh, hm, key);
    if (rowIx < 0) return true; // nothing to invalidate
    if (!hm.idx.hasOwnProperty('Stale')) return false;
    sh.getRange(rowIx, hm.idx['Stale'] + 1, 1, 1).setValue('1');
    return true;
  } catch (e) {
    Logger.log('[GATE D] MP_CAL_SHEET_INVALIDATE failed for ' + key + ': ' + e);
    return false;
  }
}

function mpCal_addMonthsToMonthKey_(monthKey, addMonths) {
  var m = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  var y = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10) - 1; // 0-based
  mo += Number(addMonths) || 0;
  while (mo > 11) { mo -= 12; y++; }
  while (mo < 0)  { mo += 12; y--; }
  var moStr = (mo + 1) < 10 ? ('0' + (mo + 1)) : String(mo + 1);
  return y + '-' + moStr;
}


/* =================================================================
 * SECTION 5 — PRE-WARM
 * ================================================================= */

function mpOpen_listPendingPlanningAuditIds_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_OPEN_AUDITS_SHEET_NAME);
  if (!sh) {
    Logger.log('[GATE C] warm: sheet not found: ' + MP_OPEN_AUDITS_SHEET_NAME);
    return [];
  }
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var hdrs = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var idxAuditId = -1, idxStatus = -1;
  for (var i = 0; i < hdrs.length; i++) {
    var h = String(hdrs[i] || '').trim();
    if (h === MP_OPEN_AUDIT_ID_HEADER && idxAuditId < 0) idxAuditId = i;
    if (h === MP_OPEN_STATUS_HEADER && idxStatus < 0) idxStatus = i;
  }
  if (idxAuditId < 0 || idxStatus < 0) {
    Logger.log('[GATE C] warm: required headers not found (Audit ID / Status)');
    return [];
  }

  var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var r = 0; r < data.length; r++) {
    var status = String(data[r][idxStatus] || '').trim();
    if (!status) continue;
    var isPending = false;
    try {
      if (typeof V5_isPendingPlanningStatus_ === 'function') {
        isPending = V5_isPendingPlanningStatus_(status);
      } else {
        isPending = status.toLowerCase() === 'pending planning';
      }
    } catch (_e) {
      isPending = status.toLowerCase() === 'pending planning';
    }
    if (!isPending) continue;
    var aid = String(data[r][idxAuditId] || '').trim();
    if (aid) out.push(aid);
  }
  return out;
}

function V5_warmAllPendingPlanning(opts) {
  opts = opts || {};
  var t0 = Date.now();
  var budget = Number(opts.timeBudgetMs || MP_OPEN_WARM_TIME_BUDGET_MS);
  var forceFresh = !!opts.forceFresh;
  // GATE C+ flags (default ON). Disable individually if a stage misbehaves.
  var warmElig = (opts.warmElig === false) ? false : true;
  var warmCal  = (opts.warmCalendar === false) ? false : true;
  // GATE E flag (default ON, falls back to constant).
  var warmAllEligible = (opts.warmAllEligible === false)
    ? false
    : (opts.warmAllEligible === true ? true : MP_CAL_WARM_ALL_ELIGIBLE);
  var maxCalCalls = Number(opts.maxCalCallsPerRun || MP_CAL_WARM_MAX_CALLS_PER_RUN);

  // GATE E — dedup Set spanning the whole run. Key = email|monthKey.
  // Naturally collapses overlap between (preassigned of audit A) and
  // (eligible-also-for-audit-B). Cost ~= unique auditors x months.
  var warmedKeys = {};
  function _markWarmed(email, monthKey) {
    warmedKeys[mpCal_normEmail_(email) + '|' + mpCal_normMonth_(monthKey)] = true;
  }
  function _alreadyWarmed(email, monthKey) {
    return !!warmedKeys[mpCal_normEmail_(email) + '|' + mpCal_normMonth_(monthKey)];
  }

  var auditIds = mpOpen_listPendingPlanningAuditIds_();
  var summary = {
    started: mpOpen_now_(),
    build:   MP_OPEN_BUILD,
    total:   auditIds.length,
    warmed:  0,         // openFast hits stored
    skipped: 0,
    failed:  0,
    eligWarmed:    0,   // GATE C+
    eligSkipped:   0,
    eligFailed:    0,
    calWarmed:     0,   // GATE C+ (preassigned)
    calSkipped:    0,
    calFailed:     0,
    calEligibleWarmed:    0,  // GATE E
    calEligibleSkippedDup:0,  // GATE E (already in warmedKeys)
    calEligibleFailed:    0,  // GATE E
    calCallsTotal:        0,  // GATE E (across all stages)
    calMaxCallsHit:       false,
    overBudget: 0,
    perAuditMs: [],
    aborted: false
  };

  if (typeof getToolkitOpenFastV5 !== 'function') {
    Logger.log('[GATE C] warm: getToolkitOpenFastV5 not defined — backend missing?');
    summary.aborted = true;
    return summary;
  }

  for (var i = 0; i < auditIds.length; i++) {
    var elapsed = Date.now() - t0;
    if (elapsed > budget) {
      summary.aborted = true;
      summary.overBudget = auditIds.length - i;
      Logger.log('[GATE C] warm: time budget hit after ' + i + ' / ' + auditIds.length + ' audits (' + elapsed + 'ms)');
      break;
    }
    var aid = auditIds[i];
    var aT = Date.now();
    var res = null;
    var eligRes = null;  // GATE E — promoted to per-audit scope so stage 4 can re-use it

    // Stage 1 — openFast (writes to MP_OpenCache_Store via GATE C shim)
    try {
      res = getToolkitOpenFastV5(aid, '', {
        withCalendar: false,
        forceFresh:   forceFresh,
        role:         'MANAGER',
        lockedAuditorEmail: ''
      });
      var dur = Date.now() - aT;
      summary.perAuditMs.push(dur);
      if (res && res.success === true) {
        summary.warmed++;
        if (dur > MP_OPEN_WARM_PER_AUDIT_LOG_MS) {
          Logger.log('[GATE C] warm: slow audit ' + aid + ' = ' + dur + 'ms');
        }
      } else {
        summary.skipped++;
        Logger.log('[GATE C] warm: skipped ' + aid + ' (success!=true) -> ' + ((res && res.message) || 'no message'));
      }
    } catch (e) {
      summary.failed++;
      Logger.log('[GATE C] warm: failed ' + aid + ' -> ' + e);
    }

    // Stage 2 — d36 TEC warm.
    // IMPORTANT: this no longer calls getToolkitAuditorsV5.
    // It warms the fingerprinted TEC d3 projection via canonical compute:
    // ToolkitEligibilityCache_WarmOneD35 -> _mp_getEligibleAuditorsList_ -> elig_cacheWrite_(ctx, projection).
    if (warmElig && typeof ToolkitEligibilityCache_WarmOneD35 === 'function') {
      try {
        eligRes = ToolkitEligibilityCache_WarmOneD35(aid);
        Logger.log('[D36_WARM_TEC] aid=' + aid + ' ms=' + ((eligRes && eligRes.ms) || '') + ' success=' + !!(eligRes && eligRes.success));
        if (eligRes && eligRes.success !== false) {
          summary.eligWarmed++;
        } else {
          summary.eligSkipped++;
        }
      } catch (e2) {
        summary.eligFailed++;
        Logger.log('[D36_WARM_TEC] aid=' + aid + ' error=' + e2);
      }
    } else if (warmElig) {
      summary.eligSkipped++;
      Logger.log('[D36_WARM_TEC] skipped: ToolkitEligibilityCache_WarmOneD35 missing for ' + aid);
    }

    // Stage 3 — calendar for the assigned/preassigned auditor (GATE D).
    // Builds the canonical month list from the openFast result so
    // stage 4 (GATE E) can reuse it for the eligible auditors.
    var monthsToWarm = [];
    var firstMonth = '';
    try {
      firstMonth = String(
        (res && res.firstMonthMonthKey) ||
        (res && res.toolkitMonthKeys && res.toolkitMonthKeys[0]) ||
        ''
      ).trim();
    } catch (_eM) { firstMonth = ''; }
    var firstMonthOk = /^\d{4}-\d{2}$/.test(firstMonth);
    if (firstMonthOk) {
      try {
        if (res && res.toolkitMonthKeys && res.toolkitMonthKeys.length) {
          for (var mi = 0; mi < res.toolkitMonthKeys.length && monthsToWarm.length < MP_CAL_WARM_MONTHS_AHEAD; mi++) {
            var mk = String(res.toolkitMonthKeys[mi] || '').trim();
            if (/^\d{4}-\d{2}$/.test(mk)) monthsToWarm.push(mk);
          }
        }
      } catch (_eL) {}
      if (monthsToWarm.length < MP_CAL_WARM_MONTHS_AHEAD) {
        for (var step = monthsToWarm.length; step < MP_CAL_WARM_MONTHS_AHEAD; step++) {
          var nextK = mpCal_addMonthsToMonthKey_(firstMonth, step);
          if (nextK && monthsToWarm.indexOf(nextK) < 0) monthsToWarm.push(nextK);
        }
      }
    }

    if (warmCal && res && res.success === true && typeof getToolkitAvailabilityMonthDirectV5 === 'function') {
      var emailForCal = '';
      try {
        emailForCal = String(
          (res.audit && (res.audit.preassignedAuditorEmail || res.audit.assignedTo)) ||
          res.defaultAuditorEmail ||
          ''
        ).trim();
      } catch (_eE) { emailForCal = ''; }

      var emailLooksOk = emailForCal.indexOf('@') > 0;

      if (emailLooksOk && monthsToWarm.length) {
        for (var mwi = 0; mwi < monthsToWarm.length; mwi++) {
          var mKey = monthsToWarm[mwi];
          if (summary.calCallsTotal >= maxCalCalls) {
            summary.calMaxCallsHit = true;
            summary.calSkipped++;
            continue;
          }
          if (_alreadyWarmed(emailForCal, mKey)) {
            // Already done earlier in this run (e.g. another audit's preassigned).
            summary.calSkipped++;
            continue;
          }
          try {
            var calRes = getToolkitAvailabilityMonthDirectV5(emailForCal, mKey, {
              forceFresh: forceFresh
            });
            summary.calCallsTotal++;
            if (calRes && calRes.success !== false) {
              summary.calWarmed++;
              _markWarmed(emailForCal, mKey);
            } else {
              summary.calSkipped++;
            }
          } catch (e3) {
            summary.calFailed++;
            Logger.log('[GATE D] cal warm failed ' + aid + ' (' + emailForCal + ' / ' + mKey + ') -> ' + e3);
          }
        }
      } else {
        summary.calSkipped++;
      }
    } else if (warmCal) {
      summary.calSkipped++;
    }

    // Stage 4 — GATE E: warm calendar for ALL eligible (non-preassigned)
    // auditors x same month list. Dedup via warmedKeys means the cost
    // collapses to UNIQUE (email, monthKey) combos across the whole run.
    // For 4 auditors x 4 months -> 16 calls TOTAL (not per audit).
    // For 50 auditors x 12 months -> 600 calls. Within budget.
    if (warmAllEligible && warmCal && eligRes && eligRes.auditors && eligRes.auditors.length && monthsToWarm.length && typeof getToolkitAvailabilityMonthDirectV5 === 'function') {
      var elAuditors = eligRes.auditors;
      for (var ea = 0; ea < elAuditors.length; ea++) {
        var elObj = elAuditors[ea] || {};
        var elEmail = String(elObj.email || '').trim();
        if (!elEmail || elEmail.indexOf('@') < 0) continue;

        // Per-audit time check: if the parent budget is nearly exhausted
        // we stop. Outer loop also re-checks before next audit.
        if ((Date.now() - t0) > budget) {
          summary.aborted = true;
          break;
        }

        for (var em = 0; em < monthsToWarm.length; em++) {
          var mKey2 = monthsToWarm[em];
          if (summary.calCallsTotal >= maxCalCalls) {
            summary.calMaxCallsHit = true;
            break;
          }
          if (_alreadyWarmed(elEmail, mKey2)) {
            summary.calEligibleSkippedDup++;
            continue;
          }
          try {
            var calRes2 = getToolkitAvailabilityMonthDirectV5(elEmail, mKey2, {
              forceFresh: forceFresh
            });
            summary.calCallsTotal++;
            if (calRes2 && calRes2.success !== false) {
              summary.calEligibleWarmed++;
              _markWarmed(elEmail, mKey2);
            } else {
              summary.calEligibleFailed++;
            }
          } catch (e4) {
            summary.calEligibleFailed++;
            Logger.log('[GATE E] elig cal warm failed ' + aid + ' (' + elEmail + ' / ' + mKey2 + ') -> ' + e4);
          }
        }
        if (summary.calMaxCallsHit) break;
      }
    }
  }

  summary.totalMs = Date.now() - t0;
  summary.finished = mpOpen_now_();
  summary.uniqueCalKeys = Object.keys(warmedKeys).length;
  Logger.log('[GATE E] warm summary: ' + JSON.stringify({
    total: summary.total,
    openFast:        { warmed: summary.warmed,     skipped: summary.skipped,     failed: summary.failed },
    elig:            { warmed: summary.eligWarmed, skipped: summary.eligSkipped, failed: summary.eligFailed },
    calPreassigned:  { warmed: summary.calWarmed,  skipped: summary.calSkipped,  failed: summary.calFailed },
    calEligible:     { warmed: summary.calEligibleWarmed, skippedDup: summary.calEligibleSkippedDup, failed: summary.calEligibleFailed },
    calCallsTotal:   summary.calCallsTotal,
    uniqueCalKeys:   summary.uniqueCalKeys,
    calMaxCallsHit:  summary.calMaxCallsHit,
    overBudget:      summary.overBudget,
    aborted:         summary.aborted,
    totalMs:         summary.totalMs
  }));
  return summary;
}

function V5_runPreWarmNow() {
  return V5_warmAllPendingPlanning({ forceFresh: false });
}

function V5_runPreWarmForceFresh() {
  return V5_warmAllPendingPlanning({ forceFresh: true });
}


/* =================================================================
 * SECTION 6 — TRIGGER MANAGEMENT
 * ================================================================= */

var MP_OPEN_TRIGGER_HANDLER = 'V5_warmAllPendingPlanning';

function V5_setupNightlyPreWarmTrigger() {
  // Remove any existing instances first to prevent duplicates.
  V5_removeNightlyPreWarmTrigger();
  ScriptApp.newTrigger(MP_OPEN_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();
  Logger.log('[GATE C] nightly trigger installed: ' + MP_OPEN_TRIGGER_HANDLER + ' daily ~04:00');
  return true;
}

function V5_removeNightlyPreWarmTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MP_OPEN_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('[GATE C] removed ' + removed + ' trigger(s) for ' + MP_OPEN_TRIGGER_HANDLER);
  return removed;
}

function V5_listPreWarmTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var out = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MP_OPEN_TRIGGER_HANDLER) {
      out.push({
        id:        triggers[i].getUniqueId(),
        handler:   triggers[i].getHandlerFunction(),
        eventType: String(triggers[i].getEventType()),
        source:    String(triggers[i].getTriggerSource())
      });
    }
  }
  Logger.log('[GATE C] pre-warm triggers: ' + JSON.stringify(out));
  return out;
}


/* =================================================================
 * SECTION 7 — DIAGNOSTICS
 * ================================================================= */

function V5_openCacheStats() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_OPEN_SHEET_NAME);
  var stats = {
    sheet:        MP_OPEN_SHEET_NAME,
    exists:       !!sh,
    build:        MP_OPEN_BUILD,
    rows:         0,
    fresh:        0,
    stale:        0,
    wrongBuild:   0,
    bytesTotal:   0,
    avgBytes:     0
  };
  if (!sh) {
    Logger.log('[GATE C] stats: sheet not present');
    return stats;
  }
  var lastRow = sh.getLastRow();
  if (lastRow < 2) {
    Logger.log('[GATE C] stats: ' + JSON.stringify(stats));
    return stats;
  }
  var hm = mpOpen_headerMap_(sh);
  var data = sh.getRange(2, 1, lastRow - 1, hm.lastCol).getValues();
  for (var r = 0; r < data.length; r++) {
    stats.rows++;
    var build = String(data[r][hm.idx['Computed_Build']] || '').trim();
    var stale = String(data[r][hm.idx['Stale']] || '').trim();
    var bytes = Number(data[r][hm.idx['Payload_Bytes']] || 0);
    if (isFinite(bytes)) stats.bytesTotal += bytes;
    if (build !== MP_OPEN_BUILD) stats.wrongBuild++;
    else if (stale === '1') stats.stale++;
    else stats.fresh++;
  }
  stats.avgBytes = stats.rows ? Math.round(stats.bytesTotal / stats.rows) : 0;
  Logger.log('[GATE C] stats: ' + JSON.stringify(stats));
  return stats;
}

function V5_openCacheClearAll() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_OPEN_SHEET_NAME);
  if (!sh) return 0;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var hm = mpOpen_headerMap_(sh);
  if (!hm.idx.hasOwnProperty('Stale')) return 0;
  var n = lastRow - 1;
  var col = hm.idx['Stale'] + 1;
  var ones = [];
  for (var i = 0; i < n; i++) ones.push(['1']);
  sh.getRange(2, col, n, 1).setValues(ones);
  Logger.log('[GATE C] marked ' + n + ' rows stale');
  return n;
}

/* === GATE D — Calendar cache diagnostics === */

function V5_calCacheStats() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_CAL_SHEET_NAME);
  var stats = {
    sheet:        MP_CAL_SHEET_NAME,
    exists:       !!sh,
    build:        MP_CAL_BUILD,
    rows:         0,
    fresh:        0,
    stale:        0,
    wrongBuild:   0,
    bytesTotal:   0,
    avgBytes:     0,
    uniqueAuditors: 0,
    uniqueMonths:   0
  };
  if (!sh) {
    Logger.log('[GATE D] cal stats: sheet not present');
    return stats;
  }
  var lastRow = sh.getLastRow();
  if (lastRow < 2) {
    Logger.log('[GATE D] cal stats: ' + JSON.stringify(stats));
    return stats;
  }
  var hm = mpCal_headerMap_(sh);
  var data = sh.getRange(2, 1, lastRow - 1, hm.lastCol).getValues();
  var auditorSet = {}, monthSet = {};
  for (var r = 0; r < data.length; r++) {
    stats.rows++;
    var build = String(data[r][hm.idx['Computed_Build']] || '').trim();
    var stale = String(data[r][hm.idx['Stale']] || '').trim();
    var bytes = Number(data[r][hm.idx['Payload_Bytes']] || 0);
    var em    = String(data[r][hm.idx['Auditor_Email']] || '').trim();
    var mk    = String(data[r][hm.idx['Month_Key']] || '').trim();
    if (isFinite(bytes)) stats.bytesTotal += bytes;
    if (build !== MP_CAL_BUILD) stats.wrongBuild++;
    else if (stale === '1') stats.stale++;
    else stats.fresh++;
    if (em) auditorSet[em] = true;
    if (mk) monthSet[mk] = true;
  }
  stats.avgBytes = stats.rows ? Math.round(stats.bytesTotal / stats.rows) : 0;
  stats.uniqueAuditors = Object.keys(auditorSet).length;
  stats.uniqueMonths   = Object.keys(monthSet).length;
  Logger.log('[GATE D] cal stats: ' + JSON.stringify(stats));
  return stats;
}

function V5_calCacheClearAll() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MP_CAL_SHEET_NAME);
  if (!sh) return 0;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var hm = mpCal_headerMap_(sh);
  if (!hm.idx.hasOwnProperty('Stale')) return 0;
  var n = lastRow - 1;
  var col = hm.idx['Stale'] + 1;
  var ones = [];
  for (var i = 0; i < n; i++) ones.push(['1']);
  sh.getRange(2, col, n, 1).setValues(ones);
  Logger.log('[GATE D] cal: marked ' + n + ' rows stale');
  return n;
}
