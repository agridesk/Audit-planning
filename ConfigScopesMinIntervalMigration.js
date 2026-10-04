/**
 * FILE: ConfigScopesMinIntervalMigration.gs
 * BUILD: 2026-10-04_V211_MIN_INTERVAL_SCHEMA_R1
 * PURPOSE:
 *   One-time, explicit DEV migration helper for canonical Config_Scopes
 *   Min_Interval_Months support.
 *
 * SAFETY:
 *   - Never runs automatically.
 *   - Preview performs no writes.
 *   - Apply only adds/fills the single canonical column.
 *   - Existing positive values are preserved.
 *   - V2.11 mandatory seed: MPS-GAP = 6 months.
 */

var CONFIG_SCOPES_MIN_INTERVAL_MIGRATION = Object.freeze({
  VERSION: '2026-10-04_V211_MIN_INTERVAL_SCHEMA_R1',
  SHEET: 'Config_Scopes',
  HEADER: 'Min_Interval_Months',
  MPS_GAP_MONTHS: 6
});

function ConfigScopesMinIntervalMigration_Preview() {
  return ConfigScopesMinIntervalMigration_run_(false);
}

function ConfigScopesMinIntervalMigration_Apply() {
  return ConfigScopesMinIntervalMigration_run_(true);
}

function ConfigScopesMinIntervalMigration_run_(apply) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.SHEET);
  if (!sh) throw new Error('CONFIG_SCOPES_SHEET_NOT_FOUND');

  var lastRow = Math.max(1, sh.getLastRow());
  var lastCol = Math.max(1, sh.getLastColumn());
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0] || [];
  var map = {};

  for (var c = 0; c < headers.length; c++) {
    var hk = ConfigScopesMinIntervalMigration_key_(headers[c]);
    if (hk && map[hk] === undefined) map[hk] = c;
  }

  var targetKey = ConfigScopesMinIntervalMigration_key_(CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.HEADER);
  var targetCol = map[targetKey];
  var targetExists = targetCol !== undefined;
  if (!targetExists) targetCol = headers.length;

  var scopeCol = ConfigScopesMinIntervalMigration_pick_(map, [
    'ScopeCode','Scope code','Code','DisplayName','Display name','Name','ScopeName','Scope','SlotKey','Slot key','Slot'
  ]);
  if (scopeCol < 0) throw new Error('CONFIG_SCOPES_SCOPE_COLUMN_NOT_FOUND');

  var changes = [];
  for (var r = 1; r < values.length; r++) {
    var scope = String(values[r][scopeCol] == null ? '' : values[r][scopeCol]).trim();
    if (!scope) continue;

    var raw = targetExists ? values[r][targetCol] : '';
    var num = Number(String(raw == null ? '' : raw).replace(',','.'));
    var hasPositive = isFinite(num) && num > 0;
    var desired = hasPositive ? num : (ConfigScopesMinIntervalMigration_isMpsGap_(scope) ? CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.MPS_GAP_MONTHS : 0);

    if (!targetExists || String(raw == null ? '' : raw).trim() === '' || (!hasPositive && desired > 0)) {
      changes.push({
        row: r + 1,
        scope: scope,
        before: raw,
        after: desired
      });
    }
  }

  if (apply) {
    if (!targetExists) {
      sh.getRange(1, targetCol + 1).setValue(CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.HEADER);
    }
    if (changes.length) {
      for (var i = 0; i < changes.length; i++) {
        sh.getRange(changes[i].row, targetCol + 1).setValue(changes[i].after);
      }
    }
    try {
      if (typeof RotationAuditorService_clearCache === 'function') RotationAuditorService_clearCache();
    } catch (e0) {}
    try {
      if (typeof ConfigScopes_ClearCache === 'function') ConfigScopes_ClearCache();
    } catch (e1) {}
  }

  return {
    success: true,
    build: CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.VERSION,
    apply: !!apply,
    sheet: CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.SHEET,
    header: CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.HEADER,
    targetColumn: targetCol + 1,
    targetExists: targetExists,
    changes: changes,
    writesPerformed: !!apply && (!targetExists || changes.length > 0),
    mpsGapMonths: CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.MPS_GAP_MONTHS
  };
}

function ConfigScopesMinIntervalMigration_isMpsGap_(value) {
  return ConfigScopesMinIntervalMigration_key_(value).replace(/[^a-z0-9]/g,'') === 'mpsgap';
}

function ConfigScopesMinIntervalMigration_pick_(map, names) {
  for (var i = 0; i < names.length; i++) {
    var k = ConfigScopesMinIntervalMigration_key_(names[i]);
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

function ConfigScopesMinIntervalMigration_key_(value) {
  return String(value == null ? '' : value)
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}
