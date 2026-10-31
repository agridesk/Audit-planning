// BUILD: AuditManagerToolsConfigScopes_20260425
// Config_Scopes bridge + diagnostics. Active final definitions only.

// V2.11: expose all configured scope identities; legacy 8 slots retain their
// physical Audit planning positions. Later slots are header-resolved only.
function m5t_scopeSlotDefs_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var rows = [];
  if (typeof ConfigScopes_GetCatalog === 'function') {
    var catalog = ConfigScopes_GetCatalog(false);
    if (!catalog || !catalog.ok || !Array.isArray(catalog.rows)) throw new Error('CONFIG_SCOPES_CATALOG_UNAVAILABLE');
    rows = catalog.rows.slice();
  } else {
    throw new Error('CONFIG_SCOPES_SERVICE_REQUIRED');
  }
  if (rows.length > 20) throw new Error('CONFIG_SCOPES_MAX_20_EXCEEDED');
  var seenSlots = {};
  var seenCodes = {};
  for (var si = 0; si < rows.length; si++) {
    var slotId = String(rows[si].slotKey || '').trim().toUpperCase();
    var scopeCode = String(rows[si].scopeCode || '').trim().toUpperCase();
    if (!/^SCOPE_(?:0[1-9]|1[0-9]|20)$/.test(slotId)) throw new Error('CONFIG_SCOPES_INVALID_SLOT_' + slotId);
    if (seenSlots[slotId]) throw new Error('CONFIG_SCOPES_DUPLICATE_SLOT_' + slotId);
    seenSlots[slotId] = true;
    if (scopeCode) {
      if (seenCodes[scopeCode]) throw new Error('CONFIG_SCOPES_DUPLICATE_CODE_' + scopeCode);
      seenCodes[scopeCode] = true;
    }
  }
  var ap = ss.getSheetByName('Audit planning');
  if (!ap) throw new Error('AUDIT_PLANNING_SHEET_MISSING');
  var headers = ap.getRange(1, 1, 1, ap.getLastColumn()).getValues()[0] || [];
  var byHeader = {};
  for (var h = 0; h < headers.length; h++) {
    var normalized = String(headers[h] || '').trim().toLowerCase();
    if (normalized) byHeader[normalized] = h;
  }
  var flagCols = [2,4,6,8,10,12,14,16];
  var hourCols = [3,5,7,9,11,13,15,17];
  return rows.map(function(item, i) {
    var slotKey = String(item.slotKey || '').trim();
    var slotNumber = /^SCOPE_(\d{2})$/.test(slotKey) ? Number(slotKey.slice(6)) : 0;
    if (!slotNumber || slotNumber > 20) throw new Error('CONFIG_SCOPES_INVALID_SLOT_' + slotKey);
    var flag = byHeader[slotKey.toLowerCase()];
    var hours = byHeader[('Duration ' + slotKey).toLowerCase()];
    if (hours === undefined) hours = byHeader[(slotKey + '_hours').toLowerCase()];
    // Legacy hours column is positional only for original eight scope slots.
    if (slotNumber <= 8 && flag === undefined) flag = flagCols[slotNumber - 1];
    if (slotNumber <= 8 && hours === undefined) hours = hourCols[slotNumber - 1];
    if (slotNumber > 8 && (flag === undefined || hours === undefined)) {
      throw new Error('AUDIT_PLANNING_SCOPE_COLUMNS_MISSING_' + slotKey);
    }
    return {
      slotKey: slotKey,
      scope: String(item.displayName || '').trim(),
      defaultHours: m5t_toNumberOrZero_(item.defaultHours),
      sortOrder: m5t_toNumberOrZero_(item.sortOrder),
      maxConsecutive: m5t_toIntOrNull_(item.maxNumberAudits),
      flagCol0: flag === undefined ? null : flag,
      hourCol0: hours === undefined ? null : hours
    };
  });
}

function m5t_scopeAliasMeta_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (typeof ConfigScopes_GetAliasMeta === 'function') {
      var svcMeta = ConfigScopes_GetAliasMeta(false);
      if (svcMeta && svcMeta.ok && svcMeta.byAnyKey && svcMeta.aliasesByCanonical) {
        return {
          byAnyKey: svcMeta.byAnyKey,
          aliasesByCanonical: svcMeta.aliasesByCanonical
        };
      }
    }
  } catch (eBridge) {}

  var sh = ss.getSheetByName('Config_Scopes');
  var meta = {
    byAnyKey: {},
    aliasesByCanonical: {}
  };
  if (!sh) return meta;

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return meta;

  var hm = m5t_makeHeaderMap_(values[0]);
  var slotCol = m5t_pickHeader_(hm, ['SlotKey','Slot key','Slot']);
  var codeCol = m5t_pickHeader_(hm, ['ScopeCode','Scope code','Code']);
  var nameCol = m5t_pickHeader_(hm, ['DisplayName','Display name','Name','ScopeName','Scope']);

  function addKey_(key, canonical) {
    var k = String(key || '').trim();
    if (!k) return;
    meta.byAnyKey[m5t_normHeader_(k)] = canonical;
  }

  function addAlias_(canonical, alias) {
    canonical = String(canonical || '').trim();
    alias = String(alias || '').trim();
    if (!canonical || !alias) return;
    if (!meta.aliasesByCanonical[canonical]) meta.aliasesByCanonical[canonical] = [];
    if (meta.aliasesByCanonical[canonical].indexOf(alias) < 0) {
      meta.aliasesByCanonical[canonical].push(alias);
    }
  }

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var canonical = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
    var slotKey = slotCol >= 0 ? String(row[slotCol] || '').trim() : '';
    var scopeCode = codeCol >= 0 ? String(row[codeCol] || '').trim() : '';
    if (!canonical) continue;

    addKey_(canonical, canonical);
    addKey_(slotKey, canonical);
    addKey_(scopeCode, canonical);

    addAlias_(canonical, canonical);
    if (scopeCode) addAlias_(canonical, scopeCode);
    if (slotKey) addAlias_(canonical, slotKey);

    if (canonical === 'Florimark Tracecert') {
      addAlias_(canonical, 'Florimark Tracecert');
      addAlias_(canonical, 'FLORIMARK_TF');
      addKey_('Florimark Tracecert', canonical);
      addKey_('FLORIMARK_TF', canonical);
    }
    if (canonical === 'Florimark GTP') {
      addAlias_(canonical, 'FLORIMARK_G');
      addKey_('FLORIMARK_G', canonical);
    }
  }

  return meta;
}

function m5t_scopeCanonicalName_(ss, rawScope) {
  var raw = String(rawScope || '').trim();
  if (!raw) return '';

  try {
    if (typeof ConfigScopes_CanonicalName === 'function') {
      return ConfigScopes_CanonicalName(raw);
    }
  } catch (eBridge) {}

  var meta = m5t_scopeAliasMeta_(ss);
  var key = m5t_normHeader_(raw);
  return meta.byAnyKey[key] || raw;
}

function RUN_M5T_CONFIGSCOPES_BRIDGE_DIAGNOSTICS() {
  var started = new Date().getTime();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var defs = m5t_scopeSlotDefs_(ss);
  var aliasMeta = m5t_scopeAliasMeta_(ss);

  var out = {
    ok: true,
    durationMs: new Date().getTime() - started,
    configScopesServiceAvailable: {
      catalog: typeof ConfigScopes_GetCatalog === 'function',
      aliasMeta: typeof ConfigScopes_GetAliasMeta === 'function',
      canonical: typeof ConfigScopes_CanonicalName === 'function'
    },
    scopeCount: defs.length,
    aliasKeyCount: Object.keys(aliasMeta.byAnyKey || {}).length,
    sampleScopes: defs.slice(0, 10).map(function(x) {
      return {
        slotKey: x.slotKey,
        scope: x.scope,
        defaultHours: x.defaultHours,
        maxConsecutive: x.maxConsecutive,
        flagCol0: x.flagCol0,
        hourCol0: x.hourCol0
      };
    })
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}



/***********************************************************************
 * FINAL HOTFIX — 2026-04-24 — SELF PLANNING PREASSIGNED AUDITOR REQUIRED
 *
 * PURPOSE
 * - Server-side hard block:
 *   Allow self planning = YES requires a preassigned auditor email.
 * - Prevents bypass via UI/cache/stale client.
 *
 * SCOPE
 * - Final override of m5t_upsertScopes only.
 * - Keeps existing scope/hour/date/write behavior.
 ***********************************************************************/

