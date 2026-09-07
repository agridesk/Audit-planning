/**
 * =========================================================
 * MVP SMOKE TESTS — AUDIT PLANNING SYSTEM
 * =========================================================
 * Build: 2026-05-01_MVP_SMOKE_TESTS_001
 *
 * SAFE
 * - Read-only for business data.
 * - Writes only report tab: MVP_SmokeTests_Report
 *
 * MAIN
 * - MVP_SmokeTests_RunAll
 *
 * TARGETED
 * - MVP_SmokeTests_Environment
 * - MVP_SmokeTests_Completion
 * - MVP_SmokeTests_SheetsAndHeaders
 * - MVP_SmokeTests_ImportedAccepted
 * - MVP_SmokeTests_AvailabilityBlocks
 * - MVP_SmokeTests_DateChecks
 * - MVP_SmokeTests_StatusDataQuality
 * =========================================================
 */

var MVP_SMOKE_CONFIG = {
  REPORT_TAB: 'MVP_SmokeTests_Report',
  SHEETS: {
    AUDIT_PLANNING: 'Audit planning',
    AUDITOR_AVAILABILITY: 'Auditor Availability',
    LOG_REALIZED: 'Log realized audits',
    SYSTEM_CONFIG: 'System_Config',
    AUDITORS: 'Auditors',
    AUDITOR_AV_IMPORT: 'AuditorAvImport'
  },
  PLANNED_STATUSES: {
    'approved': true,
    'accepted': true,
    'pending approval': true
  },
  ACCEPTED_STATUS: 'accepted'
};

function MVP_SmokeTests_RunAll() {
  var rows = [];
  MVP_SMOKE_addHeader_(rows);

  var sections = [
    MVP_SmokeTests_Environment(true),
    MVP_SmokeTests_Completion(true),
    MVP_SmokeTests_SheetsAndHeaders(true),
    MVP_SmokeTests_ImportedAccepted(true),
    MVP_SmokeTests_AvailabilityBlocks(true),
    MVP_SmokeTests_DateChecks(true),
    MVP_SmokeTests_StatusDataQuality(true)
  ];

  sections.forEach(function(section) {
    (section.rows || []).forEach(function(r) { rows.push(r); });
  });

  MVP_SMOKE_writeReport_(rows);

  var summary = {
    success: !sections.some(function(s) { return s && s.ok === false; }),
    build: '2026-05-01_MVP_SMOKE_TESTS_001',
    reportTab: MVP_SMOKE_CONFIG.REPORT_TAB,
    sections: sections.map(function(s) {
      return {
        section: s.section,
        ok: s.ok,
        errors: s.errors || 0,
        warnings: s.warnings || 0,
        checks: s.checks || 0
      };
    })
  };

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function MVP_SmokeTests_Environment(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;

  var env = '';
  var version = '';
  var deployLabel = '';
  var notificationMode = '';
  var devWriteMode = '';

  try {
    if (typeof SYS_getRequestEnv_ === 'function') env = SYS_getRequestEnv_();
  } catch (e1) {}

  try {
    if (typeof SYS_resolveRuntimeEnv_ === 'function') env = SYS_resolveRuntimeEnv_(env || 'PROD');
  } catch (e2) {}

  try {
    if (typeof SYS_getConfigValue_ === 'function') {
      version = SYS_getConfigValue_('APP_VERSION', '');
      deployLabel = SYS_getConfigValue_('DEPLOY_LABEL', '');
      notificationMode = SYS_getConfigValue_('DEV_NOTIFICATION_MODE', '');
      devWriteMode = SYS_getConfigValue_('DEV_WRITE_MODE', '');
    }
  } catch (e3) {}

  checks++;
  if (!env) {
    errors++;
    MVP_SMOKE_row_(rows, 'Environment', 'ERROR', 'Runtime env missing', '', '', '');
  } else {
    MVP_SMOKE_row_(rows, 'Environment', 'OK', 'Runtime env resolved', env, version, deployLabel);
  }

  checks++;
  if (String(env).toUpperCase() !== 'PROD') {
    warnings++;
    MVP_SMOKE_row_(rows, 'Environment', 'WARN', 'Runtime is not PROD', env, version, deployLabel);
  } else {
    MVP_SMOKE_row_(rows, 'Environment', 'OK', 'Runtime is PROD', env, version, deployLabel);
  }

  checks++;
  if (String(env).toUpperCase() === 'PROD' && String(notificationMode || '').toUpperCase() === 'TEST_TO_SELF') {
    errors++;
    MVP_SMOKE_row_(rows, 'Environment', 'ERROR', 'PROD notification mode is TEST_TO_SELF', notificationMode, '', '');
  } else {
    MVP_SMOKE_row_(rows, 'Environment', 'OK', 'Notification mode check', notificationMode, '', '');
  }

  checks++;
  if (String(env).toUpperCase() === 'PROD' && String(devWriteMode || '').toUpperCase() === 'ALLOW_ALL') {
    errors++;
    MVP_SMOKE_row_(rows, 'Environment', 'ERROR', 'PROD devWriteMode is ALLOW_ALL', devWriteMode, '', '');
  } else {
    MVP_SMOKE_row_(rows, 'Environment', 'OK', 'Dev write mode check', devWriteMode, '', '');
  }

  return MVP_SMOKE_finish_('Environment', rows, errors, warnings, checks, silent);
}

function MVP_SmokeTests_Completion(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;

  var deps = [
    ['ManagerV5_CommitCompletion', typeof ManagerV5_CommitCompletion === 'function'],
    ['CompletionService_CommitCompletion', typeof CompletionService_CommitCompletion === 'function'],
    ['LogRealizedAuditService_AppendFromAuditPlanning', typeof LogRealizedAuditService_AppendFromAuditPlanning === 'function'],
    ['LogRealizedAuditService_PreflightAppendFromAuditPlanning', typeof LogRealizedAuditService_PreflightAppendFromAuditPlanning === 'function'],
    ['LogRealizedAuditService_UpdateCompletedHours', typeof LogRealizedAuditService_UpdateCompletedHours === 'function'],
    ['V5_availabilityClearAuditId_', typeof V5_availabilityClearAuditId_ === 'function'],
    ['AS_availabilityClearAuditId_', typeof AS_availabilityClearAuditId_ === 'function']
  ];

  deps.forEach(function(d) {
    checks++;
    if (d[1]) {
      MVP_SMOKE_row_(rows, 'Completion', 'OK', 'Dependency available', d[0], '', '');
    } else {
      errors++;
      MVP_SMOKE_row_(rows, 'Completion', 'ERROR', 'Dependency missing', d[0], '', '');
    }
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Audit planning', 'Log realized audits'].forEach(function(name) {
    checks++;
    var sh = ss.getSheetByName(name);
    if (sh) MVP_SMOKE_row_(rows, 'Completion', 'OK', 'Sheet found', name, 'rows=' + sh.getLastRow(), '');
    else {
      errors++;
      MVP_SMOKE_row_(rows, 'Completion', 'ERROR', 'Sheet missing', name, '', '');
    }
  });

  return MVP_SMOKE_finish_('Completion', rows, errors, warnings, checks, silent);
}

function MVP_SmokeTests_SheetsAndHeaders(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var required = [
    { sheet:'Audit planning', headers:['Audit ID','Status','Company','Assigned to','Date - Planned','Planning JSON','Company_UID'] },
    { sheet:'Auditor Availability', headers:['Date','Auditor_Email','Available','First_Audit_Start_Time','First_Audit_End_Time','Audit_ID_1','Second_Audit_Start_Time','Second_Audit_End_Time','Audit_ID_2','Status_1','Status_2'] },
    { sheet:'Log realized audits', headers:['Company','Auditor','Status','Date planned','Hours planned','Hours dedicated','Hours to be planned','Year','Audit ID','Company_UID'] },
    { sheet:'Auditors', headers:['E-mail'] }
  ];

  required.forEach(function(req) {
    var sh = ss.getSheetByName(req.sheet);
    checks++;
    if (!sh) {
      errors++;
      MVP_SMOKE_row_(rows, 'Sheets/Headers', 'ERROR', 'Missing sheet', req.sheet, '', '');
      return;
    }

    MVP_SMOKE_row_(rows, 'Sheets/Headers', 'OK', 'Sheet found', req.sheet, 'rows=' + sh.getLastRow(), 'cols=' + sh.getLastColumn());

    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var hm = MVP_SMOKE_headerMap_(headers);
    req.headers.forEach(function(h) {
      checks++;
      if (MVP_SMOKE_pickCol_(hm, [h]) >= 0) MVP_SMOKE_row_(rows, 'Sheets/Headers', 'OK', 'Header found', req.sheet, h, '');
      else {
        errors++;
        MVP_SMOKE_row_(rows, 'Sheets/Headers', 'ERROR', 'Header missing', req.sheet, h, '');
      }
    });
  });

  return MVP_SMOKE_finish_('Sheets/Headers', rows, errors, warnings, checks, silent);
}

function MVP_SmokeTests_ImportedAccepted(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ap = ss.getSheetByName('Audit planning');
  if (!ap) return MVP_SMOKE_sectionError_('ImportedAccepted', 'Missing Audit planning sheet', silent);

  var values = ap.getDataRange().getValues();
  if (!values || values.length < 2) return MVP_SMOKE_sectionError_('ImportedAccepted', 'Audit planning empty', silent);

  var hm = MVP_SMOKE_headerMap_(values[0]);
  var cAuditId = MVP_SMOKE_pickCol_(hm, ['Audit ID']);
  var cStatus = MVP_SMOKE_pickCol_(hm, ['Status']);
  var cAssigned = MVP_SMOKE_pickCol_(hm, ['Assigned to']);
  var cDate = MVP_SMOKE_pickCol_(hm, ['Date - Planned','Date planned']);
  var cJson = MVP_SMOKE_pickCol_(hm, ['Planning JSON']);

  var acceptedCount = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var status = MVP_SMOKE_normStatus_(row[cStatus]);
    if (status !== 'accepted') continue;

    acceptedCount++;
    var auditId = MVP_SMOKE_clean_(row[cAuditId]);
    var assigned = cAssigned >= 0 ? MVP_SMOKE_normEmail_(row[cAssigned]) : '';
    var datePlanned = cDate >= 0 ? MVP_SMOKE_isoDate_(row[cDate]) : '';
    var planningJson = cJson >= 0 ? MVP_SMOKE_clean_(row[cJson]) : '';

    if (!assigned) {
      errors++;
      MVP_SMOKE_row_(rows, 'ImportedAccepted', 'ERROR', 'Accepted audit missing Assigned to', auditId, 'row=' + (r + 1), '');
    }
    if (!datePlanned) {
      errors++;
      MVP_SMOKE_row_(rows, 'ImportedAccepted', 'ERROR', 'Accepted audit missing Date - Planned', auditId, 'row=' + (r + 1), '');
    }
    if (!planningJson) {
      errors++;
      MVP_SMOKE_row_(rows, 'ImportedAccepted', 'ERROR', 'Accepted audit missing Planning JSON', auditId, 'row=' + (r + 1), '');
    } else {
      var parsed = MVP_SMOKE_parsePlanningJson_(planningJson);
      if (!parsed.ok || !parsed.blocks.length) {
        errors++;
        MVP_SMOKE_row_(rows, 'ImportedAccepted', 'ERROR', 'Accepted audit invalid/empty Planning JSON', auditId, parsed.message || '', 'row=' + (r + 1));
      }
    }
  }

  checks++;
  MVP_SMOKE_row_(rows, 'ImportedAccepted', acceptedCount ? 'OK' : 'WARN', 'Accepted audit count', acceptedCount, '', '');
  if (!acceptedCount) warnings++;

  return MVP_SMOKE_finish_('ImportedAccepted', rows, errors, warnings, checks, silent);
}

function MVP_SmokeTests_AvailabilityBlocks(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ap = ss.getSheetByName('Audit planning');
  var av = ss.getSheetByName('Auditor Availability');
  if (!ap) return MVP_SMOKE_sectionError_('AvailabilityBlocks', 'Missing Audit planning sheet', silent);
  if (!av) return MVP_SMOKE_sectionError_('AvailabilityBlocks', 'Missing Auditor Availability sheet', silent);

  var apValues = ap.getDataRange().getValues();
  var avValues = av.getDataRange().getValues();
  var apHm = MVP_SMOKE_headerMap_(apValues[0]);
  var avHm = MVP_SMOKE_headerMap_(avValues[0]);

  var cAuditId = MVP_SMOKE_pickCol_(apHm, ['Audit ID']);
  var cStatus = MVP_SMOKE_pickCol_(apHm, ['Status']);
  var cJson = MVP_SMOKE_pickCol_(apHm, ['Planning JSON']);
  var cAssigned = MVP_SMOKE_pickCol_(apHm, ['Assigned to']);

  var aEmail = MVP_SMOKE_pickCol_(avHm, ['Auditor_Email','Auditor Email','Auditor_Name']);
  var aAudit1 = MVP_SMOKE_pickCol_(avHm, ['Audit_ID_1','Audit ID 1']);
  var aAudit2 = MVP_SMOKE_pickCol_(avHm, ['Audit_ID_2','Audit ID 2']);
  var aStatus1 = MVP_SMOKE_pickCol_(avHm, ['Status_1','Status 1']);
  var aStatus2 = MVP_SMOKE_pickCol_(avHm, ['Status_2','Status 2']);

  if (aEmail < 0 || aAudit1 < 0 || aAudit2 < 0) return MVP_SMOKE_sectionError_('AvailabilityBlocks', 'Auditor Availability required headers missing', silent);

  var index = {};
  for (var ar = 1; ar < avValues.length; ar++) {
    var avRow = avValues[ar];
    var id1 = MVP_SMOKE_clean_(avRow[aAudit1]);
    var id2 = MVP_SMOKE_clean_(avRow[aAudit2]);
    if (id1) {
      if (!index[id1]) index[id1] = [];
      index[id1].push({ rowIndex: ar + 1, slot: 1, row: avRow });
    }
    if (id2) {
      if (!index[id2]) index[id2] = [];
      index[id2].push({ rowIndex: ar + 1, slot: 2, row: avRow });
    }
  }

  var plannedCount = 0;
  var missing = 0;

  for (var r = 1; r < apValues.length; r++) {
    var row = apValues[r];
    var statusKey = MVP_SMOKE_normStatus_(row[cStatus]);
    if (!MVP_SMOKE_CONFIG.PLANNED_STATUSES[statusKey]) continue;
    var auditId = MVP_SMOKE_clean_(row[cAuditId]);
    var assigned = cAssigned >= 0 ? MVP_SMOKE_normEmail_(row[cAssigned]) : '';
    var planningJson = cJson >= 0 ? MVP_SMOKE_clean_(row[cJson]) : '';
    if (!auditId || !planningJson) continue;

    plannedCount++;
    var hits = index[auditId] || [];
    if (!hits.length) {
      missing++;
      errors++;
      MVP_SMOKE_row_(rows, 'AvailabilityBlocks', 'ERROR', 'Planned audit missing hardblock', auditId, statusKey, 'row=' + (r + 1));
      continue;
    }

    hits.forEach(function(hit) {
      checks++;
      var avRow = hit.row;
      var avEmail = MVP_SMOKE_normEmail_(avRow[aEmail]);
      var avStatus = '';
      if (hit.slot === 1 && aStatus1 >= 0) avStatus = MVP_SMOKE_clean_(avRow[aStatus1]);
      if (hit.slot === 2 && aStatus2 >= 0) avStatus = MVP_SMOKE_clean_(avRow[aStatus2]);

      if (assigned && avEmail && assigned !== avEmail) {
        warnings++;
        MVP_SMOKE_row_(rows, 'AvailabilityBlocks', 'WARN', 'Availability auditor differs from Assigned to', auditId, 'assigned=' + assigned, 'availability=' + avEmail + ' row=' + hit.rowIndex);
      }
      if (!avStatus) {
        warnings++;
        MVP_SMOKE_row_(rows, 'AvailabilityBlocks', 'WARN', 'Availability block has empty Status_1/2', auditId, 'slot=' + hit.slot, 'row=' + hit.rowIndex);
      }
    });
  }

  MVP_SMOKE_row_(rows, 'AvailabilityBlocks', missing ? 'ERROR' : 'OK', 'Planned audits checked for hardblocks', plannedCount, 'missing=' + missing, '');
  return MVP_SMOKE_finish_('AvailabilityBlocks', rows, errors, warnings, checks, silent);
}

function MVP_SmokeTests_DateChecks(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ap = ss.getSheetByName('Audit planning');
  if (!ap) return MVP_SMOKE_sectionError_('DateChecks', 'Missing Audit planning sheet', silent);

  var values = ap.getDataRange().getValues();
  var hm = MVP_SMOKE_headerMap_(values[0]);
  var cAuditId = MVP_SMOKE_pickCol_(hm, ['Audit ID']);
  var cStatus = MVP_SMOKE_pickCol_(hm, ['Status']);
  var cDate = MVP_SMOKE_pickCol_(hm, ['Date - Planned','Date planned']);
  var cJson = MVP_SMOKE_pickCol_(hm, ['Planning JSON']);

  var compared = 0;
  var mismatch = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var statusKey = MVP_SMOKE_normStatus_(row[cStatus]);
    if (!MVP_SMOKE_CONFIG.PLANNED_STATUSES[statusKey]) continue;

    var auditId = MVP_SMOKE_clean_(row[cAuditId]);
    var datePlanned = cDate >= 0 ? MVP_SMOKE_isoDate_(row[cDate]) : '';
    var planningJson = cJson >= 0 ? MVP_SMOKE_clean_(row[cJson]) : '';
    if (!auditId || !datePlanned || !planningJson) continue;

    var parsed = MVP_SMOKE_parsePlanningJson_(planningJson);
    if (!parsed.ok || !parsed.blocks.length) continue;
    var firstDate = parsed.blocks[0].date || '';
    compared++;
    if (datePlanned !== firstDate) {
      mismatch++;
      warnings++;
      MVP_SMOKE_row_(rows, 'DateChecks', 'WARN', 'Date - Planned differs from Planning JSON first date', auditId, 'DatePlanned=' + datePlanned, 'JsonFirst=' + firstDate);
    }
  }

  MVP_SMOKE_row_(rows, 'DateChecks', mismatch ? 'WARN' : 'OK', 'Date - Planned vs Planning JSON checked', compared, 'mismatch=' + mismatch, '');
  return MVP_SMOKE_finish_('DateChecks', rows, errors, warnings, checks, silent);
}

function MVP_SmokeTests_StatusDataQuality(silent) {
  var rows = [];
  var errors = 0;
  var warnings = 0;
  var checks = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ap = ss.getSheetByName('Audit planning');
  if (!ap) return MVP_SMOKE_sectionError_('StatusDataQuality', 'Missing Audit planning sheet', silent);

  var values = ap.getDataRange().getValues();
  var hm = MVP_SMOKE_headerMap_(values[0]);
  var cAuditId = MVP_SMOKE_pickCol_(hm, ['Audit ID']);
  var cStatus = MVP_SMOKE_pickCol_(hm, ['Status']);
  var cAssigned = MVP_SMOKE_pickCol_(hm, ['Assigned to']);
  var cJson = MVP_SMOKE_pickCol_(hm, ['Planning JSON']);
  var cDate = MVP_SMOKE_pickCol_(hm, ['Date - Planned','Date planned']);

  var allowed = {
    'pending planning': true,
    'pending approval': true,
    'approved': true,
    'accepted': true,
    'completed': true,
    'cancelled': true,
    'canceled': true,
    'rejected': true,
    'denied': true
  };
  var counts = {};

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var auditId = MVP_SMOKE_clean_(row[cAuditId]);
    var statusKey = MVP_SMOKE_normStatus_(row[cStatus]);
    if (!auditId && !statusKey) continue;
    counts[statusKey] = (counts[statusKey] || 0) + 1;
    checks++;

    if (!allowed[statusKey]) {
      warnings++;
      MVP_SMOKE_row_(rows, 'StatusDataQuality', 'WARN', 'Unknown/non-canonical status', auditId, statusKey, 'row=' + (r + 1));
    }

    if (statusKey === 'pending planning') {
      var planningJson = cJson >= 0 ? MVP_SMOKE_clean_(row[cJson]) : '';
      if (planningJson) {
        warnings++;
        MVP_SMOKE_row_(rows, 'StatusDataQuality', 'WARN', 'Pending Planning still has Planning JSON', auditId, 'row=' + (r + 1), '');
      }
    }

    if (MVP_SMOKE_CONFIG.PLANNED_STATUSES[statusKey]) {
      var assigned = cAssigned >= 0 ? MVP_SMOKE_normEmail_(row[cAssigned]) : '';
      var datePlanned = cDate >= 0 ? MVP_SMOKE_isoDate_(row[cDate]) : '';
      if (!assigned) {
        errors++;
        MVP_SMOKE_row_(rows, 'StatusDataQuality', 'ERROR', 'Planned status missing Assigned to', auditId, statusKey, 'row=' + (r + 1));
      }
      if (!datePlanned) {
        errors++;
        MVP_SMOKE_row_(rows, 'StatusDataQuality', 'ERROR', 'Planned status missing Date - Planned', auditId, statusKey, 'row=' + (r + 1));
      }
    }
  }

  MVP_SMOKE_row_(rows, 'StatusDataQuality', 'OK', 'Status counts', JSON.stringify(counts), '', '');
  return MVP_SMOKE_finish_('StatusDataQuality', rows, errors, warnings, checks, silent);
}

function MVP_SMOKE_addHeader_(rows) {
  rows.push(['Timestamp','Section','Severity','Check','Value 1','Value 2','Value 3']);
}

function MVP_SMOKE_row_(rows, section, severity, check, v1, v2, v3) {
  rows.push([new Date(), section, severity, check, v1 == null ? '' : v1, v2 == null ? '' : v2, v3 == null ? '' : v3]);
}

function MVP_SMOKE_writeReport_(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MVP_SMOKE_CONFIG.REPORT_TAB);
  if (!sh) sh = ss.insertSheet(MVP_SMOKE_CONFIG.REPORT_TAB);
  sh.clearContents();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.autoResizeColumns(1, rows[0].length);
}

function MVP_SMOKE_finish_(section, rows, errors, warnings, checks, silent) {
  var out = { section: section, ok: errors === 0, rows: rows, errors: errors, warnings: warnings, checks: checks };
  if (!silent) Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function MVP_SMOKE_sectionError_(section, message, silent) {
  var rows = [];
  MVP_SMOKE_row_(rows, section, 'ERROR', message, '', '', '');
  return MVP_SMOKE_finish_(section, rows, 1, 0, 1, silent);
}

function MVP_SMOKE_headerMap_(headers) {
  var out = {};
  for (var i = 0; i < headers.length; i++) {
    var k = MVP_SMOKE_normHeader_(headers[i]);
    if (k && out[k] === undefined) out[k] = i;
  }
  return out;
}

function MVP_SMOKE_pickCol_(hm, names) {
  for (var i = 0; i < names.length; i++) {
    var k = MVP_SMOKE_normHeader_(names[i]);
    if (hm[k] !== undefined) return hm[k];
  }
  return -1;
}

function MVP_SMOKE_normHeader_(v) {
  return String(v || '').trim().toLowerCase().replace(/[–—−]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function MVP_SMOKE_clean_(v) {
  return String(v == null ? '' : v).replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function MVP_SMOKE_normEmail_(v) {
  return MVP_SMOKE_clean_(v).toLowerCase();
}

function MVP_SMOKE_normStatus_(v) {
  return MVP_SMOKE_clean_(v).toLowerCase().replace(/[_\s]+/g, ' ').trim();
}

function MVP_SMOKE_isoDate_(v) {
  if (!v) return '';
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = MVP_SMOKE_clean_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return Utilities.formatDate(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])), tz, 'yyyy-MM-dd');
  return '';
}

function MVP_SMOKE_normTime_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'HH:mm');
  var s = MVP_SMOKE_clean_(v);
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
}

function MVP_SMOKE_parsePlanningJson_(raw) {
  try {
    var obj = JSON.parse(String(raw || '').trim());
    var blocks = [];
    var nodes = [];
    if (Array.isArray(obj.blocks)) nodes = obj.blocks;
    else if (Array.isArray(obj.slots)) nodes = obj.slots;
    else if (Array.isArray(obj.days)) nodes = obj.days;

    nodes.forEach(function(b) {
      var date = MVP_SMOKE_isoDate_(b.date || b.day || b.iso || '');
      var start = MVP_SMOKE_normTime_(b.start || b.startTime || b.from || '');
      var end = MVP_SMOKE_normTime_(b.end || b.endTime || b.to || '');
      if (!date || !start || !end) return;
      blocks.push({ date: date, start: start, end: end });
    });

    blocks.sort(function(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
    });

    return { ok: true, blocks: blocks, auditorEmail: MVP_SMOKE_normEmail_(obj.auditorEmail || obj.auditor || obj.assignedTo || '') };
  } catch (e) {
    return { ok: false, blocks: [], message: String(e && e.message ? e.message : e) };
  }
}
