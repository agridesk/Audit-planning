/**
 * FILE: zz_AMS01_NotificationQueueWritePerfOverride.js
 * BUILD: AMS01_NOTIFICATION_QUEUE_WRITE_PERF_ZZ_20260909_R1
 *
 * Tactical V1.0 queue-write performance override.
 *
 * Preserves NotificationBuilder queue semantics and payload/renderer ownership.
 * The only write-path change is replacing Sheet.appendRow() with one explicit
 * 1x13 setValues() write. Fine-grained timings are returned for the current
 * SAVE hot-path investigation.
 */
var AMS01_NOTIFICATION_QUEUE_WRITE_PERF_ZZ_BUILD = 'AMS01_NOTIFICATION_QUEUE_WRITE_PERF_ZZ_20260909_R1';

function NB_queueNotification_(recipientEmail, eventType, data) {
  var t0 = Date.now();
  var timing = { build: AMS01_NOTIFICATION_QUEUE_WRITE_PERF_ZZ_BUILD };

  var eventCode = NB_eventCode_(eventType);
  var t = Date.now();
  var cfg = NB_getEventConfig_(eventCode);
  timing.configMs = Date.now() - t;

  if (!cfg.active) {
    return {
      success:true,
      skipped:true,
      reason:'EVENT_DISABLED',
      eventType:eventCode,
      __ams01QueueWriteTiming:timing
    };
  }

  t = Date.now();
  var payload = NB_buildPayloadForQueue_(eventCode, data);
  timing.payloadMs = Date.now() - t;

  var built = null;
  t = Date.now();
  if (NB_isDeferredExternalQueueEvent_(eventCode, cfg, payload)) {
    built = NB_buildDeferredExternalQueuePreview_(eventCode, payload);
  } else {
    built = NB_buildNotification_(eventCode, payload);
  }
  timing.renderMs = Date.now() - t;

  t = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = NB_getQueueSheet_(ss, true);
  timing.sheetMs = Date.now() - t;

  var now = new Date();
  t = Date.now();
  var tz = NB_getTz_(ss);
  timing.tzMs = Date.now() - t;

  t = Date.now();
  var hash = NB_hashQueueRow_(recipientEmail, eventCode, payload, built);
  timing.hashMs = Date.now() - t;

  t = Date.now();
  var duplicate = NB_recentQueueDuplicate_(sh, hash, eventCode, recipientEmail, payload.auditId);
  timing.duplicateMs = Date.now() - t;

  if (duplicate.found) {
    timing.totalMs = Date.now() - t0;
    return {
      success:true,
      skipped:true,
      reason:'DUPLICATE_QUEUE_ROW',
      eventType:eventCode,
      recipient:NB_clean_(recipientEmail),
      auditId:NB_clean_(payload.auditId),
      duplicateRow:duplicate.row,
      duplicateStatus:duplicate.status,
      duplicateMatch:duplicate.match,
      __ams01QueueWriteTiming:timing
    };
  }

  var effectiveRecipient = cfg.sendEmail && !cfg.logOnly ? NB_clean_(recipientEmail) : '';
  var initialStatus = cfg.sendEmail && !cfg.logOnly ? 'PENDING' : 'AUDIT_TRAIL';
  var queueRow = [
    Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'),
    initialStatus,
    eventCode,
    effectiveRecipient,
    NB_clean_(payload.auditId),
    NB_clean_(payload.company),
    built.subject,
    built.body,
    0,
    '',
    hash,
    '',
    JSON.stringify({ payload: payload })
  ];

  t = Date.now();
  var targetRow = sh.getLastRow() + 1;
  sh.getRange(targetRow, 1, 1, queueRow.length).setValues([queueRow]);
  timing.writeMs = Date.now() - t;
  timing.row = targetRow;
  timing.totalMs = Date.now() - t0;

  return {
    success:true,
    recipient:effectiveRecipient,
    eventType:eventCode,
    eventFamily:payload.eventFamily,
    rendererProfile:payload.rendererProfile,
    queueSheet:sh.getName(),
    status:initialStatus,
    __ams01QueueWriteTiming:timing
  };
}

function AMS01_NotificationQueueWritePerfStatus() {
  return {
    success:true,
    active:true,
    build:AMS01_NOTIFICATION_QUEUE_WRITE_PERF_ZZ_BUILD,
    writeStrategy:'SETVALUES_1X13'
  };
}
