/* =================================================================
 * MpCacheWarmer_GATE_Q_20260502.gs
 *
 * NEW STANDALONE FILE — add to your Apps Script project alongside
 * ManagerPlanningBackend (do NOT replace anything; pure addition).
 *
 * GOAL
 * --------------------------------------------------------------
 * Cold-open server time on the toolkit fast-open path is dominated
 * by 3 sheet reads:
 *
 *   readAuditPlanning      ~400ms
 *   companyConstraints     ~500ms (Companies sheet read)
 *   qualifiedAuditorsFast  ~500-700ms (Auditors sheet read + iter)
 *
 * Each of these is wrapped in __mp_getSheetDataPersistCached_(...)
 * with CacheService TTL 300-600s. When the persist cache is HOT
 * the underlying sheet read is replaced by a single CacheService
 * roundtrip (~30-80ms). When COLD it falls through to a full
 * sh.getDataRange().getValues() (~400-1000ms depending on size).
 *
 * In a single-user planning session, the user almost always hits
 * the cache COLD on the first open (CacheService TTL expires
 * after 5 min of idle). This warmer keeps all hot sheets warm
 * 24/7 by re-populating the persist cache every 4 minutes via
 * a time-driven trigger.
 *
 * EXPECTED IMPACT (after install + first warm cycle)
 * --------------------------------------------------------------
 *   readAuditPlanning      414ms -> ~50-80ms   (-330ms)
 *   companyConstraints     498ms -> ~5-10ms    (-490ms cached lookup wins too)
 *   qualifiedAuditorsFast  584ms -> ~80-120ms  (-470ms)
 *   --------------------------------------------------
 *   total cold open server 1687ms -> ~300-500ms server
 *   wall                   5100ms -> ~3300-3500ms (GAS proxy floor)
 *
 * INSTALL (one-time)
 * --------------------------------------------------------------
 * 1. Save this file in the Apps Script editor (Ctrl+S).
 * 2. From the function dropdown, pick `mpWarm_install_` and click Run.
 * 3. Authorize the prompt (script needs trigger + spreadsheet access).
 * 4. Verify: function dropdown -> `mpWarm_status` -> Run -> View
 *    -> Logs -> should show "trigger active" and last warm timestamp.
 *
 * UNINSTALL
 * --------------------------------------------------------------
 *   Run `mpWarm_uninstall` once.
 *
 * MANUAL WARM
 * --------------------------------------------------------------
 *   Run `mpWarm_now` for a one-shot warm without scheduling.
 *
 * SAFETY
 * --------------------------------------------------------------
 * - Idempotent: install removes any prior trigger before creating new.
 * - Read-only: only does sh.getDataRange().getValues() + Cache PUT.
 * - Best-effort: per-sheet failures are logged, never thrown.
 * - Bounded: skips sheets > ~80KB serialized (CacheService cap 100KB).
 * - No locks: warmer never blocks user requests.
 * ================================================================= */

var MP_WARM_BUILD = 'GATE_Q_d14';
var MP_WARM_TRIGGER_HANDLER = 'mpWarm_keepHot_';
var MP_WARM_INTERVAL_MIN = 5; // GAS only allows 1/5/10/15/30. 5min = persist TTL exact; warmer re-PUTs each cycle so race is one-tick max
var MP_WARM_PROP_SS_ID = 'MP_WARM_SS_ID';
var MP_WARM_PROP_LAST_RUN = 'MP_WARM_LAST_RUN_AT';
var MP_WARM_PROP_LAST_RESULT = 'MP_WARM_LAST_RESULT';

// Sheets to keep warm. TTL must exceed MP_WARM_INTERVAL_MIN * 60 + slack.
// Audit planning gets a shorter TTL because saves invalidate it; warmer
// repopulates within ~4 min so cold-open hit rate stays >95%.
var MP_WARM_SHEETS = [
  { name: 'Audit planning',      ttl: 300 },
  { name: 'Auditors',            ttl: 600 },
  { name: 'Companies',           ttl: 600 },
  { name: 'Config_Scopes',       ttl: 900 },
  // δ3 (2026-05-03): keep Log realized hot so _mp_buildLogIndexForCompany_
  // hits persist-cache instead of cold sheet read on first toolkit open.
  { name: 'Log realized audits', ttl: 300 }
];

/* ---------- PUBLIC: install / uninstall / status / manual run ---------- */

function mpWarm_install() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('mpWarm_install: no active spreadsheet (run from a container-bound script).');
  PropertiesService.getScriptProperties().setProperty(MP_WARM_PROP_SS_ID, ss.getId());

  // Remove any existing triggers for our handler (idempotent).
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MP_WARM_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  // Install fresh time-driven trigger.
  ScriptApp.newTrigger(MP_WARM_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(MP_WARM_INTERVAL_MIN)
    .create();

  // Run once immediately so user sees benefit on the very next open.
  var firstResult = mpWarm_keepHot_();

  Logger.log('[' + MP_WARM_BUILD + '] install OK. ssId=' + ss.getId() +
             ' interval=' + MP_WARM_INTERVAL_MIN + 'min removedOldTriggers=' + removed +
             ' firstWarm=' + JSON.stringify(firstResult));
  return { ok:true, build:MP_WARM_BUILD, ssId:ss.getId(), removedOldTriggers:removed, firstWarm:firstResult };
}

function mpWarm_uninstall() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MP_WARM_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('[' + MP_WARM_BUILD + '] uninstall OK. removedTriggers=' + removed);
  return { ok:true, build:MP_WARM_BUILD, removedTriggers:removed };
}

function mpWarm_status() {
  var props = PropertiesService.getScriptProperties();
  var triggers = ScriptApp.getProjectTriggers();
  var active = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MP_WARM_TRIGGER_HANDLER) active++;
  }
  var status = {
    build: MP_WARM_BUILD,
    triggerActive: active > 0,
    triggerCount: active,
    intervalMin: MP_WARM_INTERVAL_MIN,
    ssId: props.getProperty(MP_WARM_PROP_SS_ID) || '',
    lastRunAt: props.getProperty(MP_WARM_PROP_LAST_RUN) || '',
    lastResult: (function(){
      try { return JSON.parse(props.getProperty(MP_WARM_PROP_LAST_RESULT) || 'null'); }
      catch(e) { return null; }
    })()
  };
  Logger.log('[' + MP_WARM_BUILD + '] status=' + JSON.stringify(status));
  return status;
}

function mpWarm_now() {
  return mpWarm_keepHot_();
}

/**
 * d14: ONE-SHOT manual warm-all for eligibility cache.
 * Eliminates the 16-min wait for chunked δ14 to cycle through all audits.
 *
 * Usage (from Apps Script editor):
 *   1. Run `mpWarm_eligWarmAllNow` once.
 *   2. Inspect return value. If `done:false`, run a second time.
 *   3. Done when `done:true` and `warmed === totalAudits`.
 *
 * Safety:
 *   - Watchdog 330s (GAS execution cap is 360s; 30s buffer for return + log).
 *   - Persists progress pointer in PropertiesService (MP_WARM_ELIG_PTR).
 *   - Reuses chunk pointer with regular trigger; if you mix manual + trigger
 *     it just means trigger picks up from wherever manual left off.
 *   - Read-only on sheets (calls getToolkitAuditorsV5 which is read-only).
 *
 * Returns:
 *   { ok, build, totalAudits, warmedThisRun, errorsThisRun, ptrStart, ptrEnd,
 *     done, watchdogTripped, ms }
 */
function mpWarm_eligWarmAllNow() {
  var t0 = Date.now();
  var BUDGET_MS = 330000;
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty(MP_WARM_PROP_SS_ID) || '';
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(_e0){}
  if (!ss && ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch(_e1){} }
  if (!ss) {
    var noSs = { ok:false, error:'no spreadsheet (run mpWarm_install first)', ms: Date.now() - t0 };
    Logger.log('[' + MP_WARM_BUILD + '] eligWarmAllNow SKIPPED: ' + noSs.error);
    return noSs;
  }
  if (typeof getToolkitAuditorsV5 !== 'function') {
    var noFn = { ok:false, error:'getToolkitAuditorsV5 not loaded', ms: Date.now() - t0 };
    Logger.log('[' + MP_WARM_BUILD + '] eligWarmAllNow SKIPPED: ' + noFn.error);
    return noFn;
  }

  // Build audit ID list from Audit planning sheet.
  var apSh = ss.getSheetByName('Audit planning');
  if (!apSh) return { ok:false, error:'Audit planning sheet missing', ms: Date.now() - t0 };
  var d = apSh.getDataRange().getValues() || [];
  if (d.length < 2) return { ok:false, error:'Audit planning empty', ms: Date.now() - t0 };
  var hdr = d[0] || [];
  var aiCol = -1;
  for (var hi = 0; hi < hdr.length; hi++) {
    var hh = String(hdr[hi] || '').trim().toLowerCase();
    if (hh === 'audit id' || hh === 'audit_id' || hh === 'auditid') { aiCol = hi; break; }
  }
  if (aiCol < 0) return { ok:false, error:'Audit ID column not found', ms: Date.now() - t0 };

  var allIds = [];
  for (var r = 1; r < d.length; r++) {
    var v = String(d[r][aiCol] || '').trim();
    if (v) allIds.push(v);
  }

  var ptrKey = 'MP_WARM_ELIG_PTR';
  var ptrStart = parseInt(props.getProperty(ptrKey) || '0', 10);
  if (!isFinite(ptrStart) || ptrStart < 0 || ptrStart >= allIds.length) ptrStart = 0;

  var warmed = 0;
  var errors = 0;
  var watchdogTripped = false;
  var i = ptrStart;
  for (; i < allIds.length; i++) {
    if (Date.now() - t0 > BUDGET_MS) {
      watchdogTripped = true;
      break;
    }
    try {
      getToolkitAuditorsV5(allIds[i]);
      warmed++;
    } catch (e) {
      errors++;
      Logger.log('[' + MP_WARM_BUILD + '] eligWarmAllNow row fail auditId=' + allIds[i] + ' err=' + (e && e.message || e));
    }
  }

  var ptrEnd = i;
  var done = (ptrEnd >= allIds.length);
  var nextPtr = done ? 0 : ptrEnd;
  props.setProperty(ptrKey, String(nextPtr));

  var result = {
    ok: true,
    build: MP_WARM_BUILD,
    totalAudits: allIds.length,
    warmedThisRun: warmed,
    errorsThisRun: errors,
    ptrStart: ptrStart,
    ptrEnd: ptrEnd,
    done: done,
    watchdogTripped: watchdogTripped,
    ms: Date.now() - t0
  };
  Logger.log('[' + MP_WARM_BUILD + '] eligWarmAllNow ' + (done ? 'DONE' : 'PARTIAL') + ' ' + JSON.stringify(result));
  return result;
}

/* ---------- TRIGGER HANDLER ---------- */

function mpWarm_keepHot_() {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var ssId = props.getProperty(MP_WARM_PROP_SS_ID) || '';

  // Prefer active SS (container-bound trigger), fall back to stored ID.
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss && (!ssId || ss.getId() !== ssId)) {
      props.setProperty(MP_WARM_PROP_SS_ID, ss.getId());
    }
  } catch(e1) {
    ss = null;
  }
  if (!ss && ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch(e2) {}
  }
  if (!ss) {
    var noSs = { ok:false, error:'no spreadsheet (run mpWarm_install_ from container-bound script first)' };
    props.setProperty(MP_WARM_PROP_LAST_RESULT, JSON.stringify(noSs));
    Logger.log('[' + MP_WARM_BUILD + '] keepHot SKIPPED: ' + noSs.error);
    return noSs;
  }

  var perSheet = [];
  var hasPersistFn = (typeof __mp_getSheetDataPersistCached_ === 'function');

  for (var i = 0; i < MP_WARM_SHEETS.length; i++) {
    var spec = MP_WARM_SHEETS[i];
    var sheetT0 = Date.now();
    var entry = { sheet: spec.name, ttl: spec.ttl, ms: 0, ok: false, mode: '' };

    try {
      if (hasPersistFn) {
        // Tier A (preferred): use the project's own persist wrapper.
        // It writes 'MP_PERSIST::<sheetName>' to script cache when populated.
        // We force-refresh by clearing the per-exec cache key first (the
        // wrapper short-circuits on per-exec hit, which is irrelevant here
        // since this trigger has its own execution scope, but defensive).
        try {
          if (typeof __mp_resetExecCache_ === 'function') __mp_resetExecCache_();
        } catch(_re) {}
        var pack = __mp_getSheetDataPersistCached_(ss, spec.name, spec.ttl);
        var rows = (pack && pack.data) ? pack.data.length : 0;
        entry.rows = rows;
        entry.mode = 'persist-wrapper';
        entry.ok = !!(pack && pack.sh);
      } else {
        // Tier B (fallback): inline write to MP_PERSIST::<sheetName>.
        // Mirrors __mp_getSheetDataPersistCached_'s storage shape so the
        // backend reads it transparently.
        var sh = ss.getSheetByName(spec.name);
        if (!sh) {
          entry.mode = 'inline';
          entry.error = 'sheet not found';
        } else {
          var data = sh.getDataRange().getValues() || [];
          var hdr = data.length ? (data[0] || []) : [];
          var payload = JSON.stringify({ data: data, hdr: hdr });
          if (payload.length < 90 * 1024) {
            CacheService.getScriptCache().put('MP_PERSIST::' + spec.name, payload, spec.ttl);
            entry.mode = 'inline';
            entry.rows = data.length;
            entry.bytes = payload.length;
            entry.ok = true;
          } else {
            entry.mode = 'inline';
            entry.skipped = true;
            entry.bytes = payload.length;
            entry.error = 'payload >90KB (CacheService cap)';
          }
        }
      }
    } catch(e) {
      entry.error = String(e && e.message || e);
    }

    entry.ms = Date.now() - sheetT0;
    perSheet.push(entry);
  }

  // δ4 (2026-05-03): pre-compute MP_CC_V1::<uid> per company.
  // ----------------------------------------------------------
  // ROOT CAUSE addressed:
  //   Companies sheet payload (187 rows × 36 cols) > 90KB, so
  //   __mp_auditCachePut_ silently dropped the persist write.
  //   Every cold open paid +793ms for COLD_SHEET_READ + recompute.
  //
  // FIX (Master §1.3 "cache decisions, not bytes"):
  //   Iterate Companies and call _mp_companyConstraintsCached_ per row,
  //   so the COMPUTED constraint object lands in CacheService under
  //   MP_CC_V1::<uid> (≤5KB per key, never near the 100KB cap).
  //   Reader's _mp_companyConstraintsCached_ then HITs and skips the
  //   ~450ms compute path entirely on cold open.
  //
  // FAILURE SEMANTICS (fail-loud, per AGENT_CONSTITUTION):
  //   - Missing _mp_companyConstraintsCached_ → log + skip stage (no throw)
  //   - Per-row compute throw → catch + count + log + continue
  //   - Per-row payload >95KB → handled inside cached wrapper itself
  //   - Counters surface via result.ccPrecompute for observability
  var ccPrecompute = { warmed: 0, skipped: 0, errors: 0, ms: 0 };
  var ccT0 = Date.now();
  try {
    if (typeof _mp_companyConstraintsCached_ !== 'function') {
      ccPrecompute.errors++;
      Logger.log('[' + MP_WARM_BUILD + '] δ4 SKIPPED: _mp_companyConstraintsCached_ not loaded');
    } else {
      var ccPack = (typeof __mp_getSheetDataPersistCached_ === 'function')
        ? __mp_getSheetDataPersistCached_(ss, 'Companies', 600)
        : null;
      var ccData = (ccPack && ccPack.data) || [];
      if (ccData.length < 2) {
        ccPrecompute.errors++;
        Logger.log('[' + MP_WARM_BUILD + '] δ4 SKIPPED: Companies sheet empty/unreadable rows=' + ccData.length);
      } else {
        var ccHdr = (ccPack && ccPack.hdr) || ccData[0] || [];
        var hmap = {};
        for (var hi = 0; hi < ccHdr.length; hi++) {
          hmap[String(ccHdr[hi] || '').toLowerCase().trim()] = hi;
        }
        var _ccCol = function(aliases) {
          for (var ai = 0; ai < aliases.length; ai++) {
            if (Object.prototype.hasOwnProperty.call(hmap, aliases[ai])) return hmap[aliases[ai]];
          }
          return -1;
        };
        var cUid  = _ccCol(['company uid','company_uid','uid']);
        var cName = _ccCol(['company','company name','name']);
        var cLoc  = _ccCol(['location']);

        for (var ri = 1; ri < ccData.length; ri++) {
          var row = ccData[ri] || [];
          var uid  = cUid  >= 0 ? String(row[cUid]  || '').trim() : '';
          var name = cName >= 0 ? String(row[cName] || '').trim() : '';
          var loc  = cLoc  >= 0 ? String(row[cLoc]  || '').trim() : '';
          if (!uid && !name) { ccPrecompute.skipped++; continue; }
          try {
            _mp_companyConstraintsCached_(ss, name, loc, uid);
            ccPrecompute.warmed++;
          } catch(eRow) {
            ccPrecompute.errors++;
            Logger.log('[' + MP_WARM_BUILD + '] δ4 row-compute fail uid=' + uid +
                       ' name=' + name + ' err=' + (eRow && eRow.message || eRow));
          }
        }
      }
    }
  } catch(eCC) {
    ccPrecompute.errors++;
    Logger.log('[' + MP_WARM_BUILD + '] δ4 OUTER FAIL: ' + (eCC && eCC.message || eCC));
  }
  ccPrecompute.ms = Date.now() - ccT0;

  // δ12 (2026-05-03): warm Audit planning rowByAuditId index.
  // ----------------------------------------------------------
  // Backed by AuditPlanningRowIndexCache_d12.js. This index is what
  // getToolkitOpenFastV5's readAuditPlanning stage reads on cold open.
  // Without warmer hit, the open path falls back to legacy persist
  // wrapper (which itself overflows the 90KB cap → COLD_SHEET_READ).
  // FAILURE SEMANTICS: missing function or build error → log + skip.
  var apIndex = { ok: false, count: 0, ms: 0 };
  try {
    if (typeof __mp_warmAuditPlanningRowIndex_ === 'function') {
      apIndex = __mp_warmAuditPlanningRowIndex_(ss);
    } else {
      apIndex.error = '__mp_warmAuditPlanningRowIndex_ not loaded';
      Logger.log('[' + MP_WARM_BUILD + '] δ12 SKIPPED: ' + apIndex.error);
    }
  } catch (eAp) {
    apIndex.error = String(eAp && eAp.message || eAp);
    Logger.log('[' + MP_WARM_BUILD + '] δ12 OUTER FAIL: ' + apIndex.error);
  }

  // δ13 (d14): pre-compute resolvePlanningWindow per audit.
  // ---------------------------------------------------------
  // Eliminates ~600ms cold cost from getToolkitOpenFastV5 stage
  // 'resolvePlanningWindow_d14'. Reads AP sheet once, calls cached
  // wrapper per row → writes MP_PW_V1::<gen>::<auditId>.
  var pwPrecompute = { warmed: 0, skipped: 0, errors: 0, ms: 0 };
  var pwT0 = Date.now();
  try {
    if (typeof _mp_resolvePlanningWindowCached_ !== 'function') {
      pwPrecompute.errors++;
      Logger.log('[' + MP_WARM_BUILD + '] δ13 SKIPPED: _mp_resolvePlanningWindowCached_ not loaded');
    } else {
      var apSh = ss.getSheetByName('Audit planning');
      if (!apSh) {
        pwPrecompute.errors++;
        Logger.log('[' + MP_WARM_BUILD + '] δ13 SKIPPED: Audit planning sheet missing');
      } else {
        var apData = apSh.getDataRange().getValues() || [];
        if (apData.length < 2) {
          pwPrecompute.errors++;
        } else {
          var apHdr = apData[0] || [];
          var aiCol = -1;
          for (var hi = 0; hi < apHdr.length; hi++) {
            var hh = String(apHdr[hi] || '').trim().toLowerCase();
            if (hh === 'audit id' || hh === 'audit_id' || hh === 'auditid') { aiCol = hi; break; }
          }
          if (aiCol < 0) {
            pwPrecompute.errors++;
            Logger.log('[' + MP_WARM_BUILD + '] δ13 SKIPPED: Audit ID column not found');
          } else {
            for (var pwR = 1; pwR < apData.length; pwR++) {
              var pwAi = String(apData[pwR][aiCol] || '').trim();
              if (!pwAi) { pwPrecompute.skipped++; continue; }
              try {
                _mp_resolvePlanningWindowCached_(ss, apHdr, apData[pwR], pwAi);
                pwPrecompute.warmed++;
              } catch (eRow) {
                pwPrecompute.errors++;
              }
            }
          }
        }
      }
    }
  } catch (ePw) {
    pwPrecompute.errors++;
    Logger.log('[' + MP_WARM_BUILD + '] δ13 OUTER FAIL: ' + (ePw && ePw.message || ePw));
  }
  pwPrecompute.ms = Date.now() - pwT0;

  // δ14 (d14): pre-compute eligibility per audit (CHUNKED 25 / cycle).
  // -------------------------------------------------------------------
  // Eliminates the 5126ms cold 'bundle.auditors' on first-ever-open
  // of an unseen audit. Cycle pointer in PropertiesService rotates
  // through all audits over ~ceil(N/25)*4min (e.g. 101 audits → 16min).
  // TTL on elig + audCache bumped to 1500s (25min) > full cycle.
  // Watchdog: bail if cycle approaches 4min30s budget (under GAS 6min cap).
  var eligPrecompute = { warmed: 0, skipped: 0, errors: 0, totalAudits: 0, chunkStart: 0, chunkEnd: 0, nextPtr: 0, ms: 0, watchdogTripped: false };
  var eligT0 = Date.now();
  try {
    if (typeof getToolkitAuditorsV5 !== 'function') {
      eligPrecompute.errors++;
      Logger.log('[' + MP_WARM_BUILD + '] δ14 SKIPPED: getToolkitAuditorsV5 not loaded');
    } else {
      var apSh2 = ss.getSheetByName('Audit planning');
      var allIds = [];
      if (apSh2) {
        var d2 = apSh2.getDataRange().getValues() || [];
        if (d2.length >= 2) {
          var hdr2 = d2[0] || [];
          var aiCol2 = -1;
          for (var hi2 = 0; hi2 < hdr2.length; hi2++) {
            var hh2 = String(hdr2[hi2] || '').trim().toLowerCase();
            if (hh2 === 'audit id' || hh2 === 'audit_id' || hh2 === 'auditid') { aiCol2 = hi2; break; }
          }
          if (aiCol2 >= 0) {
            for (var rr = 1; rr < d2.length; rr++) {
              var vId = String(d2[rr][aiCol2] || '').trim();
              if (vId) allIds.push(vId);
            }
          }
        }
      }
      eligPrecompute.totalAudits = allIds.length;
      if (allIds.length === 0) {
        eligPrecompute.errors++;
        Logger.log('[' + MP_WARM_BUILD + '] δ14 SKIPPED: no audit IDs found');
      } else {
        var ptrKey = 'MP_WARM_ELIG_PTR';
        var ptr = parseInt(props.getProperty(ptrKey) || '0', 10);
        if (!isFinite(ptr) || ptr < 0 || ptr >= allIds.length) ptr = 0;
        var CHUNK = 25;
        var endIdx = Math.min(ptr + CHUNK, allIds.length);
        eligPrecompute.chunkStart = ptr;
        for (var ei = ptr; ei < endIdx; ei++) {
          var aId = allIds[ei];
          try {
            getToolkitAuditorsV5(aId);
            eligPrecompute.warmed++;
          } catch (eEl) {
            eligPrecompute.errors++;
          }
          // Watchdog: ~4min30s elapsed → stop chunk early; resume next cycle.
          if (Date.now() - t0 > 270000) {
            eligPrecompute.watchdogTripped = true;
            endIdx = ei + 1;
            break;
          }
        }
        eligPrecompute.chunkEnd = endIdx;
        var nextPtr = (endIdx >= allIds.length) ? 0 : endIdx;
        props.setProperty(ptrKey, String(nextPtr));
        eligPrecompute.nextPtr = nextPtr;
      }
    }
  } catch (eAll) {
    eligPrecompute.errors++;
    Logger.log('[' + MP_WARM_BUILD + '] δ14 OUTER FAIL: ' + (eAll && eAll.message || eAll));
  }
  eligPrecompute.ms = Date.now() - eligT0;

  var totalMs = Date.now() - t0;
  var okCount = 0;
  for (var k = 0; k < perSheet.length; k++) if (perSheet[k].ok) okCount++;

  var result = {
    ok: okCount === MP_WARM_SHEETS.length,
    build: MP_WARM_BUILD,
    okCount: okCount,
    totalSheets: MP_WARM_SHEETS.length,
    totalMs: totalMs,
    perSheet: perSheet,
    ccPrecompute: ccPrecompute,
    apIndex: apIndex,
    pwPrecompute: pwPrecompute,
    eligPrecompute: eligPrecompute,
    ssId: ss.getId()
  };

  props.setProperty(MP_WARM_PROP_LAST_RUN, new Date().toISOString());
  props.setProperty(MP_WARM_PROP_LAST_RESULT, JSON.stringify(result));

  Logger.log('[' + MP_WARM_BUILD + '] keepHot ' + (result.ok ? 'OK' : 'PARTIAL') +
             ' totalMs=' + totalMs + ' okCount=' + okCount + '/' + MP_WARM_SHEETS.length +
             ' perSheet=' + JSON.stringify(perSheet) +
             ' ccPrecompute=' + JSON.stringify(ccPrecompute) +
             ' pwPrecompute=' + JSON.stringify(pwPrecompute) +
             ' eligPrecompute=' + JSON.stringify(eligPrecompute));

  return result;
}
