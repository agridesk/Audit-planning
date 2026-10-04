/**
 * FILE: CompaniesAuditorExclusionsMigration.gs
 * BUILD: 2026-10-04_V211_AUDITOR_EXCLUSIONS_SCHEMA_R1
 * PURPOSE:
 *   Explicit one-time schema migration for V2.11 Company-level
 *   Auditor_Exclusions.
 *
 * SAFETY:
 *   - Never runs automatically.
 *   - Preview performs no writes.
 *   - Apply only adds the canonical column when absent.
 *   - Existing data is never changed.
 *
 * VALUE CONTRACT:
 *   Preferred storage is JSON, for example:
 *   [{"auditorEmail":"auditor@example.com","active":true,"reason":"..."}]
 *   Planning also tolerates a legacy/simple delimited email list on read.
 */

var COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION = Object.freeze({
  VERSION: '2026-10-04_V211_AUDITOR_EXCLUSIONS_SCHEMA_R1',
  SHEET: 'Companies',
  HEADER: 'Auditor_Exclusions'
});

function CompaniesAuditorExclusionsMigration_Preview() {
  return CompaniesAuditorExclusionsMigration_run_(false);
}

function CompaniesAuditorExclusionsMigration_Apply() {
  return CompaniesAuditorExclusionsMigration_run_(true);
}

function CompaniesAuditorExclusionsMigration_run_(apply) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION.SHEET);
  if (!sh) throw new Error('COMPANIES_SHEET_NOT_FOUND');

  var lastCol = Math.max(1, sh.getLastColumn());
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var found = -1;

  for (var i = 0; i < headers.length; i++) {
    if (CompaniesAuditorExclusionsMigration_key_(headers[i]) === CompaniesAuditorExclusionsMigration_key_(COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION.HEADER)) {
      found = i;
      break;
    }
  }

  var targetCol = found >= 0 ? found + 1 : headers.length + 1;
  var writesPerformed = false;

  if (apply && found < 0) {
    sh.getRange(1, targetCol).setValue(COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION.HEADER);
    writesPerformed = true;
  }

  return {
    success: true,
    build: COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION.VERSION,
    apply: !!apply,
    sheet: COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION.SHEET,
    header: COMPANIES_AUDITOR_EXCLUSIONS_MIGRATION.HEADER,
    targetColumn: targetCol,
    targetExists: found >= 0,
    writesPerformed: writesPerformed
  };
}

function CompaniesAuditorExclusionsMigration_key_(value) {
  return String(value == null ? '' : value)
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
