/***********************************************************************
 * FILE: NotificationSmokeTools.gs
 * BUILD: 2026-05-15_NOTIFICATION_SMOKE_TOOLS_CANONICAL_RENDERERS_R5_UNIFORM_FORCE_DUE
 *
 * PURPOSE
 * - Canonical smoke tools for notification renderer/sender verification.
 * - Queue-based smoke tests use the same flow:
 *   1. queue representative rows
 *   2. reserve rows through NotificationSender_RunDigest10M()
 *   3. force only smoke rows due
 *   4. send through NotificationSender_RunDigest10M()
 *   5. report final queue status
 *
 * GOVERNANCE
 * - Smoke tools only create NF-* test rows.
 * - Smoke tools do not mutate audit lifecycle/status.
 * - Weekly renderer smoke does not send mail.
 * - Weekly real runners remain separate and explicit.
 ***********************************************************************/

var NF_SMOKE_BUILD = '2026-05-15_NOTIFICATION_SMOKE_TOOLS_CANONICAL_RENDERERS_R5_UNIFORM_FORCE_DUE';
var NF_SMOKE_RECIPIENT = 'planning@agriqa.es';

/* ============================================================
 * PUBLIC: status / availability
 * ============================================================ */

function RUN_NF_STATUS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qName = (typeof NB_getQueueSheetName_ === 'function') ? NB_getQueueSheetName_() : 'Notification Queue';
  var q = ss.getSheetByName(qName);

  var out = {
    ok: true,
    build: NF_SMOKE_BUILD,
    timestamp: new Date().toISOString(),
    required: {
      NotificationConfig_GetEvent: typeof NotificationConfig_GetEvent === 'function',
      NB_buildNotification_: typeof NB_buildNotification_ === 'function',
      NB_queueNotification_: typeof NB_queueNotification_ === 'function',
      NB_renderDigestEmail_: typeof NB_renderDigestEmail_ === 'function',
      NotificationSender_RunDigest10M: typeof NotificationSender_RunDigest10M === 'function',
      NotificationSender_ResolveDelivery: typeof NotificationSender_ResolveDelivery === 'function',
      NotificationDeliveryGuard_assertDeliveryAllowed: typeof NotificationDeliveryGuard_assertDeliveryAllowed === 'function',
      NotificationMailGateway_SendEmail: typeof NotificationMailGateway_SendEmail === 'function'
    },
    renderers: {
      RICH_OPERATIONAL: nf_rendererStatus_('NB_renderRichOperational_'),
      APPROVAL_OPERATIONAL: nf_rendererStatus_('NB_renderApprovalOperational_'),
      MANAGER_APPROVAL_OPERATIONAL: nf_rendererStatus_('NB_renderManagerApprovalOperational_'),
      EXTERNAL_OPERATIONAL_SINGLE: nf_rendererStatus_('NB_renderExternalOperationalSingle_'),
      EXTERNAL_OPERATIONAL_DIGEST: nf_rendererStatus_('NB_renderExternalOperationalDigest_'),
      COMPACT_LIFECYCLE: nf_rendererStatus_('NB_renderCompactLifecycle_'),
      LIFECYCLE_DIGEST: nf_rendererStatus_('NB_renderLifecycleDigest_'),
      WEEKLY_SINGLE_BRIDGE: nf_rendererStatus_('NB_renderWeekly_'),
      WEEKLY_DIGEST_BRIDGE: nf_rendererStatus_('NB_renderWeeklyDigest_'),
      SHARED_SCOPE_BADGES: nf_rendererStatus_('NB_scopeBadgesHtml_'),
      SHARED_PLANNING_TABLE: nf_rendererStatus_('NB_renderPlanningTableHtml_')
    },
    queue: {
      name: qName,
      exists: !!q,
      lastRow: q ? q.getLastRow() : 0
    },
    warnings: [],
    errors: []
  };

  Object.keys(out.required).forEach(function(k) {
    if (!out.required[k]) {
      out.ok = false;
      out.errors.push('Missing required function: ' + k);
    }
  });

  Object.keys(out.renderers).forEach(function(k) {
    if (!out.renderers[k].available) {
      out.ok = false;
      out.errors.push('Missing renderer function: ' + out.renderers[k].functionName);
    }
  });

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function nf_rendererStatus_(fn) {
  return {
    functionName: fn,
    available: typeof this[fn] === 'function'
  };
}

/* ============================================================
 * PUBLIC: canonical queue smoke tests
 * ============================================================ */

function RUN_NF_RICH() {
  var stamp = nf_stamp_();
  var eventType = 'AUDIT_PLANNED_BY_MANAGER';
  var auditId = 'NF-RICH-' + stamp;
  var payload = nf_basePayload_(auditId, 'NF Rich Operational Company', {
    eventType: eventType,
    type: eventType,
    actor: 'manager@example.com',
    actorRole: 'Manager',
    recipientRole: 'auditor',
    resultStatus: 'Approved',
    displayStatus: 'Pending acceptance',
    auditorEmail: 'auditor.rich@example.com',
    auditorName: 'Auditor Rich',
    cta: { portalUrl: 'https://audit-portal.example.com/a/' + auditId },
    blocks: [
      { date:'2026-06-02', dayName:'Tuesday', start:'09:00', end:'13:00', hours:4, execLoc:'HQ', gps:'41.3851,2.1734', slotComment:'Main site audit', googleCalendarLink:'https://calendar.google.com/', appleCalendarLink:'https://example.com/a.ics' },
      { date:'2026-06-03', dayName:'Wednesday', start:'09:30', end:'12:30', hours:3, execLoc:'Greenhouse 2', gps:'41.3860,2.1740', slotComment:'Follow-up location', googleCalendarLink:'https://calendar.google.com/', appleCalendarLink:'https://example.com/b.ics' }
    ],
    locations: [
      { code:'HQ', name:'Head office', gps:'41.3851,2.1734', comment:'Reception at main entrance' },
      { code:'GH2', name:'Greenhouse 2', gps:'41.3860,2.1740', comment:'Use east gate' }
    ],
    plannedHours: 7,
    companyComments: 'Representative smoke comment for rich operational mail.'
  });

  return nf_queueAndSendSmoke_('RUN_NF_RICH', 'Manager -> Auditor rich operational planning mail', [
    { recipient:NF_SMOKE_RECIPIENT, eventType:eventType, data:payload, auditId:auditId }
  ], 'NF-RICH-');
}

function RUN_NF_APPROVAL() {
  var stamp = nf_stamp_();
  var eventType = 'AUDIT_PLANNED_BY_AUDITOR';
  var auditId = 'NF-APPROVAL-' + stamp;
  var payload = nf_basePayload_(auditId, 'NF Auditor Approval Company', {
    eventType: eventType,
    type: eventType,
    actor: 'auditor.approval@example.com',
    actorRole: 'Auditor',
    recipientRole: 'manager',
    resultStatus: 'Pending Approval',
    auditorEmail: 'auditor.approval@example.com',
    auditorName: 'Auditor Approval',
    country: 'Spain',
    region: 'Valencia',
    blocks: [
      { date:'2026-06-04', dayName:'Thursday', start:'10:00', end:'14:00', hours:4, execLoc:'Main location', gps:'39.4699,-0.3763', slotComment:'Auditor proposed slot' }
    ],
    plannedHours: 4,
    companyComments: 'Auditor self-planned audit; manager review required.'
  });

  return nf_queueAndSendSmoke_('RUN_NF_APPROVAL', 'Auditor -> Manager compact approval package', [
    { recipient:NF_SMOKE_RECIPIENT, eventType:eventType, data:payload, auditId:auditId }
  ], 'NF-APPROVAL-');
}

function RUN_NF_CLIENT_DIGEST() {
  var stamp = nf_stamp_();
  var eventType = 'ECAS_AUDIT_APPROVAL_DIGEST';

  var rows = [
    nf_clientRow_('A', stamp, 'NF Client Digest Company A', '710001', 'auditor.alpha@example.com', 'Auditor Alpha', ['MPS-GAP', 'GRASP'], [
      { date:'2026-06-08', dayName:'Monday', start:'09:00', end:'13:00', hours:4, execLoc:'HQ' }
    ], 4),
    nf_clientRow_('B', stamp, 'NF Client Digest Company B', '710002', 'auditor.alpha@example.com', 'Auditor Alpha', ['GLOBALG.A.P.', 'GRASP'], [
      { date:'2026-06-09', dayName:'Tuesday', start:'10:00', end:'15:00', hours:5, execLoc:'Main site' }
    ], 5),
    nf_clientRow_('C', stamp, 'NF Client Digest Company C', '710003', 'auditor.beta@example.com', 'Auditor Beta', ['MPS-ABC'], [
      { date:'2026-06-10', dayName:'Wednesday', start:'08:30', end:'12:30', hours:4, execLoc:'Nursery' }
    ], 4)
  ];

  var jobs = rows.map(function(p) {
    return { recipient:NF_SMOKE_RECIPIENT, eventType:eventType, data:p, auditId:p.auditId };
  });

  return nf_queueAndSendSmoke_('RUN_NF_CLIENT_DIGEST', 'Planning -> Client/ECAS Dutch external operational digest', jobs, 'NF-CLIENT-');
}

function RUN_NF_EXT() {
  return RUN_NF_CLIENT_DIGEST();
}

function RUN_NF_LIFECYCLE() {
  var stamp = nf_stamp_();
  var jobs = [];

  jobs.push({
    recipient: NF_SMOKE_RECIPIENT,
    eventType: 'AUDIT_ACCEPTED',
    auditId: 'NF-LIFECYCLE-ACCEPT-' + stamp,
    data: nf_basePayload_('NF-LIFECYCLE-ACCEPT-' + stamp, 'NF Lifecycle Accepted Company', {
      eventType:'AUDIT_ACCEPTED',
      type:'AUDIT_ACCEPTED',
      actor:'auditor.accept@example.com',
      actorRole:'Auditor',
      recipientRole:'manager',
      resultStatus:'Accepted',
      auditorEmail:'auditor.accept@example.com',
      auditorName:'Auditor Accept',
      blocks:[{ date:'2026-06-11', dayName:'Thursday', start:'09:00', end:'13:00', hours:4, execLoc:'HQ' }],
      plannedHours:4,
      reason:'Auditor accepted the planning.'
    })
  });

  jobs.push({
    recipient: NF_SMOKE_RECIPIENT,
    eventType: 'AUDIT_DENIED_BY_AUDITOR',
    auditId: 'NF-LIFECYCLE-DENY-' + stamp,
    data: nf_basePayload_('NF-LIFECYCLE-DENY-' + stamp, 'NF Lifecycle Denied Company', {
      eventType:'AUDIT_DENIED_BY_AUDITOR',
      type:'AUDIT_DENIED_BY_AUDITOR',
      actor:'auditor.deny@example.com',
      actorRole:'Auditor',
      recipientRole:'manager',
      resultStatus:'Returned to Pending Planning',
      auditorEmail:'auditor.deny@example.com',
      auditorName:'Auditor Deny',
      blocks:[{ date:'2026-06-12', dayName:'Friday', start:'09:00', end:'12:00', hours:3, execLoc:'HQ' }],
      plannedHours:3,
      reason:'Auditor is not available on the proposed date.',
      comment:'Auditor is not available on the proposed date.'
    })
  });

  jobs.push({
    recipient: NF_SMOKE_RECIPIENT,
    eventType: 'AUDIT_CANCELLED_BY_MANAGER',
    auditId: 'NF-LIFECYCLE-CANCEL-' + stamp,
    data: nf_basePayload_('NF-LIFECYCLE-CANCEL-' + stamp, 'NF Lifecycle Cancelled Company', {
      eventType:'AUDIT_CANCELLED_BY_MANAGER',
      type:'AUDIT_CANCELLED_BY_MANAGER',
      actor:'manager@example.com',
      actorRole:'Manager',
      recipientRole:'auditor',
      resultStatus:'Returned to Pending Planning',
      auditorEmail:'auditor.cancel@example.com',
      auditorName:'Auditor Cancel',
      blocks:[{ date:'2026-06-15', dayName:'Monday', start:'11:00', end:'15:00', hours:4, execLoc:'HQ' }],
      plannedHours:4,
      reason:'Company requested replanning.',
      comment:'Company requested replanning.'
    })
  });

  jobs.push({
    recipient: NF_SMOKE_RECIPIENT,
    eventType: 'AUDIT_COMPLETED',
    auditId: 'NF-LIFECYCLE-COMPLETE-' + stamp,
    data: nf_basePayload_('NF-LIFECYCLE-COMPLETE-' + stamp, 'NF Lifecycle Completed Company', {
      eventType:'AUDIT_COMPLETED',
      type:'AUDIT_COMPLETED',
      actor:'auditor.complete@example.com',
      actorRole:'Auditor',
      recipientRole:'manager',
      resultStatus:'Completed',
      auditorEmail:'auditor.complete@example.com',
      auditorName:'Auditor Complete',
      blocks:[{ date:'2026-06-16', dayName:'Tuesday', start:'08:00', end:'12:00', hours:4, execLoc:'HQ' }],
      plannedHours:4,
      reason:'Audit completion submitted.'
    })
  });

  return nf_queueAndSendSmoke_('RUN_NF_LIFECYCLE', 'Compact lifecycle digest smoke', jobs, 'NF-LIFECYCLE-');
}

function RUN_NF_LIFE() {
  throw new Error('RUN_NF_LIFE is deprecated. Use RUN_NF_LIFECYCLE.');
}

/* ============================================================
 * PUBLIC: weekly checks
 * ============================================================ */

function RUN_NF_WEEKLY() {
  var errors = [];
  var singleSummary = {};
  var digestSummary = {};

  try {
    if (typeof NB_renderWeekly_ !== 'function') throw new Error('NB_renderWeekly_ missing');
    var single = NB_renderWeekly_({
      eventCode:'WEEKLY_SMOKE',
      subject:'Weekly smoke single',
      body:'Weekly smoke single body',
      items:[]
    });
    singleSummary = {
      subject: single && single.subject ? single.subject : '',
      bodyLength: single && single.body ? single.body.length : 0,
      htmlLength: single && single.htmlBody ? single.htmlBody.length : 0
    };
  } catch (e) {
    errors.push('NB_renderWeekly_: ' + String(e && e.message ? e.message : e));
  }

  try {
    if (typeof NB_renderWeeklyDigest_ !== 'function') throw new Error('NB_renderWeeklyDigest_ missing');
    var digest = NB_renderWeeklyDigest_(NF_SMOKE_RECIPIENT, [
      { eventCode:'WEEKLY_AUDITOR_COMING_UP', company:'Weekly Smoke Company', auditId:'NF-WEEKLY-1', eventFamily:'WEEKLY_OVERSIGHT', rendererProfile:'WEEKLY' }
    ]);
    digestSummary = {
      subject: digest && digest.subject ? digest.subject : '',
      bodyLength: digest && digest.body ? digest.body.length : 0,
      htmlLength: digest && digest.htmlBody ? digest.htmlBody.length : 0
    };
  } catch (e2) {
    errors.push('NB_renderWeeklyDigest_: ' + String(e2 && e2.message ? e2.message : e2));
  }

  var out = {
    ok: errors.length === 0,
    build: NF_SMOKE_BUILD,
    test: 'RUN_NF_WEEKLY',
    purpose: 'Weekly renderer bridge smoke; does not run real weekly mail scan.',
    runnerAvailability: {
      runManagerWeeklyAlert: typeof runManagerWeeklyAlert === 'function',
      runAuditorWeeklyAlert: typeof runAuditorWeeklyAlert === 'function'
    },
    rendererAvailability: {
      NB_renderWeekly_: typeof NB_renderWeekly_ === 'function',
      NB_renderWeeklyDigest_: typeof NB_renderWeeklyDigest_ === 'function'
    },
    errors: errors,
    singleSummary: singleSummary,
    digestSummary: digestSummary
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_NF_WEEKLY_RUNNERS() {
  var out = {
    ok: true,
    build: NF_SMOKE_BUILD,
    test: 'RUN_NF_WEEKLY_RUNNERS',
    purpose: 'Runs real weekly manager/auditor runners. This may send mail depending on config.',
    manager: null,
    auditor: null,
    errors: []
  };

  try {
    if (typeof runManagerWeeklyAlert !== 'function') throw new Error('runManagerWeeklyAlert missing');
    out.manager = runManagerWeeklyAlert();
  } catch (e) {
    out.ok = false;
    out.errors.push('runManagerWeeklyAlert: ' + String(e && e.message ? e.message : e));
  }

  try {
    if (typeof runAuditorWeeklyAlert !== 'function') throw new Error('runAuditorWeeklyAlert missing');
    out.auditor = runAuditorWeeklyAlert();
  } catch (e2) {
    out.ok = false;
    out.errors.push('runAuditorWeeklyAlert: ' + String(e2 && e2.message ? e2.message : e2));
  }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
 * PUBLIC: sender helper
 * ============================================================ */

function RUN_NF_SEND() {
  if (typeof NotificationSender_RunDigest10M !== 'function') {
    throw new Error('NotificationSender_RunDigest10M missing.');
  }
  var out = NotificationSender_RunDigest10M();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
 * Uniform smoke engine
 * ============================================================ */

function nf_queueAndSendSmoke_(testName, purpose, jobs, auditIdPrefix) {
  nf_require_('NB_queueNotification_');
  nf_require_('NotificationSender_RunDigest10M');

  var queued = [];
  var errors = [];
  var inserted = 0;

  for (var i = 0; i < (jobs || []).length; i++) {
    var job = jobs[i] || {};
    try {
      var res = NB_queueNotification_(job.recipient || NF_SMOKE_RECIPIENT, job.eventType, job.data || {});
      queued.push(res);
      if (!res.skipped) inserted++;
    } catch (e) {
      errors.push('Queue failed for ' + (job.eventType || '') + ' / ' + (job.auditId || '') + ': ' + String(e && e.message ? e.message : e));
    }
  }

  var firstSenderResult = null;
  var forceDueResult = null;
  var senderResult = null;
  var finalStatus = null;

  try {
    firstSenderResult = NotificationSender_RunDigest10M();
  } catch (e2) {
    errors.push('First sender run failed: ' + String(e2 && e2.message ? e2.message : e2));
  }

  try {
    forceDueResult = nf_forceSmokeRowsDue_(auditIdPrefix);
  } catch (e3) {
    errors.push('Force due failed: ' + String(e3 && e3.message ? e3.message : e3));
  }

  try {
    senderResult = NotificationSender_RunDigest10M();
  } catch (e4) {
    errors.push('Second sender run failed: ' + String(e4 && e4.message ? e4.message : e4));
  }

  try {
    finalStatus = nf_collectSmokeFinalStatuses_(auditIdPrefix);
  } catch (e5) {
    errors.push('Final status collection failed: ' + String(e5 && e5.message ? e5.message : e5));
  }

  var ok = errors.length === 0;
  if (senderResult && Number(senderResult.failedRows || 0) > 0) ok = false;
  if (finalStatus && finalStatus.failedRows && finalStatus.failedRows.length) ok = false;
  if (finalStatus && finalStatus.reservedRows && finalStatus.reservedRows.length) ok = false;

  var out = {
    ok: ok,
    build: NF_SMOKE_BUILD,
    test: testName,
    purpose: purpose,
    inserted: inserted,
    queued: queued,
    firstSenderResult: firstSenderResult,
    forceDueResult: forceDueResult,
    senderResult: senderResult,
    finalStatus: finalStatus,
    errors: errors
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function nf_forceSmokeRowsDue_(auditIdPrefix) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qName = (typeof NB_getQueueSheetName_ === 'function') ? NB_getQueueSheetName_() : 'Notification Queue';
  var sh = ss.getSheetByName(qName);
  if (!sh) throw new Error('Notification Queue sheet missing: ' + qName);

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { touched:0, queueSheet:qName };

  var nowMs = Date.now();
  var dueMs = nowMs - 60000;
  var dueAt = nf_isoCompact_(new Date(dueMs));
  var touched = 0;
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var status = String(values[r][1] || '').trim().toUpperCase();
    if (status !== 'RESERVED') continue;

    var auditId = String(values[r][4] || '').trim();
    if (auditIdPrefix && auditId.indexOf(auditIdPrefix) !== 0) continue;

    var reserved = nf_parseJson_(values[r][12]);
    if (!reserved) continue;

    reserved.windowDueAtMs = dueMs;
    reserved.windowDueAt = dueAt;
    reserved.smokeForceDue = true;
    reserved.smokeForceDueAt = nf_isoCompact_(new Date(nowMs));

    sh.getRange(r + 1, 13).setValue(JSON.stringify(reserved));
    touched++;
    rows.push(r + 1);
  }

  return {
    touched: touched,
    rows: rows,
    auditIdPrefix: auditIdPrefix,
    forcedDueAt: dueAt,
    queueSheet: qName
  };
}

function nf_collectSmokeFinalStatuses_(auditIdPrefix) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qName = (typeof NB_getQueueSheetName_ === 'function') ? NB_getQueueSheetName_() : 'Notification Queue';
  var sh = ss.getSheetByName(qName);
  if (!sh) throw new Error('Notification Queue sheet missing: ' + qName);

  var values = sh.getDataRange().getValues();
  var rows = [];
  var counts = {};
  var reservedRows = [];
  var failedRows = [];

  for (var r = 1; r < values.length; r++) {
    var auditId = String(values[r][4] || '').trim();
    if (auditIdPrefix && auditId.indexOf(auditIdPrefix) !== 0) continue;

    var status = String(values[r][1] || '').trim();
    if (!status) status = '(blank)';
    counts[status] = (counts[status] || 0) + 1;

    var item = {
      row: r + 1,
      status: status,
      eventType: String(values[r][2] || '').trim(),
      recipient: String(values[r][3] || '').trim(),
      auditId: auditId,
      attempts: Number(values[r][8] || 0),
      lastError: String(values[r][9] || '').trim(),
      timestampSent: String(values[r][11] || '').trim()
    };
    rows.push(item);

    if (status === 'RESERVED' || status === 'PENDING') reservedRows.push(item);
    if (status === 'FAILED') failedRows.push(item);
  }

  return {
    auditIdPrefix: auditIdPrefix,
    counts: counts,
    rows: rows,
    reservedRows: reservedRows,
    failedRows: failedRows
  };
}

/* ============================================================
 * Payload builders
 * ============================================================ */

function nf_basePayload_(auditId, company, extra) {
  extra = extra || {};
  var base = {
    auditId: auditId,
    company: company,
    mpsNumber: extra.mpsNumber || extra.auditNumber || '710000',
    auditNumber: extra.auditNumber || extra.mpsNumber || '710000',
    number: extra.number || extra.mpsNumber || extra.auditNumber || '710000',
    scopes: extra.scopes || ['MPS-GAP', 'GRASP'],
    plannedDates: extra.plannedDates || ['2026-06-02'],
    plannedHours: extra.plannedHours != null ? extra.plannedHours : 4,
    blocks: extra.blocks || [
      { date:'2026-06-02', dayName:'Tuesday', start:'09:00', end:'13:00', hours:4, execLoc:'HQ' }
    ],
    planningWindowFrom: extra.planningWindowFrom || '2026-05-01',
    planningWindowTo: extra.planningWindowTo || '2026-12-31',
    country: extra.country || 'Spain',
    region: extra.region || 'Valencia',
    skipAuditBriefing: true
  };

  for (var k in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
  }

  return base;
}

function nf_clientRow_(suffix, stamp, company, mpsNumber, auditorEmail, auditorName, scopes, blocks, plannedHours) {
  var auditId = 'NF-CLIENT-' + suffix + '-' + stamp;
  return nf_basePayload_(auditId, company, {
    eventType:'ECAS_AUDIT_APPROVAL_DIGEST',
    type:'ECAS_AUDIT_APPROVAL_DIGEST',
    mpsNumber:mpsNumber,
    auditNumber:mpsNumber,
    number:mpsNumber,
    auditorEmail:auditorEmail,
    auditorName:auditorName,
    recipientRole:'client',
    resultStatus:'Accepted',
    scopes:scopes,
    blocks:blocks,
    plannedDates:blocks.map(function(b) { return b.date; }),
    plannedHours:plannedHours,
    reason:'',
    comment:''
  });
}

/* ============================================================
 * Utilities
 * ============================================================ */

function nf_require_(fn) {
  if (typeof this[fn] !== 'function') {
    throw new Error('Missing required function: ' + fn);
  }
}

function nf_stamp_() {
  var now = new Date();
  return Utilities.formatDate(now, nf_tz_(), 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 90000 + 10000);
}

function nf_tz_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss && ss.getSpreadsheetTimeZone ? String(ss.getSpreadsheetTimeZone() || '').trim() : '';
    if (tz) return tz;
  } catch (e) {}
  try {
    var tz2 = String(Session.getScriptTimeZone() || '').trim();
    if (tz2) return tz2;
  } catch (e2) {}
  return 'Europe/Amsterdam';
}

function nf_isoCompact_(d) {
  return Utilities.formatDate(d, nf_tz_(), "yyyy-MM-dd'T'HH:mm:ss");
}

function nf_parseJson_(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch (e) {
    return null;
  }
}
