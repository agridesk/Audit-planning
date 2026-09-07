// BUILD: AuditManagerToolsConfigScopes_20260425
// Config_Scopes bridge + diagnostics. Active final definitions only.

function m5t_scopeSlotDefs_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (typeof ConfigScopes_GetCatalog === 'function') {
      var catalog = ConfigScopes_GetCatalog(false);
      if (catalog && catalog.ok && Array.isArray(catalog.rows) && catalog.rows.length) {
        var rows = catalog.rows.slice();

        var flagCols = [2,4,6,8,10,12,14,16];
        var hourCols = [3,5,7,9,11,13,15,17];

        var out = [];
        for (var i = 0; i < rows.length && i < 8; i++) {
          var item = rows[i] || {};
          out.push({
            slotKey: String(item.slotKey || '').trim(),
            scope: String(item.displayName || '').trim(),
            defaultHours: m5t_toNumberOrZero_(item.defaultHours),
            sortOrder: m5t_toNumberOrZero_(item.sortOrder),
            maxConsecutive: m5t_toIntOrNull_(item.maxNumberAudits),
            flagCol0: flagCols[i],
            hourCol0: hourCols[i]
          });
        }

        return out;
      }
    }
  } catch (eBridge) {}

  var cfg = ss.getSheetByName('Config_Scopes');
  var outFallback = [];
  var maxByScope = {};

  try {
    m5t_listStandardsScopes_(ss).forEach(function(s){
      maxByScope[String(s.scope || '').trim()] = s.maxConsecutive;
    });
  } catch (e0) {}

  if (cfg) {
    var values = cfg.getDataRange().getValues();
    if (values.length >= 2) {
      var headers = values[0];
      var hm = m5t_makeHeaderMap_(headers);
      var slotCol = m5t_pickHeader_(hm, ['SlotKey','Slot key','Slot']);
      var nameCol = m5t_pickHeader_(hm, ['DisplayName','Display name','Name','ScopeName','Scope']);
      var defCol  = m5t_pickHeader_(hm, ['Default_hours','Default hours','DefaultHours']);
      var sortCol = m5t_pickHeader_(hm, ['SortOrder','Sort order','Sort']);
      for (var r = 1; r < values.length; r++) {
        var row = values[r];
        var scopeName = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
        if (!scopeName) continue;
        outFallback.push({
          slotKey: slotCol >= 0 ? String(row[slotCol] || '').trim() : '',
          scope: scopeName,
          defaultHours: defCol >= 0 ? m5t_toNumberOrZero_(row[defCol]) : 0,
          sortOrder: sortCol >= 0 ? m5t_toNumberOrZero_(row[sortCol]) : (r * 10),
          maxConsecutive: maxByScope[scopeName]
        });
      }
      outFallback.sort(function(a,b){ return a.sortOrder - b.sortOrder; });
    }
  }

  if (!outFallback.length) {
    var standards = m5t_listStandardsScopes_(ss);
    for (var j = 0; j < standards.length; j++) {
      outFallback.push({
        slotKey: '',
        scope: standards[j].scope,
        defaultHours: m5t_toNumberOrZero_(standards[j].defaultHours),
        sortOrder: j + 1,
        maxConsecutive: standards[j].maxConsecutive
      });
    }
  }

  var flagColsFallback = [2,4,6,8,10,12,14,16];
  var hourColsFallback = [3,5,7,9,11,13,15,17];
  for (var k = 0; k < outFallback.length && k < 8; k++) {
    outFallback[k].flagCol0 = flagColsFallback[k];
    outFallback[k].hourCol0 = hourColsFallback[k];
  }

  return outFallback.slice(0, 8);
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

