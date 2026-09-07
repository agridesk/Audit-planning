/**
 * ProjectDocs.gs
 * Build: 2026-04-26_PROJECT_DOCS_COMPACT_GOVERNANCE
 *
 * Read-only project documentation snapshot for the Audit Management System.
 *
 * Purpose:
 * - Provide compact governance context for the diagnostics panel.
 * - Provide release baseline and architecture reference.
 * - Document intended project rules in human-readable form.
 *
 * Boundaries:
 * - Does not execute diagnostics.
 * - Does not read or write sheets.
 * - Does not use cache, properties, triggers, mail, fetch or drive services.
 * - Does not enforce business rules.
 * - Does not own runtime state.
 *
 * Governance rule:
 * This file documents intended rules only. Runtime truth remains in the actual
 * system files and Google Sheets sources of truth.
 */

const PROJECTDOCS_BUILD = '2026-04-26_PROJECT_DOCS_COMPACT_GOVERNANCE';
const PROJECTDOCS_RELEASE_STAMP = '2026-04-26_001';

const PROJECTDOCS_INFO = Object.freeze({
  name: 'Audit Management System',
  stage: 'MVP Production',
  owner: 'Agri Quality Assurance',
  architecture: 'Google Apps Script + Google Sheets',
  ssot: 'Google Sheets',
  uiMode: 'Single Manager Grid',
  role: 'Read-only governance and diagnostic context',
  lastUpdated: '2026-04-26',
  releaseStamp: PROJECTDOCS_RELEASE_STAMP
});

const PROJECTDOCS_BOUNDARIES = Object.freeze([
  'ProjectDocs.gs documents intended rules only.',
  'ProjectDocs.gs never enforces runtime rules.',
  'ProjectDocs.gs never reads or writes sheets.',
  'ProjectDocs.gs never runs diagnostics.',
  'ProjectDocs.gs never uses cache or runtime services.',
  'ProjectDocs.gs must not become a second backend or second truth.',
  'Diagnostics.gs owns real checks, timings, probes and validations.'
]);

const PROJECTDOCS_RULES = Object.freeze([
  'Audit ID is the only technical key for audits.',
  'Auditor email is the unique identifier for auditors.',
  'Actions are not statuses.',
  'Cancel and Deny are not statuses.',
  'Reject is the only terminal rejection outcome.',
  'Audit planning is the active workflow source of truth.',
  'Log realized audits is completed audit history.',
  'Rejected audits is rejection history.',
  'Auditor Availability is the capacity layer, not historical storage.',
  'Config_Scopes is the source of truth for scope metadata.',
  'Companies.Locations_JSON is the authoritative source for company locations.',
  'Legacy HQ fields in Companies are mirrors only.',
  'Only already planned audits are hard blocks.',
  'Company blocked weekdays are soft planning constraints.',
  'Planning window from/to is a hard planning constraint.',
  'Backend remains authoritative after actions; frontend reflects confirmed results.'
]);

const PROJECTDOCS_STATUS_MODEL = Object.freeze({
  flow: Object.freeze([
    'Pending Planning',
    'Pending Approval',
    'Approved',
    'Accepted',
    'Completed'
  ]),
  canonicalStatuses: Object.freeze([
    'Pending Planning',
    'Pending Approval',
    'Approved',
    'Accepted',
    'Completed',
    'Rejected'
  ]),
  actions: Object.freeze([
    'Plan',
    'Approve',
    'Accept',
    'Complete',
    'Cancel',
    'Deny',
    'Reject'
  ]),
  notes: Object.freeze([
    'Manager planning from Pending Planning moves directly to Approved.',
    'Auditor self-planning moves to Pending Approval.',
    'Deny is allowed only in the early proposal phase.',
    'Cancel returns an audit to Pending Planning.',
    'No Cancelled or Denied status should be introduced.'
  ])
});

const PROJECTDOCS_RELEASE_BASELINE = Object.freeze({
  managerUi: 'ManagerV5UI.html',
  auditorUi: 'AuditorPortalV5.html',
  planningToolkitUi: 'ManagerPlanningV5UI.html',
  planningBackend: 'ManagerPlanningV5Backend.gs',
  statusMachine: 'StatusMachine.gs',
  availabilityOwner: 'AvailabilityService.gs',
  cacheOwner: 'CacheService.gs',
  diagnosticsOwner: 'Diagnostics.gs',
  projectDocs: 'ProjectDocs.gs'
});

const PROJECTDOCS_OPEN_ISSUES = Object.freeze([
  'Planning Toolkit close behaviour is browser-limited.',
  'Completed grid micro-refresh can still lag in some cases.',
  'Map clustering performance remains under investigation.',
  'Batch planning and route proposal layer is post-MVP.',
  'Readjust flow after MVP still requires final status-policy decision.'
]);

const PROJECTDOCS_DIAGNOSTIC_NOTES = Object.freeze({
  cache: 'Warm cache is expected after first manager load. Cache checks belong in Diagnostics.gs.',
  availability: 'Auditor Availability is the source of truth for capacity and planning blocks.',
  planning: 'Existing planned audits are hard blocks. Planning window is a hard constraint.',
  locations: 'Companies.Locations_JSON is authoritative. Legacy HQ fields are mirrors only.',
  scopes: 'Config_Scopes is authoritative for scope metadata and planning-related scope settings.',
  status: 'StatusMachine.gs owns actual transitions. ProjectDocs.gs only describes intended behaviour.',
  diagnostics: 'Diagnostics.gs performs checks, timings, cache inspection, consistency validation and orphan detection.',
  governance: 'ProjectDocs.gs must remain compact, read-only and non-runtime.'
});

const PROJECTDOCS_UPDATE_POLICY = Object.freeze([
  'Update ProjectDocs.gs only after release baseline changes.',
  'Update ProjectDocs.gs only after architecture decisions.',
  'Update ProjectDocs.gs only after golden rule changes.',
  'Update ProjectDocs.gs only for MVP risks that must be visible in the diagnostics panel.',
  'Do not add temporary RCA, logs, probes or detailed diagnostics narratives.'
]);

function ProjectDocs_getSnapshot() {
  return {
    build: PROJECTDOCS_BUILD,
    info: PROJECTDOCS_INFO,
    boundaries: PROJECTDOCS_BOUNDARIES,
    rules: PROJECTDOCS_RULES,
    statusModel: PROJECTDOCS_STATUS_MODEL,
    baseline: PROJECTDOCS_RELEASE_BASELINE,
    openIssues: PROJECTDOCS_OPEN_ISSUES,
    diagnosticNotes: PROJECTDOCS_DIAGNOSTIC_NOTES,
    updatePolicy: PROJECTDOCS_UPDATE_POLICY
  };
}

function ProjectDocs_getTextSnapshot() {
  var snapshot = ProjectDocs_getSnapshot();
  var lines = [];

  ProjectDocs_addSection_(lines, 'PROJECT INFO');
  ProjectDocs_addKeyValue_(lines, 'Build', snapshot.build);
  ProjectDocs_addKeyValue_(lines, 'Name', snapshot.info.name);
  ProjectDocs_addKeyValue_(lines, 'Stage', snapshot.info.stage);
  ProjectDocs_addKeyValue_(lines, 'Owner', snapshot.info.owner);
  ProjectDocs_addKeyValue_(lines, 'Architecture', snapshot.info.architecture);
  ProjectDocs_addKeyValue_(lines, 'SSOT', snapshot.info.ssot);
  ProjectDocs_addKeyValue_(lines, 'UI mode', snapshot.info.uiMode);
  ProjectDocs_addKeyValue_(lines, 'Role', snapshot.info.role);
  ProjectDocs_addKeyValue_(lines, 'Last updated', snapshot.info.lastUpdated);

  ProjectDocs_addSection_(lines, 'BOUNDARIES');
  ProjectDocs_addList_(lines, snapshot.boundaries);

  ProjectDocs_addSection_(lines, 'PROJECT RULES');
  ProjectDocs_addList_(lines, snapshot.rules);

  ProjectDocs_addSection_(lines, 'STATUS MODEL');
  ProjectDocs_addKeyValue_(lines, 'Flow', snapshot.statusModel.flow.join(' -> '));
  ProjectDocs_addKeyValue_(lines, 'Canonical statuses', snapshot.statusModel.canonicalStatuses.join(', '));
  ProjectDocs_addKeyValue_(lines, 'Actions', snapshot.statusModel.actions.join(', '));
  ProjectDocs_addList_(lines, snapshot.statusModel.notes);

  ProjectDocs_addSection_(lines, 'RELEASE BASELINE');
  ProjectDocs_addObject_(lines, snapshot.baseline);

  ProjectDocs_addSection_(lines, 'OPEN ISSUES');
  ProjectDocs_addList_(lines, snapshot.openIssues);

  ProjectDocs_addSection_(lines, 'DIAGNOSTIC NOTES');
  ProjectDocs_addObject_(lines, snapshot.diagnosticNotes);

  ProjectDocs_addSection_(lines, 'UPDATE POLICY');
  ProjectDocs_addList_(lines, snapshot.updatePolicy);

  ProjectDocs_addSection_(lines, 'GOVERNANCE WARNING');
  lines.push('This file documents intended rules only. It must not enforce rules, run diagnostics, read sheets, use cache or become a second truth.');

  return lines.join('\n');
}


function RUN_PROJECTDOCS_RELEASE_SNAPSHOT() {
  return ProjectDocs_getReleaseSnapshot();
}

function ProjectDocs_getReleaseSnapshot() {
  return {
    ok: true,
    generatedAt: ProjectDocs_staticGeneratedAt_(),
    build: PROJECTDOCS_BUILD,
    releaseStamp: PROJECTDOCS_RELEASE_STAMP,
    snapshot: ProjectDocs_getSnapshot(),
    manualUpdatePolicy: PROJECTDOCS_UPDATE_POLICY,
    releaseChecklist: [
      'Confirm release baseline filenames are still correct.',
      'Confirm open issues are still MVP-relevant and compact.',
      'Confirm golden rules still match the actual implemented architecture.',
      'Confirm no runtime logic, diagnostics, sheet reads, cache calls or validations were added.',
      'After changing this file, run ProjectDocs_getTextSnapshot() or RUN_PROJECTDOCS_RELEASE_SNAPSHOT() manually.'
    ],
    note: 'Manual governance snapshot only. This function does not update itself, read sheets, inspect code, run diagnostics or enforce business rules.'
  };
}

function ProjectDocs_getReleaseStamp() {
  return {
    build: PROJECTDOCS_BUILD,
    releaseStamp: PROJECTDOCS_RELEASE_STAMP,
    lastUpdated: PROJECTDOCS_INFO.lastUpdated
  };
}

function ProjectDocs_staticGeneratedAt_() {
  return PROJECTDOCS_INFO.lastUpdated + ' manual snapshot';
}
function ProjectDocs_addSection_(lines, title) {
  if (lines.length) lines.push('');
  lines.push(String(title || '').toUpperCase());
}

function ProjectDocs_addKeyValue_(lines, key, value) {
  lines.push(String(key || '') + ': ' + String(value == null ? '' : value));
}

function ProjectDocs_addList_(lines, items) {
  (items || []).forEach(function(item) {
    lines.push('- ' + String(item == null ? '' : item));
  });
}

function ProjectDocs_addObject_(lines, obj) {
  Object.keys(obj || {}).forEach(function(key) {
    lines.push('- ' + key + ': ' + String(obj[key] == null ? '' : obj[key]));
  });
}
