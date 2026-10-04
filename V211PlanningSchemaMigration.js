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
