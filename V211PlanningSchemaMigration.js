/**
 * FILE: V211PlanningSchemaMigration.gs
 * BUILD: 2026-10-04_V211_PLANNING_SCHEMA_BUNDLE_R1
 * PURPOSE:
 *   Single explicit runner for V2.11 Planning schema additions.
 *
 * INCLUDED:
 *   - Config_Scopes.Min_Interval_Months
 *   - Companies.Auditor_Exclusions
 *
 * SAFETY:
 *   - Preview performs no writes.
 *   - Apply delegates only to the dedicated guarded migrations.
 */

function V211PlanningSchemaMigration_Preview() {
  return {
    success: true,
    build: '2026-10-04_V211_PLANNING_SCHEMA_BUNDLE_R1',
    apply: false,
    minInterval: ConfigScopesMinIntervalMigration_Preview(),
    auditorExclusions: CompaniesAuditorExclusionsMigration_Preview()
  };
}

function V211PlanningSchemaMigration_Apply() {
  return {
    success: true,
    build: '2026-10-04_V211_PLANNING_SCHEMA_BUNDLE_R1',
    apply: true,
    minInterval: ConfigScopesMinIntervalMigration_Apply(),
    auditorExclusions: CompaniesAuditorExclusionsMigration_Apply()
  };
}


function V211PlanningSchemaMigration_Verify() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var cfg = ss.getSheetByName('Config_Scopes');
  var companies = ss.getSheetByName('Companies');
  if (!cfg) throw new Error('CONFIG_SCOPES_SHEET_NOT_FOUND');
  if (!companies) throw new Error('COMPANIES_SHEET_NOT_FOUND');

  function headerIndex_(sh, wanted) {
    var lastCol = Math.max(1, sh.getLastColumn());
    var h = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var target = String(wanted || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    for (var i = 0; i < h.length; i++) {
      var k = String(h[i] == null ? '' : h[i]).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (k === target) return i + 1;
    }
    return 0;
  }

  var minIntervalCol = headerIndex_(cfg, 'Min_Interval_Months');
  var exclusionsCol = headerIndex_(companies, 'Auditor_Exclusions');

  var minIntervalValues = [];
  if (minIntervalCol > 0 && cfg.getLastRow() > 1) {
    var scopeHeaders = cfg.getRange(1, 1, 1, cfg.getLastColumn()).getValues()[0] || [];
    var scopeCol = 0;
    var scopeAliases = ['ScopeCode','DisplayName','Scope','SlotKey'];
    for (var s = 0; s < scopeAliases.length && !scopeCol; s++) {
      scopeCol = headerIndex_(cfg, scopeAliases[s]);
    }

    var rows = cfg.getRange(2, 1, cfg.getLastRow() - 1, cfg.getLastColumn()).getValues();
    for (var r = 0; r < rows.length; r++) {
      var raw = rows[r][minIntervalCol - 1];
      if (String(raw == null ? '' : raw).trim() === '') continue;
      minIntervalValues.push({
        row: r + 2,
        scope: scopeCol > 0 ? String(rows[r][scopeCol - 1] || '').trim() : '',
        months: Number(String(raw).replace(',','.'))
      });
    }
  }

  var out = {
    success: true,
    build: '2026-10-04_V211_PLANNING_SCHEMA_BUNDLE_R2_VERIFY',
    configScopes: {
      minIntervalHeaderPresent: minIntervalCol > 0,
      minIntervalColumn: minIntervalCol,
      configuredValues: minIntervalValues
    },
    companies: {
      auditorExclusionsHeaderPresent: exclusionsCol > 0,
      auditorExclusionsColumn: exclusionsCol
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
