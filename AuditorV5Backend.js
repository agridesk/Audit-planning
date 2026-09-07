/** CONSOLIDATED_AUDITOR_STABLE_20260410_091500 */
/** BUILD: AUDITOR_V5_CENTRAL_AUDITOR_GRID_CACHE_DEPLOY_READY_C10_20260426 */
/********************************************************************
* AUDITOR BACKEND — V5.4 (patched 20260109_102951)
 * Koppelt ingelogde Google user aan audits via sheet "Auditors":
 *  - Auditors: naam → e-mail
 *  - Audit planning: "Assigned to" = naam
 *  - Planning JSON: auditorEmail wordt gebruikt als primair,
 *    maar als die leeg is, wordt e-mail via Auditors-sheet bepaald.
 ********************************************************************/
/**
 * Returns active user's email in the most reliable way available for this deployment.
 * Note: getActiveUser may be blank depending on domain/sharing settings.
 */
// ---------------------------
// Caching helpers (speed)
// ---------------------------
var AUDITOR_V5_TTL_GRID_SEC = 60;  // central AUDIT_CACHE auditor_grid TTL; invalidated explicitly after actions
var AUDITOR_V5_TTL_MAPS_SEC = 900;  // 15 min for auditor/company maps
// ---------------- SSOT (WebApp-safe) ----------------
// Script property: V5_SSOT_SPREADSHEET_ID
function auditorV5_getSs_() {
  var id = "";
  try { id = String(PropertiesService.getScriptProperties().getProperty("V5_SSOT_SPREADSHEET_ID") || "").trim(); } catch(e) {}
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  throw new Error("SSOT spreadsheet not configured. Set Script Property V5_SSOT_SPREADSHEET_ID");
}

function auditorV5_getTz_() {
  try {
    var ss = auditorV5_getSs_();
    if (ss && ss.getSpreadsheetTimeZone) {
      var tz = String(ss.getSpreadsheetTimeZone() || '').trim();
      if (tz) return tz;
    }
  } catch (e) {}
  return 'Europe/Paris';
}

function auditorV5_userCacheKey_(email, view) {
  return "AUD_V5_GRID|" + String(view||"") + "|" + String(email||"").toLowerCase();
}
function auditorV5_userCacheGet_(email, view) {
  email = String(email || '').trim().toLowerCase();
  view = String(view || 'active').trim().toLowerCase();

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.getAuditorGrid === 'function') {
      return AUDIT_CACHE.getAuditorGrid(email, view);
    }
  } catch (e0) {}

  // Migration fallback only if central AUDIT_CACHE helper is not deployed yet.
  try {
    var ttl = Number(AUDITOR_V5_TTL_GRID_SEC || 0);
    if (!(ttl > 0)) return null;
    var c = CacheService.getScriptCache();
    var raw = c.get(auditorV5_userCacheKey_(email, view));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function auditorV5_userCacheSet_(email, view, obj) {
  email = String(email || '').trim().toLowerCase();
  view = String(view || 'active').trim().toLowerCase();

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.putAuditorGrid === 'function') {
      AUDIT_CACHE.putAuditorGrid(
        email,
        view,
        obj || {},
        (AUDIT_CACHE.TTL && AUDIT_CACHE.TTL.AUDITOR_GRID) || AUDITOR_V5_TTL_GRID_SEC || 60
      );
      return;
    }
  } catch (e0) {}

  // Migration fallback only if central AUDIT_CACHE helper is not deployed yet.
  try {
    var ttl = Number(AUDITOR_V5_TTL_GRID_SEC || 0);
    if (!(ttl > 0)) return;
    var c = CacheService.getScriptCache();
    var s = JSON.stringify(obj || {});
    if (!s || s.length > 90000) return;
    c.put(auditorV5_userCacheKey_(email, view), s, ttl);
  } catch (e) {}
}
 function auditorV5_loadConfigScopes__LEGACY_DISABLED_() {
  // Rich loader for Config_Scopes (colors + display names) — aligns with AuditorPortalV5 UI contract.
  // Backward compatible: keeps returning { ordered:[...] } while also providing { list, bySlot, byCode }.
  if (AUDITOR_V5_SCOPES_CFG_CACHE_ && (AUDITOR_V5_SCOPES_CFG_CACHE_.list || AUDITOR_V5_SCOPES_CFG_CACHE_.ordered)) return AUDITOR_V5_SCOPES_CFG_CACHE_;
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Config_Scopes");
  if (!sh) {
    AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: [], list: [], bySlot: {}, byCode: {} };
    return AUDITOR_V5_SCOPES_CFG_CACHE_;
  }
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: [], list: [], bySlot: {}, byCode: {} };
    return AUDITOR_V5_SCOPES_CFG_CACHE_;
  }
  var headers = values[0].map(function(x){ return String(x||"").trim(); });
  var idx = {};
  for (var i=0;i<headers.length;i++) { if (headers[i]) idx[headers[i]] = i; }
  function cell_(row, name) {
    var c = idx[name];
    if (c == null) return "";
    return row[c];
  }
  function toBool_(v, defVal) {
    var s = String(v || "").trim().toLowerCase();
    if (!s) return !!defVal;
    return (s === "true" || s === "yes" || s === "1" || s === "y" || s === "active" || s === "x");
  }
  function toNum_(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  // Accept multiple possible column names for compatibility
  function pick_(row, names) {
    for (var k=0;k<names.length;k++) {
      var n = names[k];
      if (idx[n] != null) return cell_(row, n);
    }
    return "";
  }
  var list = [];
  for (var r=1;r<values.length;r++) {
    var row = values[r];
    var slotKey = String(pick_(row, ["SlotKey","Slot","Slot Key","SLOT"]) || "").trim();
    if (!slotKey) continue;
    var active = toBool_(pick_(row, ["Active","IsActive"]), true);
    if (!active) continue;
    var rec = {
      slotKey: slotKey,
      scopeCode: String(pick_(row, ["ScopeCode","Code","Scope Code"]) || "").trim() || slotKey,
      displayName: String(pick_(row, ["DisplayName","Name","Display name"]) || "").trim() || (String(pick_(row, ["ScopeCode","Code"]) || "").trim() || slotKey),
      color: String(pick_(row, ["Color","BgColor","Background","BackgroundColor"]) || "").trim(),
      textColor: String(pick_(row, ["TextColor","Text Color","FgColor","ForegroundColor"]) || "").trim(),
      sortOrder: toNum_(pick_(row, ["SortOrder","Sort Order","Order"])),
      archived: toBool_(pick_(row, ["Archived","IsArchived"]), false)
    };
    list.push(rec);
  }
  list.sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });
  var bySlot = {};
  var byCode = {};
  for (var j=0;j<list.length;j++) {
    bySlot[list[j].slotKey] = list[j];
    byCode[String(list[j].scopeCode || "").trim()] = list[j];
  }
  // Backward compatible alias
  var ordered = list.map(function(x){
    return {
      slotKey: x.slotKey,
      scopeCode: x.scopeCode,
      displayName: x.displayName,
      sortOrder: x.sortOrder,
      color: x.color,
      textColor: x.textColor,
      archived: x.archived
    };
  });
  AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: ordered, list: list, bySlot: bySlot, byCode: byCode };
  return AUDITOR_V5_SCOPES_CFG_CACHE_;
}
function auditorV5_invalidateUserGridCache_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return true;

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAuditorGrid === 'function') {
      AUDIT_CACHE.removeAuditorGrid(email);
    }
  } catch (e0) {}

  // Migration cleanup: remove old direct keys too, so stale pre-central cache cannot survive.
  try {
    var keyActive = auditorV5_userCacheKey_(email, 'active');
    var keyArchived = auditorV5_userCacheKey_(email, 'archived');
    try {
      var c1 = CacheService.getScriptCache();
      c1.remove(keyActive);
      c1.remove(keyArchived);
    } catch (e1) {}
    try {
      var c2 = CacheService.getUserCache();
      c2.remove(keyActive);
      c2.remove(keyArchived);
    } catch (e2) {}
  } catch (e) {}

  return true;
}

function AuditorV5_InvalidateGridCache() {
  // Optional endpoint (can be called after actions)
  var email = auditorV5_getActiveEmail_().trim().toLowerCase();
  if (email) auditorV5_invalidateUserGridCache_(email);
  return { success:true, cache:'AUDIT_CACHE.auditor_grid' };
}
function auditorV5_scriptCacheGetJson_(key) {
  try {
    var v = CacheService.getScriptCache().get(key);
    if (!v) return null;
    return JSON.parse(v);
  } catch (e) {
    return null;
  }
}
function auditorV5_scriptCachePutJson_(key, obj, ttlSec) {
  try {
    var s = JSON.stringify(obj || {});
    if (s.length > 90000) return;
    CacheService.getScriptCache().put(key, s, ttlSec || AUDITOR_V5_TTL_MAPS_SEC);
  } catch (e) {}
}
function auditorV5_cellToYmd_(v) {
  if (v === null || typeof v === 'undefined' || v === '') return '';
  var tz = auditorV5_getTz_();

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }

  var s = String(v || '').trim();
  if (!s) return '';

  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];

  if (/GMT|UTC|T\d{2}:\d{2}:\d{2}|^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s/.test(s)) {
    var d2 = new Date(s);
    if (!isNaN(d2.getTime())) return Utilities.formatDate(d2, tz, 'yyyy-MM-dd');
  }

  return '';
}
function auditorV5_formatDateYMD_(v) {
  try {
    return auditorV5_cellToYmd_(v);
  } catch (e) {
    return '';
  }
}
function auditorV5_getActiveEmail_() {
  var e1 = "";
  var e2 = "";
  try { e1 = String(Session.getActiveUser().getEmail() || ""); } catch (err) {}
  try { e2 = String(Session.getEffectiveUser().getEmail() || ""); } catch (err2) {}
  var email = (e1 || e2 || "").trim().toLowerCase();
  return email;
}
function AuditorV5_GetMyAudits() {
  try {
    var activeEmail = auditorV5_getActiveEmail_()
      .trim()
      .toLowerCase();
    if (!activeEmail) {
      return { success: false, message: "No active user email" };
    }
    var ss  = auditorV5_getSs_();
    var sh  = ss.getSheetByName("Audit planning");
    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'" };
    var data = sh.getDataRange().getValues();
    var hdr  = data[0];
    var idxAI       = hdr.indexOf("Audit ID");
    var idxStatus   = hdr.indexOf("Status");
    var idxJson     = hdr.indexOf("Planning JSON");
    var idxCompany  = hdr.indexOf("Company");
    var idxLocation = hdr.indexOf("Location");
    var idxAssigned = hdr.indexOf("Assigned to");
    var emailMap = buildAuditorEmailMapV54_(); // naam → e-mail (lowercase)
    var out = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      // STATUS FILTER (Option A)
      // Include "Pending Planning" as well as operational statuses.
      var statusRaw = String(row[idxStatus] || "").trim();
      var statusKey = (typeof Status_normalizeStatus_ === 'function') ? Status_normalizeStatus_(statusRaw) : statusRaw.toUpperCase().replace(/\s+/g, '_');
      var allowed =
        (statusKey === 'PENDING_PLANNING') ||
        (statusKey === 'PENDING_APPROVAL') ||
        (statusKey === 'APPROVED') ||
        (statusKey === 'ACCEPTED');
      if (!allowed) continue;
      // JSON is optional now (legacy may still exist).
      var js = null;
      var raw = row[idxJson];
      if (raw) {
        try { js = JSON.parse(raw); } catch (e) { js = null; }
      }
      // Determine auditor email for this row.
      // Priority:
      // 1) JSON auditorEmail (legacy)
      // 2) "Assigned to" if it already looks like an email
      // 3) Auditors mapping if "Assigned to" is a name
      var jsonEmail = (js && js.auditorEmail)
        ? String(js.auditorEmail).trim().toLowerCase()
        : "";
      var assignedCell = idxAssigned >= 0 ? row[idxAssigned] : "";
      var assignedKey = assignedCell ? String(assignedCell).trim().toLowerCase() : "";
      var assignedEmail = "";
      if (assignedKey && assignedKey.indexOf("@") > -1) {
        assignedEmail = assignedKey; // already an email
      } else if (assignedKey) {
        assignedEmail = emailMap[assignedKey] || ""; // name -> email
      }
      var rowEmail = jsonEmail || assignedEmail;
      if (!rowEmail) continue;
      if (rowEmail !== activeEmail) continue;
      out.push({
        auditId:  row[idxAI],
        company:  row[idxCompany],
        location: row[idxLocation],
        status:   statusRaw,
        planning: js
      });
    }
    return { success:true, audits:out };
  } catch (e) {
    return { success:false, message:e.message };
  }
}
/********************************************************************
 * SHARED HELPER — Auditors-sheet → naam→e-mail (lowercase)
 ********************************************************************/
function buildAuditorEmailMapV54_() {
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Auditors");
  var map = {};
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var hdr = data[0];
  function findIndex(names) {
    for (var i = 0; i < hdr.length; i++) {
      var h = String(hdr[i] || "").toLowerCase();
      for (var j = 0; j < names.length; j++) {
        if (h === names[j].toLowerCase()) return i;
      }
    }
    return -1;
  }
  var idxName  = findIndex(["Auditor", "Name", "Auditor name"]);
  var idxEmail = findIndex(["Email", "E-mail", "E-mail address"]);
  if (idxName < 0 || idxEmail < 0) return map;
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var name  = row[idxName];
    var email = row[idxEmail];
    if (!name || !email) continue;
    var key = String(name).trim().toLowerCase();
    map[key] = String(email).trim().toLowerCase();
  }
  return map;
}
/********************************************************************
 * NEW ENDPOINT — Single-grid Auditor Planning UI (Active + Archived)
 * - Active source: "Audit planning"
 * - Archived source: "Log realized audits"
 * - Archived definition (UI-side):
 *    Status = COMPLETED AND first planned day > 30 days ago
 * - Read-only rows enforced in UI by 'readOnly:true'
 ********************************************************************/
// --- Manager planning window constants (copied verbatim, consultation-only source) ---
var V5_AP_SHEET = "Audit planning";
var V5_H_AUDIT_ID = "Audit ID";
var V5_H_ASSIGNED_TO = "Assigned to";
var V5_H_STATUS = "Status";
var V5_H_EXPIRY_FINAL = "Extended Expiration Date";
var V5_STD_SHEET = "Standards";
var V5_STD_NAME = "Name";
var V5_STD_FROM = "Planning from";
var V5_STD_TO = "Planning to";
// Slots are included in the Manager context object; not needed for planningWindowText rendering here.
var V5_SLOTS = [];
// --- Manager planning window caches (Auditor backend local) ---
var _V5_CACHE_CTX = {};
var _V5_CACHE_PW_TEXT = {};
var _V5_CACHE_STD_WIN = null;
function _v5_indexMap_(headers){
  var m = {};
  for (var i = 0; i < headers.length; i++) m[headers[i]] = i;
  return m;
}
function _v5_parseDate_(v){
  var ymd = auditorV5_cellToYmd_(v);
  if (!ymd) return null;
  var m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function _v5_fmtDate_(d){
  return Utilities.formatDate(d, auditorV5_getTz_(), "yyyy-MM-dd");
}
function _v5_addMonths_(d, months){
  if (!d || Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) return null;

  var y = d.getFullYear();
  var m = d.getMonth();
  var day = d.getDate();

  var nd = new Date(y, m + Number(months || 0), 1);
  var last = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
  nd.setDate(Math.min(day, last));

  return new Date(nd.getFullYear(), nd.getMonth(), nd.getDate());
}
function _v5_loadStandardsWindowMap_(){
  if (_V5_CACHE_STD_WINDOW) return _V5_CACHE_STD_WINDOW;
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName(V5_STD_SHEET);
  if (!sh) throw new Error('Missing sheet: "' + V5_STD_SHEET + '"');
  var tz = auditorV5_getTz_();
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  if (v.length < 2) return {};
  var h = v[0].map(_v5_trim_);
  var idx = _v5_indexMap_(h);
  var map = {};
  for (var r = 1; r < v.length; r++){
    var row = v[r];
    var name = String(row[idx[V5_STD_NAME]] || "").trim();
    if (!name) continue;
    var fromM = Number(row[idx[V5_STD_FROM]] || 0);
    var toM = Number(row[idx[V5_STD_TO]] || 0);
    if (!isFinite(fromM) || !isFinite(toM)) continue;
    map[name] = { fromMonths: fromM, toMonths: toM };
  }
  _V5_CACHE_STD_WINDOW = map;
  return map;
}
function v5_extractApplicableScopes_(auditPlanningHeaders, auditPlanningRow) {
  // New slot-based extractor via Config_Scopes
  var cfg = v5_loadConfigScopes_();
  var bySlot = cfg.bySlot || {};
  var ordered = cfg.ordered || [];
  var headerIndex = {};
  for (var i = 0; i < auditPlanningHeaders.length; i++) {
    headerIndex[String(auditPlanningHeaders[i] || "").trim()] = i;
  }
  var scopes = [];
  // Prefer slot order from config (stable)
  if (ordered.length) {
    for (var j = 0; j < ordered.length; j++) {
      var rec = ordered[j];
      var col = headerIndex[rec.slotKey];
      if (col == null) continue;
      var v = String(auditPlanningRow[col] || "").trim().toLowerCase();
      if (v === "x") {
        // Return canonical codes for downstream Standards lookups.
        scopes.push(rec.scopeCode || rec.displayName || rec.slotKey);
      }
    }
    return scopes;
  }
  // Fallback if Config_Scopes missing/empty: keep old behavior (scope names as headers)
  var preferredOrder = [
    "MPS-ABC","MPS-GAP","MPS-SQ","GRASP",
    "Florimark Tracecert","Florimark GTP",
    "Scope 7","Scope 8"
  ];
  for (var jj = 0; jj < preferredOrder.length; jj++) {
    var h = preferredOrder[jj];
    var c = headerIndex[h];
    if (c == null) continue;
    var vv = String(auditPlanningRow[c] || "").trim().toLowerCase();
    if (vv === "x") scopes.push(h);
  }
  // If your sheet uses SCOPE_XX without config, fall back to reading any SCOPE_XX with x.
  for (var k = 0; k < auditPlanningHeaders.length; k++) {
    var hh = String(auditPlanningHeaders[k] || "").trim();
    if (!hh) continue;
    var vv2 = String(auditPlanningRow[k] || "").trim().toLowerCase();
    if (vv2 !== "x") continue;
    if (/^SCOPE_\d+$/i.test(hh)) {
      // try mapping if present
      var rec2 = bySlot[hh];
      scopes.push(rec2 ? (rec2.scopeCode || rec2.displayName || hh) : hh);
    }
  }
  return scopes;
}
function v5_formatPlanningWindowTextFromCtx_(ctx){
  if (!ctx) return '';
  // Prefer the enforced intersection if available and non-empty.
  if (ctx.intersection && ctx.intersection.start && ctx.intersection.end && !ctx.intersection.isEmpty) {
    return String(ctx.intersection.start) + " → " + String(ctx.intersection.end);
  }
  // If intersection is empty (scope rules conflict), still show the calculated bounds for visibility.
  if (ctx.intersection && ctx.intersection.start && ctx.intersection.end && ctx.intersection.isEmpty) {
    return String(ctx.intersection.start) + " → " + String(ctx.intersection.end) + " (conflict)";
  }
  // First-time or no scope rule match: show the render horizon used by the toolkit.
  if (ctx.renderStart && ctx.renderEnd) {
    return String(ctx.renderStart) + " → " + String(ctx.renderEnd);
  }
  return '';
}
function v5_resolvePlanningContext(auditId, auditorEmailOpt) {
  auditId = String(auditId || '').trim();
  if (!auditId) throw new Error('Missing auditId');
  // PERF: cache Audit planning sheet read + row lookup for this execution
  if (!_V5_CACHE_AP) {
    var ss0 = auditorV5_getSs_();
    var ap0 = ss0.getSheetByName(V5_AP_SHEET);
    if (!ap0) throw new Error('Missing sheet: "' + V5_AP_SHEET + '"');
    var apValues0 = ap0.getDataRange().getValues();
    if (apValues0.length < 2) throw new Error('"' + V5_AP_SHEET + '" has no data');
    var apHeaders0 = apValues0[0].map(_v5_trim_);
    var apIdx0 = _v5_indexMap_(apHeaders0);
    // Build fast lookup: Audit_ID -> row array
    var byId0 = {};
    var idCol0 = apIdx0[V5_H_AUDIT_ID];
    for (var rr0 = 1; rr0 < apValues0.length; rr0++) {
      var rid0 = String(apValues0[rr0][idCol0] || '').trim();
      if (rid0) byId0[rid0] = apValues0[rr0];
    }
    _V5_CACHE_AP = { ss: ss0, ap: ap0, values: apValues0, headers: apHeaders0, idx: apIdx0, rowByAuditId: byId0 };
  }
  var ss = _V5_CACHE_AP.ss;
  var ap = _V5_CACHE_AP.ap;
  var apValues = _V5_CACHE_AP.values;
  var apHeaders = _V5_CACHE_AP.headers;
  var apIdx = _V5_CACHE_AP.idx;
  var row = _V5_CACHE_AP.rowByAuditId[auditId];
  if (!row) throw new Error("Audit not found for Audit ID: " + auditId);
  var expiry = _v5_parseDate_(row[apIdx[V5_H_EXPIRY_FINAL]]);
  var isFirstTime = !expiry;
  var activeScopes = v5_extractApplicableScopes_(apHeaders, row);
  var stdMap = _v5_loadStandardsWindowMap_();
  var scopeWindows = [];
  var intersection = { start: null, end: null, isEmpty: false };
  if (expiry && activeScopes.length) {
    activeScopes.forEach(function(scope){
      var rule = stdMap[scope];
      if (!rule) return;
      var s = _v5_addMonths_(expiry, rule.fromMonths);
      var e = _v5_addMonths_(expiry, rule.toMonths);
      if (s > e) { var t = s; s = e; e = t; }
      scopeWindows.push({
        scope: scope,
        start: _v5_fmtDate_(s),
        end: _v5_fmtDate_(e),
        fromMonths: rule.fromMonths,
        toMonths: rule.toMonths
      });
    });
    if (scopeWindows.length) {
      var maxStart = scopeWindows.reduce(function(acc,w){ return acc > w.start ? acc : w.start; }, scopeWindows[0].start);
      var minEnd   = scopeWindows.reduce(function(acc,w){ return acc < w.end ? acc : w.end; }, scopeWindows[0].end);
      intersection.start = maxStart;
      intersection.end = minEnd;
      intersection.isEmpty = (maxStart > minEnd);
    }
  }
  // Render range
  var today = new Date();
  var renderStart, renderEnd;
  if (isFirstTime) {
    renderStart = _v5_fmtDate_(today);
    renderEnd = _v5_fmtDate_(_v5_addMonths_(today, 12));
  } else if (scopeWindows.length) {
    var minStart = scopeWindows.reduce(function(acc,w){ return acc < w.start ? acc : w.start; }, scopeWindows[0].start);
    var maxEnd   = scopeWindows.reduce(function(acc,w){ return acc > w.end ? acc : w.end; }, scopeWindows[0].end);
    renderStart = minStart;
    renderEnd = maxEnd;
  } else {
    // expiry exists but no matching standards rules → allow life to go on
    renderStart = _v5_fmtDate_(today);
    renderEnd = _v5_fmtDate_(_v5_addMonths_(today, 12));
  }
  var warnings = [];
  if (isFirstTime) warnings.push({ code:"NO_EXPIRY_DATE_FIRST_TIME_HORIZON", severity:"INFO", message:"No Extended Expiration Date; using 12-month horizon from today." });
  if (intersection.isEmpty) warnings.push({ code:"SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION", severity:"WARN", message:"Scope windows have empty intersection; planning allowed (soft warning)." });
  var assignedTo = apIdx[V5_H_ASSIGNED_TO] != null ? String(row[apIdx[V5_H_ASSIGNED_TO]] || "").trim() : "";
  var status = apIdx[V5_H_STATUS] != null ? String(row[apIdx[V5_H_STATUS]] || "").trim() : "";
  return {
    auditId: String(auditId).trim(),
    expiryDate: expiry ? _v5_fmtDate_(expiry) : null,
    isFirstTime: isFirstTime,
    activeScopes: activeScopes,
    scopeWindows: scopeWindows,
    intersection: intersection,
    renderStart: renderStart,
    renderEnd: renderEnd,
    slots: V5_SLOTS,
    warnings: warnings,
    assignedTo: assignedTo,
    status: status
  };
}
function v5_getPlanningWindowTextForAuditId_(auditId){
  auditId = String(auditId || '').trim();
  if (!auditId) return '';
  try {
    if (_V5_CACHE_PW_TEXT && _V5_CACHE_PW_TEXT.hasOwnProperty(auditId)) {
      return _V5_CACHE_PW_TEXT[auditId] || '';
    }
    var ctx;
    if (_V5_CACHE_CTX && _V5_CACHE_CTX.hasOwnProperty(auditId)) {
      ctx = _V5_CACHE_CTX[auditId];
    } else {
      ctx = v5_resolvePlanningContext(auditId);
      _V5_CACHE_CTX[auditId] = ctx;
    }
    var txt = v5_formatPlanningWindowTextFromCtx_(ctx) || '';
    _V5_CACHE_PW_TEXT[auditId] = txt;
    return txt;
  } catch (e) {
    // Non-blocking: UI will show "-"
    _V5_CACHE_PW_TEXT[auditId] = '';
    return '';
  }
}
/***********************
 * UI COMPATIBILITY ALIAS
 * AuditorPortalV5.html.980 calls AuditorV5B_GetAuditorGrid via google.script.run.
 * Keep this alias to avoid "is not a function" errors.
 ***********************/
/** Normalize YES/NO flags to 'YES' or 'NO' (UI contract). */
function auditorV5_normYesNo_(val) {
  var v = String(val == null ? "" : val).trim().toUpperCase();
  if (!v) return "";
  if (v === "YES" || v === "Y" || v === "TRUE" || v === "1") return "YES";
  if (v === "NO" || v === "N" || v === "FALSE" || v === "0") return "NO";
  return v; // leave as-is for unexpected tokens
}
/** Default scope colors (fallback) to keep UI stable even if Config_Scopes colors are blank. */
function auditorV5_defaultScopeStyle_(codeOrName) {
  var c = String(codeOrName || "").trim().toUpperCase();
  var map = {
    "MPS-ABC": { color: "#2F80ED", textColor: "#FFFFFF" },
    "MPS-GAP": { color: "#27AE60", textColor: "#FFFFFF" },
    "MPS-SQ":  { color: "#9B51E0", textColor: "#FFFFFF" },
    "GRASP":   { color: "#EB5757", textColor: "#FFFFFF" },
    "FLORIMARK_GTP": { color: "#F2994A", textColor: "#000000" },
    "FLORIMARK_TRACECERT": { color: "#56CCF2", textColor: "#000000" },
    "GLOBALG.A.P.": { color: "#6FCF97", textColor: "#000000" }
  };
  return map[c] || null;
}
/***********************
 * UNIQUE GRID ENDPOINTS — collision bypass
 * BUILD: AUDITOR_GRID_V2_UNIQUE_20260409_203900
 ***********************/
function AuditorV5B_GetAuditorGrid_U20409(mode, params) {
  if (typeof mode === 'string') {
    params = params || {};
    params.view = mode;
    return AuditorV5_GetAuditorGrid_U20409(params);
  }
  return AuditorV5_GetAuditorGrid_U20409(mode);
}
function AuditorV5_GetAuditorGrid_U20409(req) {
  var __t0 = new Date().getTime();
  function __ms_() { return new Date().getTime() - __t0; }
  try {
    req = req || {};
    var view = String(req.view || "active").toLowerCase();
    var filterEmail = String(req.auditorEmail || '').trim().toLowerCase();
    var useCache = !(req && req.noCache === true);
    if (!filterEmail) return { success:false, message:"No auditor email" };

    if (useCache) {
      var cached = auditorV5_userCacheGet_(filterEmail, view);
      if (cached && cached.success !== false) {
        cached.cacheHit = true;
        cached.__build = "AUDITOR_GRID_V2_UNIQUE_20260426_CENTRAL_CACHE_DEPLOY_READY";
        cached.perf = cached.perf || {};
        cached.perf.serverMs = __ms_();
        cached.perf.fromCache = true;
        cached.perf.cacheSource = 'AUDIT_CACHE.auditor_grid';
        return cached;
      }
    }

    var res;
    if (view === "archived") {
      res = auditorV5_buildArchivedGrid_(filterEmail);
    } else {
      res = auditorV5_buildActiveGrid_U20409(filterEmail, req && req.diag === true);
    }

    if (res && res.success !== false) {
      res.cacheHit = false;
      res.__build = "AUDITOR_GRID_V2_UNIQUE_20260426_CENTRAL_CACHE_DEPLOY_READY";
      res.perf = res.perf || {};
      res.perf.serverMs = __ms_();
      res.perf.fromCache = false;
      res.perf.cacheSource = 'builder';
      if (useCache) auditorV5_userCacheSet_(filterEmail, view, res);
    }
    return res;
  } catch (e) {
    return { success:false, message: e && e.message ? e.message : String(e), perf:{ serverMs: __ms_(), failed:true } };
  }
}
function auditorV5_buildAvailabilitySummaryMap_() {
  return AS_buildAvailabilitySummaryMap_({ cacheKey: '_AUDITOR_V5_AVAIL_SUMMARY_CACHE_' });
}

function auditorV5_plannedSummaryFromAvailabilityMap_(availabilityMap, auditId) {
  return AS_plannedSummaryFromAvailabilityMap_(availabilityMap, auditId, { dateParser: auditorV5_parseDate_ });
}

function auditorV5_findCandidateAuditPlanningRows_(sh, idxAssigned, idxPreassigned, activeEmail, auditorName, lastRowOpt) {
  var lastRow = Number(lastRowOpt || sh.getLastRow());
  if (!(lastRow >= 2)) return [];
  var rowCount = lastRow - 1;
  var assignedVals = (idxAssigned >= 0) ? sh.getRange(2, idxAssigned + 1, rowCount, 1).getValues() : [];
  var preassignedVals = (idxPreassigned >= 0) ? sh.getRange(2, idxPreassigned + 1, rowCount, 1).getValues() : [];
  var active = String(activeEmail || '').trim().toLowerCase();
  var auditor = String(auditorName || '').trim().toLowerCase();
  var rows = [];
  for (var i = 0; i < rowCount; i++) {
    var assigned = idxAssigned >= 0 ? String(assignedVals[i][0] || '').trim().toLowerCase() : '';
    var preassigned = idxPreassigned >= 0 ? String(preassignedVals[i][0] || '').trim().toLowerCase() : '';
    var hit = false;
    if (active && (assigned === active || preassigned === active)) hit = true;
    if (!hit && auditor && (assigned === auditor || preassigned === auditor)) hit = true;
    if (hit) rows.push(i + 2);
  }
  return rows;
}

function auditorV5_buildActiveGrid_U20409(activeEmail, diag) {
  var __t0 = new Date().getTime();
  function __ms_() { return new Date().getTime() - __t0; }

  var perf = {
    build: "AUDITOR_GRID_V2_UNIQUE_20260424_T04_SINGLE_BODY_READ",
    rowsTotal: 0,
    candidateRows: 0,
    rowsMatched: 0,
    rowsReturned: 0,
    completedSkipped: 0,
    statusSkipped: 0,
    availabilityFallbackRows: 0,
    usedAvailabilityFallback: false,
    mapsMs: 0,
    readMs: 0,
    loopMs: 0,
    columnsFetched: 0,
    scopeColsFetched: 0,
    companiesFiltered: 0
  };

  var tMaps = new Date().getTime();
  var ss = auditorV5_getSs_();
  var maps = auditorV5_buildAuditorMaps_();
  var auditorName = String(maps.emailToName[activeEmail] || "").trim();
  perf.mapsMs = new Date().getTime() - tMaps;

  var sh = ss.getSheetByName("Audit planning");
  if (!sh) return { success:false, message:"Missing sheet 'Audit planning'", perf: perf };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { success:true, rows:[], perf: perf };

  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x){ return String(x||"").trim(); });
  var H = auditorV5_headerIndex_(hdr);

  var idxAuditId   = H(["Audit ID","Audit Id","AuditID","AuditId","auditId","Audit UID","Audit_UID","AuditUID","Audit Id (V5)","Audit ID (V5)"]);
  var idxCompany   = H(["Company","Company name","Client"]);
  var idxLocation  = H(["Location","Site","Audit location"]);
  var idxAssigned  = H(["Assigned to"]);
  if (idxAssigned >= 0 && hdr[idxAssigned] && String(hdr[idxAssigned]).trim().toLowerCase() === "assigned") {
    var idxAssignedTo = H(["Assigned to"]);
    if (idxAssignedTo >= 0) idxAssigned = idxAssignedTo;
  }
  var idxStatus    = H(["Status"]);
  var idxPlanning  = H(["Planning JSON","Planning","PlanningJSON","Planning_Js","Planning js"]);
  var idxEffectiveExpiry = H(["Extended Expiration Date","Extended Expiry Date","Effective expiry","Effective Expiry","Extended Expiration","Effective expiration"]);
  var idxWillExpire = H(["Date - Will Expire","Will expire","Expiry","Expiration date"]);
  var idxPlanFrom = H(["Planning window from","Plan van","Planning from","Planning from date","Plan from","Planning start","Plan start"]);
  var idxPlanTo   = H(["Planning window to","Plan tot","Planning to","Planning to date","Plan to","Planning end","Plan end"]);
  var idxToBePlanned = H(["Total audit time in hours","To be planned","To be Planned","ToBePlanned","Hours to plan","Hours to be planned"]);
  var idxTotalAuditDays = H(["Total audit time in days","Audit days","Days to plan","Days to be planned"]);
  var idxAllowSelfPlanning = H(["Self planning","Self Planning","Allow self planning","Allow Self Planning","SelfPlanning"]);
  var idxPreassigned = H(["Preassigned to","Preassigned","Preassigned auditor","Preassigned auditor email"]);
  var idxExtExpiration = H(["Extended Expiration Date","Extended Expiry Date","Effective expiry","Effective Expiry","Extended Expiration","Effective expiration","Expiration date","Expiry date"]);

  if (idxAuditId < 0 || idxCompany < 0 || idxStatus < 0) {
    return { success:false, message:"Audit planning: required columns missing (Audit ID / Company / Status)", perf: perf };
  }

  var tRead = new Date().getTime();

  // T04 first-load speed: use ONE contiguous body read for the active grid builder.
  // The previous COLDLOAD_FAST version first read Assigned/Preassigned columns,
  // then fetched many individual columns one by one. In Apps Script those range
  // roundtrips dominate cold first-load time. One body read is more stable and
  // also acts as an execution-level singleton for the rest of this builder.
  var bodyValues = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  perf.columnsFetched = lastCol;
  perf.scopeColsFetched = 0;

  var candidateRowNums = [];
  var active = String(activeEmail || '').trim().toLowerCase();
  var auditor = String(auditorName || '').trim().toLowerCase();
  for (var cr = 0; cr < bodyValues.length; cr++) {
    var cRow = bodyValues[cr];
    var cAssigned = idxAssigned >= 0 ? String(cRow[idxAssigned] || '').trim().toLowerCase() : '';
    var cPreassigned = idxPreassigned >= 0 ? String(cRow[idxPreassigned] || '').trim().toLowerCase() : '';
    var cHit = false;
    if (active && (cAssigned === active || cPreassigned === active)) cHit = true;
    if (!cHit && auditor && (cAssigned === auditor || cPreassigned === auditor)) cHit = true;
    if (cHit) candidateRowNums.push(cr + 2);
  }

  perf.candidateRows = candidateRowNums.length;
  if (!candidateRowNums.length) {
    perf.readMs = new Date().getTime() - tRead;
    perf.totalMs = __ms_();
    return { success:true, rows:[], perf: perf };
  }

  var matched = [];
  var wantedCompanies = {};
  for (var rr = 0; rr < candidateRowNums.length; rr++) {
    perf.rowsTotal++;
    var rowNum = candidateRowNums[rr];
    var rowOffset = rowNum - 2;
    var sparseRow = bodyValues[rowOffset];

    var statusRaw = String(sparseRow[idxStatus] || "").trim();
    var statusNorm = (typeof Status_normalizeStatus_ === 'function')
      ? Status_normalizeStatus_(statusRaw)
      : statusRaw.toUpperCase().replace(/\s+/g, '_');

    if (statusNorm === "COMPLETED") { perf.completedSkipped++; continue; }
    if (statusNorm !== "PENDING_PLANNING" &&
        statusNorm !== "PENDING_APPROVAL" &&
        statusNorm !== "APPROVED" &&
        statusNorm !== "ACCEPTED") {
      perf.statusSkipped++;
      continue;
    }

    var assigned = idxAssigned >= 0 ? String(sparseRow[idxAssigned] || "").trim().toLowerCase() : "";
    var preassignedRaw = (idxPreassigned >= 0) ? String(sparseRow[idxPreassigned] || "").trim() : "";
    var preassigned = String(preassignedRaw || "").trim().toLowerCase();

    var assignedMatch = false;
    var preassignedMatch = false;
    var match = false;

    if (assigned && assigned === activeEmail) { assignedMatch = true; match = true; }
    if (!assignedMatch && auditorName && assigned && assigned === String(auditorName).trim().toLowerCase()) { assignedMatch = true; match = true; }
    if (!assignedMatch && !assigned) {
      if (preassigned && preassigned === activeEmail) { preassignedMatch = true; match = true; }
      else if (auditorName && preassigned && preassigned === String(auditorName).trim().toLowerCase()) { preassignedMatch = true; match = true; }
    }
    if (!match) continue;
    perf.rowsMatched++;

    var companyKey = String((idxCompany >= 0 ? sparseRow[idxCompany] : "") || "").trim().toLowerCase();
    if (companyKey) wantedCompanies[companyKey] = true;

    matched.push({
      rowNum: rowNum,
      row: sparseRow,
      statusRaw: statusRaw,
      statusNorm: statusNorm,
      assignedMatch: assignedMatch,
      preassignedMatch: preassignedMatch
    });
  }

  var companyNames = Object.keys(wantedCompanies);
  perf.companiesFiltered = companyNames.length;
  var companyInfo = auditorV5_buildCompaniesLookupForNames_(companyNames);

  perf.readMs = new Date().getTime() - tRead;

  var rows = [];
  var availabilitySummaryMap = null;
  var tLoop = new Date().getTime();

  for (var m = 0; m < matched.length; m++) {
    var item = matched[m];
    var row = item.row;
    var statusRaw = item.statusRaw;
    var statusNorm = item.statusNorm;
    var assignedMatch = item.assignedMatch;
    var preassignedMatch = item.preassignedMatch;

    var auditIdS = String((idxAuditId >= 0 ? row[idxAuditId] : "") || "").trim();
    var js = idxPlanning >= 0 ? row[idxPlanning] : "";
    if (!auditIdS) {
      var _aid = "";
      if (js) {
        try {
          var _objA = (typeof js === "string") ? JSON.parse(js) : js;
          _aid = _objA && (_objA.auditId || _objA.audit_id || _objA.auditID || _objA.id);
        } catch (e) {}
      }
      auditIdS = String(_aid || "").trim();
      if (!auditIdS) auditIdS = "ROW_" + String(item.rowNum);
    }

    var company = String((idxCompany >= 0 ? row[idxCompany] : "") || "").trim();
    var planned = auditorV5_extractPlannedSummary_(js);

    if ((!planned.plannedDates || !planned.plannedHours) && auditIdS && String(auditIdS).indexOf("ROW_") !== 0) {
      if (!availabilitySummaryMap) availabilitySummaryMap = auditorV5_buildAvailabilitySummaryMap_();
      var plannedFallback = auditorV5_plannedSummaryFromAvailabilityMap_(availabilitySummaryMap, auditIdS);
      planned.plannedDates = planned.plannedDates || plannedFallback.plannedDates;
      planned.plannedHours = planned.plannedHours || plannedFallback.plannedHours;
      planned.plannedTooltip = planned.plannedTooltip || plannedFallback.plannedTooltip;
      planned._firstDateObj = planned._firstDateObj || plannedFallback._firstDateObj;
      perf.availabilityFallbackRows++;
      perf.usedAvailabilityFallback = true;
    }

    var ci = (companyInfo.byName && companyInfo.byName[String(company).toLowerCase()]) || { locs:1, gps:"", location:"", region:"" };
    var locationLegacy = idxLocation >= 0 ? String(row[idxLocation] || "").trim() : "";
    if (String(locationLegacy).toUpperCase() === "HQ") locationLegacy = "";

    var planningWindow = "";
    if (idxPlanFrom >= 0 || idxPlanTo >= 0) {
      var pfS = (idxPlanFrom >= 0) ? auditorV5_cellToYmd_(row[idxPlanFrom]) : "";
      var ptS = (idxPlanTo   >= 0) ? auditorV5_cellToYmd_(row[idxPlanTo])   : "";
      if (pfS || ptS) planningWindow = (pfS || "…") + " → " + (ptS || "…");
    }

    var totalAuditDays = "";
    if (idxTotalAuditDays >= 0) {
      var _daysRaw = row[idxTotalAuditDays];
      if (_daysRaw !== null && _daysRaw !== undefined && _daysRaw !== "") totalAuditDays = String(_daysRaw).trim();
    }

    var toBePlanned = "";
    if (idxToBePlanned >= 0) {
      var _tbpRaw = row[idxToBePlanned];
      if (_tbpRaw !== null && _tbpRaw !== undefined && _tbpRaw !== "") toBePlanned = String(_tbpRaw).trim();
    }

    var allowSelfPlanning = (idxAllowSelfPlanning >= 0) ? auditorV5_normYesNo_(row[idxAllowSelfPlanning]) : "";
    var preassignedAuditor = (idxPreassigned >= 0) ? String(row[idxPreassigned] || "").trim() : "";

    var expirationDate = "";
    if (idxExtExpiration >= 0) expirationDate = auditorV5_cellToYmd_(row[idxExtExpiration]);
    if (!expirationDate && idxEffectiveExpiry >= 0) expirationDate = auditorV5_cellToYmd_(row[idxEffectiveExpiry]);
    if (!expirationDate && idxWillExpire >= 0) expirationDate = auditorV5_cellToYmd_(row[idxWillExpire]);

    var scopesPack = auditorV5_extractScopesForRow_(hdr, row);
    var scopes = scopesPack.scopes;
    var scopesText = scopesPack.scopesText;

    var canPlan = (!assignedMatch) && preassignedMatch && (statusNorm === "PENDING_PLANNING") && (allowSelfPlanning === "YES");
    var expectedOnly = preassignedMatch && !assignedMatch;

    rows.push({
      auditId: String(auditIdS),
      company: company,
      companyUid: String(ci.companyUid || "").trim(),
      locs: ci.locs || 1,
      location: locationLegacy,
      companyLocation: String(ci.location || "").trim(),
      companyRegion: String(ci.region || "").trim(),
      planningWindow: planningWindow,
      allowSelfPlanning: allowSelfPlanning,
      totalAuditDays: totalAuditDays,
      preassignedAuditor: preassignedAuditor,
      assignedAuditor: idxAssigned >= 0 ? String(row[idxAssigned] || "").trim() : "",
      isAssignedMatch: assignedMatch,
      isPreassignedMatch: preassignedMatch,
      expectedOnly: expectedOnly,
      canPlan: canPlan,
      toBePlanned: toBePlanned,
      plannedTooltip: planned.plannedTooltip,
      gps: ci.gps || "",
      scopes: scopes,
      scopesText: scopesText,
      expirationDate: expirationDate,
      plannedDates: planned.plannedDates,
      plannedHours: planned.plannedHours,
      status: String(statusRaw || "").toUpperCase(),
      readOnly: (String(auditIdS).indexOf("ROW_") === 0)
    });
  }

  perf.loopMs = new Date().getTime() - tLoop;
  perf.rowsReturned = rows.length;
  perf.totalMs = __ms_();

  return { success:true, rows: rows, perf: perf };
}

function AuditorV5B_GetAuditorGrid(mode, params) {
  // CONSOLIDATED_AUDITOR_STABLE_20260410_091500
  // Runtime-safe alias: force all generic callers onto the unique grid endpoint.
  return AuditorV5B_GetAuditorGrid_U20409(mode, params);
}
function AuditorV5_GetAuditorGrid(req) {
  // CONSOLIDATED_AUDITOR_STABLE_20260410_091500
  // Runtime-safe alias: force all generic callers onto the unique grid endpoint.
  return AuditorV5_GetAuditorGrid_U20409(req);
}

function AuditorV5B_GetArchivedGrid_DIRECT(email) {
  // Unique archived endpoint — central cache bridge for archived grid.
  email = String(email || '').trim().toLowerCase();
  if (!email) return { success:false, message:'Missing auditor email' };

  var started = new Date().getTime();
  try {
    var cached = auditorV5_userCacheGet_(email, 'archived');
    if (cached && cached.success !== false) {
      cached.cacheHit = true;
      cached.__build = 'AUDITOR_ARCHIVED_GRID_20260426_CENTRAL_CACHE_DEPLOY_READY';
      cached.perf = cached.perf || {};
      cached.perf.serverMs = new Date().getTime() - started;
      cached.perf.fromCache = true;
      cached.perf.cacheSource = 'AUDIT_CACHE.auditor_grid';
      return cached;
    }
  } catch (e0) {}

  var res = ArchivedV5_GetRowsForAuditorEmail(email);
  if (res && res.success !== false) {
    res.cacheHit = false;
    res.__build = 'AUDITOR_ARCHIVED_GRID_20260426_CENTRAL_CACHE_DEPLOY_READY';
    res.perf = res.perf || {};
    res.perf.serverMs = new Date().getTime() - started;
    res.perf.fromCache = false;
    res.perf.cacheSource = 'builder';
    auditorV5_userCacheSet_(email, 'archived', res);
  }
  return res;
}
function auditorV5_buildActiveGrid_(activeEmail, diag) {
  // CONSOLIDATED_AUDITOR_STABLE_20260410_091500
  // Runtime-safe alias: force all generic callers onto the unique active-grid builder.
  return auditorV5_buildActiveGrid_U20409(activeEmail, diag);
}
function auditorV5_buildArchivedGrid_(activeEmail) {
  activeEmail = String(activeEmail || "").trim().toLowerCase();

  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Log realized audits");
  if (!sh) return { success:true, rows:[], warning:"Missing sheet 'Log realized audits' (archived view empty)" };

  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return { success:true, rows:[] };

  var hdr = data[0].map(function(x){ return String(x || "").trim(); });
  var H = auditorV5_headerIndex_(hdr);

  var idxAuditId        = H(["Audit ID","Audit Id","AuditID","AuditId","auditId","Audit UID","Audit_UID","AuditUID","Audit Id (V5)","Audit ID (V5)"]);
  var idxCompany        = H(["Company","Company name","Client"]);
  var idxStatus         = H(["Status"]);
  var idxAuditor        = H(["Auditor"]);
  var idxExecutedOn     = H(["Date planned","Date Planned"]);
  var idxCompletedDate  = H(["Date completed","Date Completed","Completed date","Completion date"]);
  var idxHoursPlanned   = H(["Hours planned","Planned hours","Planned Hours","Hours Planned"]);
  var idxHoursDedicated = H(["Hours dedicated","Hours Dedicated","Hours_dedicated","Dedicated hours"]);
  var idxToBePlanned    = H(["Hours to be planned","Hours To Be Planned","To be planned","To Be Planned"]);
  var idxLocation       = H(["Location","Site","Audit location"]);
  var idxGps            = H(["GPS","Gps","LatLong","Lat/Long"]);

  if (idxStatus < 0 || idxAuditor < 0) {
    return { success:true, rows:[], warning:"Archived view: required columns missing in Log realized audits" };
  }

  var companyInfo = auditorV5_buildCompaniesLookup_();
  var auditorMaps = auditorV5_buildAuditorMaps_();
  var rows = [];

  function looksLikeEmail_(v) {
    return String(v || "").trim().indexOf("@") > -1;
  }

  function fmtDate_(v) {
    try {
      return auditorV5_formatDateYYYYMMDD_(v) || String(v || "").trim();
    } catch (e) {
      return String(v || "").trim();
    }
  }

  function truthy_(v) {
    var s = String(v || "").trim().toLowerCase();
    return (s === "x" || s === "yes" || s === "y" || s === "true" || s === "1");
  }

  function scopesFromLogRow_(row) {
    var scopes = [];
    for (var i = 1; i <= 8; i++) {
      var slot = "SCOPE_0" + i;
      var idx = H([slot]);
      if (idx >= 0 && truthy_(row[idx])) scopes.push(slot);
    }
    return scopes.join(", ");
  }

  for (var r = 1; r < data.length; r++) {
    var row = data[r];

    var statusRaw = String(row[idxStatus] || "").trim();
    var status = statusRaw.toUpperCase();
    if (status !== "COMPLETED") continue;

    var auditorRaw = String(row[idxAuditor] || "").trim();
    var auditorKey = auditorRaw.toLowerCase();
    var auditorEmail = "";

    if (looksLikeEmail_(auditorRaw)) {
      auditorEmail = auditorKey;
    } else {
      auditorEmail = String(auditorMaps.nameToEmail[auditorRaw] || auditorMaps.nameToEmail[auditorKey] || "").trim().toLowerCase();
    }

    if (!auditorEmail) continue;
    if (!activeEmail || auditorEmail !== activeEmail) continue;

    var auditId = (idxAuditId >= 0) ? String(row[idxAuditId] || "").trim() : "";
    if (!auditId) auditId = "LOGROW_" + String(r + 1);

    var company = idxCompany >= 0 ? String(row[idxCompany] || "").trim() : "";
    var ci = (companyInfo.byName && companyInfo.byName[String(company).toLowerCase()]) || { locs:1, gps:"", location:"", region:"" };
    var locs = ci.locs || 1;

    var gps = idxGps >= 0 ? String(row[idxGps] || "").trim() : "";
    if (!gps) gps = ci.gps || "";

    var location = idxLocation >= 0 ? String(row[idxLocation] || "").trim() : "";
    if (!location) location = String(ci.location || "").trim();
    if (String(location).toUpperCase() === "HQ") location = "";

    var executedOn = idxExecutedOn >= 0 ? fmtDate_(row[idxExecutedOn]) : "";
    var completedDate = idxCompletedDate >= 0 ? fmtDate_(row[idxCompletedDate]) : "";
    var toBePlanned = idxToBePlanned >= 0 ? String(row[idxToBePlanned] || "").trim() : "";
    var plannedHours = idxHoursPlanned >= 0 ? String(row[idxHoursPlanned] || "").trim() : "";
    var hoursDedicated = idxHoursDedicated >= 0 ? String(row[idxHoursDedicated] || "").trim() : "";
    var scopesText = scopesFromLogRow_(row);

    rows.push({
      auditId: auditId,
      company: company,
      companyUid: String(ci.companyUid || "").trim(),
      locs: locs,
      location: location,
      gps: gps,
      scopes: scopesText,
      scopesText: scopesText,
      executedOn: executedOn,
      plannedDates: executedOn,
      toBePlanned: toBePlanned,
      plannedHours: plannedHours,
      hoursDedicated: hoursDedicated,
      completedDate: completedDate,
      selfPlanning: "",
      status: status,
      readOnly: true,
      companyLocation: String(ci.location || "").trim(),
      companyRegion: String(ci.region || "").trim(),
      planningWindow: "",
      allowSelfPlanning: "",
      totalAuditDays: "",
      plannedTooltip: ""
    });
  }

  return { success:true, rows: rows };
}

function auditorV5_buildAuditorMaps_() {
  var cacheKey = "AUD_V5_AUDITOR_MAPS_V1";
  var cached = auditorV5_scriptCacheGetJson_(cacheKey);
  if (cached && cached.nameToEmail && cached.emailToName) return cached;
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Auditors");
  var nameToEmail = {};
  var emailToName = {};
  if (!sh) {
    var empty = { nameToEmail:nameToEmail, emailToName:emailToName };
    auditorV5_scriptCachePutJson_(cacheKey, empty, AUDITOR_V5_TTL_MAPS_SEC);
    return empty;
  }
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) {
    var empty2 = { nameToEmail:nameToEmail, emailToName:emailToName };
    auditorV5_scriptCachePutJson_(cacheKey, empty2, AUDITOR_V5_TTL_MAPS_SEC);
    return empty2;
  }
  var hdr = data[0].map(function(x){ return String(x||"").trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var idxName  = H(["Auditor","Name","Auditor name","Auditor Name"]);
  var idxEmail = H(["Email","E-mail","Auditor email","Auditor Email"]);
  for (var r=1; r<data.length; r++) {
    var row = data[r];
    var nm = idxName>=0 ? String(row[idxName]||"").trim() : "";
    var em = idxEmail>=0 ? String(row[idxEmail]||"").trim().toLowerCase() : "";
    if (nm && em) {
      nameToEmail[nm] = em;
      emailToName[em] = nm;
    }
  }
  var out = { nameToEmail:nameToEmail, emailToName:emailToName };
  auditorV5_scriptCachePutJson_(cacheKey, out, AUDITOR_V5_TTL_MAPS_SEC);
  return out;
}
// ---------------------------
// Scopes config (Config_Scopes) — minimal loader
// ---------------------------
var AUDITOR_V5_SCOPES_CFG_CACHE_ = null;
function auditorV5_loadConfigScopes_() {
  if (AUDITOR_V5_SCOPES_CFG_CACHE_ && AUDITOR_V5_SCOPES_CFG_CACHE_.ordered) return AUDITOR_V5_SCOPES_CFG_CACHE_;
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Config_Scopes");
  if (!sh) {
    AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: [] };
    return AUDITOR_V5_SCOPES_CFG_CACHE_;
  }
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: [] };
    return AUDITOR_V5_SCOPES_CFG_CACHE_;
  }
  var headers = values[0].map(function(x){ return String(x||"").trim(); });
  var idx = {};
  for (var i=0;i<headers.length;i++) { if (headers[i]) idx[headers[i]] = i; }
  function get_(row, name) {
    var c = idx[name];
    if (c == null) return "";
    return row[c];
  }
  function toBool_(v) {
    var s = String(v || "").trim().toLowerCase();
    return (s === "true" || s === "yes" || s === "1" || s === "y" || s === "active" || s === "x");
  }
  function toNum_(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  var ordered = [];
  for (var r=1;r<values.length;r++) {
    var row = values[r];
    var slotKey = String(get_(row, "SlotKey") || "").trim();
    if (!slotKey) continue;
    var active = toBool_(get_(row, "Active"));
    if (!active) continue;
    ordered.push({
      slotKey: slotKey,
      scopeCode: String(get_(row, "ScopeCode") || "").trim(),
      displayName: String(get_(row, "DisplayName") || "").trim(),
      sortOrder: toNum_(get_(row, "SortOrder"))
    });
  }
  ordered.sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });
  AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: ordered };
  return AUDITOR_V5_SCOPES_CFG_CACHE_;
}
function auditorV5_truthyScopeCell_(v) {
  var s = String(v || "").trim().toLowerCase();
  return (s === "x" || s === "yes" || s === "y" || s === "true" || s === "1" || s === "active");
}
function auditorV5_formatDateYYYYMMDD_(v) {
  try {
    return auditorV5_cellToYmd_(v);
  } catch (e) {
    return "";
  }
}
/**
 * Return rich scopes for AuditorPortalV5:
 *  - scopes: [{code,name,color,textColor}, ...]  (for colored pills)
 *  - scopesText: "MPS-ABC, GRASP" (fallback / search text)
 */
function auditorV5_extractScopesForRow_(hdr, row) {
  var cfg = auditorV5_loadConfigScopes_();
  var list = (cfg && cfg.list && cfg.list.length) ? cfg.list : (cfg && cfg.ordered ? cfg.ordered : []);
  if (!list || !list.length) {
    var s = auditorV5_buildScopesString_(hdr, row) || "";
    // Fallback: still provide scope objects (with default colors) so UI shows pills.
    var parts = s ? s.split(/\s*,\s*|\s*;\s*/).filter(function(x){ return x; }) : [];
    var scopes0 = parts.map(function(p){
      var nm = String(p || "").trim();
      var fb = auditorV5_defaultScopeStyle_(nm);
      return { code: nm, name: nm, color: fb ? fb.color : "", textColor: fb ? fb.textColor : "" };
    });
    return { scopes: scopes0, scopesText: s };
  }
  // header -> index
  var headerIndex = {};
  for (var i = 0; i < hdr.length; i++) {
    headerIndex[String(hdr[i] || "").trim()] = i;
  }
  var scopes = [];
  var names = [];
  for (var j = 0; j < list.length; j++) {
    var def = list[j];
    var slot = def.slotKey || def.slot || "";
    if (!slot) continue;
    var col = headerIndex[slot];
    if (col == null) continue;
    if (auditorV5_truthyScopeCell_(row[col])) {
      var code = String(def.scopeCode || def.code || "").trim() || String(def.displayName || def.name || slot).trim() || slot;
      var name = String(def.displayName || def.name || def.scopeCode || def.code || slot).trim() || slot;
      var color = String(def.color || "").trim();
      var textColor = String(def.textColor || "").trim();
      if (!color || !textColor) {
        var fb = auditorV5_defaultScopeStyle_(code) || auditorV5_defaultScopeStyle_(name);
        if (fb) {
          if (!color) color = fb.color;
          if (!textColor) textColor = fb.textColor;
        }
      }
      scopes.push({ code: code, name: name, color: color, textColor: textColor });
      names.push(name);
    }
  }
  return { scopes: scopes, scopesText: names.join(", ") };
}
function auditorV5_buildScopesString_(headers, row) {
  var cfg = auditorV5_loadConfigScopes_();
  var ordered = (cfg && cfg.ordered) ? cfg.ordered : [];
  if (!ordered.length) return "";
  var headerIndex = {};
  for (var i=0;i<headers.length;i++) headerIndex[String(headers[i]||"").trim()] = i;
  var names = [];
  for (var j=0;j<ordered.length;j++) {
    var rec = ordered[j];
    var col = headerIndex[rec.slotKey];
    // backward compat: allow using displayName or scopeCode as column headers
    if (col == null) {
      if (rec.displayName && headerIndex[rec.displayName] != null) col = headerIndex[rec.displayName];
      else if (rec.scopeCode && headerIndex[rec.scopeCode] != null) col = headerIndex[rec.scopeCode];
    }
    if (col == null) continue;
    var cell = Array.isArray(row) ? row[col] : "";
    if (!auditorV5_truthyScopeCell_(cell)) continue;
    var nm = rec.displayName || rec.scopeCode || rec.slotKey;
    if (nm) names.push(nm);
  }
  return names.join("; ");
}
// ---------------------------
// Planning window (Plan van / Plan tot) — minimal
// ---------------------------
function auditorV5_buildPlanningWindow_(headers, row) {
  var H = auditorV5_headerIndex_(headers);
  var idxFrom = H(["Plan van","Plant van","Planning from","Planning from date","Plan from","Planning window from","Planning start","Plan start","Planning window start","Plan start date","Planning window (from)"]);
  var idxTo   = H(["Plan tot","Plant tot","Planning to","Planning to date","Plan to","Planning window to","Planning end","Plan end","Planning window end","Plan end date","Planning window (to)"]);
  if (idxFrom < 0 && idxTo < 0) return "";
  var pfS = (idxFrom >= 0) ? auditorV5_cellToYmd_(Array.isArray(row)?row[idxFrom]:"") : "";
  var ptS = (idxTo   >= 0) ? auditorV5_cellToYmd_(Array.isArray(row)?row[idxTo]  :"") : "";
  if (!pfS && !ptS) return "";
  return (pfS || "…") + " → " + (ptS || "…");
}
// COMPANIES INDEX CLEANUP 2026-04-27
// Removed older duplicate auditorV5_buildCompaniesLookupForNames_ implementation.
// The active implementation below routes through CompaniesIndexService first and keeps direct Companies read as fallback.

function auditorV5_headerIndex_(hdr) {
  var lc = (hdr || []).map(function(x){ return String(x||"").trim().toLowerCase(); });
  return function(cands) {
    for (var i=0;i<cands.length;i++) {
      var k = lc.indexOf(String(cands[i]).trim().toLowerCase());
      if (k >= 0) return k;
    }
    return -1;
  };
}
function auditorV5_scopesToText_(val) {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  try {
    return JSON.stringify(val);
  } catch(e) {
    return String(val);
  }
}
function auditorV5_parseDate_(v) {
  var ymd = auditorV5_cellToYmd_(v);
  if (!ymd) return null;
  var m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function auditorV5_timeToMinutes_(v) {
  if (v == null || v === '') return NaN;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.getHours() * 60 + v.getMinutes();
  }
  var s = String(v || '').trim();
  if (!s) return NaN;
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return NaN;
}

function auditorV5_addMonths_(d, months) {
  if (!d || !(d instanceof Date)) return null;
  var dt = new Date(d.getTime());
  var day = dt.getDate();
  dt.setMonth(dt.getMonth() + Number(months || 0));
  // normalize when month rollover changes day
  if (dt.getDate() !== day) dt.setDate(0);
  return dt;
}
function auditorV5_buildStandardsLookup_() {
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Standards");
  var byName = {};
  if (!sh) return byName;
  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return byName;
  var hdr = data[0].map(function(x){ return String(x||"").trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var idxName = H(["Name","Standard","Scope"]);
  var idxFrom = H(["Planning from","Planning From"]);
  var idxTo   = H(["Planning to","Planning To"]);
  if (idxName < 0) return byName;
  for (var r=1; r<data.length; r++) {
    var row = data[r];
    var name = String(row[idxName] || "").trim();
    if (!name) continue;
    var pf = idxFrom>=0 ? Number(row[idxFrom]) : NaN;
    var pt = idxTo>=0 ? Number(row[idxTo]) : NaN;
    byName[name.toLowerCase()] = { planningFrom: pf, planningTo: pt };
  }
  return byName;
}
function auditorV5_scopesListFromRow_(row, idxScopesList) {
  if (idxScopesList < 0) return [];
  var raw = String(row[idxScopesList] || "").trim();
  if (!raw) return [];
  // allow JSON array or comma separated
  if (raw.charAt(0) === "[" && raw.charAt(raw.length-1) === "]") {
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(function(x){return String(x||"").trim();}).filter(Boolean);
    } catch(e) {}
  }
  return raw.split(/[,;|]/g).map(function(x){return String(x||"").trim();}).filter(Boolean);
}
function auditorV5_computePlanningWindow_(effectiveExpiryDate, scopesList, standardsByName) {
  if (!effectiveExpiryDate || !(effectiveExpiryDate instanceof Date)) return "";
  if (!scopesList || !scopesList.length) return "";
  var start = null;
  var end = null;
  for (var i=0;i<scopesList.length;i++) {
    var s = String(scopesList[i]||"").trim();
    if (!s) continue;
    var cfg = standardsByName[String(s).toLowerCase()];
    if (!cfg) continue;
    var pf = cfg.planningFrom;
    var pt = cfg.planningTo;
    if (!isFinite(pf) || !isFinite(pt)) continue;
    // Interpret: months before expiry
    var sDate = auditorV5_addMonths_(effectiveExpiryDate, -pf);
    var eDate = auditorV5_addMonths_(effectiveExpiryDate, -pt);
    if (sDate) start = (!start || sDate > start) ? sDate : start; // strictest = latest start
    if (eDate) end   = (!end   || eDate < end)   ? eDate : end;   // strictest = earliest end
  }
  if (!start || !end) return "";
  var tz = auditorV5_getTz_();
  var a = Utilities.formatDate(start, tz, "yyyy-MM-dd");
  var b = Utilities.formatDate(end, tz, "yyyy-MM-dd");
  return a + " → " + b;
}
function auditorV5_extractPlannedSummaryFromRow_(headers, row, auditId) {
  var out = { plannedDates:"", plannedHours:"", plannedTooltip:"", _firstDateObj:null };
  try {
    var H = auditorV5_headerIndex_(headers || []);
    var idxDatePlanned = H(["Date - Planned","Date Planned","Planned date","Planned start","First planned day","Start date"]);
    var idxHoursPlanned = H(["Hours planned","Planned hours","Planned Hours","Hours Planned"]);
    var idxAuditId = H(["Audit ID","Audit Id","AuditID","AuditId"]);
    var dt = idxDatePlanned >= 0 ? auditorV5_parseDate_(row[idxDatePlanned]) : null;
    if (dt) {
      out._firstDateObj = dt;
      out.plannedDates = Utilities.formatDate(dt, auditorV5_getTz_(), "yyyy-MM-dd");
    }
    if (idxHoursPlanned >= 0) {
      var hp = row[idxHoursPlanned];
      if (hp !== null && hp !== "" && typeof hp !== 'undefined') out.plannedHours = String(hp);
    }
    if ((!out.plannedDates || !out.plannedHours) && auditId) {
      var ss = auditorV5_getSs_();
      var sh = ss.getSheetByName("Auditor Availability") || ss.getSheetByName("Auditor availability");
      if (sh) {
        var data = sh.getDataRange().getValues();
        if (data && data.length > 1) {
          var ah = data[0].map(function(x){ return String(x||"").trim(); });
          var AH = auditorV5_headerIndex_(ah);
          var iDate = AH(["Date"]);
          var iID1 = AH(["Audit_ID_1","Audit ID 1","AuditId1"]);
          var iID2 = AH(["Audit_ID_2","Audit ID 2","AuditId2"]);
          var iS1 = AH(["First_Audit_Start_Time","First audit start time","First_Audit_Start"]);
          var iE1 = AH(["First_Audit_End_Time","First audit end time","First_Audit_End"]);
          var iS2 = AH(["Second_Audit_Start_Time","Second audit start time","Second_Audit_Start"]);
          var iE2 = AH(["Second_Audit_End_Time","Second audit end time","Second_Audit_End"]);
          var days = [];
          var mins = 0;
          for (var r = 1; r < data.length; r++) {
            var rr = data[r];
            var matched = false;
            if (iID1 >= 0 && String(rr[iID1] || '').trim() === String(auditId)) matched = true;
            if (iID2 >= 0 && String(rr[iID2] || '').trim() === String(auditId)) matched = true;
            if (!matched) continue;
            var d = auditorV5_formatDateYMD_(iDate >= 0 ? rr[iDate] : '');
            if (d && days.indexOf(d) < 0) days.push(d);
            function addM_(a,b){
              var sm = auditorV5_timeToMinutes_(a), em = auditorV5_timeToMinutes_(b);
              if (isFinite(sm) && isFinite(em) && em > sm) mins += (em-sm);
            }
            if (iID1 >= 0 && String(rr[iID1] || '').trim() === String(auditId)) addM_(iS1 >= 0 ? rr[iS1] : '', iE1 >= 0 ? rr[iE1] : '');
            if (iID2 >= 0 && String(rr[iID2] || '').trim() === String(auditId)) addM_(iS2 >= 0 ? rr[iS2] : '', iE2 >= 0 ? rr[iE2] : '');
          }
          days.sort();
          if (!out.plannedDates && days.length) out.plannedDates = days[0] + (days.length > 1 ? ' (+' + (days.length-1) + ')' : '');
          if (!out._firstDateObj && days.length) out._firstDateObj = auditorV5_parseDate_(days[0]);
          if (!out.plannedHours && mins > 0) out.plannedHours = (Math.round((mins/60) * 4) / 4).toString();
          if (!out.plannedTooltip && days.length) out.plannedTooltip = days.join('\n');
        }
      }
    }
  } catch(e) {}
  return out;
}
function auditorV5_extractPlannedSummary_(planningJsonCell) {
  var out = { plannedDates:"", plannedHours:"", plannedTooltip:"", _firstDateObj:null };
  if (!planningJsonCell) return out;

  var obj = null;
  try {
    obj = (typeof planningJsonCell === "string") ? JSON.parse(planningJsonCell) : planningJsonCell;
  } catch(e) {
    return out;
  }
  if (!obj) return out;

  function clean_(v) {
    return String(v == null ? '' : v).trim();
  }

  function firstValue_(node, keys) {
    if (!node || typeof node !== 'object') return '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (node[k] !== null && node[k] !== undefined && clean_(node[k]) !== '') return node[k];
    }
    return '';
  }

  function normTime_(v) {
    var s = clean_(v);
    if (!s) return '';
    var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return s;
    return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
  }

  function directHours_(root) {
    var keys = [
      'totalPlannedHours', 'plannedHours', 'hoursPlanned', 'totalHours',
      'TotalPlannedHours', 'PlannedHours', 'HoursPlanned'
    ];
    for (var i = 0; i < keys.length; i++) {
      var v = root && root[keys[i]];
      if (v === null || v === undefined || v === '') continue;
      var n = Number(v);
      if (isFinite(n) && n > 0) return String(Math.round(n * 100) / 100);
      var s = clean_(v);
      if (s) return s;
    }
    return '';
  }

  var blocks = [];
  var seen = {};

  function pushBlock_(dateVal, startVal, endVal) {
    var dObj = auditorV5_parseDate_(dateVal);
    if (!dObj) return;
    var dateKey = Utilities.formatDate(dObj, auditorV5_getTz_(), "yyyy-MM-dd");
    var st = normTime_(startVal);
    var en = normTime_(endVal);
    var key = dateKey + '|' + st + '|' + en;
    if (seen[key]) return;
    seen[key] = true;
    blocks.push({ date: dateKey, start: st, end: en, _dateObj: dObj });
  }

  function visit_(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) visit_(node[i]);
      return;
    }
    if (typeof node !== 'object') return;

    var dateVal = firstValue_(node, [
      'date', 'day', 'iso', 'dateIso', 'auditDate', 'plannedDate', 'Date', 'Day'
    ]);
    var startVal = firstValue_(node, [
      'start', 'from', 'startTime', 'timeFrom', 'Start', 'From', 'StartTime'
    ]);
    var endVal = firstValue_(node, [
      'end', 'to', 'endTime', 'timeTo', 'End', 'To', 'EndTime'
    ]);

    if (dateVal) pushBlock_(dateVal, startVal, endVal);

    var childKeys = [
      'blocks', 'slots', 'days', 'segments', 'selections', 'selectedDays',
      'plannedDays', 'plannedDates', 'items', 'planning', 'Planning',
      'Blocks', 'Slots', 'Days'
    ];
    for (var k = 0; k < childKeys.length; k++) {
      var child = node[childKeys[k]];
      if (child !== null && child !== undefined) visit_(child);
    }
  }

  visit_(obj);

  blocks.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
  });

  var dayMap = {};
  var dayKeys = [];
  var totalMin = 0;
  var lines = [];
  var first = null;

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    if (!dayMap[b.date]) {
      dayMap[b.date] = true;
      dayKeys.push(b.date);
    }
    if (!first || b._dateObj < first) first = b._dateObj;

    var sm = auditorV5_timeToMinutes_(b.start);
    var em = auditorV5_timeToMinutes_(b.end);
    if (isFinite(sm) && isFinite(em) && em > sm) totalMin += (em - sm);

    var line = b.date;
    if (b.start && b.end) line += ' ' + b.start + '-' + b.end;
    else if (b.start) line += ' ' + b.start;
    else if (b.end) line += ' ' + b.end;
    if (line) lines.push(line);
  }

  dayKeys.sort();
  if (dayKeys.length) {
    out._firstDateObj = first || auditorV5_parseDate_(dayKeys[0]);
    out.plannedDates = dayKeys[0] + (dayKeys.length > 1 ? " (+" + (dayKeys.length - 1) + ")" : "");
  }

  if (lines.length) out.plannedTooltip = lines.join('\n');

  if (totalMin > 0) {
    out.plannedHours = String(Math.round((totalMin / 60) * 4) / 4);
  } else {
    out.plannedHours = directHours_(obj);
  }

  return out;
}
// ---------------------------
// ---------------------------
// Completion logging (Auditor COMPLETE)
// Writes one row into "Log realized audits" using header-based mapping.
// Minimal required: Audit ID, Status, Auditor email, Hours dedicated.
// Best-effort: Company, Location, First planned day, Planning JSON, Scopes.
// ---------------------------
function auditorV5_getLogRealizedSheet_() {
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Log realized audits");
  if (!sh) throw new Error('Sheet "Log realized audits" not found');
  return sh;
}
function auditorV5_appendLogRealizedFromPlanningRow_(auditId, planningHeaders, planningRow, hoursDedicated, auditorEmail) {
  var sh = auditorV5_getLogRealizedSheet_();
  var hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(x){ return String(x||"").trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var out = new Array(hdr.length).fill("");
  function set_(names, val) {
    var idx = H(names);
    if (idx >= 0) out[idx] = val;
  }
  function pickPlanning_(names) {
    var idx = -1;
    for (var i=0;i<names.length;i++){
      idx = planningHeaders.indexOf(names[i]);
      if (idx >= 0) break;
    }
    return idx >= 0 ? planningRow[idx] : "";
  }
  // Core fields
  set_(["Audit ID","Audit Id","AuditID","AuditId","Audit UID","Audit_UID"], String(auditId||""));
  set_(["Status"], "Completed");
  set_(["Auditor email","Auditor Email","Email","E-mail"], String(auditorEmail||""));
  set_(["Hours dedicated","Hours Dedicated","Hours_dedicated","Dedicated hours"], Number(hoursDedicated||0));
  set_(["Date completed","Date Completed","Completed date","Completion date"], auditorV5_formatDateYMD_(new Date()));
  // Best-effort contextual fields from Audit planning
  set_(["Company","Company name","Client"], pickPlanning_(["Company","Company name","Client"]));
  set_(["Location","Site","Audit location"], pickPlanning_(["Location","Site","Audit location"]));
  set_(["First planned day","Planned date","Planned start","Start date","Date","Date Planned"], auditorV5_formatDateYMD_(pickPlanning_(["First planned day","Date Planned","Planned date","Start date","Date"])));
  set_(["Planning JSON","PlanningJSON","Planning","Planning js","Planning_Js"], pickPlanning_(["Planning JSON","PlanningJSON","Planning","Planning js","Planning_Js"]));
  set_(["Standard / Scopes","Scopes","Standard","Standards","Scope"], pickPlanning_(["Scopes","Standard / Scopes","Standards","Standard","Scope","Scopes_List"]));
  set_(["Hours planned","Hours Planned","Planned hours","Planned Hours"], pickPlanning_(["Hours planned","Planned hours","Planned Hours","Hours Planned"]));
  sh.appendRow(out);
}
// Auditor actions (Accept / Deny / Cancel)
// Status vocabulary in sheet (human-readable):
// - Approved -> auditor decides (Accept/Deny)
// - Pending Planning, Pending Approval
// - Accepted may be written by Accept action
// ---------------------------
function auditorV5_syncAuditArtifactsSafe_(auditId, fullRebuild) {
  var out = { success:true, auditId:String(auditId || '').trim(), fullRebuild:!!fullRebuild, auditTime:null, planningWindow:null };
  try {
    if (typeof AuditTimeV5_RebuildTotalHours === 'function') out.auditTime = AuditTimeV5_RebuildTotalHours();
    else out.auditTime = { success:false, message:'AuditTimeV5_RebuildTotalHours not found' };
  } catch (e1) {
    out.auditTime = { success:false, message:String(e1 && e1.message ? e1.message : e1) };
  }
  try {
    if (!fullRebuild && out.auditId && typeof AnnualCycleEngineV5_RecalculatePlanningWindowForAuditId === 'function') out.planningWindow = AnnualCycleEngineV5_RecalculatePlanningWindowForAuditId(out.auditId);
    else if (typeof AnnualCycleEngineV5_RecalculatePlanningWindowsAll === 'function') out.planningWindow = AnnualCycleEngineV5_RecalculatePlanningWindowsAll();
    else out.planningWindow = { success:false, message:'Planning window rebuild function not found' };
  } catch (e2) {
    out.planningWindow = { success:false, message:String(e2 && e2.message ? e2.message : e2) };
  }
  return out;
}
function auditorV5_invalidateGridCacheForAuditActors_(headers, row, actorEmail) {
  try {
    var emails = {};
    function add_(v) {
      v = String(v || '').trim().toLowerCase();
      if (!v || v.indexOf('@') < 0) return;
      emails[v] = true;
    }
    add_(actorEmail);
    if (headers && row) {
      var idxAssignedTo = headers.indexOf("Assigned to");
      var idxPreassigned = headers.indexOf("Preassigned to");
      if (idxPreassigned < 0) idxPreassigned = headers.indexOf("Preassigned auditor");
      if (idxPreassigned < 0) idxPreassigned = headers.indexOf("Preassigned Auditor");
      if (idxAssignedTo >= 0) add_(row[idxAssignedTo]);
      if (idxPreassigned >= 0) add_(row[idxPreassigned]);
    }
    for (var k in emails) {
      if (Object.prototype.hasOwnProperty.call(emails, k)) auditorV5_invalidateUserGridCache_(k);
    }
  } catch (e) {}
}
function AuditorV5_Action(auditId, action, payload) {
  // CONSOLIDATED_AUDITOR_STABLE_20260410_091500
  // Runtime-safe alias: force all generic callers onto the unique action endpoint.
  return AuditorV5_Action_U20260410(auditId, action, payload);
}
function auditorV5_isDenyCancelAllowedStatus_(status) {
  if (typeof Status_canTransition_ === 'function') {
    return Status_canTransition_({ status: status, action: 'CANCEL', role: 'AUDITOR' }).ok;
  }
  var s = String(status || "").trim();
  return s === "Pending Approval" || s === "Approved" || s === "Accepted";
}

function auditorV5_requireTransition_(status, action, role) {
  if (typeof Status_applyTransition_ !== 'function') {
    throw new Error('StatusMachine missing: Status_applyTransition_ not available');
  }
  var t = Status_applyTransition_({
    status: status,
    action: action,
    role: role
  });
  if (!t || !t.ok) {
    throw new Error(String(action || '') + ' not allowed from status "' + String(status || '') + '"');
  }
  return t;
}


function auditorV5_buildActionUiPatch_(auditId, action, newStatus, removeRow) {
  return {
    auditId: String(auditId || '').trim(),
    action: String(action || '').trim().toLowerCase(),
    newStatus: String(newStatus || '').trim(),
    removeRow: !!removeRow
  };
}

function AuditorV5_Action_U20260410(auditId, action, payload) {
  payload = payload || {};
  auditId = String(auditId || "").trim();
  action = String(action || "").trim().toLowerCase();
  if (!auditId) throw new Error("Missing auditId");
  if (!action) throw new Error("Missing action");
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Audit planning");
  if (!sh) throw new Error('Missing sheet "Audit planning"');
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('"Audit planning" is empty');
  var headers = values[0].map(function(x){ return String(x || "").trim(); });
  var idxAuditId = headers.indexOf("Audit ID");
  var idxStatus  = headers.indexOf("Status");
  var idxAssignedTo = headers.indexOf("Assigned to");
  if (idxAuditId < 0) throw new Error('Header "Audit ID" not found');
  if (idxStatus  < 0) throw new Error('Header "Status" not found');
  var rowIndex = -1;
  for (var r=1; r<values.length; r++) {
    if (String(values[r][idxAuditId] || "").trim() === auditId) { rowIndex = r; break; }
  }
  if (rowIndex < 0) throw new Error("Audit not found: " + auditId);
  var currentStatus = String(values[rowIndex][idxStatus] || "").trim();
  var actorEmail = "";
  try { actorEmail = String(auditorV5_getActiveEmail_() || "").trim().toLowerCase(); } catch (eAct) {}
  if (!actorEmail && idxAssignedTo >= 0) {
    actorEmail = String(values[rowIndex][idxAssignedTo] || "").trim().toLowerCase();
  }
  function setStatus_(newStatus) {
    sh.getRange(rowIndex + 1, idxStatus + 1).setValue(newStatus);
    SpreadsheetApp.flush();
  }
  function releaseAvailability_(opts) {
    opts = opts || {};
    // Important: when pastOnly=true, do NOT delegate to external helper unless it explicitly supports that filter.
    // The current ManagerPlanning helper commonly accepts only auditId and would otherwise clear all dates.
    if (!opts.pastOnly) {
      try {
        if (typeof V5_availabilityClearAuditId_ === 'function') {
          return V5_availabilityClearAuditId_(auditId);
        }
      } catch (e0) {}
    }
    // Best-effort local fallback if ManagerPlanning helper is unavailable or if pastOnly filtering is required.
    try {
      var shAv = ss.getSheetByName("Auditor Availability") || ss.getSheetByName("Auditor availability");
      if (!shAv) return { success:false, message:'Auditor Availability sheet not found' };
      var lastCol = shAv.getLastColumn();
      var lastRow = shAv.getLastRow();
      if (lastRow < 2) return { success:true, changed:0, rows:0, message:'No rows' };
      var hdr = shAv.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v || '').trim(); });
      function hidx_(names) {
        var lc = hdr.map(function(v){ return String(v || '').trim().toLowerCase().replace(/[_\s]+/g, ' '); });
        for (var i = 0; i < names.length; i++) {
          var key = String(names[i] || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
          var idx = lc.indexOf(key);
          if (idx >= 0) return idx;
        }
        return -1;
      }
      var iDate = hidx_(['Date']);
      var iAvail = hidx_(['Available']);
      var iS1 = hidx_(['First_Audit_Start_Time','First Audit Start Time']);
      var iE1 = hidx_(['First_Audit_End_Time','First Audit End Time']);
      var iId1 = hidx_(['Audit_ID_1','Audit ID 1']);
      var iS2 = hidx_(['Second_Audit_Start_Time','Second Audit Start Time']);
      var iE2 = hidx_(['Second_Audit_End_Time','Second Audit End Time']);
      var iId2 = hidx_(['Audit_ID_2','Audit ID 2']);
      var iSt1 = hidx_(['Status_1','Status 1','Status']);
      var iSt2 = hidx_(['Status_2','Status 2']);
      var iUpd = hidx_(['Last_Updated','Last Updated','Timestamp']);
      var tz = auditorV5_getTz_();
      var todayIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      var vals = shAv.getRange(2,1,lastRow-1,lastCol).getValues();
      var changed = 0, rowsTouched = 0;
      var deleteRowIdxs_ = [];
      if (typeof AS_isDefaultOrManualBlock_ !== 'function') {
        throw new Error('AuditorV5Backend requires AS_isDefaultOrManualBlock_ from AvailabilityService.js');
      }
      for (var rr = 0; rr < vals.length; rr++) {
        var row = vals[rr];
        var rowChanged = false;
        var rowDate = '';
        if (iDate >= 0) {
          try {
            rowDate = auditorV5_formatDateYMD_(row[iDate]);
          } catch(e1) {
            rowDate = '';
          }
        }
        if (opts.pastOnly && rowDate && !(rowDate < todayIso)) continue;
        if (iId1 >= 0 && String(row[iId1] || '').trim() === auditId) {
          if (iS1 >= 0) row[iS1] = '';
          if (iE1 >= 0) row[iE1] = '';
          row[iId1] = '';
          if (iSt1 >= 0) row[iSt1] = '';
          changed++;
          rowChanged = true;
        }
        if (iId2 >= 0 && String(row[iId2] || '').trim() === auditId) {
          if (iS2 >= 0) row[iS2] = '';
          if (iE2 >= 0) row[iE2] = '';
          row[iId2] = '';
          if (iSt2 >= 0) row[iSt2] = '';
          changed++;
          rowChanged = true;
        }
        if (!rowChanged) continue;
        rowsTouched++;
        var hasAudit1 = (iId1 >= 0) && String(row[iId1] || '').trim();
        var hasAudit2 = (iId2 >= 0) && String(row[iId2] || '').trim();
        var keepBlocked = AS_isDefaultOrManualBlock_(iSt1 >= 0 ? row[iSt1] : '') || AS_isDefaultOrManualBlock_(iSt2 >= 0 ? row[iSt2] : '');
        if (!hasAudit1 && !hasAudit2) {
          if (keepBlocked) {
            if (iAvail >= 0) row[iAvail] = 'NO';
            if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
          } else {
            // Do NOT delete the row after cancel/deny.
            // Keep the day as a normal free day so the audit can return to Pending Planning
            // without disappearing from the Auditor grid because of row removal side-effects.
            if (iAvail >= 0) row[iAvail] = 'YES';
            if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
          }
        } else {
          if (iAvail >= 0) row[iAvail] = 'NO';
          if (iUpd >= 0) row[iUpd] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
        }
      }
      if (changed) {
        var deleteRowIdxs_ = deleteRowIdxs_ || [];
        shAv.getRange(2,1,lastRow-1,lastCol).setValues(vals);
        if (deleteRowIdxs_.length) {
          deleteRowIdxs_.sort(function(a,b){ return b-a; });
          for (var dd = 0; dd < deleteRowIdxs_.length; dd++) {
            shAv.deleteRow(deleteRowIdxs_[dd]);
          }
        }
        try {
          var sortDateCol = (iDate >= 0) ? (iDate + 1) : 1;
          var sortEmailCol = hidx_(['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']);
          var lrNow = shAv.getLastRow();
          if (lrNow >= 3) {
            if (sortEmailCol >= 0) shAv.getRange(2,1,lrNow-1,lastCol).sort([{column:sortDateCol, ascending:true},{column:sortEmailCol+1, ascending:true}]);
            else shAv.getRange(2,1,lrNow-1,lastCol).sort([{column:sortDateCol, ascending:true}]);
          }
        } catch (eSort) {}
        SpreadsheetApp.flush();
      }
      return { success:true, changed:changed, rows:rowsTouched, message:'Local availability clear: ' + changed };
    } catch (e2) {
      return { success:false, message:String(e2 && e2.message ? e2.message : e2) };
    }
  }
  if (action === "accept") {
    // Governance fix 2026-05-04: Auditor Accept must use the central
    // StatusMachine action owner. No direct status write, notification write,
    // artifact sync, or lifecycle side-effect is executed from Auditor backend.
    if (typeof Status_applyAction !== 'function') {
      throw new Error('AuditorV5_Action_U20260410: Status_applyAction not deployed — fail-loud per governance');
    }

    var acceptPayload = {};
    for (var ak in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, ak)) acceptPayload[ak] = payload[ak];
    }
    acceptPayload.actorRole = 'AUDITOR';
    acceptPayload.actorEmail = actorEmail;

    var acceptResult = Status_applyAction('AUDITOR', 'ACCEPT', auditId, acceptPayload);
    if (!acceptResult || acceptResult.success === false) {
      return acceptResult || { success:false, message:'StatusMachine action failed for ACCEPT' };
    }

    try { auditorV5_invalidateGridCacheForAuditActors_(headers, values[rowIndex], actorEmail); } catch (eInv1) {}

    var acceptStatusDisplay = String(acceptResult.afterStatusDisplay || acceptResult.newStatus || 'Accepted');
    var acceptStatusNorm = String((typeof Status_normalizeStatus_ === 'function')
      ? Status_normalizeStatus_(acceptStatusDisplay)
      : acceptStatusDisplay.toUpperCase().replace(/\s+/g, '_'));

    return {
      ok: true,
      success: true,
      auditId: auditId,
      action: action,
      from: String((typeof Status_toDisplayStatus_ === 'function') ? Status_toDisplayStatus_(currentStatus) : currentStatus),
      to: acceptStatusDisplay,
      newStatus: acceptStatusNorm,
      statusResult: acceptResult,
      uiPatch: auditorV5_buildActionUiPatch_(auditId, action, acceptStatusNorm, false)
    };
  } else if (action === "deny" || action === "cancel") {
    // Governance fix 2026-05-04: Auditor Cancel/Deny must use the same
    // central reopen owner as Manager actions. No direct status/planning-field
    // writes here; StatusMachine owns transition + planning reset + availability
    // release, AuditLifecycleService owns auditor decision metadata.
    if (typeof Status_applyAction !== 'function') {
      throw new Error('AuditorV5_Action_U20260410: Status_applyAction not deployed — fail-loud per governance');
    }

    var actionUpper = action === 'deny' ? 'DENY' : 'CANCEL';
    var centralPayload = {};
    for (var pk in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, pk)) centralPayload[pk] = payload[pk];
    }
    centralPayload.actorRole = 'AUDITOR';
    centralPayload.actorEmail = actorEmail;
    centralPayload.reason = String((payload && payload.reason) || '').trim();

    var centralResult = Status_applyAction('AUDITOR', actionUpper, auditId, centralPayload);
    if (!centralResult || centralResult.success === false) {
      return centralResult || { success:false, message:'StatusMachine action failed for ' + actionUpper };
    }

    try {
      auditorV5_notifyManager_(
        action === 'deny' ? 'AUDIT_DENIED_BY_AUDITOR' : 'AUDIT_CANCELLED_BY_AUDITOR',
        auditId,
        headers,
        values[rowIndex],
        { comment: centralPayload.reason, resultStatus: 'Returned to Pending Planning' }
      );
    } catch (eNotify) {}
    try { auditorV5_invalidateGridCacheForAuditActors_(headers, values[rowIndex], actorEmail); } catch (eInvReopen) {}
  } else if (action === "complete") {
    var transitionComplete = auditorV5_requireTransition_(currentStatus, 'COMPLETE', 'AUDITOR');
    var hrs = payload && payload.hoursDedicated;
    hrs = (typeof hrs === 'string') ? hrs.trim() : hrs;
    hrs = Number(hrs);
    if (!(hrs > 0)) throw new Error("Hours dedicated must be > 0");
    var q = Math.round(hrs * 4) / 4;
    if (Math.abs(q - hrs) > 1e-9) throw new Error("Hours dedicated must be in steps of 0.25");
    actorEmail = "";
    if (idxAssignedTo >= 0) actorEmail = String(values[rowIndex][idxAssignedTo] || "").trim().toLowerCase();
    if (!actorEmail) {
      try { actorEmail = String(auditorV5_getActiveEmail_() || "").trim().toLowerCase(); } catch (e) {}
    }
    if (!actorEmail) throw new Error("Missing actor email (cannot commit completion)");
    var res = null;
    try {
      if (typeof CompletionService_CommitCompletion === 'function') {
        res = CompletionService_CommitCompletion({ auditId: auditId, hoursDedicated: q, actorEmail: actorEmail, mode: 'AUDITOR' });
      } else if (typeof ManagerV5_CommitCompletion === 'function') {
        res = ManagerV5_CommitCompletion({ auditId: auditId, hoursDedicated: q, actorEmail: actorEmail, mode: 'AUDITOR' });
      } else {
        throw new Error('CompletionService_CommitCompletion not found (SSOT completion missing)');
      }
    } catch (e) {
      throw new Error("Completion commit failed: " + (e && e.message ? e.message : e));
    }
    if (!res || res.success === false) return res || { success:false, message:'Completion failed' };
    var relComplete = releaseAvailability_({ pastOnly:true });
    if (!relComplete || relComplete.success === false) {
      return {
        success:false,
        message:'Completion committed, but availability cleanup failed. Manual repair required.',
        completionCommitted:true,
        auditId:auditId,
        release: relComplete || null
      };
    }
    try { auditorV5_notifyManager_("AUDIT_COMPLETED", auditId, headers, values[rowIndex]); } catch (e) {}
    try { auditorV5_invalidateGridCacheForAuditActors_(headers, values[rowIndex], actorEmail); } catch (eInv4) {}
    res.ok = true;
    res.success = (res.success !== false);
    res.auditId = auditId;
    res.action = action;
    res.newStatus = String((transitionComplete && transitionComplete.afterStatusDisplay) || "Completed");
    res.from = currentStatus;
    res.to = String((transitionComplete && transitionComplete.afterStatusDisplay) || "Completed");
    res.uiPatch = auditorV5_buildActionUiPatch_(auditId, action, res.newStatus, true);
    res.artifactSync = auditorV5_syncAuditArtifactsSafe_(auditId, true);
    return res;
  } else {
    throw new Error("Unknown action: " + action);
  }
  try { CacheService.getScriptCache().remove("AUD_V5_COMPANYINFO_V9"); } catch(e) {}
  try { auditorV5_invalidateGridCacheForAuditActors_(headers, values[rowIndex], actorEmail); } catch (eInv5) {}
  var _finalStatusRaw = String(sh.getRange(rowIndex+1, idxStatus+1).getValue() || "");
  var _finalStatusNorm = String((typeof Status_normalizeStatus_ === 'function') ? Status_normalizeStatus_(_finalStatusRaw) : _finalStatusRaw.toUpperCase().replace(/\s+/g, "_"));
  return {
    ok: true,
    auditId: auditId,
    action: action,
    from: String((typeof Status_toDisplayStatus_ === 'function') ? Status_toDisplayStatus_(currentStatus) : currentStatus),
    to: _finalStatusRaw,
    newStatus: _finalStatusNorm,
    uiPatch: auditorV5_buildActionUiPatch_(auditId, action, _finalStatusNorm, false),
    clearedAssignedTo: true,
    artifactSync: auditorV5_syncAuditArtifactsSafe_(auditId, false)
  };
}
/*********************
 * NOTIFICATIONS V5 (Auditor-side hooks)
 * LOCKED FLOW: Business event → Notification Queue → Digest Sender
 * This module ONLY enqueues rows into "Notification Queue". No direct mail sending.
 *********************/
function auditorV5_getNotificationQueueSheet_() {
  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Notification Queue");
  if (!sh) throw new Error('Sheet "Notification Queue" not found');
  return sh;
}
function auditorV5_normHeader_(h) {
  return String(h||"").trim().toLowerCase().replace(/\s+/g, " ");
}
function auditorV5_queueNotification_(to, type, auditId, company, subject, body) {
  if (to && typeof to === 'object' && to.email) to = to.email;
  to = String(to || "").trim();
  if (!to) throw new Error("Missing recipient email");
  var sh = auditorV5_getNotificationQueueSheet_();
  var hash = "";
  try {
    hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify({
      type: String(type || ""),
      to: to,
      auditId: String(auditId || ""),
      company: String(company || ""),
      subject: String(subject || ""),
      body: String(body || "")
    }), Utilities.Charset.UTF_8).map(function(b){
      var v = (b < 0 ? b + 256 : b);
      return ('0' + v.toString(16)).slice(-2);
    }).join('');
  } catch (e) {}

  sh.appendRow([
    Utilities.formatDate(new Date(), auditorV5_getTz_(), 'yyyy-MM-dd HH:mm'), // A TimestampCreated
    "PENDING",                    // B Status
    String(type || ""),           // C Type
    to,                            // D Recipient
    String(auditId || ""),        // E Audit ID
    String(company || ""),        // F Company
    String(subject || ""),        // G Subject
    String(body || ""),           // H Body
    0,                             // I Attempts
    "",                           // J LastError
    hash,                          // K PayloadHash
    "",                           // L TimestampSent
    ""                            // M Reserved
  ]);
  return { ok:true, to:to, type:type, auditId:auditId };
}
function auditorV5_getManagerEmailFromRow_(headers, row) {
  headers = headers || [];
  row = row || [];
  var cand = ["Manager Email","Manager_Email","Planner Email","Planner_Email","Manager","Planner"];
  for (var i=0;i<cand.length;i++){
    var idx = headers.indexOf(cand[i]);
    if (idx >= 0) {
      var v = String(row[idx]||"").trim();
      if (v) return v;
    }
  }
  var p = PropertiesService.getScriptProperties();
  var v1 = String(p.getProperty("MANAGER_EMAIL") || "").trim();
  if (v1) return v1;
  var v2 = String(p.getProperty("V5_MANAGER_EMAIL") || "").trim();
  if (v2) return v2;
  // Fallback: send to system mailbox so nothing is lost
  return "planning@agriqa.es";
}
function auditorV5_notifyManager_(eventType, auditId, headers, row, overrides) {
  if (typeof NB_queueNotification_ !== "function") {
    throw new Error('NB_queueNotification_ not available in Auditor backend. Deploy NotificationBuilder.gs together with this file.');
  }

  headers = headers || [];
  row = row || [];
  overrides = overrides || {};

  var to = auditorV5_getManagerEmailFromRow_(headers, row);
  var company = "";
  var idxCompany = headers.indexOf("Company");
  if (idxCompany >= 0) company = String(row[idxCompany] || "").trim();

  var idxAuditorComment = headers.indexOf("Auditor comment (last)");
  var idxAssignedTo = headers.indexOf("Assigned to");

  var comment = "";
  if (overrides.hasOwnProperty("comment")) {
    comment = String(overrides.comment || "").trim();
  } else if (idxAuditorComment >= 0) {
    comment = String(row[idxAuditorComment] || "").trim();
  }

  var auditorNameOrEmail = "";
  if (overrides.hasOwnProperty("actor")) {
    auditorNameOrEmail = String(overrides.actor || "").trim();
  } else if (idxAssignedTo >= 0) {
    auditorNameOrEmail = String(row[idxAssignedTo] || "").trim();
  }

  var resultStatus = "";
  if (eventType === "AUDIT_ACCEPTED") resultStatus = "Accepted";
  else if (eventType === "AUDIT_COMPLETED") resultStatus = "Completed";
  else if (eventType === "AUDIT_DENIED_BY_AUDITOR" || eventType === "AUDIT_CANCELLED_BY_AUDITOR") resultStatus = "Returned to Pending Planning";

  if (overrides.hasOwnProperty("resultStatus")) {
    resultStatus = String(overrides.resultStatus || "").trim();
  }

  // F4-K-K2 (_d12): fail-loud return-value check. Previously the result was
  // returned blindly; an EVENT_DISABLED skip or a queue-write failure would
  // disappear silently. Logger.log non-success outcomes so they show up in
  // the Apps Script execution log. Re-applied on fresh deployed baseline
  // (build CONSOLIDATED_AUDITOR_STABLE_20260410_091500 / C10_20260426).
  var queueResult = NB_queueNotification_(to, String(eventType || ""), {
    company: company,
    auditId: String(auditId || ""),
    actor: auditorNameOrEmail,
    actorRole: "Auditor",
    recipientRole: "manager",
    comment: comment,
    resultStatus: resultStatus
  });

  try {
    if (!queueResult || queueResult.success !== true) {
      Logger.log('[AUDITOR_NOTIFY][FAIL] ' + JSON.stringify({
        eventType: String(eventType || ""),
        auditId: String(auditId || ""),
        recipient: to,
        result: queueResult
      }));
    } else if (queueResult.skipped === true) {
      Logger.log('[AUDITOR_NOTIFY][SKIP] ' + JSON.stringify({
        eventType: String(eventType || ""),
        auditId: String(auditId || ""),
        recipient: to,
        reason: queueResult.reason || 'unknown'
      }));
    }
  } catch (eLog) {}

  return queueResult;
}


function auditorV5_escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function auditorV5_parseLocationsJson_(raw) {
  raw = String(raw || '').trim();
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function(x){ return x && (x.active !== false); }).map(function(x){
      return {
        code: String(x.code || '').trim(),
        name: String(x.name || '').trim(),
        gps: String(x.gps || '').trim(),
        comment: String(x.comment || '').trim()
      };
    });
  } catch(e) {
    return [];
  }
}

function auditorV5_buildLocationsSummary_(companyInfo) {
  companyInfo = companyInfo || {};
  var arr = auditorV5_parseLocationsJson_(companyInfo.locationsJson || '');
  if (!arr.length) {
    var bits = [];
    if (companyInfo.location) bits.push(String(companyInfo.location));
    if (companyInfo.gps) bits.push(String(companyInfo.gps));
    return bits.join(' — ');
  }
  return arr.slice(0, 5).map(function(x){
    var head = (x.code ? x.code + ': ' : '') + (x.name || '');
    if (x.comment) head += ' — ' + x.comment;
    return head;
  }).join(' | ');
}

function auditorV5_exportLocationEntries_(companyInfo) {
  companyInfo = companyInfo || {};
  var arr = auditorV5_parseLocationsJson_(companyInfo.locationsJson || '');
  if (!arr.length) {
    return [{
      code: 'HQ',
      name: String(companyInfo.location || '').trim(),
      gps: String(companyInfo.gps || '').trim(),
      comment: ''
    }].filter(function(x){ return x.name || x.gps; });
  }
  return arr;
}

function auditorV5_exportGpsHq_(companyInfo) {
  var entries = auditorV5_exportLocationEntries_(companyInfo);
  if (entries.length && entries[0].gps) return String(entries[0].gps || '').trim();
  return String((companyInfo && companyInfo.gps) || '').trim();
}

function auditorV5_exportOtherLocations_(companyInfo) {
  var entries = auditorV5_exportLocationEntries_(companyInfo);
  if (!entries.length) return '';
  var others = entries.slice(1);
  if (!others.length) return '';
  return others.map(function(x){
    var bits = [];
    var head = '';
    if (x.code) head += String(x.code).trim();
    if (x.name) head += (head ? ': ' : '') + String(x.name).trim();
    if (head) bits.push(head);
    if (x.gps) bits.push(String(x.gps).trim());
    if (x.comment) bits.push(String(x.comment).trim());
    return bits.join(' — ');
  }).join(' | ');
}

function auditorV5_loadExportSourceRows_(auditIds, auditorEmail) {
  auditIds = Array.isArray(auditIds) ? auditIds : [];
  var wanted = {};
  auditIds.forEach(function(id){
    id = String(id || '').trim();
    if (id) wanted[id] = true;
  });
  var ss = auditorV5_getSs_();
  var companyInfo = auditorV5_buildCompaniesLookup_();
  var auditorMaps = auditorV5_buildAuditorMaps_();
  var auditorName = String((auditorMaps.emailToName && auditorMaps.emailToName[auditorEmail]) || '').trim().toLowerCase();
  var out = {};

  var sh = ss.getSheetByName('Audit planning');
  if (sh && Object.keys(wanted).length) {
    var data = sh.getDataRange().getValues();
    if (data && data.length > 1) {
      var hdr = data[0].map(function(x){ return String(x||'').trim(); });
      var H = auditorV5_headerIndex_(hdr);
      var idxAuditId   = H(['Audit ID','Audit Id','AuditID','AuditId','auditId','Audit UID','Audit_UID','AuditUID']);
      var idxCompany   = H(['Company','Company name','Client']);
      var idxAssigned  = H(['Assigned to']);
      var idxPreassigned = H(['Preassigned to','Preassigned','Preassigned auditor','Preassigned auditor email']);
      var idxStatus    = H(['Status']);
      var idxPlanning  = H(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
      var idxLocation  = H(['Location','Site','Audit location']);
      var idxPlanFrom  = H(['Planning window from','Plan van','Planning from','Planning from date','Plan from','Planning start','Plan start']);
      var idxPlanTo    = H(['Planning window to','Plan tot','Planning to','Planning to date','Plan to','Planning end','Plan end']);
      var idxToBePlanned = H(['Total audit time in hours','To be planned','To be Planned','ToBePlanned','Hours to plan','Hours to be planned']);
      var idxAllowSelfPlanning = H(['Self planning','Self Planning','Allow self planning','Allow Self Planning','SelfPlanning']);
      var idxExtExpiration = H(['Extended Expiration Date','Extended Expiry Date','Effective expiry','Effective Expiry','Extended Expiration','Effective expiration','Expiration date','Expiry date']);
      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var id = idxAuditId >= 0 ? String(row[idxAuditId] || '').trim() : '';
        if (!id || !wanted[id] || out[id]) continue;
        var assigned = idxAssigned >= 0 ? String(row[idxAssigned] || '').trim().toLowerCase() : '';
        var preassigned = idxPreassigned >= 0 ? String(row[idxPreassigned] || '').trim().toLowerCase() : '';
        var match = false;
        if (assigned && assigned === auditorEmail) match = true;
        else if (assigned && auditorName && assigned === auditorName) match = true;
        else if (!assigned && preassigned && preassigned === auditorEmail) match = true;
        else if (!assigned && preassigned && auditorName && preassigned === auditorName) match = true;
        if (!match) continue;
        var statusRaw = idxStatus >= 0 ? String(row[idxStatus] || '').trim() : '';
        var statusNorm = (typeof Status_normalizeStatus_ === 'function') ? Status_normalizeStatus_(statusRaw) : statusRaw.toUpperCase().replace(/\s+/g, '_');
        if (statusNorm === 'COMPLETED') continue;
        var company = idxCompany >= 0 ? String(row[idxCompany] || '').trim() : '';
        var ci = (companyInfo.byName && companyInfo.byName[String(company).toLowerCase()]) || {};
        var planned = auditorV5_extractPlannedSummary_(idxPlanning >= 0 ? row[idxPlanning] : '');
        var planningWindow = '';
        if (idxPlanFrom >= 0 || idxPlanTo >= 0) {
          var pfS = (idxPlanFrom >= 0) ? auditorV5_cellToYmd_(row[idxPlanFrom]) : '';
          var ptS = (idxPlanTo >= 0) ? auditorV5_cellToYmd_(row[idxPlanTo]) : '';
          if (pfS || ptS) planningWindow = (pfS || '…') + ' → ' + (ptS || '…');
        }
        out[id] = {
          auditId: id,
          company: company,
          status: statusRaw,
          scopesText: auditorV5_extractScopesForRow_(hdr, row).scopesText || '',
          plannedDates: String(planned.plannedDates || '').trim(),
          planningWindow: planningWindow,
          assignedTo: idxAssigned >= 0 ? String(row[idxAssigned] || '').trim() : '',
          toBePlanned: idxToBePlanned >= 0 ? String(row[idxToBePlanned] || '').trim() : '',
          plannedHours: String(planned.plannedHours || '').trim(),
          expirationDate: idxExtExpiration >= 0 ? auditorV5_cellToYmd_(row[idxExtExpiration]) : '',
          contactName: String(ci.contactName || '').trim(),
          contactEmail: String(ci.contactEmail || '').trim(),
          contactPhone: String(ci.contactPhone || '').trim(),
          comments: String(ci.comments || '').trim(),
          nonWorkingDays: String(ci.nonWorkingDays || '').trim(),
          hoursWorking: String(ci.hoursWorking || '').trim(),
          locationsCount: String(ci.locs || 1),
          locationsSummary: auditorV5_buildLocationsSummary_(ci),
          otherLocations: auditorV5_exportOtherLocations_(ci),
          location: String(ci.location || (idxLocation >= 0 ? row[idxLocation] : '') || '').trim(),
          region: String(ci.region || '').trim(),
          country: String(ci.country || '').trim(),
          gps: auditorV5_exportGpsHq_(ci),
          timeZone: String(ci.timeZone || '').trim(),
          languageCommunication: String(ci.languageCommunication || '').trim(),
          multiDayDetails: String(planned.plannedTooltip || '').trim(),
          _sortDate: String(planned.plannedDates || '').trim()
        };
      }
    }
  }

  if (Object.keys(out).length < Object.keys(wanted).length) {
    var shLog = ss.getSheetByName('Log realized audits');
    if (shLog) {
      var ldata = shLog.getDataRange().getValues();
      if (ldata && ldata.length > 1) {
        var hdr2 = ldata[0].map(function(x){ return String(x||'').trim(); });
        var H2 = auditorV5_headerIndex_(hdr2);
        var idxAuditId2 = H2(['Audit ID','Audit Id','AuditID','AuditId','auditId','Audit UID','Audit_UID','AuditUID']);
        var idxCompany2 = H2(['Company','Company name','Client']);
        var idxStatus2 = H2(['Status']);
        var idxAuditor2 = H2(['Auditor']);
        var idxExecutedOn2 = H2(['Date planned','Date Planned']);
        var idxCompletedDate2 = H2(['Date completed','Date Completed','Completed date','Completion date']);
        var idxHoursPlanned2 = H2(['Hours planned','Planned hours','Planned Hours','Hours Planned']);
        var idxToBePlanned2 = H2(['Hours to be planned','Hours To Be Planned','To be planned','To Be Planned']);
        var idxLocation2 = H2(['Location','Site','Audit location']);
        for (var j = 1; j < ldata.length; j++) {
          var row2 = ldata[j];
          var id2 = idxAuditId2 >= 0 ? String(row2[idxAuditId2] || '').trim() : '';
          if (!id2 || !wanted[id2] || out[id2]) continue;
          var auditorRaw = idxAuditor2 >= 0 ? String(row2[idxAuditor2] || '').trim() : '';
          var auditorKey = auditorRaw.toLowerCase();
          var auditorMatch = false;
          if (auditorKey && auditorKey.indexOf('@') > -1 && auditorKey === auditorEmail) auditorMatch = true;
          else if (auditorName && auditorKey === auditorName) auditorMatch = true;
          else if (auditorMaps.nameToEmail && String(auditorMaps.nameToEmail[auditorRaw] || auditorMaps.nameToEmail[auditorKey] || '').trim().toLowerCase() === auditorEmail) auditorMatch = true;
          if (!auditorMatch) continue;
          var company2 = idxCompany2 >= 0 ? String(row2[idxCompany2] || '').trim() : '';
          var ci2 = (companyInfo.byName && companyInfo.byName[String(company2).toLowerCase()]) || {};
          out[id2] = {
            auditId: id2,
            company: company2,
            status: idxStatus2 >= 0 ? String(row2[idxStatus2] || '').trim() : 'COMPLETED',
            scopesText: '',
            plannedDates: idxExecutedOn2 >= 0 ? auditorV5_formatDateYYYYMMDD_(row2[idxExecutedOn2]) : '',
            planningWindow: '',
            assignedTo: auditorEmail,
            toBePlanned: idxToBePlanned2 >= 0 ? String(row2[idxToBePlanned2] || '').trim() : '',
            plannedHours: idxHoursPlanned2 >= 0 ? String(row2[idxHoursPlanned2] || '').trim() : '',
            expirationDate: '',
            contactName: String(ci2.contactName || '').trim(),
            contactEmail: String(ci2.contactEmail || '').trim(),
            contactPhone: String(ci2.contactPhone || '').trim(),
            comments: String(ci2.comments || '').trim(),
            nonWorkingDays: String(ci2.nonWorkingDays || '').trim(),
            hoursWorking: String(ci2.hoursWorking || '').trim(),
            locationsCount: String(ci2.locs || 1),
            locationsSummary: auditorV5_buildLocationsSummary_(ci2),
            otherLocations: auditorV5_exportOtherLocations_(ci2),
            location: String(ci2.location || (idxLocation2 >= 0 ? row2[idxLocation2] : '') || '').trim(),
            region: String(ci2.region || '').trim(),
            country: String(ci2.country || '').trim(),
            gps: auditorV5_exportGpsHq_(ci2),
            timeZone: String(ci2.timeZone || '').trim(),
            languageCommunication: String(ci2.languageCommunication || '').trim(),
            multiDayDetails: '',
            _sortDate: idxCompletedDate2 >= 0 ? auditorV5_formatDateYYYYMMDD_(row2[idxCompletedDate2]) : ''
          };
        }
      }
    }
  }

  return out;
}

function auditorV5_buildExportRows_(auditIds, auditorEmail) {
  auditIds = Array.isArray(auditIds) ? auditIds : [];
  auditIds = auditIds.map(function(x){ return String(x || '').trim(); }).filter(Boolean);
  if (!auditIds.length) return [];
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  if (!auditorEmail) auditorEmail = auditorV5_getActiveEmail_();
  if (!auditorEmail) throw new Error('Missing auditor email');

  var byId = auditorV5_loadExportSourceRows_(auditIds, auditorEmail);
  var rows = [];
  auditIds.forEach(function(id){ if (byId[id]) rows.push(byId[id]); });
  return rows;
}

function auditorV5_exportHeaders_() {
  return [
    'Company','Locs: number of locations','Location','Region','Country','Scopes','Planned dates','Planned hours',
    'Expiration date','GPS HQ','Contactpersoon naam','Contactpersoon email','Contactpersoon telefoon','Comments',
    'Non working days','Hours working','Other locations / GPS locations','Multi-day tooltip/details'
  ];
}

function auditorV5_exportMatrix_(rows) {
  var headers = auditorV5_exportHeaders_();
  var matrix = [headers];
  (rows || []).forEach(function(r){
    matrix.push([
      r.company,
      r.locationsCount,
      r.location,
      r.region,
      r.country,
      r.scopesText,
      r.plannedDates,
      r.plannedHours,
      r.expirationDate,
      r.gps,
      r.contactName,
      r.contactEmail,
      r.contactPhone,
      r.comments,
      r.nonWorkingDays,
      r.hoursWorking,
      r.otherLocations,
      r.multiDayDetails
    ]);
  });
  return matrix;
}

function AuditorV5_ExportSelectedAudits(req) {
  req = req || {};
  var auditIds = Array.isArray(req.auditIds) ? req.auditIds : [];
  var auditorEmail = String(req.auditorEmail || '').trim().toLowerCase();
  var rows = auditorV5_buildExportRows_(auditIds, auditorEmail);
  if (!rows.length) return { success:false, message:'No exportable rows found' };
  var stamp = Utilities.formatDate(new Date(), auditorV5_getTz_(), 'yyyyMMdd_HHmm');
  return {
    success:true,
    headers: auditorV5_exportHeaders_(),
    rows: auditorV5_exportMatrix_(rows).slice(1),
    filenameBase: 'Auditor_export_' + stamp,
    rowCount: rows.length
  };
}

/***********************
 * CACHE CLEAR ENDPOINT
 ***********************/
function AuditorV5B_ClearCache(req) {
  req = req || {};
  var email = String(req.auditorEmail || '').trim().toLowerCase();
  var view = String(req.view || '').trim().toLowerCase();
  if (!email) return { success:false, message:'auditorEmail required' };

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAuditorGrid === 'function') {
      AUDIT_CACHE.removeAuditorGrid(email, view || null);
    }
  } catch (e0) {}

  // Migration cleanup for old direct keys.
  try {
    if (view) {
      CacheService.getUserCache().remove(auditorV5_userCacheKey_(email, view));
      CacheService.getScriptCache().remove(auditorV5_userCacheKey_(email, view));
    } else {
      CacheService.getUserCache().remove(auditorV5_userCacheKey_(email, 'active'));
      CacheService.getUserCache().remove(auditorV5_userCacheKey_(email, 'archived'));
      CacheService.getScriptCache().remove(auditorV5_userCacheKey_(email, 'active'));
      CacheService.getScriptCache().remove(auditorV5_userCacheKey_(email, 'archived'));
    }
    return { success:true, cache:'AUDIT_CACHE.auditor_grid' };
  } catch (e) {
    return { success:false, message:String(e) };
  }
}


/***********************
 * DATE DIAG — exact payload seen by Auditor frontend
 * BUILD: AUDITOR_DATE_DIAG_20260413
 ***********************/
function auditorV5_valueType_(v) {
  if (v === null) return 'null';
  if (typeof v === 'undefined') return 'undefined';
  if (Object.prototype.toString.call(v) === '[object Date]') return 'Date';
  return typeof v;
}

function auditorV5_debugDateCell_(label, v) {
  var isDate = (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()));
  var out = {
    label: String(label || ''),
    type: auditorV5_valueType_(v),
    raw: isDate ? '' : String(v == null ? '' : v),
    rawEpoch: isDate ? v.getTime() : '',
    rawSpreadsheetYmd: '',
    rawScriptYmd: '',
    parsedYmd: '',
    formattedYmd: ''
  };
  try {
    if (isDate) {
      out.rawSpreadsheetYmd = Utilities.formatDate(v, auditorV5_getTz_(), 'yyyy-MM-dd');
      out.rawScriptYmd = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    var p = auditorV5_parseDate_(v);
    if (p) {
      out.parsedYmd = Utilities.formatDate(p, auditorV5_getTz_(), 'yyyy-MM-dd');
      out.formattedYmd = Utilities.formatDate(p, auditorV5_getTz_(), 'yyyy-MM-dd');
    }
  } catch (e) {
    out.error = String(e && e.message ? e.message : e);
  }
  return out;
}

function AuditorV5_DateDiag_U20260413(auditId, auditorEmail) {
  auditId = String(auditId || '').trim();
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  if (!auditId) return { success:false, message:'Missing auditId' };

  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success:false, message:'Missing sheet Audit planning' };

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { success:false, message:'Audit planning empty' };

  var headers = values[0].map(function(x){ return String(x || '').trim(); });
  var H = auditorV5_headerIndex_(headers);
  var idxAuditId = H(['Audit ID','Audit Id','AuditID','AuditId']);
  if (idxAuditId < 0) return { success:false, message:'Audit ID header missing' };

  var row = null, rowNumber = -1;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idxAuditId] || '').trim() === auditId) {
      row = values[r];
      rowNumber = r + 1;
      break;
    }
  }
  if (!row) return { success:false, message:'Audit not found: ' + auditId };

  function cellByNames_(names) {
    var idx = H(names);
    return idx >= 0 ? row[idx] : '';
  }

  var raw = {
    extendedExpirationDate: auditorV5_debugDateCell_('Extended Expiration Date', cellByNames_(['Extended Expiration Date','Extended Expiry Date'])),
    willExpire: auditorV5_debugDateCell_('Date - Will Expire', cellByNames_(['Date - Will Expire','Will expire','Expiry'])),
    planFrom: auditorV5_debugDateCell_('Plan van / Plan from', cellByNames_(['Plan van','Planning from','Plan from'])),
    planTo: auditorV5_debugDateCell_('Plan tot / Plan to', cellByNames_(['Plan tot','Planning to','Plan to'])),
    datePlanned: auditorV5_debugDateCell_('Date - Planned', cellByNames_(['Date - Planned','Date Planned'])),
    planningJson: String(cellByNames_(['Planning JSON','Planning','PlanningJSON']) || '')
  };

  var gridRow = null;
  try {
    if (auditorEmail) {
      var grid = auditorV5_buildActiveGrid_U20409(auditorEmail, true);
      if (grid && grid.rows && grid.rows.length) {
        for (var i = 0; i < grid.rows.length; i++) {
          if (String(grid.rows[i].auditId || '').trim() === auditId) {
            gridRow = grid.rows[i];
            break;
          }
        }
      }
    }
  } catch (e1) {
    gridRow = { diagError: String(e1 && e1.message ? e1.message : e1) };
  }

  var plannedFromJson = null;
  try {
    plannedFromJson = auditorV5_extractPlannedSummary_(raw.planningJson);
  } catch (e2) {
    plannedFromJson = { error: String(e2 && e2.message ? e2.message : e2) };
  }

  var plannedFromAvail = null;
  try {
    var availMap = auditorV5_buildAvailabilitySummaryMap_();
    plannedFromAvail = auditorV5_plannedSummaryFromAvailabilityMap_(availMap, auditId);
  } catch (e3) {
    plannedFromAvail = { error: String(e3 && e3.message ? e3.message : e3) };
  }

  return {
    success: true,
    auditId: auditId,
    auditorEmail: auditorEmail,
    rowNumber: rowNumber,
    spreadsheetTimeZone: (ss && ss.getSpreadsheetTimeZone) ? ss.getSpreadsheetTimeZone() : '',
    scriptTimeZone: Session.getScriptTimeZone(),
    raw: raw,
    plannedFromJson: plannedFromJson,
    plannedFromAvailability: plannedFromAvail,
    gridRow: gridRow
  };
}
/***********************
 * TRIGGER SETUP — CACHE WARMING
 ***********************/
function AuditorV5_SetupWarmCacheTrigger() {
  var triggers = ScriptApp.getProjectTriggers();

  // voorkom dubbele triggers
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "AuditorV5_WarmGridCache") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // maak nieuwe trigger (5 minuten)
  ScriptApp.newTrigger("AuditorV5_WarmGridCache")
    .timeBased()
    .everyMinutes(5)
    .create();

  return { success: true, message: "Warm cache trigger set (every 5 min)" };
}

/***********************************************************************
 * FINAL OVERRIDE — AUDITOR BACKEND READ-ONLY CACHE BRIDGES
 * BUILD: AUDITOR_BACKEND_READONLY_CACHE_BRIDGE_20260424_C01
 * Scope: companies/auditors/scopes read-only lookups only.
 ***********************************************************************/

function auditorV5_buildAuditorMaps_() {
  try {
    if (typeof AuditorsIndex_GetDirectory === 'function') {
      var dir = AuditorsIndex_GetDirectory(false);
      if (dir && dir.ok && Array.isArray(dir.list)) {
        var nameToEmail = {};
        var emailToName = {};
        for (var i = 0; i < dir.list.length; i++) {
          var a = dir.list[i] || {};
          var email = String(a.email || '').trim().toLowerCase();
          var name = String(a.name || '').trim();
          if (!email) continue;
          if (name) {
            nameToEmail[name] = email;
            nameToEmail[name.toLowerCase()] = email;
          }
          emailToName[email] = name || email;
        }
        return { nameToEmail:nameToEmail, emailToName:emailToName, source:'AuditorsIndexService' };
      }
    }
  } catch (eBridge) {}

  var cacheKey = "AUD_V5_AUDITOR_MAPS_V1";
  var cached = auditorV5_scriptCacheGetJson_(cacheKey);
  if (cached && cached.nameToEmail && cached.emailToName) return cached;

  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Auditors");
  var nameToEmail2 = {};
  var emailToName2 = {};
  if (!sh) return { nameToEmail:nameToEmail2, emailToName:emailToName2 };

  var data = sh.getDataRange().getValues();
  if (!data || data.length < 2) return { nameToEmail:nameToEmail2, emailToName:emailToName2 };

  var hdr = data[0].map(function(x){ return String(x||"").trim(); });
  var H = auditorV5_headerIndex_(hdr);
  var idxName  = H(["Auditor","Name","Auditor name","Auditor Name"]);
  var idxEmail = H(["Email","E-mail","Auditor email","Auditor Email"]);

  for (var r=1; r<data.length; r++) {
    var row = data[r];
    var nm = idxName>=0 ? String(row[idxName]||"").trim() : "";
    var em = idxEmail>=0 ? String(row[idxEmail]||"").trim().toLowerCase() : "";
    if (nm && em) {
      nameToEmail2[nm] = em;
      nameToEmail2[nm.toLowerCase()] = em;
      emailToName2[em] = nm;
    }
  }

  var out = { nameToEmail:nameToEmail2, emailToName:emailToName2, source:'sheetFallback' };
  auditorV5_scriptCachePutJson_(cacheKey, out, AUDITOR_V5_TTL_MAPS_SEC);
  return out;
}

function auditorV5_loadConfigScopes_() {
  if (AUDITOR_V5_SCOPES_CFG_CACHE_ && AUDITOR_V5_SCOPES_CFG_CACHE_.ordered) return AUDITOR_V5_SCOPES_CFG_CACHE_;

  try {
    if (typeof ConfigScopes_GetCatalog === 'function') {
      var catalog = ConfigScopes_GetCatalog(false);
      if (catalog && catalog.ok && Array.isArray(catalog.rows)) {
        var list = [];
        var bySlot = {};
        var byCode = {};

        for (var i = 0; i < catalog.rows.length; i++) {
          var x = catalog.rows[i] || {};
          var slotKey = String(x.slotKey || '').trim();
          if (!slotKey) continue;

          var rec = {
            slotKey: slotKey,
            scopeCode: String(x.scopeCode || '').trim() || slotKey,
            displayName: String(x.displayName || '').trim() || String(x.scopeCode || slotKey),
            color: String(x.color || '').trim(),
            textColor: String(x.textColor || '').trim(),
            sortOrder: Number(x.sortOrder || i + 1),
            archived: !!x.archived
          };

          list.push(rec);
          bySlot[rec.slotKey] = rec;
          byCode[rec.scopeCode] = rec;
          byCode[String(rec.scopeCode || '').toLowerCase()] = rec;
          byCode[rec.displayName] = rec;
          byCode[String(rec.displayName || '').toLowerCase()] = rec;
        }

        list.sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });

        var ordered = list.map(function(x){
          return {
            slotKey: x.slotKey,
            scopeCode: x.scopeCode,
            displayName: x.displayName,
            sortOrder: x.sortOrder,
            color: x.color,
            textColor: x.textColor,
            archived: x.archived
          };
        });

        AUDITOR_V5_SCOPES_CFG_CACHE_ = {
          ordered: ordered,
          list: list,
          bySlot: bySlot,
          byCode: byCode,
          source: 'ConfigScopesService'
        };
        return AUDITOR_V5_SCOPES_CFG_CACHE_;
      }
    }
  } catch (eBridge) {}

  var ss = auditorV5_getSs_();
  var sh = ss.getSheetByName("Config_Scopes");
  if (!sh) {
    AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: [], list: [], bySlot: {}, byCode: {}, source:'missingSheet' };
    return AUDITOR_V5_SCOPES_CFG_CACHE_;
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    AUDITOR_V5_SCOPES_CFG_CACHE_ = { ordered: [], list: [], bySlot: {}, byCode: {}, source:'emptySheet' };
    return AUDITOR_V5_SCOPES_CFG_CACHE_;
  }

  var headers = values[0].map(function(x){ return String(x||"").trim(); });
  var idx = {};
  for (var h=0; h<headers.length; h++) {
    if (headers[h]) {
      idx[headers[h]] = h;
      idx[headers[h].toLowerCase()] = h;
    }
  }

  function get_(row, names) {
    for (var n=0; n<names.length; n++) {
      var k = String(names[n] || '').trim();
      if (idx.hasOwnProperty(k)) return row[idx[k]];
      if (idx.hasOwnProperty(k.toLowerCase())) return row[idx[k.toLowerCase()]];
    }
    return '';
  }

  function yes_(v, def) {
    var s = String(v || '').trim().toLowerCase();
    if (!s) return !!def;
    return s === 'yes' || s === 'true' || s === '1' || s === 'y' || s === 'x' || s === 'active';
  }

  var list2 = [];
  var bySlot2 = {};
  var byCode2 = {};
  for (var r=1; r<values.length; r++) {
    var row = values[r];
    var slotKey = String(get_(row, ["SlotKey","Slot key","Slot"]) || "").trim();
    if (!slotKey) continue;
    if (!yes_(get_(row, ["Active","ACTIVE"]), true)) continue;

    var rec2 = {
      slotKey: slotKey,
      scopeCode: String(get_(row, ["ScopeCode","Scope code","Code"]) || "").trim() || slotKey,
      displayName: String(get_(row, ["DisplayName","Display name","Name","ScopeName","Scope"]) || "").trim() || slotKey,
      color: String(get_(row, ["Color","Colour","BackgroundColor","Background color"]) || "").trim(),
      textColor: String(get_(row, ["TextColor","Text color","FontColor","Font color"]) || "").trim(),
      sortOrder: Number(get_(row, ["SortOrder","Sort order","Sort"]) || r),
      archived: yes_(get_(row, ["Archived","ARCHIVED"]), false)
    };
    list2.push(rec2);
    bySlot2[rec2.slotKey] = rec2;
    byCode2[rec2.scopeCode] = rec2;
    byCode2[String(rec2.scopeCode || '').toLowerCase()] = rec2;
    byCode2[rec2.displayName] = rec2;
    byCode2[String(rec2.displayName || '').toLowerCase()] = rec2;
  }

  list2.sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });

  AUDITOR_V5_SCOPES_CFG_CACHE_ = {
    ordered: list2.map(function(x){
      return {
        slotKey:x.slotKey,
        scopeCode:x.scopeCode,
        displayName:x.displayName,
        sortOrder:x.sortOrder,
        color:x.color,
        textColor:x.textColor,
        archived:x.archived
      };
    }),
    list: list2,
    bySlot: bySlot2,
    byCode: byCode2,
    source:'sheetFallback'
  };
  return AUDITOR_V5_SCOPES_CFG_CACHE_;
}

function auditorV5_buildCompaniesLookupForNames_(wantedNames) {
  var wanted = {};
  var hasWanted = !!(wantedNames && wantedNames.length);
  if (hasWanted) {
    for (var w = 0; w < wantedNames.length; w++) {
      var nmw = String(wantedNames[w] || '').trim().toLowerCase();
      if (nmw) wanted[nmw] = true;
    }
  }

  try {
    if (typeof CompaniesIndex_GetNameCoreIndex === 'function') {
      var nameIndex = CompaniesIndex_GetNameCoreIndex(false);
      if (nameIndex && nameIndex.ok && nameIndex.byName) {
        var byNameIdx = {};
        Object.keys(nameIndex.byName || {}).forEach(function(key){
          if (hasWanted && !wanted[key]) return;
          var c = nameIndex.byName[key] || {};
          byNameIdx[key] = {
            companyUid: String(c.companyUid || '').trim(),
            locs: Number(c.locationsCount || c.locationsToPlan || 1) || 1,
            gps: String(c.gpsData || '').trim(),
            location: String(c.location || '').trim(),
            region: String(c.region || '').trim(),
            country: String(c.country || '').trim(),
            contactName: String(c.contactName || '').trim(),
            contactEmail: String(c.contactEmail || '').trim(),
            contactPhone: String(c.contactPhone || '').trim(),
            comments: String(c.comments || '').trim(),
            timeZone: String(c.timeZone || '').trim(),
            languageCommunication: String(c.languageCommunication || '').trim(),
            nonWorkingDays: String(c.nonWorkingDays || '').trim(),
            hoursWorking: String(c.hoursWorking || '').trim(),
            locationsJson: '',
            locationsSummary: c.locationsSummary || null
          };
        });
        return { byName: byNameIdx, source:'CompaniesIndexService.NameCore' };
      }
    }
  } catch (eBridgeNameCore) {}

  try {
    if (typeof CompaniesIndex_GetUidCoreIndex === 'function' && typeof CompaniesIndex_GetLocationSummaryIndex === 'function') {
      var core = CompaniesIndex_GetUidCoreIndex(false);
      var locs = CompaniesIndex_GetLocationSummaryIndex(false);

      if (core && core.ok && core.byUid) {
        var byName = {};
        Object.keys(core.byUid || {}).forEach(function(uid){
          var c2 = core.byUid[uid] || {};
          var name = String(c2.companyName || '').trim();
          if (!name) return;
          var key2 = name.toLowerCase();
          if (hasWanted && !wanted[key2]) return;

          var l = locs && locs.byUid ? (locs.byUid[uid] || {}) : {};
          byName[key2] = {
            companyUid: uid,
            locs: Number(l.activeLocationsCount || l.locationsCount || c2.locationsToPlan || 1) || 1,
            gps: String(l.hqGps || c2.gpsData || '').trim(),
            location: String(l.hqLabel || c2.location || '').trim(),
            region: String(c2.region || '').trim(),
            country: String(c2.country || '').trim(),
            contactName: String(c2.contactName || '').trim(),
            contactEmail: String(c2.contactEmail || '').trim(),
            contactPhone: String(c2.contactPhone || '').trim(),
            comments: String(c2.comments || '').trim(),
            timeZone: String(c2.timeZone || '').trim(),
            languageCommunication: String(c2.languageCommunication || '').trim(),
            nonWorkingDays: String(c2.nonWorkingDays || '').trim(),
            hoursWorking: String(c2.hoursWorking || '').trim(),
            locationsJson: '',
            locationsSummary: l
          };
        });

        return { byName: byName, source:'CompaniesIndexService' };
      }
    }
  } catch (eBridge) {}

  var cacheKey = "AUD_V5_COMPANYINFO_V11_UID_T";
  var full = auditorV5_scriptCacheGetJson_(cacheKey);
  if (!(full && full.byName)) {
    var ss = auditorV5_getSs_();
    var sh = ss.getSheetByName("Companies");
    var byName2 = {};
    if (!sh) return { byName: byName2, source:'missingSheet' };

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return { byName: byName2, source:'emptySheet' };

    var hdr = data[0].map(function(x){ return String(x||"").trim(); });
    var H = auditorV5_headerIndex_(hdr);
    var idxCompany = H(["Company","Company name","Name"]);
    var idxCompanyUid = H(["Company_UID","Company UID","CompanyUID"]);
    if (idxCompanyUid < 0 && hdr.length >= 20) idxCompanyUid = 19; // Companies col T
    var idxLocation = H(["Location","LOCATION"]);
    var idxRegion   = H(["Region","REGION"]);
    var idxCountry  = H(["Country"]);
    var idxLocs = H(["Locations_to_plan","Locations to plan","Locs"]);
    var idxGps = H(["GPS-data","GPS","GPS HQ","HQ GPS","LatLong","Latitude/Longitude","GPS location","GPS Location"]);
    var idxContact = H(["Contactperson","Contact person","Contact","Contactpersoon naam","Contact name"]);
    var idxEmail = H(["Contactperson e-mail","Contactperson email","Contact e-mail","Contact email","Contactpersoon email"]);
    var idxPhone = H(["Contactperson phone","Contact phone","Phone","Contactpersoon telefoon"]);
    var idxComments = H(["Comments","Comment"]);
    var idxTz = H(["Time zone","Timezone"]);
    var idxLang = H(["Language communication"," Language communication"]);
    var idxNonWorkingDays = H(["Audit planning limitations - days","Audit planning limitations days","Non working days","Non-working days","Planning limitations - days"]);
    var idxHoursWorking = H(["Audit planning limitations - hours","Audit planning limitations hours","Hours working","Working hours","Planning limitations - hours"]);
    var idxLocationsJson = H(["Locations_JSON","Locations JSON","LocationsJSON"]);

    for (var r=1; r<data.length; r++) {
      var row = data[r];
      var name = idxCompany>=0 ? String(row[idxCompany]||"").trim() : "";
      if (!name) continue;
      var key = name.toLowerCase();
      var locsRaw = idxLocs>=0 ? row[idxLocs] : "";
      var locsN = Number(locsRaw);
      if (!(locsN>0)) locsN = 1;
      byName2[key] = {
        companyUid: idxCompanyUid>=0 ? String(row[idxCompanyUid]||"").trim() : "",
        locs: locsN,
        gps: idxGps>=0 ? String(row[idxGps]||"").trim() : "",
        location: idxLocation>=0 ? String(row[idxLocation]||"").trim() : "",
        region: idxRegion>=0 ? String(row[idxRegion]||"").trim() : "",
        country: idxCountry>=0 ? String(row[idxCountry]||"").trim() : "",
        contactName: idxContact>=0 ? String(row[idxContact]||"").trim() : "",
        contactEmail: idxEmail>=0 ? String(row[idxEmail]||"").trim() : "",
        contactPhone: idxPhone>=0 ? String(row[idxPhone]||"").trim() : "",
        comments: idxComments>=0 ? String(row[idxComments]||"").trim() : "",
        timeZone: idxTz>=0 ? String(row[idxTz]||"").trim() : "",
        languageCommunication: idxLang>=0 ? String(row[idxLang]||"").trim() : "",
        nonWorkingDays: idxNonWorkingDays>=0 ? String(row[idxNonWorkingDays]||"").trim() : "",
        hoursWorking: idxHoursWorking>=0 ? String(row[idxHoursWorking]||"").trim() : "",
        locationsJson: idxLocationsJson>=0 ? String(row[idxLocationsJson]||"").trim() : ""
      };
    }

    full = { byName: byName2, source:'sheetFallback' };
    auditorV5_scriptCachePutJson_(cacheKey, full, AUDITOR_V5_TTL_MAPS_SEC);
  }

  if (!hasWanted) return full;

  var filtered = {};
  var src = full.byName || {};
  for (var key2 in wanted) {
    if (Object.prototype.hasOwnProperty.call(src, key2)) filtered[key2] = src[key2];
  }
  return { byName: filtered, source: full.source || 'fallbackFiltered' };
}

function auditorV5_buildCompaniesLookup_() {
  return auditorV5_buildCompaniesLookupForNames_(null);
}

function RUN_AUDITOR_BACKEND_READONLY_CACHE_BRIDGE_DIAGNOSTICS() {
  var started = new Date().getTime();

  var scopes = auditorV5_loadConfigScopes_();
  var companies = auditorV5_buildCompaniesLookupForNames_(null);
  var auditors = auditorV5_buildAuditorMaps_();

  var out = {
    ok: true,
    durationMs: new Date().getTime() - started,
    servicesAvailable: {
      configScopes: typeof ConfigScopes_GetCatalog === 'function',
      companiesCore: typeof CompaniesIndex_GetUidCoreIndex === 'function',
      companiesLocations: typeof CompaniesIndex_GetLocationSummaryIndex === 'function',
      auditorsDirectory: typeof AuditorsIndex_GetDirectory === 'function'
    },
    sources: {
      scopes: scopes.source || '',
      companies: companies.source || '',
      auditors: auditors.source || ''
    },
    counts: {
      scopes: scopes && scopes.ordered ? scopes.ordered.length : 0,
      companies: companies && companies.byName ? Object.keys(companies.byName).length : 0,
      auditorNames: auditors && auditors.nameToEmail ? Object.keys(auditors.nameToEmail).length : 0,
      auditorEmails: auditors && auditors.emailToName ? Object.keys(auditors.emailToName).length : 0
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/***********************
 * CENTRAL AUDITOR GRID CACHE DIAGNOSTICS
 * BUILD: AUDITOR_V5_CENTRAL_AUDITOR_GRID_CACHE_DEPLOY_READY_C10_20260426
 ***********************/
function RUN_AUDITOR_GRID_CENTRAL_CACHE_DIAGNOSTICS() {
  var out = {
    ok: true,
    build: 'AUDITOR_V5_CENTRAL_AUDITOR_GRID_CACHE_DEPLOY_READY_C10_20260426',
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      getAuditorGrid: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.getAuditorGrid === 'function'),
      putAuditorGrid: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.putAuditorGrid === 'function'),
      removeAuditorGrid: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAuditorGrid === 'function'),
      ttlAuditorGrid: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && AUDIT_CACHE.TTL) ? AUDIT_CACHE.TTL.AUDITOR_GRID : ''
    },
    diagnostics: null
  };

  try {
    if (typeof AUDIT_CACHE_auditorGridDiagnostics === 'function') {
      out.diagnostics = AUDIT_CACHE_auditorGridDiagnostics();
    } else if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.diagnostics === 'function') {
      out.diagnostics = AUDIT_CACHE.diagnostics();
    }
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/***************************************************************
 * AUDITOR GRID — 3S FAST FIRST PAINT ENDPOINTS
 * BUILD: AUDITOR_GRID_3S_FAST_FIRST_PAINT_20260504
 *
 * Scope:
 * - Same large backend file; no file split.
 * - No save / availability / calendar changes.
 * - Fast endpoint returns only minimum fields needed for first grid paint.
 * - Enriched endpoint delegates to the existing full grid builder.
 ***************************************************************/

function AuditorV5B_GetAuditorGrid_FAST(mode, params) {
  if (typeof mode === 'string') {
    params = params || {};
    params.view = mode;
    return AuditorV5_GetAuditorGrid_FAST(params);
  }
  return AuditorV5_GetAuditorGrid_FAST(mode);
}

function AuditorV5B_GetAuditorGrid_ENRICHED(mode, params) {
  if (typeof mode === 'string') {
    params = params || {};
    params.view = mode;
    return AuditorV5_GetAuditorGrid_ENRICHED(params);
  }
  return AuditorV5_GetAuditorGrid_ENRICHED(mode);
}

function AuditorV5_GetAuditorGrid_ENRICHED(req) {
  req = req || {};
  req.view = String(req.view || 'active').toLowerCase();
  if (req.view === 'archived') return AuditorV5_GetAuditorGrid_U20409(req);

  // Keep existing rich builder as owner of enrichment. Do not duplicate company,
  // scope, GPS, or availability fallback logic here.
  return AuditorV5_GetAuditorGrid_U20409(req);
}

function AuditorV5_GetAuditorGrid_FAST(req) {
  var __t0 = new Date().getTime();
  function __ms_() { return new Date().getTime() - __t0; }

  req = req || {};
  var view = String(req.view || 'active').toLowerCase();
  var filterEmail = String(req.auditorEmail || '').trim().toLowerCase();
  var useCache = !(req && req.noCache === true);

  if (view === 'archived') return AuditorV5_GetAuditorGrid_U20409(req);
  if (!filterEmail) return { success:false, message:'No auditor email', rows:[], perf:{ serverMs:__ms_(), failed:true, fastFirstPaint:true } };

  try {
    // If the normal active grid is already cached, returning it is still a fast
    // first paint and avoids rebuilding anything.
    if (useCache) {
      var cached = auditorV5_userCacheGet_(filterEmail, 'active');
      if (cached && cached.success !== false && Array.isArray(cached.rows)) {
        cached.cacheHit = true;
        cached.fastFirstPaint = true;
        cached.enrichmentAvailable = true;
        cached.__build = 'AUDITOR_GRID_3S_FAST_FIRST_PAINT_20260504_CACHE_HIT';
        cached.perf = cached.perf || {};
        cached.perf.serverMs = __ms_();
        cached.perf.fromCache = true;
        cached.perf.cacheSource = 'AUDIT_CACHE.auditor_grid';
        cached.perf.fastFirstPaint = true;
        return cached;
      }
    }

    var ss = auditorV5_getSs_();
    var maps = auditorV5_buildAuditorMaps_();
    var auditorName = String((maps.emailToName && maps.emailToName[filterEmail]) || '').trim();
    var auditorNameKey = auditorName.toLowerCase();

    var sh = ss.getSheetByName('Audit planning');
    if (!sh) return { success:false, message:"Missing sheet 'Audit planning'", rows:[], perf:{ serverMs:__ms_(), fastFirstPaint:true } };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { success:true, rows:[], fastFirstPaint:true, enrichmentAvailable:true, perf:{ serverMs:__ms_(), fastFirstPaint:true } };

    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x){ return String(x || '').trim(); });
    var H = auditorV5_headerIndex_(hdr);

    var idxAuditId   = H(['Audit ID','Audit Id','AuditID','AuditId','auditId','Audit UID','Audit_UID','AuditUID','Audit Id (V5)','Audit ID (V5)']);
    var idxCompany   = H(['Company','Company name','Client']);
    var idxLocation  = H(['Location','Site','Audit location']);
    var idxAssigned  = H(['Assigned to']);
    var idxStatus    = H(['Status']);
    var idxPlanning  = H(['Planning JSON','Planning','PlanningJSON','Planning_Js','Planning js']);
    var idxPlanFrom  = H(['Planning window from','Plan van','Planning from','Planning from date','Plan from','Planning start','Plan start']);
    var idxPlanTo    = H(['Planning window to','Plan tot','Planning to','Planning to date','Plan to','Planning end','Plan end']);
    var idxToBePlanned = H(['Total audit time in hours','To be planned','To be Planned','ToBePlanned','Hours to plan','Hours to be planned']);
    var idxAllowSelfPlanning = H(['Self planning','Self Planning','Allow self planning','Allow Self Planning','SelfPlanning']);
    var idxPreassigned = H(['Preassigned to','Preassigned','Preassigned auditor','Preassigned auditor email']);
    var idxExtExpiration = H(['Extended Expiration Date','Extended Expiry Date','Effective expiry','Effective Expiry','Extended Expiration','Effective expiration','Expiration date','Expiry date']);
    var idxWillExpire = H(['Date - Will Expire','Will expire','Expiry','Expiration date']);
    var idxCompanyUid = H(['Company_UID','Company UID','CompanyUID']);
    var idxTotalAuditDays = H(['Total audit time in days','Audit days','Days to plan','Days to be planned']);

    if (idxAuditId < 0 || idxCompany < 0 || idxStatus < 0) {
      return { success:false, message:'Audit planning: required columns missing (Audit ID / Company / Status)', rows:[], perf:{ serverMs:__ms_(), fastFirstPaint:true } };
    }

    var tRead = new Date().getTime();
    var bodyValues = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var readMs = new Date().getTime() - tRead;
    var rows = [];
    var active = String(filterEmail || '').trim().toLowerCase();

    for (var r = 0; r < bodyValues.length; r++) {
      var row = bodyValues[r];
      var statusRaw = String(row[idxStatus] || '').trim();
      var statusNorm = (typeof Status_normalizeStatus_ === 'function')
        ? Status_normalizeStatus_(statusRaw)
        : statusRaw.toUpperCase().replace(/\s+/g, '_');

      if (statusNorm !== 'PENDING_PLANNING' &&
          statusNorm !== 'PENDING_APPROVAL' &&
          statusNorm !== 'APPROVED' &&
          statusNorm !== 'ACCEPTED') {
        continue;
      }

      var assignedRaw = idxAssigned >= 0 ? String(row[idxAssigned] || '').trim() : '';
      var preassignedRaw = idxPreassigned >= 0 ? String(row[idxPreassigned] || '').trim() : '';
      var assigned = assignedRaw.toLowerCase();
      var preassigned = preassignedRaw.toLowerCase();

      var assignedMatch = false;
      var preassignedMatch = false;
      var match = false;

      if (active && assigned && assigned === active) { assignedMatch = true; match = true; }
      if (!assignedMatch && auditorNameKey && assigned && assigned === auditorNameKey) { assignedMatch = true; match = true; }
      if (!assignedMatch && !assigned) {
        if (active && preassigned && preassigned === active) { preassignedMatch = true; match = true; }
        else if (auditorNameKey && preassigned && preassigned === auditorNameKey) { preassignedMatch = true; match = true; }
      }
      if (!match) continue;

      var auditId = idxAuditId >= 0 ? String(row[idxAuditId] || '').trim() : '';
      var planningJson = idxPlanning >= 0 ? row[idxPlanning] : '';
      if (!auditId) {
        try {
          var obj = planningJson ? ((typeof planningJson === 'string') ? JSON.parse(planningJson) : planningJson) : null;
          auditId = obj && (obj.auditId || obj.audit_id || obj.auditID || obj.id) ? String(obj.auditId || obj.audit_id || obj.auditID || obj.id).trim() : '';
        } catch(eAid) {}
        if (!auditId) auditId = 'ROW_' + String(r + 2);
      }

      var planningWindow = '';
      var pfS = idxPlanFrom >= 0 ? auditorV5_cellToYmd_(row[idxPlanFrom]) : '';
      var ptS = idxPlanTo >= 0 ? auditorV5_cellToYmd_(row[idxPlanTo]) : '';
      if (pfS || ptS) planningWindow = (pfS || '…') + ' → ' + (ptS || '…');

      var planned = auditorV5_extractPlannedSummary_(planningJson);
      if (statusNorm === 'PENDING_PLANNING' && !String(planningJson || '').trim()) {
        planned.plannedDates = '';
        planned.plannedHours = '';
        planned.plannedTooltip = '';
      }

      var allowSelfPlanning = idxAllowSelfPlanning >= 0 ? auditorV5_normYesNo_(row[idxAllowSelfPlanning]) : '';
      var canPlan = (!assignedMatch) && preassignedMatch && (statusNorm === 'PENDING_PLANNING') && (allowSelfPlanning === 'YES');
      var expectedOnly = preassignedMatch && !assignedMatch;

      var expirationDate = '';
      if (idxExtExpiration >= 0) expirationDate = auditorV5_cellToYmd_(row[idxExtExpiration]);
      if (!expirationDate && idxWillExpire >= 0) expirationDate = auditorV5_cellToYmd_(row[idxWillExpire]);

      var totalAuditDays = '';
      if (idxTotalAuditDays >= 0 && row[idxTotalAuditDays] !== null && row[idxTotalAuditDays] !== undefined && row[idxTotalAuditDays] !== '') {
        totalAuditDays = String(row[idxTotalAuditDays]).trim();
      }

      var toBePlanned = '';
      if (idxToBePlanned >= 0 && row[idxToBePlanned] !== null && row[idxToBePlanned] !== undefined && row[idxToBePlanned] !== '') {
        toBePlanned = String(row[idxToBePlanned]).trim();
      }

      rows.push({
        auditId: auditId,
        company: String(idxCompany >= 0 ? row[idxCompany] || '' : '').trim(),
        companyUid: String(idxCompanyUid >= 0 ? row[idxCompanyUid] || '' : '').trim(),
        locs: '',
        location: String(idxLocation >= 0 ? row[idxLocation] || '' : '').trim(),
        companyLocation: '',
        companyRegion: '',
        gps: '',
        scopes: [],
        scopesText: '',
        planningWindow: planningWindow,
        allowSelfPlanning: allowSelfPlanning,
        totalAuditDays: totalAuditDays,
        preassignedAuditor: preassignedRaw,
        assignedAuditor: assignedRaw,
        isAssignedMatch: assignedMatch,
        isPreassignedMatch: preassignedMatch,
        expectedOnly: expectedOnly,
        canPlan: canPlan,
        toBePlanned: toBePlanned,
        plannedTooltip: planned.plannedTooltip || '',
        expirationDate: expirationDate,
        plannedDates: planned.plannedDates || '',
        plannedHours: planned.plannedHours || '',
        status: String(statusRaw || '').toUpperCase(),
        readOnly: String(auditId).indexOf('ROW_') === 0,
        needsEnrichment: true
      });
    }

    rows.sort(function(a, b) {
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
      rows: rows,
      fastFirstPaint: true,
      enrichmentAvailable: true,
      cacheHit: false,
      __build: 'AUDITOR_GRID_3S_FAST_FIRST_PAINT_20260504',
      perf: {
        serverMs: __ms_(),
        readMs: readMs,
        rowsReturned: rows.length,
        fastFirstPaint: true,
        enrichmentDeferred: true,
        skipped: ['companiesLookup','scopeColors','availabilityFallback','companyLocationHydration']
      }
    };
  } catch (e) {
    return { success:false, message:e && e.message ? e.message : String(e), rows:[], perf:{ serverMs:__ms_(), failed:true, fastFirstPaint:true } };
  }
}
