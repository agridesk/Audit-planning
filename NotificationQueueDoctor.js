/***********************************************************************
 * FILE: NotificationQueueDoctor.gs
 *
 * PURPOSE
 * - DEV-safe diagnostics for Notification Queue rows stuck on RESERVED.
 * - Shows why rows are not processed by NotificationSender.
 * - Can reset DEV smoke/test RESERVED rows back to PENDING.
 *
 * SAFETY
 * - Requires EnvironmentGuardService.gs.
 * - Reset function is DEV-only.
 * - Does not send email.
 ***********************************************************************/

var NQ_DOCTOR_BUILD = '2026-05-14_NOTIFICATION_QUEUE_DOCTOR_R1';

function RUN_NOTIFICATION_QUEUE_DOCTOR_RESERVED() {
  var sh = NQ_DOCTOR_getQueueSheet_();
  var values = sh.getDataRange().getValues();
  var nowMs = Date.now();
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'RESERVED') continue;

    var reservedRaw = String(values[r][12] || '').trim();
    var parsed = NQ_DOCTOR_parseJson_(reservedRaw);
    var dueAtMs = 0;
    var dueAt = '';

    if (parsed && parsed.windowDueAtMs) {
      dueAtMs = Number(parsed.windowDueAtMs || 0);
    }
    if (!dueAtMs && parsed && parsed.windowDueAt) {
      dueAt = String(parsed.windowDueAt || '').trim();
      dueAtMs = NQ_DOCTOR_toMs_(dueAt);
    }

    var reason = '';
    if (!reservedRaw) reason = 'RESERVED_WITH_EMPTY_RESERVED_COLUMN';
    else if (!parsed) reason = 'RESERVED_JSON_INVALID';
    else if (!parsed.windowKey) reason = 'RESERVED_JSON_MISSING_WINDOWKEY';
    else if (!dueAtMs) reason = 'RESERVED_JSON_MISSING_OR_INVALID_DUE_TIME';
    else if (nowMs < dueAtMs) reason = 'WAITING_UNTIL_WINDOW_DUE';
    else reason = 'DUE_NOW_SHOULD_PROCESS';

    rows.push({
      row: r + 1,
      status: status,
      type: String(values[r][2] || '').trim(),
      recipient: String(values[r][3] || '').trim(),
      auditId: String(values[r][4] || '').trim(),
      subject: String(values[r][6] || '').trim(),
      attempts: values[r][8],
      lastError: String(values[r][9] || '').trim(),
      timestampSent: values[r][11],
      reservedRaw: reservedRaw,
      parsedOk: !!parsed,
      windowKey: parsed ? String(parsed.windowKey || '') : '',
      groupKey: parsed ? String(parsed.groupKey || '') : '',
      windowDueAt: parsed ? String(parsed.windowDueAt || '') : '',
      windowDueAtMs: dueAtMs || '',
      nowMs: nowMs,
      due: !!(dueAtMs && nowMs >= dueAtMs),
      reason: reason
    });
  }

  var out = {
    ok: true,
    build: NQ_DOCTOR_BUILD,
    queueSheet: sh.getName(),
    reservedCount: rows.length,
    rows: rows
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NOTIFICATION_QUEUE_DOCTOR_RESET_RESERVED_DEV() {
  NQ_DOCTOR_assertDev_();

  var sh = NQ_DOCTOR_getQueueSheet_();
  var values = sh.getDataRange().getValues();
  var reset = [];

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'RESERVED') continue;

    var auditId = String(values[r][4] || '').trim();
    var subject = String(values[r][6] || '').trim();
    var recipient = String(values[r][3] || '').trim();

    var looksSafe =
      auditId.indexOf('DEV') >= 0 ||
      subject.toUpperCase().indexOf('DEV') >= 0 ||
      recipient === 'real.recipient@example.com' ||
      recipient === 'auditor@example.com';

    if (!looksSafe) continue;

    sh.getRange(r + 1, 2).setValue('PENDING');
    sh.getRange(r + 1, 10).setValue('DEV reset from RESERVED to PENDING by NotificationQueueDoctor at ' + new Date().toISOString());
    sh.getRange(r + 1, 13).setValue('');

    reset.push({
      row: r + 1,
      auditId: auditId,
      subject: subject,
      recipient: recipient
    });
  }

  var out = {
    ok: true,
    build: NQ_DOCTOR_BUILD,
    action: 'RESET_RESERVED_DEV',
    resetCount: reset.length,
    reset: reset,
    nextRun: 'Run NotificationSender_RunDigest10M after this.'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NOTIFICATION_QUEUE_DOCTOR_FORCE_RESERVED_DUE_DEV() {
  NQ_DOCTOR_assertDev_();

  var sh = NQ_DOCTOR_getQueueSheet_();
  var values = sh.getDataRange().getValues();
  var touched = [];
  var now = new Date();
  var nowMs = Date.now();

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'RESERVED') continue;

    var auditId = String(values[r][4] || '').trim();
    var subject = String(values[r][6] || '').trim();
    var recipient = String(values[r][3] || '').trim();

    var looksSafe =
      auditId.indexOf('DEV') >= 0 ||
      subject.toUpperCase().indexOf('DEV') >= 0 ||
      recipient === 'real.recipient@example.com' ||
      recipient === 'auditor@example.com';

    if (!looksSafe) continue;

    var reservedRaw = String(values[r][12] || '').trim();
    var parsed = NQ_DOCTOR_parseJson_(reservedRaw) || { payload: {} };

    parsed.windowKey = parsed.windowKey || ('DEV_FORCE_ROW_' + (r + 1));
    parsed.groupKey = parsed.groupKey || (recipient + '|DEV_FORCE_ROW_' + (r + 1));
    parsed.windowStartAtMs = nowMs - 60000;
    parsed.windowStartAt = NQ_DOCTOR_iso_(new Date(nowMs - 60000));
    parsed.windowDueAtMs = nowMs - 1000;
    parsed.windowDueAt = NQ_DOCTOR_iso_(new Date(nowMs - 1000));
    parsed.reservedAtMs = nowMs - 60000;
    parsed.reservedAt = NQ_DOCTOR_iso_(new Date(nowMs - 60000));

    sh.getRange(r + 1, 13).setValue(JSON.stringify(parsed));
    sh.getRange(r + 1, 10).setValue('DEV forced RESERVED due by NotificationQueueDoctor at ' + now.toISOString());

    touched.push({
      row: r + 1,
      auditId: auditId,
      subject: subject,
      recipient: recipient
    });
  }

  var out = {
    ok: true,
    build: NQ_DOCTOR_BUILD,
    action: 'FORCE_RESERVED_DUE_DEV',
    touchedCount: touched.length,
    touched: touched,
    nextRun: 'Run NotificationSender_RunDigest10M after this.'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function NQ_DOCTOR_getQueueSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = 'Notification Queue';

  if (typeof NotificationConfig_GetQueueSheetName === 'function') {
    var configured = String(NotificationConfig_GetQueueSheetName() || '').trim();
    if (configured) name = configured;
  }

  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Notification Queue sheet missing: ' + name);
  return sh;
}

function NQ_DOCTOR_assertDev_() {
  if (typeof EnvironmentGuard_getRuntimeEnv !== 'function') {
    throw new Error('EnvironmentGuard_getRuntimeEnv missing. Add EnvironmentGuardService.gs.');
  }

  var env = String(EnvironmentGuard_getRuntimeEnv() || '').trim().toUpperCase();
  if (env !== 'DEV') {
    throw new Error('NotificationQueueDoctor reset/force functions are blocked outside DEV. Current env=' + env);
  }
}

function NQ_DOCTOR_parseJson_(v) {
  try {
    if (!v) return null;
    return JSON.parse(String(v));
  } catch (e) {
    return null;
  }
}

function NQ_DOCTOR_toMs_(v) {
  try {
    if (!v) return 0;
    if (v instanceof Date) return v.getTime();
    var d = new Date(String(v));
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
  } catch (e) {
    return 0;
  }
}

function NQ_DOCTOR_iso_(d) {
  try {
    var tz = 'Europe/Amsterdam';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss && ss.getSpreadsheetTimeZone) {
      tz = String(ss.getSpreadsheetTimeZone() || tz);
    }
    return Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ss");
  } catch (e) {
    return d.toISOString();
  }
}
