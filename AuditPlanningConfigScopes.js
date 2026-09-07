// BUILD: AuditPlanningConfigScopes_20260426_EXTUNDOFIX
// Extracted from ManagerPlanningV5Backend.js. No behavior changes.

// ===============================
// Scopes via Config_Scopes (V5)
// Single Source of Truth for selection: Audit planning SCOPE_XX columns marked "x"
// Meaning/styling/order from sheet Config_Scopes
// Inactive/archived scopes: still displayed when historically present (x), but should be excluded from filter option lists in UI.
// ===============================
var __V5_SCOPES_CACHE = null;
var __V5_SCOPES_CACHE_AT = 0;

function __mp_normalizeScopesConfigPack_(raw) {
  if (!raw) return null;
  var list = null;
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw.list)) list = raw.list;
  else if (Array.isArray(raw.scopes)) list = raw.scopes;
  else if (raw.data && Array.isArray(raw.data.list)) list = raw.data.list;
  else if (raw.data && Array.isArray(raw.data.scopes)) list = raw.data.scopes;
  if (!list) return null;

  var outList = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var slot = String(it.slot || it.slotKey || it.SlotKey || '').trim();
    if (!slot) continue;
    outList.push({
      slot: slot,
      code: String(it.code || it.scopeCode || it.ScopeCode || slot || '').trim(),
      name: String(it.name || it.displayName || it.DisplayName || it.label || it.code || slot || '').trim(),
      color: String(it.color || it.Color || '').trim(),
      textColor: String(it.textColor || it.TextColor || '').trim(),
      active: (it.active === false || String(it.active).toLowerCase() === 'false') ? false : true,
      archived: (it.archived === true || String(it.archived).toLowerCase() === 'true'),
      sortOrder: Number(it.sortOrder || it.SortOrder || 0) || 0,
      planningFrom: Number(it.planningFrom || it.PlanningFrom || it.planning_from || it['Planning from'] || 0) || 0,
      planningTo: Number(it.planningTo || it.PlanningTo || it.planning_to || it['Planning to'] || 0) || 0,
      extension: Number(it.extension || it.Extension || it.extMonths || it.extensionMonths || 0) || 0
    });
  }
  outList.sort(function(a,b){ return (a.sortOrder || 0) - (b.sortOrder || 0); });
  var bySlot = {};
  for (var j = 0; j < outList.length; j++) bySlot[outList[j].slot] = outList[j];
  return { bySlot: bySlot, list: outList };
}

function __mp_tryConfigScopesService_(forceRefresh) {
  try {
    if (forceRefresh) return null;
    if (typeof ConfigScopesService === 'undefined' || !ConfigScopesService) return null;
    var raw = null;
    if (typeof ConfigScopesService.getScopesConfig === 'function') raw = ConfigScopesService.getScopesConfig();
    else if (typeof ConfigScopesService.getConfig === 'function') raw = ConfigScopesService.getConfig();
    else if (typeof ConfigScopesService.load === 'function') raw = ConfigScopesService.load();
    else if (typeof ConfigScopesService.get === 'function') raw = ConfigScopesService.get();
    return __mp_normalizeScopesConfigPack_(raw);
  } catch(e) {
    return null;
  }
}

function v5_getScopesConfig_(forceRefresh) {
  // Cache for performance; refresh if forced or older than 5 minutes
  var now = Date.now();
  if (!forceRefresh && __V5_SCOPES_CACHE && (now - __V5_SCOPES_CACHE_AT) < 5 * 60 * 1000) {
    return __V5_SCOPES_CACHE;
  }

  var svcCfg = __mp_tryConfigScopesService_(forceRefresh);
  if (svcCfg && svcCfg.list) {
    __V5_SCOPES_CACHE = svcCfg;
    __V5_SCOPES_CACHE_AT = now;
    return __V5_SCOPES_CACHE;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Config_Scopes");
  if (!sh) {
    // Backward-compatible fallback: no config sheet => empty config
    __V5_SCOPES_CACHE = { bySlot: {}, list: [] };
    __V5_SCOPES_CACHE_AT = now;
    return __V5_SCOPES_CACHE;
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    __V5_SCOPES_CACHE = { bySlot: {}, list: [] };
    __V5_SCOPES_CACHE_AT = now;
    return __V5_SCOPES_CACHE;
  }

  var headers = values[0].map(function(h){ return String(h || "").trim(); });
  var idx = {};
  for (var i = 0; i < headers.length; i++) idx[headers[i]] = i;

  // Expected headers:
  // SlotKey, ScopeCode, DisplayName, Color, TextColor, Active, Archived, SortOrder, Planning from, Planning to, Extension
  function col_(name){
    return (idx[name] === 0 || idx[name]) ? idx[name] : -1;
  }

  var cSlot = col_("SlotKey");
  var cCode = col_("ScopeCode");
  var cName = col_("DisplayName");
  var cColor = col_("Color");
  var cTextColor = col_("TextColor");
  var cActive = col_("Active");
  var cArchived = col_("Archived");
  var cSort = col_("SortOrder");
  var cPlanFrom = col_("Planning from");
  var cPlanTo = col_("Planning to");
  var cExtension = col_("Extension");

  var list = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var slot = cSlot >= 0 ? String(row[cSlot] || "").trim() : "";
    if (!slot) continue;

    var def = {
      slot: slot,
      code: cCode >= 0 ? String(row[cCode] || "").trim() : slot,
      name: cName >= 0 ? String(row[cName] || "").trim() : (cCode >= 0 ? String(row[cCode] || "").trim() : slot),
      color: cColor >= 0 ? String(row[cColor] || "").trim() : "",
      textColor: cTextColor >= 0 ? String(row[cTextColor] || "").trim() : "",
      active: cActive >= 0 ? String(row[cActive] || "").toLowerCase() === "true" : true,
      archived: cArchived >= 0 ? String(row[cArchived] || "").toLowerCase() === "true" : false,
      sortOrder: cSort >= 0 ? Number(row[cSort]) || 0 : 0,
      planningFrom: cPlanFrom >= 0 ? Number(row[cPlanFrom]) || 0 : 0,
      planningTo: cPlanTo >= 0 ? Number(row[cPlanTo]) || 0 : 0,
      extension: cExtension >= 0 ? Number(row[cExtension]) || 0 : 0
    };
    list.push(def);
  }

  // Stable order
  list.sort(function(a,b){ return (a.sortOrder || 0) - (b.sortOrder || 0); });

  var bySlot = {};
  for (var k = 0; k < list.length; k++) bySlot[list[k].slot] = list[k];

  __V5_SCOPES_CACHE = { bySlot: bySlot, list: list };
  __V5_SCOPES_CACHE_AT = now;
  return __V5_SCOPES_CACHE;
}

function v5_isMarkedX_(v) {
  return String(v || "").trim().toLowerCase() === "x";
}

/**
 * Extract scopes for one Audit planning row.
 * Always returns scopes that are marked with "x", even if inactive/archived in config (Decision B).
 * Returns:
 * - scopes: [{slot, code, name, color, textColor, active, archived}]
 * - scopesText: "Name1, Name2"
 */
function v5_extractScopesForAuditPlanningRow_(auditPlanningHeaders, auditPlanningRow) {
  var cfg = v5_getScopesConfig_(false);
  var headerIndex = {};
  for (var i = 0; i < auditPlanningHeaders.length; i++) {
    headerIndex[String(auditPlanningHeaders[i]).trim()] = i;
  }

  var scopes = [];
  var list = cfg.list || [];

  for (var j = 0; j < list.length; j++) {
    var def = list[j];
    var col = headerIndex[def.slot];
    if (col === 0 || col) {
      if (v5_isMarkedX_(auditPlanningRow[col])) {
        scopes.push({
          slot: def.slot,
          code: def.code,
          name: def.name,
          color: def.color,
          textColor: def.textColor,
          active: def.active,
          archived: def.archived,
          planningFrom: def.planningFrom || 0,
          planningTo: def.planningTo || 0,
          extension: def.extension || 0
        });
      }
    }
  }

  var names = [];
  for (var s = 0; s < scopes.length; s++) names.push(scopes[s].name || scopes[s].code || scopes[s].slot);
  var scopesText = names.join(", ");

  return { scopes: scopes, scopesText: scopesText };
}


function v5_extractScopesForRowObject_(rowObj) {
  // Row object keys are canonical header names created by getHeaderMap_ (should include SCOPE_XX columns)
  var cfg = v5_getScopesConfig_(false);
  var list = cfg.list || [];
  var scopes = [];
  for (var j = 0; j < list.length; j++) {
    var def = list[j];
    if (v5_isMarkedX_(rowObj[def.slot])) {
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
  var names = [];
  for (var i = 0; i < scopes.length; i++) names.push(scopes[i].name || scopes[i].code || scopes[i].slot);
  return { scopes: scopes, scopesText: names.join(", ") };
}

