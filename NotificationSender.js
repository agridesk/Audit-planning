/***********************************************************************
 * FILE: NotificationSender.gs
 *
 * PURPOSE
 * - Single sender for Notification Queue
 * - Queue remains SSOT
 * - Sender does reservation + digest sending only
 * - Subject/body rendering comes from NotificationBuilder.gs
 * - Does not depend on renderer file names; only NB_renderDigestEmail_() contract.
 * - Batching respects consolidate + bufferMinutes using TimestampCreated
 *
 * CONTRACT
 * A TimestampCreated | B Status | C Type | D Recipient | E Audit ID | F Company |
 * G Subject | H Body | I Attempts | J LastError | K PayloadHash |
 * L TimestampSent | M Reserved
 *
 * STATUS VALUES
 * - PENDING
 * - RESERVED
 * - SENT
 * - FAILED
 * - AUDIT_TRAIL   (log only; never sent)
 * - SENT_SIMULATED (DEV DRY_RUN; no email sent)
 * - SENT_DEV_REDIRECT (DEV TEST_TO_SELF; sent only to DEV_TEST_EMAIL)
 * - SENT_SUPPRESSED (PROD/DEV OFF; no email sent)
 ***********************************************************************/

var NS_DEFAULT_CONSOLIDATION_MINUTES = 1;
var NS_DEFAULT_FROM_EMAIL = 'planning@agriqa.es';
var NS_DEFAULT_FROM_NAME  = 'Agri Quality Assurance – Audit Planning';
var NS_STALE_RESERVED_MINUTES = 60;
var NS_BUILD = '2026-05-25_NOTIFICATION_SENDER_WEEKLY_QUEUE_PRE_RENDERED_R13';

/* ============================================================
 * Public
 * ============================================================ */

function NotificationSender_RunDigest10M() {
  return NotificationSender_RunDigest();
}

function NotificationSender_RunDigest() {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(25000); // Apps Script expects milliseconds: 25 seconds, not 250 ms.

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var nq = ss.getSheetByName(ns_getQueueSheetName_());
    if (!nq) return { success:false, error:'MISSING_QUEUE_SHEET' };

    var values = nq.getDataRange().getValues();
    if (!values || values.length < 2) {
      return {
        success:true,
        reserved:0,
        sentGroups:0,
        failedGroups:0,
        sentRows:0,
        failedRows:0,
        reset:0,
        processedGroups:0
      };
    }

    var policy = ns_currentEmailPermissions_();
    var suppressedCount = ns_suppressDisabledQueueRows_(nq, values, policy);
    values = nq.getDataRange().getValues();
    var resetCount = ns_resetStaleReserved_(nq, values);

    values = nq.getDataRange().getValues();
    var reservedCount = ns_reservePending_(nq, values);

    values = nq.getDataRange().getValues();
    var sendRes = ns_sendDueReserved_(nq, values) || {};

    return {
      success: true,
      reserved: reservedCount || 0,
      sentGroups: sendRes.sentGroups || 0,
      failedGroups: sendRes.failedGroups || 0,
      sentRows: sendRes.sentRows || 0,
      failedRows: sendRes.failedRows || 0,
      suppressed: suppressedCount || 0,
      reset: resetCount || 0,
      processedGroups: sendRes.processedGroups || 0
    };
  } catch (e) {
    return {
      success: false,
      error: String(e && e.message ? e.message : e)
    };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function NotificationSender_MergeLegacyQueue(deleteLegacyAfterMerge) {
  if (typeof NB_mergeLegacyQueueIntoPrimary_ === 'function') {
    return NB_mergeLegacyQueueIntoPrimary_(deleteLegacyAfterMerge === true);
  }
  return { success:false, message:'NB_mergeLegacyQueueIntoPrimary_ not available' };
}

/* ============================================================
 * Queue / config helpers
 * ============================================================ */

function ns_getTz_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss && ss.getSpreadsheetTimeZone) {
      var tz = String(ss.getSpreadsheetTimeZone() || '').trim();
      if (tz) return tz;
    }
  } catch (e) {}
  try {
    var tz2 = String(Session.getScriptTimeZone() || '').trim();
    if (tz2) return tz2;
  } catch (e2) {}
  return 'Europe/Amsterdam';
}

function ns_getQueueSheetName_() {
  if (typeof NotificationConfig_GetQueueSheetName === 'function') {
    return String(NotificationConfig_GetQueueSheetName() || 'Notification Queue').trim() || 'Notification Queue';
  }
  return 'Notification Queue';
}

function NotificationSender_ResolveDelivery(recipient) {
  return ns_resolveNotificationDelivery_(recipient);
}

function ns_resolveNotificationDelivery_(recipient) {
  var original = String(recipient || '').split(',').map(function(s) {
    return String(s || '').trim();
  }).filter(Boolean);

  var externalDelivery = null;

  try {
    if (typeof SYS_resolveNotificationRecipients_ === 'function') {
      var r = SYS_resolveNotificationRecipients_(original);
      var recipients = Array.isArray(r && r.recipients) ? r.recipients.map(function(x) {
        return String(x || '').trim();
      }).filter(Boolean) : [];

      externalDelivery = {
        mode: String((r && r.mode) || '').trim().toUpperCase() || 'UNKNOWN',
        send: !!(r && r.send && recipients.length),
        recipient: recipients.length ? recipients.join(',') : '',
        recipients: recipients,
        originalRecipients: Array.isArray(r && r.originalRecipients) ? r.originalRecipients : original,
        overridden: !!(r && r.overridden),
        source: 'SystemConfig',
        failClosed: false
      };

      return ns_applyNotificationSafetyOverride_(externalDelivery, original);
    }
  } catch (eSys) {
    return {
      mode: 'SYSTEM_CONFIG_ERROR',
      send: false,
      recipient: '',
      recipients: [],
      originalRecipients: original,
      overridden: false,
      source: 'SystemConfig',
      error: String(eSys && eSys.message ? eSys.message : eSys),
      failClosed: true
    };
  }

  var sheetResolved = ns_resolveNotificationDeliveryFromSystemConfigSheet_(original);
  if (sheetResolved && sheetResolved.resolved) {
    return ns_applyNotificationSafetyOverride_(sheetResolved.delivery, original);
  }

  return {
    mode: 'SYSTEM_CONFIG_RESOLVER_MISSING_FAIL_CLOSED',
    send: false,
    recipient: '',
    recipients: [],
    originalRecipients: original,
    overridden: false,
    source: 'FailClosedFallback',
    error: sheetResolved && sheetResolved.error ? sheetResolved.error : 'SYS_resolveNotificationRecipients_ missing and active environment could not be resolved safely.',
    failClosed: true
  };
}

function ns_applyNotificationSafetyOverride_(delivery, originalRecipients) {
  delivery = delivery || {};
  originalRecipients = Array.isArray(originalRecipients) ? originalRecipients : [];

  var testPolicy = ns_getNotificationTestPolicy_();

  if (testPolicy.mode === 'DRY_RUN') {
    return {
      mode: 'DRY_RUN',
      send: false,
      recipient: '',
      recipients: [],
      originalRecipients: delivery.originalRecipients || originalRecipients,
      overridden: false,
      source: (delivery.source || 'Unknown') + '+NotificationSenderSafetyOverride',
      failClosed: false,
      safetyOverride: true
    };
  }

  if (testPolicy.mode === 'TEST_TO_SELF') {
    if (!testPolicy.testEmail) {
      return {
        mode: 'TEST_TO_SELF_MISSING_TEST_EMAIL',
        send: false,
        recipient: '',
        recipients: [],
        originalRecipients: delivery.originalRecipients || originalRecipients,
        overridden: false,
        source: (delivery.source || 'Unknown') + '+NotificationSenderSafetyOverride',
        error: 'Test mode is active but no TEST_RECIPIENT / DEV_TEST_EMAIL is configured.',
        failClosed: true,
        safetyOverride: true
      };
    }

    return {
      mode: 'TEST_TO_SELF',
      send: true,
      recipient: testPolicy.testEmail,
      recipients: [testPolicy.testEmail],
      originalRecipients: delivery.originalRecipients || originalRecipients,
      overridden: true,
      source: (delivery.source || 'Unknown') + '+NotificationSenderSafetyOverride',
      failClosed: false,
      safetyOverride: true
    };
  }

  return delivery;
}

function ns_getNotificationTestPolicy_() {
  // DEV has one authoritative source: the active DEV column in System_Config.
  // No Notification_Settings TEST_MODE / TEST_RECIPIENT fallback in DEV.
  var env = typeof ns_resolveActiveEnv_ === 'function' ? ns_resolveActiveEnv_() : '';
  if (env === 'DEV') {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
    if (!sh) return { mode:'OFF', testEmail:'' };
    var rows = sh.getDataRange().getValues();
    var headers = rows.length ? rows[0] : [];
    var devCol = -1;
    for (var c=0;c<headers.length;c++) {
      if (String(headers[c]||'').trim().toUpperCase()==='DEV') { devCol=c; break; }
    }
    if (devCol<0) return { mode:'OFF', testEmail:'' };
    var settings={};
    for (var i=1;i<rows.length;i++) {
      var key=String(rows[i][0]||'').trim().toUpperCase();
      if(key)settings[key]=String(rows[i][devCol]==null?'':rows[i][devCol]).trim();
    }
    var mode=String(settings.DEV_NOTIFICATION_MODE||'OFF').toUpperCase();
    if (mode!=='TEST_TO_SELF'&&mode!=='DRY_RUN')mode='OFF';
    if (!ns_yesLike_(settings.SEND_NOTIFICATIONS))mode='OFF';
    return { mode:mode, testEmail:String(settings.DEV_TEST_EMAIL||'').trim() };
  }
  // Preserve existing non-DEV behavior; this change must not alter PROD.
  var mode = '';
  var testEmail = '';
  try {
    if (typeof NotificationConfig_GetSenderSettings === 'function') {
      var s = NotificationConfig_GetSenderSettings() || {};
      if (ns_yesLike_(s.TEST_MODE)) mode = 'TEST_TO_SELF';
      if (!testEmail) testEmail = String(s.TEST_RECIPIENT || '').trim();
    }
  } catch (eSettings) {}
  try {
    if (typeof NotificationConfig_GetSetting === 'function') {
      var explicitMode = String(NotificationConfig_GetSetting('DEV_NOTIFICATION_MODE', '') || NotificationConfig_GetSetting('NOTIFICATION_TEST_MODE', '') || '').trim().toUpperCase();
      var explicitTestMode = String(NotificationConfig_GetSetting('TEST_MODE', '') || '').trim().toUpperCase();
      if (explicitMode === 'TEST_TO_SELF' || explicitTestMode === 'YES' || explicitTestMode === 'TRUE') mode = 'TEST_TO_SELF';
      if (explicitMode === 'DRY_RUN') mode = 'DRY_RUN';
      if (!testEmail) testEmail = String(NotificationConfig_GetSetting('DEV_TEST_EMAIL', '') || NotificationConfig_GetSetting('TEST_RECIPIENT', '') || '').trim();
    }
  } catch (eCfg) {}
  var sheetPolicy = ns_getNotificationTestPolicyFromSystemConfigSheet_();
  if (sheetPolicy.mode) mode = sheetPolicy.mode;
  if (!testEmail && sheetPolicy.testEmail) testEmail = sheetPolicy.testEmail;
  return { mode:mode, testEmail:testEmail };
}

function ns_getNotificationTestPolicyFromSystemConfigSheet_() {
  var out = { mode:'', testEmail:'' };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('System_Config');
    if (!sh) return out;

    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return out;

    var headers = values[0] || [];
    var keyToRow = {};
    for (var r = 1; r < values.length; r++) {
      var key = String(values[r][0] || '').trim().toUpperCase();
      if (key) keyToRow[key] = values[r];
    }

    var modeRow = keyToRow.DEV_NOTIFICATION_MODE || keyToRow.NOTIFICATION_TEST_MODE || null;
    var emailRow = keyToRow.DEV_TEST_EMAIL || keyToRow.TEST_RECIPIENT || null;
    var sendRow = keyToRow.SEND_NOTIFICATIONS || null;

    var activeColumns = [];
    for (var c = 1; c < headers.length; c++) {
      var h = String(headers[c] || '').trim().toUpperCase();
      if (!h) continue;

      var colMode = modeRow ? String(modeRow[c] || '').trim().toUpperCase() : '';
      var colEmail = emailRow ? String(emailRow[c] || '').trim() : '';
      var colSend = sendRow ? String(sendRow[c] || '').trim().toUpperCase() : '';

      if ((colMode === 'TEST_TO_SELF' || colMode === 'DRY_RUN') && (colSend === 'TRUE' || colSend === 'YES' || colSend === '1' || colSend === 'Y')) {
        activeColumns.push({ header:h, mode:colMode, email:colEmail });
      }
    }

    if (activeColumns.length === 1) {
      out.mode = activeColumns[0].mode;
      out.testEmail = activeColumns[0].email || '';
      return out;
    }

    if (activeColumns.length > 1) {
      for (var i = 0; i < activeColumns.length; i++) {
        if (activeColumns[i].header === 'DEV') {
          out.mode = activeColumns[i].mode;
          out.testEmail = activeColumns[i].email || '';
          return out;
        }
      }
      out.mode = activeColumns[0].mode;
      out.testEmail = activeColumns[0].email || '';
      return out;
    }
  } catch (e) {}

  return out;
}

function ns_resolveNotificationDeliveryFromSystemConfigSheet_(originalRecipients) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('System_Config');
    if (!sh) return { resolved:false, error:'Missing System_Config sheet' };

    var env = ns_resolveActiveEnv_();
    if (!env) return { resolved:false, error:'Active environment could not be resolved' };

    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return { resolved:false, error:'System_Config has no data rows' };

    var headers = values[0] || [];
    var envCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').trim().toUpperCase() === env) {
        envCol = c;
        break;
      }
    }
    if (envCol < 0) return { resolved:false, error:'System_Config column not found for env=' + env };

    var map = {};
    for (var r = 1; r < values.length; r++) {
      var key = String(values[r][0] || '').trim().toUpperCase();
      if (!key) continue;
      map[key] = values[r][envCol];
    }

    var send = ns_yesLike_(map.SEND_NOTIFICATIONS);
    var mode = String(map.DEV_NOTIFICATION_MODE || '').trim().toUpperCase();
    var testEmail = String(map.DEV_TEST_EMAIL || '').trim();

    if (!send) {
      return {
        resolved:true,
        delivery:{
          mode: 'SYSTEM_CONFIG_OFF',
          send: false,
          recipient: '',
          recipients: [],
          originalRecipients: originalRecipients,
          overridden: false,
          source: 'System_Config sheet',
          failClosed: false
        }
      };
    }

    if (env === 'DEV') {
      if (mode === 'DRY_RUN') {
        return {
          resolved:true,
          delivery:{
            mode: 'DRY_RUN',
            send: false,
            recipient: '',
            recipients: [],
            originalRecipients: originalRecipients,
            overridden: false,
            source: 'System_Config sheet',
            failClosed: false
          }
        };
      }

      if (mode === 'TEST_TO_SELF') {
        if (!testEmail) {
          return {
            resolved:true,
            delivery:{
              mode: 'DEV_TEST_TO_SELF_MISSING_TEST_EMAIL',
              send: false,
              recipient: '',
              recipients: [],
              originalRecipients: originalRecipients,
              overridden: false,
              source: 'System_Config sheet',
              failClosed: true,
              error: 'DEV_TEST_EMAIL missing'
            }
          };
        }
        return {
          resolved:true,
          delivery:{
            mode: 'TEST_TO_SELF',
            send: true,
            recipient: testEmail,
            recipients: [testEmail],
            originalRecipients: originalRecipients,
            overridden: true,
            source: 'System_Config sheet',
            failClosed: false
          }
        };
      }
    }

    if (env === 'DEV') {
      return {
        resolved:true,
        delivery:{
          mode:'DEV_UNRECOGNIZED_MODE',
          send:false,
          recipient:'',
          recipients:[],
          originalRecipients:originalRecipients,
          overridden:false,
          source:'System_Config sheet',
          failClosed:true,
          error:'DEV_NOTIFICATION_MODE must be DRY_RUN or TEST_TO_SELF'
        }
      };
    }

    return {
      resolved:true,
      delivery:{
        mode: env,
        send: originalRecipients.length > 0,
        recipient: originalRecipients.join(','),
        recipients: originalRecipients,
        originalRecipients: originalRecipients,
        overridden: false,
        source: 'System_Config sheet',
        failClosed: false
      }
    };
  } catch (e) {
    return { resolved:false, error:String(e && e.message ? e.message : e) };
  }
}

function ns_resolveActiveEnv_() {
  if (typeof EnvironmentGuard_getRuntimeEnv !== 'function') {
    throw new Error(
      'EnvironmentGuard_getRuntimeEnv missing. ' +
      'NotificationSender requires EnvironmentGuardService.gs.'
    );
  }

  var env = String(EnvironmentGuard_getRuntimeEnv() || '').trim().toUpperCase();

  if (env !== 'DEV' && env !== 'PROD') {
    throw new Error(
      'Invalid runtime environment resolved by EnvironmentGuardService: ' + env
    );
  }

  return env;
}

function ns_yesLike_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'Y';
}

/* ============================================================
 * Reservation
 * ============================================================ */

// Legacy weekly queue envelopes are one pre-rendered overview per recipient.
// Their eligibility is derived only from the canonical event configuration.
function ns_isWeeklyPreRenderedEnvelope20_(eventCode, payload) {
  var key=String(eventCode||'').trim().toUpperCase();
  return (key==='WEEKLY_MANAGER_DIGEST'||key==='WEEKLY_AUDITOR_DIGEST') &&
    !!(payload&&payload.weeklyPreRendered);
}

function ns_currentEmailPermissions_() {
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notification_Config');
  if(!sh)throw new Error('NOTIFICATION_CONFIG_MISSING');
  var rows=sh.getDataRange().getValues();
  var headers=(rows[0]||[]).map(function(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');});
  var k=headers.indexOf('EVENTKEY'),a=headers.indexOf('ACTIVE'),e=headers.indexOf('SENDEMAIL'),l=headers.indexOf('LOGONLY');
  if(k<0||a<0||e<0||l<0)throw new Error('NOTIFICATION_CONFIG_SCHEMA');
  var result={};
  for(var i=1;i<rows.length;i++){
    var key=String(rows[i][k]||'').trim().toUpperCase();
    if(!key)continue;
    if(Object.prototype.hasOwnProperty.call(result,key))throw new Error('NOTIFICATION_CONFIG_DUPLICATE');
    result[key]=ns_yesLike_(rows[i][a])&&ns_yesLike_(rows[i][e])&&!ns_yesLike_(rows[i][l]);
  }
  // Composite weekly envelopes have legacy queue codes, not independent settings.
  // Allow only if at least one canonical family event is currently sendable.
  result.WEEKLY_MANAGER_DIGEST=[
    'WEEKLY_MANAGER_COMING_UP','WEEKLY_MANAGER_PENDING_PLANNING',
    'BIRTHDATE_CERTIFICATE_EMPTY','EXPIRY_ALERT'
  ].some(function(k){return result[k]===true;});
  result.WEEKLY_AUDITOR_DIGEST=[
    'WEEKLY_AUDITOR_COMING_UP','WEEKLY_AUDITOR_PENDING_PLANNING',
    'WEEKLY_AUDITOR_PENDING_ACCEPTANCE','WEEKLY_AUDITOR_PENDING_COMPLETION'
  ].some(function(k){return result[k]===true;});
  return result;
}
function ns_suppressDisabledQueueRows_(sheet,rows,policy){
  var n=0;
  for(var i=1;i<rows.length;i++){
    var status=String(rows[i][1]||'').trim();
    if(status!=='PENDING'&&status!=='RESERVED')continue;
    var event=String(rows[i][2]||'').trim().toUpperCase();
    if(policy[event]===true)continue;
    sheet.getRange(i+1,2).setValue('SENT_SUPPRESSED');
    sheet.getRange(i+1,10).setValue('Current notification configuration blocks email; no email sent');
    sheet.getRange(i+1,13).setValue('');
    n++;
  }
  return n;
}

function ns_reservePending_(nqSheet, values) {
  if (!values || values.length < 2) return 0;

  var touched = 0;
  // Rolling 5-minute windows group by original recipient and operational digest.
  // Reuse still-open reservations so cron execution boundaries cannot split a batch.
  var rollingWindows20 = {};
  function rollingKey20(recipient, group) {
    return String(recipient||'').trim().toLowerCase()+'|'+String(group||'').trim().toUpperCase();
  }
  function rollingEligible20(cfg) {
    var group=String(cfg.digestGroup||'').trim().toUpperCase();
    return cfg.consolidate!==false && Number(cfg.bufferMinutes)>0 &&
      (group==='AUDITOR_OPERATIONAL'||group==='MANAGER_APPROVAL'||group==='RICH_OPERATIONAL'||group==='MANAGER_APPROVAL_OPERATIONAL'||ns_isRollingExternalDigestGroup_(group));
  }
  for (var w=1;w<values.length;w++) {
    if(String(values[w][1]||'').trim()!=='RESERVED')continue;
    var prev=ns_parseReserved_(values[w][12]),prevCfg=prev&&prev.payload&&prev.payload.config||{};
    if(typeof NB_getEventConfig_==='function' && !ns_isWeeklyPreRenderedEnvelope20_(values[w][2],prev&&prev.payload)) {
      prevCfg=NB_getEventConfig_(String(values[w][2]||'').trim().toUpperCase())||prevCfg;
    }
    if(!prev||!rollingEligible20(prevCfg))continue;
    var prevDue=Number(prev.windowDueAtMs||0),prevStart=Number(prev.windowStartAtMs||0);
    if(!prevStart||!prevDue||!prev.groupKey)continue;
    var rk=rollingKey20(values[w][3],prevCfg.digestGroup);
    if(!rollingWindows20[rk])rollingWindows20[rk]=[];
    rollingWindows20[rk].push({start:prevStart,due:prevDue,groupKey:prev.groupKey,windowKey:prev.windowKey});
  }

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'PENDING') continue;

    var recipient = String(values[r][3] || '').trim();
    if (!recipient) continue;

    var reserved = ns_parseReserved_(values[r][12]);
    if (reserved && reserved.windowKey) continue;

    var reservedWrapper = ns_parseReserved_(values[r][12]);
    var payload = (reservedWrapper && reservedWrapper.payload) ? reservedWrapper.payload : {};
    var cfg = (payload && payload.config) ? payload.config : {};
    // Resolve every unreserved event against live Notification_Config.
    // Queue payload snapshots are delivery context, not routing/buffer authority.
    if(typeof NB_getEventConfig_==='function' && !ns_isWeeklyPreRenderedEnvelope20_(values[r][2],payload)) {
      cfg=NB_getEventConfig_(String(values[r][2]||'').trim().toUpperCase())||cfg;
    }

    if (cfg.sendEmail === false || cfg.logOnly === true) continue;

    var createdAtMs = ns_toMs_(values[r][0]);
    if (!createdAtMs) createdAtMs = Date.now();

    var reservation = ns_computeReservation_(r + 1, recipient, createdAtMs, cfg);
    if(rollingEligible20(cfg)){
      var bucketKey=rollingKey20(recipient,cfg.digestGroup),windows=rollingWindows20[bucketKey]||[];
      var matched=null;
      for(var wi=0;wi<windows.length;wi++){
        if(createdAtMs>=windows[wi].start&&createdAtMs<windows[wi].due){matched=windows[wi];break;}
      }
      if(!matched){
        var windowLength=Math.max(1,Number(cfg.bufferMinutes))*60000;
        matched={start:createdAtMs,due:createdAtMs+windowLength,
          windowKey:'ROLLING_'+String(r+1)+'_'+String(createdAtMs),
          groupKey:recipient.trim().toLowerCase()+'|'+String(cfg.digestGroup||'').trim().toUpperCase()+'|'+String(createdAtMs)};
        windows.push(matched);rollingWindows20[bucketKey]=windows;
      }
      reservation={windowKey:matched.windowKey,groupKey:matched.groupKey,
        windowStartAtMs:matched.start,windowDueAtMs:matched.due,rollingExternal:ns_isRollingExternalDigestGroup_(String(cfg.digestGroup||'').trim().toUpperCase())};
    }

    var newReserved = {
      payload: payload,
      windowKey: reservation.windowKey,
      groupKey: reservation.groupKey,
      rollingExternal: !!reservation.rollingExternal,
      windowStartAtMs: reservation.windowStartAtMs,
      windowStartAt: ns_isoCompact_(new Date(reservation.windowStartAtMs)),
      windowDueAtMs: reservation.windowDueAtMs,
      windowDueAt: ns_isoCompact_(new Date(reservation.windowDueAtMs)),
      reservedAtMs: Date.now(),
      reservedAt: ns_isoCompact_(new Date())
    };

    nqSheet.getRange(r + 1, 13).setValue(JSON.stringify(newReserved));
    nqSheet.getRange(r + 1, 2).setValue('RESERVED');
    touched++;
  }

  return touched;
}

function ns_computeReservation_(rowNo, recipient, createdAtMs, cfg) {
  cfg = cfg || {};

  var consolidate = cfg.consolidate !== false;
  var bufferMinutes = Number(cfg.bufferMinutes == null || cfg.bufferMinutes === '' ? NS_DEFAULT_CONSOLIDATION_MINUTES : cfg.bufferMinutes);
  if (!isFinite(bufferMinutes) || bufferMinutes < 0) bufferMinutes = NS_DEFAULT_CONSOLIDATION_MINUTES;

  var digestGroup = String(cfg.digestGroup || '').trim() || 'DEFAULT';
  var digestGroupKey = digestGroup.toUpperCase();
  var rollingExternal = ns_isRollingExternalDigestGroup_(digestGroupKey);

  if (!consolidate || bufferMinutes === 0) {
    return {
      windowKey: 'ROW_' + rowNo,
      groupKey: recipient + '|ROW_' + rowNo,
      windowStartAtMs: createdAtMs,
      windowDueAtMs: createdAtMs,
      rollingExternal: false
    };
  }

  var bufferMs = bufferMinutes * 60 * 1000;

  if (rollingExternal) {
    return {
      windowKey: 'ROLLING_' + digestGroupKey + '_' + String(createdAtMs) + '_' + String(rowNo),
      groupKey: recipient.trim().toLowerCase() + '|' + digestGroupKey + '|' + String(createdAtMs) + '|' + String(rowNo),
      windowStartAtMs: createdAtMs,
      windowDueAtMs: createdAtMs + bufferMs,
      rollingExternal: true
    };
  }

  var bucketMs = bufferMs;
  var windowStartAtMs = Math.floor(createdAtMs / bucketMs) * bucketMs;
  var windowDueAtMs = windowStartAtMs + bucketMs;
  var windowKey = 'W' + Math.floor(createdAtMs / bucketMs);

  return {
    windowKey: windowKey,
    groupKey: recipient + '|' + digestGroup + '|' + windowKey,
    windowStartAtMs: windowStartAtMs,
    windowDueAtMs: windowDueAtMs,
    rollingExternal: false
  };
}

function ns_isRollingExternalDigestGroup_(digestGroupKey) {
  digestGroupKey = String(digestGroupKey || '').trim().toUpperCase();
  return digestGroupKey.indexOf('ECAS') >= 0 || digestGroupKey.indexOf('CUSTOMER') >= 0 || digestGroupKey.indexOf('CLIENT') >= 0;
}

/* ============================================================
 * Sending
 * ============================================================ */

function ns_sendDueReserved_(nqSheet, values) {
  if (!values || values.length < 2) {
    return { processedGroups:0, sentGroups:0, failedGroups:0, sentRows:0, failedRows:0 };
  }

  var nowMs = Date.now();
  var allGroups = {};

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'RESERVED') continue;

    var recipient = String(values[r][3] || '').trim();
    if (!recipient) continue;

    var reserved = ns_parseReserved_(values[r][12]);
    if (!reserved || !reserved.windowKey) continue;

    var dueAtMs = Number(reserved.windowDueAtMs || 0);
    if (!dueAtMs) dueAtMs = ns_toMs_(reserved.windowDueAt);
    if (!dueAtMs) continue;

    var groupKey = String(reserved.groupKey || (recipient + '|' + reserved.windowKey)).trim();
    if (!allGroups[groupKey]) {
      allGroups[groupKey] = {
        recipient: recipient,
        rows: [],
        items: [],
        maxDueAtMs: 0,
        rollingExternal: !!reserved.rollingExternal
      };
    }

    if (dueAtMs > allGroups[groupKey].maxDueAtMs) allGroups[groupKey].maxDueAtMs = dueAtMs;
    if (reserved.rollingExternal) allGroups[groupKey].rollingExternal = true;

    allGroups[groupKey].rows.push(r + 1);
    allGroups[groupKey].items.push({
      rowIndex: r + 1,
      eventCode: String(values[r][2] || '').trim(),
      auditId: String(values[r][4] || '').trim(),
      company: String(values[r][5] || '').trim(),
      subject: String(values[r][6] || '').trim(),
      body: ns_normalizeBody_(values[r][7]),
      payload: (reserved && reserved.payload) ? reserved.payload : {}
    });
  }

  var keys = Object.keys(allGroups).filter(function(key) {
    var group = allGroups[key];
    if (!group || !group.items.length) return false;
    return group.maxDueAtMs && nowMs >= group.maxDueAtMs;
  });

  if (!keys.length) return { processedGroups:0, sentGroups:0, failedGroups:0, sentRows:0, failedRows:0 };

  var sentGroups = 0;
  var failedGroups = 0;
  var sentRows = 0;
  var failedRows = 0;

  for (var k = 0; k < keys.length; k++) {
    var group = allGroups[keys[k]];
    if (!group.items.length) continue;
    var livePolicy = ns_currentEmailPermissions_();
    var allowed = [];
    for (var pi=0;pi<group.items.length;pi++) {
      var item = group.items[pi];
      if (livePolicy[String(item.eventCode||'').trim().toUpperCase()] === true) {
        allowed.push(item);
      } else {
        nqSheet.getRange(item.rowIndex,2).setValue('SENT_SUPPRESSED');
        nqSheet.getRange(item.rowIndex,10).setValue('Current notification configuration blocks email; no email sent');
        nqSheet.getRange(item.rowIndex,13).setValue('');
      }
    }
    if (!allowed.length) continue;
    group.items = allowed;
    group.rows = allowed.map(function(item){return item.rowIndex;});

    var mail = null;
    var fromName = NS_DEFAULT_FROM_NAME;
    var delivery = null;

    try {
      // IMPORTANT:
      // Rendering is inside the try block. If a renderer fails, the group must
      // become FAILED instead of remaining silently stuck on RESERVED.
      mail = ns_buildDigestEmail_(group.recipient, group.items);
      fromName = mail.fromName || NS_DEFAULT_FROM_NAME;

      delivery = ns_resolveNotificationDelivery_(group.recipient);

      if (typeof NotificationDeliveryGuard_assertDeliveryAllowed !== 'function') {
        throw new Error(
          'NotificationDeliveryGuard_assertDeliveryAllowed missing. ' +
          'NotificationSender requires NotificationDeliveryGuard.gs.'
        );
      }

      NotificationDeliveryGuard_assertDeliveryAllowed({
        mode: delivery.mode,
        recipient: delivery.recipient,
        originalRecipients: delivery.originalRecipients || [],
        eventKey: group.items[0] ? group.items[0].eventCode : ''
      });

      var opt = { name: fromName };
      if (mail.htmlBody) opt.htmlBody = mail.htmlBody;
      if (mail.attachments && mail.attachments.length && delivery.send) opt.attachments = mail.attachments;

      var finalStatus = 'SENT';
      var deliveryNote = '';
      var sentStamp = ns_timestamp_();

      if (delivery.send) {
        var finalSubject = mail.subject;
        var finalBody = mail.body;

        if (delivery.overridden) {
          finalSubject = '[DEV TEST] ' + finalSubject;
          finalBody = 'DEV TEST_TO_SELF redirect.\nOriginal recipient(s): ' + delivery.originalRecipients.join(', ') + '\n\n' + finalBody;
          if (opt.htmlBody) {
            opt.htmlBody = '<div style="font-family:Arial,Helvetica,sans-serif;background:#fff8e1;border:1px solid #f5d26b;border-radius:8px;padding:10px;margin-bottom:14px"><b>DEV TEST_TO_SELF redirect</b><br>Original recipient(s): ' + ns_escapeHtml_(delivery.originalRecipients.join(', ')) + '</div>' + opt.htmlBody;
          }
          finalStatus = 'SENT_DEV_REDIRECT';
          deliveryNote = 'DEV TEST_TO_SELF: redirected to ' + delivery.recipient + '; original=' + delivery.originalRecipients.join(', ');
        }

        NS_sendEmailWithConfiguredIdentity_(delivery.recipient, finalSubject, finalBody, opt, { source: 'NotificationSender_RunDigest', deliveryMode: delivery.mode });
      } else {
        if (delivery.mode === 'DRY_RUN') {
          finalStatus = 'SENT_SIMULATED';
          deliveryNote = 'DEV DRY_RUN: email not sent; original=' + delivery.originalRecipients.join(', ');
        } else {
          finalStatus = 'SENT_SUPPRESSED';
          deliveryNote = 'Notifications OFF: email not sent; original=' + delivery.originalRecipients.join(', ');
        }
      }

      for (var i = 0; i < group.rows.length; i++) {
        var rr = group.rows[i];
        var attempts = Number(nqSheet.getRange(rr, 9).getValue() || 0);
        nqSheet.getRange(rr, 9).setValue(attempts + 1);
        nqSheet.getRange(rr, 2).setValue(finalStatus);
        nqSheet.getRange(rr, 12).setValue(sentStamp);
        nqSheet.getRange(rr, 10).setValue(deliveryNote);
        nqSheet.getRange(rr, 13).setValue('');
        sentRows++;
      }
      sentGroups++;
    } catch (e) {
      var err = String(e && e.message ? e.message : e);
      for (var j = 0; j < group.rows.length; j++) {
        var rrr = group.rows[j];
        var attemptsFail = Number(nqSheet.getRange(rrr, 9).getValue() || 0);
        nqSheet.getRange(rrr, 9).setValue(attemptsFail + 1);
        nqSheet.getRange(rrr, 10).setValue(err);
        nqSheet.getRange(rrr, 2).setValue('FAILED');
        nqSheet.getRange(rrr, 13).setValue('');
        failedRows++;
      }
      failedGroups++;
    }
  }

  return {
    processedGroups: keys.length,
    sentGroups: sentGroups,
    failedGroups: failedGroups,
    sentRows: sentRows,
    failedRows: failedRows
  };
}

/* ============================================================
 * Stale RESERVED reset
 * ============================================================ */

function ns_resetStaleReserved_(nqSheet, values) {
  var nowMs = Date.now();
  var maxAgeMs = NS_STALE_RESERVED_MINUTES * 60 * 1000;
  var reset = 0;

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'RESERVED') continue;

    var reserved = ns_parseReserved_(values[r][12]);
    if (!reserved) {
      nqSheet.getRange(r + 1, 2).setValue('PENDING');
      nqSheet.getRange(r + 1, 10).setValue('Reserved payload missing; reset to PENDING');
      nqSheet.getRange(r + 1, 13).setValue('');
      reset++;
      continue;
    }

    var refMs = Number(reserved.reservedAtMs || 0);
    if (!refMs) refMs = ns_toMs_(reserved.reservedAt);
    if (!refMs) refMs = ns_toMs_(values[r][0]);

    if (!refMs) continue;
    // Never reset a reservation while its configured digest window is still open.
    // The stale timeout applies after the later of reservation time and due time.
    var dueMs=Number(reserved.windowDueAtMs||0);
    if(!dueMs)dueMs=ns_toMs_(reserved.windowDueAt);
    var staleFromMs=Math.max(refMs,isFinite(dueMs)&&dueMs>0?dueMs:refMs);
    if ((nowMs-staleFromMs)<maxAgeMs) continue;

    nqSheet.getRange(r + 1, 2).setValue('PENDING');
    nqSheet.getRange(r + 1, 10).setValue('Stale RESERVED reset to PENDING at ' + ns_timestamp_());
    nqSheet.getRange(r + 1, 13).setValue('');
    reset++;
  }

  return reset;
}

/* ============================================================
 * Digest rendering
 * ============================================================ */

function ns_buildDigestEmail_(recipientEmail, items) {
  var attachments = ns_collectAttachments_(items);
  var rendered = null;
  var fromEmail = '';
  var fromName = '';

  if (items && items.length) {
    var p0 = items[0].payload || {};
    var cfg0 = p0.config || {};
    fromEmail = String(cfg0.fromEmail || '').trim();
    fromName = String(cfg0.fromName || '').trim();

    if (items.length === 1 && p0.weeklyPreRendered) {
      var w = p0.weeklyPreRendered || {};
      return {
        subject: String(w.subject || items[0].subject || 'Weekly audit overview'),
        body: String(w.body || items[0].body || 'See HTML version'),
        htmlBody: String(w.htmlBody || ''),
        attachments: attachments,
        fromEmail: fromEmail || NS_DEFAULT_FROM_EMAIL,
        fromName: String(w.fromName || fromName || NS_DEFAULT_FROM_NAME)
      };
    }
  }

  if (typeof NB_renderDigestEmail_ === 'function') {
    rendered = NB_renderDigestEmail_(recipientEmail, items);
  }

  if (!rendered) {
    rendered = ns_buildDigestEmailFallback_(recipientEmail, items);
  }

  return {
    subject: String(rendered && rendered.subject ? rendered.subject : '[Audit Planning] Notifications (' + items.length + ')'),
    body: String(rendered && rendered.body ? rendered.body : ''),
    htmlBody: String(rendered && rendered.htmlBody ? rendered.htmlBody : ''),
    attachments: attachments,
    fromEmail: fromEmail || NS_DEFAULT_FROM_EMAIL,
    fromName: fromName || NS_DEFAULT_FROM_NAME
  };
}

function ns_buildDigestEmailFallback_(recipientEmail, items) {
  var subject = '[Audit Planning] Notifications (' + (items ? items.length : 0) + ')';
  var lines = [];

  lines.push('Hello,');
  lines.push('');
  lines.push('You have ' + (items ? items.length : 0) + ' new notification(s):');
  lines.push('');

  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i] || {};
    var built = ns_buildSingleEventViaBuilder_(it);
    lines.push('------------------------------------------------------------');
    lines.push(built.body);
    lines.push('');
  }

  lines.push('------------------------------------------------------------');
  lines.push('This is an automated message from the Audit Planning System.');
  lines.push('');

  return {
    subject: subject,
    body: lines.join('\n')
  };
}

function ns_buildSingleEventViaBuilder_(it) {
  var p = it && it.payload ? it.payload : {};

  if (typeof NB_buildNotification_ === 'function') {
    return NB_buildNotification_(it.eventCode, {
      eventType: it.eventCode,
      type: it.eventCode,
      company: it.company,
      auditId: it.auditId,
      actor: p.actor || p.actorEmail || p.actorName || '',
      actorRole: p.actorRole || p.actorLabel || '',
      recipientRole: p.recipientRole || '',
      comment: p.comment || '',
      resultStatus: p.resultStatus || ''
    });
  }

  return {
    subject: String(it && it.subject ? it.subject : ''),
    body: String(it && it.body ? it.body : '')
  };
}

function ns_collectAttachments_(items) {
  var attachments = [];

  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i] || {};
    var p = it.payload || {};

    try {
      if (p.icsAttachments && p.icsAttachments.length) {
        for (var k = 0; k < p.icsAttachments.length; k++) {
          var a = p.icsAttachments[k] || {};
          if (!a.ics) continue;
          var fn = String(a.filename || ('audit_' + (it.auditId || 'unknown') + '_' + k + '.ics'));
          attachments.push(Utilities.newBlob(String(a.ics), 'text/calendar', fn));
        }
      }
    } catch (e) {}
  }

  return attachments;
}


function ns_escapeHtml_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
 * Utilities
 * ============================================================ */

function ns_normalizeBody_(v) {
  var s = String(v == null ? '' : v);
  if (!s) return '';
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return s;
}

function ns_parseReserved_(v) {
  if (!v) return null;
  try {
    if (typeof v === 'object') return v;
    return JSON.parse(String(v));
  } catch (e) {
    return { payload: { message: String(v) } };
  }
}

function ns_toMs_(v) {
  try {
    if (!v) return 0;
    if (v instanceof Date) return v.getTime();

    var s = String(v).trim();
    if (!s) return 0;

    var direct = new Date(s);
    if (!isNaN(direct.getTime())) return direct.getTime();

    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6] || 0),
        0
      ).getTime();
    }

    return 0;
  } catch (e) {
    return 0;
  }
}

function ns_isoCompact_(d) {
  return Utilities.formatDate(d, ns_getTz_(), "yyyy-MM-dd'T'HH:mm:ss");
}

function ns_timestamp_() {
  return Utilities.formatDate(new Date(), ns_getTz_(), 'yyyy-MM-dd HH:mm');
}

/* ============================================================
 * Sender identity governance
 * ============================================================ */

function NS_getConfiguredSenderIdentity_() {
  var settings = {};
  try {
    if (typeof NotificationConfig_GetSenderSettings === 'function') {
      settings = NotificationConfig_GetSenderSettings() || {};
    }
  } catch (e) {
    settings = {};
  }

  var fromEmail = String(
    settings.DEFAULT_FROM_EMAIL ||
    (typeof NotificationConfig_GetDefaultFromEmail === 'function' ? NotificationConfig_GetDefaultFromEmail() : '') ||
    NS_DEFAULT_FROM_EMAIL ||
    ''
  ).trim();

  var fromName = String(
    settings.DEFAULT_FROM_NAME ||
    (typeof NotificationConfig_GetDefaultFromName === 'function' ? NotificationConfig_GetDefaultFromName() : '') ||
    NS_DEFAULT_FROM_NAME ||
    ''
  ).trim();

  var replyTo = String(settings.DEFAULT_REPLY_TO || fromEmail || '').trim();

  return {
    fromEmail: fromEmail,
    fromName: fromName,
    replyTo: replyTo
  };
}

function NS_getAvailableGmailAliases_() {
  try {
    return (GmailApp.getAliases() || []).map(function(x) {
      return String(x || '').trim().toLowerCase();
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function NS_assertConfiguredSenderAliasAvailable_(fromEmail) {
  fromEmail = String(fromEmail || '').trim().toLowerCase();
  if (!fromEmail) return { ok: true, required: false, fromEmail: '' };

  var aliases = NS_getAvailableGmailAliases_();
  var primary = '';
  try {
    primary = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    primary = '';
  }

  if (primary && primary === fromEmail) {
    return { ok: true, required: true, fromEmail: fromEmail, matched: 'PRIMARY_ACCOUNT', aliases: aliases };
  }

  if (aliases.indexOf(fromEmail) >= 0) {
    return { ok: true, required: true, fromEmail: fromEmail, matched: 'GMAIL_SEND_AS_ALIAS', aliases: aliases };
  }

  return {
    ok: false,
    required: true,
    fromEmail: fromEmail,
    matched: '',
    aliases: aliases,
    primary: primary,
    error: 'Configured sender is not available as Gmail primary account or Send mail as alias: ' + fromEmail
  };
}

function NS_sendEmailWithConfiguredIdentity_(to, subject, body, options, context) {
  options = options || {};
  context = context || {};

  if (typeof NotificationMailGateway_SendEmail !== 'function') {
    throw new Error('NotificationMailGateway_SendEmail is missing. Add NotificationMailGateway.gs before sending notifications.');
  }

  return NotificationMailGateway_SendEmail(to, subject, body, options, context);
}

function RUN_NOTIFICATIONSENDER_SENDER_IDENTITY_DIAGNOSTICS() {
  var identity = NS_getConfiguredSenderIdentity_();
  var gatewayAvailable = (typeof NotificationMailGateway_SendEmail === 'function');
  var gatewayDiag = null;
  try {
    if (typeof RUN_NOTIFICATIONMAILGATEWAY_DIAGNOSTICS === 'function') gatewayDiag = RUN_NOTIFICATIONMAILGATEWAY_DIAGNOSTICS();
  } catch (e) {
    gatewayDiag = { ok:false, error:String(e && e.message ? e.message : e) };
  }
  var out = {
    ok: !!(gatewayAvailable && gatewayDiag && gatewayDiag.ok),
    build: NS_BUILD,
    identity: identity,
    transport: 'NotificationMailGateway',
    gatewayAvailable: gatewayAvailable,
    gatewayDiagnostics: gatewayDiag,
    recommendation: gatewayAvailable
      ? 'Sender identity is governed by NotificationMailGateway. Use Resend domain authentication for planning@agriqa.es.'
      : 'Add NotificationMailGateway.gs. Direct GmailApp sending is no longer the canonical transport.'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_NOTIFICATIONSENDER_ROLLING_EXTERNAL_DIGEST_DIAG() {
  var samples = [
    { digestGroup:'ECAS_OPERATIONAL', expected:true },
    { digestGroup:'CUSTOMER_OPERATIONAL', expected:true },
    { digestGroup:'CLIENT_OPERATIONAL', expected:true },
    { digestGroup:'MANAGER_WEEKLY', expected:false },
    { digestGroup:'DEFAULT', expected:false }
  ];
  var checks = [];
  for (var i = 0; i < samples.length; i++) {
    var sample = samples[i];
    var actual = ns_isRollingExternalDigestGroup_(sample.digestGroup);
    checks.push({
      digestGroup: sample.digestGroup,
      rollingExternal: actual,
      expected: sample.expected,
      ok: actual === sample.expected
    });
  }
  var ok = true;
  for (var j = 0; j < checks.length; j++) if (!checks[j].ok) ok = false;
  var out = {
    ok: ok,
    build: NS_BUILD,
    purpose: 'Verify ECAS/CUSTOMER/CLIENT digests use rolling quiet-window grouping instead of fixed clock buckets.',
    checks: checks
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
 * Trigger setup / dynamic schedule from NotificationConfig
 * ============================================================ */

function NotificationSender_SetupAllTriggers() {
  var deleted = NotificationSender_DeleteManagedTriggers();
  var digest = NotificationSender_SetupDigestTrigger10M();
  var weekly = NotificationSender_SetupWeeklyTriggersFromConfig();
  return {
    success: true,
    deleted: deleted,
    digest: digest,
    weekly: weekly
  };
}

function NotificationSender_DeleteManagedTriggers() {
  var managed = {
    'NotificationSender_RunDigest10M': true,
    'NotificationSenderV5_RunDigest10M': true,
    'runManagerWeeklyAlert': true,
    'runAuditorWeeklyAlert': true
  };

  var all = ScriptApp.getProjectTriggers();
  var removed = [];

  for (var i = 0; i < all.length; i++) {
    var fn = String(all[i].getHandlerFunction() || '').trim();
    if (!managed[fn]) continue;
    ScriptApp.deleteTrigger(all[i]);
    removed.push(fn);
  }

  return {
    success: true,
    removedCount: removed.length,
    removed: removed
  };
}

function NotificationSender_SetupDigestTrigger10M() {
  NotificationSender_DeleteTriggersByHandler_('NotificationSender_RunDigest10M');
  NotificationSender_DeleteTriggersByHandler_('NotificationSenderV5_RunDigest10M');

  var trigger = ScriptApp.newTrigger('NotificationSender_RunDigest10M')
    .timeBased()
    .everyMinutes(10)
    .create();

  return {
    success: true,
    handler: 'NotificationSender_RunDigest10M',
    triggerId: String(trigger.getUniqueId ? trigger.getUniqueId() : '')
  };
}

function NotificationSender_SetupWeeklyTriggersFromConfig() {
  var managerSchedule = ns_getWeeklyScheduleFromRules_('WEEKLY_MANAGER');
  var auditorSchedule = ns_getWeeklyScheduleFromRules_('WEEKLY_AUDITOR');
  var out = {
    success: true,
    manager: { created: false, reason: '' },
    auditor: { created: false, reason: '' }
  };

  NotificationSender_DeleteTriggersByHandler_('runManagerWeeklyAlert');
  NotificationSender_DeleteTriggersByHandler_('runAuditorWeeklyAlert');

  if (managerSchedule.active) {
    out.manager = NotificationSender_CreateWeeklyTrigger_('runManagerWeeklyAlert', managerSchedule);
  } else {
    out.manager = { success: true, created: false, reason: 'WEEKLY_MANAGER inactive or incomplete', schedule: managerSchedule };
  }

  if (auditorSchedule.active) {
    out.auditor = NotificationSender_CreateWeeklyTrigger_('runAuditorWeeklyAlert', auditorSchedule);
  } else {
    out.auditor = { success: true, created: false, reason: 'WEEKLY_AUDITOR inactive or incomplete', schedule: auditorSchedule };
  }

  return out;
}

function NotificationSender_CreateWeeklyTrigger_(handlerFunction, schedule) {
  var weekDay = ns_toWeekDayEnum_(schedule.day);
  var hour = Number(schedule.hour);

  if (!weekDay) {
    return { success: false, created: false, reason: 'Invalid weekday: ' + schedule.day, schedule: schedule };
  }
  if (!isFinite(hour) || hour < 0 || hour > 23) {
    return { success: false, created: false, reason: 'Invalid hour: ' + schedule.hour, schedule: schedule };
  }

  var trigger = ScriptApp.newTrigger(handlerFunction)
    .timeBased()
    .onWeekDay(weekDay)
    .atHour(hour)
    .create();

  return {
    success: true,
    created: true,
    handler: handlerFunction,
    day: schedule.day,
    hour: hour,
    triggerId: String(trigger.getUniqueId ? trigger.getUniqueId() : '')
  };
}

function NotificationSender_DeleteTriggersByHandler_(handlerFunction) {
  var all = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].getHandlerFunction() || '').trim() !== String(handlerFunction || '').trim()) continue;
    ScriptApp.deleteTrigger(all[i]);
    removed++;
  }
  return removed;
}

function ns_getWeeklyScheduleFromRules_(ruleKey) {
  var key = String(ruleKey || '').trim().toUpperCase();
  try {
    if (key === 'WEEKLY_MANAGER' && typeof NotificationConfig_GetWeeklyManagerConfig === 'function') {
      var m = NotificationConfig_GetWeeklyManagerConfig();
      var managerEnabled = ns_anyNotificationEventSendable_([
        'WEEKLY_MANAGER_PENDING_PLANNING',
        'WEEKLY_MANAGER_COMING_UP',
        'BIRTHDATE_CERTIFICATE_EMPTY',
        'EXPIRY_ALERT'
      ]);
      return {
        ruleKey:key,
        active:!!(m && m.schedule && m.schedule.active && managerEnabled),
        day:m.schedule.day,
        hour:m.schedule.hour,
        owner:'NotificationConfig',
        sendableEvents: managerEnabled
      };
    }
    if (key === 'WEEKLY_AUDITOR' && typeof NotificationConfig_GetWeeklyAuditorConfig === 'function') {
      var a = NotificationConfig_GetWeeklyAuditorConfig();
      var auditorEnabled = ns_anyNotificationEventSendable_([
        'WEEKLY_AUDITOR_COMING_UP',
        'WEEKLY_AUDITOR_PENDING_PLANNING',
        'WEEKLY_AUDITOR_PENDING_ACCEPTANCE',
        'WEEKLY_AUDITOR_PENDING_COMPLETION'
      ]);
      return {
        ruleKey:key,
        active:!!(a && a.schedule && a.schedule.active && auditorEnabled),
        day:a.schedule.day,
        hour:a.schedule.hour,
        owner:'NotificationConfig',
        sendableEvents: auditorEnabled
      };
    }
  } catch (e) {
    return { ruleKey:key, active:false, day:'', hour:'', error:String(e && e.message ? e.message : e), owner:'NotificationConfig' };
  }
  return { ruleKey:key, active:false, day:'', hour:'', owner:'NotificationConfig' };
}

function ns_anyNotificationEventSendable_(eventKeys) {
  if (typeof NotificationConfig_GetEvent !== 'function') return false;
  for (var i = 0; i < (eventKeys || []).length; i++) {
    var cfg = NotificationConfig_GetEvent(eventKeys[i]);
    if (cfg && cfg.active === true && cfg.sendEmail === true && cfg.logOnly !== true) return true;
  }
  return false;
}

function ns_findHeaderIndex_(headers, candidates) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    map[String(headers[i] || '').trim().toUpperCase()] = i;
  }
  for (var j = 0; j < candidates.length; j++) {
    var key = String(candidates[j] || '').trim().toUpperCase();
    if (map.hasOwnProperty(key)) return map[key];
  }
  return -1;
}

function ns_isYesLike_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'Y' || s === 'X';
}

function ns_isWeekdayName_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'SUNDAY' || s === 'MONDAY' || s === 'TUESDAY' || s === 'WEDNESDAY' || s === 'THURSDAY' || s === 'FRIDAY' || s === 'SATURDAY';
}

function ns_isHourValue_(v) {
  if (v === null || typeof v === 'undefined' || v === '') return false;
  var n = Number(v);
  return isFinite(n) && n >= 0 && n <= 23;
}

function ns_toWeekDayEnum_(dayName) {
  var d = String(dayName || '').trim().toUpperCase();
  if (d === 'SUNDAY') return ScriptApp.WeekDay.SUNDAY;
  if (d === 'MONDAY') return ScriptApp.WeekDay.MONDAY;
  if (d === 'TUESDAY') return ScriptApp.WeekDay.TUESDAY;
  if (d === 'WEDNESDAY') return ScriptApp.WeekDay.WEDNESDAY;
  if (d === 'THURSDAY') return ScriptApp.WeekDay.THURSDAY;
  if (d === 'FRIDAY') return ScriptApp.WeekDay.FRIDAY;
  if (d === 'SATURDAY') return ScriptApp.WeekDay.SATURDAY;
  return null;
}


/***********************************************************************
 * COMPATIBILITY WRAPPERS — config ownership centralized
 ***********************************************************************/

function NotificationSender_ClearCacheBridge_() {
  if (typeof NotificationConfig_ClearCache === 'function') return NotificationConfig_ClearCache();
  return { ok:true, service:'NotificationSender config consumer', owner:'NotificationConfig' };
}

function RUN_NOTIFICATIONSENDER_CACHE_CLEAR() {
  var out = NotificationSender_ClearCacheBridge_();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NOTIFICATIONSENDER_CACHE_HIT_TEST() {
  var started = new Date().getTime();
  var out = {
    ok:true,
    service:'NotificationSender config consumer',
    owner:'NotificationConfig',
    checks:{},
    errors:[],
    timestamp:new Date().toISOString()
  };
  try {
    var qn = ns_getQueueSheetName_();
    out.checks.queueName = { ok:!!qn, summary:{ queueSheetName:qn, owner:'NotificationConfig' } };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(qn);
    out.checks.queueSheetSmoke = { ok:!!sh, summary:{ queueSheetName:qn, exists:!!sh, lastRow:sh ? sh.getLastRow() : 0 } };
  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.message ? e.message : e));
  }
  out.durationMs = new Date().getTime() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_NOTIFICATIONSENDER_ENV_GUARD_TEST() {
  var sample = 'real.recipient@example.com';
  var out = {
    ok: true,
    build: NS_BUILD,
    sampleRecipient: sample,
    delivery: ns_resolveNotificationDelivery_(sample),
    systemConfigAvailable: (typeof SYS_resolveNotificationRecipients_ === 'function')
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_NOTIFICATION_DELIVERY_RESOLVE_TEST() {
  var out = NotificationSender_ResolveDelivery('planning@agriqa.es');
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/***********************************************************************
 * ENV HARDENING R8 — sender due diagnostics
 ***********************************************************************/

function RUN_NOTIFICATIONSENDER_DUE_RESERVED_DIAG() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nq = ss.getSheetByName(ns_getQueueSheetName_());
  if (!nq) throw new Error('Notification Queue sheet missing.');

  var values = nq.getDataRange().getValues();
  var nowMs = Date.now();
  var dueReserved = [];

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim();
    if (status !== 'RESERVED') continue;

    var reserved = ns_parseReserved_(values[r][12]);
    var dueAtMs = 0;
    if (reserved && reserved.windowDueAtMs) dueAtMs = Number(reserved.windowDueAtMs || 0);
    if (!dueAtMs && reserved && reserved.windowDueAt) dueAtMs = ns_toMs_(reserved.windowDueAt);

    if (dueAtMs && nowMs >= dueAtMs) {
      dueReserved.push({
        row: r + 1,
        type: String(values[r][2] || '').trim(),
        recipient: String(values[r][3] || '').trim(),
        auditId: String(values[r][4] || '').trim(),
        subject: String(values[r][6] || '').trim(),
        attempts: values[r][8],
        lastError: String(values[r][9] || '').trim(),
        windowDueAt: reserved ? String(reserved.windowDueAt || '') : '',
        groupKey: reserved ? String(reserved.groupKey || '') : ''
      });
    }
  }

  var out = {
    ok: true,
    build: NS_BUILD,
    queueSheet: nq.getName(),
    dueReservedCount: dueReserved.length,
    dueReserved: dueReserved
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/***********************************************************************
 * QUEUE ROBUSTNESS R9 — safe sender health diagnostic
 ***********************************************************************/

function RUN_NOTIFICATIONSENDER_QUEUE_ROBUSTNESS_SMOKE() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nq = ss.getSheetByName(ns_getQueueSheetName_());

  var out = {
    ok: true,
    build: NS_BUILD,
    queueSheet: ns_getQueueSheetName_(),
    sheetFound: !!nq,
    generatedAt: new Date().toISOString(),
    counts: {
      pending: 0,
      reserved: 0,
      dueReserved: 0,
      failed: 0,
      sent: 0,
      sentDevRedirect: 0,
      sentSimulated: 0,
      sentSuppressed: 0,
      auditTrail: 0,
      other: 0
    },
    oldestDueReserved: null,
    failedRows: [],
    warnings: []
  };

  if (!nq) {
    out.ok = false;
    out.warnings.push('Notification Queue sheet missing.');
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  var values = nq.getDataRange().getValues();
  if (!values || values.length < 2) {
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  var nowMs = Date.now();

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim().toUpperCase();
    var reserved = ns_parseReserved_(values[r][12]);
    var dueAtMs = 0;

    if (reserved && reserved.windowDueAtMs) dueAtMs = Number(reserved.windowDueAtMs || 0);
    if (!dueAtMs && reserved && reserved.windowDueAt) dueAtMs = ns_toMs_(reserved.windowDueAt);

    if (status === 'PENDING') out.counts.pending++;
    else if (status === 'RESERVED') {
      out.counts.reserved++;
      if (dueAtMs && nowMs >= dueAtMs) {
        out.counts.dueReserved++;
        var item = {
          row: r + 1,
          eventType: String(values[r][2] || '').trim(),
          recipient: String(values[r][3] || '').trim(),
          auditId: String(values[r][4] || '').trim(),
          subject: String(values[r][6] || '').trim(),
          attempts: Number(values[r][8] || 0),
          lastError: String(values[r][9] || '').trim(),
          windowDueAt: reserved ? String(reserved.windowDueAt || '') : ''
        };
        if (!out.oldestDueReserved) out.oldestDueReserved = item;
      }
    }
    else if (status === 'FAILED') {
      out.counts.failed++;
      out.failedRows.push({
        row: r + 1,
        eventType: String(values[r][2] || '').trim(),
        recipient: String(values[r][3] || '').trim(),
        auditId: String(values[r][4] || '').trim(),
        subject: String(values[r][6] || '').trim(),
        attempts: Number(values[r][8] || 0),
        lastError: String(values[r][9] || '').trim()
      });
    }
    else if (status === 'SENT') out.counts.sent++;
    else if (status === 'SENT_DEV_REDIRECT') out.counts.sentDevRedirect++;
    else if (status === 'SENT_SIMULATED') out.counts.sentSimulated++;
    else if (status === 'SENT_SUPPRESSED') out.counts.sentSuppressed++;
    else if (status === 'AUDIT_TRAIL') out.counts.auditTrail++;
    else out.counts.other++;
  }

  if (out.counts.dueReserved > 0) {
    out.ok = false;
    out.warnings.push('Due RESERVED rows exist. Run NotificationSender_RunDigest10M; if still due, check renderer/gateway errors.');
  }

  if (out.counts.failed > 0) {
    out.ok = false;
    out.warnings.push('FAILED rows exist. Review failedRows[].');
  }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
