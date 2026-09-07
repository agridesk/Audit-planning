// FILE: ECAS_ACCEPT_ConfigHotfix_ApplyAndValidate.gs
// BUILD: 2026-06-17_ECAS_ACCEPT_CONFIG_HOTFIX_R1
// PURPOSE:
//   One-time PROD/DEV config repair for ECAS accept notifications.
//   Keeps AUDIT_ACCEPTED as lifecycle notification.
//   Keeps ECAS_AUDIT_APPROVAL_DIGEST as the only ECAS/external digest event.
//
// DEPLOYMENT:
//   Add as a temporary .gs file, run RUN_ECAS_ACCEPT_CONFIG_HOTFIX_APPLY once,
//   then run RUN_ECAS_ACCEPT_CONFIG_HOTFIX_VALIDATE.
//   Keep or remove after validation.

function RUN_ECAS_ACCEPT_CONFIG_HOTFIX_APPLY() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Notification_Config');
  if (!sh) throw new Error('Missing sheet: Notification_Config');

  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(x) {
    return String(x || '').trim();
  });

  var H = ECAS_HOTFIX_headerMap_(headers);
  var required = [
    'EVENT_KEY','ACTIVE','SEND_EMAIL','LOG_ONLY','EVENT_CLASS','DESCRIPTION',
    'RECIPIENT_MODE','RECIPIENT_TARGET','CONSOLIDATE','BUFFER_MINUTES',
    'DIGEST_GROUP','TEMPLATE_FAMILY','TEMPLATE_KEY_DEFAULT','NOTES'
  ];
  for (var i = 0; i < required.length; i++) {
    if (H(required[i]) < 0) throw new Error('Notification_Config missing column: ' + required[i]);
  }

  var auditAcceptedRow = ECAS_HOTFIX_findOrCreateEventRow_(sh, headers, H, 'AUDIT_ACCEPTED');
  var ecasRow = ECAS_HOTFIX_findOrCreateEventRow_(sh, headers, H, 'ECAS_AUDIT_APPROVAL_DIGEST');

  ECAS_HOTFIX_writeEvent_(sh, auditAcceptedRow, H, {
    EVENT_KEY: 'AUDIT_ACCEPTED',
    ACTIVE: 'YES',
    SEND_EMAIL: 'YES',
    LOG_ONLY: 'NO',
    EVENT_CLASS: 'COMPACT_LIFECYCLE',
    DESCRIPTION: 'Auditor accepted audit; compact lifecycle notification to manager',
    RECIPIENT_MODE: 'ROLE_BASED',
    RECIPIENT_TARGET: 'MANAGER_DEFAULT',
    CONSOLIDATE: 'YES',
    BUFFER_MINUTES: 10,
    DIGEST_GROUP: 'LIFECYCLE',
    TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
    TEMPLATE_KEY_DEFAULT: 'AUDIT_ACCEPTED',
    INCLUDE_COMMENT: 'NO',
    REQUIRE_REASON: 'NO',
    NOTES: 'Lifecycle event only. ECAS delivery is owned by ECAS_AUDIT_APPROVAL_DIGEST.'
  });

  ECAS_HOTFIX_writeEvent_(sh, ecasRow, H, {
    EVENT_KEY: 'ECAS_AUDIT_APPROVAL_DIGEST',
    ACTIVE: 'YES',
    SEND_EMAIL: 'YES',
    LOG_ONLY: 'NO',
    EVENT_CLASS: 'EXTERNAL_OPERATIONAL',
    DESCRIPTION: 'Auditor accepted audit; external ECAS operational digest to planning',
    RECIPIENT_MODE: 'SINGLE',
    RECIPIENT_TARGET: 'ECAS_DEFAULT',
    CONSOLIDATE: 'YES',
    BUFFER_MINUTES: 10,
    DIGEST_GROUP: 'ECAS_OPERATIONAL',
    TEMPLATE_FAMILY: 'EXTERNAL_OPERATIONAL',
    TEMPLATE_KEY_DEFAULT: 'ECAS_AUDIT_APPROVAL_DIGEST',
    INCLUDE_COMMENT: 'NO',
    REQUIRE_REASON: 'NO',
    NOTES: 'Only ECAS/external event for auditor accept. Queued by StatusNotificationBridge after AUDIT_ACCEPTED.'
  });

  try {
    if (typeof NotificationConfig_ClearCache === 'function') NotificationConfig_ClearCache();
  } catch (e0) {}
  try {
    if (typeof NB_InvalidateConfigCache === 'function') NB_InvalidateConfigCache();
  } catch (e1) {}

  SpreadsheetApp.flush();

  var out = {
    ok: true,
    build: '2026-06-17_ECAS_ACCEPT_CONFIG_HOTFIX_R1',
    updatedRows: {
      AUDIT_ACCEPTED: auditAcceptedRow,
      ECAS_AUDIT_APPROVAL_DIGEST: ecasRow
    },
    cacheCleared: true,
    next: 'Run RUN_ECAS_ACCEPT_CONFIG_HOTFIX_VALIDATE, then test a fresh accept.'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_ECAS_ACCEPT_CONFIG_HOTFIX_VALIDATE() {
  if (typeof NotificationConfig_ClearCache === 'function') NotificationConfig_ClearCache();

  var a = (typeof NotificationConfig_GetEvent === 'function') ? NotificationConfig_GetEvent('AUDIT_ACCEPTED') : null;
  var e = (typeof NotificationConfig_GetEvent === 'function') ? NotificationConfig_GetEvent('ECAS_AUDIT_APPROVAL_DIGEST') : null;

  var checks = [
    {
      name: 'AUDIT_ACCEPTED is lifecycle',
      ok: !!(a && a.templateFamily === 'COMPACT_LIFECYCLE' && a.digestGroup !== 'ECAS_OPERATIONAL')
    },
    {
      name: 'ECAS_AUDIT_APPROVAL_DIGEST is external',
      ok: !!(e && e.templateFamily === 'EXTERNAL_OPERATIONAL' && e.digestGroup === 'ECAS_OPERATIONAL')
    },
    {
      name: 'ECAS event is sendable',
      ok: !!(e && e.active === true && e.sendEmail === true && e.logOnly !== true)
    }
  ];

  var ok = checks.every(function(c) { return c.ok; });
  var out = {
    ok: ok,
    build: '2026-06-17_ECAS_ACCEPT_CONFIG_HOTFIX_R1',
    checks: checks,
    AUDIT_ACCEPTED: a,
    ECAS_AUDIT_APPROVAL_DIGEST: e
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function ECAS_HOTFIX_headerMap_(headers) {
  var normalized = headers.map(function(h) {
    return String(h || '').trim().toUpperCase().replace(/\s+/g, '_');
  });
  return function(name) {
    var key = String(name || '').trim().toUpperCase().replace(/\s+/g, '_');
    return normalized.indexOf(key);
  };
}

function ECAS_HOTFIX_findOrCreateEventRow_(sh, headers, H, eventKey) {
  var eventCol = H('EVENT_KEY');
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var values = sh.getRange(2, eventCol + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || '').trim().toUpperCase() === String(eventKey || '').trim().toUpperCase()) return i + 2;
    }
  }

  var newRow = sh.getLastRow() + 1;
  var empty = new Array(headers.length).fill('');
  empty[eventCol] = eventKey;
  sh.getRange(newRow, 1, 1, headers.length).setValues([empty]);
  return newRow;
}

function ECAS_HOTFIX_writeEvent_(sh, rowNo, H, valuesByHeader) {
  Object.keys(valuesByHeader || {}).forEach(function(header) {
    var col = H(header);
    if (col >= 0) sh.getRange(rowNo, col + 1).setValue(valuesByHeader[header]);
  });
}
