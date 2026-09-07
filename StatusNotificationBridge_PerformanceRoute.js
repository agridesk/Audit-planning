/**
 * FILE: StatusNotificationBridge_PerformanceRoute.js
 * BUILD: AMS01_STATUS_NOTIFICATION_PERF_20260907_R3
 *
 * DEV performance route for the existing StatusNotificationBridge contract.
 * Functional semantics preserved:
 * - same ScriptLock / 5s timeout
 * - same NB_queueNotification_ owner
 * - same ECAS recipient resolution
 * - same reconciler fallback on lock/write failure
 * - same briefing assertions
 *
 * AMS-01 changes:
 * 1) success-path queue diagnostics are Logger-only instead of synchronous
 *    Diagnostics_Log writes inside the user action;
 * 2) ECAS digest reuses the briefing already attached by Dispatch_ and only
 *    reloads it when that payload is incomplete;
 * 3) canonical AuditPlanningRowIndexCache is reused for ACCEPT briefing reads;
 * 4) MPS number enrichment uses canonical CompaniesIndexService first, avoiding
 *    the Companies TextFinder + row reread in the ACCEPT hot path.
 */

var AMS01_STATUS_NOTIFICATION_PERF_BUILD = 'AMS01_STATUS_NOTIFICATION_PERF_20260907_R3';

function StatusNotificationBridge_QueueWithLock_(recipientEmail, eventCode, queuePayload, auditId) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  var txStarted = Date.now();
  var txId = Utilities.getUuid();
  var action = queuePayload && queuePayload.action ? String(queuePayload.action) : '';
  var actorRole = queuePayload && queuePayload.actorRole ? String(queuePayload.actorRole) : '';

  try {
    acquired = lock.tryLock(5000);
    var waitMs = Date.now() - txStarted;

    if (!acquired) {
      var deferred = {
        success:false,
        retryable:true,
        reason:'QUEUE_LOCK_TIMEOUT_RECONCILER_FALLBACK',
        bufferedBy:'AcceptedNotificationReconciler',
        recipient:String(recipientEmail || '').trim(),
        eventType:String(eventCode || '').trim(),
        auditId:String(auditId || '').trim(),
        txId:txId,
        waitMs:waitMs
      };
      StatusNotificationBridge_Diag_('QUEUE_LOCK_TIMEOUT_AMS01', auditId || '', action, actorRole, '', '', false,
        'Notification Queue lock not acquired within 5 seconds; reconciler fallback.', deferred);
      return deferred;
    }

    var queueStarted = Date.now();
    var result = NB_queueNotification_(recipientEmail, eventCode, queuePayload);
    try {
      Logger.log('[AMS01_QUEUE_TX] ' + JSON.stringify({
        build:AMS01_STATUS_NOTIFICATION_PERF_BUILD,
        txId:txId,
        eventCode:eventCode || '',
        auditId:auditId || '',
        waitMs:waitMs,
        queueMs:Date.now()-queueStarted,
        totalMs:Date.now()-txStarted,
        success:!!(result && result.success !== false),
        skipped:!!(result && result.skipped === true)
      }));
    } catch (eLog) {}
    return result;

  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    var failed = {
      success:false,
      retryable:true,
      reason:'QUEUE_WRITE_ERROR',
      error:msg,
      recipient:String(recipientEmail || '').trim(),
      eventType:String(eventCode || '').trim(),
      auditId:String(auditId || '').trim(),
      txId:txId
    };
    StatusNotificationBridge_Diag_('QUEUE_WRITE_ERROR_AMS01', auditId || '', action, actorRole, '', '', false, msg, failed);
    return failed;
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (eRelease) {}
    }
  }
}

function StatusNotificationBridge_QueueAcceptedExternalDigest_(recipientEmail, queuePayload) {
  var auditId = '';
  try {
    if (typeof NB_queueNotification_ !== 'function') return null;

    recipientEmail = StatusNotificationBridge_GetEcasRecipientEmail_();
    if (!recipientEmail) return null;

    queuePayload = queuePayload || {};
    auditId = String(queuePayload.auditId || '').trim();
    if (!auditId) return null;

    var briefing = {
      auditId:auditId,
      company:String(queuePayload.company || '').trim(),
      companyUid:String(queuePayload.companyUid || '').trim(),
      mpsNumber:StatusNotificationBridge_NormalizeMpsNumber_(queuePayload.mpsNumber || queuePayload.auditNumber || ''),
      scopes:Array.isArray(queuePayload.scopes) ? queuePayload.scopes : [],
      blocks:Array.isArray(queuePayload.blocks) ? queuePayload.blocks : [],
      plannedDates:Array.isArray(queuePayload.plannedDates) ? queuePayload.plannedDates : [],
      plannedHours:queuePayload.plannedHours,
      planningJson:queuePayload.planningJson || '',
      auditorEmail:String(queuePayload.auditorEmail || '').trim(),
      auditorName:String(queuePayload.auditorName || '').trim()
    };

    var payloadHasBriefing = !!(
      queuePayload.skipAuditBriefing === true &&
      briefing.company &&
      briefing.auditorEmail &&
      briefing.blocks.length &&
      briefing.plannedHours !== '' &&
      briefing.plannedHours !== null &&
      typeof briefing.plannedHours !== 'undefined'
    );

    if (!payloadHasBriefing) {
      briefing = StatusNotificationBridge_LoadEcasAuditBriefing_(auditId);
    }

    var externalPayload = {};
    Object.keys(queuePayload).forEach(function(k){ externalPayload[k] = queuePayload[k]; });
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
      consolidate:true,
      bufferMinutes:10,
      digestGroup:'ECAS_OPERATIONAL',
      templateFamily:'EXTERNAL_OPERATIONAL'
    };

    StatusNotificationBridge_AssertEcasBriefingComplete_(externalPayload);
    return StatusNotificationBridge_QueueWithLock_(
      recipientEmail,
      'ECAS_AUDIT_APPROVAL_DIGEST',
      externalPayload,
      auditId
    );
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    StatusNotificationBridge_Diag_('ECAS_EXTERNAL_DIGEST_ERROR_AMS01', auditId || '', 'ACCEPT', 'AUDITOR', '', '', false, msg, { error:msg });
    return null;
  }
}

function StatusNotificationBridge_LoadEcasAuditBriefing_(auditId) {
  auditId = String(auditId || '').trim();
  var out = {
    auditId:auditId,
    company:'',
    companyUid:'',
    mpsNumber:'',
    scopes:[],
    blocks:[],
    plannedDates:[],
    plannedHours:'',
    planningJson:'',
    auditorEmail:'',
    auditorName:'',
    __ams01BriefingBuild:AMS01_STATUS_NOTIFICATION_PERF_BUILD,
    __ams01MpsSource:''
  };
  if (!auditId) return out;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
    if (!ss || typeof __mp_getAuditPlanningRow_ !== 'function') return out;
    var pack = __mp_getAuditPlanningRow_(ss, auditId);
    if (!pack || !pack.row || !pack.hdr) return out;

    var hdr = pack.hdr || [];
    var row = pack.row || [];
    var idx = StatusNotificationBridge_HeaderMapLoose_(hdr);

    out.company = StatusNotificationBridge_CellLoose_(row, idx, [
      'Company', 'Company name', 'Client', 'Customer', 'Organisation', 'Organization'
    ]);
    out.companyUid = StatusNotificationBridge_CellLoose_(row, idx, [
      'Company_UID', 'Company UID', 'CompanyUID', 'UID', 'Company Id', 'Company ID'
    ]);

    var companyCore = null;
    try {
      if (typeof CompaniesIndex_GetCompanyCoreByUidOrName === 'function') {
        companyCore = CompaniesIndex_GetCompanyCoreByUidOrName(out.companyUid, out.company);
      }
    } catch (eCore) { companyCore = null; }

    if (companyCore) {
      out.mpsNumber = StatusNotificationBridge_NormalizeMpsNumber_(companyCore.number || '');
      if (out.mpsNumber) out.__ams01MpsSource = 'CompaniesIndexService';
    }

    if (!out.mpsNumber) {
      out.mpsNumber = StatusNotificationBridge_ExtractMpsNumberFromAuditRow_(hdr, row, idx, row);
      if (out.mpsNumber) out.__ams01MpsSource = 'AuditPlanningRow';
    }

    if (!out.mpsNumber) {
      out.mpsNumber = StatusNotificationBridge_LoadMpsNumberFromCompaniesByUid_(ss, out.companyUid);
      if (out.mpsNumber) out.__ams01MpsSource = 'CompaniesFallback';
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

    try {
      Logger.log('[AMS01_ACCEPT_BRIEFING] ' + JSON.stringify({
        build:AMS01_STATUS_NOTIFICATION_PERF_BUILD,
        auditId:auditId,
        row:pack.rowNumber || 0,
        indexFromCache:!!pack.indexFromCache,
        mpsSource:out.__ams01MpsSource,
        scopes:out.scopes.length,
        blocks:out.blocks.length
      }));
    } catch (eLog) {}
  } catch (e) {
    try { Logger.log('[AMS01_ACCEPT_BRIEFING_ERROR] ' + String(e && e.message ? e.message : e)); } catch (eLog2) {}
  }
  return out;
}

function AMS01_StatusNotificationPerfStatus() {
  return {
    success:true,
    active:true,
    build:AMS01_STATUS_NOTIFICATION_PERF_BUILD,
    duplicateBriefingAvoided:true,
    successPathQueueDiagnostics:'LOGGER_ONLY',
    briefingReadOwner:'AuditPlanningRowIndexCache',
    companyEnrichmentOwner:'CompaniesIndexService'
  };
}
