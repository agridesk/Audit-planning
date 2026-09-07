// FILE: StatusNotificationBridge.gs
// BUILD: 2026-07-10_STATUS_NOTIFICATION_BRIDGE_R15_QUEUE_TX_DIAGNOSTICS
// PURPOSE:
//   Centralized notification dispatch bridge for StatusMachine.
//   Queue-only: maps successful canonical status transitions to notification events.
//
// R10 FIX:
//   MPS number is no longer read from Audit planning.
//   Audit planning.Company_UID is the link key; Companies.Number is the canonical MPS source.
//   Audit planning number scans are only retained as last-resort diagnostics fallback.
//   Lifecycle transition still succeeds; notification defect becomes visible in Executions.
//
// R11 FIX:
//   AUDIT_ACCEPTED now loads canonical audit briefing before queueing.
//   Internal AUDIT_ACCEPTED and ECAS queues are isolated; one queue failure/dedup cannot block the other.
//   This fixes audit-context dependent failures where Lifecycle trail had empty company/auditNumber.
//
// R12 FIX:
//   Serializes Notification Queue writes with ScriptLock.
//
// R13 FIX:
//   Queue lock wait reduced from 60 seconds to 5 seconds.
//   User actions are never held for a long queue wait.
//   If the lock cannot be acquired, the lifecycle action still succeeds and the
//   AcceptedNotificationReconciler background trigger repairs the missing side-effect.
//
// R14 FIX:
//   Canonical recipient resolution.
//   - Manager notifications are resolved from the active Role=Manager row in Auditors.
//   - Session.getActiveUser() is never used for system notification recipients.
//   - ECAS recipient is resolved independently:
//       Script Property ECAS_DEFAULT_EMAIL, otherwise active Manager in Auditors.
//   - Reconciler/manual executions therefore cannot redirect mails to the executor.
//
// R15 FIX:
//   Adds queue transaction diagnostics around the central locked queue write.
//   Events: QUEUE_TX_BEGIN, QUEUE_TX_LOCKED, QUEUE_TX_RETURN,
//   QUEUE_TX_COMMITTED and QUEUE_TX_FINISHED.
//   Captures txId, waitMs, queueMs, totalMs and the complete queue result.
//   No functional change to routing, recipients, status flow or queue semantics.
//
// SAFE:
// - queue-only
// - notification failure never blocks lifecycle transition
// - no status writes
// - no planning writes

// Diagnostics_Log writer used for notification RCA. Safe: best-effort only.
function StatusNotificationBridge_Diag_(eventType, auditId, action, actor, beforeStatus, afterStatus, ok, message, details) {
  try {
    if (typeof Diagnostics_Log_ === 'function') {
      return Diagnostics_Log_(
        'StatusBridge',
        String(eventType || ''),
        String(auditId || ''),
        String(action || ''),
        String(actor || ''),
        String(beforeStatus || ''),
        String(afterStatus || ''),
        ok,
        String(message || ''),
        typeof details === 'string' ? details : JSON.stringify(details || {})
      );
    }
  } catch (e0) {}

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) ss = SpreadsheetApp.getActive();
    if (!ss) return null;
    var sh = ss.getSheetByName('Diagnostics_Log');
    if (!sh) return null;
    sh.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      'StatusBridge',
      String(eventType || ''),
      String(auditId || ''),
      String(action || ''),
      String(actor || ''),
      String(beforeStatus || ''),
      String(afterStatus || ''),
      ok,
      String(message || ''),
      typeof details === 'string' ? details : JSON.stringify(details || {})
    ]);
  } catch (e1) {}
  return null;
}


/**
 * Serializes the queue writer's duplicate-check + append operation.
 *
 * WHY:
 * NB_queueNotification_ performs a read/check/write sequence. Without a lock,
 * rapid consecutive web-app executions can overlap and lose notification rows.
 *
 * The lock is held only around NB_queueNotification_, not around briefing loads.
 */
function StatusNotificationBridge_QueueWithLock_(recipientEmail, eventCode, queuePayload, auditId) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  var txStarted = new Date().getTime();
  var waitStarted = txStarted;
  var txId = Utilities.getUuid();
  var action = queuePayload && queuePayload.action ? String(queuePayload.action) : '';
  var actorRole = queuePayload && queuePayload.actorRole ? String(queuePayload.actorRole) : '';
  var result = null;
  var queueStarted = 0;

  StatusNotificationBridge_Diag_('QUEUE_TX_BEGIN', auditId || '', action, actorRole, '', '', true, '', {
    txId: txId,
    recipient: recipientEmail || '',
    eventCode: eventCode || '',
    startedAt: new Date(txStarted).toISOString()
  });

  try {
    acquired = lock.tryLock(5000);
    var waitMs = new Date().getTime() - waitStarted;

    StatusNotificationBridge_Diag_(
      acquired ? 'QUEUE_TX_LOCKED' : 'QUEUE_LOCK_TIMEOUT_R15',
      auditId || '', action, actorRole, '', '', acquired,
      acquired ? '' : 'Notification Queue lock not acquired within 5 seconds; background reconciler must repair the notification.',
      { txId: txId, recipient: recipientEmail || '', eventCode: eventCode || '', waitMs: waitMs }
    );

    if (!acquired) {
      result = {
        success: false,
        retryable: true,
        reason: 'QUEUE_LOCK_TIMEOUT_RECONCILER_FALLBACK',
        bufferedBy: 'AcceptedNotificationReconciler',
        recipient: String(recipientEmail || '').trim(),
        eventType: String(eventCode || '').trim(),
        auditId: String(auditId || '').trim(),
        txId: txId,
        waitMs: waitMs
      };

      StatusNotificationBridge_Diag_('QUEUE_TX_FINISHED', auditId || '', action, actorRole, '', '', false,
        'Queue transaction deferred to reconciler.', {
          txId: txId,
          recipient: recipientEmail || '',
          eventCode: eventCode || '',
          totalMs: new Date().getTime() - txStarted,
          result: result
        });
      return result;
    }

    queueStarted = new Date().getTime();
    result = NB_queueNotification_(recipientEmail, eventCode, queuePayload);
    var queueMs = new Date().getTime() - queueStarted;

    StatusNotificationBridge_Diag_('QUEUE_TX_RETURN', auditId || '', action, actorRole, '', '',
      !!(result && result.success !== false), '', {
        txId: txId,
        recipient: recipientEmail || '',
        eventCode: eventCode || '',
        queueMs: queueMs,
        result: result || null
      });

    var committed = !!(result && result.success === true && result.skipped !== true);

    if (committed) {
      StatusNotificationBridge_Diag_('QUEUE_TX_COMMITTED', auditId || '', action, actorRole, '', '', true, '', {
        txId: txId,
        recipient: recipientEmail || '',
        eventCode: eventCode || '',
        queueRow: result.queueRow || result.row || result.rowNumber || '',
        hash: result.hash || result.payloadHash || result.queueHash || '',
        status: result.status || '',
        queueMs: queueMs
      });
    }

    StatusNotificationBridge_Diag_('QUEUE_TX_FINISHED', auditId || '', action, actorRole, '', '',
      !!(result && result.success !== false), '', {
        txId: txId,
        recipient: recipientEmail || '',
        eventCode: eventCode || '',
        totalMs: new Date().getTime() - txStarted,
        committed: committed,
        skipped: !!(result && result.skipped === true),
        duplicate: !!(result && (result.duplicate === true || result.reason === 'DUPLICATE_QUEUE_ROW' || result.duplicateRow)),
        result: result || null
      });

    return result;

  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    result = {
      success: false,
      retryable: true,
      reason: 'QUEUE_WRITE_ERROR',
      error: msg,
      recipient: String(recipientEmail || '').trim(),
      eventType: String(eventCode || '').trim(),
      auditId: String(auditId || '').trim(),
      txId: txId
    };

    StatusNotificationBridge_Diag_('QUEUE_TX_RETURN', auditId || '', action, actorRole, '', '', false, msg, {
      txId: txId,
      recipient: recipientEmail || '',
      eventCode: eventCode || '',
      queueMs: queueStarted ? new Date().getTime() - queueStarted : 0,
      result: result
    });

    StatusNotificationBridge_Diag_('QUEUE_TX_FINISHED', auditId || '', action, actorRole, '', '', false, msg, {
      txId: txId,
      recipient: recipientEmail || '',
      eventCode: eventCode || '',
      totalMs: new Date().getTime() - txStarted,
      committed: false,
      result: result
    });

    return result;
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (eRelease) {}
    }
  }
}

function StatusNotificationBridge_Dispatch_(action, actor, ctx, payload, result) {
  try {
    action = Status_normalizeAction_(action);
    actor = Status_normalizeRole_(actor);

    if (!ctx || !ctx.auditId) return;
    if (!result || result.success !== true) return;

    if (typeof NB_queueNotification_ !== 'function') {
      Logger.log('[STATUS_NOTIFY][SKIP] NB_queueNotification_ unavailable');
      return {
        success: true,
        skipped: true,
        reason: 'NB_QUEUE_UNAVAILABLE'
      };
    }

    var beforeStatus = Status_normalizeStatus_(result.beforeStatus || (ctx && ctx.status) || '');
    var afterStatus = Status_normalizeStatus_(result.afterStatus || result.newStatus || result.afterStatusDisplay || '');

    var eventCode = StatusNotificationBridge_MapEvent_(action, actor, beforeStatus, afterStatus);
    if (!eventCode) {
      Logger.log('[STATUS_NOTIFY][SKIP] No mapped event for action=' + action + ' actor=' + actor);
      return {
        success: true,
        skipped: true,
        reason: 'NO_EVENT_MAPPED'
      };
    }

    var recipient = StatusNotificationBridge_ResolveRecipient_(action, actor, ctx, payload);
    if (!recipient || !recipient.email) {
      Logger.log('[STATUS_NOTIFY][SKIP] No recipient resolved');
      return {
        success: true,
        skipped: true,
        reason: 'NO_RECIPIENT'
      };
    }

    var auditId = String(ctx.auditId || '').trim();

    /*
     * R11 structural fix:
     * AUDIT_ACCEPTED may not rely on StatusMachine ctx.row for company/number/scope context.
     * Some lifecycle rows can have empty company/auditNumber even though the audit row itself is valid.
     *
     * Therefore:
     * 1. load canonical audit briefing by auditId before queueing AUDIT_ACCEPTED;
     * 2. enrich the internal AUDIT_ACCEPTED payload with the same robust context used for ECAS;
     * 3. isolate internal queueing and ECAS queueing so failure/dedup of one cannot block the other.
     */
    var acceptBriefing = null;
    if (eventCode === 'AUDIT_ACCEPTED') {
      acceptBriefing = StatusNotificationBridge_LoadEcasAuditBriefing_(auditId);

      StatusNotificationBridge_Diag_('ACCEPT_BRIEFING_LOADED_R11', auditId, action, actor, beforeStatus, afterStatus, true, '', {
        company: acceptBriefing && acceptBriefing.company,
        companyUid: acceptBriefing && acceptBriefing.companyUid,
        mpsNumber: acceptBriefing && acceptBriefing.mpsNumber,
        scopes: acceptBriefing && acceptBriefing.scopes ? acceptBriefing.scopes : [],
        scopesCount: acceptBriefing && acceptBriefing.scopes ? acceptBriefing.scopes.length : 0,
        blocks: acceptBriefing && acceptBriefing.blocks ? acceptBriefing.blocks.length : 0,
        auditorEmail: acceptBriefing && acceptBriefing.auditorEmail,
        auditorName: acceptBriefing && acceptBriefing.auditorName,
        plannedHours: acceptBriefing && acceptBriefing.plannedHours
      });
    }

    var queuePayload = {
      auditId: auditId,
      action: action,
      actorRole: actor,
      actorEmail: String((payload && payload.actorEmail) || '').trim(),
      recipientRole: recipient.role || '',
      recipientEmail: recipient.email || '',
      company: (acceptBriefing && acceptBriefing.company) || StatusNotificationBridge_GetCompany_(ctx),
      resultStatus: result.afterStatusDisplay || result.newStatus || '',
      comment: String((payload && payload.comment) || '').trim(),
      config: {
        consolidate: true,
        bufferMinutes: 10
      }
    };

    if (acceptBriefing) {
      queuePayload.companyUid = acceptBriefing.companyUid || '';
      queuePayload.mpsNumber = StatusNotificationBridge_NormalizeMpsNumber_(acceptBriefing.mpsNumber || '');
      queuePayload.auditNumber = queuePayload.mpsNumber;
      queuePayload.scopes = acceptBriefing.scopes || [];
      queuePayload.blocks = acceptBriefing.blocks || [];
      queuePayload.plannedDates = acceptBriefing.plannedDates || [];
      queuePayload.plannedHours = acceptBriefing.plannedHours;
      queuePayload.planningJson = acceptBriefing.planningJson || '';
      queuePayload.auditorEmail = acceptBriefing.auditorEmail || '';
      queuePayload.auditorName = acceptBriefing.auditorName || '';
      queuePayload.skipAuditBriefing = true;
    }

    var queueResult = null;
    try {
      queueResult = StatusNotificationBridge_QueueWithLock_(
        recipient.email,
        eventCode,
        queuePayload,
        auditId
      );
    } catch (eQueue) {
      var qMsg = String(eQueue && eQueue.message ? eQueue.message : eQueue);
      Logger.log('[STATUS_NOTIFY][QUEUE_ERROR] ' + qMsg);
      StatusNotificationBridge_Diag_('STATUS_BRIDGE_QUEUE_ERROR_R11', auditId, action, actor, beforeStatus, afterStatus, false, qMsg, {
        recipient: recipient.email,
        eventCode: eventCode,
        queuePayload: queuePayload,
        error: qMsg
      });
      queueResult = {
        success: false,
        error: qMsg,
        eventType: eventCode,
        recipient: recipient.email,
        auditId: auditId
      };
    }

    var externalQueueResult = null;
    if (eventCode === 'AUDIT_ACCEPTED') {
      StatusNotificationBridge_Diag_('ECAS_DISPATCH_BRANCH_ENTER', auditId, action, actor, beforeStatus, afterStatus, true, '', {
        recipient: recipient.email,
        eventCode: eventCode,
        queueResult: queueResult || null
      });

      try {
        externalQueueResult = StatusNotificationBridge_QueueAcceptedExternalDigest_(recipient.email, queuePayload);
      } catch (eExternal) {
        var eMsg = String(eExternal && eExternal.message ? eExternal.message : eExternal);
        Logger.log('[STATUS_NOTIFY][EXTERNAL_QUEUE_CALL_ERROR] ' + eMsg);
        StatusNotificationBridge_Diag_('ECAS_DISPATCH_CALL_ERROR_R11', auditId, action, actor, beforeStatus, afterStatus, false, eMsg, {
          recipient: recipient.email,
          error: eMsg
        });
        externalQueueResult = null;
      }

      StatusNotificationBridge_Diag_('ECAS_DISPATCH_BRANCH_AFTER', auditId, action, actor, beforeStatus, afterStatus, !!externalQueueResult, '', {
        recipient: recipient.email,
        externalQueueResult: externalQueueResult || null
      });
    }

    Logger.log(JSON.stringify({
      ok: true,
      type: 'STATUS_NOTIFICATION_DISPATCHED',
      build: '2026-07-10_STATUS_NOTIFICATION_BRIDGE_R15_QUEUE_TX_DIAGNOSTICS',
      auditId: auditId,
      action: action,
      actor: actor,
      eventCode: eventCode,
      recipient: recipient.email,
      queueResult: queueResult,
      externalEventCode: externalQueueResult ? 'ECAS_AUDIT_APPROVAL_DIGEST' : '',
      externalQueueResult: externalQueueResult
    }));

    return {
      success: true,
      queueResult: queueResult || null,
      externalQueueResult: externalQueueResult || null
    };

  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    Logger.log('[STATUS_NOTIFY][ERROR] ' + msg);
    try {
      StatusNotificationBridge_Diag_('STATUS_BRIDGE_ERROR', (ctx && ctx.auditId) || '', action || '', actor || '', '', '', false, msg, { error: msg });
    } catch (eDiag) {}
    return null;
  }
}

function StatusNotificationBridge_QueueAcceptedExternalDigest_(recipientEmail, queuePayload) {
  var auditId = '';
  try {
    if (typeof NB_queueNotification_ !== 'function') {
      StatusNotificationBridge_Diag_('ECAS_NB_QUEUE_MISSING', '', 'ACCEPT', 'AUDITOR', '', '', false, 'NB_queueNotification_ unavailable', {});
      return null;
    }

    var passedRecipientEmail = String(recipientEmail || '').trim();
    recipientEmail = StatusNotificationBridge_GetEcasRecipientEmail_();

    StatusNotificationBridge_Diag_(
      'ECAS_RECIPIENT_RESOLVED_R14',
      '',
      'ACCEPT',
      'AUDITOR',
      '',
      '',
      !!recipientEmail,
      recipientEmail ? '' : 'Canonical ECAS recipient could not be resolved.',
      {
        passedRecipientEmail: passedRecipientEmail,
        canonicalRecipientEmail: recipientEmail,
        source: PropertiesService.getScriptProperties().getProperty('ECAS_DEFAULT_EMAIL')
          ? 'SCRIPT_PROPERTY_ECAS_DEFAULT_EMAIL'
          : 'AUDITORS_ACTIVE_MANAGER'
      }
    );

    if (!recipientEmail) {
      StatusNotificationBridge_Diag_('ECAS_RECIPIENT_MISSING', '', 'ACCEPT', 'AUDITOR', '', '', false, 'Canonical ECAS recipient missing', {});
      return null;
    }

    queuePayload = queuePayload || {};
    auditId = String(queuePayload.auditId || '').trim();
    if (!auditId) {
      StatusNotificationBridge_Diag_('ECAS_AUDITID_MISSING', '', 'ACCEPT', 'AUDITOR', '', '', false, 'auditId missing', { recipient: recipientEmail });
      return null;
    }

    StatusNotificationBridge_Diag_('ECAS_ENTER', auditId, 'ACCEPT', 'AUDITOR', '', '', true, '', {
      recipient: recipientEmail,
      queuePayload: queuePayload
    });

    var briefing = StatusNotificationBridge_LoadEcasAuditBriefing_(auditId);

    StatusNotificationBridge_Diag_('ECAS_BRIEFING', auditId, 'ACCEPT', 'AUDITOR', '', '', true, '', {
      briefingFound: !!briefing,
      company: briefing && briefing.company,
      mpsNumber: briefing && briefing.mpsNumber,
      auditorEmail: briefing && briefing.auditorEmail,
      auditorName: briefing && briefing.auditorName,
      scopes: briefing && briefing.scopes ? briefing.scopes : [],
      blocks: briefing && briefing.blocks ? briefing.blocks.length : 0,
      plannedHours: briefing && briefing.plannedHours
    });

    var externalPayload = {};
    var k;
    for (k in queuePayload) {
      if (Object.prototype.hasOwnProperty.call(queuePayload, k)) externalPayload[k] = queuePayload[k];
    }

    // ECAS canonical payload. Do not use actorEmail/session user as auditor.
    externalPayload.eventType = 'ECAS_AUDIT_APPROVAL_DIGEST';
    externalPayload.type = 'ECAS_AUDIT_APPROVAL_DIGEST';
    externalPayload.auditId = auditId;
    externalPayload.company = briefing.company || externalPayload.company || '';
    externalPayload.mpsNumber = StatusNotificationBridge_NormalizeMpsNumber_(briefing.mpsNumber || externalPayload.mpsNumber || externalPayload.auditNumber || '');
    externalPayload.auditNumber = externalPayload.mpsNumber;
    externalPayload.scopes = briefing.scopes || [];
    externalPayload.blocks = briefing.blocks || [];
    externalPayload.plannedDates = briefing.plannedDates || [];
    externalPayload.plannedHours = briefing.plannedHours;
    externalPayload.planningJson = briefing.planningJson || '';
    externalPayload.auditorEmail = briefing.auditorEmail || '';
    externalPayload.auditorName = briefing.auditorName || '';
    externalPayload.recipientRole = 'PLANNING';
    externalPayload.recipientEmail = recipientEmail;
    externalPayload.resultStatus = 'Accepted';
    externalPayload.skipAuditBriefing = true;
    externalPayload.config = {
      consolidate: true,
      bufferMinutes: 10,
      digestGroup: 'ECAS_OPERATIONAL',
      templateFamily: 'EXTERNAL_OPERATIONAL'
    };

    StatusNotificationBridge_Diag_('ECAS_ASSERT_BEFORE', auditId, 'ACCEPT', 'AUDITOR', '', '', true, '', {
      auditId: externalPayload.auditId,
      company: externalPayload.company,
      mpsNumber: externalPayload.mpsNumber,
      auditorEmail: externalPayload.auditorEmail,
      auditorName: externalPayload.auditorName,
      scopesCount: externalPayload.scopes ? externalPayload.scopes.length : 0,
      blocksCount: externalPayload.blocks ? externalPayload.blocks.length : 0,
      plannedHours: externalPayload.plannedHours
    });

    StatusNotificationBridge_AssertEcasBriefingComplete_(externalPayload);

    StatusNotificationBridge_Diag_('ECAS_QUEUE_BEFORE', auditId, 'ACCEPT', 'AUDITOR', '', '', true, '', {
      recipient: recipientEmail,
      eventCode: 'ECAS_AUDIT_APPROVAL_DIGEST'
    });

    var res = StatusNotificationBridge_QueueWithLock_(
      recipientEmail,
      'ECAS_AUDIT_APPROVAL_DIGEST',
      externalPayload,
      auditId
    );

    StatusNotificationBridge_Diag_('ECAS_QUEUE_AFTER', auditId, 'ACCEPT', 'AUDITOR', '', '', !!(res && res.success !== false), '', {
      recipient: recipientEmail,
      eventCode: 'ECAS_AUDIT_APPROVAL_DIGEST',
      queueResult: res || null
    });

    Logger.log(JSON.stringify({
      ok: true,
      type: 'STATUS_NOTIFICATION_EXTERNAL_DIGEST_QUEUED',
      build: '2026-07-10_STATUS_NOTIFICATION_BRIDGE_R15_QUEUE_TX_DIAGNOSTICS',
      auditId: externalPayload.auditId || '',
      eventCode: 'ECAS_AUDIT_APPROVAL_DIGEST',
      recipient: recipientEmail,
      briefing: {
        company: externalPayload.company,
        mpsNumber: externalPayload.mpsNumber,
        auditorEmail: externalPayload.auditorEmail,
        auditorName: externalPayload.auditorName,
        scopes: externalPayload.scopes,
        blocks: externalPayload.blocks.length,
        plannedHours: externalPayload.plannedHours
      },
      queueResult: res
    }));

    return res;
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    Logger.log('[STATUS_NOTIFY][EXTERNAL_DIGEST_ERROR] ' + msg);
    StatusNotificationBridge_Diag_('ECAS_EXTERNAL_DIGEST_ERROR', auditId || '', 'ACCEPT', 'AUDITOR', '', '', false, msg, {
      error: msg
    });
    return null;
  }
}


function StatusNotificationBridge_AssertEcasBriefingComplete_(payload) {
  payload = payload || {};
  var missing = [];
  var warnings = [];

  if (!String(payload.auditId || '').trim()) missing.push('auditId');
  if (!String(payload.company || '').trim()) missing.push('company');
  if (!String(payload.auditorEmail || '').trim()) missing.push('auditorEmail');
  if (!payload.blocks || !payload.blocks.length) missing.push('planningBlocks');
  if (payload.plannedHours === '' || payload.plannedHours === null || typeof payload.plannedHours === 'undefined') missing.push('plannedHours');

  // R7: mpsNumber and scopes are important for ECAS readability, but they must not
  // block queue creation. Test rows and some legacy rows may be incomplete.
  // Log as warning and still queue the external digest.
  if (!StatusNotificationBridge_NormalizeMpsNumber_(payload.mpsNumber || payload.auditNumber || '')) warnings.push('mpsNumber');
  if (!payload.scopes || !payload.scopes.length) warnings.push('scopes');

  if (warnings.length) {
    StatusNotificationBridge_Diag_('ECAS_BRIEFING_WARN', String(payload.auditId || '').trim(), 'ACCEPT', 'AUDITOR', '', '', true, '', {
      auditId: String(payload.auditId || '').trim(),
      company: String(payload.company || '').trim(),
      auditorEmail: String(payload.auditorEmail || '').trim(),
      mpsNumber: StatusNotificationBridge_NormalizeMpsNumber_(payload.mpsNumber || payload.auditNumber || ''),
      scopesCount: payload.scopes && payload.scopes.length ? payload.scopes.length : 0,
      blocksCount: payload.blocks && payload.blocks.length ? payload.blocks.length : 0,
      plannedHours: payload.plannedHours,
      warnings: warnings
    });
  }

  if (missing.length) {
    throw new Error(JSON.stringify({
      type: 'ECAS_ACCEPT_BRIEFING_INCOMPLETE',
      message: 'ECAS accept digest not queued because mandatory briefing data is incomplete.',
      auditId: String(payload.auditId || '').trim(),
      company: String(payload.company || '').trim(),
      auditorEmail: String(payload.auditorEmail || '').trim(),
      mpsNumber: StatusNotificationBridge_NormalizeMpsNumber_(payload.mpsNumber || payload.auditNumber || ''),
      scopesCount: payload.scopes && payload.scopes.length ? payload.scopes.length : 0,
      blocksCount: payload.blocks && payload.blocks.length ? payload.blocks.length : 0,
      plannedHours: payload.plannedHours,
      missing: missing,
      warnings: warnings
    }));
  }

  return true;
}

function StatusNotificationBridge_LoadEcasAuditBriefing_(auditId) {
  auditId = String(auditId || '').trim();
  var out = {
    auditId: auditId,
    company: '',
    companyUid: '',
    mpsNumber: '',
    scopes: [],
    blocks: [],
    plannedDates: [],
    plannedHours: '',
    planningJson: '',
    auditorEmail: '',
    auditorName: ''
  };
  if (!auditId) return out;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Audit planning');
    if (!sh) return out;

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return out;

    var headerRange = sh.getRange(1, 1, 1, lastCol);
    var hdr = headerRange.getValues()[0] || [];
    var hdrDisplay = headerRange.getDisplayValues()[0] || hdr;
    var idx = StatusNotificationBridge_HeaderMapLoose_(hdrDisplay);
    var cAuditId = StatusNotificationBridge_FindColLoose_(idx, ['Audit ID', 'Audit_ID', 'AuditId', 'Audit UID', 'AuditUID']);
    if (cAuditId < 0) return out;

    var cell = sh.getRange(2, cAuditId + 1, lastRow - 1, 1)
      .createTextFinder(auditId)
      .matchEntireCell(true)
      .findNext();
    if (!cell) return out;

    var rowRange = sh.getRange(cell.getRow(), 1, 1, lastCol);
    var row = rowRange.getValues()[0] || [];
    var rowDisplay = rowRange.getDisplayValues()[0] || row;

    out.company = StatusNotificationBridge_CellLoose_(rowDisplay, idx, [
      'Company', 'Company name', 'Client', 'Customer', 'Organisation', 'Organization'
    ]);

    out.companyUid = StatusNotificationBridge_CellLoose_(rowDisplay, idx, [
      'Company_UID', 'Company UID', 'CompanyUID', 'UID', 'Company Id', 'Company ID'
    ]);

    // Canonical source: Companies.Number via Audit planning.Company_UID.
    out.mpsNumber = StatusNotificationBridge_LoadMpsNumberFromCompaniesByUid_(ss, out.companyUid);

    // Last-resort fallback only; not canonical. Keeps legacy/test rows from breaking,
    // but real PROD must use Companies.Number.
    if (!out.mpsNumber) {
      out.mpsNumber = StatusNotificationBridge_ExtractMpsNumberFromAuditRow_(hdrDisplay, row, idx, rowDisplay);
    }
    out.planningJson = StatusNotificationBridge_CellLoose_(row, idx, [
      'Planning JSON', 'PlanningJSON', 'Planning', 'Planning json', 'Planning_Js', 'Planning js'
    ]);
    out.scopes = StatusNotificationBridge_ExtractScopesFromAuditRow_(hdr, row);

    var parsed = StatusNotificationBridge_ParsePlanningJson_(out.planningJson);
    out.blocks = parsed.blocks;
    out.plannedDates = parsed.plannedDates;
    out.plannedHours = parsed.plannedHours;
    out.auditorEmail = parsed.auditorEmail;
    out.auditorName = parsed.auditorName;

    if (!out.plannedHours && out.blocks.length) out.plannedHours = StatusNotificationBridge_SumBlockHours_(out.blocks);

    StatusNotificationBridge_Diag_('ECAS_BRIEFING_LOADED_R10', auditId, 'ACCEPT', 'AUDITOR', '', '', true, '', {
      row: cell.getRow(),
      company: out.company,
      companyUid: out.companyUid,
      mpsNumber: out.mpsNumber,
      companiesMpsCandidates: StatusNotificationBridge_CompaniesMpsCandidateDiagnostics_(ss, out.companyUid),
      mpsCandidates: StatusNotificationBridge_MpsCandidateDiagnostics_(hdrDisplay, row, rowDisplay),
      scopes: out.scopes,
      scopesCount: out.scopes.length,
      blocks: out.blocks.length,
      auditorEmail: out.auditorEmail,
      auditorName: out.auditorName,
      plannedHours: out.plannedHours
    });
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    Logger.log('[STATUS_NOTIFY][ECAS_BRIEFING_ERROR] auditId=' + auditId + ' err=' + msg);
    StatusNotificationBridge_Diag_('ECAS_BRIEFING_ERROR', auditId, 'ACCEPT', 'AUDITOR', '', '', false, msg, { error: msg });
  }

  return out;
}

function StatusNotificationBridge_ParsePlanningJson_(raw) {
  var out = { blocks: [], plannedDates: [], plannedHours: '', auditorEmail: '', auditorName: '' };
  raw = String(raw == null ? '' : raw).trim();
  if (!raw) return out;

  try {
    var obj = JSON.parse(raw);
    var arr = [];
    if (Array.isArray(obj)) arr = obj;
    else if (obj && Array.isArray(obj.blocks)) arr = obj.blocks;
    else if (obj && Array.isArray(obj.slots)) arr = obj.slots;
    else if (obj && Array.isArray(obj.days)) arr = obj.days;

    for (var i = 0; i < arr.length; i++) {
      var b = arr[i] || {};
      var nb = {
        date: String(b.date || b.day || b.plannedDate || '').trim(),
        start: String(b.start || b.startTime || b.from || '').trim(),
        end: String(b.end || b.endTime || b.to || '').trim(),
        hours: b.hours != null && b.hours !== '' ? b.hours : '',
        execLoc: String(b.execLoc || b.executionLocation || b.location || b.locationName || '').trim(),
        slotComment: String(b.slotComment || b.comment || b.comments || '').trim()
      };
      out.blocks.push(nb);
      if (nb.date && out.plannedDates.indexOf(nb.date) < 0) out.plannedDates.push(nb.date);
    }

    out.plannedHours = obj && obj.totalPlannedHours != null ? obj.totalPlannedHours : '';
    out.auditorEmail = String((obj && obj.auditorEmail) || '').trim();
    out.auditorName = String((obj && obj.auditorName) || '').trim();
  } catch (e) {}

  return out;
}

function StatusNotificationBridge_SumBlockHours_(blocks) {
  var total = 0;
  for (var i = 0; i < (blocks || []).length; i++) {
    var b = blocks[i] || {};
    var h = Number(b.hours || 0);
    if (isFinite(h) && h > 0) { total += h; continue; }
    var s = StatusNotificationBridge_HhmmToMinutes_(b.start);
    var e = StatusNotificationBridge_HhmmToMinutes_(b.end);
    if (isFinite(s) && isFinite(e) && e > s) total += (e - s) / 60;
  }
  return total ? Math.round(total * 100) / 100 : '';
}

function StatusNotificationBridge_HhmmToMinutes_(v) {
  var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function StatusNotificationBridge_ExtractScopesFromAuditRow_(hdr, row) {
  var out = [];
  var seen = {};
  var scopeHeaderMap = StatusNotificationBridge_LoadScopeHeaderMap_();

  function pushOne_(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return;
    if (/^(NO|FALSE|0|N|NA|N\/A)$/i.test(v)) return;
    if (/^(YES|TRUE|1|Y|X|ACTIVE)$/i.test(v)) return;
    var k = StatusNotificationBridge_NormLoose_(v);
    if (!k || seen[k]) return;
    seen[k] = true;
    out.push(v);
  }

  function pushList_(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return;
    if (v.charAt(0) === '[') {
      try {
        var arr = JSON.parse(v);
        if (Array.isArray(arr)) {
          for (var ai = 0; ai < arr.length; ai++) pushOne_(arr[ai]);
          return;
        }
      } catch (eArr) {}
    }
    var parts = v.split(/[,;\n|]+/);
    for (var pi = 0; pi < parts.length; pi++) pushOne_(parts[pi]);
  }

  function isTruthy_(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'x' || s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'active';
  }

  function isFalsey_(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return !s || s === 'no' || s === 'n' || s === 'false' || s === '0' || s === 'inactive';
  }

  function headerLooksLikeScope_(h) {
    var n = StatusNotificationBridge_NormLoose_(h);
    if (!n) return false;
    if (/^scope\s*\d+/.test(n)) return true;
    if (scopeHeaderMap[n]) return true;
    return /\b(mps|grasp|globalg|global gap|gg|florimark|tracecert|gtp|abc|gap|sq)\b/i.test(n);
  }

  function labelForHeader_(rawHeader, value) {
    var raw = String(rawHeader || '').trim();
    var mapped = scopeHeaderMap[StatusNotificationBridge_NormLoose_(raw)] || '';
    if (mapped) return mapped;

    // SCOPE_01 with value containing the actual scope name: use value.
    if (/^SCOPE[_\s-]*\d+/i.test(raw) && !isTruthy_(value) && !isFalsey_(value)) return String(value || '').trim();

    // SCOPE_01_MPS-ABC style: strip only generic prefix.
    var stripped = raw.replace(/^SCOPE[_\s-]*\d+[_\s-]*/i, '').trim();
    return stripped || raw;
  }

  for (var c = 0; c < (hdr || []).length; c++) {
    var rawHeader = String(hdr[c] || '').trim();
    var value = String(row[c] == null ? '' : row[c]).trim();
    if (!rawHeader) continue;

    if (/^(SCOPES|SCOPE|SCOPES_LIST|SCOPE_LIST|STANDARD|STANDARDS|STANDARD\s*\/\s*SCOPES)$/i.test(rawHeader)) {
      pushList_(value);
      continue;
    }

    if (headerLooksLikeScope_(rawHeader)) {
      if (isTruthy_(value)) {
        pushOne_(labelForHeader_(rawHeader, value));
      } else if (!isFalsey_(value)) {
        // If value itself contains a label/list, prefer the value; otherwise the header.
        pushList_(value);
      }
      continue;
    }
  }

  return out;
}


function StatusNotificationBridge_LoadMpsNumberFromCompaniesByUid_(ss, companyUid) {
  companyUid = String(companyUid || '').trim();
  if (!ss || !companyUid) return '';

  try {
    var sh = ss.getSheetByName('Companies');
    if (!sh) return '';

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return '';

    var hdrRange = sh.getRange(1, 1, 1, lastCol);
    var hdr = hdrRange.getValues()[0] || [];
    var hdrDisplay = hdrRange.getDisplayValues()[0] || hdr;
    var idx = StatusNotificationBridge_HeaderMapLoose_(hdrDisplay);

    var cUid = StatusNotificationBridge_FindColLoose_(idx, [
      'Company_UID', 'Company UID', 'CompanyUID', 'UID', 'Company Id', 'Company ID'
    ]);
    if (cUid < 0) return '';

    var cell = sh.getRange(2, cUid + 1, lastRow - 1, 1)
      .createTextFinder(companyUid)
      .matchEntireCell(true)
      .findNext();
    if (!cell) return '';

    var rowRange = sh.getRange(cell.getRow(), 1, 1, lastCol);
    var row = rowRange.getValues()[0] || [];
    var rowDisplay = rowRange.getDisplayValues()[0] || row;

    var cNumber = StatusNotificationBridge_FindColLoose_(idx, [
      'Number', 'MPS Number', 'MPS-number', 'MPS No.', 'MPS No', 'MPS no',
      'MPS nr', 'MPS nummer', 'MPS deelnemernummer', 'Participant number',
      'Customer number', 'Client number'
    ]);

    if (cNumber >= 0) {
      var direct = StatusNotificationBridge_NormalizeMpsNumber_(rowDisplay[cNumber]) ||
                   StatusNotificationBridge_NormalizeMpsNumber_(row[cNumber]);
      if (direct) return direct;
    }

    return StatusNotificationBridge_ExtractMpsNumberFromAuditRow_(hdrDisplay, row, idx, rowDisplay);
  } catch (e) {
    return '';
  }
}

function StatusNotificationBridge_CompaniesMpsCandidateDiagnostics_(ss, companyUid) {
  var out = { companyUid: String(companyUid || '').trim(), row: '', candidates: [] };
  if (!ss || !out.companyUid) return out;
  try {
    var sh = ss.getSheetByName('Companies');
    if (!sh) return out;
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return out;
    var hdrRange = sh.getRange(1, 1, 1, lastCol);
    var hdr = hdrRange.getDisplayValues()[0] || hdrRange.getValues()[0] || [];
    var idx = StatusNotificationBridge_HeaderMapLoose_(hdr);
    var cUid = StatusNotificationBridge_FindColLoose_(idx, ['Company_UID', 'Company UID', 'CompanyUID', 'UID', 'Company Id', 'Company ID']);
    if (cUid < 0) return out;
    var cell = sh.getRange(2, cUid + 1, lastRow - 1, 1).createTextFinder(out.companyUid).matchEntireCell(true).findNext();
    if (!cell) return out;
    out.row = cell.getRow();
    var rowRange = sh.getRange(cell.getRow(), 1, 1, lastCol);
    var row = rowRange.getValues()[0] || [];
    var rowDisplay = rowRange.getDisplayValues()[0] || row;
    out.candidates = StatusNotificationBridge_MpsCandidateDiagnostics_(hdr, row, rowDisplay);
  } catch (e) {}
  return out;
}

function StatusNotificationBridge_ExtractMpsNumberFromAuditRow_(hdr, row, idx, rowDisplay) {
  hdr = hdr || [];
  row = row || [];
  rowDisplay = rowDisplay || row;

  // Prefer displayed values: MPS numbers may be formatted as text, have leading zeros,
  // or be formula/display values that do not survive cleanly via getValues().
  function valAt_(c) {
    var dv = c >= 0 ? String(rowDisplay[c] == null ? '' : rowDisplay[c]).trim() : '';
    var rv = c >= 0 ? String(row[c] == null ? '' : row[c]).trim() : '';
    return StatusNotificationBridge_NormalizeMpsNumber_(dv) || StatusNotificationBridge_NormalizeMpsNumber_(rv);
  }

  function findDirect_(names) {
    for (var ni = 0; ni < (names || []).length; ni++) {
      var c = StatusNotificationBridge_FindColLoose_(idx, [names[ni]]);
      if (c < 0) continue;
      var v = valAt_(c);
      if (v) return v;
    }
    return '';
  }

  // Strong explicit MPS header aliases. These must win over generic Number columns.
  var explicit = findDirect_([
    'MPS No.', 'MPS No', 'MPS no.', 'MPS no', 'MPS-number', 'MPS number', 'MPS Number', 'MPS_Number',
    'MPSNumber', 'MPS nr.', 'MPS nr', 'MPS-nr', 'MPS ID', 'MPS_ID', 'MPS participant number',
    'MPS participant no', 'MPS registration number', 'MPS certificate number', 'MPS company number',
    'Customer MPS number', 'Customer MPS no', 'Client MPS number', 'Producer MPS number',
    'MPS klantnummer', 'MPS nummer', 'MPS nr', 'MPS deelnemernummer'
  ]);
  if (explicit) return explicit;

  // Broad explicit scan: any header containing MPS + number/no/nr/id/participant/customer.
  for (var c = 0; c < hdr.length; c++) {
    var h = String(hdr[c] || '').trim();
    var hn = StatusNotificationBridge_NormLoose_(h);
    if (!hn) continue;
    if (hn.indexOf('mps') < 0) continue;
    if (/(hour|hours|date|status|phone|postal|zip|row|sort|order|duration|days|scope|gap|grasp|sq|abc|tracecert|gtp|compact)/i.test(hn)) continue;
    var vm = valAt_(c);
    if (vm) return vm;
  }

  // Generic fallback only if it looks like a real participant number.
  var genericCandidates = [
    'Number', 'No.', 'No', 'Audit Number', 'Audit no', 'Audit No.',
    'Participant number', 'Participant no', 'Registration number', 'Certificate number', 'Company number',
    'Customer number', 'Customer no', 'Client number', 'Client no'
  ];
  var generic = findDirect_(genericCandidates);
  if (generic) return generic;

  // Last resort: scan likely number columns, excluding planning/status/scope fields.
  for (var gc = 0; gc < hdr.length; gc++) {
    var gh = String(hdr[gc] || '').trim();
    var ghn = StatusNotificationBridge_NormLoose_(gh);
    if (!ghn) continue;
    if (/(hour|hours|date|status|phone|postal|zip|row|sort|order|duration|days|locs|location|scope|gap|grasp|sq|abc|tracecert|gtp|compact)/i.test(ghn)) continue;
    if (!/(mps|number|no|nr|participant|registration|certificate|customer|client)/i.test(ghn)) continue;
    var vg = valAt_(gc);
    if (vg) return vg;
  }

  return '';
}

function StatusNotificationBridge_MpsCandidateDiagnostics_(hdr, row, rowDisplay) {
  var out = [];
  try {
    hdr = hdr || [];
    row = row || [];
    rowDisplay = rowDisplay || row;
    for (var c = 0; c < hdr.length; c++) {
      var h = String(hdr[c] || '').trim();
      var hn = StatusNotificationBridge_NormLoose_(h);
      if (!hn) continue;
      if (!/(mps|number|no|nr|participant|registration|certificate|customer|client)/i.test(hn)) continue;
      var rv = String(row[c] == null ? '' : row[c]).trim();
      var dv = String(rowDisplay[c] == null ? '' : rowDisplay[c]).trim();
      if (!rv && !dv) continue;
      out.push({ col:c + 1, header:h, value:rv, displayValue:dv, normalized:StatusNotificationBridge_NormalizeMpsNumber_(dv) || StatusNotificationBridge_NormalizeMpsNumber_(rv) });
      if (out.length >= 12) break;
    }
  } catch (e) {}
  return out;
}

function StatusNotificationBridge_NormalizeMpsNumber_(v) {
  var s = String(v == null ? '' : v)
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .trim();
  if (!s) return '';
  if (/^(YES|NO|TRUE|FALSE|X|Y|N|NA|N\/A|-|—)$/i.test(s)) return '';
  // Treat 0 / 00 / 0000 as placeholder, not as an MPS participant number.
  if (/^0+$/.test(s)) return '';
  return s;
}

function StatusNotificationBridge_LoadScopeHeaderMap_() {
  var out = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Config_Scopes');
    if (!sh) return out;
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return out;
    var hdr = values[0] || [];
    var idx = StatusNotificationBridge_HeaderMapLoose_(hdr);
    var cSlot = StatusNotificationBridge_FindColLoose_(idx, ['SlotKey', 'Slot Key', 'Header', 'Column']);
    var cCode = StatusNotificationBridge_FindColLoose_(idx, ['ScopeCode', 'Scope Code', 'Code']);
    var cName = StatusNotificationBridge_FindColLoose_(idx, ['DisplayName', 'Display Name', 'Name', 'Label']);
    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var slot = cSlot >= 0 ? String(row[cSlot] || '').trim() : '';
      var code = cCode >= 0 ? String(row[cCode] || '').trim() : '';
      var name = cName >= 0 ? String(row[cName] || '').trim() : '';
      var label = name || code || slot;
      if (!label) continue;
      if (slot) out[StatusNotificationBridge_NormLoose_(slot)] = label;
      if (code) out[StatusNotificationBridge_NormLoose_(code)] = label;
      if (name) out[StatusNotificationBridge_NormLoose_(name)] = label;
    }
  } catch (e) {}
  return out;
}

function StatusNotificationBridge_HeaderMapLoose_(headers) {
  var map = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;
    map[StatusNotificationBridge_NormLoose_(raw)] = i;
  }
  return map;
}

function StatusNotificationBridge_FindColLoose_(idx, names) {
  for (var i = 0; i < (names || []).length; i++) {
    var k = StatusNotificationBridge_NormLoose_(names[i]);
    if (idx && Object.prototype.hasOwnProperty.call(idx, k)) return idx[k];
  }
  return -1;
}

function StatusNotificationBridge_CellLoose_(row, idx, names) {
  var c = StatusNotificationBridge_FindColLoose_(idx, names);
  return c >= 0 ? String(row[c] == null ? '' : row[c]).trim() : '';
}

function StatusNotificationBridge_NormLoose_(v) {
  return String(v == null ? '' : v)
    .replace(/[–—−]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function StatusNotificationBridge_MapEvent_(action, actor, beforeStatus, afterStatus) {
  action = Status_normalizeAction_(action);
  actor = Status_normalizeRole_(actor);
  beforeStatus = Status_normalizeStatus_(beforeStatus);
  afterStatus = Status_normalizeStatus_(afterStatus);

  if (beforeStatus === STATUS.PENDING_PLANNING && action === ACTION.PLAN && actor === ROLE.AUDITOR && afterStatus === STATUS.PENDING_APPROVAL) return 'AUDIT_PLANNED_BY_AUDITOR';
  if (beforeStatus === STATUS.PENDING_APPROVAL && action === ACTION.APPROVE && actor === ROLE.MANAGER && afterStatus === STATUS.APPROVED) return 'AUDIT_APPROVED';
  if (beforeStatus === STATUS.PENDING_PLANNING && action === ACTION.PLAN && actor === ROLE.MANAGER && afterStatus === STATUS.APPROVED) return 'AUDIT_PLANNED_BY_MANAGER';
  if (beforeStatus === STATUS.APPROVED && action === ACTION.ACCEPT && actor === ROLE.AUDITOR && afterStatus === STATUS.ACCEPTED) return 'AUDIT_ACCEPTED';
  if (beforeStatus === STATUS.ACCEPTED && action === ACTION.COMPLETE && actor === ROLE.MANAGER && afterStatus === STATUS.COMPLETED) return 'COMPLETED_ON_BEHALF';
  if (beforeStatus === STATUS.ACCEPTED && action === ACTION.COMPLETE && actor === ROLE.AUDITOR && afterStatus === STATUS.COMPLETED) return 'AUDIT_COMPLETED';
  if (action === ACTION.CANCEL && actor === ROLE.MANAGER && afterStatus === STATUS.PENDING_PLANNING) return 'AUDIT_CANCELLED_BY_MANAGER';
  if (action === ACTION.CANCEL && actor === ROLE.AUDITOR && afterStatus === STATUS.PENDING_PLANNING) return 'AUDIT_CANCELLED_BY_AUDITOR';
  if (action === ACTION.DENY && actor === ROLE.MANAGER && afterStatus === STATUS.PENDING_PLANNING) return 'AUDIT_DENIED_BY_MANAGER';
  if (action === ACTION.DENY && actor === ROLE.AUDITOR && afterStatus === STATUS.PENDING_PLANNING) return 'AUDIT_DENIED_BY_AUDITOR';
  if (action === ACTION.REJECT && actor === ROLE.MANAGER && afterStatus === STATUS.REJECTED) return 'AUDIT_REJECTED_BY_MANAGER';

  Logger.log(JSON.stringify({
    ok: true,
    type: 'STATUS_NOTIFICATION_NO_EVENT_MAPPED',
    action: action,
    actor: actor,
    beforeStatus: beforeStatus,
    afterStatus: afterStatus
  }));

  return '';
}

function StatusNotificationBridge_ResolveRecipient_(action, actor, ctx, payload) {
  action = Status_normalizeAction_(action);
  actor = Status_normalizeRole_(actor);

  var assigned = '';
  try {
    if (ctx && ctx.row && ctx.col && ctx.col.assigned >= 0) {
      assigned = String(ctx.row[ctx.col.assigned] || '').trim();
    }
  } catch (e1) {}

  if (action === ACTION.APPROVE) {
    return { role: 'AUDITOR', email: assigned };
  }

  if (action === ACTION.ACCEPT || action === ACTION.COMPLETE) {
    return { role: 'MANAGER', email: StatusNotificationBridge_GetManagerEmail_() };
  }

  if (action === ACTION.PLAN && actor === ROLE.AUDITOR) {
    return { role: 'MANAGER', email: StatusNotificationBridge_GetManagerEmail_() };
  }

  if (action === ACTION.PLAN && actor === ROLE.MANAGER) {
    return {
      role: 'AUDITOR',
      email: String((payload && payload.auditorEmail) || (payload && payload.assignedTo) || assigned || '').trim()
    };
  }

  return { role: 'MANAGER', email: StatusNotificationBridge_GetManagerEmail_() };
}

function StatusNotificationBridge_GetManagerEmail_() {
  var result = StatusNotificationBridge_FindActiveRoleEmails_('Manager');

  if (result.emails.length === 1) {
    return result.emails[0];
  }

  if (result.emails.length > 1) {
    StatusNotificationBridge_Diag_(
      'MANAGER_RECIPIENT_MULTIPLE_R14',
      '',
      '',
      '',
      '',
      '',
      false,
      'Multiple active Manager recipients found in Auditors.',
      {
        emails: result.emails,
        rows: result.rows
      }
    );
    return result.emails[0];
  }

  StatusNotificationBridge_Diag_(
    'MANAGER_RECIPIENT_MISSING_R14',
    '',
    '',
    '',
    '',
    '',
    false,
    'No active Role=Manager recipient found in Auditors.',
    {
      sheetFound: result.sheetFound,
      headers: result.headers
    }
  );

  return '';
}

function StatusNotificationBridge_GetEcasRecipientEmail_() {
  var configured = '';

  try {
    configured = String(
      PropertiesService.getScriptProperties().getProperty('ECAS_DEFAULT_EMAIL') || ''
    ).trim();
  } catch (e1) {}

  if (configured) {
    return configured;
  }

  // Canonical fallback: active Manager role from Auditors.
  // This remains independent from the actor/session user.
  return StatusNotificationBridge_GetManagerEmail_();
}

function StatusNotificationBridge_FindActiveRoleEmails_(roleName) {
  var out = {
    sheetFound: false,
    headers: [],
    emails: [],
    rows: []
  };

  roleName = String(roleName || '').trim().toLowerCase();
  if (!roleName) return out;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Auditors');
    if (!sh) return out;

    out.sheetFound = true;

    var values = sh.getDataRange().getDisplayValues();
    if (!values || values.length < 2) return out;

    var headers = values[0] || [];
    out.headers = headers;

    var idx = StatusNotificationBridge_HeaderMapLoose_(headers);
    var cEmail = StatusNotificationBridge_FindColLoose_(idx, [
      'E-mail',
      'Email',
      'E mail',
      'Email address'
    ]);
    var cRole = StatusNotificationBridge_FindColLoose_(idx, [
      'Role',
      'Rol'
    ]);
    var cActive = StatusNotificationBridge_FindColLoose_(idx, [
      'Active',
      'Actief',
      'Enabled'
    ]);
    var cName = StatusNotificationBridge_FindColLoose_(idx, [
      'Name',
      'Naam',
      'Display name'
    ]);

    if (cEmail < 0 || cRole < 0) return out;

    var seen = {};

    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var role = String(row[cRole] || '').trim().toLowerCase();
      if (role !== roleName) continue;

      var active = cActive >= 0 ? String(row[cActive] || '').trim() : 'Yes';
      if (!StatusNotificationBridge_IsActiveFlag_(active)) continue;

      var email = String(row[cEmail] || '').trim().toLowerCase();
      if (!email || email.indexOf('@') < 1) continue;
      if (seen[email]) continue;

      seen[email] = true;
      out.emails.push(email);
      out.rows.push({
        row: r + 1,
        name: cName >= 0 ? String(row[cName] || '').trim() : '',
        email: email,
        role: String(row[cRole] || '').trim(),
        active: active
      });
    }
  } catch (e2) {
    StatusNotificationBridge_Diag_(
      'ROLE_RECIPIENT_LOOKUP_ERROR_R14',
      '',
      '',
      '',
      '',
      '',
      false,
      String(e2 && e2.message ? e2.message : e2),
      {
        roleName: roleName
      }
    );
  }

  return out;
}

function StatusNotificationBridge_IsActiveFlag_(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();

  if (!v) return true;

  return (
    v === 'yes' ||
    v === 'ja' ||
    v === 'true' ||
    v === '1' ||
    v === 'x' ||
    v === 'active' ||
    v === 'actief'
  );
}

function StatusNotificationBridge_GetCompany_(ctx) {
  try {
    if (!ctx || !ctx.hdr || !ctx.row) return '';
    var idx = ctx.hdr.indexOf('Company');
    if (idx < 0) return '';
    return String(ctx.row[idx] || '').trim();
  } catch (e) {
    return '';
  }
}

function RUN_STATUS_NOTIFICATION_BRIDGE_RECIPIENT_VALIDATE_R15() {
  var managers = StatusNotificationBridge_FindActiveRoleEmails_('Manager');
  var managerEmail = StatusNotificationBridge_GetManagerEmail_();
  var ecasEmail = StatusNotificationBridge_GetEcasRecipientEmail_();

  var out = {
    ok: !!managerEmail && !!ecasEmail,
    build: '2026-07-10_STATUS_NOTIFICATION_BRIDGE_R15_QUEUE_TX_DIAGNOSTICS',
    managerEmail: managerEmail,
    ecasEmail: ecasEmail,
    activeManagers: managers.rows,
    sessionEmailIgnored: (function() {
      try {
        return String(Session.getActiveUser().getEmail() || '').trim();
      } catch (e) {
        return '';
      }
    })(),
    rules: {
      manager: 'Auditors.Active=Yes and Role=Manager',
      ecas: 'Script Property ECAS_DEFAULT_EMAIL, otherwise active Manager in Auditors',
      sessionUserUsedAsRecipient: false
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_STATUS_NOTIFICATION_BRIDGE_QUEUE_TX_VALIDATE_R15() {
  var out = {
    ok: typeof StatusNotificationBridge_QueueWithLock_ === 'function',
    build: '2026-07-10_STATUS_NOTIFICATION_BRIDGE_R15_QUEUE_TX_DIAGNOSTICS',
    diagnostics: [
      'QUEUE_TX_BEGIN',
      'QUEUE_TX_LOCKED',
      'QUEUE_TX_RETURN',
      'QUEUE_TX_COMMITTED',
      'QUEUE_TX_FINISHED'
    ],
    lockWaitMs: 5000,
    queueWriter: 'NB_queueNotification_',
    reconcilerFallback: 'AcceptedNotificationReconciler'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_STATUS_NOTIFICATION_BRIDGE_TRIGGER_CONTRACT() {
  var cases = [
    { name: 'Auditor plans; manager approval required', beforeStatus: STATUS.PENDING_PLANNING, action: ACTION.PLAN, actor: ROLE.AUDITOR, afterStatus: STATUS.PENDING_APPROVAL, expectedEvent: 'AUDIT_PLANNED_BY_AUDITOR' },
    { name: 'Manager approves auditor planning', beforeStatus: STATUS.PENDING_APPROVAL, action: ACTION.APPROVE, actor: ROLE.MANAGER, afterStatus: STATUS.APPROVED, expectedEvent: 'AUDIT_APPROVED' },
    { name: 'Manager plans directly', beforeStatus: STATUS.PENDING_PLANNING, action: ACTION.PLAN, actor: ROLE.MANAGER, afterStatus: STATUS.APPROVED, expectedEvent: 'AUDIT_PLANNED_BY_MANAGER' },
    { name: 'Auditor accepts approved planning', beforeStatus: STATUS.APPROVED, action: ACTION.ACCEPT, actor: ROLE.AUDITOR, afterStatus: STATUS.ACCEPTED, expectedEvent: 'AUDIT_ACCEPTED' }
  ];

  var results = cases.map(function(c) {
    var actual = StatusNotificationBridge_MapEvent_(c.action, c.actor, c.beforeStatus, c.afterStatus);
    return {
      name: c.name,
      beforeStatus: Status_toDisplayStatus_(c.beforeStatus),
      action: c.action,
      actor: c.actor,
      afterStatus: Status_toDisplayStatus_(c.afterStatus),
      expectedEvent: c.expectedEvent,
      actualEvent: actual,
      ok: actual === c.expectedEvent
    };
  });

  var out = {
    ok: results.every(function(r) { return r.ok; }),
    build: '2026-07-10_STATUS_NOTIFICATION_BRIDGE_R15_QUEUE_TX_DIAGNOSTICS',
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
