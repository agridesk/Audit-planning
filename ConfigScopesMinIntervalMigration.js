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
 *   - Business interval values are never hardcoded here; Config_Scopes owns them.
 */

var CONFIG_SCOPES_MIN_INTERVAL_MIGRATION = Object.freeze({
  VERSION: '2026-10-04_V211_MIN_INTERVAL_SCHEMA_R1',
  SHEET: 'Config_Scopes',
  HEADER: 'Min_Interval_Months'
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

  var changes = [];

  // Schema-only migration: no business interval values are written here.
  // Min_Interval_Months values must come from canonical Config_Scopes data.

  if (apply) {
    if (!targetExists) {
      sh.getRange(1, targetCol + 1).setValue(CONFIG_SCOPES_MIN_INTERVAL_MIGRATION.HEADER);
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
    writesPerformed: !!apply && (!targetExists || changes.length > 0)
  };
}

function ConfigScopesMinIntervalMigration_key_(value) {
  return String(value == null ? '' : value)
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}
