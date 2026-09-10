/***********************************************************************
 * FILE: zz_AMS01_PlanningDemandScopePerfOverride.js
 * BUILD: 2026-09-10_AMS01_2_PLANNING_DEMAND_SCOPE_FASTPATH_R1
 *
 * PURPOSE
 * - AMS-01.2 execution-local fast path for PlanningDemand scope extraction.
 * - Reuses canonical Config_Scopes evidence through ConfigScopesService when
 *   available instead of re-entering the legacy per-row scope bridge.
 * - Builds the Audit planning header-to-scope column plan once per execution.
 *
 * GOVERNANCE
 * - Read-only.
 * - Audit planning SCOPE_XX x-marks remain selection truth.
 * - Config_Scopes remains scope metadata truth.
 * - Includes inactive/archived scopes when historically marked x, matching
 *   v5_extractScopesForAuditPlanningRow_ behavior.
 * - No persisted derived truth. Execution-local memo only.
 ***********************************************************************/

var AMS01_PDS_SCOPE_FASTPATH_BUILD = '2026-09-10_AMS01_2_PLANNING_DEMAND_SCOPE_FASTPATH_R1';
var AMS01_PDS_SCOPE_FASTPATH_CACHE = {};

function AMS01_PDS_scopeHeaderSignature_(headers) {
  headers = headers || [];
  var out = [];
  for (var i = 0; i < headers.length; i++) out.push(String(headers[i] == null ? '' : headers[i]).trim());
  return out.join('\u001f');
}

function AMS01_PDS_scopeDefs_() {
  var defs = [];

  try {
    if (typeof ConfigScopes_GetCatalog === 'function') {
      var catalog = ConfigScopes_GetCatalog(false) || {};
      var rows = Array.isArray(catalog.rows) ? catalog.rows : [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var slot = String(r.slotKey || r.slot || '').trim();
        if (!slot) continue;
        defs.push({
          slot: slot,
          name: String(r.displayName || r.name || r.scopeCode || slot).trim()
        });
      }
      if (defs.length) return { defs: defs, source: 'ConfigScopes_GetCatalog' };
    }
  } catch (eCatalog) {}

  try {
    if (typeof v5_getScopesConfig_ === 'function') {
      var cfg = v5_getScopesConfig_(false) || {};
      var list = Array.isArray(cfg.list) ? cfg.list : [];
      for (var j = 0; j < list.length; j++) {
        var d = list[j] || {};
        var slot2 = String(d.slot || d.slotKey || '').trim();
        if (!slot2) continue;
        defs.push({
          slot: slot2,
          name: String(d.name || d.displayName || d.code || slot2).trim()
        });
      }
      return { defs: defs, source: 'v5_getScopesConfig_' };
    }
  } catch (eLegacy) {}

  return { defs: [], source: 'none' };
}

function AMS01_PDS_scopePlan_(headers) {
  headers = headers || [];
  var signature = AMS01_PDS_scopeHeaderSignature_(headers);
  if (Object.prototype.hasOwnProperty.call(AMS01_PDS_SCOPE_FASTPATH_CACHE, signature)) {
    return AMS01_PDS_SCOPE_FASTPATH_CACHE[signature];
  }

  var headerIndex = {};
  for (var i = 0; i < headers.length; i++) {
    headerIndex[String(headers[i] == null ? '' : headers[i]).trim()] = i;
  }

  var pack = AMS01_PDS_scopeDefs_();
  var defs = pack.defs || [];
  var columns = [];
  for (var j = 0; j < defs.length; j++) {
    var def = defs[j] || {};
    var col = headerIndex[def.slot];
    if (col === 0 || col) {
      columns.push({ col: col, name: def.name || def.slot, slot: def.slot });
    }
  }

  var plan = {
    source: pack.source,
    configuredScopes: defs.length,
    matchedColumns: columns.length,
    columns: columns
  };
  AMS01_PDS_SCOPE_FASTPATH_CACHE[signature] = plan;
  return plan;
}

function AMS01_PDS_isMarkedX_(v) {
  return String(v == null ? '' : v).trim().toLowerCase() === 'x';
}

/*
 * Intentional override of PlanningDemandService.js local helper.
 * GAS resolves one global function namespace; zz_ filename keeps this override
 * after the base PlanningDemandService source in clasp/GAS project ordering.
 */
function PDS_scopeNames_(headers, row) {
  var plan = AMS01_PDS_scopePlan_(headers || []);
  var columns = plan.columns || [];
  row = row || [];
  var out = [];
  for (var i = 0; i < columns.length; i++) {
    var c = columns[i];
    if (AMS01_PDS_isMarkedX_(row[c.col])) out.push(c.name);
  }
  return out;
}

function AMS01_PDS_SCOPE_FASTPATH_STATUS() {
  return {
    success: true,
    active: true,
    build: AMS01_PDS_SCOPE_FASTPATH_BUILD,
    cachedPlans: Object.keys(AMS01_PDS_SCOPE_FASTPATH_CACHE || {}).length,
    readOnly: true,
    canonicalScopeOwner: 'Config_Scopes',
    auditScopeSelectionOwner: 'Audit planning SCOPE_XX x-marks'
  };
}
