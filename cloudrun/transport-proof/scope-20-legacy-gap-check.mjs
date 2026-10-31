/**
 * AMS Scope 20 — non-mutating legacy-consumer gap check.
 * Usage: node scope-20-legacy-gap-check.mjs [--strict]
 * No credentials, Sheets writes, deployment or production access.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checks = [
  {
    id: 'QUALIFICATION_COLUMN_DEPENDENCY',
    file: 'AuditorsIndexService.js',
    pattern: /AuditorsIndex_findExactHeader_\(headers, scope\)/,
    issue: 'Auditor qualification lookup still starts from physical Auditors scope headers.',
    severity: 'BLOCKER'
  },
  {
    id: 'CLOUD_RUN_AUDITOR_QUALIFICATION_COLUMN_DEPENDENCY',
    file: 'cloudrun/transport-proof/server-r4.js',
    pattern: /AUDITOR_QUALIFICATION_COLUMN_MISSING/,
    issue: 'Manager Auditor qualification writer is still dependent on physical Auditors sheet columns.',
    severity: 'BLOCKER'
  },
  {
    id: 'PREASSIGNMENT_COLUMN_DEPENDENCY',
    file: 'AuditManagerToolsScopes.js',
    pattern: /SCOPE_QUALIFICATION_COLUMN_UNAVAILABLE/,
    issue: 'Preassignment fails if the selected scope has no legacy Audit planning flag column.',
    severity: 'BLOCKER'
  },
  {
    id: 'LEGACY_AUDIT_PLANNING_OWNER',
    file: 'AuditPlanningConfigScopes.js',
    pattern: /Audit planning SCOPE_XX columns marked/,
    issue: 'Legacy scope extraction reads physical SCOPE_XX columns rather than Model C relations.',
    severity: 'MIGRATION'
  },
  {
    id: 'FIXED_EIGHT_ANNUAL_VALIDATION',
    file: 'ECAS_AnnualValidation.js',
    pattern: /SCOPE_08|SCOPE_07/,
    issue: 'Review annual validation for eight-slot column mappings (only if still used).',
    severity: 'REVIEW'
  },
  {
    id: 'LEGACY_STATIC_AUDITOR_LIST',
    file: 'AuditorV5Backend.js',
    pattern: /var preferredOrder = \[/,
    issue: 'Legacy Auditor V5 retains a static fallback scope-name order.',
    severity: 'REVIEW'
  }
];

let blockers = 0;
let unknown = 0;
for (const c of checks) {
  const fullPath = resolve(root, c.file);
  if (!existsSync(fullPath)) {
    unknown++;
    console.log('UNKNOWN ' + c.id + ': source missing: ' + c.file);
    continue;
  }
  const src = readFileSync(fullPath, 'utf8');
  if (c.pattern.test(src)) {
    if (c.severity === 'BLOCKER') blockers++;
    console.log(c.severity + ' ' + c.id + ' | ' + c.file + ' | ' + c.issue);
  } else {
    console.log('CLEAR ' + c.id + ' | ' + c.file + ' | signature not found; manual functional parity still required');
  }
}
console.log('Scope 20 legacy signature scan: blockers=' + blockers + ', unknown=' + unknown);
console.log('This scan is static evidence only. It does not prove DEV runtime, migration parity or Scope 09–20 functionality.');
if (process.argv.includes('--strict') && (blockers || unknown)) process.exitCode = 1;
