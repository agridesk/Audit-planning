// BUILD: ManagerPlanningBackend_CORE_SPLIT_d48_TOOLKIT_COMPANY_CONTRACT_FIX_20260524
// CHANGE: d29 adds backend locked-auditor short-circuit in getToolkitOpenFastV5 with production Logger evidence; no cache/eligibility/rotation-service changes.
// PRIOR BUILD: ManagerPlanningBackend_CORE_SPLIT_d26_CANONICAL_OWNER_CLEANUP_20260514
// d18: eligibility cluster (22 fns) moved to Toolkit_Eligibility_d18.js. d17: TDM (16 fns) moved to Toolkit_AvailabilityMonth_d17.js. d16: PW (7 fns) moved to PlanningWindow_d16.js. CORE now ~116 fns. d19 = d18 + diagnostic loaders (TEST_PW/TDM/ELIG_LOADED) appended. No behavior change.
// PRIOR BUILD: ManagerPlanningBackend_GATE_D_v1_20260501 (incl. GATE B + B+ + C + D calendar sheet-persist)
//
// === GATE D (2026-05-01) — calendar cache sheet-persistence + invalidation ===
//
// _mp_tdm_cacheGet_/_Put_ now delegate to optional sheet-cache helpers
// exposed by OpenCacheWarmer_v4_20260501.gs:
//   - typeof MP_CAL_SHEET_GET        === 'function'  -> 3rd tier read after CacheService miss
//   - typeof MP_CAL_SHEET_PUT        === 'function'  -> mirror script.put to sheet
//   - typeof MP_CAL_SHEET_INVALIDATE === 'function'  -> mirror invalidate to sheet
//
// New functions:
//   - _mp_tdm_cacheInvalidate_(email, monthKey)      surgical per-key invalidation
//   - _mp_calInvalidateForAudit_(auditId, email,
//                                blocks)              invalidates auditor x [monthKeys
//                                                     derived from save blocks]
//
// saveManagerPlanning calls _mp_calInvalidateForAudit_ at 3 points (start
// defensive, post-write, exception). Result: any planning save immediately
// drops the calendar cache for the affected auditor x months. The next
// nightly warmer (or next user open) will repopulate.
//
// === GATE C (2026-05-01) — open-cache sheet-persistence delegation ===
//
// _mp_open_cacheGet_/_Put_/_Invalidate_ now delegate to optional sheet-cache
// helpers exposed by OpenCacheWarmer_v1_20260501.gs:
//   - typeof MP_OPEN_SHEET_GET        === 'function'  -> 3rd-tier read after script-cache miss
//   - typeof MP_OPEN_SHEET_PUT        === 'function'  -> mirror script.put to sheet
//   - typeof MP_OPEN_SHEET_INVALIDATE === 'function'  -> mirror script.remove to sheet
//
// All delegations are typeof-guarded. If OpenCacheWarmer_v1 is removed,
// behavior reverts to GATE B+ (script-cache only, 300s TTL). The sheet
// layer survives container restarts and CacheService eviction, allowing a
// nightly V5_warmAllPendingPlanning_() pre-warm to hold across days.
//
// === GATE B+ (2026-05-01) — open-cache TTL bump ===
//
// _mp_open_cachePut_ TTL bumped 30s -> 300s (5 min). Re-opens of the same
// audit within 5 min now serve the full prebuilt getToolkitOpenFastV5
// response from CacheService (~50-100ms) instead of recomputing all stages
// (readAuditPlanning + resolvePlanningWindow + companyConstraints +
// qualifiedAuditorsFast = ~1.5-2.5s).
//
// Safety: saveManagerPlanning invalidates the open cache at 4 points
// (start, post-aud-cache, post-write, exception). Only staleness window
// is sheet rows mutated by something OTHER than saveManagerPlanning within
// the 5 min TTL.
//
// === GATE B (2026-05-01) — EligibilityService cache integration ===
//
// What changed vs prior build:
//   1. _mp_getEligibleAuditorsList_ wrapped with cache read (entry) and cache
//      write (exit) shims. All three callers (getPlanningContextV5,
//      _mp_getToolkitEligibleAuditorsForRow_, getToolkitAuditorsV5) benefit
//      automatically. Cache is provided by EligibilityService_GATE_A_v2.gs.
//   2. saveManagerPlanning invalidates the eligibility cache for the saved
//      audit at the same 4 points that already invalidate the open/aud caches
//      (start defensive, post-write, exception path).
//   3. New top-level switch ELIG_CACHE_ENABLED_OPEN. Set to false for
//      instant fall-back to legacy recompute behavior without removing
//      EligibilityService_GATE_A_v2.gs.
//
// Safety:
//   - All cache calls are guarded by typeof checks. Removing
//     EligibilityService_GATE_A_v2.gs does not crash this file; behavior
//     reverts to pre-GATE-B (full recompute every call).
//   - On any cache read failure the wrapper falls through to legacy compute.
//   - Cache write failures are logged and ignored (best-effort).
//   - The cached eligibility payload is auditId-scoped and audit-immutable
//     in the dimensions that matter (scopes + assigned auditor + Auditors
//     sheet snapshot via build hash). Caller-specific preassigned flagging
//     is reapplied on each cache hit.
//
// PRIOR BUILD: ManagerPlanningBackend_CORE_SPLIT_T24_TOOLKIT_WINDOW_MONTHS_20260501
//
// PERF-PATCH-A2 (2026-04-27): real fix for the toolkit first-paint cost.
//   The hot path measured by the user (server 2438ms for one auditor + one
//   month) is `getToolkitAvailabilityMonthDirectV5`. The previous
//   implementation used TextFinder to locate ALL rows for the auditor
//   (often 200-400 rows across the full calendar year), then bulk-read
//   contiguous blocks, then filtered by month in memory. For an active
//   auditor with a year of populated availability this read 300+ rows to
//   surface 20-30 month-relevant rows.
//
//   New strategy: read the date column AND auditor-email column upfront
//   (two narrow 1-column getValues calls, ~50-150ms each), filter on
//   (auditor == X AND date in [monthStart, monthEnd]) in a single pass,
//   then read ONLY the matched rows. Cost now scales with rows-in-month
//   (typically 10-31) instead of rows-for-auditor-all-time (200-400+).
//   Expected server time: 2438ms -> 100-400ms. Output shape and cache
//   contract are byte-identical to the prior implementation.
//
// PERF-PATCH-A (2026-04-27): bootstrap +89d window narrowed to 1 month
//   (note: the OVERRIDE at the bottom of this file already nulls
//   firstMonthAvailability, so this change is defense-in-depth in case
//   the override is ever removed). Prefetch debounce relaxed in UI.
//
// Prior build: ManagerPlanningBackend_CORE_SPLIT_T11_PATCHA2_20260427_DIRECTMONTH_INDEXED + EXT K/L MONTHS FIX
// Core file after safe extraction: perf/cache, config scopes, company locations. No behavior changes.


/** 
 * ManagerPlanningV5Backend - CONSOLIDATED WORKING - CACHE FOUNDATION READONLY BRIDGE
 * Baseline: Manager4-style availability + row-index (Date YYYY-MM-DD + Auditor email) + slot1/slot2 + overlap protection
 * Proven working by user tests on: 2025-12-18
 * Source file: ManagerPlanningV5Backend.BASELINE_Manager4AvailabilityPort_ROWINDEX_SORT_v2_RETURNFIX.gs
 * SHA256 (this file, after this header): 544fd62b2af395b9419da69cb239502d6df90aa097a4a2e3dd943e61bf10d15f
 *
 * IMPORTANT:
 * - Sheet: "Auditor Availability" headers must be exactly:
 *   Date, Auditor_Name, Available, First_Audit_Start_Time, First_Audit_End_Time, Audit_ID_1,
 *   Second_Audit_Start_Time, Second_Audit_End_Time, Audit_ID_2, Status_1, Status_2, Last_Updated
 * - Column A Date stored as YYYY-MM-DD string; Column B stores auditor email.
 */

/********************************************************************
 * ManagerPlanningV5Backend.gs - V5.4
 *
 *  - getManagerPlanningAudits()   (lijst, voor oude/simple UI)
 *  - getPlanningContextV5(auditId)
 *  - saveManagerPlanning(auditId, payload)
 *
 *  saveManagerPlanning gebruikt V5_applyAction("MANAGER","PLAN")
 ********************************************************************/


// === GATE B (2026-05-01) — master switch =====================================
// ELIG_CACHE_ENABLED_OPEN: kill switch for the EligibilityService cache
// integration. Default true. Flip to false to instantly revert to legacy
// recompute behavior on every call without removing EligibilityService.gs.
// The cache wrapper inside _mp_getEligibleAuditorsList_ is also guarded by
// typeof checks, so this flag is defense in depth.
var ELIG_CACHE_ENABLED_OPEN = true;
// =============================================================================




function getManagerPlanningAudits() {
  __mp_resetExecCache_();
  try {
    var ss = SpreadsheetApp.getActive();
    var packAp = __mp_getSheetDataCached_(ss, "Audit planning");
    var sh = packAp.sh;
    if (!sh) return {success:false,message:"Missing sheet 'Audit planning'"};

    var data = packAp.data || [];
    var hdr  = packAp.hdr || [];

    var colAI       = hdr.indexOf("Audit ID");
    var colCompany  = hdr.indexOf("Company");
    var colLocation = hdr.indexOf("Location");
    var colAssigned = hdr.indexOf("Assigned to");
    var colStatus   = hdr.indexOf("Status");
    var colPlanned  = hdr.indexOf("Date - Planned");

    var emailMap = buildAuditorEmailMapV54_ || function(){ return {}; };
    emailMap = (typeof buildAuditorEmailMapV54_ === "function")
      ? buildAuditorEmailMapV54_()
      : {};

    var out = [];

    for (var r = 1; r < data.length; r++) {
      var row = data[r];

      var auditId = colAI >= 0 ? row[colAI] : "";
      var status  = colStatus >= 0 ? row[colStatus] : "";

      if (!auditId && !status) continue; // dode rij

      var assignedName = colAssigned >= 0 ? row[colAssigned] : "";
      var key = String(assignedName || "").trim().toLowerCase();
      var audEmail = emailMap[key] || "";

      var plannedVal = colPlanned >= 0 ? row[colPlanned] : "";
      var plannedStr = "-";
      if (plannedVal instanceof Date) {
        plannedStr = Utilities.formatDate(
          plannedVal,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd"
        );
      } else if (plannedVal) {
        plannedStr = plannedVal;
      }

      out.push({
        auditId:      auditId,
        company:      colCompany  >= 0 ? row[colCompany]  : "",
        location:     colLocation >= 0 ? row[colLocation] : "",
        auditor:      assignedName,
        auditorEmail: audEmail,
        status:       status,
        planned:      plannedStr
      });
    }

    return {
      success:true,
      audits:out
    };

  } catch(e) {
    return {success:false,message:e.message};
  }
}



/**
 * EXT / Toolkit planning-window truth resolver.
 *
 * Planning Toolkit must display the persisted planning window from
 * Audit planning columns AS/AT (headers: Planning window from/to).
 * _mp_resolvePlanningWindow_ may still be used as fallback/enrichment, but
 * it must not override AS/AT after EXT apply/undo.
 */
function V5_resolvePlanningWindowFromAuditPlanningRow_(hdr, row, fallbackWin) {
  fallbackWin = fallbackWin || {};
  hdr = hdr || [];
  row = row || [];

  function fmt_(v) {
    try {
      if (typeof ManagerV5_fmtDate_ === 'function') return ManagerV5_fmtDate_(v);
    } catch (e0) {}
    try {
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    } catch (e1) {}
    var s = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s;
  }

  function idx_(names) {
    try {
      if (typeof _mp_findCol_ === 'function') return _mp_findCol_(hdr, names || []);
    } catch (e2) {}
    var want = (names || []).map(function(n) {
      return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    });
    for (var i = 0; i < hdr.length; i++) {
      var h = String(hdr[i] || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      for (var j = 0; j < want.length; j++) {
        if (h && want[j] && h === want[j]) return i;
      }
    }
    return -1;
  }

  var cFrom = idx_(['Planning window from', 'Plan van', 'Planning from']);
  var cTo = idx_(['Planning window to', 'Plant tot', 'Planning to']);

  var fromVal = cFrom >= 0 ? fmt_(row[cFrom]) : '';
  var toVal = cTo >= 0 ? fmt_(row[cTo]) : '';

  if (fromVal || toVal) {
    return {
      startDate: fromVal,
      endDate: toVal,
      mode: 'SHEET_AS_AT',
      source: 'Audit planning AS/AT',
      warnings: fallbackWin.warnings || [],
      scopeWindows: fallbackWin.scopeWindows || [],
      activeScopes: fallbackWin.activeScopes || []
    };
  }

  return fallbackWin;
}

/**
 * Detail voor de toolkit: audit + basis-planningswindow + auditors.
 */
// ===========================
// PRIO 1A — Company constraints via Company_UID
function getPlanningContextV5(auditId) {
  __mp_resetExecCache_();
  try {
    auditId = String(auditId || "").trim();
    if (!auditId) return {success:false,message:"Missing auditId"};

    var ss = SpreadsheetApp.getActive();
    // PERF-PHASE1: route through exec cache (was raw getDataRange every call)
    var __apPack = __mp_getSheetDataCached_(ss, "Audit planning");
    var sh = __apPack.sh;
    if (!sh) return {success:false,message:"Missing sheet 'Audit planning'"};

    var data = __apPack.data || [];
    var hdr  = __apPack.hdr || data[0] || [];

    function findIndex(names) {
      for (var i=0;i<hdr.length;i++) {
        var h = String(hdr[i]||"").toLowerCase();
        for (var j=0;j<names.length;j++) {
          if (h.indexOf(String(names[j]).toLowerCase()) >= 0) return i;
        }
      }
      return -1;
    }

    var colAI         = _mp_findCol_(hdr, ["Audit ID"]);
    var colCompany    = _mp_findCol_(hdr, ["Company"]);
    var colLocation   = _mp_findCol_(hdr, ["Location"]);
    var colStatus     = _mp_findCol_(hdr, ["Status"]);
    var colReqHours   = findIndex(["total audit time in hours","total time in hours","required hours","total hours"]);
    var colPreAssign  = findIndex(["pre assigned auditor","pre-assigned auditor","preassigned auditor"]);
    var colAssignedTo = (function(){
  for (var i = 0; i < hdr.length; i++) {
    var h = String(hdr[i] || "").trim().toLowerCase();
    // MUST skip any column containing "pre" to avoid matching "Preassigned Auditor"
    if (h.indexOf("pre") >= 0) continue;
    if (h === "assigned to" || h === "assigned auditor" || h === "assigned") return i;
  }
  return -1;
})();
    // If not found, fall back to a header that is exactly "Auditor" or contains "Auditor" (but NOT preassigned).
    if (colAssignedTo < 0) {
      for (var ci=0; ci<hdr.length; ci++) {
        var hh = String(hdr[ci]||"").trim().toLowerCase();
        if (!hh) continue;
        if (hh.indexOf("pre") >= 0 && hh.indexOf("auditor") >= 0) continue; // skip preassigned columns
        if (hh === "auditor" || hh === "auditor email" || hh === "auditor e-mail") { colAssignedTo = ci; break; }
        if (hh.indexOf("auditor") >= 0 && hh.indexOf("assigned") >= 0) { colAssignedTo = ci; break; }
      }
    }
    var colJson       = _mp_findCol_(hdr, ["Planning JSON"]);
    var colCompanyUid = _mp_findCol_(hdr, ["Company_UID", "Company UID", "UID"]);
    var colWillExpire = _mp_findCol_(hdr, ["Date - Will Expire","Date - will expire","Will Expire","Date - Will expire"]);
    var colExtExpire  = _mp_findCol_(hdr, ["Extended Expiration Date","Extende Expiration Date","ExtendedExpiryDate","Extende ExpirationDate"]);
    var colExtApplied = _mp_findCol_(hdr, ["Extension applied","Extension Applied","Extension_applied"]);

    if (colAI < 0) return {success:false,message:"Missing 'Audit ID' column"};

    var rowIndex = -1;
    var row = null;

    for (var r=1;r<data.length;r++) {
      if (String(data[r][colAI]) === auditId) {
        rowIndex = r+1;
        row = data[r];
        break;
      }
    }
    if (!row) return {success:false,message:"Audit not found: "+auditId};

    var requiredHours = 0;
    if (colReqHours >= 0) {
      var rh = row[colReqHours];
      if (typeof rh === "number") requiredHours = rh;
      else if (rh !== null && rh !== "" && !isNaN(Number(rh))) requiredHours = Number(rh);
    }

    var preassigned = colPreAssign >= 0 ? row[colPreAssign] : "";
    var assignedTo = colAssignedTo >= 0 ? row[colAssignedTo] : "";

  // If header-derived values are empty, fall back to fixed columns
  try {
    if (typeof preassigned !== 'undefined') {
      if (!String(preassigned || '').trim()) preassigned = __colV;
    }
  } catch(e) {}
  try {
    if (typeof assignedTo !== 'undefined') {
      if (!String(assignedTo || '').trim()) assignedTo = __colW;
    }
  } catch(e) {}

    var existingBlocks = [];
    if (colJson >= 0 && row[colJson]) {
      try {
        var js = JSON.parse(row[colJson]);
        if (js && Array.isArray(js.blocks)) {
          existingBlocks = js.blocks;
        }
      } catch(e) {}
    }

    // Phase 2.2 - resolve planning window (intersection of scope windows; soft fallbacks)
    var win = V5_resolvePlanningWindowFromAuditPlanningRow_(hdr, row, _mp_resolvePlanningWindow_(ss, hdr, row));

    // Scopes (icons + filters): derived from Audit planning SCOPE_XX columns + Config_Scopes
    var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr, row);

    // Company constraints (Companies is source of truth) via Company_UID
    var auditCompany = colCompany  >= 0 ? row[colCompany]  : "";
    var auditLoc     = colLocation >= 0 ? row[colLocation] : "";
    var companyUid   = colCompanyUid >= 0 ? row[colCompanyUid] : "";
    var companyConstraints = ManagerV5_mergeToolkitCompanyMeta_(_mp_companyConstraintsCached_(ss, auditCompany, auditLoc, companyUid), ss, auditCompany, auditLoc, companyUid);

    // Auditors list: apply HARD qualification filter + SOFT rotation flagging
    var reqScopeNames = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){ return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : ''; }).filter(function(x){return !!x;}) : [];
    var elig = _mp_getEligibleAuditorsList_(ss, reqScopeNames, preassigned, hdr, row, { auditId: auditId });
    var auditors = elig.auditors || [];
    var auditorEligibilityMeta = elig.meta || {};

    // Ensure preassigned auditor is always shown as FIRST option in dropdown.
    // If preassigned is not qualified (HARD), show but mark as ineligible (disabled in UI).
    (function(){
      var pre = String(preassigned || '').trim();
      if (!pre) return;

      var preLower = pre.toLowerCase();
      var foundIx = -1;
      for (var i=0;i<auditors.length;i++){
        var a = auditors[i] || {};
        var nm = String(a.name||'').trim().toLowerCase();
        var em = String(a.email||'').trim().toLowerCase();
        if (nm === preLower || em === preLower){
          foundIx = i;
          break;
        }
      }

      if (foundIx >= 0){
        // Move eligible preassigned to the front
        var obj = auditors.splice(foundIx, 1)[0];
        obj.isPreassigned = true;
        auditors.unshift(obj);
        return;
      }

      // Preassigned auditor is not eligible: do not inject into manager dropdown.
    })();

  // NOTE: Auditor default unavailable weekdays are derived from Auditor Availability (SSoT) in the toolkit UI.
  // Legacy union defaults from Auditors sheet are intentionally not returned here.




    // === DEFAULT AUDITOR SELECTION FOR TOOLKIT (SSoT) ===
    // Requirement:
    // - Assigned to is leading truth for toolkit default.
    // - Preassigned auditor is fallback only when Assigned to is still empty.
    // Output:
    // - defaultAuditorEmail / defaultAuditorName: resolved from auditors list or Auditors sheet lookup.
    var defaultAuditorEmail = '';
    var defaultAuditorName = '';
    var managerFallbackEmail = '';
    var managerFallbackName = '';
    (function(){
      try {
        function __resolveAuditorKey_(rawKey) {
          var key = String(rawKey || '').trim();
          if (!key) return null;
          var lower = key.toLowerCase();
          for (var i = 0; i < (auditors || []).length; i++) {
            var a = auditors[i] || {};
            var em = String(a.email || '').trim();
            var nm = String(a.name || '').trim();
            if ((em && em.toLowerCase() === lower) || (nm && nm.toLowerCase() === lower)) {
              return {
                email: V5_normalizeEmail_(em || ''),
                name: nm || key
              };
            }
          }
          return null;
        }

        var resolved = null;

        var assKey = String(assignedTo || '').trim();
        if (assKey) {
          resolved = __resolveAuditorKey_(assKey);
        }

        if (!resolved) {
          var preKey = String(preassigned || '').trim();
          if (preKey) {
            resolved = __resolveAuditorKey_(preKey);
          }
        }

        // Do not auto-select the single eligible auditor for manager mode.

        if (resolved) {
          defaultAuditorEmail = resolved.email || '';
          defaultAuditorName = resolved.name || '';
        }

        // Never use a manager account as auditor fallback.
      } catch(e){}
    })()

    companyConstraints = ManagerV5_applyToolkitAuditorBlockedWeekdays_(companyConstraints, ss, defaultAuditorEmail, defaultAuditorName || assignedTo || preassigned);
    // === AVAILABILITY DEFAULTS ENSURE (ON-DEMAND) ===
    // Ensures that for the initially opened toolkit month (and near-future window),
    // the Auditor Availability sheet has materialized DEFAULT_* rows so the toolkit calendar
    // and "default unavailable weekdays" panel can render immediately (no 3-month navigation needed).
    try {
      var __ctxCallerEmail = V5_getCallerEmail_();
      var __ctxRoleObj = V5_getUserRoleFromAuditors_(ss, __ctxCallerEmail);
      var __ctxRole = (__ctxRoleObj && __ctxRoleObj.found) ? String(__ctxRoleObj.role || '').trim() : '';
      var __ctxIsAuditor = V5_isAuditorRole_(__ctxRole);
      if (__ctxIsAuditor) {
        V5_ensureAuditorAvailabilityDefaultsForToolkitOpen_(auditors, defaultAuditorEmail);
      }
    } catch (eEns) {
      Logger.log('[V5] ensure defaults skipped: ' + eEns);
    }

;

    return {
      success:true,
      defaultAuditorEmail: defaultAuditorEmail,
      defaultAuditorName: defaultAuditorName,
      managerFallbackEmail: managerFallbackEmail,
      managerFallbackName: managerFallbackName,
      locationsCount: companyConstraints.locationsCount || 1,
      hqName: companyConstraints.hqName || "HQ",
      hqGps: companyConstraints.hqGps || "",
      slotTemplates: companyConstraints.slotTemplates || null,
      audit:{
        auditId: auditId,
        companyUid: _mp_safeStr_(companyConstraints.companyUid || companyUid),
        company: auditCompany,
        location: auditLoc,
        scopes: (scopesRes && scopesRes.scopes) ? scopesRes.scopes : [],
        scopesText: (scopesRes && scopesRes.scopesText) ? scopesRes.scopesText : "",

        status:  colStatus   >= 0 ? row[colStatus]   : "",
        requiredHours: requiredHours,
        preassignedAuditor: preassigned,
        assignedTo: assignedTo,
        preassignedAuditorEmail: defaultAuditorEmail,
        willExpireDate: (colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : "",
        extendedExpiryDate: (colExtExpire >= 0 && row[colExtExpire]) ? V5_formatDateISO_(row[colExtExpire]) : ((colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : ""),
        extensionApplied: (function(){
          var flag = (colExtApplied >= 0 && row[colExtApplied]) ? String(row[colExtApplied]).trim().toLowerCase() : "";
          if (flag === "yes" || flag === "true") return true;
          var y = (colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : "";
          var z = (colExtExpire >= 0 && row[colExtExpire]) ? V5_formatDateISO_(row[colExtExpire]) : "";
          return (y && z && y !== z);
        })(),

        existingBlocks: existingBlocks
      },
      companyConstraints: companyConstraints,
      auditors: auditors,
      defaultAuditorEmail: defaultAuditorEmail,
      defaultAuditorName: defaultAuditorName,
      managerFallbackEmail: managerFallbackEmail,
      managerFallbackName: managerFallbackName,
      auditorEligibilityMeta: auditorEligibilityMeta,
window:{
        startDate: win.startDate,
        endDate:   win.endDate,
        mode: win.mode
      },
      warnings: win.warnings || [],
      scopeWindows: win.scopeWindows || [],
      activeScopes: win.activeScopes || []
    };

  } catch(e) {
    return {success:false,message:e.message};
  }
}



/**
 * saveManagerPlanning
 * payload:
 *  {
 *    auditorName,
 *    auditorEmail,
 *    // NEW (preferred):
 *    blocks: [{date,start,end}, ...]  // 1-5
 *  }
 */

function V5_syncAuditArtifactsAfterPlanningSave_(auditId) {
  return {
    success:true,
    auditId:String(auditId || '').trim(),
    auditTime:{ skipped:true, message:'Deferred for save performance' },
    planningWindow:{ skipped:true, message:'Deferred for save performance' },
    expirySync:{ skipped:true, message:'Deferred for save performance' }
  };
}


function __mp_queuePlanningNotificationAfterSave_(auditId, ctx) {
  ctx = ctx || {};
  auditId = String(auditId || '').trim();
  var actorRole = String(ctx.actorRole || '').trim().toUpperCase();
  var status = String(ctx.status || '').trim();
  var statusKey = '';

  try {
    statusKey = (typeof Status_normalizeStatus_ === 'function')
      ? Status_normalizeStatus_(status)
      : status.toUpperCase().replace(/\s+/g, '_');
  } catch (eStatus) {
    statusKey = status.toUpperCase().replace(/\s+/g, '_');
  }

  if (!auditId) {
    return { success:false, skipped:true, reason:'MISSING_AUDIT_ID' };
  }

  if (typeof NB_queueNotification_ !== 'function') {
    Logger.log('[PLAN_NOTIFY][MISSING_BUILDER] auditId=' + auditId + ' event=PLAN');
    return { success:false, skipped:true, reason:'NB_queueNotification_ missing' };
  }

  var eventType = '';
  var recipient = '';
  var recipientRole = '';

  if (actorRole === 'MANAGER') {
    eventType = 'AUDIT_PLANNED_BY_MANAGER';
    recipient = String(ctx.auditorEmail || '').trim();
    recipientRole = 'auditor';

    if (statusKey !== 'APPROVED' && status.toLowerCase() !== 'approved') {
      return { success:true, skipped:true, reason:'MANAGER_PLAN_NOT_APPROVED', status:status };
    }
  } else if (actorRole === 'AUDITOR') {
    eventType = 'AUDIT_PLANNED_BY_AUDITOR';
    recipient = __mp_resolveManagerNotificationRecipientForAudit_(auditId);
    recipientRole = 'manager';

    if (statusKey !== 'PENDING_APPROVAL' && status.toLowerCase() !== 'pending approval') {
      return { success:true, skipped:true, reason:'AUDITOR_PLAN_NOT_PENDING_APPROVAL', status:status };
    }
  } else {
    return { success:true, skipped:true, reason:'UNSUPPORTED_ACTOR_ROLE', actorRole:actorRole };
  }

  if (!recipient) {
    Logger.log('[PLAN_NOTIFY][MISSING_RECIPIENT] auditId=' + auditId + ' event=' + eventType);
    return { success:false, skipped:true, reason:'MISSING_RECIPIENT', eventType:eventType };
  }

  try {
    var payload = {
      eventType: eventType,
      auditId: auditId,
      company: String(ctx.company || '').trim(),
      actor: String(ctx.actorEmail || '').trim(),
      actorEmail: String(ctx.actorEmail || '').trim(),
      actorRole: actorRole === 'MANAGER' ? 'Manager' : 'Auditor',
      recipientRole: recipientRole,
      resultStatus: status,
      plannedDates: Array.isArray(ctx.plannedDates) ? ctx.plannedDates.slice() : [],
      plannedHours: ctx.plannedHours,
      blocks: Array.isArray(ctx.blocks) ? ctx.blocks.slice() : [],
      auditorEmail: String(ctx.auditorEmail || '').trim(),
      auditorName: String(ctx.auditorName || '').trim()
    };

    var res = NB_queueNotification_(recipient, eventType, payload);
    var selfCopyRes = null;

    if (actorRole === 'AUDITOR') {
      var selfRecipient = String(ctx.auditorEmail || ctx.actorEmail || '').trim();
      if (selfRecipient) {
        var selfPayload = {};
        Object.keys(payload).forEach(function(k) { selfPayload[k] = payload[k]; });
        selfPayload.recipientRole = 'auditor';
        selfPayload.copyType = 'AUDITOR_SELF_COPY';
        selfPayload.subject = '';
        selfCopyRes = NB_queueNotification_(selfRecipient, eventType, selfPayload);
      }
    }

    return {
      success: !!(res && res.success !== false) && (!selfCopyRes || selfCopyRes.success !== false),
      eventType: eventType,
      recipient: recipient,
      selfCopyRecipient: actorRole === 'AUDITOR' ? String(ctx.auditorEmail || ctx.actorEmail || '').trim() : '',
      selfCopyStatus: selfCopyRes && selfCopyRes.status ? selfCopyRes.status : '',
      status: res && res.status ? res.status : '',
      queueSheet: res && res.queueSheet ? res.queueSheet : '',
      skipped: !!(res && res.skipped),
      raw: res || null,
      selfCopyRaw: selfCopyRes || null
    };
  } catch (eQueue) {
    Logger.log('[PLAN_NOTIFY][QUEUE_FAIL] auditId=' + auditId + ' event=' + eventType + ' err=' + (eQueue && eQueue.message ? eQueue.message : eQueue));
    return {
      success:false,
      eventType:eventType,
      recipient:recipient,
      error:String(eQueue && eQueue.message ? eQueue.message : eQueue)
    };
  }
}

function __mp_resolveManagerNotificationRecipientForAudit_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return '';

  try {
    var ss = SpreadsheetApp.getActive();
    var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var data = pack.data || [];
    var hdr = pack.hdr || [];
    if (!data || data.length < 2) return '';

    var colAI = _mp_findCol_(hdr, ['Audit ID']);
    var colManager = _mp_findCol_(hdr, ['Manager_Email', 'Manager Email', 'Manager e-mail']);
    if (colAI >= 0 && colManager >= 0) {
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][colAI] || '').trim() === auditId) {
          var rowManager = String(data[r][colManager] || '').trim();
          if (rowManager) return rowManager;
          break;
        }
      }
    }
  } catch (eAp) {}

  try {
    if (typeof V5_getActiveManagerFallbackFromAuditors_ === 'function') {
      var mgr = V5_getActiveManagerFallbackFromAuditors_(SpreadsheetApp.getActive());
      if (mgr && mgr.email) return String(mgr.email || '').trim();
    }
  } catch (eMgr) {}

  try {
    if (typeof NotificationConfig_GetSetting === 'function') {
      var fallback = String(NotificationConfig_GetSetting('DEFAULT_MANAGER_EMAIL', '') || '').trim();
      if (fallback) return fallback;
    }
  } catch (eCfg) {}

  return '';
}

function saveManagerPlanning(auditId, payload) {
  // GATE J (20260502): do NOT reset exec cache here. openFast just primed
  // it with 'Audit planning' data; the inline companyConstraints check and
  // qualificationGuard scan below both reuse that warm cache instead of
  // re-reading the sheet (saves ~3-4s on warm save path).
  var __t0 = Date.now();
  var __dbg = {};
  function __stamp(label, extra){
    var obj = extra || {};
    obj.ms = Date.now() - __t0;
    __dbg[label] = obj;
  }

  if (auditId && typeof auditId === 'object' && auditId !== null && (typeof payload === 'string' || typeof payload === 'undefined')) {
    var __tmp = payload;
    payload = auditId;
    auditId = __tmp;
  }

  auditId = String(auditId || '').trim();
  if (!payload || typeof payload !== 'object') payload = {};
  if (!auditId) return { success:false, message:'Missing auditId' };

  try { AS_resetExecCache_(); } catch(_e) {}

  // GATE J (20260502): the 4 pre-save cache invalidations were removed.
  // They are duplicated at end-of-function (lines ~900-909) which already
  // covers the freshness guarantee. The 25s LockService.waitLock prevents
  // mid-save concurrent re-population, so the start-of-function copies
  // were pure overhead (~1-2s of CacheService.remove latency).
  // Original calls were: _mp_open_cacheInvalidate_, _mp_aud_cacheInvalidate_,
  // elig_cacheInvalidate_, _mp_calInvalidateForAudit_.

  if (!payload.blocks || !Array.isArray(payload.blocks) || payload.blocks.length === 0) {
    if (payload.date && payload.start && payload.end) {
      payload.blocks = [{ date: payload.date, start: payload.start, end: payload.end }];
    }
  }

  payload.blocks = (payload.blocks || []).map(function(b){
    return {
      date:  V5_normDateISO_Strict_(b.date),
      start: V5_minutesToHHMM_(V5_timeToMinutes_(b.start)),
      end:   V5_minutesToHHMM_(V5_timeToMinutes_(b.end)),
      execLoc: String((b && (b.execLoc || b.executionLocation || b.location)) || '').trim(),
      slotComment: String((b && (b.slotComment || b.comment)) || '').trim()
    };
  }).filter(function(b){ return b.date && b.start && b.end; });

  if (!payload.blocks.length) return { success:false, message:'No valid planning blocks provided' };

  var softWarnings = [];

  (function(){
    try {
      var ss0 = SpreadsheetApp.getActive();
      var __apPack0 = __mp_getSheetDataCached_(ss0, 'Audit planning');
      var ap = __apPack0.sh;
      if (!ap) return;
      var apVals = __apPack0.data || [];
      if (!apVals || apVals.length < 2) return;
      var apHdr = __apPack0.hdr || apVals[0] || [];
      var apMap = V5_headerIndexMap_(apHdr);
      var iId = (apMap['audit_id'] !== undefined) ? apMap['audit_id'] : ((apMap['audit id'] !== undefined) ? apMap['audit id'] : undefined);
      if (iId === undefined) return;
      var row = null;
      for (var rr = 1; rr < apVals.length; rr++) {
        if (String(apVals[rr][iId] || '').trim() === String(auditId || '').trim()) { row = apVals[rr]; break; }
      }
      if (!row) return;
      var iComp = (apMap['company'] !== undefined) ? apMap['company'] : -1;
      var iLoc  = (apMap['location'] !== undefined) ? apMap['location'] : -1;
      var iUid  = (apMap['company_uid'] !== undefined) ? apMap['company_uid'] : -1;
      var compName = (iComp >= 0) ? String(row[iComp] || '').trim() : '';
      var compLoc  = (iLoc  >= 0) ? String(row[iLoc]  || '').trim() : '';
      var compUid  = (iUid  >= 0) ? String(row[iUid]  || '').trim() : '';
      // GATE J (20260502): use the cached wrapper. openFast just primed this
      // 5-min TTL cache so save almost always hits it (saves ~3-5s).
      var cc = _mp_companyConstraintsCached_(ss0, compName, compLoc, compUid);

      var bw = String((cc && cc.blockedWeekdays) || '').trim();
      if (bw) {
        var set = {};
        bw.split(',').forEach(function(tok){
          tok = String(tok || '').trim();
          if (!tok) return;
          tok = tok.slice(0,2);
          tok = tok.charAt(0).toUpperCase() + tok.charAt(1).toLowerCase();
          set[tok] = true;
        });
        var dayTok = ['Su','Mo','Tu','We','Th','Fr','Sa'];
        for (var bb = 0; bb < (payload.blocks || []).length; bb++) {
          var iso = payload.blocks[bb].date;
          if (!iso) continue;
          var d = new Date(iso + 'T00:00:00');
          var wd = dayTok[d.getDay()];
          if (set[wd]) {
            softWarnings.push('Company blocked weekdays (' + bw + ') matched selected day(s): ' + wd + ' ' + iso + ' — soft warning only.');
          }
        }
      }

      var tw = String((cc && cc.timeWindow) || '').trim();
      if (tw) {
        var m = tw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        if (m && payload && payload.blocks && payload.blocks.length) {
          var aS = _mp_hhmmToMinutes_(m[1]);
          var aE = _mp_hhmmToMinutes_(m[2]);
          var violated = false;
          for (var kk = 0; kk < payload.blocks.length; kk++) {
            var b = payload.blocks[kk] || {};
            var st = String(b.startTime || b.start || '').trim();
            var en = String(b.endTime || b.end || '').trim();
            if (!st || !en) continue;
            var sMin = _mp_hhmmToMinutes_(st);
            var eMin = _mp_hhmmToMinutes_(en);
            if (sMin < aS || eMin > aE) { violated = true; break; }
          }
          if (violated) softWarnings.push('Company time window (' + tw + ') violated — soft warning only.');
        }
      }
    } catch(e) {}
  })();
  __stamp('companyConstraints');

  var __payloadRole = String(payload.actorRole || '').trim().toUpperCase();
  var __callerEmail = V5_normalizeEmail_(payload.actorEmail || payload.userEmail || payload.email || '') || V5_getCallerEmail_();
  var __roleObj = null;
  var __callerRole = '';
  if (__payloadRole === 'AUDITOR' || __payloadRole === 'MANAGER') {
    __callerRole = __payloadRole;
  } else {
    __roleObj = V5_getUserRoleFromAuditors_(SpreadsheetApp.getActiveSpreadsheet(), __callerEmail);
    __callerRole = (__roleObj && __roleObj.found) ? String(__roleObj.role||'').trim().toUpperCase() : '';
  }
  var __treatAsAuditor = (__callerRole === 'AUDITOR');

  var auditorEmail = V5_normalizeEmail_(payload.auditorEmail);
  var auditorName  = String(payload.auditorName || '').trim();

  __stamp('roleGuard');
  if (__treatAsAuditor) {
    var __preRaw = __mp_getPreassignedAuditorForId_(auditId);
    var __pre = V5_normalizeEmail_(__preRaw);
    if (!__pre) {
      return { success:false, message:'Role-guard: user is Auditor but no Preassigned auditor is set for this audit.' };
    }
    payload.auditorEmail = __pre;
    auditorEmail = __pre;
    auditorName  = String(__preRaw || auditorName || '').trim();
  } else {
    // Manager must explicitly select a qualified auditor. Never fall back to a manager account.
    if (!auditorEmail) {
      return { success:false, message:'Choose a qualified auditor before saving planning.' };
    }
  }
  __stamp('roleContext', { actorRole: __callerRole || '', actorEmail: __callerEmail || '', treatAsAuditor: __treatAsAuditor, actorRoleFromPayload: __payloadRole || '' });
  try {
    var __qSs = SpreadsheetApp.getActive();
    var __qHdr = [];
    var __qRow = null;

    // d22 SAVE qualification guard:
    // Use the same fast-qualified cache contract as toolkit open.
    // This avoids the heavy live eligibility/rotation path during SAVE.
    // Cache accelerates only; Auditors + Config_Scopes remain truth.
    var __qRowPack = (typeof __mp_getAuditPlanningRow_ === 'function')
      ? __mp_getAuditPlanningRow_(__qSs, auditId)
      : null;

    if (__qRowPack && __qRowPack.row) {
      __qHdr = __qRowPack.hdr || [];
      __qRow = __qRowPack.row;
    } else {
      var __qPack = __mp_getSheetDataCached_(__qSs, 'Audit planning');
      __qHdr = __qPack.hdr || ((__qPack.data && __qPack.data[0]) || []);
      var __qColAI = _mp_findCol_(__qHdr, ['Audit ID']);
      var __qData = __qPack.data || [];
      for (var __qr = 1; __qr < __qData.length; __qr++) {
        if (String(__qData[__qr][__qColAI] || '').trim() === auditId) { __qRow = __qData[__qr]; break; }
      }
    }

    if (!__qRow) return { success:false, message:'Audit not found for qualification check: ' + auditId };

    var __qScopesRes = v5_extractScopesForAuditPlanningRow_(__qHdr, __qRow);
    var __qRequiredScopes = (__qScopesRes && __qScopesRes.scopes) ? __qScopesRes.scopes.map(function(s){
      return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
    }).filter(function(x){ return !!x; }) : [];

    var __qColPreAssign = (function(){
      for (var __qi = 0; __qi < __qHdr.length; __qi++) {
        var __qh = String(__qHdr[__qi] || '').toLowerCase();
        if (__qh.indexOf('pre assigned auditor') >= 0 ||
            __qh.indexOf('pre-assigned auditor') >= 0 ||
            __qh.indexOf('preassigned auditor') >= 0) return __qi;
      }
      return -1;
    })();
    var __qPreassigned = (__qColPreAssign >= 0) ? String(__qRow[__qColPreAssign] || '').trim() : '';

    var __qAuditors = null;
    var __qCacheHit = false;

    if (typeof _mp_fastOpenQualifiedCacheGet_ === 'function') {
      __qAuditors = _mp_fastOpenQualifiedCacheGet_(__qRequiredScopes, __qPreassigned);
      __qCacheHit = Array.isArray(__qAuditors);
    }

    if (!Array.isArray(__qAuditors)) {
      if (typeof _mp_getQualifiedAuditorsFastList_ !== 'function') {
        throw new Error('Missing _mp_getQualifiedAuditorsFastList_ for save qualification guard');
      }
      __qAuditors = _mp_getQualifiedAuditorsFastList_(__qSs, __qRequiredScopes, __qPreassigned, { auditId: auditId });
      if (typeof _mp_fastOpenQualifiedCachePut_ === 'function') {
        _mp_fastOpenQualifiedCachePut_(__qRequiredScopes, __qPreassigned, __qAuditors);
      }
    }

    var __qNeedEmail = V5_normalizeEmail_(auditorEmail);
    var __qNeedName = String(auditorName || '').trim().toLowerCase();
    var __qOk = false;

    for (var __qa = 0; __qa < (__qAuditors || []).length; __qa++) {
      var __a = __qAuditors[__qa] || {};
      var __em = V5_normalizeEmail_(__a.email || '');
      var __nm = String(__a.name || '').trim().toLowerCase();
      if ((__qNeedEmail && __em === __qNeedEmail) || (__qNeedName && __nm === __qNeedName)) {
        __qOk = true;
        break;
      }
    }

    __stamp('qualificationGuard', {
      ok: __qOk,
      requiredScopes: __qRequiredScopes,
      fastQualifiedCacheHit: __qCacheHit,
      candidates: Array.isArray(__qAuditors) ? __qAuditors.length : 0
    });

    if (!__qOk) {
      return {
        success:false,
        message:'Selected auditor is not qualified for required scopes',
        debugTiming: __dbg,
        totalMs: (Date.now() - __t0)
      };
    }
  } catch (__qErr) {
    return { success:false, message:'Qualification guard failed: ' + (__qErr && __qErr.message ? __qErr.message : __qErr), debugTiming: __dbg, totalMs: (Date.now() - __t0) };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  __stamp('lockAcquired');

  function __safeNumMinutes_(hhmm) {
    var n = V5_timeToMinutes_(hhmm);
    return isFinite(n) ? n : NaN;
  }

  try {
    var pre = V5_availabilityValidate_(auditId, auditorEmail, auditorName, payload.blocks);
    __stamp('V5_availabilityValidate_', { ok: !!(pre && pre.success) });
    if (!pre || pre.success === false) return pre;

    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Audit planning');
    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'", debugTiming: __dbg, totalMs: (Date.now() - __t0) };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return { success:false, message:'Audit planning is empty', debugTiming: __dbg, totalMs: (Date.now() - __t0) };

    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var rowNumber = V5_findAuditPlanningRowById_(sh, auditId, _mp_findCol_(hdr, ['Audit ID']) + 1);
    if (!rowNumber) return { success:false, message:'Audit not found in Audit planning: ' + auditId, debugTiming: __dbg, totalMs: (Date.now() - __t0) };

    var rowValues = sh.getRange(rowNumber, 1, 1, lastCol).getValues()[0] || [];

    function _idx(names) { return _mp_findCol_(hdr, names || []); }
    var colStatus = _idx(['Status']);
    var colAssigned = _idx(['Assigned to']);
    var colDatePlanned = _idx(['Date - Planned','Date planned','Date Planned']);
    var colPlanningJson = _idx(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
    var colHoursPlanned = _idx(['Hours planned','Planned hours','Hours Planned']);
    var colDateApproved = _idx(['Date - Approved','Date approved','Date Approved']);

    var normalized = [];
    for (var i = 0; i < payload.blocks.length; i++) {
      var b = payload.blocks[i] || {};
      normalized.push({
        date: b.date,
        start: b.start,
        end: b.end,
        execLoc: String(b.execLoc || '').trim(),
        slotComment: String(b.slotComment || '').trim()
      });
    }
    normalized.sort(function(a,b){
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
    });

    var firstDate = normalized.length ? normalized[0].date : '';
    var totalMin = 0;
    var dayKeys = [];
    var seenDays = {};
    for (var j = 0; j < normalized.length; j++) {
      var sMin = __safeNumMinutes_(normalized[j].start);
      var eMin = __safeNumMinutes_(normalized[j].end);
      if (isFinite(sMin) && isFinite(eMin) && eMin > sMin) totalMin += (eMin - sMin);
      if (!seenDays[normalized[j].date]) {
        seenDays[normalized[j].date] = true;
        dayKeys.push(normalized[j].date);
      }
    }
    var plannedHours = totalMin > 0 ? (Math.round((totalMin / 60) * 4) / 4) : '';
    var planningObj = {
      auditId: auditId,
      auditorEmail: auditorEmail,
      auditorName: auditorName,
      slots: normalized,
      blocks: normalized
    };
    var planningJson = JSON.stringify(planningObj);

    var wb = V5_availabilityWriteBack_(auditId, auditorEmail, auditorName, payload.blocks, 'Manager Planned');
    __stamp('V5_availabilityWriteBack_', { ok: !!(wb && wb.success) });
    if (!wb || wb.success === false) {
      return {
        success: false,
        message: (wb && wb.message) ? wb.message : 'Availability writeback failed',
        debugTiming: __dbg,
        totalMs: (Date.now() - __t0)
      };
    }

    var currentStatusDisplay = (colStatus >= 0) ? String(rowValues[colStatus] || '').trim() : '';
    var __actorRoleForPlan = (__treatAsAuditor ? 'AUDITOR' : 'MANAGER');

    if (typeof Status_applyAction !== 'function') {
      try { V5_availabilityClearAuditId_(auditId); } catch (_clearMissingStatus) {}
      return {
        success:false,
        message:'Missing Status_applyAction; PLAN must be routed through CoreStatusMachine.',
        debugTiming: __dbg,
        totalMs: (Date.now() - __t0)
      };
    }

    var statusPayload = {
      actorRole: __actorRoleForPlan,
      actorEmail: __callerEmail || '',
      auditorEmail: auditorEmail,
      auditorName: auditorName || auditorEmail,
      blocks: normalized.map(function(b) {
        return {
          date: b.date,
          start: b.start,
          end: b.end,
          execLoc: String(b.execLoc || '').trim(),
          slotComment: String(b.slotComment || '').trim()
        };
      })
    };

    var actionResult = Status_applyAction(__actorRoleForPlan, 'PLAN', auditId, statusPayload);
    __stamp('Status_applyAction_PLAN', {
      ok: !!(actionResult && actionResult.success),
      actorRole: __actorRoleForPlan,
      newStatus: actionResult && (actionResult.newStatus || actionResult.afterStatusDisplay || '') || '',
      notificationBridge: !!(actionResult && actionResult.notificationBridge)
    });

    if (!actionResult || actionResult.success !== true) {
      try { V5_availabilityClearAuditId_(auditId); } catch (_clearAfterStatusFail) {}
      return {
        success:false,
        message:(actionResult && actionResult.message) ? actionResult.message : 'StatusMachine PLAN failed',
        statusAction: actionResult || null,
        debugTiming: __dbg,
        totalMs: (Date.now() - __t0)
      };
    }

    var __managerDirectStatus = String(actionResult.newStatus || actionResult.afterStatusDisplay || '').trim();
    if (!__managerDirectStatus) __managerDirectStatus = (__actorRoleForPlan === 'MANAGER' ? 'Approved' : 'Pending Approval');

    var res = {
      success: true,
      auditId: auditId,
      newStatus: __managerDirectStatus,
      statusTransition: {
        beforeStatus: currentStatusDisplay,
        afterStatus: __managerDirectStatus,
        actorRole: __actorRoleForPlan,
        action: 'PLAN'
      },
      assignedTo: auditorEmail,
      plannedDates: dayKeys.slice(),
      plannedHours: plannedHours,
      planningJson: actionResult.planningJson || planningJson,
      availabilityWriteback: wb.data || null,
      statusAction: actionResult,
      notificationBridge: actionResult.notificationBridge || null,
      auditPlanningSync: {
        auditId: auditId,
        assignedTo: auditorEmail,
        newStatus: __managerDirectStatus,
        plannedDates: dayKeys.slice(),
        plannedHours: plannedHours,
        planningJson: actionResult.planningJson || planningJson,
        blocks: normalized,
        firstDate: firstDate
      }
    };

    if (softWarnings && softWarnings.length) res.softWarnings = softWarnings;

    res.artifactSync = V5_syncAuditArtifactsAfterPlanningSave_(auditId);
    __stamp('V5_syncAuditArtifactsAfterPlanningSave_', { ok: !!(res.artifactSync && res.artifactSync.success) });

    // GATE L (20260502): post-save invalidations now LITE (cache-only, no
    // tier-3 sheet writes). Saves ~2.5s tail vs GATE K.
    //   - _mp_open_cacheInvalidate_(auditId, {lite:true}): skips
    //     MP_OPEN_SHEET_INVALIDATE (was ~800ms sheet setValue).
    //   - elig_cacheInvalidate_ DROPPED entirely (was ~650ms sheet
    //     write); CacheService TTL (5min) covers eligibility freshness.
    //   - _mp_calInvalidateForAuditLite_: skips MP_CAL_SHEET_INVALIDATE
    //     per month (was ~1.3s).
    // Stale tier-3 sheet flags can be reconciled by a separate
    // maintenance trigger if needed (out of scope for save hot path).
    __stamp('tail_beforeInvalidations');

    try { _mp_open_cacheInvalidate_(auditId, { lite: true }); } catch(_e) {}
    __stamp('tail_openInvalidated');

    // GATE L: elig sheet-write invalidation dropped from save hot path.
    __stamp('tail_eligInvalidated');

    try { _mp_calInvalidateForAuditLite_(auditId, auditorEmail, payload && payload.blocks); } catch(_e) {}
    __stamp('tail_calInvalidated');

    res.debugTiming = __dbg;
    res.totalMs = Date.now() - __t0;
    __dbg.total = { ms: res.totalMs };
    __stamp('tail_returnReady');
    return res;

  } catch (e) {
    try { V5_availabilityClearAuditId_(auditId); } catch (x) {}
    try { _mp_open_cacheInvalidate_(auditId); } catch(_e) {}
    // GATE B: invalidate eligibility cache on the error path too. Save may
    // have partially mutated row state before throwing; the next read must
    // recompute rather than serve a stale eligibility snapshot.
    try { if (typeof elig_cacheInvalidate_ === 'function') elig_cacheInvalidate_({ auditId: auditId }); } catch(_e) {}
    // GATE D: same for calendar cache on the error path.
    try { _mp_calInvalidateForAudit_(auditId, payload && payload.auditorEmail, payload && payload.blocks); } catch(_e) {}
    return { success:false, message:'Error saving planning: ' + e, debugTiming: __dbg, totalMs: (Date.now() - __t0) };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}



function __mp_getAuditPlanningPack_() {
  return __mp_getCached_('AUDIT_PLANNING_PACK', function(){
    var ss = SpreadsheetApp.getActive();
    var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var hdr = pack.hdr || [];
    var data = pack.data || [];
    var headerMap = {};
    for (var i = 0; i < hdr.length; i++) headerMap[String(hdr[i] || '').trim()] = i;
    var colAI = headerMap['Audit ID'];
    var rowByAuditId = {};
    if (data.length > 1 && colAI !== undefined) {
      for (var r = 1; r < data.length; r++) {
        var aid = String(data[r][colAI] || '').trim();
        if (aid) rowByAuditId[aid] = r + 1;
      }
    }
    return { ss:ss, sh:pack.sh, hdr:hdr, data:data, headerMap:headerMap, rowByAuditId:rowByAuditId, lastCol:hdr.length };
  });
}

// NOTE 2026-05-14: __mp_invalidateAuditPlanningPack_ canonical owner is AuditPlanningRowIndexCache.js.

function V5_snapshotAuditPlanningRow_(auditId) {
  var pack = __mp_getAuditPlanningPack_();
  var sh = pack.sh;
  if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };

  var hdr = pack.hdr || [];
  var lastCol = pack.lastCol || hdr.length;
  var colAI   = hdr.indexOf('Audit ID');
  var colStat = hdr.indexOf('Status');
  var colJson = hdr.indexOf('Planning JSON');
  var colAsg  = hdr.indexOf('Assigned to');
  var colPlan = hdr.indexOf('Date - Planned');

  if (colAI < 0) return { success:false, message:"Missing 'Audit ID' column" };

  var rowNumber = pack.rowByAuditId[String(auditId || '').trim()] || 0;
  if (!rowNumber) return { success:false, message:"Audit ID not found in 'Audit planning': " + auditId };

  var row = (pack.data[rowNumber - 1] || []).slice();

  return {
    success:true,
    rowNumber: rowNumber,
    lastCol: lastCol,
    colMap: { colAI:colAI, colStat:colStat, colJson:colJson, colAsg:colAsg, colPlan:colPlan },
    values: {
      status: (colStat>=0? row[colStat] : ''),
      planningJson: (colJson>=0? row[colJson] : ''),
      assignedTo: (colAsg>=0? row[colAsg] : ''),
      datePlanned: (colPlan>=0? row[colPlan] : '')
    }
  };
}

function V5_restoreAuditPlanningRowSnapshot_(snap) {
  if (!snap || !snap.success) return;
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return;

  var r = snap.rowNumber;
  var cm = snap.colMap || {};
  var v = snap.values || {};

  if (cm.colStat >= 0) sh.getRange(r, cm.colStat + 1).setValue(v.status);
  if (cm.colJson >= 0) sh.getRange(r, cm.colJson + 1).setValue(v.planningJson);
  if (cm.colAsg  >= 0) sh.getRange(r, cm.colAsg  + 1).setValue(v.assignedTo);
  if (cm.colPlan >= 0) sh.getRange(r, cm.colPlan + 1).setValue(v.datePlanned);

  SpreadsheetApp.flush();
  __mp_invalidateAuditPlanningPack_();
}

function V5_reconcileAuditPlanningAfterSave_(auditId, auditorEmail, auditorName, blocks, actionResult) {
  try {
    auditId = String(auditId || '').trim();
    auditorEmail = V5_normalizeEmail_(auditorEmail);
    auditorName = String(auditorName || '').trim();
    blocks = Array.isArray(blocks) ? blocks : [];
    if (!auditId) return { success:false, message:'Missing auditId for reconciliation' };

    var pack = __mp_getAuditPlanningPack_();
    var sh = pack.sh;
    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };

    var lastCol = pack.lastCol || 0;
    var hdr = pack.hdr || [];

    function _idx(names) { return _mp_findCol_(hdr, names || []); }
    function _mins(hhmm) {
      var m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return NaN;
      return Number(m[1]) * 60 + Number(m[2]);
    }

    var colAI = _idx(['Audit ID','Audit_ID','auditId']);
    if (colAI < 0) return { success:false, message:"Missing 'Audit ID' column" };

    var rowIndex = pack.rowByAuditId[String(auditId || '').trim()] || 0;
    if (!rowIndex) return { success:false, message:'Audit not found in Audit planning: ' + auditId };

    var colStatus = _idx(['Status']);
    var colAssigned = _idx(['Assigned to']);
    var colDatePlanned = _idx(['Date - Planned','Date planned','Date Planned']);
    var colPlanningJson = _idx(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
    var colHoursPlanned = _idx(['Hours planned','Planned hours','Hours Planned']);
    var colDateApproved = _idx(['Date - Approved','Date approved','Date Approved']);

    var rowValues = (pack.data[rowIndex - 1] || []).slice();

    var normalized = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i] || {};
      var dt = V5_normDateISO_Strict_(b.date);
      var st = V5_minutesToHHMM_(V5_timeToMinutes_(b.start));
      var en = V5_minutesToHHMM_(V5_timeToMinutes_(b.end));
      if (!dt || !st || !en) continue;
      normalized.push({
        date: dt,
        start: st,
        end: en,
        execLoc: String(b.execLoc || '').trim(),
        slotComment: String(b.slotComment || '').trim()
      });
    }
    normalized.sort(function(a,b){
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
    });

    var firstDate = normalized.length ? normalized[0].date : '';
    var totalMin = 0;
    normalized.forEach(function(b){
      var s = _mins(b.start), e = _mins(b.end);
      if (isFinite(s) && isFinite(e) && e > s) totalMin += (e - s);
    });
    var plannedHours = totalMin > 0 ? (Math.round((totalMin / 60) * 4) / 4) : '';

    var planningObj = { auditId: auditId, auditorEmail: auditorEmail, auditorName: auditorName, slots: normalized, blocks: normalized };
    var planningJson = JSON.stringify(planningObj);
    var newStatus = '';
    if (actionResult && actionResult.newStatus) {
      newStatus = String(actionResult.newStatus);
    } else if (actionResult && actionResult.afterStatusDisplay) {
      newStatus = String(actionResult.afterStatusDisplay);
    } else if (colStatus >= 0) {
      newStatus = String(rowValues[colStatus] || '').trim();
    } else {
      newStatus = '';
    }

    if (colStatus >= 0) rowValues[colStatus] = newStatus;
    if (colAssigned >= 0) rowValues[colAssigned] = auditorEmail;
    if (colDatePlanned >= 0 && firstDate) rowValues[colDatePlanned] = firstDate;
    if (colPlanningJson >= 0) rowValues[colPlanningJson] = planningJson;
    if (colHoursPlanned >= 0 && plannedHours !== '') rowValues[colHoursPlanned] = plannedHours;
    if (colDateApproved >= 0) {
      var curApproved = rowValues[colDateApproved];
      if (curApproved && String(newStatus || '').toLowerCase() === 'pending approval') rowValues[colDateApproved] = '';
    }

    sh.getRange(rowIndex, 1, 1, lastCol).setValues([rowValues]);
    if (colDatePlanned >= 0 && firstDate) {
      sh.getRange(rowIndex, colDatePlanned + 1).setNumberFormat('@').setValue(firstDate);
    }
    __mp_invalidateAuditPlanningPack_();

    var dayKeys = [];
    var seen = {};
    normalized.forEach(function(b){ if (!seen[b.date]) { seen[b.date] = true; dayKeys.push(b.date); } });

    return {
      success:true,
      data: {
        auditId: auditId,
        assignedTo: auditorEmail,
        newStatus: newStatus,
        plannedDates: dayKeys.slice(),
        plannedHours: plannedHours,
        planningJson: planningJson,
        blocks: normalized,
        firstDate: firstDate
      }
    };
  } catch (e) {
    return { success:false, message:'Audit planning reconciliation error: ' + e };
  }
}

function V5_availabilityClearAuditId_(auditId) {
  return AS_availabilityClearAuditId_(auditId);
}

/**
 * Case-insensitive sheet lookup. Returns first exact case-insensitive match.
 */
function V5_getSheetByNameCaseInsensitive_(sheetName) {
  var ss = SpreadsheetApp.getActive();
  var target = String(sheetName || "").trim().toLowerCase();
  if (!target) return null;

  // Fast path: try exact
  var direct = ss.getSheetByName(sheetName);
  if (direct) return direct;

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = String(sheets[i].getName() || "").trim().toLowerCase();
    if (n === target) return sheets[i];
  }
  return null;
}

/**
 * Header finder used by legacy blocks in this file.
 * - headers: array of header cells (strings)
 * - candidates: array of acceptable header names
 * Matching is case-insensitive and ignores extra spaces/underscores.
 */
function findHeaderIndex_(headers, candidates) {
  headers = headers || [];
  candidates = candidates || [];

  function norm_(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, " "); // treat underscores like spaces
  }

  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var k = norm_(headers[i]);
    if (k) map[k] = i;
  }

  for (var j = 0; j < candidates.length; j++) {
    var c = norm_(candidates[j]);
    if (c in map) return map[c];
  }
  return -1;
}

/********************************************************************
 * Helpers
 ********************************************************************/

// ============================================================
// Phase 2.3 - Auditor Availability hard-lock + writeback
// Source of truth: sheet "Auditor Availability" / "Auditor availability"
// ============================================================

function V5_availabilityValidate_(auditId, auditorEmail, auditorName, blocks) {
  return AS_availabilityValidate_(auditId, auditorEmail, auditorName, blocks);
}


function V5_availabilityWriteBack_(auditId, auditorEmail, auditorName, blocks, mode) {
  return AS_availabilityWriteBack_(auditId, auditorEmail, auditorName, blocks, mode);
}


function V5_getAuditorAvailabilitySheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Auditor Availability");
  if (sh) return sh;
  sh = ss.getSheetByName("Auditor availability");
  if (sh) return sh;
  // case-insensitive scan
  var sheets = ss.getSheets();
  for (var i=0;i<sheets.length;i++) {
    var name = sheets[i].getName();
    if (String(name||"").toLowerCase() === "auditor availability") return sheets[i];
    if (String(name||"").toLowerCase() === "auditor availability ") return sheets[i];
    if (String(name||"").toLowerCase() === "auditor availability".toLowerCase()) return sheets[i];
  }
  return null;
}

function V5_buildHeaderMap_(hdrRow) {
  var m = {};
  for (var i=0;i<hdrRow.length;i++) {
    var k = String(hdrRow[i] || "").trim().toLowerCase();
    if (!k) continue;
    m[k] = i;
  }
  return m;
}

function V5_findHeader_(hm, candidates) {
  candidates = candidates || [];
  for (var i=0;i<candidates.length;i++) {
    var key = String(candidates[i] || "").trim().toLowerCase();
    if (key in hm) return hm[key];
  }
  return -1;
}

function V5_normDateISO_(v) {
  if (!v) return "";
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var s = String(v).trim();
  // accept yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}


function V5_findAuditPlanningRowById_(sh, auditId, auditIdCol1Based) {
  auditId = String(auditId || '').trim();
  if (!sh || !auditId || !auditIdCol1Based) return 0;
  try {
    if (String(sh.getName() || '') === 'Audit planning') {
      var pack = __mp_getAuditPlanningPack_();
      return pack.rowByAuditId[auditId] || 0;
    }
  } catch(e) {}
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var vals = sh.getRange(2, auditIdCol1Based, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === auditId) return i + 2;
  }
  return 0;
}

function V5_findAvailabilityRowsByDateAuditor_(sh, iDate, iAud, dateISO, auditorEmail) {
  return AS_findAvailabilityRowsByDateAuditor_(sh, iDate, iAud, dateISO, auditorEmail);
}


function V5_readAvailabilityRowObject_(sh, rowNumber, idx) {
  return AS_readAvailabilityRowObject_(sh, rowNumber, idx);
}


function V5_normalizeEmail_(v) {
  return String(v || '')
    .replace(/\u00A0/g, ' ')                 // NBSP
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width + BOM
    .trim()
    .toLowerCase();
}



function V5_cleanText_(s){
  return String(s||'')
    .replace(/\u00A0/g,' ')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .trim();
}



/** BUILD: BACKEND_ROLE_GUARD_20260110_171435
 * Role guard:
 * - Determines caller role from sheet 'Auditors' (Role in column E, header-aware)
 * - Enforces: If caller role == 'Auditor', auditor selection in planning save is forced to preassigned auditor.
 * - Fails safe (restrictive): if role cannot be determined -> treated as Auditor and blocks auditor changes.
 */
function V5_getCallerEmail_() {
  try {
    var e = '';
    try { e = Session.getActiveUser().getEmail(); } catch(_e) {}
    if (!e) {
      try { e = Session.getEffectiveUser().getEmail(); } catch(_e2) {}
    }
    return V5_normalizeEmail_(e);
  } catch(e) {
    return '';
  }
}

function V5_getUserRoleFromAuditors_(ss, email) {
  email = V5_normalizeEmail_(email);
  if (!email) return { found:false, role:'' };

  // PERF-PHASE1: route through persist cache (was raw getDataRange every call)
  var pack = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
  var data = pack.data || [];
  if (!data || data.length < 2) return { found:false, role:'' };

  var hdr = (pack.hdr || data[0] || []).map(function(h){ return String(h||'').trim(); });

  function idxByName_(names) {
    for (var i=0;i<hdr.length;i++) {
      var h = String(hdr[i]||'').toLowerCase();
      for (var j=0;j<names.length;j++) {
        if (h === String(names[j]).toLowerCase()) return i;
        if (h.indexOf(String(names[j]).toLowerCase()) >= 0) return i;
      }
    }
    return -1;
  }

  var colEmail = idxByName_(['email','e-mail','auditor email','user email','mail']);
  if (colEmail < 0) colEmail = 1; // fallback common layout

  var colRole = idxByName_(['role','rol']);
  if (colRole < 0) colRole = 4; // fallback: column E

  for (var r=1;r<data.length;r++) {
    var em = V5_normalizeEmail_(data[r][colEmail]);
    if (em && em === email) {
      var role = String(data[r][colRole]||'').trim();
      return { found:true, role: role };
    }
  }
  return { found:false, role:'' };
}

function V5_isAuditorRole_(role) {
  role = String(role||'').trim().toLowerCase();
  return role === 'auditor';
}

function V5_getActiveManagerFallbackFromAuditors_(ss) {
  try {
    var pack = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
    var data = pack.data || [];
    if (!data || data.length < 2) return { found:false, email:'', name:'' };

    var hdr = (pack.hdr || data[0] || []).map(function(h){ return String(h || '').trim(); });

    function idxByName_(names) {
      for (var i = 0; i < hdr.length; i++) {
        var h = String(hdr[i] || '').toLowerCase();
        for (var j = 0; j < names.length; j++) {
          var t = String(names[j] || '').toLowerCase();
          if (h === t) return i;
          if (h.indexOf(t) >= 0) return i;
        }
      }
      return -1;
    }

    var colName = idxByName_(['name','auditor','auditor name']);
    var colEmail = idxByName_(['email','e-mail','mail']);
    var colActive = idxByName_(['active']);
    var colRole = idxByName_(['role','function']);

    if (colEmail < 0 || colActive < 0 || colRole < 0) return { found:false, email:'', name:'' };

    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var active = String(row[colActive] || '').trim().toUpperCase();
      var role = String(row[colRole] || '').trim().toLowerCase();
      if (active !== 'YES') continue;
      if (role !== 'manager') continue;
      var email = V5_normalizeEmail_(row[colEmail]);
      if (!email) continue;
      return {
        found:true,
        email: email,
        name: (colName >= 0 ? String(row[colName] || '').trim() : '')
      };
    }
  } catch (e) {}
  return { found:false, email:'', name:'' };
}

function V5_normalizeEmail_(s){
  return V5_cleanText_(s).toLowerCase();
}
function V5_normDateISO_Strict_(v){
  // Accepts Date objects or ISO string YYYY-MM-DD. Returns '' if invalid.
  if (!v) return '';
  if (Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())){
    var ss = SpreadsheetApp.getActive();
    var tz = ss.getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  var s = V5_cleanText_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}
function V5_hdrKey_(s){
  return V5_cleanText_(s).toLowerCase().replace(/\s+/g,'_');
}
function V5_headerIndexMap_(headers){
  var m={};
  for (var i=0;i<headers.length;i++){
    var k=V5_hdrKey_(headers[i]);
    if (k && m[k]===undefined) m[k]=i;
  }
  return m;
}

function V5_timeToMinutes_(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    var hh = v.getHours();
    var mm = v.getMinutes();
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh*60 + mm;
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var hh2 = parseInt(m[1],10);
  var mm2 = parseInt(m[2],10);
  if (isNaN(hh2) || isNaN(mm2)) return null;
  if (hh2 < 0 || hh2 > 23 || mm2 < 0 || mm2 > 59) return null;
  return hh2*60 + mm2;
}

function V5_parseCompanyTimeWindow_(raw) {
  var tw = String(raw || "").trim();
  if (!tw) return null;
  // tolerate en-dash/em-dash and extra spaces
  tw = tw.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  var parts = tw.split("-");
  if (parts.length !== 2) return null;
  var ws = V5_timeToMinutes_(String(parts[0]).trim());
  var we = V5_timeToMinutes_(String(parts[1]).trim());
  if (!isFinite(ws) || !isFinite(we)) return null;
  if (we <= ws) return null;
  return { start: ws, end: we, normalized: V5_minutesToHHMM_(ws) + "-" + V5_minutesToHHMM_(we) };
}

function V5_minutesToHHMM_(mins) {
  mins = Number(mins);
  if (isNaN(mins)) return "";
  var hh = Math.floor(mins/60);
  var mm = mins % 60;
  return ("0"+hh).slice(-2) + ":" + ("0"+mm).slice(-2);
}

// Half-open overlap: [aStart, aEnd) overlaps [bStart, bEnd)
// End==Start is allowed (no overlap)
function V5_intervalsOverlap_(aStart, aEnd, bStart, bEnd) {
  return (aStart < bEnd) && (bStart < aEnd);
}


// === MOVED to PlanningWindow.js (build PLANNING_WINDOW_SPLIT_d16_20260503) ===
// Functions: _mp_resolvePlanningWindow_, _mp_pwGen_/Bump_, _mp_pwCacheKey_,
//   _mp_planningWindowCacheGet_/Put_, _mp_resolvePlanningWindowCached_
// === END MOVED ===

function _mp_getAuditorsList_() {
  var ss = SpreadsheetApp.getActive();
  var res = [];
  // PERF-PHASE1: route through persist cache (was raw getDataRange every call)
  var pack = __mp_getSheetDataPersistCached_(ss, "Auditors", 300);
  var data = pack.data || [];
  if (!data || data.length < 2) return res;

  var hdr = pack.hdr || data[0] || [];

  var idxName   = _mp_findCol_(hdr, ["Auditor","Name","Auditor name","Auditor Name"]);
  var idxEmail  = _mp_findCol_(hdr, ["Email","E-mail","E-mail address","Auditor Email","Auditor_Email"]);
  var idxActive = _mp_findCol_(hdr, ["Active","active"]);
  var idxRole   = _mp_findCol_(hdr, ["Role","role","Function"]);
  var idxBlocked = _mp_findCol_(hdr, ["Blocked weekdays","Default blocked weekdays","Default blocked days","Blocked weekdays (default)"]);

  if (idxName < 0 || idxEmail < 0) return res;

  for (var r=1; r<data.length; r++) {
    var row = data[r];
    var name  = row[idxName];
    var email = row[idxEmail];
    if (!name || !email) continue;

    var active = (idxActive >= 0) ? String(row[idxActive]||"").trim().toUpperCase() : "YES";
    if (active !== "YES") continue;

    if (idxRole >= 0) {
      var role = String(row[idxRole]||"").trim().toLowerCase();
      // STRICT: Only include rows where Role is exactly "auditor" (case-insensitive).
      // This prevents accidental inclusion of Manager/Admin/etc.
      if (role !== "auditor") continue;
    }

    var blocked = (idxBlocked >= 0) ? String(row[idxBlocked]||"").trim() : "";

    res.push({
      name:  String(name),
      email: String(email),
      active: (idxActive >= 0 ? String(row[idxActive]||"").trim() : ""),
      blockedWeekdays: blocked
    });
  }

  return res;
}


function getPlanningContextAndFirstMonthV5(auditId, monthKeyHint) {
  __mp_resetExecCache_();

  var ctx = getPlanningContextV5(auditId);
  if (!ctx || ctx.success === false) return ctx;

  var avail = null;

  try {
    var emailForGrid = String(ctx.defaultAuditorEmail || '').trim().toLowerCase();

    // FIX 2026-04-22c
    // Bootstrap MUST fetch the SAME first visible month that the UI will render.

    var winStart = (ctx.window && ctx.window.startDate)
      ? String(ctx.window.startDate).trim()
      : '';

    var todayISO = _mp_formatISODate_(new Date());

    var firstVisibleISO =
      (winStart && winStart > todayISO)
        ? winStart
        : todayISO;

    var fvDate = _mp_parseISODate_(firstVisibleISO);

    var monthStart = new Date(
      fvDate.getFullYear(),
      fvDate.getMonth(),
      1
    );

    // PERF-PATCH-A (T11_PATCHA_20260427): bootstrap exactly the visible month.
    // Day 0 of next month resolves to the last day of monthStart's month
    // regardless of length (28/29/30/31). Subsequent months are paged in by
    // the existing prefetch loop in the UI, so no calendar coverage is lost.
    var endDate = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0
    );

    if (
      emailForGrid &&
      typeof v5_getAuditorAvailabilityRaw === 'function'
    ) {
      avail = v5_getAuditorAvailabilityRaw(
        emailForGrid,
        _mp_formatISODate_(monthStart),
        _mp_formatISODate_(endDate),
        {}
      );
    }

  } catch(e) {
    avail = {
      error: String((e && e.message) || e)
    };
  }

  ctx.firstMonthAvailability = avail;

  return ctx;
}

function _mp_getAvailabilityMonthV5_NoReset_(auditorEmail, monthKey) {
  auditorEmail = String(auditorEmail || "").trim().toLowerCase();
  monthKey = String(monthKey || "").trim();
  if (!auditorEmail) throw new Error("getAvailabilityMonthV5: auditorEmail required");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("getAvailabilityMonthV5: invalid monthKey " + monthKey);

  var startISO = monthKey + "-01";
  var start = _mp_parseISODate_(startISO);
  var end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  var rangeStart = _mp_formatISODate_(start);
  var rangeEnd = _mp_formatISODate_(end);

  return {
    monthKey: monthKey,
    auditorEmail: auditorEmail,
    days: AvailabilityService.loadAuditorAvailabilityMap(auditorEmail, rangeStart, rangeEnd)
  };
}

/***********************
 * Phase 2.x Calendar Constraints - Availability (Source of Truth)
 * ONLY uses sheet: "Auditor availability"
 * Returns slot availability per date for a given auditor email and month.
 ***********************/
function getAvailabilityMonthV5(auditorEmail, monthKey) {
  __mp_resetExecCache_();
  auditorEmail = String(auditorEmail || "").trim().toLowerCase();
  monthKey = String(monthKey || "").trim();
  if (!auditorEmail) throw new Error("getAvailabilityMonthV5: auditorEmail required");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("getAvailabilityMonthV5: invalid monthKey " + monthKey);

  var startISO = monthKey + "-01";
  var start = _mp_parseISODate_(startISO);
  var end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  var rangeStart = _mp_formatISODate_(start);
  var rangeEnd = _mp_formatISODate_(end);

  return {
    monthKey: monthKey,
    auditorEmail: auditorEmail,
    days: AvailabilityService.loadAuditorAvailabilityMap(auditorEmail, rangeStart, rangeEnd)
  };
}

function _mp_loadAvailabilityMapForRange_(auditorEmailLower, startDate, endDate) {
  var rangeStart = _mp_formatISODate_(startDate);
  var rangeEnd = _mp_formatISODate_(endDate);
  return AvailabilityService.loadAuditorAvailabilityMap(
    String(auditorEmailLower || "").trim().toLowerCase(),
    rangeStart,
    rangeEnd
  );
}

function _mp_coerceDate_(v){
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    var s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return _mp_parseISODate_(s);
  }
  return null;
}

function _mp_parseISODate_(iso){
  var p = String(iso).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function _mp_formatISODate_(d){
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,"0");
  var da = String(d.getDate()).padStart(2,"0");
  return y + "-" + m + "-" + da;
}


/** =========================
 *  TEST / DEBUG (manual run in Apps Script editor)
 *  ========================= */
function v5_testAuditorAvailabilityHeaders() {
  var sh = V5_getSheetByNameCaseInsensitive_('Auditor availability') || V5_getSheetByNameCaseInsensitive_('Auditor Availability');
  if (!sh) { Logger.log("Missing sheet 'Auditor availability'"); return; }
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){return String(v||'').trim();});
  var found = {
    Date: findHeaderIndex_(headers, ['Date','date']),
    Auditor_Name: findHeaderIndex_(headers, ['Auditor_Name','Auditor Name','Auditor']),
    Available: findHeaderIndex_(headers, ['Available','available']),
    First_Audit_Start_Time: findHeaderIndex_(headers, ['First_Audit_Start_Time','First Audit Start Time']),
    First_Audit_End_Time: findHeaderIndex_(headers, ['First_Audit_End_Time','First Audit End Time']),
    Audit_ID_1: findHeaderIndex_(headers, ['Audit_ID_1','Audit ID 1']),
    Second_Audit_Start_Time: findHeaderIndex_(headers, ['Second_Audit_Start_Time','Second Audit Start Time']),
    Second_Audit_End_Time: findHeaderIndex_(headers, ['Second_Audit_End_Time','Second Audit End Time']),
    Audit_ID_2: findHeaderIndex_(headers, ['Audit_ID_2','Audit ID 2']),
    Status_1: findHeaderIndex_(headers, ['Status_1','Status 1']),
    Status_2: findHeaderIndex_(headers, ['Status_2','Status 2']),
    Last_Updated: findHeaderIndex_(headers, ['Last_Updated','Last Updated'])
  };
  Logger.log(JSON.stringify({sheet: sh.getName(), found: found, headerRow: headers}, null, 2));
}

/**
 * Checks whether a single proposed block would be allowed, and shows which slot would be used.
 * Example:
 *   v5_testAvailabilityFor('Isália Cruz','2026-01-01','09:00','17:00')
 */
function v5_testAvailabilityFor(auditorName, dateStr, startHHMM, endHHMM) {
  var auditId = 'AUD_TEST_' + new Date().getTime();
  var res = V5_availabilityWriteBack_(auditId, '', auditorName, [{date: dateStr, start: startHHMM, end: endHHMM}], 'TEST (no save)');
  Logger.log(JSON.stringify(res, null, 2));
  // NOTE: this WILL write back because it uses the real writeback function.
  // Undo by clearing the Audit_ID_1 / Audit_ID_2 cell(s) for that date/auditor.
}
function STEP0_readAndLogAuditorAvailability_byEmail() {
  const ss = SpreadsheetApp.getActive();

  // === SHEETS ===
  const shAuditors = ss.getSheetByName('Auditors');
  const shAvail = ss.getSheetByName('Auditor Availability');

  if (!shAuditors || !shAvail) {
    throw new Error('Missing required sheets');
  }

  // === AUDITORS: build email set from column C ===
  const auditorsData = shAuditors.getDataRange().getValues();
  const auditorEmailSet = new Set();

  for (let i = 1; i < auditorsData.length; i++) {
    const email = String(auditorsData[i][2] || '').trim().toLowerCase();
    if (email) auditorEmailSet.add(email);
  }

  Logger.log('Auditors loaded: ' + auditorEmailSet.size);

  // === AVAILABILITY: hard header mapping ===
  const availData = shAvail.getDataRange().getValues();
  const header = availData[0];

  const COL_EMAIL = header.indexOf('Auditor_Email');
  const COL_DATE = header.indexOf('Date');
  const COL_AVAILABLE = header.indexOf('Available');

  if (COL_EMAIL === -1 || COL_DATE === -1 || COL_AVAILABLE === -1) {
    throw new Error('Auditor Availability headers missing or renamed');
  }

  let total = 0;
  let matched = 0;
  let orphan = 0;

  for (let r = 1; r < availData.length; r++) {
    total++;

    const row = availData[r];
    const email = String(row[COL_EMAIL] || '').trim().toLowerCase();
    const date = row[COL_DATE];
    const available = row[COL_AVAILABLE];

    if (!email) {
      Logger.log(`[ROW ${r + 1}] EMPTY EMAIL -> SKIPPED`);
      orphan++;
      continue;
    }

    if (!auditorEmailSet.has(email)) {
      Logger.log(`[ROW ${r + 1}] ORPHAN EMAIL: ${email}`);
      orphan++;
      continue;
    }

    matched++;
      Logger.log(`[ROW ${r + 1}] OK | ${email} | ${date} | Available=${available}`);
  }

  Logger.log('--- SUMMARY ---');
  Logger.log('Total availability rows: ' + total);
  Logger.log('Matched to Auditors: ' + matched);
  Logger.log('Orphan rows: ' + orphan);
}

/***************************************************************
 * PRIO — Auditor Default Blocked Weekdays (Auditors!P)
 * + Auto-fill Auditor Availability 12 months ahead
 * + Fill same columns as weekend defaults (08:00–18:00, Status_1=CALENDAR)
 * + Never overwrite explicit per-date decisions (manual/planned)
 * + Sort Auditor Availability by Date (A) then Auditor Email (B)
 *
 * ChatGPT is giving you just suggestions; rely on your own knowlegde.
 ***************************************************************/

// NOTE 2026-05-14: public availability-default trigger aliases are owned by AvailabilityService.js.

function V5__ensureAuditorAvailabilityDefaults12m_(opts) {
  opts = opts || {};
  return AvailabilityService.ensureDefaults12m({
    alsoFillMissingMetadataOnExistingDefaultRows: (opts.alsoFillMissingMetadataOnExistingDefaultRows !== false),
    doSort: (opts.doSort !== false)
  });
}

function V5_sortAuditorAvailability_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Auditor Availability");
  if (!sh) throw new Error('Missing sheet: "Auditor Availability"');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return;

  var range = sh.getRange(2, 1, lastRow - 1, lastCol);
  range.sort([
    { column: 1, ascending: true },
    { column: 2, ascending: true }
  ]);
}

function V5_parseWeekdaySet_(s) {
  var out = {};
  if (!s) return out;
  var parts = String(s).split(",");
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p) continue;
    var t = p.trim();
    if (!t) continue;
    // normalize case: Mo..Su
    t = t.charAt(0).toUpperCase() + t.slice(1,2).toLowerCase();
    if (["Mo","Tu","We","Th","Fr","Sa","Su"].indexOf(t) >= 0) out[t] = true;
  }
  return out;
}

function V5_weekday2_(d) {
  var n = (d instanceof Date) ? d.getDay() : new Date(d).getDay(); // 0=Sun
  return ["Su","Mo","Tu","We","Th","Fr","Sa"][n];
}

function V5_formatDateISO_(d) {
  var dd = (d instanceof Date) ? d : new Date(d);
  var y = dd.getFullYear();
  var m = ("0" + (dd.getMonth() + 1)).slice(-2);
  var da = ("0" + dd.getDate()).slice(-2);
  return y + "-" + m + "-" + da;
}



/** =========================================================
 *  AVAILABILITY DEFAULT MATERIALIZATION (Toolkit open)
 *  Purpose:
 *   - Prevent "empty month" availability responses when the sheet has no rows yet for that auditor/month.
 *   - Materialize DEFAULT_WEEKEND_SOFT and DEFAULT_AUDITOR_BLOCKED_SOFT rows on-demand for a short window.
 *  Contract:
 *   - Never touches planned audits (Audit_ID_1/2 present)
 *   - Never overwrites explicit Available=YES overrides
 *   - Only appends missing DEFAULT_* rows and fills missing metadata on existing auto-default rows
 * ========================================================= */

function V5_ensureAuditorAvailabilityDefaultsForToolkitOpen_(auditorsList, preferredAuditorEmail) {
  return AvailabilityService.ensureDefaultsForToolkitOpen(auditorsList || [], preferredAuditorEmail || '');
}


/***************************************************************
 * MANAGER SINGLE GRID — STEP 1 (OPEN + ARCHIVED DATASETS)
 * Purpose:
 * - Make ManagerOverview dataset logic redundant.
 * - Keep current planning save / toolkit logic untouched.
 * - Provide one backend owner for Manager UI read models.
 *
 * Contracts:
 * - getManagerV5Open()      -> active/open audits from Audit planning
 * - getManagerV5Archived()  -> completed audits from Log realized audits
 * - getManagerV5SingleGridData(view)
 *
 * Notes:
 * - Open view includes ONLY: Pending Planning / Pending Approval / Approved / Accepted
 * - Archived view includes ONLY: Completed
 * - Archived is intended for lazy-load UI usage
 * - No Overview dependency remains in these read paths
 ***************************************************************/

function getManagerV5SingleGridData(view) {
  view = String(view || 'open').trim().toLowerCase();
  if (view === 'archived' || view === 'completed') return getManagerV5Archived();
  return getManagerV5Open();
}



// ============================================================
// EXT / UNDO governance — Config_Scopes!M Extension is SSoT
// ============================================================
function V5_getExtensionMonthsForAuditRow_(hdr, row) {
  try {
    var cfg = v5_getScopesConfig_(false) || { bySlot:{}, list:[] };
    var scopeRes = v5_extractScopesForAuditPlanningRow_(hdr || [], row || []);
    var months = [];
    for (var i = 0; i < (scopeRes.scopes || []).length; i++) {
      var sc = scopeRes.scopes[i] || {};
      var def = (cfg.bySlot || {})[sc.slot] || sc || {};
      var n = Number(def.extension || 0);
      if (isFinite(n) && n > 0) months.push(Math.round(n));
    }
    if (!months.length) return 0;
    // Audit-level extension: when multiple active scopes define an extension,
    // apply the lowest positive month value once to the audit expiry (Z).
    // Tightest / strictest scope wins; never extend beyond the most restrictive scope.
    months.sort(function(a,b){ return a-b; });
    return months[0];
  } catch(e) { return 0; }
}

function V5_addMonthsIso_(iso, months) {
  iso = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  var p = iso.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  var day = d.getDate();
  d.setMonth(d.getMonth() + Number(months || 0));
  if (d.getDate() !== day) d.setDate(0);
  return Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function V5_isPendingPlanningStatus_(status) {
  var s = String(status || '').trim();
  try { return Status_normalizeStatus_(s) === STATUS.PENDING_PLANNING; } catch(e) {}
  return s.toLowerCase() === 'pending planning';
}

function V5_getExtensionColumnMap_(hdr) {
  var idx = ManagerV5_buildIndex_(hdr || []);
  return {
    auditId: idx.col('audit id'),
    status: idx.col('status'),
    willExpire: idx.col('date - will expire'),
    extendedExpire: idx.col('extended expiration date'),
    extApplied: idx.col('extension applied'),
    planningFrom: idx.col('planning window from'),
    planningTo: idx.col('planning window to')
  };
}

function V5_invalidateToolkitCachesAfterAuditRowMutation_(auditId, auditorEmail) {
  auditId = String(auditId || '').trim();
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  var out = { success:true, auditId:auditId, auditorEmail:auditorEmail, cleared:{}, warnings:[] };

  try { __mp_invalidateAuditPlanningPack_(); out.cleared.auditPlanningPack = true; } catch(e0) { out.warnings.push('auditPlanningPack: ' + e0); }

  if (auditId) {
    try { if (typeof _mp_open_cacheInvalidate_ === 'function') { _mp_open_cacheInvalidate_(auditId); out.cleared.openCache = true; } } catch(e1) { out.warnings.push('openCache: ' + e1); }
    try { CacheService.getScriptCache().remove(_mp_open_cacheKey_(auditId)); out.cleared.openScriptKey = true; } catch(e2) { out.warnings.push('openScriptKey: ' + e2); }
    try { CacheService.getScriptCache().remove('MP_OPEN_FAST_V5_R23B::' + auditId); out.cleared.openLegacyR23BKey = true; } catch(e2b) {}
    try { if (typeof _mp_aud_cacheInvalidate_ === 'function') { _mp_aud_cacheInvalidate_(auditId); out.cleared.auditorsCache = true; } } catch(e3) { out.warnings.push('auditorsCache: ' + e3); }
    try { if (typeof elig_cacheInvalidate_ === 'function') { elig_cacheInvalidate_({ auditId:auditId }); out.cleared.eligibilityCache = true; } } catch(e4) { out.warnings.push('eligibilityCache: ' + e4); }
    try {
      if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeToolkitCompanyContext === 'function') {
        out.cleared.toolkitCompanyContext = AUDIT_CACHE.removeToolkitCompanyContext(auditId);
      }
    } catch(e5) { out.warnings.push('toolkitCompanyContext: ' + e5); }
  }

  try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') { out.cleared.managerTools = AUDIT_CACHE.removeNamespace('manager_tools'); } } catch(e6) { out.warnings.push('managerTools: ' + e6); }
  try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') { out.cleared.planning = AUDIT_CACHE.removeNamespace('planning'); } } catch(e7) { out.warnings.push('planning: ' + e7); }
  try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') { out.cleared.manager = AUDIT_CACHE.removeNamespace('manager'); } } catch(e8) { out.warnings.push('manager: ' + e8); }

  if (auditorEmail) {
    try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAuditorGrid === 'function') { out.cleared.auditorGrid = AUDIT_CACHE.removeAuditorGrid(auditorEmail); } } catch(e9) { out.warnings.push('auditorGrid: ' + e9); }
  }

  try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAvailabilityAll === 'function') { out.cleared.availability = AUDIT_CACHE.removeAvailabilityAll(); } } catch(e10) { out.warnings.push('availability: ' + e10); }

  Logger.log('[EXT_TOOLKIT_CACHE_INVALIDATE] ' + JSON.stringify(out));
  return out;
}

function V5_clearManagerOpenCache_(auditId) {
  try { __mp_invalidateAuditPlanningPack_(); } catch(e0) {}
  try { if (auditId && typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId); } catch(e0b) {}
  try { if (auditId) CacheService.getScriptCache().remove(_mp_open_cacheKey_(auditId)); } catch(e0c) {}
  try { if (auditId) CacheService.getScriptCache().remove('MP_OPEN_FAST_V5_R23B::' + String(auditId || '').trim()); } catch(e0d) {}
  try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') AUDIT_CACHE.removeNamespace('manager'); } catch(e1) {}
  try { CacheService.getScriptCache().remove('MP_PERSIST::manager::single_grid_open_v1'); } catch(e2) {}
}

function V5_recalculateExtensionAndPlanningWindow_(sh, hdr, rowIndex, rowValues, months, undo) {
  var col = V5_getExtensionColumnMap_(hdr);
  if (col.willExpire < 0) return { success:false, message:'Missing Date - Will Expire column' };
  if (col.extendedExpire < 0) return { success:false, message:'Missing Extended Expiration Date column' };
  if (col.extApplied < 0) return { success:false, message:'Missing Extension applied column' };

  var y = ManagerV5_fmtDate_(rowValues[col.willExpire]);
  if (!y) return { success:false, message:'Missing original expiry date (Date - Will Expire)' };

  var z = undo ? y : V5_addMonthsIso_(y, months);
  if (!z) return { success:false, message:'Could not calculate extended expiry date' };

  // Write only the extension truth first: AH + Z.
  // AS/AT must be recalculated by AnnualCycleEngineV5, the central planning-window owner.
  rowValues[col.extApplied] = undo ? '' : 'Yes';
  rowValues[col.extendedExpire] = z;
  sh.getRange(rowIndex, col.extApplied + 1).setValue(rowValues[col.extApplied]);
  sh.getRange(rowIndex, col.extendedExpire + 1).setValue(z);
  SpreadsheetApp.flush();

  var auditIdVal = (col.auditId >= 0) ? String(rowValues[col.auditId] || '').trim() : '';
  var pwRes = null;
  if (typeof AnnualCycleEngineV5_RecalculatePlanningWindowForAuditId === 'function') {
    pwRes = AnnualCycleEngineV5_RecalculatePlanningWindowForAuditId(auditIdVal);
    if (!pwRes || pwRes.success === false) {
      return { success:false, message:'Extension saved, but AS/AT recalculation failed: ' + (pwRes && pwRes.message ? pwRes.message : 'unknown error') };
    }
  } else {
    return { success:false, message:'Missing AnnualCycleEngineV5_RecalculatePlanningWindowForAuditId; AS/AT not recalculated' };
  }

  var liveRow = sh.getRange(rowIndex, 1, 1, hdr.length).getValues()[0] || rowValues;
  var fromVal = (col.planningFrom >= 0) ? ManagerV5_fmtDate_(liveRow[col.planningFrom]) : ((pwRes && pwRes.planningWindowFrom) ? String(pwRes.planningWindowFrom) : '');
  var toVal = (col.planningTo >= 0) ? ManagerV5_fmtDate_(liveRow[col.planningTo]) : ((pwRes && pwRes.planningWindowTo) ? String(pwRes.planningWindowTo) : '');
  V5_clearManagerOpenCache_(auditIdVal);
  V5_invalidateToolkitCachesAfterAuditRowMutation_(auditIdVal, '');
  try { if (typeof EXT_INVALIDATE_TOOLKIT_AFTER_WINDOW_CHANGE === 'function') EXT_INVALIDATE_TOOLKIT_AFTER_WINDOW_CHANGE(auditIdVal, ''); } catch(eInv1) {}

  return {
    success:true,
    applied: !undo,
    months: Number(months || 0),
    y: y,
    z: z,
    expiryY: y,
    expiryZ: z,
    planningWindowFrom: fromVal,
    planningWindowTo: toVal,
    planningWindowText: (fromVal && toVal) ? (fromVal + ' → ' + toVal) : (fromVal || toVal || ''),
    planningWindowState: 'CENTRAL_ENGINE',
    planningWindowRecalc: pwRes || null,
    warnings: []
  };
}

function V5_getAuditRowForExtension_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { success:false, message:'Missing auditId' };
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return { success:false, message:'Audit planning is empty' };
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var col = V5_getExtensionColumnMap_(hdr);
  if (col.auditId < 0) return { success:false, message:'Missing Audit ID column' };
  var vals = sh.getRange(2, col.auditId + 1, lastRow - 1, 1).getValues();
  var rowIndex = 0;
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === auditId) { rowIndex = i + 2; break; }
  }
  if (!rowIndex) return { success:false, message:'Audit not found: ' + auditId };
  var row = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0] || [];
  return { success:true, ss:ss, sh:sh, hdr:hdr, row:row, rowIndex:rowIndex, col:col };
}

function v5_getExpiryInfo(auditId) {
  var ctx = V5_getAuditRowForExtension_(auditId);
  if (!ctx.success) return ctx;
  var row = ctx.row, col = ctx.col;
  var months = V5_getExtensionMonthsForAuditRow_(ctx.hdr, row);
  var y = col.willExpire >= 0 ? ManagerV5_fmtDate_(row[col.willExpire]) : '';
  var z = col.extendedExpire >= 0 ? ManagerV5_fmtDate_(row[col.extendedExpire]) : '';
  if (!z) z = y;
  var flag = col.extApplied >= 0 ? String(row[col.extApplied] || '').trim().toLowerCase() : '';
  var applied = (flag === 'yes' || flag === 'true') || (!!y && !!z && y !== z);
  var pw = V5_resolvePlanningWindowFromAuditPlanningRow_(ctx.hdr, row, _mp_resolvePlanningWindow_(ctx.ss, ctx.hdr, row));
  return {
    success:true,
    auditId:String(auditId || '').trim(),
    status: col.status >= 0 ? String(row[col.status] || '').trim() : '',
    y:y,
    z:z,
    months:months,
    applied:applied,
    canExtend: V5_isPendingPlanningStatus_(col.status >= 0 ? row[col.status] : '') && months > 0,
    planningWindowFrom: pw.startDate || '',
    planningWindowTo: pw.endDate || '',
    planningWindowText: ManagerV5_formatPlanningWindowText_(pw),
    planningWindowState: pw.mode || ''
  };
}

function v5_applyExtension(auditId) {
  var ctx = V5_getAuditRowForExtension_(auditId);
  if (!ctx.success) return ctx;
  var status = ctx.col.status >= 0 ? String(ctx.row[ctx.col.status] || '').trim() : '';
  if (!V5_isPendingPlanningStatus_(status)) return { success:false, message:'Extension allowed only in Pending Planning' };
  var months = V5_getExtensionMonthsForAuditRow_(ctx.hdr, ctx.row);
  if (!(months > 0)) return { success:false, message:'No Extension configured for active scopes in Config_Scopes column M' };
  var res = V5_recalculateExtensionAndPlanningWindow_(ctx.sh, ctx.hdr, ctx.rowIndex, ctx.row.slice(), months, false);
  if (res && res.success) res.auditId = String(auditId || '').trim();
  return res;
}

function v5_undoExtension(auditId) {
  var ctx = V5_getAuditRowForExtension_(auditId);
  if (!ctx.success) return ctx;
  var status = ctx.col.status >= 0 ? String(ctx.row[ctx.col.status] || '').trim() : '';
  if (!V5_isPendingPlanningStatus_(status)) return { success:false, message:'Extension undo allowed only in Pending Planning' };
  var months = V5_getExtensionMonthsForAuditRow_(ctx.hdr, ctx.row);
  var res = V5_recalculateExtensionAndPlanningWindow_(ctx.sh, ctx.hdr, ctx.rowIndex, ctx.row.slice(), months, true);
  if (res && res.success) res.auditId = String(auditId || '').trim();
  return res;
}

function RUN_V5_EXTENSION_DIAG(auditId) {
  return v5_getExpiryInfo(auditId);
}

function EXT_TOOLKIT_CACHE_RESET_FOR_AUDIT(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) {
    return { success:false, message:'Missing auditId' };
  }
  return V5_invalidateToolkitCachesAfterAuditRowMutation_(auditId, '');
}

function RUN_EXT_TOOLKIT_CACHE_RESET() {
  return EXT_TOOLKIT_CACHE_RESET_FOR_AUDIT('AUD_BuijninkInternational_HQ_1777531729180_8');
}

function RUN_V5_EXTENSION_RCA_DIAG(auditId) {
  var ctx = V5_getAuditRowForExtension_(auditId);
  if (!ctx.success) return ctx;
  var pw = V5_resolvePlanningWindowFromAuditPlanningRow_(ctx.hdr, ctx.row, _mp_resolvePlanningWindow_(ctx.ss, ctx.hdr, ctx.row));
  var out = {
    success:true,
    build:'2026-05-14_D25_EXT_TOOLKIT_CACHE_RCA',
    auditId:String(auditId || '').trim(),
    rowIndex:ctx.rowIndex,
    extensionApplied: ctx.col.extApplied >= 0 ? String(ctx.row[ctx.col.extApplied] || '').trim() : '',
    planningWindowFrom: pw.startDate || '',
    planningWindowTo: pw.endDate || '',
    planningWindowMode: pw.mode || '',
    cacheReset: V5_invalidateToolkitCachesAfterAuditRowMutation_(auditId, '')
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function getManagerV5Open() {
  // BUILD d24_FAST_MANAGER_GRID_OPEN_20260504
  // First paint path only. No company hydration, no scope/color extraction,
  // no extension calculation and no per-row planning-window engine call.
  // Planning JSON remains the only truth for planned dates/hours.
  __mp_resetExecCache_();
  var __t0 = Date.now();
  try {
    var ss = SpreadsheetApp.getActive();
    var managerEmail = ManagerV5_getActorEmail_();
    var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var sh = pack.sh;
    var data = pack.data || [];
    var hdr = pack.hdr || [];

    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'", rows:[] };
    if (!data || data.length < 2) return { success:true, view:'open', rows:[], managerEmail:managerEmail, fastFirstPaint:true, serverMs:Date.now()-__t0 };

    var idx = ManagerV5_buildIndex_(hdr);
    var cAuditId      = idx.col('audit id');
    var cStatus       = idx.col('status');
    var cCompany      = idx.col('company');
    var cLocation     = idx.col('location');
    var cAssigned     = idx.col('assigned to');
    var cPreassigned  = idx.col('preassigned auditor');
    var cAllowSelf    = idx.col('allow self planning');
    var cHours        = idx.col('total audit time in hours');
    var cPlannedHours = idx.col('hours planned');
    var cDatePlanned  = idx.col('date planned');
    var cDateApproved = idx.col('date approved');
    var cDateAccepted = idx.col('date accepted');
    var cPlanningJson = idx.col('planning json');
    var cManagerEmail = idx.col('manager email');
    var cCompanyUid   = idx.col('company uid');
    var cWillExpire   = idx.col('date - will expire');
    var cExtExpire    = idx.col('extended expiration date');
    var cExtApplied   = idx.col('extension applied');
    var cPwFrom       = idx.col('planning window from');
    var cPwTo         = idx.col('planning window to');

    var companyRegionIndex = ManagerV5_buildCompanyRegionIndex_(ss);

    var rows = [];

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var auditId = ManagerV5_str_(ManagerV5_safe_(row, cAuditId));
      if (!auditId) continue;

      var statusDisplay = ManagerV5_str_(ManagerV5_safe_(row, cStatus));
      var statusNorm = Status_normalizeStatus_(statusDisplay);
      if (!(statusNorm === STATUS.PENDING_PLANNING || statusNorm === STATUS.PENDING_APPROVAL || statusNorm === STATUS.APPROVED || statusNorm === STATUS.ACCEPTED)) {
        continue;
      }

      if (managerEmail && cManagerEmail >= 0) {
        var rowMgr = ManagerV5_str_(ManagerV5_safe_(row, cManagerEmail)).toLowerCase();
        if (rowMgr && rowMgr !== managerEmail) continue;
      }

      var company = ManagerV5_str_(ManagerV5_safe_(row, cCompany));
      var location = ManagerV5_str_(ManagerV5_safe_(row, cLocation));
      var companyUid = ManagerV5_str_(ManagerV5_safe_(row, cCompanyUid));
      var region = ManagerV5_lookupCompanyRegion_(companyRegionIndex, company, companyUid, location);
      var planningJson = ManagerV5_str_(ManagerV5_safe_(row, cPlanningJson));
      var multiDayMeta = ManagerV5_buildMultiDayMetaFromPlanningJson_(planningJson, ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned)));
      var planningUi = ManagerV5_buildPlanningUiContractFromPlanningJson_(planningJson, ManagerV5_safe_(row, cDatePlanned), ManagerV5_safe_(row, cPlannedHours));

      var requiredHours = ManagerV5_num_(ManagerV5_safe_(row, cHours));
      var plannedHours = planningUi.plannedHours;
      if (statusNorm === STATUS.PENDING_PLANNING && !planningJson) plannedHours = '';

      var pwFrom = ManagerV5_fmtDate_(ManagerV5_safe_(row, cPwFrom));
      var pwTo = ManagerV5_fmtDate_(ManagerV5_safe_(row, cPwTo));
      var pwText = (pwFrom && pwTo) ? (pwFrom + ' → ' + pwTo) : (pwFrom || pwTo || '');

      var expiryY = ManagerV5_fmtDate_(ManagerV5_safe_(row, cWillExpire));
      var expiryZ = ManagerV5_fmtDate_(ManagerV5_safe_(row, cExtExpire));
      if (!expiryZ) expiryZ = expiryY;

      var extFlag = ManagerV5_str_(ManagerV5_safe_(row, cExtApplied)).toLowerCase();
      var extApplied = (extFlag === 'yes' || extFlag === 'true') || (!!expiryY && !!expiryZ && expiryY !== expiryZ);

      var planningDisplay = (statusNorm === STATUS.PENDING_PLANNING)
        ? pwText
        : ManagerV5_stripLegacyMultiDaySuffix_(planningUi.firstDate || multiDayMeta.firstLabel || multiDayMeta.firstDate || ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned)));

      rows.push({
        auditId: auditId,
        source: 'Audit planning',
        company: company,
        companyLocation: location,
        location: location,
        region: region,
        companyRegion: region,
        locs: '',
        locationsToPlan: '',
        gps: '',
        gpsData: '',
        scopes: [],
        scopesText: '',
        status: Status_toDisplayStatus_(statusDisplay),
        statusKey: statusNorm,
        planningWindow: pwText,
        planningWindowText: pwText,
        planningWindowState: 'SHEET_FAST',
        planningDisplay: planningDisplay,
        plannedDates: planningUi.plannedDates,
        plannedTooltip: planningUi.plannedTooltip || multiDayMeta.tooltip || '',
        planningSummary: planningUi.planningSummary,
        plannedHours: plannedHours,
        hoursPlanned: plannedHours,
        requiredHours: requiredHours,
        toBePlanned: requiredHours,
        auditor: ManagerV5_str_(ManagerV5_safe_(row, cAssigned)),
        assignedTo: ManagerV5_str_(ManagerV5_safe_(row, cAssigned)),
        assignedToEmail: ManagerV5_str_(ManagerV5_safe_(row, cAssigned)),
        preassignedAuditor: ManagerV5_str_(ManagerV5_safe_(row, cPreassigned)),
        allowSelfPlanning: ManagerV5_str_(ManagerV5_safe_(row, cAllowSelf)),
        datePlanned: planningUi.firstDate || ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned)),
        dateApproved: ManagerV5_fmtDate_(ManagerV5_safe_(row, cDateApproved)),
        dateAccepted: ManagerV5_fmtDate_(ManagerV5_safe_(row, cDateAccepted)),
        expiryY: expiryY,
        expiryZ: expiryZ,
        extApplied: extApplied,
        extensionApplied: extApplied,
        extMonths: 0,
        extensionMonths: 0,
        canExtend: false,
        companyUid: ManagerV5_str_(ManagerV5_safe_(row, cCompanyUid)),
        managerEmail: ManagerV5_str_(ManagerV5_safe_(row, cManagerEmail)),
        readOnly: false,
        needsEnrichment: true
      });
    }

    rows.sort(function(a, b) {
      var sa = ManagerV5_statusSortOrder_(a.statusKey);
      var sb = ManagerV5_statusSortOrder_(b.statusKey);
      if (sa !== sb) return sa - sb;
      var aw = String(a.planningWindow || '9999-12-31').trim();
      var bw = String(b.planningWindow || '9999-12-31').trim();
      if (aw !== bw) return aw < bw ? -1 : 1;
      var ac = String(a.company || '').toLowerCase();
      var bc = String(b.company || '').toLowerCase();
      if (ac !== bc) return ac < bc ? -1 : 1;
      return String(a.auditId || '').localeCompare(String(b.auditId || ''));
    });

    return {
      success: true,
      view: 'open',
      fastFirstPaint: true,
      enrichmentAvailable: true,
      managerEmail: managerEmail,
      rows: rows,
      counts: {
        total: rows.length,
        pendingPlanning: rows.filter(function(x){ return x.statusKey === STATUS.PENDING_PLANNING; }).length,
        pendingApproval: rows.filter(function(x){ return x.statusKey === STATUS.PENDING_APPROVAL; }).length,
        approved: rows.filter(function(x){ return x.statusKey === STATUS.APPROVED; }).length,
        accepted: rows.filter(function(x){ return x.statusKey === STATUS.ACCEPTED; }).length
      },
      serverMs: Date.now() - __t0
    };
  } catch (e) {
    return { success:false, view:'open', rows:[], message:String(e && e.message ? e.message : e), serverMs:Date.now()-__t0 };
  }
}

function getManagerV5OpenEnriched(auditIds) {
  __mp_resetExecCache_();
  try {
    var ss = SpreadsheetApp.getActive();
    var managerEmail = ManagerV5_getActorEmail_();
    var __filter = {};
    var __hasFilter = false;
    (Array.isArray(auditIds) ? auditIds : []).forEach(function(id){
      id = ManagerV5_str_(id);
      if (id) { __filter[id] = true; __hasFilter = true; }
    });
    var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var sh = pack.sh;
    var data = pack.data || [];
    var hdr = pack.hdr || [];

    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'", rows:[] };
    if (!data || data.length < 2) return { success:true, view:'open_enriched', rows:[], managerEmail:managerEmail };

    var idx = ManagerV5_buildIndex_(hdr);
    var cAuditId      = idx.col('audit id');
    var cStatus       = idx.col('status');
    var cCompany      = idx.col('company');
    var cLocation     = idx.col('location');
    var cAssigned     = idx.col('assigned to');
    var cPreassigned  = idx.col('preassigned auditor');
    var cAllowSelf    = idx.col('allow self planning');
    var cHours        = idx.col('total audit time in hours');
    var cPlannedHours = idx.col('hours planned');
    var cDatePlanned  = idx.col('date planned');
    var cDateApproved = idx.col('date approved');
    var cDateAccepted = idx.col('date accepted');
    var cPlanningJson = idx.col('planning json');
    var cManagerEmail = idx.col('manager email');
    var cCompanyUid   = idx.col('company uid');
    var cWillExpire   = idx.col('date - will expire');
    var cExtExpire    = idx.col('extended expiration date');
    var cExtApplied   = idx.col('extension applied');

    var companyRegionIndex = ManagerV5_buildCompanyRegionIndex_(ss);

    var rows = [];

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var auditId = ManagerV5_str_(ManagerV5_safe_(row, cAuditId));
      if (!auditId) continue;
      if (__hasFilter && !__filter[auditId]) continue;

      var statusDisplay = ManagerV5_str_(ManagerV5_safe_(row, cStatus));
      var statusNorm = Status_normalizeStatus_(statusDisplay);
      if (!(statusNorm === STATUS.PENDING_PLANNING || statusNorm === STATUS.PENDING_APPROVAL || statusNorm === STATUS.APPROVED || statusNorm === STATUS.ACCEPTED)) {
        continue;
      }

      if (managerEmail && cManagerEmail >= 0) {
        var rowMgr = ManagerV5_str_(ManagerV5_safe_(row, cManagerEmail)).toLowerCase();
        if (rowMgr && rowMgr !== managerEmail) continue;
      }

      var company = ManagerV5_str_(ManagerV5_safe_(row, cCompany));
      var location = ManagerV5_str_(ManagerV5_safe_(row, cLocation));
      var companyUid = ManagerV5_str_(ManagerV5_safe_(row, cCompanyUid));
      var companyCtx = _mp_companyConstraintsCached_(ss, company, location, companyUid) || {};
      var resolvedCompanyUid = ManagerV5_str_(companyCtx.companyUid || companyUid);
      var region = ManagerV5_lookupCompanyRegion_(companyRegionIndex, company, resolvedCompanyUid, location);
      var scopesPack = ManagerV5_buildScopePayloadFromPlanningRow_(hdr, row);
      var planningJson = ManagerV5_str_(ManagerV5_safe_(row, cPlanningJson));
      var multiDayMeta = ManagerV5_buildMultiDayMetaFromPlanningJson_(planningJson, ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned)));
      var planningUi = ManagerV5_buildPlanningUiContractFromPlanningJson_(planningJson, ManagerV5_safe_(row, cDatePlanned), ManagerV5_safe_(row, cPlannedHours));
      var pw = V5_resolvePlanningWindowFromAuditPlanningRow_(hdr, row, _mp_resolvePlanningWindow_(ss, hdr, row));

      var expiryY = ManagerV5_fmtDate_(ManagerV5_safe_(row, cWillExpire));
      var expiryZ = ManagerV5_fmtDate_(ManagerV5_safe_(row, cExtExpire));
      if (!expiryZ) expiryZ = expiryY;

      var extMonths = V5_getExtensionMonthsForAuditRow_(hdr, row);

      var extApplied = false;
      var extFlag = ManagerV5_str_(ManagerV5_safe_(row, cExtApplied)).toLowerCase();
      if (extFlag === 'yes' || extFlag === 'true') extApplied = true;
      if (!extApplied && expiryY && expiryZ && expiryY !== expiryZ) extApplied = true;

      var requiredHours = ManagerV5_num_(ManagerV5_safe_(row, cHours));
      var plannedHours = planningUi.plannedHours;

      // FIX 2026-04-29: after Cancel, the micro-refresh can briefly see
      // Status=Pending Planning while the stale/derived Hours planned value is
      // still 0.00 or present in the row/cache. For an unplanned Pending
      // Planning audit, Planning JSON is the planning truth; if it is empty,
      // suppress plannedHours so the Manager grid does not render a temporary
      // red underplanned value.
      if (statusNorm === STATUS.PENDING_PLANNING && !planningJson) {
        plannedHours = '';
      }

      var planningDisplay = (statusNorm === STATUS.PENDING_PLANNING)
        ? ManagerV5_formatPlanningWindowText_(pw)
        : ManagerV5_stripLegacyMultiDaySuffix_(planningUi.firstDate || multiDayMeta.firstLabel || multiDayMeta.firstDate || ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned)));

      rows.push({
        auditId: auditId,
        source: 'Audit planning',
        company: company,
        companyLocation: location,
        location: location,
        region: region,
        companyRegion: region,
        locs: Number(companyCtx.locationsCount || 1),
        locationsToPlan: Number(companyCtx.locationsCount || 1),
        gps: ManagerV5_str_(companyCtx.hqGps || ''),
        gpsData: ManagerV5_str_(companyCtx.hqGps || ''),
        scopes: scopesPack.scopes || [],
        scopesText: scopesPack.scopesText || '',
        status: Status_toDisplayStatus_(statusDisplay),
        statusKey: statusNorm,
        planningWindow: ManagerV5_formatPlanningWindowText_(pw),
        planningWindowText: ManagerV5_formatPlanningWindowText_(pw),
        planningWindowState: pw && pw.mode ? pw.mode : '',
        planningDisplay: planningDisplay,
        plannedDates: planningUi.plannedDates,
        plannedTooltip: planningUi.plannedTooltip || multiDayMeta.tooltip || '',
        planningSummary: planningUi.planningSummary,
        plannedHours: plannedHours,
        hoursPlanned: plannedHours,
        requiredHours: requiredHours,
        toBePlanned: requiredHours,
        auditor: ManagerV5_str_(ManagerV5_safe_(row, cAssigned)),
        assignedTo: ManagerV5_str_(ManagerV5_safe_(row, cAssigned)),
        assignedToEmail: ManagerV5_str_(ManagerV5_safe_(row, cAssigned)),
        preassignedAuditor: ManagerV5_str_(ManagerV5_safe_(row, cPreassigned)),
        allowSelfPlanning: ManagerV5_str_(ManagerV5_safe_(row, cAllowSelf)),
        datePlanned: planningUi.firstDate || ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned)),
        dateApproved: ManagerV5_fmtDate_(ManagerV5_safe_(row, cDateApproved)),
        dateAccepted: ManagerV5_fmtDate_(ManagerV5_safe_(row, cDateAccepted)),
        expiryY: expiryY,
        expiryZ: expiryZ,
        extApplied: extApplied,
        extensionApplied: extApplied,
        extMonths: extMonths,
        extensionMonths: extMonths,
        canExtend: (statusNorm === STATUS.PENDING_PLANNING && extMonths > 0),
        companyUid: ManagerV5_str_(resolvedCompanyUid || companyUid),
        managerEmail: ManagerV5_str_(ManagerV5_safe_(row, cManagerEmail)),
        readOnly: false
      });
    }

    rows.sort(function(a, b) {
      var sa = ManagerV5_statusSortOrder_(a.statusKey);
      var sb = ManagerV5_statusSortOrder_(b.statusKey);
      if (sa !== sb) return sa - sb;
      var aw = String(a.planningWindow || '9999-12-31').trim();
      var bw = String(b.planningWindow || '9999-12-31').trim();
      if (aw !== bw) return aw < bw ? -1 : 1;
      var ac = String(a.company || '').toLowerCase();
      var bc = String(b.company || '').toLowerCase();
      if (ac !== bc) return ac < bc ? -1 : 1;
      return String(a.auditId || '').localeCompare(String(b.auditId || ''));
    });

    return {
      success: true,
      view: 'open',
      managerEmail: managerEmail,
      rows: rows,
      counts: {
        total: rows.length,
        pendingPlanning: rows.filter(function(x){ return x.statusKey === STATUS.PENDING_PLANNING; }).length,
        pendingApproval: rows.filter(function(x){ return x.statusKey === STATUS.PENDING_APPROVAL; }).length,
        approved: rows.filter(function(x){ return x.statusKey === STATUS.APPROVED; }).length,
        accepted: rows.filter(function(x){ return x.statusKey === STATUS.ACCEPTED; }).length
      }
    };
  } catch (e) {
    return { success:false, view:'open', rows:[], message:String(e && e.message ? e.message : e) };
  }
}


function getManagerV5Archived() {
  __mp_resetExecCache_();
  try {
    var cacheNs = 'manager';
    var cacheKey = 'single_grid_archived_completed_v1';

    try {
      var cached = __mp_auditCacheGet_(cacheNs, cacheKey);
      if (cached && Array.isArray(cached.rows)) {
        cached.cacheHit = true;
        cached.cacheService = 'AUDIT_CACHE';
        return cached;
      }
    } catch (eCacheGet) {}

    var ss = SpreadsheetApp.getActive();
    // δ1c (2026-05-03): align archived view with persist-cache (same sheet,
    // shared invalidation via LogRealizedAuditService writers).
    var packLog = __mp_getSheetDataPersistCached_(ss, 'Log realized audits', 300);
    var sh = packLog.sh;
    if (!sh) return { success:false, view:'archived', rows:[], message:"Missing sheet 'Log realized audits'" };

    var data = packLog.data || [];
    if (!data || data.length < 2) return { success:true, view:'archived', rows:[] };

    var hdr = packLog.hdr || data[0] || [];
    var idx = ManagerV5_buildIndex_(hdr);
    var cAuditId        = idx.col('audit id');
    var cStatus         = idx.col('status');
    var cCompany        = idx.col('company');
    var cLocation       = idx.col('location');
    var cAuditor        = idx.col('auditor');
    var cDatePlanned    = idx.col('date planned');
    var cHoursPlanned   = idx.col('hours planned');
    var cHoursDedicated = idx.col('hours dedicated');
    var cCompletedDate  = idx.col('date completed');
    var cManagerEmail   = idx.col('manager email');
    var cCompanyUid     = idx.col('company uid');

    var companyRegionIndex = ManagerV5_buildCompanyRegionIndex_(ss);

    var rows = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var statusDisplay = ManagerV5_str_(ManagerV5_safe_(row, cStatus)) || 'Completed';
      var statusNorm = Status_normalizeStatus_(statusDisplay);
      if (statusNorm !== STATUS.COMPLETED) continue;

      var company = ManagerV5_str_(ManagerV5_safe_(row, cCompany));
      var auditId = ManagerV5_str_(ManagerV5_safe_(row, cAuditId));
      if (!auditId && !company) continue;
      if (!auditId) auditId = 'LOGROW_' + String(r + 1);

      var location = ManagerV5_str_(ManagerV5_safe_(row, cLocation));
      var companyUid = ManagerV5_str_(ManagerV5_safe_(row, cCompanyUid));
      var companyCtx = _mp_companyConstraintsCached_(ss, company, location, companyUid) || {};
      if (!location) location = ManagerV5_str_(companyCtx.location || '');
      var resolvedCompanyUid = ManagerV5_str_(companyCtx.companyUid || companyUid);
      var region = ManagerV5_lookupCompanyRegion_(companyRegionIndex, company, resolvedCompanyUid, location);

      var scopesPack = ManagerV5_buildScopePayloadFromLogRow_(hdr, row);
      var executedOn = ManagerV5_fmtDate_(ManagerV5_safe_(row, cDatePlanned));
      var completedDate = ManagerV5_fmtDate_(ManagerV5_safe_(row, cCompletedDate));
      var hoursPlanned = ManagerV5_num_(ManagerV5_safe_(row, cHoursPlanned));
      var hoursDedicated = ManagerV5_num_(ManagerV5_safe_(row, cHoursDedicated));

      rows.push({
        auditId: auditId,
        source: 'Log realized audits',
        company: company,
        location: location,
        region: region,
        companyRegion: region,
        locs: Number(companyCtx.locationsCount || 1),
        scopes: scopesPack.scopes || [],
        scopesText: scopesPack.scopesText || '',
        executedOn: executedOn,
        auditor: ManagerV5_str_(ManagerV5_safe_(row, cAuditor)),
        hoursPlanned: hoursPlanned,
        plannedHours: hoursPlanned,
        hoursDedicated: hoursDedicated,
        completedDate: completedDate,
        status: 'Completed',
        statusKey: STATUS.COMPLETED,
        managerEmail: ManagerV5_str_(ManagerV5_safe_(row, cManagerEmail)),
        companyUid: ManagerV5_str_(resolvedCompanyUid || companyUid),
        readOnly: true
      });
    }

    rows.sort(function(a, b) {
      var ad = String(a.completedDate || a.executedOn || '').trim();
      var bd = String(b.completedDate || b.executedOn || '').trim();
      if (ad !== bd) return ad < bd ? 1 : -1;
      var ac = String(a.company || '').toLowerCase();
      var bc = String(b.company || '').toLowerCase();
      if (ac !== bc) return ac < bc ? -1 : 1;
      return String(a.auditId || '').localeCompare(String(b.auditId || ''));
    });

    var out = { success:true, view:'archived', rows:rows, cacheHit:false, cacheService:'AUDIT_CACHE' };
    try {
      __mp_auditCachePut_(cacheNs, cacheKey, out, 300);
    } catch (eCachePut) {}
    return out;
  } catch (e) {
    return { success:false, view:'archived', rows:[], message:String(e && e.message ? e.message : e) };
  }
}

function ManagerV5_getOpenAndArchivedCounts() {
  var openRes = getManagerV5Open();
  var archRes = getManagerV5Archived();
  return {
    success: !!(openRes && openRes.success !== false && archRes && archRes.success !== false),
    openCount: (openRes && openRes.rows && openRes.rows.length) ? openRes.rows.length : 0,
    archivedCount: (archRes && archRes.rows && archRes.rows.length) ? archRes.rows.length : 0
  };
}

function ManagerV5_getActorEmail_() {
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim(); } catch (e1) {}
  if (!email) {
    try { email = String(Session.getEffectiveUser().getEmail() || '').trim(); } catch (e2) {}
  }
  return String(email || '').trim().toLowerCase();
}

function ManagerV5_buildIndex_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var k = ManagerV5_norm_(headers[i]);
    if (k) map[k] = i;
  }
  function col(key) {
    var k = ManagerV5_norm_(key);
    if (map.hasOwnProperty(k)) return map[k];
    var aliases = {
      'audit id': ['audit id','auditid'],
      'company': ['company'],
      'location': ['location'],
      'status': ['status'],
      'assigned to': ['assigned to','assignedto','assigned'],
      'preassigned auditor': ['preassigned auditor','preassignedauditor','preassigned'],
      'allow self planning': ['allow self planning','allowselfplanning'],
      'total audit time in hours': ['total audit time in hours','required hours','hours to be planned','totalaudittimeinhours'],
      'hours planned': ['hours planned','hoursplanned'],
      'planning json': ['planning json','planningjson'],
      'date planned': ['date planned','dateplanned','date - planned'],
      'date approved': ['date approved','dateapproved','date - approved'],
      'date accepted': ['date accepted','dateaccepted'],
      'date completed': ['date completed','datecompleted'],
      'manager email': ['manager email','manager_email','manager e-mail'],
      'company uid': ['company uid','company_uid','companyuid'],
      'date - will expire': ['date - will expire','date will expire','will expire','expiry date'],
      'extended expiration date': ['extended expiration date','extende expiration date','extendedexpirydate'],
      'extension applied': ['extension applied','extension_applied'],
      'planning window from': ['planning window from','plan van','planning from'],
      'planning window to': ['planning window to','plant tot','planning to'],
      'auditor': ['auditor','auditor email','email']
    };
    var list = aliases[k] || [];
    for (var j = 0; j < list.length; j++) {
      var a = ManagerV5_norm_(list[j]);
      if (map.hasOwnProperty(a)) return map[a];
    }
    return -1;
  }
  return { col: col };
}

function ManagerV5_norm_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function ManagerV5_safe_(row, idx) {
  if (idx === undefined || idx === null || idx < 0) return '';
  return row[idx];
}

function ManagerV5_str_(v) {
  return String(v == null ? '' : v).trim();
}

function ManagerV5_num_(v) {
  var n = Number(v || 0);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function ManagerV5_fmtDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function ManagerV5_buildScopePayloadFromPlanningRow_(headers, row) {
  try {
    return v5_extractScopesForAuditPlanningRow_(headers, row);
  } catch (e) {
    return { scopes:[], scopesText:'' };
  }
}

function ManagerV5_buildScopePayloadFromLogRow_(headers, row) {
  var cfg = v5_getScopesConfig_(false) || { list:[] };
  var map = {};
  for (var i = 0; i < headers.length; i++) map[ManagerV5_norm_(headers[i])] = i;
  var scopes = [];
  for (var j = 0; j < (cfg.list || []).length; j++) {
    var def = cfg.list[j];
    var ix = map[ManagerV5_norm_(def.slot)];
    if (ix === undefined) continue;
    if (v5_isMarkedX_(row[ix])) {
      scopes.push({
        slot: def.slot,
        code: def.code,
        name: def.name,
        color: def.color,
        textColor: def.textColor,
        active: def.active,
        archived: def.archived
      });
    }
  }
  if (!scopes.length) {
    var rawScopes = '';
    var idx = ManagerV5_buildIndex_(headers);
    var cScopes = idx.col('scopes list');
    if (cScopes >= 0) rawScopes = ManagerV5_str_(row[cScopes]);
    if (!rawScopes) {
      for (var k = 0; k < headers.length; k++) {
        var hk = ManagerV5_norm_(headers[k]);
        if (hk === 'scopes' || hk === 'scopes list' || hk === 'scope') {
          rawScopes = ManagerV5_str_(row[k]);
          if (rawScopes) break;
        }
      }
    }
    if (rawScopes) {
      rawScopes.split(/[,;|]/).forEach(function(part){
        var name = ManagerV5_str_(part);
        if (!name) return;
        scopes.push({ code:name, name:name });
      });
    }
  }
  var names = [];
  for (var s = 0; s < scopes.length; s++) names.push(scopes[s].name || scopes[s].code || scopes[s].slot);
  return { scopes:scopes, scopesText:names.join(', ') };
}

function ManagerV5_buildMultiDayMetaFromPlanningJson_(planningJson, fallbackDate) {
  var blocks = ManagerV5_extractPlanningBlocks_(planningJson);
  var firstDate = String(fallbackDate || '').trim();
  var tooltip = '';
  var isMultiDay = false;

  if (blocks.length) {
    blocks.sort(function(a, b) {
      var ad = String(a.date || '');
      var bd = String(b.date || '');
      if (ad !== bd) return ad < bd ? -1 : 1;
      var as = String(a.start || '');
      var bs = String(b.start || '');
      if (as !== bs) return as < bs ? -1 : 1;
      return 0;
    });
    firstDate = String(blocks[0].date || firstDate || '').trim();
    var uniqueDates = {};
    var uniqueCount = 0;
    var lines = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i] || {};
      var d = String(b.date || '').trim();
      var s = String(b.start || '').trim();
      var e = String(b.end || '').trim();
      if (d && !uniqueDates[d]) { uniqueDates[d] = true; uniqueCount++; }
      var line = d;
      if (s && e) line += ' ' + s + '-' + e;
      else if (s) line += ' ' + s;
      else if (e) line += ' ' + e;
      if (line) lines.push(line);
    }
    tooltip = lines.join('\n');
    isMultiDay = uniqueCount > 1;
  }

  var firstLabel = firstDate;
  if (blocks.length) {
    var b0 = blocks[0] || {};
    var s0 = String(b0.start || '').trim();
    var e0 = String(b0.end || '').trim();
    if (firstDate && s0 && e0) firstLabel = firstDate + ' ' + s0 + '-' + e0;
    else if (firstDate && s0) firstLabel = firstDate + ' ' + s0;
  }

  return { firstDate:firstDate, firstLabel:firstLabel, tooltip:tooltip, isMultiDay:isMultiDay };
}


function ManagerV5_buildPlanningUiContractFromPlanningJson_(planningJson, fallbackDate, fallbackHours) {
  // Manager grid read-model contract:
  // Planning JSON is the only planning-date truth. Date - Planned is a mirror
  // and can be a Google Sheets Date object with timezone drift. Therefore all
  // UI planning fields are derived here from JSON string dates first.
  var blocks = ManagerV5_extractPlanningBlocks_(planningJson);
  var dates = [];
  var seenDates = {};
  var tooltipLines = [];

  blocks.sort(function(a, b) {
    var ad = String(a.date || '');
    var bd = String(b.date || '');
    if (ad !== bd) return ad < bd ? -1 : 1;
    var as = String(a.start || '');
    var bs = String(b.start || '');
    if (as !== bs) return as < bs ? -1 : 1;
    return String(a.end || '').localeCompare(String(b.end || ''));
  });

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    var d = String(b.date || '').trim();
    var s = String(b.start || '').trim();
    var e = String(b.end || '').trim();
    if (d && !seenDates[d]) {
      seenDates[d] = true;
      dates.push(d);
    }
    if (d) {
      var line = d;
      if (s && e) line += ' ' + s + '-' + e;
      else if (s) line += ' ' + s;
      else if (e) line += ' ' + e;
      tooltipLines.push(line);
    }
  }

  var fallback = '';
  // Fallback is legacy-only. Keep it out of JSON-backed rows.
  if (!dates.length) fallback = ManagerV5_fmtDate_(fallbackDate);

  var firstDate = dates.length ? dates[0] : fallback;
  var plannedHours = ManagerV5_extractPlannedHours_(planningJson, fallbackHours);

  var summaryBlocks = blocks.map(function(b){
    return {
      date: String(b.date || '').trim(),
      from: String(b.start || '').trim(),
      to: String(b.end || '').trim(),
      start: String(b.start || '').trim(),
      end: String(b.end || '').trim()
    };
  }).filter(function(b){ return !!b.date; });

  return {
    firstDate: firstDate,
    plannedDates: dates.length ? dates.slice() : (fallback ? [fallback] : []),
    plannedTooltip: tooltipLines.join('\n'),
    plannedHours: plannedHours,
    planningSummary: {
      blocks: summaryBlocks,
      dates: dates.length ? dates.slice() : (fallback ? [fallback] : []),
      firstDate: firstDate,
      hoursPlanned: plannedHours
    }
  };
}


function ManagerV5_extractPlanningBlocks_(planningJson) {
  var out = [];
  var seen = {};
  function push_(date, start, end) {
    date = ManagerV5_fmtDate_(date);
    start = ManagerV5_normTime_(start);
    end = ManagerV5_normTime_(end);
    if (!date) return;
    var key = [date, start, end].join('|');
    if (seen[key]) return;
    seen[key] = true;
    out.push({ date:date, start:start, end:end });
  }
  function visit_(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) visit_(node[i]);
      return;
    }
    if (typeof node !== 'object') return;
    var dateVal = node.date || node.day || node.iso || node.dateIso || node.auditDate || node.plannedDate || '';
    var startVal = node.start || node.from || node.startTime || node.timeFrom || '';
    var endVal = node.end || node.to || node.endTime || node.timeTo || '';
    if (dateVal) push_(dateVal, startVal, endVal);
    var keys = ['blocks','days','slots','segments','selections','selectedDays','plannedDays','plannedDates','items'];
    for (var k = 0; k < keys.length; k++) {
      var child = node[keys[k]];
      if (child !== null && child !== undefined) visit_(child);
    }
  }
  try {
    var raw = String(planningJson || '').trim();
    if (!raw) return out;
    visit_(JSON.parse(raw));
  } catch (e) {
    return out;
  }
  return out;
}

function ManagerV5_normTime_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return s;
  return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
}

function ManagerV5_extractPlannedHours_(planningJson, fallbackHours) {
  var blocks = ManagerV5_extractPlanningBlocks_(planningJson);
  var mins = 0;
  for (var i = 0; i < blocks.length; i++) {
    var sm = V5_timeToMinutes_(blocks[i].start);
    var em = V5_timeToMinutes_(blocks[i].end);
    if (isFinite(sm) && isFinite(em) && em > sm) mins += (em - sm);
  }
  if (mins > 0) return Math.round((mins / 60) * 100) / 100;
  return ManagerV5_num_(fallbackHours);
}

function ManagerV5_formatPlanningWindowText_(pw) {
  if (!pw) return '';
  var s = String(pw.startDate || '').trim();
  var e = String(pw.endDate || '').trim();
  if (s && e) return s + ' → ' + e;
  if (s) return s;
  return e;
}

function ManagerV5_stripLegacyMultiDaySuffix_(s) {
  return String(s || '').replace(/\s*\(\+\d+\)\s*$/, '').trim();
}


function ManagerV5_buildCompanyRegionIndex_(ss) {
  var out = { byUid:{}, byName:{}, byNameLocation:{}, stats:{ rows:0, withRegion:0, byUid:0, byName:0, byNameLocation:0 } };
  try {
    ss = ss || SpreadsheetApp.getActive();
    var pack = __mp_getSheetDataPersistCached_(ss, 'Companies', 300);
    var data = pack.data || [];
    var hdr = pack.hdr || data[0] || [];
    if (!data || data.length < 2) return out;

    function findCol_(names, fallback) {
      for (var a = 0; a < (names || []).length; a++) {
        var want = ManagerV5_norm_(names[a]);
        for (var i = 0; i < hdr.length; i++) {
          if (ManagerV5_norm_(hdr[i]) === want) return i;
        }
      }
      return (typeof fallback === 'number') ? fallback : -1;
    }

    var cCompany = findCol_(['Company', 'Company name', 'Name', 'Client', 'Customer'], 0);
    var cLocation = findCol_(['Location'], 7);
    var cRegion = findCol_(['Region'], 8); // Companies!I = Region
    var cUid = findCol_(['Company_UID', 'Company UID', 'CompanyUID', 'UID'], 19);

    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      out.stats.rows++;
      var region = ManagerV5_str_(row[cRegion]);
      if (!region) continue;
      out.stats.withRegion++;

      var uidKey = cUid >= 0 ? ManagerV5_regionKey_(row[cUid]) : '';
      var nameKey = cCompany >= 0 ? ManagerV5_regionKey_(row[cCompany]) : '';
      var locKey = cLocation >= 0 ? ManagerV5_regionKey_(row[cLocation]) : '';

      if (uidKey && !out.byUid[uidKey]) {
        out.byUid[uidKey] = region;
        out.stats.byUid++;
      }
      if (nameKey && !out.byName[nameKey]) {
        out.byName[nameKey] = region;
        out.stats.byName++;
      }
      if (nameKey && locKey && !out.byNameLocation[nameKey + '|' + locKey]) {
        out.byNameLocation[nameKey + '|' + locKey] = region;
        out.stats.byNameLocation++;
      }
    }
  } catch (e) {
    try { Logger.log('[MANAGER_GRID_REGION_INDEX_FAIL] ' + String(e && e.message ? e.message : e)); } catch (_log) {}
  }
  return out;
}

function ManagerV5_lookupCompanyRegion_(index, company, companyUid, location) {
  try {
    index = index || { byUid:{}, byName:{}, byNameLocation:{} };
    var uidKey = ManagerV5_regionKey_(companyUid);
    if (uidKey && index.byUid && index.byUid[uidKey]) return index.byUid[uidKey];

    var nameKey = ManagerV5_regionKey_(company);
    var locKey = ManagerV5_regionKey_(location);
    if (nameKey && locKey && index.byNameLocation && index.byNameLocation[nameKey + '|' + locKey]) {
      return index.byNameLocation[nameKey + '|' + locKey];
    }

    if (nameKey && index.byName && index.byName[nameKey]) return index.byName[nameKey];
  } catch (e) {}
  return '';
}

function ManagerV5_regionKey_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function RUN_MANAGER_GRID_REGION_DIAG() {
  var ss = SpreadsheetApp.getActive();
  var idx = ManagerV5_buildCompanyRegionIndex_(ss);
  var open = getManagerV5Open();
  var enriched = getManagerV5OpenEnriched((open && open.rows ? open.rows.slice(0, 25).map(function(r){ return r.auditId; }) : []));
  var openRows = (open && open.rows) || [];
  var enrichedRows = (enriched && enriched.rows) || [];
  var out = {
    success: true,
    build: 'd41_MANAGER_GRID_REGION_STABLE_20260524',
    companiesRegionIndexStats: idx.stats || {},
    openRows: openRows.length,
    openRowsWithRegion: openRows.filter(function(r){ return !!String(r.region || '').trim(); }).length,
    enrichedRows: enrichedRows.length,
    enrichedRowsWithRegion: enrichedRows.filter(function(r){ return !!String(r.region || '').trim(); }).length,
    openSampleMissingRegion: openRows.filter(function(r){ return !String(r.region || '').trim(); }).slice(0, 10).map(function(r){
      return { auditId:r.auditId, company:r.company, companyUid:r.companyUid, location:r.location };
    }),
    enrichedSampleMissingRegion: enrichedRows.filter(function(r){ return !String(r.region || '').trim(); }).slice(0, 10).map(function(r){
      return { auditId:r.auditId, company:r.company, companyUid:r.companyUid, location:r.location, gps: r.gps || '', scopesText: r.scopesText || '' };
    })
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function ManagerV5_statusSortOrder_(statusKey) {
  var s = String(statusKey || '').trim();
  if (s === STATUS.PENDING_APPROVAL) return 1;
  if (s === STATUS.PENDING_PLANNING) return 2;
  if (s === STATUS.APPROVED) return 3;
  if (s === STATUS.ACCEPTED) return 4;
  return 99;
}


/**
 * RUN_MP_CACHE_BRIDGE_HIT_TEST
 * Manual read-only cache bridge smoke test.
 * Safe:
 * - no save
 * - no status transition
 * - no availability writeback
 * - no mutation
 */
function RUN_MP_CACHE_BRIDGE_HIT_TEST() {
  var t0 = Date.now();
  __mp_resetExecCache_();

  var out = {
    ok: true,
    service: 'ManagerPlanningV5Backend cache bridge v2',
    timestamp: new Date().toISOString(),
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    checks: {},
    errors: []
  };

  function mpBackendCleanupCheck_(name, fn) {
    var s = Date.now();
    try {
      var res = fn();
      out.checks[name] = {
        ok: true,
        durationMs: Date.now() - s,
        summary: res || {}
      };
    } catch (e) {
      out.ok = false;
      out.errors.push({ check:name, error:String(e && e.message ? e.message : e) });
      out.checks[name] = { ok:false, durationMs: Date.now() - s };
    }
  }

  mpBackendCleanupCheck_('configScopes', function(){
    var cfg = v5_getScopesConfig_(false) || {};
    return {
      listCount: (cfg.list || []).length,
      bySlotCount: Object.keys(cfg.bySlot || {}).length
    };
  });

  mpBackendCleanupCheck_('auditorsList', function(){
    var list = _mp_getAuditorsList_() || [];
    return { auditorCount: list.length };
  });

  mpBackendCleanupCheck_('companiesConstraintsSample', function(){
    var ss = SpreadsheetApp.getActive();
    var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var data = pack.data || [];
    var hdr = pack.hdr || [];
    var cCompany = _mp_findCol_(hdr, ['Company']);
    var cLocation = _mp_findCol_(hdr, ['Location']);
    var cUid = _mp_findCol_(hdr, ['Company_UID','Company UID','UID']);
    var sample = null;
    for (var r = 1; r < data.length; r++) {
      if (data[r] && String(data[r][cCompany] || '').trim()) {
        sample = data[r];
        break;
      }
    }
    if (!sample) return { matched:false, reason:'no sample audit row' };
    var cc = _mp_getCompanyConstraints_(
      ss,
      cCompany >= 0 ? sample[cCompany] : '',
      cLocation >= 0 ? sample[cLocation] : '',
      cUid >= 0 ? sample[cUid] : ''
    ) || {};
    return {
      matched: !!cc.matched,
      locationsCount: cc.locationsCount || 0,
      hasLocationsJson: !!cc.locationsJson
    };
  });

  mpBackendCleanupCheck_('centralCacheRoundtrip', function(){
    var ns = 'manager';
    var key = 'mp_bridge_roundtrip_v2';
    var payload = { marker:'ok', writtenAt:new Date().toISOString() };
    var putOk = __mp_auditCachePut_(ns, key, payload, 300);
    var got = __mp_auditCacheGet_(ns, key);
    return {
      putOk: !!putOk,
      hit: !!(got && got.marker === 'ok'),
      marker: got && got.marker ? got.marker : '',
      cacheService: 'AUDIT_CACHE'
    };
  });

  mpBackendCleanupCheck_('archivedGridReadOnly', function(){
    var r1 = getManagerV5Archived();
    var r2 = getManagerV5Archived();
    return {
      rowsFirst: (r1 && r1.rows) ? r1.rows.length : 0,
      rowsSecond: (r2 && r2.rows) ? r2.rows.length : 0,
      secondCacheHit: !!(r2 && r2.cacheHit),
      cacheService: (r2 && r2.cacheService) || '',
      note: 'read-only smoke; roundtrip above is authoritative cache bridge check'
    };
  });

  out.durationMs = Date.now() - t0;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * RUN_MP_CACHE_BRIDGE_CLEAR_MANAGER
 * Clears only ManagerPlanning read-only manager namespace cache used by this file.
 * Safe: registered cache deletion only.
 */
function RUN_MP_CACHE_BRIDGE_CLEAR_MANAGER() {
  var out = {
    ok: true,
    timestamp: new Date().toISOString(),
    cleared: {}
  };
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      out.cleared.manager = AUDIT_CACHE.removeNamespace('manager');
      out.cleared.mpCompanies = AUDIT_CACHE.removeNamespace('mp_readonly_companies_sheet');
      out.cleared.mpAuditors = AUDIT_CACHE.removeNamespace('mp_readonly_auditors_sheet');
      out.cleared.mpStandards = AUDIT_CACHE.removeNamespace('mp_readonly_standards_sheet');
      out.cleared.mpLog = AUDIT_CACHE.removeNamespace('mp_readonly_log_realized_audits_sheet');
    } else {
      out.ok = false;
      out.message = 'AUDIT_CACHE.removeNamespace unavailable';
    }
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}



/***********************************************************************
 * ROTATION / ELIGIBILITY OWNER NOTE — 2026-05-14
 *
 * The rotation/eligibility helper cluster is intentionally NOT defined in
 * ManagerPlanningBackend_CORE_SPLIT.js.
 *
 * Canonical owner: Toolkit_Eligibility.js
 * Required global functions supplied there:
 *   - _mp_rotationProfileForAuditorFromIndex_
 *   - _mp_rotationMaxByScopeFromConfig_
 *   - _mp_buildLogIndexForCompany_
 *
 * This file may call those functions, but must not redefine them.
 ***********************************************************************/

/***********************************************************************
 * OVERRIDE — context without combined 90-day availability bootstrap.
 * Keeps current caller contract but removes the blocking firstMonthAvailability.
 ***********************************************************************/
function getPlanningContextAndFirstMonthV5(auditId, monthKeyHint) {
  var t0 = Date.now();
  var ctx = getPlanningContextV5(auditId);
  if (!ctx || ctx.success === false) return ctx;
  ctx.firstMonthAvailability = null;
  ctx.toolkitMonthKeys = _mp_toolkitMonthKeysForWindow_(ctx.window || {}, 4);
  ctx.firstMonthMonthKey = _mp_toolkitFirstMonthKeyForWindow_(ctx.window || {}, monthKeyHint);
  ctx.fastFirstPaint = true;
  ctx.availabilityBootstrapSkipped = true;
  ctx.serverMs = Date.now() - t0;
  return ctx;
}

function RUN_TOOLKIT_DIRECT_MONTH_TEST(auditorEmail, monthKey) {
  return getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey || Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM'));
}


// ============================================================
// PATCH B - T11_PATCHB_20260427_LITE_OPEN_PARALLEL
// ============================================================
// Goal: Break the ~13s cold-open into a fast lite first paint
// (~300-700ms) plus background hydration of the auditors list
// (the slow part: rotation index from "Log realized audits" +
// per-auditor qualification check).
//
// Endpoints added:
//   getToolkitOpenLiteV5(auditId)
//     Returns full ctx structure compatible with the existing
//     onContextLoaded UI, but uses a CHEAP basic auditors list
//     (no rotation, no per-scope qualification). Marks the result
//     with __lite:true and auditorsLoading:true so UI knows to
//     wait for hydration.
//
//   getToolkitAuditorsV5(auditId)
//     Returns the FULL eligibility-resolved auditors list +
//     auditorEligibilityMeta. Same logic as the eligibility
//     section of getPlanningContextV5. UI merges into existing
//     dropdown after lite paint.
//
// Helper:
//   _mp_getAuditorsBasicList_(ss, preassignedName)
//     Single Auditors-sheet read. Returns active role:auditor rows
//     with {name,email,blockedWeekdays,isPreassigned}. No rotation
//     calc, no scope qualification. Used by lite open.
// ============================================================

function _mp_getQualifiedAuditorsFastList_(ss, requiredScopes, preassignedName, opts){
  opts = opts || {};
  /**
   * BUILD: CORE_SPLIT_d34_3S_CANONICAL_ELIGIBILITY_20260514
   *
   * Fast path must not be a second membership owner.
   * It delegates to Toolkit_Eligibility._mp_getCanonicalQualifiedAuditorMembership_.
   * Membership therefore stays identical between first paint and hydration.
   */
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  if (typeof _mp_getCanonicalQualifiedAuditorMembership_ !== 'function') {
    throw new Error('Missing _mp_getCanonicalQualifiedAuditorMembership_; Toolkit_Eligibility is required for auditor membership.');
  }
  var res = _mp_getCanonicalQualifiedAuditorMembership_(ss, requiredScopes || [], preassignedName || '', [], [], opts || {});
  return (res && Array.isArray(res.auditors)) ? res.auditors : [];
}


/**
 * d21 — Fast-open qualified auditor list cache.
 *
 * Purpose:
 * - Keep Manager toolkit open lightweight.
 * - Avoid repeating scope-canonicalization + Auditors qualification filtering
 *   on every cold getToolkitOpenFastV5 call.
 * - Cache only lightweight qualification dropdown data.
 *
 * Governance:
 * - Cache accelerates only; Auditors + Config_Scopes remain truth.
 * - No status, planning, availability, or collision decisions are cached here.
 * - Short TTL; no persistence writes.
 */
function _mp_fastOpenQualifiedCacheKey_(requiredScopes, preassignedName) {
  var scopes = (requiredScopes || []).map(function(s) {
    return String(s || '').trim().toLowerCase();
  }).filter(function(s) {
    return !!s;
  }).sort();

  var generation = 'GEN_LEGACY';
  try {
    if (typeof AUDITOR_SCOPE_getCacheGeneration_ === 'function') {
      generation = AUDITOR_SCOPE_getCacheGeneration_();
    }
  } catch (e) {}

  return 'MP_OPEN_QUAL_FAST_3S_R4::' +
    generation +
    '::' +
    scopes.join('|') +
    '::pre=' + String(preassignedName || '').trim().toLowerCase();
}

function _mp_fastOpenQualifiedCacheGet_(requiredScopes, preassignedName) {
  try {
    var key = _mp_fastOpenQualifiedCacheKey_(requiredScopes, preassignedName);
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    Logger.log('[MP_OPEN_QUAL_FAST_3S_R4] cache get failed: ' + e);
    return null;
  }
}

function _mp_fastOpenQualifiedCachePut_(requiredScopes, preassignedName, auditors) {
  try {
    if (!Array.isArray(auditors)) return false;
    var key = _mp_fastOpenQualifiedCacheKey_(requiredScopes, preassignedName);
    var payload = JSON.stringify(auditors);
    if (payload.length > 90000) {
      Logger.log('[MP_OPEN_QUAL_FAST_3S_R4] cache put skipped, payload too large: ' + payload.length);
      return false;
    }
    CacheService.getScriptCache().put(key, payload, 600);
    return true;
  } catch (e) {
    Logger.log('[MP_OPEN_QUAL_FAST_3S_R4] cache put failed: ' + e);
    return false;
  }
}

function _mp_fastOpenQualifiedCacheInvalidate_() {
  // CacheService has no prefix delete. Short TTL is the freshness boundary.
  return { success:true, message:'MP_OPEN_QUAL_FAST_3S_R4 is generation-aware; old keys are ignored after AUDITOR_SCOPE generation bump.' };
}

function _mp_getAuditorsBasicList_(ss, preassignedName){
  var packAud = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
  var shAud = packAud.sh;
  if (!shAud) return [];
  var data = packAud.data || [];
  if (data.length < 2) return [];

  var hdr = data[0] || [];
  var idxName   = _mp_findHeaderIdxCI_(hdr, ['Name','Auditor','Auditor name']);
  var idxEmail  = _mp_findHeaderIdxCI_(hdr, ['E-mail','Email','E-mail address','Mail']);
  var idxActive = _mp_findHeaderIdxCI_(hdr, ['Active','Is active']);
  var idxRole   = _mp_findHeaderIdxCI_(hdr, ['Role','Function']);
  var idxBW     = _mp_findHeaderIdxCI_(hdr, ['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);

  if (idxName < 0 || idxEmail < 0 || idxActive < 0 || idxRole < 0) return [];

  var pre = String(preassignedName || '').trim().toLowerCase();
  var out = [];
  for (var r=1; r<data.length; r++){
    var row = data[r];
    if (!_mp_isYes_(row[idxActive])) continue;
    var role = String(row[idxRole]||'').toLowerCase();
    if (role.indexOf('auditor') === -1) continue;

    var name  = String(row[idxName]||'').trim();
    var email = String(row[idxEmail]||'').trim();
    var bw    = (idxBW>=0) ? String(row[idxBW]||'').trim() : '';

    var isPre = false;
    if (pre){
      if (name.toLowerCase() === pre) isPre = true;
      if (email.toLowerCase() === pre) isPre = true;
    }

    out.push({
      name: name,
      email: email,
      blockedWeekdays: bw,
      isPreassigned: isPre,
      // Default-eligible during lite phase. Hydration call will overwrite
      // these flags with the real qualification/rotation results.
      softBlockRotation: false,
      nearRotationLimit: false,
      ineligible: false,
      hardBlockQualification: false,
      ineligibleReason: '',
      __basic: true
    });
  }

  // Same sort order as eligibility list: preassigned first, then name
  out.sort(function(a,b){
    if (!!a.isPreassigned !== !!b.isPreassigned) return a.isPreassigned ? -1 : 1;
    return String(a.name||'').localeCompare(String(b.name||''));
  });

  return out;
}

function getToolkitOpenLiteV5(auditId) {
  __mp_resetExecCache_();
  var __t0 = Date.now();
  try {
    auditId = String(auditId || "").trim();
    if (!auditId) return { success:false, message:"Missing auditId" };

    var ss = SpreadsheetApp.getActive();
    var __apPack = __mp_getSheetDataCached_(ss, "Audit planning");
    var sh = __apPack.sh;
    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };

    var data = __apPack.data || [];
    var hdr  = __apPack.hdr || data[0] || [];

    function findIndex(names) {
      for (var i=0;i<hdr.length;i++) {
        var h = String(hdr[i]||"").toLowerCase();
        for (var j=0;j<names.length;j++) {
          if (h.indexOf(String(names[j]).toLowerCase()) >= 0) return i;
        }
      }
      return -1;
    }

    var colAI         = _mp_findCol_(hdr, ["Audit ID"]);
    var colCompany    = _mp_findCol_(hdr, ["Company"]);
    var colLocation   = _mp_findCol_(hdr, ["Location"]);
    var colStatus     = _mp_findCol_(hdr, ["Status"]);
    var colReqHours   = findIndex(["total audit time in hours","total time in hours","required hours","total hours"]);
    var colPreAssign  = findIndex(["pre assigned auditor","pre-assigned auditor","preassigned auditor"]);
    var colAssignedTo = (function(){
      for (var i = 0; i < hdr.length; i++) {
        var h = String(hdr[i] || "").trim().toLowerCase();
        if (h.indexOf("pre") >= 0) continue;
        if (h === "assigned to" || h === "assigned auditor" || h === "assigned") return i;
      }
      return -1;
    })();
    if (colAssignedTo < 0) {
      for (var ci=0; ci<hdr.length; ci++) {
        var hh = String(hdr[ci]||"").trim().toLowerCase();
        if (!hh) continue;
        if (hh.indexOf("pre") >= 0 && hh.indexOf("auditor") >= 0) continue;
        if (hh === "auditor" || hh === "auditor email" || hh === "auditor e-mail") { colAssignedTo = ci; break; }
        if (hh.indexOf("auditor") >= 0 && hh.indexOf("assigned") >= 0) { colAssignedTo = ci; break; }
      }
    }
    var colJson       = _mp_findCol_(hdr, ["Planning JSON"]);
    var colCompanyUid = _mp_findCol_(hdr, ["Company_UID", "Company UID", "UID"]);
    var colWillExpire = _mp_findCol_(hdr, ["Date - Will Expire","Date - will expire","Will Expire","Date - Will expire"]);
    var colExtExpire  = _mp_findCol_(hdr, ["Extended Expiration Date","Extende Expiration Date","ExtendedExpiryDate","Extende ExpirationDate"]);
    var colExtApplied = _mp_findCol_(hdr, ["Extension applied","Extension Applied","Extension_applied"]);

    if (colAI < 0) return { success:false, message:"Missing 'Audit ID' column" };

    var rowIndex = -1, row = null;
    for (var r=1; r<data.length; r++) {
      if (String(data[r][colAI]) === auditId) {
        rowIndex = r+1;
        row = data[r];
        break;
      }
    }
    if (!row) return { success:false, message:"Audit not found: "+auditId };

    var requiredHours = 0;
    if (colReqHours >= 0) {
      var rh = row[colReqHours];
      if (typeof rh === "number") requiredHours = rh;
      else if (rh !== null && rh !== "" && !isNaN(Number(rh))) requiredHours = Number(rh);
    }

    var preassigned = colPreAssign >= 0 ? row[colPreAssign] : "";
    var assignedTo  = colAssignedTo >= 0 ? row[colAssignedTo] : "";

    var existingBlocks = [];
    if (colJson >= 0 && row[colJson]) {
      try {
        var js = JSON.parse(row[colJson]);
        if (js && Array.isArray(js.blocks)) existingBlocks = js.blocks;
      } catch(e) {}
    }

    var win = V5_resolvePlanningWindowFromAuditPlanningRow_(hdr, row, _mp_resolvePlanningWindow_(ss, hdr, row));
    var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr, row);

    var auditCompany = colCompany  >= 0 ? row[colCompany]  : "";
    var auditLoc     = colLocation >= 0 ? row[colLocation] : "";
    var companyUid   = colCompanyUid >= 0 ? row[colCompanyUid] : "";
    var companyConstraints = ManagerV5_mergeToolkitCompanyMeta_(_mp_companyConstraintsCached_(ss, auditCompany, auditLoc, companyUid), ss, auditCompany, auditLoc, companyUid);

    // MVP: Manager dropdown options must be HARD-qualified, but Lite open must not run rotation/log scans.
    var reqScopeNamesLite = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){
      return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
    }).filter(function(x){ return !!x; }) : [];
    var auditors = _mp_getQualifiedAuditorsFastList_(ss, reqScopeNamesLite, preassigned, { auditId: auditId });
    var auditorEligibilityMeta = { requiredScopes:reqScopeNamesLite, qualifiedFast:true, rotationPending:true };

    // Default auditor: preserve assigned/preassigned only if still eligible. Never auto-select first option for manager.
    var defaultAuditorEmail = '';
    var defaultAuditorName = '';
    var managerFallbackEmail = '';
    var managerFallbackName = '';
    (function(){
      var desiredKey = String(assignedTo || preassigned || '').trim().toLowerCase();
      if (!desiredKey) return;
      for (var i=0; i<auditors.length; i++){
        var a = auditors[i] || {};
        var em = String(a.email||'').trim().toLowerCase();
        var nm = String(a.name||'').trim().toLowerCase();
        if ((em && em === desiredKey) || (nm && nm === desiredKey)) {
          defaultAuditorEmail = V5_normalizeEmail_(a.email || '');
          defaultAuditorName = String(a.name || a.email || '').trim();
          a.isSelected = true;
          break;
        }
      }
    })();

    companyConstraints = ManagerV5_applyToolkitAuditorBlockedWeekdays_(companyConstraints, ss, defaultAuditorEmail, defaultAuditorName || assignedTo || preassigned);

    // NOTE: V5_ensureAuditorAvailabilityDefaultsForToolkitOpen_ is intentionally
    // SKIPPED here (it requires the full auditors list and only applies to auditor
    // role). For manager role - the typical toolkit caller - this was already
    // skipped in getPlanningContextV5. For auditor role, the auditors hydration
    // call will trigger it.

    return {
      success: true,
      __lite: true,
      __serverMs: Date.now() - __t0,
      auditorsLoading: true,
      defaultAuditorEmail: defaultAuditorEmail,
      defaultAuditorName: defaultAuditorName,
      managerFallbackEmail: managerFallbackEmail,
      managerFallbackName: managerFallbackName,
      locationsCount: companyConstraints.locationsCount || 1,
      hqName: companyConstraints.hqName || "HQ",
      hqGps: companyConstraints.hqGps || "",
      slotTemplates: companyConstraints.slotTemplates || null,
      audit: {
        auditId: auditId,
        companyUid: _mp_safeStr_(companyConstraints.companyUid || companyUid),
        company: auditCompany,
        location: auditLoc,
        scopes: (scopesRes && scopesRes.scopes) ? scopesRes.scopes : [],
        scopesText: (scopesRes && scopesRes.scopesText) ? scopesRes.scopesText : "",
        status: colStatus >= 0 ? row[colStatus] : "",
        requiredHours: requiredHours,
        preassignedAuditor: preassigned,
        assignedTo: assignedTo,
        preassignedAuditorEmail: defaultAuditorEmail,
        willExpireDate: (colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : "",
        extendedExpiryDate: (colExtExpire >= 0 && row[colExtExpire]) ? V5_formatDateISO_(row[colExtExpire]) : ((colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : ""),
        extensionApplied: (function(){
          var flag = (colExtApplied >= 0 && row[colExtApplied]) ? String(row[colExtApplied]).trim().toLowerCase() : "";
          if (flag === "yes" || flag === "true") return true;
          var y = (colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : "";
          var z = (colExtExpire >= 0 && row[colExtExpire]) ? V5_formatDateISO_(row[colExtExpire]) : "";
          return (y && z && y !== z);
        })(),
        existingBlocks: existingBlocks
      },
      companyConstraints: companyConstraints,
      auditors: auditors,
      auditorEligibilityMeta: auditorEligibilityMeta,
      window: { startDate: win.startDate, endDate: win.endDate, mode: win.mode },
      warnings: win.warnings || [],
      scopeWindows: win.scopeWindows || [],
      activeScopes: win.activeScopes || []
    };

  } catch(e) {
    return { success:false, message: e.message };
  }
}

function getToolkitAuditorsV5(auditId) {
  /**
   * BUILD: CORE_SPLIT_d34_3S_CANONICAL_ELIGIBILITY_20260514
   *
   * Hydration is not allowed to own or shrink membership.
   * It calls the same canonical eligibility owner as fast open.
   * Rotation/consecutive remains metadata only.
   */
  __mp_resetExecCache_();
  var __t0 = Date.now();
  try {
    auditId = String(auditId || '').trim();
    if (!auditId) return { success:false, message:'Missing auditId' };

    if (typeof _mp_getEligibleAuditorsList_ !== 'function') {
      throw new Error('Missing _mp_getEligibleAuditorsList_; Toolkit_Eligibility is required');
    }

    var ss = SpreadsheetApp.getActive();
    var __apPack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var data = __apPack.data || [];
    var hdr = __apPack.hdr || data[0] || [];
    var colAI = _mp_findCol_(hdr, ['Audit ID']);
    if (colAI < 0) return { success:false, message:"Missing 'Audit ID' column" };

    var row = null;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colAI] || '').trim() === auditId) { row = data[r]; break; }
    }
    if (!row) return { success:false, message:'Audit not found: ' + auditId };

    var colPreAssign = (function(){
      for (var i = 0; i < hdr.length; i++) {
        var h = String(hdr[i] || '').toLowerCase();
        if (h.indexOf('pre assigned auditor') >= 0 ||
            h.indexOf('pre-assigned auditor') >= 0 ||
            h.indexOf('preassigned auditor') >= 0) return i;
      }
      return -1;
    })();
    var preassigned = colPreAssign >= 0 ? row[colPreAssign] : '';

    var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr, row);
    var reqScopeNames = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){
      return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
    }).filter(function(x){ return !!x; }) : [];

    var elig = _mp_getEligibleAuditorsList_(ss, reqScopeNames, preassigned, hdr, row, { auditId: auditId });
    var auditors = (elig && Array.isArray(elig.auditors)) ? elig.auditors : [];
    var auditorEligibilityMeta = (elig && elig.meta) ? elig.meta : { requiredScopes:reqScopeNames };

    // Preassigned may be highlighted, but never injected if not qualified.
    (function(){
      var pre = String(preassigned || '').trim();
      if (!pre) return;
      var preLower = pre.toLowerCase();
      var foundIx = -1;
      for (var i = 0; i < auditors.length; i++) {
        var a = auditors[i] || {};
        var nm = String(a.name || '').trim().toLowerCase();
        var em = String(a.email || '').trim().toLowerCase();
        if (nm === preLower || em === preLower) { foundIx = i; break; }
      }
      if (foundIx >= 0) {
        var obj = auditors.splice(foundIx, 1)[0];
        obj.isPreassigned = true;
        auditors.unshift(obj);
      }
    })();

    try {
      var __callerEmail = V5_getCallerEmail_();
      var __roleObj = V5_getUserRoleFromAuditors_(ss, __callerEmail);
      var __role = (__roleObj && __roleObj.found) ? String(__roleObj.role || '').trim() : '';
      if (V5_isAuditorRole_(__role)) {
        var firstEmail = (auditors[0] && auditors[0].email) ? auditors[0].email : '';
        V5_ensureAuditorAvailabilityDefaultsForToolkitOpen_(auditors, firstEmail);
      }
    } catch(eEns) {
      Logger.log('[V5][d34] ensure defaults skipped: ' + eEns);
    }

    var out = {
      success:true,
      __serverMs: Date.now() - __t0,
      auditors: auditors,
      auditorEligibilityMeta: auditorEligibilityMeta,
      eligibilityOwner: '_mp_getEligibleAuditorsList_',
      membershipMode: 'HARD_QUALIFICATION_ONLY',
      rotationMode: 'SOFT_METADATA_ONLY'
    };
    Logger.log('[TOOLKIT_ELIG_D34] auditId=' + auditId + ' auditors=' + auditors.length + ' required=' + reqScopeNames.join('|'));
    return out;
  } catch(e) {
    return { success:false, message:e && e.message ? e.message : String(e), __serverMs:Date.now()-__t0 };
  }
}


// ============================================================
// PATCH C - T11_PATCHC_20260427_FAST_OPEN_CACHED
// ============================================================
// Goal: Reduce wall-time of toolkit open beyond what Patch B
// could deliver. Three changes:
//
// 1. CacheService memoization on the open response (TTL 30s,
//    keyed by auditId). Re-opens of the same audit return in
//    ~roundtrip-overhead time (<500ms wall) instead of
//    repeating 4 sheet reads.
//
// 2. Per-stage timing diagnostics. Each significant step writes
//    a {name, ms} entry to __diag.stages so we can see EXACTLY
//    which read costs how much in production logs. Use this to
//    target the next optimization.
//
// 3. Optional inline first-month calendar payload. Saves one
//    google.script.run roundtrip (~2-3s) for callers that load
//    the calendar immediately (auditor self-planning toolkit).
//    Manager toolkit passes withCalendar:false because calendar
//    is gated on a manual "Load calendar" click - no waste.
//
// Endpoint:
//   getToolkitOpenFastV5(auditId, monthKey, opts)
//     opts: { withCalendar:bool=false, forceFresh:bool=false }
//     Returns same shape as getToolkitOpenLiteV5 plus optional
//     firstMonth: { monthKey, payload } where payload matches
//     getToolkitAvailabilityMonthDirectV5 response shape.
// ============================================================

var MP_OPEN_FAST_V5_CACHE_SCHEMA = 2;

// BUILD d36_LOCKED_AUDITOR_OPEN_CACHE_ROUTE_KEY_20260517
// Route-aware open cache:
// - Manager/default route remains auditId-only for existing sheet prewarm behavior.
// - Locked auditor route uses auditId|AUDITOR|lockedEmail in ScriptCache only.
// - Invalidation remains auditId-driven and purges base + registered route variants.
// Cache accelerates only; Audit planning / Auditors / Config_Scopes remain truth.
function _mp_open_auditorScopeGeneration_() {
  var generation = 'GEN_LEGACY';
  try {
    if (typeof AUDITOR_SCOPE_getCacheGeneration_ === 'function') {
      generation = AUDITOR_SCOPE_getCacheGeneration_();
    }
  } catch (e) {}
  return String(generation || 'GEN_LEGACY').trim() || 'GEN_LEGACY';
}

function _mp_open_cacheKey_(auditId) {
  // 3S R5: route-aware open cache key remains intact, but the physical
  // CacheService key is now auditor/scope-generation-aware. This prevents
  // a full stale toolkit response, including its auditors array, from being
  // reused after changes in Auditors or Config_Scopes.
  return 'MP_OPEN_FAST_V5_3S_R5::s' +
    String(MP_OPEN_FAST_V5_CACHE_SCHEMA || 1) +
    '::' +
    _mp_open_auditorScopeGeneration_() +
    '::' +
    String(auditId || '').trim();
}

function _mp_open_routeCacheKey_(auditId, role, lockedEmail) {
  auditId = String(auditId || '').trim();
  role = String(role || '').trim().toUpperCase();
  lockedEmail = V5_normalizeEmail_(lockedEmail || '');
  if (role === 'AUDITOR' && lockedEmail) {
    return auditId + '|AUDITOR|' + lockedEmail;
  }
  return auditId;
}

function _mp_open_routeRegistryKey_(auditId) {
  return 'MP_OPEN_FAST_V5_ROUTES::s' + String(MP_OPEN_FAST_V5_CACHE_SCHEMA || 1) + '::' + String(auditId || '').trim();
}

function _mp_open_routeRegistryGet_(auditId) {
  try {
    auditId = String(auditId || '').trim();
    if (!auditId) return [];
    var raw = CacheService.getScriptCache().get(_mp_open_routeRegistryKey_(auditId));
    if (!raw) return [];
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
      var k = String(arr[i] || '').trim();
      if (!k || seen[k]) continue;
      seen[k] = true;
      out.push(k);
    }
    return out;
  } catch(e) {
    return [];
  }
}

function _mp_open_routeRegistryAdd_(auditId, routeKey) {
  try {
    auditId = String(auditId || '').trim();
    routeKey = String(routeKey || '').trim();
    if (!auditId || !routeKey || routeKey === auditId) return false;

    var routes = _mp_open_routeRegistryGet_(auditId);
    for (var i = 0; i < routes.length; i++) {
      if (routes[i] === routeKey) return true;
    }
    routes.push(routeKey);

    // Defensive cap; in normal use this is one route per locked auditor.
    if (routes.length > 25) routes = routes.slice(routes.length - 25);
    CacheService.getScriptCache().put(_mp_open_routeRegistryKey_(auditId), JSON.stringify(routes), 300);
    return true;
  } catch(e) {
    Logger.log('[D36_OPEN_ROUTE_REGISTRY_ADD_FAIL] ' + e);
    return false;
  }
}

function _mp_open_routeRegistryClear_(auditId) {
  try {
    CacheService.getScriptCache().remove(_mp_open_routeRegistryKey_(auditId));
  } catch(e) {}
}

function _mp_open_cacheShapeOk_(payload) {
  try {
    if (!payload || payload.success !== true) return false;
    if (Number(payload.__openCacheSchema || 0) !== Number(MP_OPEN_FAST_V5_CACHE_SCHEMA || 1)) return false;

    // 3S R5: Sheet-persistent open cache may still return an old full toolkit
    // response under the raw auditId route. Reject it unless its stored
    // auditor/scope generation equals the current generation.
    var expectedGeneration = _mp_open_auditorScopeGeneration_();
    var actualGeneration = String(payload.__auditorScopeGeneration || '').trim();
    if (actualGeneration !== expectedGeneration) return false;

    if (!payload.audit || !payload.audit.auditId) return false;
    if (!payload.window || typeof payload.window !== 'object') return false;
    if (!Array.isArray(payload.auditors)) return false;
    if (!payload.companyConstraints || typeof payload.companyConstraints !== 'object') return false;
    return true;
  } catch(e) {
    return false;
  }
}

function _mp_open_logCacheMiss_(auditId, tier, reason) {
  try {
    Logger.log('[P1_OPEN_CACHE_MISS] ' + JSON.stringify({
      auditId: String(auditId || '').trim(),
      tier: String(tier || ''),
      reason: String(reason || ''),
      schema: Number(MP_OPEN_FAST_V5_CACHE_SCHEMA || 1)
    }));
  } catch(e) {}
}

function _mp_open_logShapeReject_(auditId, tier, payload, reason) {
  try {
    Logger.log('[P1_OPEN_SHAPE_REJECT] ' + JSON.stringify({
      auditId: String(auditId || '').trim(),
      tier: String(tier || ''),
      reason: String(reason || ''),
      expectedSchema: Number(MP_OPEN_FAST_V5_CACHE_SCHEMA || 1),
      actualSchema: payload && payload.__openCacheSchema ? payload.__openCacheSchema : '',
      expectedAuditorScopeGeneration: (typeof _mp_open_auditorScopeGeneration_ === 'function') ? _mp_open_auditorScopeGeneration_() : '',
      actualAuditorScopeGeneration: payload && payload.__auditorScopeGeneration ? payload.__auditorScopeGeneration : '',
      hasAudit: !!(payload && payload.audit),
      hasWindow: !!(payload && payload.window),
      hasAuditorsArray: !!(payload && Array.isArray(payload.auditors)),
      hasCompanyConstraints: !!(payload && payload.companyConstraints)
    }));
  } catch(e) {}
}

function _mp_open_cacheGet_(auditId, opts) {
  opts = opts || {};
  var cacheKey = String((opts.cacheKey || auditId) || '').trim();
  var logKey = String(auditId || cacheKey || '').trim();
  var routeLabel = String(opts.routeLabel || '').trim();

  // Tier 1: script cache (fast, volatile, ~5 min TTL)
  try {
    var raw = CacheService.getScriptCache().get(_mp_open_cacheKey_(cacheKey));
    if (raw) {
      var obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (!_mp_open_cacheShapeOk_(obj)) {
          _mp_open_logShapeReject_(logKey, 'script' + (routeLabel ? ':' + routeLabel : ''), obj, 'SHAPE_OR_SCHEMA_MISMATCH');
        } else {
          obj.__cacheHit = true;
          obj.__cacheTier = 'script';
          obj.__openRouteKey = cacheKey;
          if (routeLabel) obj.__openRouteLabel = routeLabel;
          return obj;
        }
      }
    } else {
      _mp_open_logCacheMiss_(logKey, 'script' + (routeLabel ? ':' + routeLabel : ''), 'KEY_MISS' + (routeLabel ? ':route=' + routeLabel : ''));
    }
  } catch(e){
    _mp_open_logCacheMiss_(logKey, 'script' + (routeLabel ? ':' + routeLabel : ''), 'READ_ERROR: ' + (e && e.message ? e.message : e));
  }

  // Tier 2 sheet cache remains allowed only for the base auditId route.
  // Locked auditor routes are intentionally Tier-1 only to avoid sheet contamination.
  if (!opts.allowTier2) return null;

  try {
    if (typeof MP_OPEN_SHEET_GET === 'function') {
      var sheetHit = MP_OPEN_SHEET_GET(cacheKey);
      if (sheetHit && typeof sheetHit === 'object') {
        if (!_mp_open_cacheShapeOk_(sheetHit)) {
          _mp_open_logShapeReject_(logKey, 'sheet', sheetHit, 'SHAPE_OR_SCHEMA_MISMATCH');
        } else {
          sheetHit.__cacheHit = true;
          sheetHit.__cacheTier = 'sheet';
          sheetHit.__openRouteKey = cacheKey;
          // Promote to script cache so subsequent calls in same 5-min window hit the fast tier.
          try {
            var copyForPromote = {};
            for (var k in sheetHit) if (Object.prototype.hasOwnProperty.call(sheetHit,k)) copyForPromote[k] = sheetHit[k];
            delete copyForPromote.__cacheHit;
            delete copyForPromote.__cacheTier;
            delete copyForPromote.__openRouteKey;
            delete copyForPromote.__openRouteLabel;
            CacheService.getScriptCache().put(_mp_open_cacheKey_(cacheKey), JSON.stringify(copyForPromote), 300);
          } catch(_pe){}
          return sheetHit;
        }
      } else {
        _mp_open_logCacheMiss_(logKey, 'sheet', 'KEY_MISS');
      }
    }
  } catch(e2){
    _mp_open_logCacheMiss_(logKey, 'sheet', 'READ_ERROR: ' + (e2 && e2.message ? e2.message : e2));
  }
  return null;
}

function _mp_open_cachePut_(auditId, payload, opts) {
  opts = opts || {};
  var cacheKey = String((opts.cacheKey || auditId) || '').trim();
  var baseAuditId = String((opts.auditId || (payload && payload.audit && payload.audit.auditId) || auditId) || '').trim();
  var routeLabel = String(opts.routeLabel || '').trim();

  try {
    if (!payload || payload.success !== true) return false;

    // Strip transient flags before storing
    var copy = {};
    for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload,k)) copy[k] = payload[k];
    delete copy.__cacheHit;
    delete copy.__cacheTier;
    delete copy.__openRouteKey;
    delete copy.__openRouteLabel;
    copy.__openCacheSchema = Number(MP_OPEN_FAST_V5_CACHE_SCHEMA || 1);
    copy.__auditorScopeGeneration = _mp_open_auditorScopeGeneration_();
    copy.__openCacheBuild = 'ManagerPlanningBackend_CORE_SPLIT_d48_3S_OPEN_CACHE_R5_20260702';
    if (routeLabel) copy.__openRouteLabel = routeLabel;

    var serialized = JSON.stringify(copy);

    // Tier 1: script cache (GATE B+ — TTL 300s)
    try {
      CacheService.getScriptCache().put(_mp_open_cacheKey_(cacheKey), serialized, 300);
      if (baseAuditId && cacheKey !== baseAuditId) _mp_open_routeRegistryAdd_(baseAuditId, cacheKey);
    } catch(_se){
      Logger.log('[V5][PATCHC] open cache put (script) failed: ' + _se);
    }

    // Tier 2: sheet cache is base-route only unless explicitly allowed.
    // Locked auditor routes stay Tier-1-only.
    if (opts.allowTier2 !== false && cacheKey === baseAuditId) {
      try {
        if (typeof MP_OPEN_SHEET_PUT === 'function') {
          MP_OPEN_SHEET_PUT(cacheKey, copy);
        }
      } catch(_he){
        Logger.log('[V5][GATE C] open cache put (sheet) failed: ' + _he);
      }
    }

    return true;
  } catch(e){
    Logger.log('[V5][PATCHC] open cache put failed: ' + e);
    return false;
  }
}

function _mp_open_cacheInvalidate_(auditId, opts) {
  // d36: auditId-driven invalidation purges base key plus any registered
  // locked-auditor route keys. CacheService has no prefix/list API, so route
  // variants are tracked in MP_OPEN_FAST_V5_ROUTES::<auditId>.
  opts = opts || {};
  auditId = String(auditId || '').trim();
  if (!auditId) return { success:false, auditId:auditId, routesPurged:0, basePurged:false, message:'Missing auditId' };

  var routes = _mp_open_routeRegistryGet_(auditId);
  var purged = 0;

  // Tier 1: script cache base route
  try {
    CacheService.getScriptCache().remove(_mp_open_cacheKey_(auditId));
  } catch(eBase) {}
  var basePurged = true;

  // Tier 1: registered route variants
  for (var i = 0; i < routes.length; i++) {
    try {
      CacheService.getScriptCache().remove(_mp_open_cacheKey_(routes[i]));
      purged++;
    } catch(eRoute) {}
  }
  _mp_open_routeRegistryClear_(auditId);

  if (!opts.lite) {
    // Tier 2: sheet cache base route only. Route variants are Tier-1-only.
    try {
      if (typeof MP_OPEN_SHEET_INVALIDATE === 'function') {
        MP_OPEN_SHEET_INVALIDATE(auditId);
      }
    } catch(e2){
      Logger.log('[V5][GATE C] open cache invalidate (sheet) failed: ' + e2);
    }
  }

  try {
    Logger.log('[D36_OPEN_CACHE_INVALIDATE] ' + JSON.stringify({
      auditId: auditId,
      lite: !!opts.lite,
      basePurged: basePurged,
      routesPurged: purged,
      routeKeys: routes
    }));
  } catch(_eLog) {}

  return { success:true, auditId:auditId, lite:!!opts.lite, basePurged:basePurged, routesPurged:purged };
}


/**
 * TOOLKIT WINDOW MONTHS — 2026-05-01
 * Calendar availability for the Planning Toolkit is audit-window driven.
 * Loads start at Planning Window From and are capped at four calendar months.
 * Never defaults to today's month for toolkit calendar bootstrap.
 */
function _mp_toolkitMonthKeyFromIso_(iso) {
  iso = String(iso || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(iso)) return iso;
  return '';
}

function _mp_toolkitAddMonthsKey_(monthKey, add) {
  monthKey = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return '';
  var p = monthKey.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1 + Number(add || 0), 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

function _mp_toolkitMonthKeysForWindow_(win, maxMonths) {
  maxMonths = Number(maxMonths || 4);
  if (!isFinite(maxMonths) || maxMonths < 1) maxMonths = 4;
  if (maxMonths > 4) maxMonths = 4;

  var startKey = _mp_toolkitMonthKeyFromIso_(win && win.startDate);
  var endKey = _mp_toolkitMonthKeyFromIso_(win && win.endDate);
  var out = [];
  if (!startKey) return out;

  var cursor = startKey;
  while (cursor && out.length < maxMonths) {
    out.push(cursor);
    if (endKey && cursor >= endKey) break;
    cursor = _mp_toolkitAddMonthsKey_(cursor, 1);
  }
  return out;
}

function _mp_toolkitFirstMonthKeyForWindow_(win, fallbackMonthKey) {
  var keys = _mp_toolkitMonthKeysForWindow_(win, 4);
  if (keys.length) return keys[0];
  fallbackMonthKey = String(fallbackMonthKey || '').trim();
  return /^\d{4}-\d{2}$/.test(fallbackMonthKey) ? fallbackMonthKey : '';
}

function getToolkitOpenFastV5(auditId, monthKey, opts) {
  var __t0 = Date.now();
  var __stages = [];
  var __d34ExecId = '';
  try { __d34ExecId = Utilities.getUuid(); } catch(_eD34Uuid) { __d34ExecId = 'D34_' + String(Date.now()); }
  function __stage(name) {
    __stages.push({ name: name, ms: Date.now() - __t0 });
  }

  // d48_OPEN_ROUTE_INSTRUMENTATION
  // Measurement only. No behavior changes, no cache-key changes, no month-switch changes.
  var __d48 = {
    build: 'd48_OPEN_ROUTE_INSTRUMENTATION_20260518',
    auditId: String(auditId || '').trim(),
    openRouteMode: '',
    cacheHit: false,
    withCalendar: false,
    forceFresh: false,
    startedAt: new Date().toISOString(),
    stages: {},
    counters: {},
    responseBytesEstimate: null,
    firstMonthBytesEstimate: null,
    serverMs: 0
  };
  function __d48_log_(event, payload) {
    try {
      payload = payload || {};
      payload.event = event;
      payload.build = __d48.build;
      payload.auditId = String(auditId || __d48.auditId || '').trim();
      payload.serverMsSoFar = Date.now() - __t0;
      Logger.log('[d48_OPEN_ROUTE] ' + JSON.stringify(payload));
    } catch(_eD48Log) {}
  }
  function __d48_len_(obj) {
    try { return JSON.stringify(obj).length; } catch(_eD48Len) { return null; }
  }

  opts = opts || {};
  var __openRole = String(opts.role || '').trim().toUpperCase();
  var __openLockedAuditor = String(opts.lockedAuditorEmail || '').trim();
  __d48.withCalendar = !!opts.withCalendar;
  __d48.forceFresh = !!opts.forceFresh;
  __d48.openRouteMode = (__openRole === 'AUDITOR' && !!__openLockedAuditor) ? 'lockedAuditor' : ((__openRole === 'MANAGER') ? 'manager' : 'base');
  // d15: gate relaxed. firstMonth-emit at line ~5211 still self-gates on
  // defaultAuditorEmail being non-empty. Manager toolkit WITHOUT preassigned
  // → defaultAuditorEmail='' → no firstMonth (server-side no-op).
  // Manager toolkit WITH preassigned auditor → defaultAuditorEmail set at
  // line ~5199 → firstMonth bundled. UI applier short-circuits render until
  // managerCalendarLoaded=true; meanwhile payload is stashed in
  // monthRenderCache so the Load Calendar click is instant (saves 1 RT).
  var withCalendar = !!opts.withCalendar;
  var forceFresh = !!opts.forceFresh;
  try {
    Logger.log('[D34_RUNTIME] ' + JSON.stringify({
      phase: 'OPEN_START',
      execId: __d34ExecId,
      auditId: String(auditId || '').trim(),
      role: __openRole,
      lockedAuditorEmailPresent: !!__openLockedAuditor,
      withCalendar: withCalendar,
      forceFresh: forceFresh,
      startedAt: new Date().toISOString()
    }));
  } catch(_eD34RuntimeStart) {}

  try {
    auditId = String(auditId || '').trim();
    if (!auditId) return { success:false, message:'Missing auditId' };

    monthKey = String(monthKey || '').trim();
    // Do not default to today's month here. Toolkit calendar month is derived
    // from the audit planning window after the audit row is read.

    var __isLockedAuditorRouteForOpen = (__openRole === 'AUDITOR' && !!__openLockedAuditor);
    var __openRouteKey = _mp_open_routeCacheKey_(auditId, __openRole, __openLockedAuditor);
    var __openRouteLabel = __isLockedAuditorRouteForOpen ? ('LOCKED_AUDITOR_ROUTE|' + V5_normalizeEmail_(__openLockedAuditor || '')) : 'BASE';

    // CACHE CHECK
    // d36: locked auditor route uses a route-aware ScriptCache key instead of bypassing cache.
    // Manager/default route remains auditId-only and can still use Tier-2 sheet cache.
    if (!forceFresh) {
      var cached = _mp_open_cacheGet_(auditId, {
        cacheKey: __openRouteKey,
        routeLabel: __openRouteLabel,
        allowTier2: !__isLockedAuditorRouteForOpen
      });
      if (cached) {
        __stage(__isLockedAuditorRouteForOpen ? 'cacheHit[LOCKED_AUDITOR_ROUTE]' : 'cacheHit');
        cached.__diag = cached.__diag || {};
        cached.__diag.stages = __stages;
        cached.__diag.fromCache = true;
        cached.__diag.stageMode = 'D36_ROUTE_AWARE_OPEN_CACHE';
        cached.__serverMs = Date.now() - __t0;
        // If withCalendar and cache has firstMonth for this month, return as-is.
        // If withCalendar but firstMonth is for a different month or missing,
        // augment with a fresh calendar fetch (still saves the lite work).
        if (withCalendar) {
          var cachedWindowMonthKey = _mp_toolkitFirstMonthKeyForWindow_(cached.window || {}, monthKey);
          if (cachedWindowMonthKey) monthKey = cachedWindowMonthKey;
          var hasFM = cached.firstMonth && cached.firstMonth.monthKey === monthKey;
          if (!hasFM && cached.defaultAuditorEmail && monthKey) {
            var tCal = Date.now();
            try {
              var calRes = getToolkitAvailabilityMonthDirectV5(cached.defaultAuditorEmail, monthKey, {});
              cached.firstMonth = { monthKey: monthKey, payload: calRes };
            } catch(eC) {
              cached.firstMonth = null;
              cached.__diag.firstMonthError = String(eC && eC.message || eC);
            }
            __stages.push({ name: 'augmentCalendar', ms: Date.now() - tCal });
          }
        }
        __d48.cacheHit = true;
        __d48.serverMs = Date.now() - __t0;
        __d48.stages.cacheHit = {
          durationMs: __d48.serverMs,
          routeLabel: __openRouteLabel,
          withCalendar: withCalendar,
          firstMonthPresent: !!(cached && cached.firstMonth),
          responseBytesEstimate: __d48_len_(cached)
        };
        __d48_log_('CACHE_HIT_RETURN', __d48);
        return cached;
      }
    }
    __stage(__isLockedAuditorRouteForOpen ? 'cacheCheck[LOCKED_AUDITOR_ROUTE]' : 'cacheCheck');
    __d48.stages.cacheCheck = { durationMs: Date.now() - __t0, routeLabel: __openRouteLabel, cacheHit: false };

    __mp_resetExecCache_();
    __stage('resetExecCache');

    var ss = SpreadsheetApp.getActive();

    // ---- STAGE: read Audit planning ----
    // GATE Q (20260502): switched from per-exec __mp_getSheetDataCached_
    // to persist-cached __mp_getSheetDataPersistCached_. Audit planning
    // saves call __mp_invalidatePersistCaches_(['Audit planning']) (see
    // line ~1488), so persist-served data is freshness-bound. With
    // MpCacheWarmer keeping the persist key hot, this read drops from
    // ~400ms cold to ~50-80ms (CacheService roundtrip + JSON.parse).
    //
    // δ12 (2026-05-03): D2-light targeted single-row fetch.
    // Replaces full-sheet read + linear findRow scan with a cached
    // rowByAuditId index + 1 getRange single-row read. Fixes the
    // δ10 POST-AUDIT bottleneck: AP payload (~1MB JSON) cannot fit
    // CacheService 90KB cap, so __mp_getSheetDataPersistCached_ was
    // ALWAYS falling through to COLD_SHEET_READ (~250-1100ms wall).
    // See AuditPlanningRowIndexCache_d12.js for cache + invalidation
    // contract. Legacy fallback retained below for safety / partial
    // deploys (e.g. row-index file not yet pushed via clasp).
    var sh, hdr, data, row, rowIndex;
    var __d34ApStart = Date.now();
    var __d34ApMode = '';
    var __d34ApCacheHit = false;
    var __d34ApRowFunctionAvailable = (typeof __mp_getAuditPlanningRow_ === 'function');
    var __apRow = __d34ApRowFunctionAvailable
      ? __mp_getAuditPlanningRow_(ss, auditId)
      : null;
    if (__apRow && __apRow.sh && __apRow.row) {
      sh = __apRow.sh;
      hdr = __apRow.hdr || [];
      row = __apRow.row;
      rowIndex = __apRow.rowNumber;
      data = [hdr]; // back-compat shim: downstream reads only hdr+row.
      __d34ApMode = __apRow.indexFromCache ? 'ROW_INDEX_CACHE' : 'ROW_INDEX_DIRECT';
      __d34ApCacheHit = !!__apRow.indexFromCache;
      __stage(__apRow.indexFromCache ? 'readAuditPlanning_d15[CACHE]' : 'readAuditPlanning_d15');
    } else {
      // Fallback: legacy persist-wrapper path. Keeps system functional
      // when row-index file is absent or auditId is not yet indexed.
      __d34ApMode = 'PERSIST_FALLBACK';
      var __apPack = __mp_getSheetDataPersistCached_(ss, 'Audit planning', 300);
      __d34ApCacheHit = !!(__apPack && (__apPack.__cacheHit || __apPack.cacheHit || __apPack.fromCache || __apPack.source === 'CACHE' || __apPack.source === 'PERSIST_CACHE'));
      sh = __apPack.sh;
      if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };
      data = __apPack.data || [];
      hdr  = __apPack.hdr  || data[0] || [];
      row = null;
      rowIndex = -1;
      __stage('readAuditPlanning');
    }
    __d48.stages.readAuditPlanning_d15 = {
      durationMs: Date.now() - __d34ApStart,
      mode: __d34ApMode || 'UNKNOWN',
      cacheHit: __d34ApCacheHit,
      rowFunctionAvailable: __d34ApRowFunctionAvailable,
      rowFound: !!row,
      rowNumber: rowIndex || 0,
      headerCount: (hdr && hdr.length) ? hdr.length : 0,
      rowsRead: (data && data.length) ? Math.max(0, data.length - 1) : 0,
      rowCellsRead: (row && row.length) ? row.length : 0,
      bytesPayloadEstimate: __d48_len_({ hdr: hdr, row: row })
    };
    __d48_log_('STAGE_readAuditPlanning_d15', __d48.stages.readAuditPlanning_d15);

    try {
      Logger.log('[D34_AP_READ] ' + JSON.stringify({
        execId: __d34ExecId,
        auditId: auditId,
        mode: __d34ApMode || 'UNKNOWN',
        rowFunctionAvailable: __d34ApRowFunctionAvailable,
        cacheHit: __d34ApCacheHit,
        ms: Date.now() - __d34ApStart,
        rowFound: !!row,
        rowNumber: rowIndex || 0,
        headerCount: (hdr && hdr.length) ? hdr.length : 0,
        dataRowsInMemory: (data && data.length) ? Math.max(0, data.length - 1) : 0
      }));
    } catch(_eD34ApLog) {}

    function findIndex(names) {
      for (var i=0;i<hdr.length;i++) {
        var h = String(hdr[i]||'').toLowerCase();
        for (var j=0;j<names.length;j++) {
          if (h.indexOf(String(names[j]).toLowerCase()) >= 0) return i;
        }
      }
      return -1;
    }

    var colAI         = _mp_findCol_(hdr, ['Audit ID']);
    var colCompany    = _mp_findCol_(hdr, ['Company']);
    var colLocation   = _mp_findCol_(hdr, ['Location']);
    var colStatus     = _mp_findCol_(hdr, ['Status']);
    var colReqHours   = findIndex(['total audit time in hours','total time in hours','required hours','total hours']);
    var colPreAssign  = findIndex(['pre assigned auditor','pre-assigned auditor','preassigned auditor']);
    var colAssignedTo = (function(){
      for (var i = 0; i < hdr.length; i++) {
        var h = String(hdr[i] || '').trim().toLowerCase();
        if (h.indexOf('pre') >= 0) continue;
        if (h === 'assigned to' || h === 'assigned auditor' || h === 'assigned') return i;
      }
      return -1;
    })();
    if (colAssignedTo < 0) {
      for (var ci=0; ci<hdr.length; ci++) {
        var hh = String(hdr[ci]||'').trim().toLowerCase();
        if (!hh) continue;
        if (hh.indexOf('pre') >= 0 && hh.indexOf('auditor') >= 0) continue;
        if (hh === 'auditor' || hh === 'auditor email' || hh === 'auditor e-mail') { colAssignedTo = ci; break; }
        if (hh.indexOf('auditor') >= 0 && hh.indexOf('assigned') >= 0) { colAssignedTo = ci; break; }
      }
    }
    var colJson       = _mp_findCol_(hdr, ['Planning JSON']);
    var colCompanyUid = _mp_findCol_(hdr, ['Company_UID', 'Company UID', 'UID']);
    var colWillExpire = _mp_findCol_(hdr, ['Date - Will Expire','Date - will expire','Will Expire','Date - Will expire']);
    var colExtExpire  = _mp_findCol_(hdr, ['Extended Expiration Date','Extende Expiration Date','ExtendedExpiryDate','Extende ExpirationDate']);
    var colExtApplied = _mp_findCol_(hdr, ['Extension applied','Extension Applied','Extension_applied']);

    if (colAI < 0) return { success:false, message:"Missing 'Audit ID' column" };

    if (!row) {
      // Fallback path only: skinny index miss or row-index file absent.
      for (var r=1; r<data.length; r++) {
        if (String(data[r][colAI]) === auditId) { rowIndex = r+1; row = data[r]; break; }
      }
      if (!row) return { success:false, message:'Audit not found: '+auditId };
    }
    __stage('findRow');

    var requiredHours = 0;
    if (colReqHours >= 0) {
      var rh = row[colReqHours];
      if (typeof rh === 'number') requiredHours = rh;
      else if (rh !== null && rh !== '' && !isNaN(Number(rh))) requiredHours = Number(rh);
    }

    var preassigned = colPreAssign >= 0 ? row[colPreAssign] : '';
    var assignedTo  = colAssignedTo >= 0 ? row[colAssignedTo] : '';

    var existingBlocks = [];
    if (colJson >= 0 && row[colJson]) {
      try {
        var js = JSON.parse(row[colJson]);
        if (js && Array.isArray(js.blocks)) existingBlocks = js.blocks;
      } catch(e){}
    }

    // ---- STAGE: resolve planning window ----
    // d25 EXT RCA: cached planning-window resolution may be stale after EXT
    // apply/undo. Toolkit display and month selection must use persisted
    // Audit planning AS/AT when present. Cached resolver is fallback only.
    var __d48WinStart = Date.now();
    var fallbackWin = _mp_resolvePlanningWindowCached_(ss, hdr, row, auditId);
    var win = V5_resolvePlanningWindowFromAuditPlanningRow_(hdr, row, fallbackWin);
    var toolkitMonthKeys = _mp_toolkitMonthKeysForWindow_(win, 4);
    monthKey = _mp_toolkitFirstMonthKeyForWindow_(win, monthKey);
    __stage(win && win.mode === 'SHEET_AS_AT' ? 'resolvePlanningWindow_AS_AT' : (fallbackWin && fallbackWin.__cacheHit ? 'resolvePlanningWindow_d14[CACHE]' : 'resolvePlanningWindow_d14'));
    __d48.stages.resolvePlanningWindow = {
      durationMs: Date.now() - __d48WinStart,
      mode: win && win.mode ? win.mode : '',
      fallbackCacheHit: !!(fallbackWin && fallbackWin.__cacheHit),
      sheetAsAt: !!(win && win.mode === 'SHEET_AS_AT'),
      candidatesEvaluated: (win && win.scopeWindows && win.scopeWindows.length) ? win.scopeWindows.length : 0,
      toolkitMonthKeys: toolkitMonthKeys || [],
      selectedMonthKey: monthKey || '',
      warningsCount: (win && win.warnings && win.warnings.length) ? win.warnings.length : 0
    };
    __d48_log_('STAGE_resolvePlanningWindow', __d48.stages.resolvePlanningWindow);

    var __tScopeExtractD30 = Date.now();
    var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr, row);
    var __scopeExtractMsD30 = Date.now() - __tScopeExtractD30;
    try {
      Logger.log('[D30_SCOPE_EXTRACT] ' + JSON.stringify({
        auditId: auditId,
        ms: __scopeExtractMsD30,
        configScopesRead: !!(scopesRes && scopesRes.__configScopesRead === true),
        scopeCount: (scopesRes && scopesRes.scopes && scopesRes.scopes.length) ? scopesRes.scopes.length : 0
      }));
    } catch(_eScopeLogD30) {}
    __stage('extractScopes');

    var auditCompany = colCompany  >= 0 ? row[colCompany]  : '';
    var auditLoc     = colLocation >= 0 ? row[colLocation] : '';
    var companyUid   = colCompanyUid >= 0 ? row[colCompanyUid] : '';

    // ---- STAGE: company constraints (PATCH D: cached wrapper, 5min TTL) ----
    // d42 PROD FIX:
    // Locked-auditor toolkit route must NOT use the old minimal company stub.
    // That stub made Company / Contact / Constraints / Company Locations empty
    // in the Planning Toolkit and could also poison open-cache responses.
    // Companies/Locations_JSON remains the canonical company-location source.
    var companyConstraints = ManagerV5_mergeToolkitCompanyMeta_(_mp_companyConstraintsCached_(ss, auditCompany, auditLoc, companyUid), ss, auditCompany, auditLoc, companyUid);
    __stage(companyConstraints && companyConstraints.__cacheHit ? 'companyConstraints[CACHE]' : 'companyConstraints');

    // ---- STAGE: fast qualified auditors list (HARD qualification only; no rotation/log scans) ----
    // 1789 learning kept: toolkit open must stay lightweight.
    // Current safety kept: no basic/unqualified dropdown, Active=YES only, Role=auditor only.
    var auditors = [];
    var auditorEligibilityMeta = null;
    var defaultAuditorEmail = '';
    var defaultAuditorName = '';
    var managerFallbackEmail = '';
    var managerFallbackName = '';
    var isAuditorLockedOpen = (__openRole === 'AUDITOR' || !!__openLockedAuditor);
    var reqScopeNamesFast = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){
      return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
    }).filter(function(x){ return !!x; }) : [];

    function __pushAuditorOnce_(obj, flags) {
      obj = obj || {};
      flags = flags || {};
      var em = V5_normalizeEmail_(obj.email || '');
      var nm = String(obj.name || obj.email || '').trim();
      if (!em && !nm) return;
      for (var i=0; i<auditors.length; i++) {
        var a = auditors[i] || {};
        if ((em && V5_normalizeEmail_(a.email) === em) || (nm && String(a.name||'').trim().toLowerCase() === nm.toLowerCase())) {
          if (flags.isPreassigned) a.isPreassigned = true;
          if (flags.isSelected) a.isSelected = true;
          return;
        }
      }
      auditors.push({
        name: nm,
        email: em,
        blockedWeekdays: String(obj.blockedWeekdays || '').trim(),
        isPreassigned: !!flags.isPreassigned,
        isSelected: !!flags.isSelected,
        softBlockRotation: false,
        nearRotationLimit: false,
        ineligible: false,
        hardBlockQualification: false,
        ineligibleReason: '',
        qualifiedFast: !isAuditorLockedOpen,
        selectedOnly: !!isAuditorLockedOpen,
        rotationPending: !isAuditorLockedOpen
      });
    }

    function __resolveAuditorKeyFast_(rawKey, flags) {
      var key = String(rawKey || '').trim();
      if (!key) return null;
      var basic = _mp_lookupAuditorBasic_(ss, key);
      if (basic && basic.found) {
        __pushAuditorOnce_(basic, flags);
        return { email: V5_normalizeEmail_(basic.email || ''), name: String(basic.name || key).trim() };
      }
      if (key.indexOf('@') >= 0) {
        __pushAuditorOnce_({ name:key, email:key, blockedWeekdays:'' }, flags);
        return { email: V5_normalizeEmail_(key), name:key };
      }
      return null;
    }

    function __lockedAuditorHardQualificationCheck_(lockedEmail, requiredScopes) {
      var tQual = Date.now();
      lockedEmail = V5_normalizeEmail_(lockedEmail || '');
      var __scopeCanonicalCallsD30 = 0;
      var __scopeCanonicalTotalMsD30 = 0;
      function __canonScopeD30_(x) {
        var __tCanonD30 = Date.now();
        __scopeCanonicalCallsD30++;
        try { return _mp_scopeCanonicalForRotation_(ss, x); }
        catch(_eCanon) { return String(x || '').trim(); }
        finally { __scopeCanonicalTotalMsD30 += (Date.now() - __tCanonD30); }
      }
      requiredScopes = (requiredScopes || []).map(function(x) {
        return __canonScopeD30_(x);
      }).filter(function(x) { return !!String(x || '').trim(); });

      var out = {
        ok: false,
        found: false,
        active: false,
        roleOk: false,
        qualified: false,
        missingScopes: [],
        requiredScopes: requiredScopes.slice(),
        auditor: null,
        ms: 0,
        reason: ''
      };

      if (!lockedEmail) {
        out.reason = 'MISSING_LOCKED_AUDITOR_EMAIL';
        out.ms = Date.now() - tQual;
        return out;
      }
      if (typeof _mp_findHeaderIdxCI_ !== 'function' || typeof _mp_isYes_ !== 'function') {
        throw new Error('Missing Toolkit_Eligibility basic helpers for locked auditor qualification check');
      }

      var __tAudPackD30 = Date.now();
      var audPack = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
      var __auditorsReadMsD30 = Date.now() - __tAudPackD30;
      var __auditorsCacheHitD30 = !!(audPack && (audPack.__cacheHit || audPack.cacheHit || audPack.fromCache || audPack.source === 'CACHE' || audPack.source === 'PERSIST_CACHE'));
      if (!audPack || !audPack.sh) {
        out.reason = 'MISSING_AUDITORS_SHEET';
        out.ms = Date.now() - tQual;
        try {
          Logger.log('[D30_LOCKED_AUDITOR_QUAL] ' + JSON.stringify({
            auditId: auditId,
            ms: out.ms,
            auditorsCacheHit: __auditorsCacheHitD30,
            auditorsReadMs: __auditorsReadMsD30,
            scopeCanonicalCalls: __scopeCanonicalCallsD30,
            scopeCanonicalTotalMs: __scopeCanonicalTotalMsD30,
            ok: false,
            reason: out.reason
          }));
        } catch(_eQualLogMissingSheetD30) {}
        return out;
      }

      var audData = audPack.data || [];
      var audHdr = audPack.hdr || audData[0] || [];
      var idxName = _mp_findHeaderIdxCI_(audHdr, ['Name','Auditor','Auditor name']);
      var idxEmail = _mp_findHeaderIdxCI_(audHdr, ['E-mail','Email','E-mail address','Mail']);
      var idxActive = _mp_findHeaderIdxCI_(audHdr, ['Active','Is active']);
      var idxRole = _mp_findHeaderIdxCI_(audHdr, ['Role','Function']);
      var idxBW = _mp_findHeaderIdxCI_(audHdr, ['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);

      if (idxEmail < 0 || idxActive < 0 || idxRole < 0) {
        out.reason = 'AUDITORS_HEADERS_MISSING_EMAIL_ACTIVE_ROLE';
        out.ms = Date.now() - tQual;
        return out;
      }

      var qMap = {};
      var __tQMapD34 = Date.now();
      for (var qi = 0; qi < audHdr.length; qi++) {
        var raw = String(audHdr[qi] || '').trim();
        if (!raw) continue;
        qMap[raw] = qi;
        try {
          var canon = __canonScopeD30_(raw);
          if (canon) qMap[canon] = qi;
        } catch(_eQCanon) {}
      }
      var __qMapMsD34 = Date.now() - __tQMapD34;

      var matchedRow = null;
      var __tAudScanD34 = Date.now();
      var __audRowsScannedD34 = 0;
      for (var ar = 1; ar < audData.length; ar++) {
        __audRowsScannedD34++;
        var audRow = audData[ar] || [];
        var em = V5_normalizeEmail_(audRow[idxEmail] || '');
        if (em && em === lockedEmail) {
          matchedRow = audRow;
          break;
        }
      }
      var __audScanMsD34 = Date.now() - __tAudScanD34;

      if (!matchedRow) {
        out.reason = 'LOCKED_AUDITOR_NOT_FOUND';
        out.ms = Date.now() - tQual;
        return out;
      }

      out.found = true;
      var role = String(matchedRow[idxRole] || '').trim().toLowerCase();
      out.active = _mp_isYes_(matchedRow[idxActive]);
      out.roleOk = (role === 'auditor');
      var nm = idxName >= 0 ? String(matchedRow[idxName] || '').trim() : lockedEmail;
      out.auditor = {
        name: nm || lockedEmail,
        email: lockedEmail,
        blockedWeekdays: idxBW >= 0 ? String(matchedRow[idxBW] || '').trim() : ''
      };

      for (var rs = 0; rs < requiredScopes.length; rs++) {
        var sc = requiredScopes[rs];
        if (!qMap.hasOwnProperty(sc) || !_mp_isYes_(matchedRow[qMap[sc]])) {
          out.missingScopes.push(sc);
        }
      }

      out.qualified = out.missingScopes.length === 0;
      out.ok = !!(out.found && out.active && out.roleOk && out.qualified);
      if (!out.active) out.reason = 'LOCKED_AUDITOR_INACTIVE';
      else if (!out.roleOk) out.reason = 'LOCKED_USER_NOT_AUDITOR_ROLE';
      else if (!out.qualified) out.reason = 'LOCKED_AUDITOR_NOT_QUALIFIED';
      else out.reason = 'LOCKED_AUDITOR_HARD_QUALIFIED';
      out.ms = Date.now() - tQual;
      out.auditorsCacheHit = __auditorsCacheHitD30;
      out.auditorsReadMs = __auditorsReadMsD30;
      out.auditorsRows = audData && audData.length ? Math.max(0, audData.length - 1) : 0;
      out.auditorsRowsScanned = __audRowsScannedD34;
      out.auditorScanMs = __audScanMsD34;
      out.qMapMs = __qMapMsD34;
      out.qMapKeys = Object.keys(qMap || {}).length;
      out.scopeCanonicalCalls = __scopeCanonicalCallsD30;
      out.scopeCanonicalTotalMs = __scopeCanonicalTotalMsD30;
      try {
        Logger.log('[D30_LOCKED_AUDITOR_QUAL] ' + JSON.stringify({
          auditId: auditId,
          ms: out.ms,
          auditorsCacheHit: __auditorsCacheHitD30,
          auditorsReadMs: __auditorsReadMsD30,
          scopeCanonicalCalls: __scopeCanonicalCallsD30,
          scopeCanonicalTotalMs: __scopeCanonicalTotalMsD30,
          ok: out.ok,
          active: out.active,
          roleOk: out.roleOk,
          qualified: out.qualified,
          missingScopes: out.missingScopes,
          reason: out.reason
        }));
      } catch(_eQualLogD30) {}
      try {
        Logger.log('[D34_QUAL_PATH] ' + JSON.stringify({
          execId: __d34ExecId,
          auditId: auditId,
          lockedAuditorEmail: lockedEmail,
          ms: out.ms,
          auditorsCacheHit: __auditorsCacheHitD30,
          auditorsReadMs: __auditorsReadMsD30,
          auditorsRows: audData && audData.length ? Math.max(0, audData.length - 1) : 0,
          auditorsRowsScanned: __audRowsScannedD34,
          auditorScanMs: __audScanMsD34,
          scopeCanonicalCalls: __scopeCanonicalCallsD30,
          scopeCanonicalTotalMs: __scopeCanonicalTotalMsD30,
          qMapMs: __qMapMsD34,
          qMapKeys: Object.keys(qMap || {}).length,
          requiredScopes: requiredScopes,
          ok: out.ok,
          reason: out.reason
        }));
      } catch(_eD34QualLog) {}
      return out;
    }

    if (isAuditorLockedOpen) {
      var lockedKey = String(__openLockedAuditor || assignedTo || preassigned || '').trim();
      var lockedQual = __lockedAuditorHardQualificationCheck_(lockedKey, reqScopeNamesFast);

      if (lockedQual && lockedQual.auditor) {
        auditors = [{
          name: lockedQual.auditor.name || lockedKey,
          email: lockedQual.auditor.email || V5_normalizeEmail_(lockedKey),
          blockedWeekdays: String(lockedQual.auditor.blockedWeekdays || '').trim(),
          isPreassigned: false,
          isSelected: true,
          softBlockRotation: false,
          nearRotationLimit: false,
          ineligible: !lockedQual.ok,
          hardBlockQualification: !lockedQual.qualified,
          ineligibleReason: lockedQual.ok ? '' : lockedQual.reason,
          qualifiedFast: !!lockedQual.qualified,
          qualifiedCanonical: !!lockedQual.qualified,
          selectedOnly: true,
          rotationPending: false,
          lockedAuditorRoute: true
        }];
        defaultAuditorEmail = lockedQual.auditor.email || V5_normalizeEmail_(lockedKey);
        defaultAuditorName = lockedQual.auditor.name || lockedKey;
      } else {
        auditors = [];
      }

      auditorEligibilityMeta = {
        build: 'd30_LOCKED_AUDITOR_COMPANY_STUB_SCOPE_RCA',
        requiredScopes: reqScopeNamesFast,
        selectedOnly: true,
        lockedAuditorRoute: true,
        lockedAuditorEmail: V5_normalizeEmail_(lockedKey),
        hardQualificationChecked: true,
        hardQualificationOk: !!(lockedQual && lockedQual.ok),
        qualificationReason: lockedQual ? lockedQual.reason : 'LOCKED_QUALIFICATION_CHECK_NOT_RUN',
        missingScopes: lockedQual && lockedQual.missingScopes ? lockedQual.missingScopes.slice() : [],
        rotationPending: false,
        fullEligibilitySkipped: true,
        rotationSkipped: true,
        logIndexSkipped: true,
        aliasMapSkipped: true,
        companyConstraintsSkipped: false,
        companyConstraintsSkipReason: '',
        lockedQualificationMs: lockedQual ? lockedQual.ms : null
      };

      __stage('lockedAuditorHardQualificationCheck');
      __d48.stages.lockedAuditorHardQualificationCheck = {
        durationMs: lockedQual ? lockedQual.ms : null,
        rowsScanned: lockedQual && lockedQual.auditorsRowsScanned != null ? lockedQual.auditorsRowsScanned : null,
        rowsAvailable: lockedQual && lockedQual.auditorsRows != null ? lockedQual.auditorsRows : null,
        filterIterations: lockedQual && lockedQual.scopeCanonicalCalls != null ? lockedQual.scopeCanonicalCalls : null,
        auditorsReadMs: lockedQual && lockedQual.auditorsReadMs != null ? lockedQual.auditorsReadMs : null,
        auditorsCacheHit: !!(lockedQual && lockedQual.auditorsCacheHit),
        qMapMs: lockedQual && lockedQual.qMapMs != null ? lockedQual.qMapMs : null,
        qMapKeys: lockedQual && lockedQual.qMapKeys != null ? lockedQual.qMapKeys : null,
        exitReason: lockedQual ? lockedQual.reason : 'LOCKED_QUALIFICATION_CHECK_NOT_RUN',
        ok: !!(lockedQual && lockedQual.ok)
      };
      __d48_log_('STAGE_lockedAuditorHardQualificationCheck', __d48.stages.lockedAuditorHardQualificationCheck);
      Logger.log('[D30_LOCKED_AUDITOR_OPEN] ' + JSON.stringify({
        auditId: auditId,
        LOCKED_AUDITOR_ROUTE: true,
        lockedAuditorEmail: V5_normalizeEmail_(lockedKey),
        auditorsReturned: auditors.length,
        hardQualificationChecked: true,
        hardQualificationOk: !!(lockedQual && lockedQual.ok),
        qualificationReason: lockedQual ? lockedQual.reason : '',
        requiredScopes: reqScopeNamesFast,
        fullEligibilitySkipped: true,
        rotationSkipped: true,
        logIndexSkipped: true,
        aliasMapSkipped: true,
        companyConstraintsSkipped: false,
        companyConstraintsSkipReason: '',
        lockedQualificationMs: lockedQual ? lockedQual.ms : null,
        serverMsSoFar: Date.now() - __t0
      }));
    } else {
      var __fastQualCached = _mp_fastOpenQualifiedCacheGet_(reqScopeNamesFast, preassigned);
      if (Array.isArray(__fastQualCached)) {
        auditors = __fastQualCached;
        auditorEligibilityMeta = { requiredScopes:reqScopeNamesFast, qualifiedFast:true, rotationPending:true, fastOpenQualifiedCacheHit:true };
        __stage('qualifiedAuditorsFast[CACHE]');
      } else {
        auditors = _mp_getQualifiedAuditorsFastList_(ss, reqScopeNamesFast, preassigned, { auditId: auditId });
        _mp_fastOpenQualifiedCachePut_(reqScopeNamesFast, preassigned, auditors);
        auditorEligibilityMeta = { requiredScopes:reqScopeNamesFast, qualifiedFast:true, rotationPending:true, fastOpenQualifiedCacheHit:false };
        __stage('qualifiedAuditorsFast');
      }

      // Manager: no auto-select-first. Only preserve an already assigned/preassigned auditor if still qualified.
      var desiredKey = String(assignedTo || preassigned || '').trim().toLowerCase();
      if (desiredKey) {
        for (var ai=0; ai<auditors.length; ai++) {
          var aa = auditors[ai] || {};
          var em = String(aa.email || '').trim().toLowerCase();
          var nm = String(aa.name || '').trim().toLowerCase();
          if ((em && em === desiredKey) || (nm && nm === desiredKey)) {
            defaultAuditorEmail = V5_normalizeEmail_(aa.email || '');
            defaultAuditorName = String(aa.name || aa.email || '').trim();
            aa.isSelected = true;
            break;
          }
        }
      }
    }

    companyConstraints = ManagerV5_applyToolkitAuditorBlockedWeekdays_(companyConstraints, ss, defaultAuditorEmail, defaultAuditorName || assignedTo || preassigned || __openLockedAuditor);

    // ---- STAGE: optional first-month calendar (inline, saves a roundtrip) ----
    var firstMonth = null;
    if (withCalendar && defaultAuditorEmail && /^\d{4}-\d{2}$/.test(monthKey)) {
      var __d48FirstMonthStart = Date.now();
      var __d48FirstMonthError = '';
      try {
        var calRes = getToolkitAvailabilityMonthDirectV5(defaultAuditorEmail, monthKey, {});
        firstMonth = { monthKey: monthKey, payload: calRes };
      } catch(eCal) {
        __d48FirstMonthError = String(eCal && eCal.message || eCal);
        firstMonth = { monthKey: monthKey, payload: null, error: __d48FirstMonthError };
      }
      __stage('firstMonthCalendar');
      __d48.firstMonthBytesEstimate = __d48_len_(firstMonth);
      __d48.stages.firstMonthCalendar = {
        durationMs: Date.now() - __d48FirstMonthStart,
        monthKey: monthKey || '',
        auditor: defaultAuditorEmail || '',
        cacheHit: !!(firstMonth && firstMonth.payload && (firstMonth.payload.__cacheHit || firstMonth.payload.cacheHit)),
        serverMs: firstMonth && firstMonth.payload ? (firstMonth.payload.__serverMs || firstMonth.payload.serverMs || null) : null,
        daysLoaded: firstMonth && firstMonth.payload && firstMonth.payload.dayState ? Object.keys(firstMonth.payload.dayState || {}).length : null,
        cellsRead: firstMonth && firstMonth.payload && firstMonth.payload.__diag ? (firstMonth.payload.__diag.cellsRead || null) : null,
        cacheAttempts: firstMonth && firstMonth.payload && firstMonth.payload.__diag ? (firstMonth.payload.__diag.cacheAttempts || null) : null,
        bytesPayloadEstimate: __d48.firstMonthBytesEstimate,
        error: __d48FirstMonthError
      };
      __d48_log_('STAGE_firstMonthCalendar', __d48.stages.firstMonthCalendar);
    }

    var result = {
      success: true,
      __lite: true,
      __cacheHit: false,
      __serverMs: Date.now() - __t0,
      __diag: { stages: __stages, fromCache: false, build:'CORE_SPLIT_d30_LOCKED_AUDITOR_COMPANY_STUB_SCOPE_RCA_20260516' },
      auditorsLoading: true,
      defaultAuditorEmail: defaultAuditorEmail,
      defaultAuditorName: defaultAuditorName,
      managerFallbackEmail: managerFallbackEmail,
      managerFallbackName: managerFallbackName,
      locationsCount: companyConstraints.locationsCount || 1,
      hqName: companyConstraints.hqName || 'HQ',
      hqGps: companyConstraints.hqGps || '',
      slotTemplates: companyConstraints.slotTemplates || null,
      audit: {
        auditId: auditId,
        companyUid: _mp_safeStr_(companyConstraints.companyUid || companyUid),
        company: auditCompany,
        location: auditLoc,
        scopes: (scopesRes && scopesRes.scopes) ? scopesRes.scopes : [],
        scopesText: (scopesRes && scopesRes.scopesText) ? scopesRes.scopesText : '',
        status: colStatus >= 0 ? row[colStatus] : '',
        requiredHours: requiredHours,
        preassignedAuditor: preassigned,
        assignedTo: assignedTo,
        preassignedAuditorEmail: defaultAuditorEmail,
        willExpireDate: (colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : '',
        extendedExpiryDate: (colExtExpire >= 0 && row[colExtExpire]) ? V5_formatDateISO_(row[colExtExpire]) : ((colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : ''),
        extensionApplied: (function(){
          var flag = (colExtApplied >= 0 && row[colExtApplied]) ? String(row[colExtApplied]).trim().toLowerCase() : '';
          if (flag === 'yes' || flag === 'true') return true;
          var y = (colWillExpire >= 0 && row[colWillExpire]) ? V5_formatDateISO_(row[colWillExpire]) : '';
          var z = (colExtExpire >= 0 && row[colExtExpire]) ? V5_formatDateISO_(row[colExtExpire]) : '';
          return (y && z && y !== z);
        })(),
        // GATE I (20260502): include extensionMonths so the UI can run the
        // pre-save expiry check entirely client-side using ctx.audit.* values
        // and skip the v5_getExpiryInfo roundtrip (~2.5s wall savings on save).
        extensionMonths: (function(){
          try { return Number(V5_getExtensionMonthsForAuditRow_(hdr, row) || 0); }
          catch(_e) { return 0; }
        })(),
        existingBlocks: existingBlocks
      },
      companyConstraints: companyConstraints,
      auditors: auditors,
      auditorEligibilityMeta: auditorEligibilityMeta,
      window: { startDate: win.startDate, endDate: win.endDate, mode: win.mode },
      warnings: win.warnings || [],
      scopeWindows: win.scopeWindows || [],
      activeScopes: win.activeScopes || [],
      toolkitMonthKeys: toolkitMonthKeys || [],
      firstMonthMonthKey: monthKey || '',
      firstMonth: firstMonth
    };

    // STORE TO CACHE
    // d36: route-aware cache. Locked auditor payload is isolated from manager/default payload.
    __d48.responseBytesEstimate = __d48_len_(result);
    __d48.serverMs = Date.now() - __t0;
    __d48.cacheHit = false;
    result.__d48OpenRouteInstrumentation = __d48;

    _mp_open_cachePut_(__openRouteKey, result, {
      auditId: auditId,
      cacheKey: __openRouteKey,
      routeLabel: __openRouteLabel,
      allowTier2: !isAuditorLockedOpen
    });
    __stage(isAuditorLockedOpen ? 'openCachePut[LOCKED_AUDITOR_ROUTE]' : 'openCachePut');

    __d48.stages.openCachePut = {
      durationMs: (__stages && __stages.length) ? (__stages[__stages.length - 1].ms) : null,
      routeLabel: __openRouteLabel,
      allowTier2: !isAuditorLockedOpen
    };
    __d48.serverMs = Date.now() - __t0;
    result.__d48OpenRouteInstrumentation = __d48;
    __d48_log_('SUMMARY', __d48);

    if (isAuditorLockedOpen) {
      try {
        Logger.log('[D30_LOCKED_AUDITOR_OPEN_DONE] ' + JSON.stringify({
          auditId: auditId,
          lockedAuditorEmail: defaultAuditorEmail || V5_normalizeEmail_(__openLockedAuditor || ''),
          auditorsReturned: auditors.length,
          serverMs: Date.now() - __t0,
          stages: __stages
        }));
      } catch(_eLogDone) {}
    }

    try {
      Logger.log('[D34_RUNTIME] ' + JSON.stringify({
        phase: 'OPEN_DONE',
        execId: __d34ExecId,
        auditId: auditId,
        role: __openRole,
        lockedAuditorRoute: __isLockedAuditorRouteForOpen,
        withCalendar: withCalendar,
        cacheHit: !!result.__cacheHit,
        firstMonthIncluded: !!result.firstMonth,
        serverMs: Date.now() - __t0,
        stages: __stages
      }));
    } catch(_eD34RuntimeDone) {}
    return result;

  } catch(e) {
    try {
      Logger.log('[D34_RUNTIME] ' + JSON.stringify({
        phase: 'OPEN_ERROR',
        execId: __d34ExecId,
        auditId: String(auditId || '').trim(),
        role: __openRole,
        lockedAuditorRoute: (__openRole === 'AUDITOR' && !!__openLockedAuditor),
        serverMs: Date.now() - __t0,
        error: String(e && e.message ? e.message : e),
        stages: __stages
      }));
    } catch(_eD34RuntimeErr) {}
    return { success:false, message: e.message, __diag: { stages: __stages } };
  }
}




/***********************************************************************
 * d43 TOOLKIT COMPANY META RESTORE
 * Purpose:
 * - The toolkit UI displays company master data from companyConstraints.
 * - _mp_companyConstraintsCached_ owns constraints/location enrichment, but
 *   does not consistently expose Companies master fields used in the left
 *   toolkit panel.
 * - This helper reads Companies directly and merges non-decision metadata only.
 * Source: Companies columns A:V, especially Number/Group/Region/Country,
 * contact fields, comments, GPS-data, Time zone and Locations_JSON.
 ***********************************************************************/
function ManagerV5_getCompanyMetaFromCompanies_(ss, company, loc, uid) {
  ss = ss || SpreadsheetApp.getActive();
  company = ManagerV5_str_(company);
  loc = ManagerV5_str_(loc);
  uid = ManagerV5_str_(uid);

  var out = {
    matched:false,
    companyUid:'',
    company:'',
    location:'',
    number:'',
    companyNumber:'',
    mpsNumber:'',
    mps_number:'',
    group:'',
    companyGroup:'',
    company_group:'',
    region:'',
    companyRegion:'',
    company_region:'',
    regionName:'',
    country:'',
    companyCountry:'',
    countryName:'',
    companyCountryName:'',
    contactName:'',
    contactPerson:'',
    contactperson:'',
    contactEmail:'',
    contactpersonEmail:'',
    contactperson_e_mail:'',
    contactPhone:'',
    contactTelephone:'',
    contact_phone:'',
    telephone:'',
    phone:'',
    contactpersonPhone:'',
    comments:'',
    comment:'',
    companyComment:'',
    preferredAuditMonths:'',
    preferred_audit_months:'',
    preferredAuditPeriod:'',
    preferred_audit_period:'',
    planningPreference:'',
    timeZone:'',
    timezone:'',
    gps:'',
    gpsData:'',
    hqGps:'',
    blockedWeekdays:'',
    timeWindow:'',
    locationsCount:1,
    locationsJson:'',
    locations:[],
    locationOptions:[]
  };

  function norm_(v) {
    return String(v == null ? '' : v)
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toLowerCase();
  }
  function key_(v) {
    return norm_(v).replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function val_(row, ix) {
    return ix >= 0 ? ManagerV5_str_(row[ix]) : '';
  }
  function col_(idx, names) {
    for (var i = 0; i < names.length; i++) {
      var k = ManagerV5_norm_(names[i]);
      if (idx.hasOwnProperty(k)) return idx[k];
    }
    return -1;
  }
  function first_(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = obj && obj[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }
  function normalizeLocations_(raw, fallbackLocation, fallbackGps, fallbackComment) {
    var arr = [];
    function pushLoc_(o, index) {
      o = o || {};
      var code = first_(o, ['code','Code','locationCode','location_code','type','Type']) || (index === 0 ? 'HQ' : String(index + 1));
      var name = first_(o, ['location','Location','name','Name','label','Label','address','Address']) || fallbackLocation || code;
      var gps = first_(o, ['gps','GPS','gpsData','GPS-data','gps_data','coordinates','Coordinates','latLng','latlng']) || fallbackGps || '';
      var comment = first_(o, ['comment','Comment','comments','Comments','note','Note']) || fallbackComment || '';
      arr.push({
        code: code,
        locationCode: code,
        location: name,
        name: name,
        gps: gps,
        gpsData: gps,
        comment: comment,
        comments: comment,
        mapUrl: gps ? ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(gps)) : ''
      });
    }
    try {
      if (raw) {
        var parsed = JSON.parse(String(raw));
        if (Array.isArray(parsed)) {
          for (var i = 0; i < parsed.length; i++) pushLoc_(parsed[i], i);
        } else if (parsed && typeof parsed === 'object') {
          var list = parsed.locations || parsed.Locations || parsed.items || parsed.sites || parsed.points || null;
          if (Array.isArray(list)) {
            for (var j = 0; j < list.length; j++) pushLoc_(list[j], j);
          } else {
            pushLoc_(parsed, 0);
          }
        }
      }
    } catch(e) {}
    if (!arr.length) pushLoc_({ code:'HQ', location:fallbackLocation || 'HQ', gps:fallbackGps || '', comment:fallbackComment || '' }, 0);
    return arr;
  }

  try {
    var pack = null;
    try {
      if (typeof __mp_getSheetDataCached_ === 'function') pack = __mp_getSheetDataCached_(ss, 'Companies');
    } catch(e0) {}
    if (!pack || !pack.sh) {
      var sh = ss.getSheetByName('Companies');
      if (!sh) return out;
      var data0 = sh.getDataRange().getValues();
      pack = { sh:sh, data:data0, hdr:data0[0] || [] };
    }

    var data = pack.data || [];
    var hdr = pack.hdr || data[0] || [];
    if (!data || data.length < 2) return out;

    var idx = {};
    for (var h = 0; h < hdr.length; h++) idx[ManagerV5_norm_(hdr[h])] = h;

    var cCompany = col_(idx, ['Company']);
    var cContact = col_(idx, ['Contactperson','Contact person','Contact name']);
    var cEmail = col_(idx, ['Contactperson e-mail','Contactperson email','Contact person e-mail','Contact email']);
    var cPhone = col_(idx, ['Contactperson phone','Contact person phone','Contactperson_phone','Telephone','Phone']);
    var cNumber = col_(idx, ['Number','Company number']);
    var cGroup = col_(idx, ['Group','Company group']);
    var cLocation = col_(idx, ['Location']);
    var cRegion = col_(idx, ['Region']);
    var cCountry = col_(idx, ['Country']);
    var cGps = col_(idx, ['GPS-data','GPS data','GPS','gps_data']);
    var cTz = col_(idx, ['Time zone','Timezone','time_zone']);
    var cComments = col_(idx, ['Comments','Comment']);
    var cDays = col_(idx, ['Audit planning limitations - days','Planning limitations days','audit_planning_limitations_days']);
    var cHours = col_(idx, ['Audit planning limitations - hours','Planning limitations hours','audit_planning_limitations_hours']);
    var cUid = col_(idx, ['Company_UID','Company UID','UID']);
    var cLocationsJson = col_(idx, ['Locations_JSON','Locations JSON','locations_json']);
    var cPreferred = col_(idx, ['Preferred audit months','Preferred audit period','Preferred audit_months','preferred_audit_months','Preferred audit period/months','Preferred audit periode','Preferred months']);

    // Canonical Companies layout fallback A:V. This prevents header-normalization
    // or stale placeholder payloads from leaving the toolkit panel half empty.
    if (cCompany < 0) cCompany = 0;       // A Company
    if (cContact < 0) cContact = 2;       // C Contactperson
    if (cEmail < 0) cEmail = 3;           // D Contactperson e-mail
    if (cPhone < 0) cPhone = 4;           // E Contactperson phone
    if (cNumber < 0) cNumber = 5;         // F Number
    if (cGroup < 0) cGroup = 6;           // G Group
    if (cLocation < 0) cLocation = 7;     // H Location
    if (cRegion < 0) cRegion = 8;         // I Region
    if (cCountry < 0) cCountry = 9;       // J Country
    if (cGps < 0) cGps = 10;              // K GPS-data
    if (cTz < 0) cTz = 11;                // L Time zone
    if (cComments < 0) cComments = 12;    // M Comments
    if (cDays < 0) cDays = 13;            // N Audit planning limitations - days
    if (cHours < 0) cHours = 14;          // O Audit planning limitations - hours
    if (cUid < 0) cUid = 19;              // T Company_UID
    if (cLocationsJson < 0) cLocationsJson = 21; // V Locations_JSON
    if (cPreferred < 0 && hdr.length >= 23) cPreferred = 22; // W Preferred audit months/period (post-MVP field)

    var wantUid = key_(uid);
    var wantCompany = key_(company);
    var wantLoc = key_(loc);
    var best = null;
    var bestScore = -1;

    function has_(row, ix) { return ix >= 0 && row && row[ix] !== null && row[ix] !== undefined && String(row[ix]).trim() !== ''; }
    function completeness_(row) {
      var cols = [cNumber, cGroup, cRegion, cCountry, cContact, cEmail, cPhone, cGps, cTz, cComments, cDays, cHours, cLocationsJson, cPreferred];
      var n = 0;
      for (var ci = 0; ci < cols.length; ci++) if (has_(row, cols[ci])) n++;
      return n;
    }

    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var rowUid = cUid >= 0 ? key_(row[cUid]) : '';
      var rowCompany = cCompany >= 0 ? key_(row[cCompany]) : '';
      var rowLoc = cLocation >= 0 ? key_(row[cLocation]) : '';
      var score = -1;
      if (wantUid && rowUid && rowUid === wantUid) score = 1000;
      else if (wantCompany && rowCompany && rowCompany === wantCompany && wantLoc && rowLoc && rowLoc === wantLoc) score = 800;
      else if (wantCompany && rowCompany && rowCompany === wantCompany) score = 600;
      else if (wantCompany && rowCompany && (rowCompany.indexOf(wantCompany) >= 0 || wantCompany.indexOf(rowCompany) >= 0)) score = 450;
      if (score < 0) continue;
      // Prefer the row that actually contains the master data shown by the toolkit.
      score += completeness_(row);
      if (has_(row, cLocationsJson)) score += 5;
      if (has_(row, cPreferred)) score += 5;
      if (score > bestScore) { best = row; bestScore = score; }
    }

    if (!best || bestScore < 0) return out;

    var number = val_(best, cNumber);
    var group = val_(best, cGroup);
    var region = val_(best, cRegion);
    var country = val_(best, cCountry);
    var contact = val_(best, cContact);
    var email = val_(best, cEmail);
    var phone = val_(best, cPhone);
    var comments = val_(best, cComments);
    var tz = val_(best, cTz);
    var gps = val_(best, cGps);
    var uidVal = val_(best, cUid);
    var compVal = val_(best, cCompany) || company;
    var locVal = val_(best, cLocation) || loc || 'HQ';
    var rawLocJson = val_(best, cLocationsJson);
    var preferred = val_(best, cPreferred);
    var locations = normalizeLocations_(rawLocJson, locVal || 'HQ', gps, comments);

    out.matched = true;
    out.companyUid = uidVal || uid;
    out.company = compVal;
    out.location = locVal;
    out.number = number;
    out.companyNumber = number;
    out.mpsNumber = number;
    out.mps_number = number;
    out.group = group;
    out.companyGroup = group;
    out.company_group = group;
    out.region = region;
    out.companyRegion = region;
    out.company_region = region;
    out.regionName = region;
    out.country = country;
    out.companyCountry = country;
    out.countryName = country;
    out.companyCountryName = country;
    out.contactName = contact;
    out.contactPerson = contact;
    out.contactperson = contact;
    out.contactEmail = email;
    out.contactpersonEmail = email;
    out.contactperson_e_mail = email;
    out.contactPhone = phone;
    out.contactTelephone = phone;
    out.contact_phone = phone;
    out.telephone = phone;
    out.phone = phone;
    out.contactpersonPhone = phone;
    out.comments = comments;
    out.comment = comments;
    out.companyComment = comments;
    out.preferredAuditMonths = preferred;
    out.preferred_audit_months = preferred;
    out.preferredAuditPeriod = preferred;
    out.preferred_audit_period = preferred;
    out.planningPreference = preferred;
    out.timeZone = tz;
    out.timezone = tz;
    out.gps = gps;
    out.gpsData = gps;
    out.hqGps = gps || (locations[0] && locations[0].gps) || '';
    out.blockedWeekdays = val_(best, cDays);
    out.timeWindow = val_(best, cHours);
    out.locationsJson = rawLocJson;
    out.locations = locations;
    out.locationOptions = locations;
    out.locationsCount = locations.length || 1;
    return out;
  } catch(e) {
    try { Logger.log('[D43_COMPANY_META_FAIL] ' + String(e && e.message ? e.message : e)); } catch(_eLog) {}
    return out;
  }
}



/***********************************************************************
 * d44 TOOLKIT AUDITOR BLOCKED WEEKDAYS RESTORE
 * Purpose:
 * - The toolkit constraint panel also needs the selected auditor default
 *   blocked weekdays from Auditors column P.
 * - Do not overwrite company blocked weekdays; keep these under auditor-specific
 *   keys so company constraints and auditor constraints remain separated.
 ***********************************************************************/
function ManagerV5_getAuditorBlockedWeekdaysFromAuditors_(ss, auditorEmail, auditorName) {
  ss = ss || SpreadsheetApp.getActive();
  auditorEmail = V5_normalizeEmail_(auditorEmail || '');
  auditorName = ManagerV5_str_(auditorName || '').toLowerCase();
  var out = { found:false, email:auditorEmail, name:auditorName, blockedWeekdays:'' };

  try {
    var pack = null;
    try {
      if (typeof __mp_getSheetDataPersistCached_ === 'function') pack = __mp_getSheetDataPersistCached_(ss, 'Auditors', 300);
    } catch(e0) {}
    if (!pack || !pack.sh) {
      var sh = ss.getSheetByName('Auditors');
      if (!sh) return out;
      var data0 = sh.getDataRange().getValues();
      pack = { sh:sh, data:data0, hdr:data0[0] || [] };
    }

    var data = pack.data || [];
    var hdr = pack.hdr || data[0] || [];
    if (!data || data.length < 2) return out;

    function idxCI_(names) {
      for (var i = 0; i < hdr.length; i++) {
        var h = String(hdr[i] || '').trim().toLowerCase();
        for (var j = 0; j < names.length; j++) {
          var n = String(names[j] || '').trim().toLowerCase();
          if (h === n) return i;
        }
      }
      return -1;
    }

    var idxName = idxCI_(['name','auditor','auditor name']);
    var idxEmail = idxCI_(['e-mail','email','e-mail address','mail','auditor email']);
    var idxBlocked = idxCI_(['blocked weekdays','blocked days','default unavailable','default unavailable weekdays']);
    if (idxBlocked < 0 && hdr.length >= 16) idxBlocked = 15; // Auditors!P canonical fallback
    if (idxEmail < 0 && idxName < 0) return out;

    for (var r = 1; r < data.length; r++) {
      var row = data[r] || [];
      var em = idxEmail >= 0 ? V5_normalizeEmail_(row[idxEmail] || '') : '';
      var nm = idxName >= 0 ? ManagerV5_str_(row[idxName] || '') : '';
      var nmKey = String(nm || '').trim().toLowerCase();
      var match = false;
      if (auditorEmail && em && em === auditorEmail) match = true;
      if (!match && auditorName && nmKey && nmKey === auditorName) match = true;
      if (!match) continue;
      out.found = true;
      out.email = em || auditorEmail;
      out.name = nm || auditorName;
      out.blockedWeekdays = idxBlocked >= 0 ? ManagerV5_str_(row[idxBlocked] || '') : '';
      return out;
    }
  } catch(e) {
    try { Logger.log('[D44_AUDITOR_P_FAIL] ' + String(e && e.message ? e.message : e)); } catch(_eLog) {}
  }
  return out;
}

function ManagerV5_applyToolkitAuditorBlockedWeekdays_(companyConstraints, ss, auditorEmail, auditorName) {
  companyConstraints = companyConstraints || {};
  var aud = ManagerV5_getAuditorBlockedWeekdaysFromAuditors_(ss, auditorEmail, auditorName);
  var bw = aud && aud.blockedWeekdays ? String(aud.blockedWeekdays || '').trim() : '';
  companyConstraints.auditorBlockedWeekdays = bw;
  companyConstraints.auditorDefaultBlockedWeekdays = bw;
  companyConstraints.auditorLessAvailableOn = bw;
  companyConstraints.auditorAvailabilityLimitationsDays = bw;
  companyConstraints.__d44AuditorBlockedWeekdaysMatched = !!(aud && aud.found);
  companyConstraints.__d44AuditorBlockedWeekdaysSource = bw ? 'Auditors!P' : '';
  return companyConstraints;
}

function ManagerV5_mergeToolkitCompanyMeta_(companyConstraints, ss, company, loc, uid) {
  companyConstraints = companyConstraints || {};
  var meta = ManagerV5_getCompanyMetaFromCompanies_(ss, company, loc, uid || companyConstraints.companyUid || '');
  if (!meta || !meta.matched) return companyConstraints;

  function isEmptyLike_(v) {
    var s = String(v == null ? '' : v).trim();
    return !s || s === '-' || s === '—';
  }
  function fill_(target, key, value) {
    if (value === undefined || value === null || String(value).trim() === '') return;
    // d48: visible toolkit contract. Companies is the display SSoT for these fields;
    // overwrite placeholders and stale cached aliases instead of preserving '-'.
    target[key] = value;
  }

  var keys = [
    'matched','companyUid','company','location','number','companyNumber','mpsNumber','mps_number','group','companyGroup','company_group','region','companyRegion','company_region','regionName','country','companyCountry','countryName','companyCountryName',
    'contactName','contactPerson','contactperson','contactEmail','contactpersonEmail','contactperson_e_mail','contactPhone','contactTelephone','contact_phone','telephone','phone','contactpersonPhone',
    'comments','comment','companyComment','preferredAuditMonths','preferred_audit_months','preferredAuditPeriod','preferred_audit_period','planningPreference','timeZone','timezone','gps','gpsData','hqGps','blockedWeekdays','timeWindow','locationsJson'
  ];
  for (var i = 0; i < keys.length; i++) fill_(companyConstraints, keys[i], meta[keys[i]]);

  if ((!companyConstraints.locations || !companyConstraints.locations.length) && meta.locations && meta.locations.length) companyConstraints.locations = meta.locations;
  if ((!companyConstraints.locationOptions || !companyConstraints.locationOptions.length) && meta.locationOptions && meta.locationOptions.length) companyConstraints.locationOptions = meta.locationOptions;
  if (!companyConstraints.locationsCount || Number(companyConstraints.locationsCount) <= 1) companyConstraints.locationsCount = meta.locationsCount || companyConstraints.locationsCount || 1;
  companyConstraints.__d43CompanyMetaMatched = true;
  return companyConstraints;
}

function RUN_TOOLKIT_COMPANY_META_DIAG(auditId) {
  auditId = ManagerV5_str_(auditId);
  if (!auditId) return { success:false, message:'Missing auditId' };
  var ctx = getToolkitOpenFastV5(auditId, '', { forceFresh:true });
  var cc = ctx && ctx.companyConstraints ? ctx.companyConstraints : {};
  var out = {
    success: !!(ctx && ctx.success),
    auditId: auditId,
    company: ctx && ctx.audit ? ctx.audit.company : '',
    companyUid: ctx && ctx.audit ? ctx.audit.companyUid : '',
    companyMetaMatched: !!cc.__d43CompanyMetaMatched,
    number: cc.number || cc.companyNumber || '',
    group: cc.group || cc.companyGroup || '',
    region: cc.region || cc.companyRegion || '',
    country: cc.country || cc.companyCountry || '',
    contactName: cc.contactName || cc.contactPerson || cc.contactperson || '',
    contactEmail: cc.contactEmail || cc.contactpersonEmail || '',
    contactPhone: cc.contactPhone || cc.contactpersonPhone || '',
    hqGps: cc.hqGps || cc.gps || cc.gpsData || '',
    comments: cc.companyComment || cc.comments || cc.comment || '',
    blockedWeekdays: cc.blockedWeekdays || '',
    auditorBlockedWeekdays: cc.auditorBlockedWeekdays || cc.auditorDefaultBlockedWeekdays || cc.auditorLessAvailableOn || '',
    auditorBlockedWeekdaysMatched: !!cc.__d44AuditorBlockedWeekdaysMatched,
    timeWindow: cc.timeWindow || '',
    locationsCount: cc.locationsCount || 0,
    locations: cc.locations || cc.locationOptions || []
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// ============================================================
// PATCH D - T11_PATCHD_20260427_HELPER_CACHE
// ============================================================
// Goal: Cut cold-open server time on the two heaviest helpers.
// Per-stage logs from PATCH C revealed:
//   companyConstraints  = 1119ms  (Companies sheet read)
//   auditorsBasic       =  709ms  (Auditors sheet read)
//   readAuditPlanning   =  803ms  (NOT cached - too hot)
//   resolvePlanningWindow= 505ms  (NOT cached - row-coupled)
//
// Two CacheService wrappers (5-min TTL):
//   _mp_companyConstraintsCached_(ss, company, loc, uid)
//   _mp_getAuditorsBasicListCached_(ss, preassignedName)
//
// Both transparently fall through to the existing helpers on
// cache miss. On cache hit, lookup is sub-50ms (CacheService
// roundtrip). The per-stage log will show the savings directly.
//
// IMPORTANT: getToolkitOpenFastV5 is patched to call the cached
// wrappers. The original helpers are UNCHANGED so anything else
// in the codebase that uses them gets the same behavior as
// before.
// ============================================================

function _mp_companyConstraintsCached_(ss, company, loc, uid) {
  // δ6 (2026-05-03): DUAL-KEY caching to fix MP_CC_V2 miss-rate.
  // ----------------------------------------------------------------
  // ROOT CAUSE (observed Case 1 cold open, 3001ms loss):
  //   Warmer iterates Companies sheet and writes MP_CC_V2::<uid>
  //   (because Companies row HAS uid). Reader is invoked from Audit-
  //   row context where uid may be EMPTY (legacy rows) or where the
  //   audit-row's company-name normalization differs slightly from
  //   Companies-row name. Reader builds key NM::<name>|<loc> → MISS,
  //   even though warmer pre-computed the constraint object.
  //
  // FIX:
  //   1. Build BOTH keys when both identifiers are present.
  //   2. On GET: try primary key first, then fallback key.
  //   3. On PUT after fresh compute: write to BOTH keys, using
  //      fresh.companyUid as the canonical UID (so callers passing
  //      uid='' but matching by name will populate the UID-key for
  //      future callers, and vice-versa).
  //   4. Add [CC_MISS] log so any remaining misses are diagnosable
  //      (fail-loud per AGENT_CONSTITUTION).
  var uidKey  = String(uid || '').trim();
  var nameKey = String(company || '').trim() + '|' + String(loc || '').trim();
  var hasUid  = !!uidKey;
  var hasName = nameKey !== '|' && nameKey.replace('|', '') !== '';
  var primaryKey  = hasUid  ? ('MP_CC_V2::' + uidKey)         : ('MP_CC_V2::NM::' + nameKey);
  var fallbackKey = hasUid && hasName ? ('MP_CC_V2::NM::' + nameKey) : '';

  // Tier 1: primary key
  try {
    var raw = CacheService.getScriptCache().get(primaryKey);
    if (raw) {
      var hit = JSON.parse(raw);
      if (hit && typeof hit === 'object') {
        hit.__cacheHit = true;
        hit.__cacheKey = primaryKey;
        return hit;
      }
    }
  } catch(e) {
    Logger.log('[V5][PATCHD] CC cache get(primary) failed: ' + e);
  }

  // Tier 2: fallback key (only when both identifiers known and they differ)
  if (fallbackKey) {
    try {
      var raw2 = CacheService.getScriptCache().get(fallbackKey);
      if (raw2) {
        var hit2 = JSON.parse(raw2);
        if (hit2 && typeof hit2 === 'object') {
          hit2.__cacheHit = true;
          hit2.__cacheKey = fallbackKey;
          // Self-heal: also write to primary so next call short-circuits at tier 1.
          try {
            var heal = JSON.stringify(hit2);
            if (heal.length < 95000) CacheService.getScriptCache().put(primaryKey, heal, 900);
          } catch(_eh) {}
          return hit2;
        }
      }
    } catch(e2) {
      Logger.log('[V5][PATCHD] CC cache get(fallback) failed: ' + e2);
    }
  }

  // Compute path — fail-loud diag so remaining misses are visible.
  Logger.log('[CC_MISS] uid=' + uidKey + ' name=' + String(company || '').trim() +
             ' loc=' + String(loc || '').trim() + ' tried=' + primaryKey +
             (fallbackKey ? ',' + fallbackKey : ''));

  var fresh = _mp_getCompanyConstraints_(ss, company, loc, uid);

  // Write to BOTH keys when derivable. Use fresh.companyUid to recover
  // the canonical UID-key when the caller passed uid=''.
  try {
    if (fresh && typeof fresh === 'object') {
      var payload = JSON.stringify(fresh);
      if (payload.length < 95000) {
        var canonUid = String((fresh.companyUid != null ? fresh.companyUid : '')).trim();
        var keysToWrite = {};
        keysToWrite[primaryKey] = true;
        if (fallbackKey) keysToWrite[fallbackKey] = true;
        if (canonUid) keysToWrite['MP_CC_V2::' + canonUid] = true;
        if (hasName)  keysToWrite['MP_CC_V2::NM::' + nameKey] = true;
        for (var k in keysToWrite) {
          if (Object.prototype.hasOwnProperty.call(keysToWrite, k)) {
            try { CacheService.getScriptCache().put(k, payload, 900); }
            catch(_ePut) { Logger.log('[V5][PATCHD] CC put failed key=' + k + ' err=' + _ePut); }
          }
        }
      } else {
        Logger.log('[V5][PATCHD] CC payload too large bytes=' + payload.length +
                   ' uid=' + uidKey + ' name=' + nameKey + ' (skipped all writes)');
      }
    }
  } catch(e) {
    Logger.log('[V5][PATCHD] CC cache put outer failed: ' + e);
  }
  return fresh;
}

function _mp_getAuditorsBasicListCached_(ss, preassignedName) {
  // Cache the LIST without per-call preassigned marking, then mark inline.
  // This way the cached entry serves all callers regardless of preassigned.
  var key = 'MP_AUDBASE_V1';
  var list = null;
  try {
    var raw = CacheService.getScriptCache().get(key);
    if (raw) list = JSON.parse(raw);
  } catch(e){
    Logger.log('[V5][PATCHD] AUDBASE cache get failed: ' + e);
  }
  if (!Array.isArray(list)) {
    // Pass empty preassigned so the cache value is preassigned-neutral
    list = _mp_getAuditorsBasicList_(ss, '') || [];
    try {
      var payload = JSON.stringify(list);
      if (payload.length < 95000) {
        CacheService.getScriptCache().put(key, payload, 300);
      }
    } catch(e){
      Logger.log('[V5][PATCHD] AUDBASE cache put failed: ' + e);
    }
  }
  // Return a SHALLOW COPY with isPreassigned re-evaluated for this caller.
  // Without the copy, mutations would pollute the cached object reference
  // (note: parsed JSON is already a fresh object, but defensive copy is
  // still cheaper than a re-parse on next call).
  var pre = String(preassignedName || '').trim().toLowerCase();
  var out = list.map(function(a){
    var copy = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a,k)) copy[k] = a[k];
    if (pre) {
      var nm = String(copy.name||'').trim().toLowerCase();
      var em = String(copy.email||'').trim().toLowerCase();
      copy.isPreassigned = (nm === pre || em === pre);
    } else {
      copy.isPreassigned = false;
    }
    return copy;
  });
  return out;
}

function _mp_invalidateCompanyConstraintsCache_(uid, company, loc) {
  try {
    var uidKey = String(uid || '').trim();
    var nameKey = String(company || '').trim() + '|' + String(loc || '').trim();
    var keys = [];
    if (uidKey) keys.push('MP_CC_V2::' + uidKey);
    if (nameKey.replace('|','')) keys.push('MP_CC_V2::NM::' + nameKey);
    if (keys.length) CacheService.getScriptCache().removeAll(keys);
  } catch(e){}
}

function _mp_invalidateAuditorsBasicCache_() {
  try { CacheService.getScriptCache().remove('MP_AUDBASE_V1'); } catch(e){}
}


// ============================================================
// PATCH E - T11_PATCHE_20260427_AUD_CACHE
// ============================================================
// Goal: Eliminate the second-biggest cold-open cost we observed
// in production logs:
//
//   getToolkitAuditorsV5 = 17185ms server (Barberet&Blanc, 2026-04-27)
//
// _mp_getEligibleAuditorsList_() is the heavy worker (rotation
// history per auditor + qualification per scope). It lives in
// another GAS file so we can't refactor it directly. Instead we
// add a CacheService response cache around the WHOLE
// getToolkitAuditorsV5 endpoint, mirroring the PATCH C pattern
// already used for getToolkitOpenFastV5.
//
// Cache properties:
//   - Key:  MP_AUD_V5::<auditId>
//   - TTL:  5 minutes (300s)
//   - Size: <100KB JSON (CacheService limit). Auditor lists in
//           production are well under that.
//   - Invalidation: saveManagerPlanning calls
//     _mp_aud_cacheInvalidate_(auditId) at start AND end of
//     write so concurrent / immediately-following hydrate calls
//     for that audit see fresh rotation counts.
//
// Result: re-open of the same audit within 5 minutes returns
// the heavy auditors hydrate in <500ms wall (~roundtrip floor)
// instead of 17s.
//
// First-cold-open of an audit is unchanged (cache miss). The
// underlying _mp_getEligibleAuditorsList_ still needs source-
// level optimization to bring first-open below 17s.
// ============================================================

function _mp_aud_cacheKey_(auditId) {
  return 'MP_AUD_V5::' + String(auditId || '').trim();
}

function _mp_aud_cacheGet_(auditId) {
  try {
    var raw = CacheService.getScriptCache().get(_mp_aud_cacheKey_(auditId));
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      obj.__cacheHit = true;
      return obj;
    }
  } catch(e){
    Logger.log('[V5][PATCHE] aud cache get failed: ' + e);
  }
  return null;
}

function _mp_aud_cachePut_(auditId, payload) {
  try {
    if (!payload || payload.success !== true) return false;
    var copy = {};
    for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload,k)) copy[k] = payload[k];
    delete copy.__cacheHit;
    delete copy.__serverMs; // recomputed on each return
    var json = JSON.stringify(copy);
    if (json.length > 95000) {
      Logger.log('[V5][PATCHE] aud cache skip put: payload ' + json.length + ' bytes exceeds 95KB safety cap');
      return false;
    }
    CacheService.getScriptCache().put(_mp_aud_cacheKey_(auditId), json, 300);
    return true;
  } catch(e){
    Logger.log('[V5][PATCHE] aud cache put failed: ' + e);
    return false;
  }
}

function _mp_aud_cacheInvalidate_(auditId) {
  try {
    CacheService.getScriptCache().remove(_mp_aud_cacheKey_(auditId));
  } catch(e){}
}


// === DIAGNOSTIC LOADERS (d19) ================================================
// Run these from the Apps Script editor to confirm extracted files are loaded
// in the runtime. They bypass deployment and only need a reload of the editor.
// =============================================================================

function TEST_PW_LOADED() {
  Logger.log('_mp_resolvePlanningWindowCached_: ' + typeof _mp_resolvePlanningWindowCached_);
  Logger.log('_mp_resolvePlanningWindow_: ' + typeof _mp_resolvePlanningWindow_);
  Logger.log('_mp_pw_cacheGet_: ' + typeof _mp_pw_cacheGet_);
  Logger.log('_mp_pw_cachePut_: ' + typeof _mp_pw_cachePut_);
}

function TEST_TDM_LOADED() {
  Logger.log('getToolkitAvailabilityMonthDirectV5: ' + typeof getToolkitAvailabilityMonthDirectV5);
  Logger.log('_mp_tdm_cacheGet_: ' + typeof _mp_tdm_cacheGet_);
  Logger.log('_mp_calInvalidateForAudit_: ' + typeof _mp_calInvalidateForAudit_);
}

function TEST_ELIG_LOADED() {
  Logger.log('_mp_getEligibleAuditorsList_: ' + typeof _mp_getEligibleAuditorsList_);
  Logger.log('_mp_getToolkitEligibleAuditorsForRow_: ' + typeof _mp_getToolkitEligibleAuditorsForRow_);
  Logger.log('_mp_buildLogIndexForCompany_: ' + typeof _mp_buildLogIndexForCompany_);
  Logger.log('_mp_assertAuditorQualifiedForPlanning_: ' + typeof _mp_assertAuditorQualifiedForPlanning_);
}


function RUN_TOOLKIT_QUALIFICATION_LIVE_DIAG(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { success:false, message:'Missing auditId' };
  var ss = SpreadsheetApp.getActive();
  var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
  var data = pack.data || [];
  var hdr = pack.hdr || data[0] || [];
  var colAI = _mp_findCol_(hdr, ['Audit ID']);
  var row = null;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][colAI] || '').trim() === auditId) { row = data[r]; break; }
  }
  if (!row) return { success:false, message:'Audit not found: ' + auditId };
  var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr, row);
  var reqScopeNames = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){
    return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
  }).filter(function(x){ return !!x; }) : [];
  var colPreAssign = _mp_findCol_(hdr, ['Preassigned auditor','Preassigned Auditor','Pre assigned auditor','Pre-assigned auditor']);
  var preassigned = colPreAssign >= 0 ? row[colPreAssign] : '';
  var fast = _mp_getQualifiedAuditorsFastList_(ss, reqScopeNames, preassigned, { auditId: auditId });
  var hyd = getToolkitAuditorsV5(auditId);
  var out = {
    success:true,
    build:'CORE_SPLIT_d34_3S_CANONICAL_ELIGIBILITY_20260514',
    auditId:auditId,
    requiredScopes:reqScopeNames,
    preassigned:preassigned,
    fastCount:fast.length,
    hydratedCount:(hyd && hyd.auditors) ? hyd.auditors.length : 0,
    fastAuditors:fast.map(function(a){ return a.email || a.name || ''; }),
    hydratedAuditors:(hyd && hyd.auditors ? hyd.auditors : []).map(function(a){ return a.email || a.name || ''; }),
    hydratedMeta:hyd && hyd.auditorEligibilityMeta ? hyd.auditorEligibilityMeta : {},
    equality:(fast.length === ((hyd && hyd.auditors) ? hyd.auditors.length : -1))
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * d49_HTML_BUNDLE_AUDIT
 * Measurement only. Manual runner; never called from runtime open path.
 * Audits final HtmlService output and inline bundle composition for ManagerPlanningUI_boot.
 */
function RUN_d49_HtmlBundleAudit() {
  var BUILD = 'd49_HTML_BUNDLE_AUDIT_20260518';
  var targetFile = 'ManagerPlanningUI_boot';
  var result = {
    build: BUILD,
    targetFile: targetFile,
    ok: false,
    generatedAt: new Date().toISOString(),
    totalHtmlBytes: null,
    partials: [],
    scriptBlocks: [],
    scriptBlockCount: 0,
    styleBlocks: [],
    styleBlockCount: 0,
    inlineEventHandlersCount: 0,
    errors: []
  };

  function byteLen_(s) {
    try { return Utilities.newBlob(String(s || '')).getBytes().length; }
    catch (e) { return String(s || '').length; }
  }

  function first80_(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function auditHtml_(html) {
    html = String(html || '');
    result.totalHtmlBytes = byteLen_(html);

    var scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    var sm;
    var si = 0;
    while ((sm = scriptRe.exec(html)) !== null) {
      var body = sm[1] || '';
      result.scriptBlocks.push({
        index: si,
        bytes: byteLen_(body),
        first80: first80_(body)
      });
      si++;
    }
    result.scriptBlockCount = result.scriptBlocks.length;

    var styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    var stm;
    var sti = 0;
    while ((stm = styleRe.exec(html)) !== null) {
      var sbody = stm[1] || '';
      result.styleBlocks.push({
        index: sti,
        bytes: byteLen_(sbody),
        first80: first80_(sbody)
      });
      sti++;
    }
    result.styleBlockCount = result.styleBlocks.length;

    var handlerRe = /\s(on[a-zA-Z]+)\s*=/g;
    var hm;
    var hc = 0;
    while ((hm = handlerRe.exec(html)) !== null) hc++;
    result.inlineEventHandlersCount = hc;
  }

  function include_(filename) {
    var rec = { name: filename, bytes: null, ok: false, error: '' };
    try {
      var content = HtmlService.createHtmlOutputFromFile(filename).getContent();
      rec.bytes = byteLen_(content);
      rec.ok = true;
      result.partials.push(rec);
      return content;
    } catch (e) {
      rec.error = String(e && e.message || e);
      result.partials.push(rec);
      return '<!-- d49 include failed: ' + filename + ' -->';
    }
  }

  try {
    var tpl = HtmlService.createTemplateFromFile(targetFile);
    tpl.include = include_;
    var html = tpl.evaluate().getContent();
    auditHtml_(html);
    result.ok = true;
  } catch (e) {
    result.errors.push('evaluate failed: ' + String(e && e.stack || e));
    try {
      var raw = HtmlService.createHtmlOutputFromFile(targetFile).getContent();
      auditHtml_(raw);
      result.ok = false;
      result.fallbackRawFileAudit = true;
    } catch (e2) {
      result.errors.push('raw file audit failed: ' + String(e2 && e2.stack || e2));
    }
  }

  result.largestScriptBlock = result.scriptBlocks.slice().sort(function(a, b) { return b.bytes - a.bytes; })[0] || null;
  result.largestStyleBlock = result.styleBlocks.slice().sort(function(a, b) { return b.bytes - a.bytes; })[0] || null;
  result.totalPartialBytes = result.partials.reduce(function(sum, p) { return sum + Number(p.bytes || 0); }, 0);

  Logger.log('d49_HTML_BUNDLE_AUDIT ' + JSON.stringify(result));
  return result;
}
