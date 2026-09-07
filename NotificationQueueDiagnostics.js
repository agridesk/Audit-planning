// FILE: NotificationQueueDiagnostics.gs
// BUILD: 2026-05-12_NOTIFICATION_QUEUE_DIAGNOSTICS
// PURPOSE:
//   Read-only diagnostics for Notification Queue health.
//   No writes. No sends. No reservations. No lifecycle changes.
//
// RUNNER:
//   RUN_NF_QUEUE()

var NQD_BUILD = '2026-05-12_NOTIFICATION_QUEUE_DIAGNOSTICS';

function RUN_NF_QUEUE() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = NQD_getQueueSheetName_();
  var sh = ss.getSheetByName(sheetName);

  var out = {
    ok: true,
    build: NQD_BUILD,
    queueSheet: sheetName,
    sheetFound: !!sh,
    generatedAt: new Date().toISOString(),
    totalRows: 0,
    statusCounts: {},
    eventCounts: {},
    familyCounts: {},
    rendererCounts: {},
    digestGroupCounts: {},
    oldestPending: null,
    oldestReserved: null,
    failedRows: [],
    staleReserved: [],
    warnings: [],
    errors: []
  };

  if (!sh) {
    out.ok = false;
    out.errors.push('Missing queue sheet: ' + sheetName);
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  var headers = values[0] || [];
  var idx = NQD_headerMap_(headers);
  var required = ['TimestampCreated', 'Status', 'Type', 'Recipient', 'Audit ID', 'Company', 'Attempts', 'LastError', 'TimestampSent', 'Reserved'];
  var missing = [];
  for (var i = 0; i < required.length; i++) {
    if (!idx.hasOwnProperty(required[i])) missing.push(required[i]);
  }

  if (missing.length) {
    out.ok = false;
    out.errors.push('Missing queue columns: ' + missing.join(', '));
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  out.totalRows = values.length - 1;

  var nowMs = Date.now();
  var staleMs = 60 * 60 * 1000;

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var rowNo = r + 1;

    var created = row[idx.TimestampCreated];
    var status = NQD_text_(row[idx.Status]).toUpperCase() || '(BLANK)';
    var eventType = NQD_text_(row[idx.Type]).toUpperCase() || '(BLANK)';
    var recipient = NQD_text_(row[idx.Recipient]);
    var auditId = NQD_text_(row[idx['Audit ID']]);
    var company = NQD_text_(row[idx.Company]);
    var attempts = Number(row[idx.Attempts] || 0);
    var lastError = NQD_text_(row[idx.LastError]);
    var sentAt = row[idx.TimestampSent];
    var reservedRaw = row[idx.Reserved];

    NQD_inc_(out.statusCounts, status);
    NQD_inc_(out.eventCounts, eventType);

    var reservedObj = NQD_parseJson_(reservedRaw);
    var payload = reservedObj && reservedObj.payload ? reservedObj.payload : null;

    var family = '';
    var renderer = '';
    var digestGroup = '';

    try {
      if (payload && payload.config) digestGroup = NQD_text_(payload.config.digestGroup);
      family = NQD_text_(payload && (payload.eventFamily || payload.family || payload.rendererProfile || ''));
      renderer = NQD_text_(payload && (payload.rendererProfile || payload.templateFamily || ''));
      if (!family && payload && payload.config) family = NQD_text_(payload.config.eventClass || payload.config.templateFamily || '');
      if (!renderer && payload && payload.config) renderer = NQD_text_(payload.config.templateFamily || '');
    } catch (ePayload) {}

    if (!family) family = NQD_familyFromEvent_(eventType);
    if (!renderer) renderer = family;
    if (!digestGroup) digestGroup = NQD_digestGroupFromEvent_(eventType);

    NQD_inc_(out.familyCounts, family || '(UNKNOWN)');
    NQD_inc_(out.rendererCounts, renderer || '(UNKNOWN)');
    NQD_inc_(out.digestGroupCounts, digestGroup || '(BLANK)');

    var createdMs = NQD_toMs_(created);
    var summary = {
      row: rowNo,
      timestampCreated: NQD_displayDate_(created),
      status: status,
      eventType: eventType,
      recipient: recipient,
      auditId: auditId,
      company: company,
      attempts: attempts,
      lastError: lastError
    };

    if (status === 'PENDING') {
      if (!out.oldestPending || (createdMs && createdMs < out.oldestPending.createdMs)) {
        out.oldestPending = NQD_withMs_(summary, createdMs);
      }
      if (!recipient) out.warnings.push('PENDING row without recipient at row ' + rowNo);
    }

    if (status === 'RESERVED') {
      if (!out.oldestReserved || (createdMs && createdMs < out.oldestReserved.createdMs)) {
        out.oldestReserved = NQD_withMs_(summary, createdMs);
      }

      var refMs = 0;
      if (reservedObj) {
        refMs = Number(reservedObj.reservedAtMs || 0) || NQD_toMs_(reservedObj.reservedAt) || NQD_toMs_(reservedObj.windowStartAt);
      }
      if (!refMs) refMs = createdMs;

      if (refMs && nowMs - refMs > staleMs) {
        var stale = NQD_withMs_(summary, refMs);
        stale.staleMinutes = Math.round((nowMs - refMs) / 60000);
        out.staleReserved.push(stale);
      }
    }

    if (status === 'FAILED') out.failedRows.push(summary);

    if ((status === 'SENT' || status === 'SENT_DEV_REDIRECT') && !sentAt) {
      out.warnings.push(status + ' row without TimestampSent at row ' + rowNo);
    }

    if (status === 'AUDIT_TRAIL' && recipient) {
      out.warnings.push('AUDIT_TRAIL row has recipient at row ' + rowNo);
    }
  }

  out.oldestPending = NQD_stripMs_(out.oldestPending);
  out.oldestReserved = NQD_stripMs_(out.oldestReserved);
  out.staleReserved = out.staleReserved.map(NQD_stripMs_);
  out.failedCount = out.failedRows.length;
  out.staleReservedCount = out.staleReserved.length;

  if (out.failedCount > 0) out.ok = false;
  if (out.staleReservedCount > 0) out.warnings.push('Stale RESERVED rows found: ' + out.staleReservedCount);

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function NQD_getQueueSheetName_() {
  try {
    if (typeof NotificationConfig_GetQueueSheetName === 'function') {
      return String(NotificationConfig_GetQueueSheetName() || 'Notification Queue').trim() || 'Notification Queue';
    }
  } catch (e) {}
  return 'Notification Queue';
}

function NQD_headerMap_(headers) {
  var rawMap = {};
  for (var i = 0; i < headers.length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;
    rawMap[raw] = i;
    rawMap[raw.toUpperCase()] = i;
    rawMap[NQD_key_(raw)] = i;
  }

  var aliases = {
    TimestampCreated: ['TimestampCreated', 'Timestamp Created', 'Created', 'CreatedAt'],
    Status: ['Status'],
    Type: ['Type', 'EventType', 'Event Type'],
    Recipient: ['Recipient', 'To'],
    'Audit ID': ['Audit ID', 'Audit_ID', 'AuditId'],
    Company: ['Company'],
    Attempts: ['Attempts'],
    LastError: ['LastError', 'Last Error'],
    TimestampSent: ['TimestampSent', 'Timestamp Sent', 'SentAt'],
    Reserved: ['Reserved', 'Payload', 'ReservedPayload']
  };

  var out = {};
  Object.keys(aliases).forEach(function(canon) {
    var list = aliases[canon];
    for (var j = 0; j < list.length; j++) {
      var a = list[j];
      if (rawMap.hasOwnProperty(a)) { out[canon] = rawMap[a]; return; }
      if (rawMap.hasOwnProperty(a.toUpperCase())) { out[canon] = rawMap[a.toUpperCase()]; return; }
      var k = NQD_key_(a);
      if (rawMap.hasOwnProperty(k)) { out[canon] = rawMap[k]; return; }
    }
  });

  return out;
}

function NQD_familyFromEvent_(eventType) {
  eventType = NQD_text_(eventType).toUpperCase();
  if (eventType === 'AUDIT_PLANNED_BY_MANAGER') return 'RICH_OPERATIONAL';
  if (eventType === 'AUDIT_PLANNED_BY_AUDITOR') return 'APPROVAL_OPERATIONAL';
  if (eventType.indexOf('ECAS_') === 0 || eventType.indexOf('CUSTOMER_') === 0) return 'EXTERNAL_OPERATIONAL';
  if (eventType.indexOf('WEEKLY_') === 0 || eventType === 'PLANNING_WINDOW_ALERT') return 'WEEKLY';
  if (eventType === 'COMPLETED_ON_BEHALF') return 'AUDIT_TRAIL';
  if (eventType.indexOf('EXTENSION_') === 0) return 'COMPACT_LIFECYCLE';
  if (eventType.indexOf('AUDIT_') === 0) return 'COMPACT_LIFECYCLE';
  return '(UNKNOWN)';
}

function NQD_digestGroupFromEvent_(eventType) {
  eventType = NQD_text_(eventType).toUpperCase();
  if (eventType === 'AUDIT_PLANNED_BY_MANAGER') return 'AUDITOR_OPERATIONAL';
  if (eventType === 'AUDIT_PLANNED_BY_AUDITOR') return 'MANAGER_APPROVAL';
  if (eventType.indexOf('ECAS_') === 0) return 'ECAS_OPERATIONAL';
  if (eventType.indexOf('CUSTOMER_') === 0) return 'CUSTOMER_OPERATIONAL';
  if (eventType.indexOf('WEEKLY_MANAGER_') === 0 || eventType === 'PLANNING_WINDOW_ALERT') return 'MANAGER_WEEKLY';
  if (eventType.indexOf('WEEKLY_AUDITOR_') === 0) return 'AUDITOR_WEEKLY';
  if (eventType === 'COMPLETED_ON_BEHALF') return 'AUDIT_TRAIL';

  if (
    eventType === 'AUDIT_ACCEPTED' ||
    eventType === 'AUDIT_COMPLETED' ||
    eventType === 'AUDIT_CANCELLED_BY_AUDITOR' ||
    eventType === 'AUDIT_DENIED_BY_AUDITOR' ||
    eventType.indexOf('EXTENSION_') === 0
  ) return 'LIFECYCLE_MANAGER';

  if (
    eventType === 'AUDIT_APPROVED' ||
    eventType === 'AUDIT_CANCELLED_BY_MANAGER' ||
    eventType === 'AUDIT_DENIED_BY_MANAGER' ||
    eventType === 'AUDIT_REJECTED_BY_MANAGER'
  ) return 'LIFECYCLE_AUDITOR';

  return '(BLANK)';
}

function NQD_parseJson_(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}

function NQD_toMs_(v) {
  try {
    if (!v) return 0;
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v.getTime();
    var d = new Date(String(v));
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  } catch (e) { return 0; }
}

function NQD_displayDate_(v) {
  if (!v) return '';
  try {
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    }
  } catch (e) {}
  return String(v);
}

function NQD_withMs_(obj, ms) {
  obj = obj || {};
  obj.createdMs = ms || 0;
  return obj;
}

function NQD_stripMs_(obj) {
  if (!obj) return null;
  var copy = {};
  Object.keys(obj).forEach(function(k) {
    if (k !== 'createdMs') copy[k] = obj[k];
  });
  return copy;
}

function NQD_inc_(map, key) {
  key = String(key || '(BLANK)');
  if (!map[key]) map[key] = 0;
  map[key]++;
}

function NQD_text_(v) {
  return String(v == null ? '' : v).trim();
}

function NQD_key_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}
