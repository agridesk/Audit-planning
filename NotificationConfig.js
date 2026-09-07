/***********************************************************************
 * FILE: NotificationConfig.gs
 * BUILD: 2026-05-13_NOTIFICATION_CONFIG_CANONICAL_ROUTING_DEFAULTS_d02
 *
 * PURPOSE
 * - Single config owner for notifications.
 * - Reads Notification_Config, Notification_Rules and Notification_Settings.
 * - Provides event config, rules, sender settings and weekly threshold bundles.
 * - Uses AUDIT_CACHE only as acceleration, never as truth.
 *
 * GOVERNANCE
 * - Notification_Config owns event-level notification config.
 * - Notification_Rules owns generic rule values such as queue sheet and trigger day/hour.
 * - Notification_Settings owns sender/test settings.
 * - Cache is explicitly clearable and never authoritative.
 * - No duplicate FINAL OVERRIDE definitions.
 ***********************************************************************/

var NC_SHEET_CONFIG = 'Notification_Config';
var NC_SHEET_RULES = 'Notification_Rules';
var NC_SHEET_SETTINGS = 'Notification_Settings';

var NC_DEFAULT_QUEUE_SHEET = 'Notification Queue';
var NC_DEFAULT_FROM_EMAIL = 'planning@agriqa.es';
var NC_DEFAULT_FROM_NAME = 'Agri Quality Assurance – Audit Planning';

var NC_CONFIG_CACHE = null;
var NC_RULE_CACHE = null;
var NC_SETTINGS_CACHE = null;

var NC_CACHE_NS_CONFIG = 'notification_config';
var NC_CACHE_NS_RULES = 'notification_rules';
var NC_CACHE_NS_SETTINGS = 'notification_settings';
var NC_CACHE_KEY_PARSED = 'parsed_map:v1';

/* ============================================================
 * PUBLIC CACHE
 * ============================================================ */

function NotificationConfig_ClearCache() {
  NC_CONFIG_CACHE = null;
  NC_RULE_CACHE = null;
  NC_SETTINGS_CACHE = null;

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace(NC_CACHE_NS_CONFIG);
      AUDIT_CACHE.removeNamespace(NC_CACHE_NS_RULES);
      AUDIT_CACHE.removeNamespace(NC_CACHE_NS_SETTINGS);
    }
  } catch (e) {}

  return { ok: true };
}

/* ============================================================
 * PUBLIC EVENT CONFIG
 * ============================================================ */

function NotificationConfig_GetEvent(eventKey) {
  var key = nc_up_(eventKey);
  if (!key) return nc_defaultEventConfig_('');

  var map = nc_loadConfigMap_();
  if (map[key]) return nc_clone_(map[key]);

  return nc_defaultEventConfig_(key);
}

function NotificationConfig_GetAllEvents() {
  return nc_clone_(nc_loadConfigMap_());
}

function NotificationConfig_IsEventActive(eventKey) {
  return !!NotificationConfig_GetEvent(eventKey).active;
}

function NotificationConfig_ShouldSendEmail(eventKey) {
  var cfg = NotificationConfig_GetEvent(eventKey);
  return !!cfg.active && !!cfg.sendEmail && !cfg.logOnly;
}

function NotificationConfig_IsLogOnly(eventKey) {
  return !!NotificationConfig_GetEvent(eventKey).logOnly;
}

function NotificationConfig_ShouldIncludeComment(eventKey) {
  return !!NotificationConfig_GetEvent(eventKey).includeComment;
}

function NotificationConfig_RequiresReason(eventKey) {
  return !!NotificationConfig_GetEvent(eventKey).requireReason;
}

/* ============================================================
 * PUBLIC SETTINGS
 * ============================================================ */

function NotificationConfig_GetSetting(settingKey, defaultValue) {
  var key = String(settingKey || '').trim();
  if (!key) return defaultValue;

  var map = nc_loadSettingsMap_();
  if (!map.hasOwnProperty(key)) return defaultValue;

  var value = map[key];
  return value === '' || value === null || typeof value === 'undefined' ? defaultValue : value;
}

function NotificationConfig_GetAllSettings() {
  return nc_clone_(nc_loadSettingsMap_());
}

function NotificationConfig_GetSenderSettings() {
  return {
    DEFAULT_FROM_EMAIL: String(NotificationConfig_GetSetting('DEFAULT_FROM_EMAIL', NotificationConfig_GetDefaultFromEmail()) || '').trim(),
    DEFAULT_FROM_NAME: String(NotificationConfig_GetSetting('DEFAULT_FROM_NAME', NotificationConfig_GetDefaultFromName()) || '').trim(),
    DEFAULT_REPLY_TO: String(NotificationConfig_GetSetting('DEFAULT_REPLY_TO', '') || '').trim(),
    TEST_MODE: String(NotificationConfig_GetSetting('TEST_MODE', '') || '').trim(),
    TEST_RECIPIENT: String(NotificationConfig_GetSetting('TEST_RECIPIENT', '') || '').trim()
  };
}

function NotificationConfig_GetWeeklyManagerConfig() {
  return {
    settings: NotificationConfig_GetSenderSettings(),
    planningWindow: NotificationConfig_GetWeeklyManagerPendingPlanningThresholds(),
    expiry: NotificationConfig_GetExpiryThresholds(),
    birthdateCertificateDays: NotificationConfig_GetBirthdateCertificateThresholdDays(),
    nextWeekDays: NotificationConfig_GetEventMaxLevelDays('WEEKLY_MANAGER_COMING_UP', NotificationConfig_GetComingUpDays()),
    schedule: {
      active: NotificationConfig_AnyEventSendable_([
        'WEEKLY_MANAGER_PENDING_PLANNING',
        'WEEKLY_MANAGER_COMING_UP',
        'BIRTHDATE_CERTIFICATE_EMPTY',
        'EXPIRY_ALERT'
      ]),
      day: NotificationConfig_GetWeeklyManagerSendDay(),
      hour: NotificationConfig_GetWeeklyManagerSendHour()
    }
  };
}

function NotificationConfig_GetWeeklyAuditorConfig() {
  return {
    settings: NotificationConfig_GetSenderSettings(),
    planningWindow: NotificationConfig_GetAuditorPlanningWindowThresholds(),
    comingUpDays: NotificationConfig_GetComingUpDays(),
    schedule: {
      active: NotificationConfig_AnyEventSendable_([
        'WEEKLY_AUDITOR_COMING_UP',
        'WEEKLY_AUDITOR_PENDING_PLANNING',
        'WEEKLY_AUDITOR_PENDING_ACCEPTANCE',
        'WEEKLY_AUDITOR_PENDING_COMPLETION'
      ]),
      day: NotificationConfig_GetWeeklyAuditorSendDay(),
      hour: NotificationConfig_GetWeeklyAuditorSendHour()
    }
  };
}

/* ============================================================
 * PUBLIC RULES
 * ============================================================ */

function NotificationConfig_GetRule(ruleKey, defaultValue) {
  var key = String(ruleKey || '').trim();
  if (!key) return defaultValue;

  var map = nc_loadRuleMap_();
  if (!map.hasOwnProperty(key)) return defaultValue;

  var value = map[key].value;
  return value === '' || value === null || typeof value === 'undefined' ? defaultValue : value;
}

function NotificationConfig_GetRuleNumber(ruleKey, defaultValue) {
  var raw = NotificationConfig_GetRule(ruleKey, defaultValue);
  var n = Number(raw);
  return isNaN(n) ? defaultValue : n;
}

function NotificationConfig_GetAllRules() {
  return nc_clone_(nc_loadRuleMap_());
}

function NotificationConfig_GetQueueSheetName() {
  return String(NotificationConfig_GetRule('QUEUE_SHEET_NAME', NC_DEFAULT_QUEUE_SHEET) || NC_DEFAULT_QUEUE_SHEET).trim();
}

function NotificationConfig_GetDefaultFromEmail() {
  return String(NotificationConfig_GetRule('DEFAULT_FROM_EMAIL', NC_DEFAULT_FROM_EMAIL) || NC_DEFAULT_FROM_EMAIL).trim();
}

function NotificationConfig_GetDefaultFromName() {
  return String(NotificationConfig_GetRule('DEFAULT_FROM_NAME', NC_DEFAULT_FROM_NAME) || NC_DEFAULT_FROM_NAME).trim();
}

function NotificationConfig_GetComingUpDays() {
  var candidates = ['UPCOMING_AUDIT', 'WEEKLY_AUDITOR_COMING_UP', 'WEEKLY_MANAGER_COMING_UP'];
  for (var i = 0; i < candidates.length; i++) {
    var days = NotificationConfig_GetEventLevelDays(candidates[i]);
    if (days.length) return Math.max.apply(null, days);
  }
  return NotificationConfig_GetRuleNumber('COMING_UP_DAYS', 14);
}

function NotificationConfig_GetWeeklyManagerSendDay() {
  return String(NotificationConfig_GetRule('WEEKLY_MANAGER_SEND_DAY', 'MONDAY') || 'MONDAY').trim().toUpperCase();
}

function NotificationConfig_GetWeeklyManagerSendHour() {
  return NotificationConfig_GetRuleNumber('WEEKLY_MANAGER_SEND_HOUR', 7);
}

function NotificationConfig_GetWeeklyAuditorSendDay() {
  return String(NotificationConfig_GetRule('WEEKLY_AUDITOR_SEND_DAY', 'MONDAY') || 'MONDAY').trim().toUpperCase();
}

function NotificationConfig_GetWeeklyAuditorSendHour() {
  return NotificationConfig_GetRuleNumber('WEEKLY_AUDITOR_SEND_HOUR', 7);
}

function NotificationConfig_GetThresholdBundle() {
  var planningWindow = NotificationConfig_GetPlanningWindowThresholds();

  return {
    comingUpDays: NotificationConfig_GetComingUpDays(),
    planningWindow: planningWindow,
    pendingPlanningUpcomingDays: planningWindow.upcomingDays,
    pendingPlanningUrgentDays: planningWindow.urgentDays,
    pendingPlanningCriticalDays: planningWindow.criticalDays,
    weeklyManagerSendDay: NotificationConfig_GetWeeklyManagerSendDay(),
    weeklyManagerSendHour: NotificationConfig_GetWeeklyManagerSendHour(),
    weeklyAuditorSendDay: NotificationConfig_GetWeeklyAuditorSendDay(),
    weeklyAuditorSendHour: NotificationConfig_GetWeeklyAuditorSendHour(),
    queueSheetName: NotificationConfig_GetQueueSheetName(),
    defaultFromEmail: NotificationConfig_GetDefaultFromEmail(),
    defaultFromName: NotificationConfig_GetDefaultFromName()
  };
}

/* ============================================================
 * THRESHOLDS
 * ============================================================ */

function NotificationConfig_GetEventLevelDays(eventKey) {
  var cfg = NotificationConfig_GetEvent(eventKey);
  return nc_eventLevelDays_(cfg);
}

function NotificationConfig_GetEventMaxLevelDays(eventKey, defaultValue) {
  var days = NotificationConfig_GetEventLevelDays(eventKey);
  if (days.length) return Math.max.apply(null, days);
  return defaultValue;
}

function NotificationConfig_GetPlanningWindowThresholds() {
  return NotificationConfig_GetWeeklyManagerPendingPlanningThresholds();
}

function NotificationConfig_GetWeeklyManagerPendingPlanningThresholds() {
  var cfg = NotificationConfig_GetEvent('WEEKLY_MANAGER_PENDING_PLANNING');
  var levels = NotificationConfig_NormalizeUniqueLevels_(cfg && cfg.levels ? cfg.levels : []);

  if (cfg && cfg.active === true && levels.length) {
    return {
      criticalDays: levels[0],
      urgentDays: levels.length > 1 ? levels[1] : levels[0],
      upcomingDays: levels[levels.length - 1],
      levels: levels,
      sourceEventKey: 'WEEKLY_MANAGER_PENDING_PLANNING',
      sourceSheet: 'Notification_Config',
      semantics: 'DAYS_LEFT_ASCENDING_SMALLEST_IS_CRITICAL'
    };
  }

  return {
    criticalDays: 60,
    urgentDays: 90,
    upcomingDays: 120,
    levels: [60, 90, 120],
    sourceEventKey: 'DEFAULT_WEEKLY_MANAGER_FALLBACK',
    sourceSheet: 'code fallback',
    semantics: 'DAYS_LEFT_ASCENDING_SMALLEST_IS_CRITICAL'
  };
}

function NotificationConfig_GetAuditorPlanningWindowThresholds() {
  var cfg = NotificationConfig_GetEvent('PLANNING_WINDOW_ALERT');
  var levels = NotificationConfig_NormalizeUniqueLevels_(cfg && cfg.levels ? cfg.levels : []);

  if (cfg && cfg.active === true && levels.length) {
    return {
      criticalDays: levels[0],
      urgentDays: levels.length > 1 ? levels[1] : levels[0],
      upcomingDays: levels[levels.length - 1],
      levels: levels,
      sourceEventKey: 'PLANNING_WINDOW_ALERT',
      sourceSheet: 'Notification_Config',
      semantics: 'DAYS_LEFT_ASCENDING_SMALLEST_IS_CRITICAL'
    };
  }

  return {
    criticalDays: 30,
    urgentDays: 60,
    upcomingDays: 90,
    levels: [30, 60, 90],
    sourceEventKey: 'DEFAULT_PLANNING_WINDOW_FALLBACK',
    sourceSheet: 'code fallback',
    semantics: 'DAYS_LEFT_ASCENDING_SMALLEST_IS_CRITICAL'
  };
}

function NotificationConfig_GetPendingPlanningCriticalDays() {
  return NotificationConfig_GetPlanningWindowThresholds().criticalDays;
}

function NotificationConfig_GetPendingPlanningUrgentDays() {
  return NotificationConfig_GetPlanningWindowThresholds().urgentDays;
}

function NotificationConfig_GetPendingPlanningUpcomingDays() {
  return NotificationConfig_GetPlanningWindowThresholds().upcomingDays;
}

function NotificationConfig_GetExpiryThresholds() {
  var days = NotificationConfig_GetEventLevelDays('EXPIRY_ALERT');
  return {
    urgentDays: days.length ? days[0] : 0,
    soonDays: days.length ? days[days.length - 1] : 0,
    levels: days
  };
}

function NotificationConfig_GetBirthdateCertificateThresholdDays() {
  return NotificationConfig_GetEventMaxLevelDays('BIRTHDATE_CERTIFICATE_EMPTY', 0);
}

function NotificationConfig_NormalizeUniqueLevels_(levels) {
  var seen = {};
  var out = [];

  for (var i = 0; i < (levels || []).length; i++) {
    var n = Number(levels[i]);
    if (isNaN(n) || n <= 0) continue;
    var key = String(n);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(n);
  }

  out.sort(function(a, b) { return a - b; });
  return out;
}

function NotificationConfig_AnyEventSendable_(eventKeys) {
  for (var i = 0; i < (eventKeys || []).length; i++) {
    var cfg = NotificationConfig_GetEvent(eventKeys[i]);
    if (cfg && cfg.active === true && cfg.sendEmail === true && cfg.logOnly !== true) return true;
  }
  return false;
}

/* ============================================================
 * COMPATIBILITY HELPERS
 * ============================================================ */

function getNotificationConfigByEventKey(eventKey) {
  var cfg = NotificationConfig_GetEvent(eventKey);
  return {
    EVENT_KEY: cfg.eventKey,
    ACTIVE: cfg.active ? 'YES' : 'NO',
    EVENT_CLASS: cfg.eventClass,
    DESCRIPTION: cfg.description,
    RECIPIENT_MODE: cfg.recipientMode,
    RECIPIENT_TARGET: cfg.recipientTarget,
    CONSOLIDATE: cfg.consolidate ? 'YES' : 'NO',
    BUFFER_MINUTES: cfg.bufferMinutes,
    DIGEST_GROUP: cfg.digestGroup,
    TEMPLATE_FAMILY: cfg.templateFamily,
    TEMPLATE_KEY_DEFAULT: cfg.templateKeyDefault,
    FROM_EMAIL: cfg.fromEmail,
    FROM_NAME: cfg.fromName,
    SEND_EMAIL: cfg.sendEmail ? 'YES' : 'NO',
    LOG_ONLY: cfg.logOnly ? 'YES' : 'NO',
    INCLUDE_COMMENT: cfg.includeComment ? 'YES' : 'NO',
    REQUIRE_REASON: cfg.requireReason ? 'YES' : 'NO',
    SORT_ORDER: cfg.sortOrder,
    NOTES: cfg.notes
  };
}

function getNotificationRuleValue(ruleKey, defaultValue) {
  return NotificationConfig_GetRule(ruleKey, defaultValue);
}

function getNotificationThresholds() {
  return NotificationConfig_GetThresholdBundle();
}

/* ============================================================
 * INTERNAL LOADERS
 * ============================================================ */

function nc_loadConfigMap_() {
  if (NC_CONFIG_CACHE) return NC_CONFIG_CACHE;

  var cached = nc_cacheGet_(NC_CACHE_NS_CONFIG, NC_CACHE_KEY_PARSED);
  if (cached && typeof cached === 'object') {
    NC_CONFIG_CACHE = cached;
    return NC_CONFIG_CACHE;
  }

  var out = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NC_SHEET_CONFIG);

  if (!sh) {
    NC_CONFIG_CACHE = out;
    return out;
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    NC_CONFIG_CACHE = out;
    return out;
  }

  var idx = nc_headerMap_(values[0]);

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var eventKey = nc_up_(nc_val_(row, idx, 'EVENT_KEY'));
    if (!eventKey) continue;

    out[eventKey] = {
      eventKey: eventKey,
      active: nc_yes_(nc_val_(row, idx, 'ACTIVE'), true),
      sendEmail: nc_yes_(nc_val_(row, idx, 'SEND_EMAIL'), true),
      logOnly: nc_yes_(nc_val_(row, idx, 'LOG_ONLY'), eventKey === 'COMPLETED_ON_BEHALF'),
      eventClass: nc_clean_(nc_val_(row, idx, 'EVENT_CLASS')) || 'TRANSACTION',
      description: nc_clean_(nc_val_(row, idx, 'DESCRIPTION')),
      recipientMode: nc_clean_(nc_val_(row, idx, 'RECIPIENT_MODE')),
      recipientTarget: nc_clean_(nc_val_(row, idx, 'RECIPIENT_TARGET')),
      consolidate: nc_yes_(nc_val_(row, idx, 'CONSOLIDATE'), true),
      bufferMinutes: nc_num_(nc_val_(row, idx, 'BUFFER_MINUTES'), 10),
      digestGroup: nc_clean_(nc_val_(row, idx, 'DIGEST_GROUP')),
      templateFamily: nc_clean_(nc_val_(row, idx, 'TEMPLATE_FAMILY')),
      templateKeyDefault: nc_clean_(nc_val_(row, idx, 'TEMPLATE_KEY_DEFAULT')) || eventKey,
      fromEmail: nc_clean_(nc_val_(row, idx, 'FROM_EMAIL')) || NotificationConfig_GetDefaultFromEmail(),
      fromName: nc_clean_(nc_val_(row, idx, 'FROM_NAME')) || NotificationConfig_GetDefaultFromName(),
      replyTo: nc_clean_(nc_val_(row, idx, 'REPLY_TO')),
      useLevels: nc_yes_(nc_val_(row, idx, 'USE_LEVELS'), false),
      includeComment: nc_yes_(nc_val_(row, idx, 'INCLUDE_COMMENT'), nc_defaultIncludeComment_(eventKey)),
      requireReason: nc_yes_(nc_val_(row, idx, 'REQUIRE_REASON'), nc_defaultRequireReason_(eventKey)),
      sortOrder: nc_num_(nc_val_(row, idx, 'SORT_ORDER'), 0),
      notes: nc_clean_(nc_val_(row, idx, 'NOTES')),
      levels: nc_collectLevelDays_(row, idx)
    };
  }

  NC_CONFIG_CACHE = out;
  nc_cachePut_(NC_CACHE_NS_CONFIG, NC_CACHE_KEY_PARSED, out, nc_ttl_('NOTIFICATION_CONFIG', 1800));
  return NC_CONFIG_CACHE;
}

function nc_loadRuleMap_() {
  if (NC_RULE_CACHE) return NC_RULE_CACHE;

  var cached = nc_cacheGet_(NC_CACHE_NS_RULES, NC_CACHE_KEY_PARSED);
  if (cached && typeof cached === 'object') {
    NC_RULE_CACHE = cached;
    return NC_RULE_CACHE;
  }

  var out = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NC_SHEET_RULES);

  if (!sh) {
    NC_RULE_CACHE = out;
    return out;
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    NC_RULE_CACHE = out;
    return out;
  }

  var idx = nc_headerMap_(values[0]);

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var ruleKey = nc_clean_(nc_val_(row, idx, 'RuleKey') || nc_val_(row, idx, 'RULE_KEY') || nc_val_(row, idx, 'Rule Key'));
    if (!ruleKey) continue;

    out[ruleKey] = {
      ruleKey: ruleKey,
      value: nc_val_(row, idx, 'Value') || nc_val_(row, idx, 'VALUE'),
      unit: nc_clean_(nc_val_(row, idx, 'Unit') || nc_val_(row, idx, 'UNIT')),
      scope: nc_clean_(nc_val_(row, idx, 'Scope') || nc_val_(row, idx, 'RULE_SCOPE')),
      description: nc_clean_(nc_val_(row, idx, 'Description') || nc_val_(row, idx, 'DESCRIPTION')),
      active: nc_yes_(nc_val_(row, idx, 'Active') || nc_val_(row, idx, 'ACTIVE'), true)
    };
  }

  Object.keys(out).forEach(function(k) {
    if (!out[k].active) delete out[k];
  });

  NC_RULE_CACHE = out;
  nc_cachePut_(NC_CACHE_NS_RULES, NC_CACHE_KEY_PARSED, out, nc_ttl_('NOTIFICATION_RULES', 1800));
  return NC_RULE_CACHE;
}

function nc_loadSettingsMap_() {
  if (NC_SETTINGS_CACHE) return NC_SETTINGS_CACHE;

  var cached = nc_cacheGet_(NC_CACHE_NS_SETTINGS, NC_CACHE_KEY_PARSED);
  if (cached && typeof cached === 'object') {
    NC_SETTINGS_CACHE = cached;
    return NC_SETTINGS_CACHE;
  }

  var out = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NC_SHEET_SETTINGS);

  if (!sh) {
    NC_SETTINGS_CACHE = out;
    return out;
  }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    NC_SETTINGS_CACHE = out;
    return out;
  }

  var idx = nc_headerMap_(values[0] || []);
  var keyCol = nc_firstCol_(idx, ['SettingKey', 'SETTING_KEY', 'Key', 'KEY', 'Name', 'NAME']);
  var valCol = nc_firstCol_(idx, ['Value', 'VALUE', 'SettingValue', 'SETTING_VALUE']);
  if (keyCol < 0) keyCol = 0;
  if (valCol < 0) valCol = 1;

  for (var r = 1; r < values.length; r++) {
    var key = nc_clean_(values[r][keyCol]);
    if (!key) continue;
    out[key] = values[r][valCol];
  }

  NC_SETTINGS_CACHE = out;
  nc_cachePut_(NC_CACHE_NS_SETTINGS, NC_CACHE_KEY_PARSED, out, nc_ttl_('NOTIFICATION_SETTINGS', 1800));
  return NC_SETTINGS_CACHE;
}

/* ============================================================
 * INTERNAL DEFAULTS
 * ============================================================ */

function nc_defaultEventConfig_(eventKey) {
  eventKey = nc_up_(eventKey);
  var routing = nc_defaultRoutingForEvent_(eventKey);

  return {
    eventKey: eventKey,
    active: true,
    sendEmail: eventKey !== 'COMPLETED_ON_BEHALF',
    logOnly: eventKey === 'COMPLETED_ON_BEHALF',
    eventClass: routing.eventClass || 'TRANSACTION',
    description: routing.description || '',
    recipientMode: routing.recipientMode || '',
    recipientTarget: routing.recipientTarget || '',
    consolidate: typeof routing.consolidate === 'boolean' ? routing.consolidate : true,
    bufferMinutes: typeof routing.bufferMinutes === 'number' ? routing.bufferMinutes : 10,
    digestGroup: routing.digestGroup || '',
    templateFamily: routing.templateFamily || '',
    templateKeyDefault: routing.templateKeyDefault || eventKey,
    fromEmail: NotificationConfig_GetDefaultFromEmail(),
    fromName: NotificationConfig_GetDefaultFromName(),
    replyTo: '',
    useLevels: false,
    includeComment: nc_defaultIncludeComment_(eventKey),
    requireReason: nc_defaultRequireReason_(eventKey),
    sortOrder: routing.sortOrder || 0,
    notes: routing.notes || '',
    levels: []
  };
}

function nc_defaultRoutingForEvent_(eventKey) {
  eventKey = nc_up_(eventKey);

  if (eventKey === 'AUDIT_PLANNED_BY_AUDITOR') {
    return {
      templateFamily: 'MANAGER_APPROVAL_OPERATIONAL',
      templateKeyDefault: 'AUDIT_PLANNED_BY_AUDITOR',
      digestGroup: 'MANAGER_APPROVAL_OPERATIONAL',
      recipientMode: 'MANAGER',
      recipientTarget: 'MANAGER',
      consolidate: false,
      bufferMinutes: 0,
      description: 'Auditor self-planned audit; manager approval required.',
      notes: 'Triggered only by Pending Planning -- Plan (Auditor) --> Pending Approval.'
    };
  }

  if (eventKey === 'AUDIT_PLANNED_BY_MANAGER') {
    return {
      templateFamily: 'RICH_OPERATIONAL',
      templateKeyDefault: 'AUDIT_PLANNED_BY_MANAGER',
      digestGroup: 'RICH_OPERATIONAL',
      recipientMode: 'AUDITOR',
      recipientTarget: 'AUDITOR',
      consolidate: false,
      bufferMinutes: 0,
      description: 'Manager planned audit; auditor must accept or deny.',
      notes: 'Triggered only by Pending Planning -- Plan (Manager) --> Approved.'
    };
  }

  if (eventKey === 'AUDIT_ACCEPTED') {
    return {
      templateFamily: 'EXTERNAL_OPERATIONAL',
      templateKeyDefault: 'AUDIT_ACCEPTED',
      digestGroup: 'ECAS_OPERATIONAL',
      recipientMode: 'EXTERNAL_ECAS',
      recipientTarget: 'EXTERNAL_ECAS',
      consolidate: true,
      bufferMinutes: 10,
      description: 'Auditor accepted approved audit; ECAS/planning operational confirmation.',
      notes: 'Triggered only by Approved -- Accept (Auditor) --> Accepted.'
    };
  }

  if (eventKey === 'WEEKLY_MANAGER_PENDING_PLANNING' || eventKey === 'WEEKLY_MANAGER_COMING_UP' ||
      eventKey === 'WEEKLY_AUDITOR_COMING_UP' || eventKey === 'WEEKLY_AUDITOR_PENDING_PLANNING' ||
      eventKey === 'WEEKLY_AUDITOR_PENDING_ACCEPTANCE' || eventKey === 'WEEKLY_AUDITOR_PENDING_COMPLETION' ||
      eventKey === 'EXPIRY_ALERT' || eventKey === 'BIRTHDATE_CERTIFICATE_EMPTY' || eventKey === 'PLANNING_WINDOW_ALERT') {
    return {
      templateFamily: 'WEEKLY',
      digestGroup: 'WEEKLY',
      eventClass: 'TIME_DRIVEN',
      consolidate: true,
      bufferMinutes: 0,
      description: 'Time-driven weekly oversight notification.'
    };
  }

  return {};
}

function nc_defaultIncludeComment_(eventKey) {
  eventKey = nc_up_(eventKey);
  return (
    eventKey === 'AUDIT_CANCELLED_BY_MANAGER' ||
    eventKey === 'AUDIT_DENIED_BY_MANAGER' ||
    eventKey === 'AUDIT_REJECTED_BY_MANAGER' ||
    eventKey === 'AUDIT_CANCELLED_BY_AUDITOR' ||
    eventKey === 'AUDIT_DENIED_BY_AUDITOR'
  );
}

function nc_defaultRequireReason_(eventKey) {
  eventKey = nc_up_(eventKey);
  return (
    eventKey === 'AUDIT_CANCELLED_BY_MANAGER' ||
    eventKey === 'AUDIT_DENIED_BY_MANAGER' ||
    eventKey === 'AUDIT_REJECTED_BY_MANAGER'
  );
}

/* ============================================================
 * INTERNAL HELPERS
 * ============================================================ */

function nc_headerMap_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;
    map[raw] = i;
    map[raw.toUpperCase()] = i;
    map[raw.toLowerCase()] = i;
    map[nc_key_(raw)] = i;
  }
  return map;
}

function nc_firstCol_(idx, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var k = String(candidates[i] || '');
    if (idx && idx.hasOwnProperty(k)) return idx[k];
    if (idx && idx.hasOwnProperty(k.toUpperCase())) return idx[k.toUpperCase()];
    if (idx && idx.hasOwnProperty(k.toLowerCase())) return idx[k.toLowerCase()];
    if (idx && idx.hasOwnProperty(nc_key_(k))) return idx[nc_key_(k)];
  }
  return -1;
}

function nc_key_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function nc_val_(row, idx, key) {
  if (!idx) return '';
  if (idx.hasOwnProperty(key)) return row[idx[key]];

  var up = String(key || '').toUpperCase();
  if (idx.hasOwnProperty(up)) return row[idx[up]];

  var low = String(key || '').toLowerCase();
  if (idx.hasOwnProperty(low)) return row[idx[low]];

  var norm = nc_key_(key);
  if (idx.hasOwnProperty(norm)) return row[idx[norm]];

  return '';
}

function nc_collectLevelDays_(row, idx) {
  var out = [];
  var seenCols = {};

  Object.keys(idx || {}).forEach(function(key) {
    var m = String(key || '').trim().toUpperCase().match(/^LEVEL(\d+)_DAYS$/);
    if (!m) return;

    var col = idx[key];
    if (seenCols[col]) return;
    seenCols[col] = true;

    var n = nc_num_(row[col], null);
    if (n !== null && !isNaN(n)) out.push(Number(n));
  });

  return NotificationConfig_NormalizeUniqueLevels_(out);
}

function nc_eventLevelDays_(cfg) {
  cfg = cfg || {};
  if (cfg.active === false) return [];

  var levels = Array.isArray(cfg.levels) ? cfg.levels : [];
  return NotificationConfig_NormalizeUniqueLevels_(levels);
}

function nc_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function nc_up_(v) {
  return nc_clean_(v).toUpperCase();
}

function nc_num_(v, fallback) {
  if (v === '' || v === null || typeof v === 'undefined') return fallback;
  var n = Number(v);
  return isNaN(n) ? fallback : n;
}

function nc_yes_(v, trueDefault) {
  var s = nc_up_(v);
  if (!s) return !!trueDefault;
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'Y' || s === 'X';
}

function nc_clone_(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function nc_cacheGet_(namespace, keyPart) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      return AUDIT_CACHE.get(namespace, keyPart);
    }
  } catch (e) {}
  return null;
}

function nc_cachePut_(namespace, keyPart, value, ttlSeconds) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(namespace, keyPart, value, ttlSeconds);
    }
  } catch (e) {}
}

function nc_ttl_(key, fallback) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && AUDIT_CACHE.TTL && AUDIT_CACHE.TTL[key]) {
      return AUDIT_CACHE.TTL[key];
    }
  } catch (e) {}
  return fallback;
}

/* ============================================================
 * DIAGNOSTICS
 * ============================================================ */

function NotificationConfig_Diagnostics() {
  var out = {
    ok: true,
    source: 'NotificationConfig.gs',
    build: '2026-05-04_NOTIFICATION_CONFIG_CLEAN_WEEKLY_MANAGER',
    localConfigCachePresent: !!NC_CONFIG_CACHE,
    localRuleCachePresent: !!NC_RULE_CACHE,
    localSettingsCachePresent: !!NC_SETTINGS_CACHE,
    configRows: 0,
    ruleRows: 0,
    settingsRows: 0,
    queueSheetName: '',
    thresholds: null,
    weeklyManager: null,
    weeklyAuditor: null,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    errors: []
  };

  try { NotificationConfig_ClearCache(); } catch (e0) {}

  try {
    var allEvents = NotificationConfig_GetAllEvents();
    out.configRows = Object.keys(allEvents || {}).length;
  } catch (e1) {
    out.ok = false;
    out.errors.push(String(e1 && e1.message ? e1.message : e1));
  }

  try {
    var allRules = NotificationConfig_GetAllRules();
    out.ruleRows = Object.keys(allRules || {}).length;
    out.settingsRows = Object.keys(NotificationConfig_GetAllSettings() || {}).length;
  } catch (e2) {
    out.ok = false;
    out.errors.push(String(e2 && e2.message ? e2.message : e2));
  }

  try { out.queueSheetName = NotificationConfig_GetQueueSheetName(); } catch (e3) { out.ok = false; out.errors.push(String(e3 && e3.message ? e3.message : e3)); }
  try { out.thresholds = NotificationConfig_GetThresholdBundle(); } catch (e4) { out.ok = false; out.errors.push(String(e4 && e4.message ? e4.message : e4)); }
  try { out.weeklyManager = NotificationConfig_GetWeeklyManagerConfig(); } catch (e5) { out.ok = false; out.errors.push(String(e5 && e5.message ? e5.message : e5)); }
  try { out.weeklyAuditor = NotificationConfig_GetWeeklyAuditorConfig(); } catch (e6) { out.ok = false; out.errors.push(String(e6 && e6.message ? e6.message : e6)); }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NOTIFICATIONCONFIG_DIAGNOSTICS() {
  return NotificationConfig_Diagnostics();
}

function RUN_NOTIFICATIONCONFIG_CLEARCACHE() {
  return NotificationConfig_ClearCache();
}

function RUN_NOTIFICATIONCONFIG_CACHE_COLD() {
  return NotificationConfig_ClearCache();
}

function RUN_NOTIFICATIONCONFIG_WARMUP() {
  NotificationConfig_ClearCache();
  var started = new Date().getTime();

  var events = NotificationConfig_GetAllEvents();
  var rules = NotificationConfig_GetAllRules();
  var settings = NotificationConfig_GetAllSettings();
  var thresholds = NotificationConfig_GetThresholdBundle();

  var out = {
    ok: true,
    durationMs: new Date().getTime() - started,
    configRows: Object.keys(events || {}).length,
    ruleRows: Object.keys(rules || {}).length,
    settingsRows: Object.keys(settings || {}).length,
    queueSheetName: NotificationConfig_GetQueueSheetName(),
    thresholds: thresholds
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NOTIFICATIONCONFIG_CACHE_WARMUP() {
  return RUN_NOTIFICATIONCONFIG_WARMUP();
}

function RUN_NOTIFICATIONCONFIG_CACHE_HIT_TEST() {
  NC_CONFIG_CACHE = null;
  NC_RULE_CACHE = null;
  NC_SETTINGS_CACHE = null;

  var started = new Date().getTime();
  var events = NotificationConfig_GetAllEvents();
  var rules = NotificationConfig_GetAllRules();
  var settings = NotificationConfig_GetAllSettings();

  var out = {
    ok: true,
    durationMs: new Date().getTime() - started,
    configRows: Object.keys(events || {}).length,
    ruleRows: Object.keys(rules || {}).length,
    settingsRows: Object.keys(settings || {}).length,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NOTIFICATIONCONFIG_PLANNING_WINDOW_DIAGNOSTICS() {
  NotificationConfig_ClearCache();

  var managerCfg = NotificationConfig_GetEvent('WEEKLY_MANAGER_PENDING_PLANNING');
  var auditorCfg = NotificationConfig_GetEvent('PLANNING_WINDOW_ALERT');
  var managerThresholds = NotificationConfig_GetWeeklyManagerPendingPlanningThresholds();
  var auditorThresholds = NotificationConfig_GetAuditorPlanningWindowThresholds();
  var bundle = NotificationConfig_GetThresholdBundle();

  var out = {
    ok: true,
    source: 'NotificationConfig.gs',
    build: '2026-05-04_NOTIFICATION_CONFIG_CLEAN_WEEKLY_MANAGER',
    singleWeeklyManagerThresholdOwner: true,
    weeklyManagerOwner: 'Notification_Config / WEEKLY_MANAGER_PENDING_PLANNING',
    weeklyManagerActive: managerCfg ? managerCfg.active : false,
    weeklyManagerSendEmail: managerCfg ? managerCfg.sendEmail : false,
    weeklyManagerRawLevels: managerCfg && managerCfg.levels ? managerCfg.levels : [],
    weeklyManagerThresholds: managerThresholds,
    auditorPlanningWindowOwner: 'Notification_Config / PLANNING_WINDOW_ALERT',
    auditorPlanningWindowActive: auditorCfg ? auditorCfg.active : false,
    auditorPlanningWindowRawLevels: auditorCfg && auditorCfg.levels ? auditorCfg.levels : [],
    auditorPlanningWindowThresholds: auditorThresholds,
    thresholdBundle: bundle,
    interpretation: 'For days left: <= criticalDays = Critical, <= urgentDays = Urgent, <= upcomingDays = Upcoming.',
    cacheClearedBeforeRead: true
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
