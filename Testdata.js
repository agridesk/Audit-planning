/**
 * Testdata.gs — expanded exact-header version v9
 * Version: 2026-05-01_002_PLANNED_HOURS_FIX_20260501_140535
 *
 * Public entrypoints:
 * - TESTDATA_resetAll()
 * - TESTDATA_clearAll()
 * - TESTDATA_seedAll()
 * - TESTDATA_reportCoverage()
 * - TESTDATA_reportPlanningHoursConsistency()
 *
 * Scope:
 * - Seeds complete DEV test rows for:
 *   - Audit planning
 *   - Companies
 *   - Log realized audits
 *   - Rejected audits
 *   - Auditor availability
 *   - Notification Queue
 *
 * Safety:
 * - TESTDATA_resetAll / TESTDATA_clearAll / TESTDATA_seedAll are blocked in PROD.
 * - Only generated records with prefix TEST_ are removed.
 * - Log realized audits is extra protected: only exact seed Audit IDs are cleared.
 * - System/configuration tabs are not mutated:
 *   - Auditors
 *   - Config_Scopes
 *   - Notification_Config
 *   - Notification_Rules
 *   - Notification_Settings
 *   - System_Config
 */

var TESTDATA_VERSION = '2026-05-01_002_PLANNED_HOURS_FIX_20260501_140535';
var TESTDATA_PREFIX = 'TEST_';
var TESTDATA_AUDITOR = 'romboutsrwj@gmail.com';
var TESTDATA_AUDITOR_2 = 'planning@agriqa.es';
var TESTDATA_MANAGER_EMAIL = 'planning@agriqa.es';

var TESTDATA_PROD_ENV_VALUES = ['PROD', 'PRODUCTION', 'LIVE'];
var TESTDATA_SAFE_LOG_REALIZED_AUDIT_IDS = [
  TESTDATA_PREFIX + 'COMPLETED_01',
  TESTDATA_PREFIX + 'COMPLETED_ROTATION_02'
];

function TESTDATA_assertNotProd_(actionName) {
  var env = TESTDATA_getRuntimeEnv_();
  var normalized = String(env || '').trim().toUpperCase();

  if (TESTDATA_PROD_ENV_VALUES.indexOf(normalized) >= 0) {
    throw new Error(
      'BLOCKED: ' + actionName + ' may not run in PROD. ' +
      'Detected environment: ' + env + '. ' +
      'Testdata functions are DEV-only.'
    );
  }

  return {
    ok: true,
    action: actionName,
    environment: env || '',
    build: TESTDATA_VERSION
  };
}

function TESTDATA_getRuntimeEnv_() {
  var candidates = [];

  try {
    var props = PropertiesService.getScriptProperties();
    candidates.push(props.getProperty('APP_ENV'));
    candidates.push(props.getProperty('ENV'));
    candidates.push(props.getProperty('RUNTIME_ENV'));
    candidates.push(props.getProperty('AUDIT_APP_ENV'));
  } catch (eProps) {}

  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss && ss.getSheetByName('System_Config');
    if (sh && sh.getLastRow() >= 2 && sh.getLastColumn() >= 2) {
      var values = sh.getRange(1, 1, sh.getLastRow(), Math.min(sh.getLastColumn(), 4)).getValues();
      var wanted = {
        'APP_ENV': true,
        'ENV': true,
        'RUNTIME_ENV': true,
        'AUDIT_APP_ENV': true,
        'ENVIRONMENT': true
      };

      for (var r = 0; r < values.length; r++) {
        for (var c = 0; c < values[r].length - 1; c++) {
          var key = String(values[r][c] || '').trim().toUpperCase();
          if (wanted[key]) candidates.push(values[r][c + 1]);
        }
      }
    }
  } catch (eSheet) {}

  for (var i = 0; i < candidates.length; i++) {
    var v = String(candidates[i] || '').trim();
    if (v) return v;
  }

  return '';
}

function TESTDATA_resetAll() {
  TESTDATA_assertNotProd_('TESTDATA_resetAll');
  TESTDATA_clearAll();
  return TESTDATA_seedAll();
}

function TESTDATA_clearAll() {
  TESTDATA_assertNotProd_('TESTDATA_clearAll');
  var ss = SpreadsheetApp.getActive();

  _td_deleteRowsByAuditIdPrefix_(ss, 'Audit planning', TESTDATA_PREFIX);
  _td_deleteLogRealizedSeedRowsOnly_(ss);
  _td_deleteRowsByAuditIdPrefix_(ss, 'Rejected audits', TESTDATA_PREFIX);
  _td_deleteAvailabilityRowsByAuditIdPrefix_(ss, TESTDATA_PREFIX);
  _td_deleteRowsByAuditIdPrefix_(ss, 'Notification Queue', TESTDATA_PREFIX);
  _td_deleteRowsByCompanyPrefix_(ss, 'Companies', TESTDATA_PREFIX);

  return {
    ok: true,
    version: TESTDATA_VERSION,
    action: 'clear',
    prefix: TESTDATA_PREFIX
  };
}

function TESTDATA_seedAll() {
  TESTDATA_assertNotProd_('TESTDATA_seedAll');
  var ss = SpreadsheetApp.getActive();
  var yyyy = new Date().getFullYear();
  var fixtures = _td_buildFixtures_(yyyy);

  var summary = {
    ok: true,
    version: TESTDATA_VERSION,
    action: 'seed',
    prefix: TESTDATA_PREFIX,
    auditPlanningRows: _td_seedAuditPlanning_(ss, fixtures.activeAudits),
    companyRows: _td_seedCompanies_(ss, fixtures.companies),
    logRealizedRows: _td_seedLogRealized_(ss, fixtures.completedAudits),
    rejectedRows: _td_seedRejected_(ss, fixtures.rejectedAudits),
    availabilityRows: _td_seedAuditorAvailability_(ss, fixtures.availability),
    notificationRows: _td_seedNotificationQueue_(ss, fixtures.notifications),
    skippedSystemTabs: [
      'Auditors',
      'Config_Scopes',
      'Notification_Config',
      'Notification_Rules',
      'Notification_Settings',
      'System_Config'
    ]
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function TESTDATA_reportCoverage() {
  var ss = SpreadsheetApp.getActive();
  var sheetNames = [
    'Audit planning',
    'Companies',
    'Log realized audits',
    'Rejected audits',
    'Auditor availability',
    'Notification Queue'
  ];

  var report = {
    ok: true,
    version: TESTDATA_VERSION,
    prefix: TESTDATA_PREFIX,
    sheets: []
  };

  for (var i = 0; i < sheetNames.length; i++) {
    var sh = ss.getSheetByName(sheetNames[i]);
    if (!sh) {
      report.sheets.push({ sheetName: sheetNames[i], exists: false });
      continue;
    }

    var headers = _td_getHeaders_(sh);
    var h = _td_headerMap_(headers);
    report.sheets.push({
      sheetName: sheetNames[i],
      exists: true,
      lastRow: sh.getLastRow(),
      lastColumn: sh.getLastColumn(),
      headerCount: headers.filter(function(v) { return String(v || '').trim(); }).length,
      emptyHeaderCount: headers.filter(function(v) { return !String(v || '').trim(); }).length,
      hasAuditId: Object.prototype.hasOwnProperty.call(h, 'Audit ID')
    });
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function _td_buildFixtures_(yyyy) {
  var uidAlpha = _td_uid_();
  var uidBeta = _td_uid_();
  var uidGamma = _td_uid_();
  var uidDelta = _td_uid_();
  var uidEpsilon = _td_uid_();
  var uidZeta = _td_uid_();
  var uidEta = _td_uid_();
  var uidTheta = _td_uid_();
  var uidIota = _td_uid_();
  var uidKappa = _td_uid_();

  var dPendingApproval = _td_fmtDate_(new Date(yyyy, 8, 12));
  var dApproved = _td_fmtDate_(new Date(yyyy, 8, 18));
  var dAccepted = _td_fmtDate_(new Date(yyyy, 9, 10));
  var dExtension = _td_fmtDate_(new Date(yyyy, 10, 12));
  var dMulti1 = _td_fmtDate_(new Date(yyyy, 11, 2));
  var dMulti2 = _td_fmtDate_(new Date(yyyy, 11, 4));
  var dCompleted = _td_fmtDate_(new Date(yyyy, 3, 16));
  var now = _td_fmtDateTime_(new Date());

  var activeAudits = [
    {
      auditId: TESTDATA_PREFIX + 'PENDING_PLANNING_01',
      company: TESTDATA_PREFIX + ' Pending Planning Alpha',
      companyUid: uidAlpha,
      status: 'Pending Planning',
      scopes: { SCOPE_01: 8, SCOPE_03: 4 },
      totalHours: 12,
      totalDays: 1.5,
      birthdate: _td_fmtDate_(new Date(yyyy - 1, 7, 27)),
      willExpire: _td_fmtDate_(new Date(yyyy, 11, 31)),
      extExpire: _td_fmtDate_(new Date(yyyy, 11, 31)),
      allowSelfPlanning: 'Yes',
      assignedTo: '',
      datePlanned: '',
      dateApproved: '',
      auditDaysTextual: '',
      planningJson: '',
      extensionApplied: '',
      lastManagerDecision: '',
      lastAuditorDecision: '',
      managerComment: 'Seed case: open pending planning with self-planning enabled.',
      auditorComment: '',
      planningWindowFrom: _td_fmtDate_(new Date(yyyy, 7, 31)),
      planningWindowTo: _td_fmtDate_(new Date(yyyy, 10, 30))
    },
    {
      auditId: TESTDATA_PREFIX + 'PENDING_APPROVAL_01',
      company: TESTDATA_PREFIX + ' Pending Approval Beta',
      companyUid: uidBeta,
      status: 'Pending Approval',
      scopes: { SCOPE_02: 8 },
      totalHours: 8,
      totalDays: 1,
      birthdate: _td_fmtDate_(new Date(yyyy - 2, 7, 27)),
      willExpire: _td_fmtDate_(new Date(yyyy, 7, 27)),
      extExpire: _td_fmtDate_(new Date(yyyy, 11, 27)),
      allowSelfPlanning: 'Yes',
      assignedTo: TESTDATA_AUDITOR,
      datePlanned: dPendingApproval,
      dateApproved: '',
      auditDaysTextual: dPendingApproval + ' 09:00-17:00',
      planningJson: _td_planningJson_({
        auditId: TESTDATA_PREFIX + 'PENDING_APPROVAL_01',
        auditor: TESTDATA_AUDITOR,
        totalHours: 8,
        totalDays: 1,
        status: 'Pending Approval',
        days: [{ date: dPendingApproval, start: '09:00', end: '17:00', hours: 8, location: 'HQ' }]
      }),
      extensionApplied: '',
      lastManagerDecision: '',
      lastAuditorDecision: '',
      managerComment: '',
      auditorComment: 'Seed case: auditor self-planned; waiting for manager approval.',
      planningWindowFrom: _td_fmtDate_(new Date(yyyy, 7, 27)),
      planningWindowTo: _td_fmtDate_(new Date(yyyy, 10, 27))
    },
    {
      auditId: TESTDATA_PREFIX + 'APPROVED_01',
      company: TESTDATA_PREFIX + ' Approved Gamma',
      companyUid: uidGamma,
      status: 'Approved',
      scopes: { SCOPE_01: 8, SCOPE_02: 4 },
      totalHours: 12,
      totalDays: 1.5,
      birthdate: _td_fmtDate_(new Date(yyyy - 2, 7, 5)),
      willExpire: _td_fmtDate_(new Date(yyyy, 7, 5)),
      extExpire: _td_fmtDate_(new Date(yyyy, 7, 5)),
      allowSelfPlanning: 'No',
      assignedTo: TESTDATA_AUDITOR,
      datePlanned: dApproved,
      dateApproved: _td_fmtDate_(new Date(yyyy, 7, 15)),
      auditDaysTextual: dApproved + ' 09:00-17:00; ' + dApproved + ' 14:00-18:00',
      planningJson: _td_planningJson_({
        auditId: TESTDATA_PREFIX + 'APPROVED_01',
        auditor: TESTDATA_AUDITOR,
        totalHours: 12,
        totalDays: 1.5,
        status: 'Approved',
        days: [
          { date: dApproved, start: '09:00', end: '17:00', hours: 8, location: 'HQ' },
          { date: dApproved, start: '14:00', end: '18:00', hours: 4, location: 'HQ' }
        ]
      }),
      extensionApplied: '',
      lastManagerDecision: 'Approve',
      lastDecisionTimestamp: now,
      statusSince: now,
      lastAuditorDecision: '',
      managerComment: 'Seed case: manager approved planning.',
      auditorComment: '',
      planningWindowFrom: _td_fmtDate_(new Date(yyyy, 3, 29)),
      planningWindowTo: _td_fmtDate_(new Date(yyyy, 6, 29))
    },
    {
      auditId: TESTDATA_PREFIX + 'ACCEPTED_01',
      company: TESTDATA_PREFIX + ' Accepted Delta',
      companyUid: uidDelta,
      status: 'Accepted',
      scopes: { SCOPE_02: 8, SCOPE_04: 2 },
      totalHours: 10,
      totalDays: 1.25,
      birthdate: _td_fmtDate_(new Date(yyyy - 1, 10, 3)),
      willExpire: _td_fmtDate_(new Date(yyyy, 10, 3)),
      extExpire: _td_fmtDate_(new Date(yyyy, 10, 3)),
      allowSelfPlanning: 'No',
      assignedTo: TESTDATA_AUDITOR,
      datePlanned: dAccepted,
      dateApproved: _td_fmtDate_(new Date(yyyy, 8, 20)),
      auditDaysTextual: dAccepted + ' 08:30-16:30; ' + dAccepted + ' 16:30-18:30',
      planningJson: _td_planningJson_({
        auditId: TESTDATA_PREFIX + 'ACCEPTED_01',
        auditor: TESTDATA_AUDITOR,
        totalHours: 10,
        totalDays: 1.25,
        status: 'Accepted',
        days: [
          { date: dAccepted, start: '08:30', end: '16:30', hours: 8, location: 'HQ' },
          { date: dAccepted, start: '16:30', end: '18:30', hours: 2, location: 'HQ' }
        ]
      }),
      extensionApplied: '',
      lastManagerDecision: 'Approve',
      lastDecisionTimestamp: now,
      statusSince: now,
      lastAuditorDecision: 'ACCEPT',
      lastAuditorDecisionTimestamp: now,
      managerComment: '',
      auditorComment: 'Seed case: auditor accepted approved audit.',
      planningWindowFrom: _td_fmtDate_(new Date(yyyy, 10, 3)),
      planningWindowTo: _td_fmtDate_(new Date(yyyy + 1, 1, 3))
    },
    {
      auditId: TESTDATA_PREFIX + 'APPROVED_EXTENSION_01',
      company: TESTDATA_PREFIX + ' Extension Epsilon',
      companyUid: uidEpsilon,
      status: 'Approved',
      scopes: { SCOPE_01: 8 },
      totalHours: 8,
      totalDays: 1,
      birthdate: _td_fmtDate_(new Date(yyyy - 1, 11, 9)),
      willExpire: _td_fmtDate_(new Date(yyyy, 11, 9)),
      extExpire: _td_fmtDate_(new Date(yyyy + 1, 2, 9)),
      allowSelfPlanning: 'No',
      assignedTo: TESTDATA_AUDITOR,
      datePlanned: dExtension,
      dateApproved: _td_fmtDate_(new Date(yyyy, 9, 30)),
      auditDaysTextual: dExtension + ' 09:00-17:00',
      planningJson: _td_planningJson_({
        auditId: TESTDATA_PREFIX + 'APPROVED_EXTENSION_01',
        auditor: TESTDATA_AUDITOR,
        totalHours: 8,
        totalDays: 1,
        status: 'Approved',
        days: [{ date: dExtension, start: '09:00', end: '17:00', hours: 8, location: 'HQ' }]
      }),
      extensionApplied: 'Yes',
      lastManagerDecision: 'Approve',
      lastDecisionTimestamp: now,
      statusSince: now,
      lastAuditorDecision: '',
      managerComment: 'Seed case: extension applied; Z/AS/AT visibility should be tested.',
      auditorComment: '',
      planningWindowFrom: _td_fmtDate_(new Date(yyyy, 7, 1)),
      planningWindowTo: _td_fmtDate_(new Date(yyyy, 11, 31))
    },
    {
      auditId: TESTDATA_PREFIX + 'MULTIDAY_APPROVED_01',
      company: TESTDATA_PREFIX + ' Multi Day Zeta',
      companyUid: uidZeta,
      status: 'Approved',
      scopes: { SCOPE_01: 8, SCOPE_02: 8, SCOPE_05: 4 },
      totalHours: 20,
      totalDays: 2.5,
      birthdate: _td_fmtDate_(new Date(yyyy - 1, 5, 14)),
      willExpire: _td_fmtDate_(new Date(yyyy, 5, 14)),
      extExpire: _td_fmtDate_(new Date(yyyy, 8, 14)),
      allowSelfPlanning: 'Yes',
      assignedTo: TESTDATA_AUDITOR,
      datePlanned: dMulti1,
      dateApproved: _td_fmtDate_(new Date(yyyy, 10, 15)),
      auditDaysTextual: dMulti1 + ' 09:00-17:00; ' + dMulti2 + ' 09:00-17:00; ' + dMulti2 + ' 17:00-21:00',
      planningJson: _td_planningJson_({
        auditId: TESTDATA_PREFIX + 'MULTIDAY_APPROVED_01',
        auditor: TESTDATA_AUDITOR,
        totalHours: 20,
        totalDays: 2.5,
        status: 'Approved',
        days: [
          { date: dMulti1, start: '09:00', end: '17:00', hours: 8, location: 'HQ' },
          { date: dMulti2, start: '09:00', end: '17:00', hours: 8, location: 'Secondary site' },
          { date: dMulti2, start: '17:00', end: '21:00', hours: 4, location: 'Secondary site' }
        ]
      }),
      extensionApplied: 'Yes',
      lastManagerDecision: 'Approve',
      lastDecisionTimestamp: now,
      statusSince: now,
      lastAuditorDecision: '',
      managerComment: 'Seed case: multi-day audit with secondary location.',
      auditorComment: '',
      planningWindowFrom: _td_fmtDate_(new Date(yyyy, 9, 1)),
      planningWindowTo: _td_fmtDate_(new Date(yyyy, 11, 31))
    }
  ];

  var companies = [
    _td_companyFixture_(activeAudits[0], 'Active', 'Spain', 'Andalucía', 'Almería', '36.8340,-2.4637', 'SP', 1),
    _td_companyFixture_(activeAudits[1], 'Active', 'Spain', 'Murcia', 'Murcia', '37.9922,-1.1307', 'SP', 1),
    _td_companyFixture_(activeAudits[2], 'Active', 'Portugal', 'Algarve', 'Faro', '37.0194,-7.9304', 'PT', 2),
    _td_companyFixture_(activeAudits[3], 'Active', 'Spain', 'Valencia', 'Valencia', '39.4699,-0.3763', 'SP', 1),
    _td_companyFixture_(activeAudits[4], 'Active', 'Spain', 'Cataluña', 'Barcelona', '41.3851,2.1734', 'SP', 1),
    _td_companyFixture_(activeAudits[5], 'Active', 'Portugal', 'Oeste', 'Leiria', '39.7436,-8.8071', 'PT', 2)
  ];

  var completedAudits = [
    {
      auditId: TESTDATA_PREFIX + 'COMPLETED_01',
      company: TESTDATA_PREFIX + ' Completed Eta',
      companyUid: uidEta,
      auditor: TESTDATA_AUDITOR,
      status: 'Completed',
      datePlanned: _td_fmtDate_(new Date(yyyy, 3, 15)),
      dateApproved: _td_fmtDate_(new Date(yyyy, 3, 1)),
      dateAccepted: _td_fmtDate_(new Date(yyyy, 3, 3)),
      dateCompleted: dCompleted,
      year: yyyy,
      scopes: { SCOPE_01: true, SCOPE_02: false, SCOPE_03: true },
      hoursPlanned: 12,
      hoursDedicated: 12,
      hoursToBePlanned: 0
    },
    {
      auditId: TESTDATA_PREFIX + 'COMPLETED_ROTATION_02',
      company: TESTDATA_PREFIX + ' Completed Theta',
      companyUid: uidTheta,
      auditor: TESTDATA_AUDITOR,
      status: 'Completed',
      datePlanned: _td_fmtDate_(new Date(yyyy - 1, 4, 20)),
      dateApproved: _td_fmtDate_(new Date(yyyy - 1, 4, 1)),
      dateAccepted: _td_fmtDate_(new Date(yyyy - 1, 4, 2)),
      dateCompleted: _td_fmtDate_(new Date(yyyy - 1, 4, 21)),
      year: yyyy - 1,
      scopes: { SCOPE_01: true, SCOPE_02: true },
      hoursPlanned: 16,
      hoursDedicated: 15.5,
      hoursToBePlanned: 0
    }
  ];

  companies.push(_td_companyFixture_({
    company: completedAudits[0].company,
    companyUid: completedAudits[0].companyUid,
    scopes: { SCOPE_01: 8, SCOPE_03: 4 }
  }, 'Active', 'Spain', 'Castilla-La Mancha', 'Toledo', '39.8628,-4.0273', 'SP', 1));

  companies.push(_td_companyFixture_({
    company: completedAudits[1].company,
    companyUid: completedAudits[1].companyUid,
    scopes: { SCOPE_01: 8, SCOPE_02: 8 }
  }, 'Active', 'Portugal', 'Centro', 'Coimbra', '40.2033,-8.4103', 'PT', 1));

  var rejectedAudits = [
    {
      auditId: TESTDATA_PREFIX + 'REJECTED_01',
      company: TESTDATA_PREFIX + ' Rejected Iota',
      companyUid: uidIota,
      location: 'HQ',
      scopes: 'MPS-GAP, GRASP',
      preassignedAuditor: TESTDATA_AUDITOR,
      assignedTo: TESTDATA_AUDITOR,
      datePlanned: _td_fmtDate_(new Date(yyyy, 6, 8)),
      dateApproved: _td_fmtDate_(new Date(yyyy, 5, 25)),
      status: 'Rejected',
      reason: 'Seed case: rejected by manager for test coverage.',
      dateRejected: _td_fmtDate_(new Date(yyyy, 6, 1)),
      managerEmail: TESTDATA_MANAGER_EMAIL
    }
  ];

  companies.push(_td_companyFixture_({
    company: rejectedAudits[0].company,
    companyUid: rejectedAudits[0].companyUid,
    scopes: { SCOPE_02: 8, SCOPE_04: 2 }
  }, 'Inactive', 'Spain', 'Extremadura', 'Badajoz', '38.8794,-6.9707', 'SP', 1));

  var availability = [
    _td_availabilityFixture_(dPendingApproval, TESTDATA_AUDITOR, 'No', '09:00', '17:00', TESTDATA_PREFIX + 'PENDING_APPROVAL_01', '', '', '', 'Manager Planned', ''),
    _td_availabilityFixture_(dApproved, TESTDATA_AUDITOR, 'No', '09:00', '13:00', TESTDATA_PREFIX + 'APPROVED_01', '14:00', '17:00', TESTDATA_PREFIX + 'APPROVED_01', 'Manager Planned', 'Manager Planned'),
    _td_availabilityFixture_(dAccepted, TESTDATA_AUDITOR, 'No', '08:30', '16:30', TESTDATA_PREFIX + 'ACCEPTED_01', '', '', '', 'Manager Planned', ''),
    _td_availabilityFixture_(dExtension, TESTDATA_AUDITOR, 'No', '09:00', '17:00', TESTDATA_PREFIX + 'APPROVED_EXTENSION_01', '', '', '', 'Manager Planned', ''),
    _td_availabilityFixture_(dMulti1, TESTDATA_AUDITOR, 'No', '09:00', '17:00', TESTDATA_PREFIX + 'MULTIDAY_APPROVED_01', '', '', '', 'Manager Planned', ''),
    _td_availabilityFixture_(dMulti2, TESTDATA_AUDITOR, 'No', '09:00', '13:00', TESTDATA_PREFIX + 'MULTIDAY_APPROVED_01', '', '', '', 'Manager Planned', ''),
    _td_availabilityFixture_(_td_fmtDate_(new Date(yyyy, 11, 8)), TESTDATA_AUDITOR, 'Yes', '', '', '', '', '', '', '', '')
  ];

  var notifications = [
    _td_notificationFixture_(TESTDATA_PREFIX + 'PENDING_APPROVAL_01', TESTDATA_AUDITOR, activeAudits[1].company, 'PENDING_APPROVAL', 'PENDING'),
    _td_notificationFixture_(TESTDATA_PREFIX + 'APPROVED_01', TESTDATA_AUDITOR, activeAudits[2].company, 'APPROVED_AUDITOR_ACCEPTANCE', 'PENDING'),
    _td_notificationFixture_(TESTDATA_PREFIX + 'ACCEPTED_01', TESTDATA_MANAGER_EMAIL, activeAudits[3].company, 'ACCEPTED_CONFIRMATION', 'SENT')
  ];

  return {
    activeAudits: activeAudits,
    companies: companies,
    completedAudits: completedAudits,
    rejectedAudits: rejectedAudits,
    availability: availability,
    notifications: notifications
  };
}


function TESTDATA_reportPlanningHoursConsistency() {
  var yyyy = new Date().getFullYear();
  var fixtures = _td_buildFixtures_(yyyy);
  var issues = [];

  for (var i = 0; i < fixtures.activeAudits.length; i++) {
    var a = fixtures.activeAudits[i];
    if (!a.planningJson) continue;

    var parsed;
    try {
      parsed = JSON.parse(a.planningJson);
    } catch (e) {
      issues.push({
        auditId: a.auditId,
        company: a.company,
        issue: 'INVALID_JSON',
        message: String(e && e.message ? e.message : e)
      });
      continue;
    }

    var days = parsed.days || [];
    var sum = 0;
    for (var d = 0; d < days.length; d++) {
      var h = Number(days[d].hours || 0);
      if (!isNaN(h)) sum += h;
    }

    var expected = Number(parsed.totalHours || a.totalHours || 0);
    var delta = Math.round((sum - expected) * 100) / 100;

    if (Math.abs(delta) > 0.01) {
      issues.push({
        auditId: a.auditId,
        company: a.company,
        totalHours: expected,
        sumDaysHours: sum,
        delta: delta
      });
    }
  }

  var report = {
    ok: issues.length === 0,
    version: TESTDATA_VERSION,
    checkedActiveAudits: fixtures.activeAudits.length,
    issues: issues
  };

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


function _td_seedAuditPlanning_(ss, records) {
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error('Sheet not found: Audit planning');

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  var rows = [];

  for (var i = 0; i < records.length; i++) {
    rows.push(_td_buildAuditRow_(headers, h, records[i]));
  }

  if (rows.length) {
    var startRow = sh.getLastRow() + 1;
    _td_setPlainTextFormatForHeaders_(sh, h, startRow, rows.length, [
      'Birthdate certificate',
      'Date - Will Expire',
      'Extended Expiration Date',
      'Date - Planned',
      'Date - Approved',
      'Last decision timestamp',
      'Status since',
      'Last auditor decision timestamp',
      'Planning window from',
      'Planning window to'
    ]);
    sh.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  }

  return rows.length;
}

function _td_seedCompanies_(ss, records) {
  var sh = ss.getSheetByName('Companies');
  if (!sh) return 0;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!headers.length) return 0;

  var rows = [];

  for (var i = 0; i < records.length; i++) {
    rows.push(_td_buildCompanyRow_(headers, h, records[i]));
  }

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return rows.length;
}

function _td_seedLogRealized_(ss, records) {
  var sh = ss.getSheetByName('Log realized audits');
  if (!sh) return 0;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!headers.length) return 0;

  var rows = [];

  for (var i = 0; i < records.length; i++) {
    rows.push(_td_buildLogRealizedRow_(headers, h, records[i]));
  }

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return rows.length;
}

function _td_seedRejected_(ss, records) {
  var sh = ss.getSheetByName('Rejected audits');
  if (!sh) return 0;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!headers.length) return 0;

  var rows = [];

  for (var i = 0; i < records.length; i++) {
    rows.push(_td_buildRejectedRow_(headers, h, records[i]));
  }

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return rows.length;
}

function _td_seedAuditorAvailability_(ss, records) {
  var sh = ss.getSheetByName('Auditor availability');
  if (!sh) return 0;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!headers.length) return 0;

  var rows = [];

  for (var i = 0; i < records.length; i++) {
    rows.push(_td_buildAvailabilityRow_(headers, h, records[i]));
  }

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return rows.length;
}

function _td_seedNotificationQueue_(ss, records) {
  var sh = ss.getSheetByName('Notification Queue');
  if (!sh) return 0;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!headers.length) return 0;

  var rows = [];

  for (var i = 0; i < records.length; i++) {
    rows.push(_td_buildNotificationRow_(headers, h, records[i]));
  }

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  }

  return rows.length;
}

function _td_buildAuditRow_(headers, h, cfg) {
  var row = new Array(headers.length).fill('');

  _td_set_(row, h, 'Company', cfg.company);
  _td_set_(row, h, 'Location', 'HQ');
  _td_applyScopesToRow_(row, h, cfg.scopes || {});
  _td_set_(row, h, 'Total audit time in hours', cfg.totalHours || '');
  _td_set_(row, h, 'Total audit time in days', cfg.totalDays || '');
  _td_set_(row, h, 'Birthdate certificate', cfg.birthdate || '');
  _td_set_(row, h, 'Preassigned Auditor', TESTDATA_AUDITOR);
  _td_set_(row, h, 'Assigned to', cfg.assignedTo || '');
  _td_set_(row, h, 'Number of audits already performed', cfg.numberAuditsAlreadyPerformed || 0);
  _td_set_(row, h, 'Date - Will Expire', cfg.willExpire || '');
  _td_set_(row, h, 'Extended Expiration Date', cfg.extExpire || '');
  _td_set_(row, h, 'Date - Planned', cfg.datePlanned || '');
  _td_set_(row, h, 'Date - Approved', cfg.dateApproved || '');
  _td_set_(row, h, 'Status', cfg.status || 'Pending Planning');
  _td_set_(row, h, 'Allow self planning', cfg.allowSelfPlanning || '');
  _td_set_(row, h, 'Audit days textual', cfg.auditDaysTextual || '');
  _td_set_(row, h, 'Planning JSON', cfg.planningJson || '');
  _td_set_(row, h, 'Extension applied', cfg.extensionApplied || '');
  _td_set_(row, h, 'Audit ID', cfg.auditId);
  _td_set_(row, h, 'Last manager decision', cfg.lastManagerDecision || '');
  _td_set_(row, h, 'Last decision timestamp', cfg.lastDecisionTimestamp || '');
  _td_set_(row, h, 'Status since', cfg.statusSince || '');
  _td_set_(row, h, 'Company_UID', cfg.companyUid || '');
  _td_set_(row, h, 'Scopes_List', _td_scopesListFromScopeMap_(cfg.scopes || {}));
  _td_set_(row, h, 'Manager comment (last)', cfg.managerComment || '');
  _td_set_(row, h, 'Last auditor decision', cfg.lastAuditorDecision || '');
  _td_set_(row, h, 'Last auditor decision timestamp', cfg.lastAuditorDecisionTimestamp || '');
  _td_set_(row, h, 'Auditor comment (last)', cfg.auditorComment || '');
  _td_set_(row, h, 'Planning window from', cfg.planningWindowFrom || '');
  _td_set_(row, h, 'Planning window to', cfg.planningWindowTo || '');

  return row;
}

function _td_buildCompanyRow_(headers, h, cfg) {
  var row = new Array(headers.length).fill('');

  _td_set_(row, h, 'Company', cfg.company);
  _td_set_(row, h, 'Status', cfg.status);
  _td_set_(row, h, 'Contactperson', cfg.contactPerson);
  _td_set_(row, h, 'Contactperson e-mail', cfg.contactEmail);
  _td_set_(row, h, 'Contactperson phone', cfg.contactPhone);
  _td_set_(row, h, 'Number', cfg.number);
  _td_set_(row, h, 'Group', cfg.group);
  _td_set_(row, h, 'Location', cfg.location);
  _td_set_(row, h, 'Region', cfg.region);
  _td_set_(row, h, 'Country', cfg.country);
  _td_set_(row, h, 'GPS-data', cfg.gps);
  _td_set_(row, h, 'Time zone', cfg.timeZone);
  _td_set_(row, h, 'Comments', cfg.comments);
  _td_set_(row, h, 'Audit planning limitations - days', cfg.limitDays);
  _td_set_(row, h, 'Audit planning limitations - hours', cfg.limitHours);
  _td_set_(row, h, 'Language communication', cfg.language);
  _td_set_(row, h, 'Manager_Email', cfg.managerEmail);
  _td_set_(row, h, 'Locations_to_plan', cfg.locationsToPlan);
  _td_set_(row, h, 'Active Audits', cfg.activeAudits);
  _td_set_(row, h, 'Company_UID', cfg.companyUid);
  _td_set_(row, h, 'Slot_Templates', cfg.slotTemplates);
  _td_set_(row, h, 'Locations_JSON', cfg.locationsJson);
  _td_applyScopesToRow_(row, h, cfg.scopes || {});

  return row;
}

function _td_buildLogRealizedRow_(headers, h, cfg) {
  var row = new Array(headers.length).fill('');

  _td_set_(row, h, 'Company', cfg.company);
  _td_set_(row, h, 'Auditor', cfg.auditor);
  _td_set_(row, h, 'Status', cfg.status);
  _td_set_(row, h, 'Date planned', cfg.datePlanned);
  _td_set_(row, h, 'Date approved', cfg.dateApproved);

  for (var i = 1; i <= 8; i++) {
    var key = 'SCOPE_0' + i;
    _td_set_(row, h, key, cfg.scopes && cfg.scopes[key] ? 'x' : '');
  }

  _td_set_(row, h, 'Hours planned', cfg.hoursPlanned);
  _td_set_(row, h, 'Hours dedicated', cfg.hoursDedicated);
  _td_set_(row, h, 'Hours to be planned', cfg.hoursToBePlanned);
  _td_set_(row, h, 'Year', cfg.year);
  _td_set_(row, h, 'Date accepted', cfg.dateAccepted);
  _td_set_(row, h, 'Audit ID', cfg.auditId);
  _td_set_(row, h, 'Manager_Email', TESTDATA_MANAGER_EMAIL);
  _td_set_(row, h, 'Company_UID', cfg.companyUid);
  _td_set_(row, h, 'Date completed', cfg.dateCompleted);

  return row;
}

function _td_buildRejectedRow_(headers, h, cfg) {
  var row = new Array(headers.length).fill('');

  _td_set_(row, h, 'Company', cfg.company);
  _td_set_(row, h, 'Location', cfg.location);
  _td_set_(row, h, 'Scopes', cfg.scopes);
  _td_set_(row, h, 'Preassigned Auditor', cfg.preassignedAuditor);
  _td_set_(row, h, 'Assigned to', cfg.assignedTo);
  _td_set_(row, h, 'Date - Planned', cfg.datePlanned);
  _td_set_(row, h, 'Date - Approved', cfg.dateApproved);
  _td_set_(row, h, 'Status', cfg.status);
  _td_set_(row, h, 'Reason / Comment', cfg.reason);
  _td_set_(row, h, 'Date - Rejected', cfg.dateRejected);
  _td_set_(row, h, 'Audit ID', cfg.auditId);
  _td_set_(row, h, 'Manager_Email', cfg.managerEmail);
  _td_set_(row, h, 'Company_UID', cfg.companyUid);

  return row;
}

function _td_buildAvailabilityRow_(headers, h, cfg) {
  var row = new Array(headers.length).fill('');

  _td_set_(row, h, 'Date', cfg.date);
  _td_set_(row, h, 'Auditor_Email', cfg.auditorEmail);
  _td_set_(row, h, 'Available', cfg.available);
  _td_set_(row, h, 'First_Audit_Start_Time', cfg.firstStart);
  _td_set_(row, h, 'First_Audit_End_Time', cfg.firstEnd);
  _td_set_(row, h, 'Audit_ID_1', cfg.auditId1);
  _td_set_(row, h, 'Second_Audit_Start_Time', cfg.secondStart);
  _td_set_(row, h, 'Second_Audit_End_Time', cfg.secondEnd);
  _td_set_(row, h, 'Audit_ID_2', cfg.auditId2);
  _td_set_(row, h, 'Status_1', cfg.status1);
  _td_set_(row, h, 'Status_2', cfg.status2);
  _td_set_(row, h, 'Last_Updated', cfg.lastUpdated);

  return row;
}

function _td_buildNotificationRow_(headers, h, cfg) {
  var row = new Array(headers.length).fill('');

  _td_set_(row, h, 'TimestampCreated', cfg.timestampCreated);
  _td_set_(row, h, 'Status', cfg.status);
  _td_set_(row, h, 'Type', cfg.type);
  _td_set_(row, h, 'Recipient', cfg.recipient);
  _td_set_(row, h, 'Audit ID', cfg.auditId);
  _td_set_(row, h, 'Company', cfg.company);
  _td_set_(row, h, 'Subject', cfg.subject);
  _td_set_(row, h, 'Body', cfg.body);
  _td_set_(row, h, 'Attempts', cfg.attempts);
  _td_set_(row, h, 'LastError', cfg.lastError);
  _td_set_(row, h, 'PayloadHash', cfg.payloadHash);
  _td_set_(row, h, 'TimestampSent', cfg.timestampSent);
  _td_set_(row, h, 'Reserved', cfg.reserved);

  return row;
}

function _td_companyFixture_(audit, status, country, region, city, gps, language, locationCount) {
  var contactSlug = String(audit.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  var activeAuditId = audit.auditId || '';
  var locations = [
    {
      key: 'HQ',
      name: 'HQ',
      active: true,
      gps: gps,
      address: city,
      comments: 'Seed HQ location for ' + audit.company
    }
  ];

  if (locationCount > 1) {
    locations.push({
      key: 'SITE_02',
      name: 'Secondary site',
      active: true,
      gps: gps,
      address: city + ' secondary',
      comments: 'Seed secondary location'
    });
  }

  return {
    company: audit.company,
    status: status,
    contactPerson: 'Test Contact ' + audit.company.replace(TESTDATA_PREFIX, '').trim(),
    contactEmail: contactSlug + '@example.test',
    contactPhone: '+34 600 000 000',
    number: 'NO-' + Math.floor(Math.random() * 90000 + 10000),
    group: TESTDATA_PREFIX + 'Group',
    location: 'HQ',
    region: region,
    country: country,
    gps: gps,
    timeZone: country === 'Portugal' ? 'Europe/Lisbon' : 'Europe/Madrid',
    comments: 'Generated DEV test company. Safe to delete via TESTDATA_clearAll.',
    limitDays: 'Mo',
    limitHours: '09:00-17:00',
    language: language,
    managerEmail: TESTDATA_MANAGER_EMAIL,
    locationsToPlan: String(locationCount || 1),
    activeAudits: status === 'Active' ? 'YES' : 'NO',
    companyUid: audit.companyUid,
    slotTemplates: '',
    locationsJson: JSON.stringify(locations),
    scopes: audit.scopes || {}
  };
}

function _td_availabilityFixture_(date, auditorEmail, available, firstStart, firstEnd, auditId1, secondStart, secondEnd, auditId2, status1, status2) {
  return {
    date: date,
    auditorEmail: auditorEmail,
    available: available,
    firstStart: firstStart,
    firstEnd: firstEnd,
    auditId1: auditId1,
    secondStart: secondStart,
    secondEnd: secondEnd,
    auditId2: auditId2,
    status1: status1,
    status2: status2,
    lastUpdated: _td_fmtDateTime_(new Date())
  };
}

function _td_notificationFixture_(auditId, recipient, company, type, status) {
  var sent = status === 'SENT' ? _td_fmtDateTime_(new Date()) : '';
  return {
    timestampCreated: _td_fmtDateTime_(new Date()),
    status: status,
    type: type,
    recipient: recipient,
    auditId: auditId,
    company: company,
    subject: '[TEST] ' + type + ' - ' + company,
    body: 'Generated DEV notification queue test row for ' + auditId,
    attempts: status === 'SENT' ? 1 : 0,
    lastError: '',
    payloadHash: _td_hash_([auditId, recipient, type].join('|')),
    timestampSent: sent,
    reserved: ''
  };
}

function _td_applyScopesToRow_(row, h, scopes) {
  for (var i = 1; i <= 8; i++) {
    var slot = 'SCOPE_0' + i;
    var duration = 'Duration SCOPE_0' + i;
    var hours = scopes && Object.prototype.hasOwnProperty.call(scopes, slot) ? scopes[slot] : '';
    _td_set_(row, h, slot, hours ? 'x' : '');
    _td_set_(row, h, duration, hours || '');
  }
}

function _td_scopesListFromScopeMap_(scopes) {
  var labels = {
    SCOPE_01: 'MPS-ABC',
    SCOPE_02: 'MPS-GAP',
    SCOPE_03: 'MPS-SQ',
    SCOPE_04: 'GRASP',
    SCOPE_05: 'Florimark Tracecert',
    SCOPE_06: 'Florimark GTP',
    SCOPE_07: 'Scope 7',
    SCOPE_08: 'Scope 8'
  };

  var arr = [];
  for (var i = 1; i <= 8; i++) {
    var slot = 'SCOPE_0' + i;
    if (scopes && scopes[slot]) arr.push(labels[slot] || slot);
  }

  return arr.join(', ');
}

function _td_planningJson_(cfg) {
  return JSON.stringify({
    auditId: cfg.auditId,
    auditor: cfg.auditor,
    auditorEmail: cfg.auditor,
    totalHours: cfg.totalHours,
    totalDays: cfg.totalDays,
    status: cfg.status,
    days: cfg.days || [],
    dates: (cfg.days || []).map(function(d) { return d.date; }),
    generatedBy: 'TESTDATA',
    version: TESTDATA_VERSION
  });
}


function _td_setPlainTextFormatForHeaders_(sheet, headerMap, startRow, rowCount, headerNames) {
  if (!sheet || !headerMap || !rowCount || rowCount < 1) return;

  for (var i = 0; i < headerNames.length; i++) {
    var name = headerNames[i];
    if (!Object.prototype.hasOwnProperty.call(headerMap, name)) continue;
    sheet.getRange(startRow, headerMap[name] + 1, rowCount, 1).setNumberFormat('@');
  }
}

function _td_getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function _td_headerMap_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || '').trim();
    if (key) map[key] = i;
  }
  return map;
}

function _td_set_(row, map, header, value) {
  if (Object.prototype.hasOwnProperty.call(map, header)) {
    row[map[header]] = value;
  }
}

function _td_deleteLogRealizedSeedRowsOnly_(ss) {
  var sh = ss.getSheetByName('Log realized audits');
  if (!sh || sh.getLastRow() < 2) return;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!Object.prototype.hasOwnProperty.call(h, 'Audit ID')) return;

  var allowed = {};
  for (var a = 0; a < TESTDATA_SAFE_LOG_REALIZED_AUDIT_IDS.length; a++) {
    allowed[String(TESTDATA_SAFE_LOG_REALIZED_AUDIT_IDS[a] || '')] = true;
  }

  var col = h['Audit ID'] + 1;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();

  for (var i = vals.length - 1; i >= 0; i--) {
    var auditId = String(vals[i][0] || '').trim();
    if (allowed[auditId]) {
      sh.deleteRow(i + 2);
    }
  }
}

function _td_deleteRowsByAuditIdPrefix_(ss, sheetName, prefix) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!Object.prototype.hasOwnProperty.call(h, 'Audit ID')) return;

  var col = h['Audit ID'] + 1;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();

  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || '').indexOf(prefix) === 0) {
      sh.deleteRow(i + 2);
    }
  }
}

function _td_deleteRowsByCompanyPrefix_(ss, sheetName, prefix) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  if (!Object.prototype.hasOwnProperty.call(h, 'Company')) return;

  var col = h['Company'] + 1;
  var vals = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();

  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || '').indexOf(prefix) === 0) {
      sh.deleteRow(i + 2);
    }
  }
}

function _td_deleteAvailabilityRowsByAuditIdPrefix_(ss, prefix) {
  var sh = ss.getSheetByName('Auditor availability');
  if (!sh || sh.getLastRow() < 2) return;

  var headers = _td_getHeaders_(sh);
  var h = _td_headerMap_(headers);
  var has1 = Object.prototype.hasOwnProperty.call(h, 'Audit_ID_1');
  var has2 = Object.prototype.hasOwnProperty.call(h, 'Audit_ID_2');
  if (!has1 && !has2) return;

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  for (var i = values.length - 1; i >= 0; i--) {
    var audit1 = has1 ? String(values[i][h['Audit_ID_1']] || '') : '';
    var audit2 = has2 ? String(values[i][h['Audit_ID_2']] || '') : '';
    if (audit1.indexOf(prefix) === 0 || audit2.indexOf(prefix) === 0) {
      sh.deleteRow(i + 2);
    }
  }
}

function _td_uid_() {
  return Utilities.getUuid();
}

function _td_hash_(value) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(value || ''), Utilities.Charset.UTF_8);
  return raw.map(function(byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function _td_fmtDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _td_fmtDateTime_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
