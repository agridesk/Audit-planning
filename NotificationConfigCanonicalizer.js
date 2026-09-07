// FILE: NotificationConfigCanonicalizer.gs
// BUILD: 2026-05-12_NOTIFICATION_CONFIG_CANONICALIZER
// PURPOSE:
//   Controlled canonicalization utility for Notification_Config.
//   Updates existing rows by EVENT_KEY and optionally appends missing canonical rows.
//   Uses header names only. No row-index assumptions.
//   Does NOT send mail.
//   Does NOT touch Notification Queue.
//   Does NOT touch lifecycle/status/availability.
//
// RUNNERS:
//   RUN_NC_CANON_DRY()
//   RUN_NC_CANON_APPLY()
//
// SAFETY:
//   - DRY run writes nothing.
//   - APPLY writes only Notification_Config.
//   - Missing columns are reported, not silently ignored.
//   - Existing rows are updated only by EVENT_KEY.
//   - New events are appended only when missing.

var NCC_BUILD = '2026-05-12_NOTIFICATION_CONFIG_CANONICALIZER';
var NCC_SHEET = 'Notification_Config';

function RUN_NC_CANON_DRY() {
  return NCC_run_(false);
}

function RUN_NC_CANON_APPLY() {
  return NCC_run_(true);
}

function NCC_run_(applyChanges) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NCC_SHEET);
  if (!sh) throw new Error('Missing sheet: ' + NCC_SHEET);

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 1) throw new Error('Notification_Config has no header row.');

  var headers = values[0] || [];
  var idx = NCC_headerMap_(headers);
  var required = ['EVENT_KEY'];

  var writable = [
    'ACTIVE',
    'SEND_EMAIL',
    'LOG_ONLY',
    'EVENT_CLASS',
    'DESCRIPTION',
    'RECIPIENT_MODE',
    'RECIPIENT_TARGET',
    'CONSOLIDATE',
    'BUFFER_MINUTES',
    'DIGEST_GROUP',
    'TEMPLATE_FAMILY',
    'TEMPLATE_KEY_DEFAULT',
    'DIRECT_SEND',
    'REQUIRE_REASON',
    'INCLUDE_COMMENT',
    'ALLOW_MANAGER_EDIT',
    'USE_LEVELS',
    'LEVEL1_NAME',
    'LEVEL1_DAYS',
    'LEVEL2_NAME',
    'LEVEL2_DAYS',
    'LEVEL3_NAME',
    'LEVEL3_DAYS',
    'SORT_ORDER',
    'NOTES'
  ];

  var missingRequired = NCC_missing_(idx, required);
  if (missingRequired.length) {
    throw new Error('Missing required columns: ' + missingRequired.join(', '));
  }

  var missingWritable = NCC_missing_(idx, writable);
  var rowByKey = {};

  for (var r = 1; r < values.length; r++) {
    var key = NCC_text_(values[r][idx.EVENT_KEY]).toUpperCase();
    if (!key) continue;
    if (!rowByKey[key]) rowByKey[key] = r + 1;
  }

  var targets = NCC_targets_();
  var updates = [];
  var appends = [];
  var skippedColumns = {};

  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    var eventKey = String(t.EVENT_KEY || '').trim().toUpperCase();
    if (!eventKey) continue;

    var rowNo = rowByKey[eventKey];

    if (rowNo) {
      var rowUpdates = [];
      Object.keys(t).forEach(function(k) {
        if (k === 'EVENT_KEY') return;
        if (!idx.hasOwnProperty(k)) {
          skippedColumns[k] = true;
          return;
        }

        var oldValue = values[rowNo - 1][idx[k]];
        var newValue = t[k];

        if (NCC_norm_(oldValue) !== NCC_norm_(newValue)) {
          rowUpdates.push({
            column: k,
            oldValue: oldValue,
            newValue: newValue
          });

          if (applyChanges) {
            sh.getRange(rowNo, idx[k] + 1).setValue(newValue);
          }
        }
      });

      if (rowUpdates.length) {
        updates.push({
          eventKey: eventKey,
          row: rowNo,
          changes: rowUpdates
        });
      }
    } else {
      var newRow = new Array(headers.length).fill('');
      if (idx.EVENT_KEY >= 0) newRow[idx.EVENT_KEY] = eventKey;

      Object.keys(t).forEach(function(k) {
        if (!idx.hasOwnProperty(k)) {
          skippedColumns[k] = true;
          return;
        }
        newRow[idx[k]] = t[k];
      });

      appends.push({
        eventKey: eventKey,
        rowValues: newRow
      });

      if (applyChanges) {
        sh.appendRow(newRow);
      }
    }
  }

  try {
    if (applyChanges && typeof NotificationConfig_ClearCache === 'function') {
      NotificationConfig_ClearCache();
    }
  } catch (eCache) {}

  var out = {
    ok: true,
    build: NCC_BUILD,
    sheet: NCC_SHEET,
    mode: applyChanges ? 'APPLY' : 'DRY_RUN',
    rowsRead: Math.max(0, values.length - 1),
    targets: targets.length,
    updatedEvents: updates.length,
    appendedEvents: appends.length,
    missingWritableColumns: missingWritable,
    skippedColumns: Object.keys(skippedColumns).sort(),
    updates: updates,
    appends: appends.map(function(x) { return x.eventKey; }),
    nextStep: applyChanges
      ? 'Run RUN_NOTIFICATIONCONFIG_CLEARCACHE, RUN_NOTIFICATIONCONFIG_DIAG_COVERAGE, RUN_NF_STATUS, then smoke tests.'
      : 'Review output. If correct, run RUN_NC_CANON_APPLY.'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function NCC_targets_() {
  return [
    {
      EVENT_KEY: 'AUDIT_PLANNED_BY_MANAGER',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'RICH_OPERATIONAL',
      DESCRIPTION: 'Manager planned audit; auditor receives rich operational review package',
      RECIPIENT_MODE: 'SINGLE',
      RECIPIENT_TARGET: 'AUDITOR',
      CONSOLIDATE: 'NO',
      BUFFER_MINUTES: 0,
      DIGEST_GROUP: 'AUDITOR_OPERATIONAL',
      TEMPLATE_FAMILY: 'RICH_OPERATIONAL',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_PLANNED_BY_MANAGER',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'NO',
      SORT_ORDER: 10,
      NOTES: 'Rich operational planning package; status Approved displayed to auditor as Pending acceptance.'
    },
    {
      EVENT_KEY: 'AUDIT_PLANNED_BY_AUDITOR',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'APPROVAL_OPERATIONAL',
      DESCRIPTION: 'Auditor self-planned audit; manager receives approval package',
      RECIPIENT_MODE: 'SINGLE',
      RECIPIENT_TARGET: 'MANAGER',
      CONSOLIDATE: 'NO',
      BUFFER_MINUTES: 0,
      DIGEST_GROUP: 'MANAGER_APPROVAL',
      TEMPLATE_FAMILY: 'APPROVAL_OPERATIONAL',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_PLANNED_BY_AUDITOR',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'NO',
      SORT_ORDER: 20,
      NOTES: 'Approval operational package; not a compact lifecycle digest.'
    },
    {
      EVENT_KEY: 'AUDIT_APPROVED',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Manager approved audit; compact lifecycle notification to assigned auditor',
      RECIPIENT_MODE: 'AUDIT_DYNAMIC',
      RECIPIENT_TARGET: 'AUDITOR_ASSIGNED',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_AUDITOR',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_APPROVED',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'NO',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 30,
      NOTES: 'Compact lifecycle event. Manager-planned rich package uses AUDIT_PLANNED_BY_MANAGER.'
    },
    {
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
      DIGEST_GROUP: 'LIFECYCLE_MANAGER',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_ACCEPTED',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'NO',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 40,
      NOTES: 'Compact lifecycle digest.'
    },
    {
      EVENT_KEY: 'AUDIT_COMPLETED',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Audit completed; compact lifecycle notification to manager',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_MANAGER',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_COMPLETED',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'NO',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 50,
      NOTES: 'Compact lifecycle digest.'
    },
    {
      EVENT_KEY: 'AUDIT_CANCELLED_BY_MANAGER',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Manager cancelled audit; compact lifecycle notification to auditor',
      RECIPIENT_MODE: 'AUDIT_DYNAMIC',
      RECIPIENT_TARGET: 'AUDITOR_ASSIGNED',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_AUDITOR',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_CANCELLED_BY_MANAGER',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'YES',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 60,
      NOTES: 'Cancel is action, not status. Returns audit to Pending Planning.'
    },
    {
      EVENT_KEY: 'AUDIT_DENIED_BY_MANAGER',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Manager denied auditor planning; compact lifecycle notification to auditor',
      RECIPIENT_MODE: 'AUDIT_DYNAMIC',
      RECIPIENT_TARGET: 'AUDITOR_ASSIGNED',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_AUDITOR',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_DENIED_BY_MANAGER',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'YES',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 70,
      NOTES: 'Deny is action, not status. Returns audit to Pending Planning.'
    },
    {
      EVENT_KEY: 'AUDIT_REJECTED_BY_MANAGER',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Manager rejected audit; compact lifecycle notification to auditor',
      RECIPIENT_MODE: 'AUDIT_DYNAMIC',
      RECIPIENT_TARGET: 'AUDITOR_ASSIGNED',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_AUDITOR',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_REJECTED_BY_MANAGER',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'YES',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 80,
      NOTES: 'Rejected is terminal rejection state.'
    },
    {
      EVENT_KEY: 'AUDIT_CANCELLED_BY_AUDITOR',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Auditor cancelled audit; compact lifecycle notification to manager',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_MANAGER',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_CANCELLED_BY_AUDITOR',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 90,
      NOTES: 'Comment optional; include only when present.'
    },
    {
      EVENT_KEY: 'AUDIT_DENIED_BY_AUDITOR',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Auditor denied manager planning; compact lifecycle notification to manager',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_MANAGER',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'AUDIT_DENIED_BY_AUDITOR',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 100,
      NOTES: 'Comment optional; include only when present.'
    },
    {
      EVENT_KEY: 'COMPLETED_ON_BEHALF',
      ACTIVE: 'YES',
      SEND_EMAIL: 'NO',
      LOG_ONLY: 'YES',
      EVENT_CLASS: 'AUDIT_TRAIL',
      DESCRIPTION: 'Manager completed audit on behalf of auditor; audit trail only',
      RECIPIENT_MODE: 'NONE',
      RECIPIENT_TARGET: 'NONE',
      CONSOLIDATE: 'NO',
      BUFFER_MINUTES: 0,
      DIGEST_GROUP: 'AUDIT_TRAIL',
      TEMPLATE_FAMILY: 'AUDIT_TRAIL',
      TEMPLATE_KEY_DEFAULT: 'COMPLETED_ON_BEHALF',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'NO',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 110,
      NOTES: 'Log only; never delivered.'
    },
    {
      EVENT_KEY: 'EXTENSION_APPLIED',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Extended expiration date applied; compact lifecycle notification',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_MANAGER',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'EXTENSION_APPLIED',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 130,
      NOTES: 'Extension event; compact lifecycle digest.'
    },
    {
      EVENT_KEY: 'EXTENSION_UNDONE',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'COMPACT_LIFECYCLE',
      DESCRIPTION: 'Extended expiration date reverted; compact lifecycle notification',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'LIFECYCLE_MANAGER',
      TEMPLATE_FAMILY: 'COMPACT_LIFECYCLE',
      TEMPLATE_KEY_DEFAULT: 'EXTENSION_UNDONE',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 140,
      NOTES: 'Extension event; compact lifecycle digest.'
    },
    {
      EVENT_KEY: 'ECAS_AUDIT_APPROVAL_DIGEST',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'EXTERNAL_OPERATIONAL',
      DESCRIPTION: 'Grouped operational approval digest for ECAS',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'ECAS_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'ECAS_OPERATIONAL',
      TEMPLATE_FAMILY: 'EXTERNAL_OPERATIONAL',
      TEMPLATE_KEY_DEFAULT: 'ECAS_AUDIT_APPROVAL_DIGEST',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'NO',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 150,
      NOTES: 'External grouped operational digest; no internal lifecycle noise.'
    },
    {
      EVENT_KEY: 'CUSTOMER_AUDIT_APPROVAL_DIGEST',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'EXTERNAL_OPERATIONAL',
      DESCRIPTION: 'Grouped operational approval digest for customer/opdrachtgever',
      RECIPIENT_MODE: 'AUDIT_DYNAMIC',
      RECIPIENT_TARGET: 'CUSTOMER_CONTACT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'CUSTOMER_OPERATIONAL',
      TEMPLATE_FAMILY: 'EXTERNAL_OPERATIONAL',
      TEMPLATE_KEY_DEFAULT: 'CUSTOMER_AUDIT_APPROVAL_DIGEST',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'NO',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 160,
      NOTES: 'External grouped operational digest; no internal lifecycle noise.'
    },
    {
      EVENT_KEY: 'CUSTOMER_AUDIT_CANCELLED_DIGEST',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'EXTERNAL_OPERATIONAL',
      DESCRIPTION: 'Grouped operational cancellation digest for customer/opdrachtgever',
      RECIPIENT_MODE: 'AUDIT_DYNAMIC',
      RECIPIENT_TARGET: 'CUSTOMER_CONTACT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 10,
      DIGEST_GROUP: 'CUSTOMER_OPERATIONAL',
      TEMPLATE_FAMILY: 'EXTERNAL_OPERATIONAL',
      TEMPLATE_KEY_DEFAULT: 'CUSTOMER_AUDIT_CANCELLED_DIGEST',
      DIRECT_SEND: 'NO',
      REQUIRE_REASON: 'NO',
      INCLUDE_COMMENT: 'YES',
      ALLOW_MANAGER_EDIT: 'YES',
      SORT_ORDER: 170,
      NOTES: 'External grouped operational cancellation digest.'
    },
    {
      EVENT_KEY: 'WEEKLY_MANAGER_PENDING_PLANNING',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'WEEKLY',
      DESCRIPTION: 'Weekly manager digest for pending-planning audits',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 60,
      DIGEST_GROUP: 'MANAGER_WEEKLY',
      TEMPLATE_FAMILY: 'WEEKLY',
      TEMPLATE_KEY_DEFAULT: 'WEEKLY_MANAGER_PENDING_PLANNING',
      USE_LEVELS: 'YES',
      LEVEL1_NAME: 'Critical',
      LEVEL1_DAYS: 60,
      LEVEL2_NAME: 'Urgent',
      LEVEL2_DAYS: 90,
      LEVEL3_NAME: 'Upcoming',
      LEVEL3_DAYS: 120,
      SORT_ORDER: 200,
      NOTES: 'Manager weekly active. Thresholds from config.'
    },
    {
      EVENT_KEY: 'WEEKLY_MANAGER_COMING_UP',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'WEEKLY',
      DESCRIPTION: 'Weekly manager coming-up audit overview',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'MANAGER_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 60,
      DIGEST_GROUP: 'MANAGER_WEEKLY',
      TEMPLATE_FAMILY: 'WEEKLY',
      TEMPLATE_KEY_DEFAULT: 'WEEKLY_MANAGER_COMING_UP',
      SORT_ORDER: 210,
      NOTES: 'Weekly oversight.'
    },
    {
      EVENT_KEY: 'WEEKLY_AUDITOR_COMING_UP',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'WEEKLY',
      DESCRIPTION: 'Weekly auditor coming-up audit overview',
      RECIPIENT_MODE: 'ROLE_BASED',
      RECIPIENT_TARGET: 'AUDITOR_DEFAULT',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 60,
      DIGEST_GROUP: 'AUDITOR_WEEKLY',
      TEMPLATE_FAMILY: 'WEEKLY',
      TEMPLATE_KEY_DEFAULT: 'WEEKLY_AUDITOR_COMING_UP',
      SORT_ORDER: 220,
      NOTES: 'Weekly oversight.'
    },
    {
      EVENT_KEY: 'PLANNING_WINDOW_ALERT',
      ACTIVE: 'YES',
      SEND_EMAIL: 'YES',
      LOG_ONLY: 'NO',
      EVENT_CLASS: 'WEEKLY',
      DESCRIPTION: 'Planning window alert for weekly overview',
      RECIPIENT_MODE: 'SINGLE',
      RECIPIENT_TARGET: 'MANAGER',
      CONSOLIDATE: 'YES',
      BUFFER_MINUTES: 60,
      DIGEST_GROUP: 'MANAGER_WEEKLY',
      TEMPLATE_FAMILY: 'WEEKLY',
      TEMPLATE_KEY_DEFAULT: 'PLANNING_WINDOW_ALERT',
      SORT_ORDER: 230,
      NOTES: 'Weekly/planning pressure alert.'
    }
  ];
}

function NCC_headerMap_(headers) {
  var out = {};
  for (var i = 0; i < headers.length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;
    out[raw] = i;
    out[raw.toUpperCase()] = i;
    out[NCC_key_(raw)] = i;
  }

  var canonical = {};
  Object.keys(out).forEach(function(k) {
    canonical[k] = out[k];
  });

  var aliases = {
    EVENT_KEY: ['EVENT_KEY', 'Event Key', 'EventKey'],
    ACTIVE: ['ACTIVE', 'Active'],
    SEND_EMAIL: ['SEND_EMAIL', 'Send Email', 'SendEmail'],
    LOG_ONLY: ['LOG_ONLY', 'Log Only', 'LogOnly'],
    EVENT_CLASS: ['EVENT_CLASS', 'Event Class', 'EventClass'],
    DESCRIPTION: ['DESCRIPTION', 'Description'],
    RECIPIENT_MODE: ['RECIPIENT_MODE', 'Recipient Mode', 'RecipientMode'],
    RECIPIENT_TARGET: ['RECIPIENT_TARGET', 'Recipient Target', 'RecipientTarget'],
    CONSOLIDATE: ['CONSOLIDATE', 'Consolidate'],
    BUFFER_MINUTES: ['BUFFER_MINUTES', 'Buffer Minutes', 'BufferMinutes'],
    DIGEST_GROUP: ['DIGEST_GROUP', 'Digest Group', 'DigestGroup'],
    TEMPLATE_FAMILY: ['TEMPLATE_FAMILY', 'Template Family', 'TemplateFamily'],
    TEMPLATE_KEY_DEFAULT: ['TEMPLATE_KEY_DEFAULT', 'Template Key Default', 'TemplateKeyDefault'],
    DIRECT_SEND: ['DIRECT_SEND', 'Direct Send', 'DirectSend'],
    REQUIRE_REASON: ['REQUIRE_REASON', 'Require Reason', 'RequireReason'],
    INCLUDE_COMMENT: ['INCLUDE_COMMENT', 'Include Comment', 'IncludeComment'],
    ALLOW_MANAGER_EDIT: ['ALLOW_MANAGER_EDIT', 'Allow Manager Edit', 'AllowManagerEdit'],
    USE_LEVELS: ['USE_LEVELS', 'Use Levels', 'UseLevels'],
    LEVEL1_NAME: ['LEVEL1_NAME', 'Level1 Name', 'Level1Name'],
    LEVEL1_DAYS: ['LEVEL1_DAYS', 'Level1 Days', 'Level1Days'],
    LEVEL2_NAME: ['LEVEL2_NAME', 'Level2 Name', 'Level2Name'],
    LEVEL2_DAYS: ['LEVEL2_DAYS', 'Level2 Days', 'Level2Days'],
    LEVEL3_NAME: ['LEVEL3_NAME', 'Level3 Name', 'Level3Name'],
    LEVEL3_DAYS: ['LEVEL3_DAYS', 'Level3 Days', 'Level3Days'],
    SORT_ORDER: ['SORT_ORDER', 'Sort Order', 'SortOrder'],
    NOTES: ['NOTES', 'Notes']
  };

  Object.keys(aliases).forEach(function(canon) {
    if (canonical.hasOwnProperty(canon)) return;
    var list = aliases[canon];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (out.hasOwnProperty(a)) { canonical[canon] = out[a]; return; }
      if (out.hasOwnProperty(a.toUpperCase())) { canonical[canon] = out[a.toUpperCase()]; return; }
      var key = NCC_key_(a);
      if (out.hasOwnProperty(key)) { canonical[canon] = out[key]; return; }
    }
  });

  return canonical;
}

function NCC_missing_(idx, keys) {
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    if (!idx.hasOwnProperty(keys[i])) out.push(keys[i]);
  }
  return out;
}

function NCC_key_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function NCC_text_(v) {
  return String(v == null ? '' : v).trim();
}

function NCC_norm_(v) {
  if (v === null || typeof v === 'undefined') return '';
  return String(v).trim();
}
