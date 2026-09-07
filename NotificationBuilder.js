/***********************************************************************
 * FILE: NotificationBuilder.gs
 * BUILD: 2026-06-17_NOTIFICATION_BUILDER_R8_NO_EVENT_AUDIT_DUP_SUPPRESSION
 *
 * PURPOSE
 * - Canonical notification payload builder and queue writer.
 * - Renderer dispatcher for operational, approval, external, lifecycle and weekly profiles.
 * - Digest dispatcher used by NotificationSender.gs.
 * - Consumer-only access to NotificationConfig.gs.
 *
 * GOVERNANCE
 * - Event != delivery.
 * - Notification Queue remains mandatory.
 * - Builder does not send mail.
 * - Builder does not decide lifecycle statuses.
 * - Builder owns normalization, payload creation, queue writing and renderer dispatch only.
 * - Dedicated renderer files own HTML/layout/rendering helpers.
 * - Canonical renderer filenames:
 *   - NotificationRenderer_ManagerToAuditorPlanning.gs
 *   - NotificationRenderer_AuditorToManagerApproval.gs
 *   - NotificationRenderer_ApprovalOperational.gs
 *   - NotificationRenderer_PlanningToClientDigest.gs
 *   - NotificationRenderer_LifecycleDigest.gs
 *   - NotificationRenderer_WeeklyDigest.gs
 *   - NotificationRenderer_SharedHtmlHelpers.gs
 *
 * R5 FIX
 * - AUDIT_ACCEPTED no longer hard-routes to EXTERNAL_OPERATIONAL.
 * - EXTERNAL_OPERATIONAL is reserved for explicit ECAS_* / CUSTOMER_* digest events
 *   or config/template family EXTERNAL_OPERATIONAL.
 *
 * R6 FIX
 * - External digest rows can recover missing normalized payload fields from the queue Body.
 * - This keeps old ECAS_AUDIT_ACCEPTED queue rows sendable when Reserved/payload is incomplete.
 * - Body remains a fallback only; Reserved/payload remains the canonical source when complete.
 ***********************************************************************/

var NB_SYSTEM_NAME = 'Audit Planning System';
var NB_DEFAULT_QUEUE_SHEET = 'Notification Queue';
var NB_DEFAULT_FROM_EMAIL = 'planning@agriqa.es';
var NB_DEFAULT_FROM_NAME = 'Agri Quality Assurance – Audit Planning';
var NB_BUILD = '2026-06-17_NOTIFICATION_BUILDER_R8_NO_EVENT_AUDIT_DUP_SUPPRESSION';

/* ============================================================
 * PUBLIC: queue sheet
 * ============================================================ */

function NB_getQueueSheetName_() {
  return NB_clean_(NB_getRuleValue_('QUEUE_SHEET_NAME', NB_DEFAULT_QUEUE_SHEET)) || NB_DEFAULT_QUEUE_SHEET;
}

function NB_requireRenderer_(functionName, profile) {
  if (typeof this[functionName] !== 'function') {
    throw new Error('Missing notification renderer for profile ' + profile + ': ' + functionName + '. Install the dedicated renderer file.');
  }
}

/* ============================================================
 * PUBLIC: notification build entrypoint
 * ============================================================ */

function NB_buildNotification_(eventType, data) {
  data = data || {};
  var eventCode = NB_eventCode_(eventType || data.eventType || data.type);
  var cfg = NB_getEventConfig_(eventCode);
  var normalized = NB_normalizePayload_(eventCode, data, cfg);
  var profile = NB_resolveRendererProfile_(eventCode, cfg, normalized);

  var rendered;
  if (profile === 'RICH_OPERATIONAL') {
    NB_requireRenderer_('NB_renderRichOperational_', profile);
    rendered = NB_renderRichOperational_(normalized);
  } else if (profile === 'APPROVAL_OPERATIONAL') {
    NB_requireRenderer_('NB_renderApprovalOperational_', profile);
    rendered = NB_renderApprovalOperational_(normalized);
  } else if (profile === 'MANAGER_APPROVAL_OPERATIONAL') {
    NB_requireRenderer_('NB_renderManagerApprovalOperational_', profile);
    rendered = NB_renderManagerApprovalOperational_(normalized);
  } else if (profile === 'EXTERNAL_OPERATIONAL') {
    NB_requireRenderer_('NB_renderExternalOperationalSingle_', profile);
    rendered = NB_renderExternalOperationalSingle_(normalized);
  } else if (profile === 'WEEKLY') {
    NB_requireRenderer_('NB_renderWeekly_', profile);
    rendered = NB_renderWeekly_(normalized);
  } else if (profile === 'COMPACT_LIFECYCLE') {
    NB_requireRenderer_('NB_renderCompactLifecycle_', profile);
    rendered = NB_renderCompactLifecycle_(normalized);
  } else {
    throw new Error('NB_buildNotification_: unknown renderer profile: ' + profile);
  }

  rendered = rendered || {};
  return {
    subject: rendered.subject || '',
    body: rendered.body || '',
    htmlBody: rendered.htmlBody || '',
    rendererProfile: profile,
    eventFamily: normalized.eventFamily
  };
}

/* ============================================================
 * PUBLIC: digest renderer used by NotificationSender.gs
 * ============================================================ */

function NB_renderDigestEmail_(recipientEmail, items) {
  items = items || [];
  var normalizedItems = [];
  var firstPayload = null;
  var profile = '';
  var digestGroup = '';

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var payload = NB_extractPayload_(it);
    var eventCode = NB_eventCode_(it.eventCode || it.type || payload.eventType || payload.type);
    var cfg = NB_getEventConfig_(eventCode);
    var data = NB_mergeObjects_({
      eventType: eventCode,
      type: eventCode,
      company: it.company,
      auditId: it.auditId,
      subject: it.subject,
      body: it.body
    }, payload);
    var normalized = NB_normalizePayload_(eventCode, data, cfg);
    normalizedItems.push(normalized);
    if (!firstPayload) firstPayload = normalized;
    if (!profile) profile = NB_resolveRendererProfile_(eventCode, cfg, normalized);
    if (!digestGroup) digestGroup = NB_clean_(cfg.digestGroup || (payload.config && payload.config.digestGroup));
  }

  if (NB_isExternalDigestProfile_(profile, digestGroup, normalizedItems)) {
    NB_requireRenderer_('NB_renderExternalOperationalDigest_', 'EXTERNAL_OPERATIONAL');
    return NB_renderExternalOperationalDigest_(recipientEmail, normalizedItems);
  }

  if (NB_isOperationalDigestProfile_(profile, normalizedItems)) {
    NB_requireRenderer_('NB_renderOperationalDigest_', profile || 'OPERATIONAL');
    return NB_renderOperationalDigest_(recipientEmail, normalizedItems);
  }

  if (profile === 'WEEKLY' || (firstPayload && firstPayload.eventFamily === 'WEEKLY_OVERSIGHT')) {
    NB_requireRenderer_('NB_renderWeeklyDigest_', 'WEEKLY');
    return NB_renderWeeklyDigest_(recipientEmail, normalizedItems);
  }

  NB_requireRenderer_('NB_renderLifecycleDigest_', 'COMPACT_LIFECYCLE');
  return NB_renderLifecycleDigest_(recipientEmail, normalizedItems);
}

/* ============================================================
 * PUBLIC: payload builder and queue writer
 * ============================================================ */

function NB_buildPayloadForQueue_(eventType, data) {
  data = data || {};
  var eventCode = NB_eventCode_(eventType || data.eventType || data.type);
  var cfg = NB_getEventConfig_(eventCode);
  var normalized = NB_normalizePayload_(eventCode, data, cfg);
  NB_assertRequiredReason_(eventCode, cfg, normalized);

  return {
    eventType: eventCode,
    eventFamily: normalized.eventFamily,
    rendererProfile: normalized.rendererProfile,
    deliveryProfile: normalized.deliveryProfile,
    company: normalized.company,
    companyUid: normalized.companyUid,
    auditId: normalized.auditId,
    auditNumber: normalized.auditNumber,
    mpsNumber: normalized.mpsNumber,
    actor: normalized.actor,
    actorRole: normalized.actorRole,
    recipientRole: normalized.recipientRole,
    recipientGroup: normalized.recipientGroup,
    comment: normalized.comment,
    reason: normalized.reason || normalized.comment,
    resultStatus: normalized.resultStatus,
    displayStatus: normalized.displayStatus,
    plannedDates: normalized.plannedDates,
    plannedHours: normalized.plannedHours,
    blocks: normalized.blocks,
    locations: normalized.locations,
    scopes: normalized.scopes,
    auditorEmail: normalized.auditorEmail,
    auditorName: normalized.auditorName,
    contactName: normalized.contactName,
    contactEmail: normalized.contactEmail,
    contactPhone: normalized.contactPhone,
    country: normalized.country,
    region: normalized.region,
    language: normalized.language,
    planningJson: normalized.planningJson,
    planningWindowFrom: normalized.planningWindowFrom,
    planningWindowTo: normalized.planningWindowTo,
    companyComments: normalized.companyComments,
    locationComments: normalized.locationComments,
    validation: normalized.validation,
    checks: normalized.checks,
    cta: normalized.cta,
    calendarLinks: normalized.calendarLinks,
    icsAttachments: NB_copyIcsAttachments_(data.icsAttachments),
    config: {
      active: !!cfg.active,
      sendEmail: !!cfg.sendEmail,
      logOnly: !!cfg.logOnly,
      consolidate: !!cfg.consolidate,
      bufferMinutes: Number(cfg.bufferMinutes || 0),
      digestGroup: NB_clean_(cfg.digestGroup),
      templateFamily: NB_clean_(cfg.templateFamily),
      templateKeyDefault: NB_clean_(cfg.templateKeyDefault),
      fromEmail: NB_clean_(cfg.fromEmail || NB_DEFAULT_FROM_EMAIL),
      fromName: NB_clean_(cfg.fromName || NB_DEFAULT_FROM_NAME),
      replyTo: NB_clean_(cfg.replyTo || ''),
      includeComment: !!cfg.includeComment,
      requireReason: !!cfg.requireReason
    }
  };
}

function NB_queueNotification_(recipientEmail, eventType, data) {
  var eventCode = NB_eventCode_(eventType);
  var cfg = NB_getEventConfig_(eventCode);
  if (!cfg.active) {
    return { success:true, skipped:true, reason:'EVENT_DISABLED', eventType:eventCode };
  }

  var payload = NB_buildPayloadForQueue_(eventCode, data);
  var built = null;

  // R7: external operational digest events are queue-first.
  // The queue row must be created even when the final digest renderer would
  // reject incomplete operational data. Rendering/validation belongs to
  // NotificationSender -> NB_renderDigestEmail_, where failures become visible
  // FAILED queue rows. Without this, ECAS accepts could fail before appendRow
  // and disappear without Notification Queue evidence.
  if (NB_isDeferredExternalQueueEvent_(eventCode, cfg, payload)) {
    built = NB_buildDeferredExternalQueuePreview_(eventCode, payload);
  } else {
    built = NB_buildNotification_(eventCode, payload);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = NB_getQueueSheet_(ss, true);
  var now = new Date();
  var tz = NB_getTz_(ss);
  var hash = NB_hashQueueRow_(recipientEmail, eventCode, payload, built);

  var duplicate = NB_recentQueueDuplicate_(sh, hash, eventCode, recipientEmail, payload.auditId);
  if (duplicate.found) {
    return {
      success:true,
      skipped:true,
      reason:'DUPLICATE_QUEUE_ROW',
      eventType:eventCode,
      recipient:NB_clean_(recipientEmail),
      auditId:NB_clean_(payload.auditId),
      duplicateRow:duplicate.row,
      duplicateStatus:duplicate.status,
      duplicateMatch:duplicate.match
    };
  }

  var effectiveRecipient = cfg.sendEmail && !cfg.logOnly ? NB_clean_(recipientEmail) : '';
  var initialStatus = cfg.sendEmail && !cfg.logOnly ? 'PENDING' : 'AUDIT_TRAIL';

  sh.appendRow([
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
  ]);

  return {
    success:true,
    recipient:effectiveRecipient,
    eventType:eventCode,
    eventFamily:payload.eventFamily,
    rendererProfile:payload.rendererProfile,
    queueSheet:sh.getName(),
    status:initialStatus
  };
}


function NB_isDeferredExternalQueueEvent_(eventCode, cfg, payload) {
  eventCode = NB_eventCode_(eventCode);
  cfg = cfg || {};
  payload = payload || {};

  var templateFamily = NB_clean_(cfg.templateFamily || (payload.config && payload.config.templateFamily)).toUpperCase();
  var digestGroup = NB_clean_(cfg.digestGroup || (payload.config && payload.config.digestGroup)).toUpperCase();
  var eventFamily = NB_clean_(payload.eventFamily).toUpperCase();
  var rendererProfile = NB_clean_(payload.rendererProfile).toUpperCase();

  if (templateFamily === 'EXTERNAL_OPERATIONAL') return true;
  if (eventFamily === 'EXTERNAL_OPERATIONAL') return true;
  if (rendererProfile === 'EXTERNAL_OPERATIONAL') return true;
  if (digestGroup.indexOf('ECAS') >= 0 || digestGroup.indexOf('CUSTOMER') >= 0 || digestGroup.indexOf('CLIENT') >= 0) return true;
  if (eventCode.indexOf('ECAS_') === 0 || eventCode.indexOf('CUSTOMER_') === 0 || eventCode.indexOf('CLIENT_') === 0) return true;

  return false;
}

function NB_buildDeferredExternalQueuePreview_(eventCode, payload) {
  payload = payload || {};
  eventCode = NB_eventCode_(eventCode || payload.eventType || payload.type);

  var subject = NB_subjectForEvent_(eventCode, payload.company, payload.auditId);
  var lines = [];
  lines.push('Overzicht auditopdracht Ecert');
  if (payload.company) lines.push('Bedrijf: ' + NB_clean_(payload.company));
  if (NB_queueMpsNumber_(payload)) lines.push('MPS No.: ' + NB_queueMpsNumber_(payload));
  if (payload.auditId) lines.push('Audit ID: ' + NB_clean_(payload.auditId));
  if (payload.auditorEmail || payload.auditorName) lines.push('Auditor: ' + NB_queueAuditorText_(payload));
  if (payload.scopes && payload.scopes.length) lines.push('Scopes: ' + payload.scopes.join(', '));

  var blocks = payload.blocks || [];
  if (blocks.length) {
    lines.push('Geplande auditplanning:');
    for (var i = 0; i < blocks.length; i++) {
      lines.push('- ' + NB_queuePlanningBlockText_(blocks[i] || {}));
    }
  } else if (payload.plannedDates && payload.plannedDates.length) {
    lines.push('Geplande auditplanning:');
    for (var j = 0; j < payload.plannedDates.length; j++) {
      lines.push('- ' + NB_clean_(payload.plannedDates[j]));
    }
  }

  if (payload.plannedHours !== '' && payload.plannedHours !== null && typeof payload.plannedHours !== 'undefined') {
    lines.push('Totaal uren: ' + NB_formatHours_(payload.plannedHours));
  }

  return {
    subject: subject || 'Overzicht auditopdrachten Ecert',
    body: lines.join('\n'),
    htmlBody: '',
    rendererProfile: 'EXTERNAL_OPERATIONAL',
    eventFamily: 'EXTERNAL_OPERATIONAL',
    deferredQueuePreview: true
  };
}

function NB_queueMpsNumber_(payload) {
  payload = payload || {};
  return NB_clean_(payload.mpsNumber || payload.auditNumber || payload.number || '');
}

function NB_queueAuditorText_(payload) {
  payload = payload || {};
  var email = NB_clean_(payload.auditorEmail);
  var name = NB_clean_(payload.auditorName);
  if (email && name && email.toLowerCase() !== name.toLowerCase()) return email + ' (' + name + ')';
  return email || name || '';
}

function NB_queuePlanningBlockText_(b) {
  b = b || {};
  var dateText = NB_queueFormatDateNl_(b.date);
  var start = NB_clean_(b.start);
  var end = NB_clean_(b.end);
  var time = '';
  if (start && end) time = start + ' – ' + end;
  else time = start || end || '';
  return [dateText, time].filter(function(x) { return !!NB_clean_(x); }).join(' ');
}

function NB_queueFormatDateNl_(iso) {
  iso = NB_clean_(iso);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  var d = new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00Z');
  var days = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  return days[d.getUTCDay()] + ' ' + m[3] + '-' + m[2] + '-' + m[1];
}

function NB_getQueueSheet_(ss, createIfMissing) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var configuredName = NB_getQueueSheetName_();
  var primary = ss.getSheetByName(configuredName);
  if (primary) return primary;

  if (!createIfMissing) return null;

  var sh = ss.insertSheet(configuredName);
  sh.appendRow([
    'TimestampCreated',
    'Status',
    'Type',
    'Recipient',
    'Audit ID',
    'Company',
    'Subject',
    'Body',
    'Attempts',
    'LastError',
    'PayloadHash',
    'TimestampSent',
    'Reserved'
  ]);
  return sh;
}

function NB_recentQueueDuplicate_(sh, hash, eventCode, recipientEmail, auditId) {
  var out = { found:false };
  if (!sh || !hash) return out;

  // R8: duplicate detection is hash-only.
  // Do NOT suppress a new queue row merely because event + recipient + auditId
  // was seen recently. Cancel -> replan -> accept intentionally reuses the same
  // Audit ID, and must create a new AUDIT_ACCEPTED and ECAS digest notification.
  // Exact double-click duplicates remain blocked by PayloadHash.
  try {
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return out;
    var firstRow = Math.max(2, lastRow - 199);
    var values = sh.getRange(firstRow, 1, lastRow - firstRow + 1, Math.max(13, sh.getLastColumn())).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      var row = values[i] || [];
      var rowNo = firstRow + i;
      var status = NB_clean_(row[1]).toUpperCase();
      if (status !== 'PENDING' && status !== 'RESERVED' && status !== 'SENT' && status !== 'SENT_DEV_REDIRECT') continue;
      var rowHash = NB_clean_(row[10]);
      if (rowHash && rowHash === hash) {
        out.found = true;
        out.row = rowNo;
        out.status = status;
        out.match = 'HASH';
        return out;
      }
    }
  } catch (e) {}
  return out;
}

function NB_dateMs_(value) {
  if (value instanceof Date) return value.getTime();
  var raw = NB_clean_(value);
  if (!raw) return 0;
  var direct = Date.parse(raw);
  if (!isNaN(direct)) return direct;
  var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0).getTime();
  return 0;
}

function NB_mergeLegacyQueueIntoPrimary_(deleteLegacyAfterMerge) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var primaryName = NB_getQueueSheetName_();
  var primary = NB_getQueueSheet_(ss, true);
  var legacy = ss.getSheetByName('Notifications_queue');

  if (!legacy || legacy.getName() === primary.getName()) {
    return { success:true, merged:0, deleted:false, primarySheet:primary.getName(), legacyFound:false };
  }

  var values = legacy.getDataRange().getValues();
  var merged = 0;
  if (values && values.length > 1) {
    var body = values.slice(1);
    if (body.length && body[0].length) {
      primary.getRange(primary.getLastRow() + 1, 1, body.length, body[0].length).setValues(body);
      merged = body.length;
    }
  }

  var deleted = false;
  if (deleteLegacyAfterMerge === true) {
    ss.deleteSheet(legacy);
    deleted = true;
  }

  return { success:true, merged:merged, deleted:deleted, primarySheet:primaryName, legacyFound:true };
}

/* ============================================================
 * PUBLIC: audit trail queue helper
 * ============================================================ */

function managerV5_appendAuditTrailToNotificationQueue_(shNotif, payload) {
  if (!shNotif) throw new Error('managerV5_appendAuditTrailToNotificationQueue_: missing sheet handle');
  payload = payload || {};

  var type = NB_eventCode_(payload.type || 'LIFECYCLE_STATUS_CHANGED');
  var auditId = NB_clean_(payload.auditId);
  var company = NB_clean_(payload.company);
  var actorEmail = NB_clean_(payload.actorEmail || payload.managerEmail);

  var now = new Date();
  var tz = NB_getTz_(SpreadsheetApp.getActiveSpreadsheet());
  var subject = '[TRAIL] ' + type + ' :: ' + (auditId || '(no-audit-id)');

  var bodyObj = {
    type:type,
    auditId:auditId,
    auditNumber:NB_clean_(payload.auditNumber || payload.mpsNumber || payload.number),
    company:company,
    actorEmail:actorEmail,
    actorRole:NB_clean_(payload.actorRole),
    beforeStatus:NB_clean_(payload.beforeStatus),
    afterStatus:NB_clean_(payload.afterStatus),
    reason:NB_clean_(payload.reason),
    hours:payload.hours != null ? Number(payload.hours) : null,
    source:NB_clean_(payload.source),
    timestamp:payload.timestamp || Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss'),
    action:NB_clean_(payload.action)
  };
  var body = JSON.stringify(bodyObj);
  var hash = NB_hashText_(type + '|' + auditId + '|' + bodyObj.timestamp + '|' + bodyObj.afterStatus);

  shNotif.appendRow([
    Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'),
    'AUDIT_TRAIL',
    type,
    '',
    auditId,
    company,
    subject,
    body,
    0,
    '',
    hash,
    '',
    JSON.stringify({ payload:bodyObj })
  ]);

  return { success:true, type:type, auditId:auditId, status:'AUDIT_TRAIL', hash:hash };
}

/* ============================================================
 * Normalization / profiles / event registry
 * ============================================================ */

function NB_normalizePayload_(eventCode, data, cfg) {
  data = data || {};
  cfg = cfg || NB_getEventConfig_(eventCode);
  eventCode = NB_eventCode_(eventCode || data.eventType || data.type);

  var briefing = null;
  if (NB_shouldLoadAuditBriefing_(eventCode, data, cfg)) briefing = NB_loadAuditBriefing_(data.auditId, data);

  var blocks = NB_normalizeBlocks_(data.blocks || (briefing && briefing.blocks) || [], data.planningJson || (briefing && briefing.planningJson) || '');
  var plannedHours = data.plannedHours != null && data.plannedHours !== '' ? data.plannedHours : (briefing ? briefing.plannedHours : '');
  if ((plannedHours === '' || plannedHours === null || typeof plannedHours === 'undefined') && blocks.length) plannedHours = NB_sumBlockHours_(blocks);

  var scopes = NB_normalizeList_(data.scopes || (briefing && briefing.scopes) || []);
  var locations = NB_normalizeLocations_(data.locations || (briefing && briefing.locations) || []);
  var resultStatus = NB_clean_(data.resultStatus || (briefing && briefing.status) || NB_defaultResultStatus_(eventCode));
  var recipientRole = NB_clean_(data.recipientRole);
  var displayStatus = NB_displayResultStatus_(eventCode, resultStatus, recipientRole);
  var eventFamily = NB_resolveEventFamily_(eventCode, cfg);
  var rendererProfile = NB_resolveRendererProfile_(eventCode, cfg, { eventFamily:eventFamily });
  var normalizedCompany = NB_clean_(data.company || (briefing && briefing.company));
  var normalizedCompanyUid = NB_clean_((briefing && briefing.companyUid) || data.companyUid || data.companyUID);
  var normalizedMpsNumber = NB_clean_(data.mpsNumber || data.auditNumber || data.number || data.auditNo || data.auditNumberExternal || (briefing && briefing.auditNumber));
  if (!normalizedMpsNumber && normalizedCompany) {
    normalizedMpsNumber = NB_loadCompanyNumberForBriefing_(SpreadsheetApp.getActiveSpreadsheet(), normalizedCompanyUid, normalizedCompany);
  }
  var normalizedValidation = data.validation || data.checks || NB_buildValidationSummary_(data, briefing, blocks, normalizedCompanyUid, normalizedCompany, scopes);

  return {
    eventType:eventCode,
    eventCode:eventCode,
    eventFamily:eventFamily,
    rendererProfile:rendererProfile,
    templateKey:NB_clean_(data.templateKey || cfg.templateKeyDefault || eventCode),
    templateFamily:NB_clean_(cfg.templateFamily),
    deliveryProfile:NB_resolveDeliveryProfile_(eventCode, cfg),
    recipientGroup:NB_clean_(cfg.recipientTarget || cfg.recipientMode || data.recipientGroup),
    company:normalizedCompany,
    companyUid:normalizedCompanyUid,
    auditId:NB_clean_(data.auditId || (briefing && briefing.auditId)),
    auditNumber:normalizedMpsNumber,
    mpsNumber:normalizedMpsNumber,
    actor:NB_clean_(data.actor || data.actorEmail || data.actorName),
    actorRole:NB_clean_(data.actorRole || data.actorLabel),
    recipientRole:recipientRole,
    comment:NB_reasonText_(data, briefing),
    reason:NB_reasonText_(data, briefing),
    resultStatus:resultStatus,
    displayStatus:displayStatus,
    title:NB_titleForEvent_(eventCode),
    subject:NB_subjectForEvent_(eventCode, normalizedCompany, NB_clean_(data.auditId || (briefing && briefing.auditId))),
    nextSteps:NB_nextStepsForEvent_(eventCode, recipientRole),
    plannedDates:Array.isArray(data.plannedDates) ? data.plannedDates.slice() : NB_blocksToDates_(blocks),
    plannedHours:plannedHours,
    blocks:blocks,
    locations:locations,
    scopes:scopes,
    auditorEmail:NB_clean_(data.auditorEmail || (briefing && briefing.auditorEmail)),
    auditorName:NB_clean_(data.auditorName || (briefing && briefing.auditorName)),
    contactName:NB_clean_(data.contactName || (briefing && briefing.contactName)),
    contactEmail:NB_clean_(data.contactEmail || (briefing && briefing.contactEmail)),
    contactPhone:NB_clean_(data.contactPhone || (briefing && briefing.contactPhone)),
    country:NB_clean_(data.country || (briefing && briefing.country)),
    region:NB_clean_(data.region || (briefing && briefing.region)),
    language:NB_clean_(data.language || (briefing && briefing.language)),
    planningJson:NB_clean_(data.planningJson || (briefing && briefing.planningJson)),
    planningWindowFrom:NB_clean_(data.planningWindowFrom || data.planFrom || data.windowFrom || (briefing && briefing.planningWindowFrom)),
    planningWindowTo:NB_clean_(data.planningWindowTo || data.planTo || data.windowTo || (briefing && briefing.planningWindowTo)),
    companyComments:NB_clean_(data.companyComments || data.comments || (briefing && briefing.comments)),
    locationComments:NB_clean_(data.locationComments),
    cta:NB_normalizeCta_(data.cta),
    calendarLinks:NB_normalizeList_(data.calendarLinks || []),
    includeComment:NB_shouldIncludeComment_(eventCode, data.comment, cfg),
    requireReason:!!cfg.requireReason,
    validation:normalizedValidation,
    checks:normalizedValidation,
    cfg:cfg
  };
}

function NB_resolveEventFamily_(eventCode, cfg) {
  eventCode = NB_eventCode_(eventCode);
  cfg = cfg || {};
  var configured = NB_clean_(cfg.eventFamily || cfg.eventClass).toUpperCase();
  var template = NB_clean_(cfg.templateFamily).toUpperCase();
  var digestGroup = NB_clean_(cfg.digestGroup).toUpperCase();

  if (eventCode === 'AUDIT_PLANNED_BY_MANAGER') return 'RICH_OPERATIONAL';
  if (eventCode === 'AUDIT_PLANNED_BY_AUDITOR' || eventCode === 'AUDIT_APPROVAL_REQUIRED') return 'MANAGER_APPROVAL_OPERATIONAL';
  // AUDIT_ACCEPTED is a lifecycle event. Client/ECAS digests must use explicit ECAS_* or CUSTOMER_* events.
  if (configured === 'WEEKLY') return 'WEEKLY_OVERSIGHT';
  if (configured === 'EXTERNAL_OPERATIONAL') return 'EXTERNAL_OPERATIONAL';
  if (configured === 'MANAGER_APPROVAL_OPERATIONAL') return 'MANAGER_APPROVAL_OPERATIONAL';
  if (configured === 'APPROVAL_OPERATIONAL') return 'APPROVAL_OPERATIONAL';
  if (configured === 'RICH_OPERATIONAL') return 'RICH_OPERATIONAL';
  if (template === 'EXTERNAL_OPERATIONAL' || digestGroup.indexOf('ECAS') >= 0 || digestGroup.indexOf('CUSTOMER') >= 0) return 'EXTERNAL_OPERATIONAL';
  if (template === 'MANAGER_APPROVAL_OPERATIONAL') return 'MANAGER_APPROVAL_OPERATIONAL';
  if (template === 'APPROVAL_OPERATIONAL') return 'APPROVAL_OPERATIONAL';
  if (template === 'RICH_OPERATIONAL') return 'RICH_OPERATIONAL';
  if (template === 'COMPACT_LIFECYCLE') return 'LIFECYCLE_COMPACT';
  if (eventCode.indexOf('CUSTOMER_') === 0 || eventCode.indexOf('ECAS_') === 0) return 'EXTERNAL_OPERATIONAL';
  if (eventCode.indexOf('WEEKLY_') === 0 || eventCode === 'PLANNING_WINDOW_ALERT' || eventCode === 'EXPIRY_ALERT') return 'WEEKLY_OVERSIGHT';
  return 'LIFECYCLE_COMPACT';
}

function NB_resolveRendererProfile_(eventCode, cfg, normalized) {
  cfg = cfg || {};
  normalized = normalized || {};
  var template = NB_clean_(cfg.templateFamily).toUpperCase();
  var eventFamily = NB_clean_(normalized.eventFamily || NB_resolveEventFamily_(eventCode, cfg)).toUpperCase();
  eventCode = NB_eventCode_(eventCode);

  if (eventCode === 'AUDIT_PLANNED_BY_AUDITOR' || eventCode === 'AUDIT_APPROVAL_REQUIRED') return 'MANAGER_APPROVAL_OPERATIONAL';
  // AUDIT_ACCEPTED must follow NotificationConfig/templateFamily. Do not force it to EXTERNAL_OPERATIONAL.
  if (template === 'RICH_OPERATIONAL') return 'RICH_OPERATIONAL';
  if (template === 'MANAGER_APPROVAL_OPERATIONAL') return 'MANAGER_APPROVAL_OPERATIONAL';
  if (template === 'APPROVAL_OPERATIONAL') return 'APPROVAL_OPERATIONAL';
  if (template === 'EXTERNAL_OPERATIONAL') return 'EXTERNAL_OPERATIONAL';
  if (template === 'WEEKLY') return 'WEEKLY';
  if (template === 'COMPACT_LIFECYCLE') return 'COMPACT_LIFECYCLE';
  if (eventFamily === 'RICH_OPERATIONAL') return 'RICH_OPERATIONAL';
  if (eventFamily === 'MANAGER_APPROVAL_OPERATIONAL') return 'MANAGER_APPROVAL_OPERATIONAL';
  if (eventFamily === 'APPROVAL_OPERATIONAL') return 'APPROVAL_OPERATIONAL';
  if (eventFamily === 'EXTERNAL_OPERATIONAL') return 'EXTERNAL_OPERATIONAL';
  if (eventFamily === 'WEEKLY_OVERSIGHT') return 'WEEKLY';
  return 'COMPACT_LIFECYCLE';
}

function NB_resolveDeliveryProfile_(eventCode, cfg) {
  cfg = cfg || {};
  var explicit = NB_clean_(cfg.deliveryProfile).toUpperCase();
  if (explicit) return explicit;
  var family = NB_resolveEventFamily_(eventCode, cfg);
  if (family === 'RICH_OPERATIONAL') return 'IMMEDIATE_RICH';
  if (family === 'MANAGER_APPROVAL_OPERATIONAL') return 'IMMEDIATE_OR_TIMED_APPROVAL';
  if (family === 'APPROVAL_OPERATIONAL') return 'IMMEDIATE_OR_TIMED_APPROVAL';
  if (family === 'EXTERNAL_OPERATIONAL') return 'TIMED_EXTERNAL_DIGEST';
  if (family === 'WEEKLY_OVERSIGHT') return 'WEEKLY_DIGEST';
  return cfg.consolidate === false ? 'IMMEDIATE_COMPACT' : 'TIMED_DIGEST';
}

function NB_shouldLoadAuditBriefing_(eventCode, data, cfg) {
  if (data && data.skipAuditBriefing === true) return false;
  var family = NB_resolveEventFamily_(eventCode, cfg || {});
  return family === 'RICH_OPERATIONAL' || family === 'MANAGER_APPROVAL_OPERATIONAL' || family === 'APPROVAL_OPERATIONAL' || family === 'EXTERNAL_OPERATIONAL' || eventCode === 'AUDIT_APPROVED' || eventCode === 'AUDIT_ACCEPTED';
}

function NB_isExternalDigestProfile_(profile, digestGroup, items) {
  profile = NB_clean_(profile).toUpperCase();
  digestGroup = NB_clean_(digestGroup).toUpperCase();
  if (profile === 'EXTERNAL_OPERATIONAL') return true;
  if (digestGroup.indexOf('ECAS') >= 0 || digestGroup.indexOf('CUSTOMER') >= 0) return true;
  for (var i = 0; i < (items || []).length; i++) {
    if (items[i].eventFamily === 'EXTERNAL_OPERATIONAL') return true;
  }
  return false;
}

function NB_isOperationalDigestProfile_(profile, items) {
  profile = NB_clean_(profile).toUpperCase();
  if (profile === 'RICH_OPERATIONAL' || profile === 'APPROVAL_OPERATIONAL' || profile === 'MANAGER_APPROVAL_OPERATIONAL') return true;
  for (var i = 0; i < (items || []).length; i++) {
    var family = NB_clean_(items[i].eventFamily).toUpperCase();
    var itemProfile = NB_clean_(items[i].rendererProfile).toUpperCase();
    if (family === 'RICH_OPERATIONAL' || family === 'APPROVAL_OPERATIONAL' || family === 'MANAGER_APPROVAL_OPERATIONAL') return true;
    if (itemProfile === 'RICH_OPERATIONAL' || itemProfile === 'APPROVAL_OPERATIONAL' || itemProfile === 'MANAGER_APPROVAL_OPERATIONAL') return true;
  }
  return false;
}

/* ============================================================
 * Event text / metadata
 * ============================================================ */

function NB_subjectForEvent_(eventCode, company, auditId) {
  eventCode = NB_eventCode_(eventCode);
  var base = '';
  if (eventCode === 'AUDIT_PLANNED_BY_MANAGER') base = 'Audit planned by manager';
  else if (eventCode === 'AUDIT_PLANNED_BY_AUDITOR') base = 'Audit planned by auditor';
  else if (eventCode === 'AUDIT_APPROVED') base = 'Audit approved';
  else if (eventCode === 'AUDIT_ACCEPTED') base = 'Audit accepted by auditor';
  else if (eventCode === 'AUDIT_COMPLETED') base = 'Audit completed';
  else if (eventCode === 'AUDIT_CANCELLED_BY_MANAGER') base = 'Audit cancelled by manager';
  else if (eventCode === 'AUDIT_DENIED_BY_MANAGER') base = 'Audit planning denied by manager';
  else if (eventCode === 'AUDIT_REJECTED_BY_MANAGER') base = 'Audit rejected by manager';
  else if (eventCode === 'AUDIT_CANCELLED_BY_AUDITOR') base = 'Audit cancelled by auditor';
  else if (eventCode === 'AUDIT_DENIED_BY_AUDITOR') base = 'Audit planning denied by auditor';
  else if (eventCode === 'EXTENSION_APPLIED') base = 'Planning extension applied';
  else if (eventCode === 'EXTENSION_UNDONE') base = 'Planning extension undone';
  else if (eventCode.indexOf('ECAS_') === 0) base = 'Overzicht auditopdrachten Ecert';
  else if (eventCode.indexOf('CUSTOMER_') === 0) base = 'Audit planning update';
  else base = eventCode || 'Audit notification';

  var parts = [base];
  if (company) parts.push(company);
  if (auditId) parts.push(auditId);
  return parts.join(' – ');
}

function NB_titleForEvent_(eventCode) {
  eventCode = NB_eventCode_(eventCode);
  if (eventCode === 'AUDIT_PLANNED_BY_MANAGER') return 'Planned by manager';
  if (eventCode === 'AUDIT_PLANNED_BY_AUDITOR') return 'Planned by auditor';
  if (eventCode === 'AUDIT_APPROVED') return 'Approved by manager';
  if (eventCode === 'AUDIT_ACCEPTED') return 'Accepted by auditor';
  if (eventCode === 'AUDIT_COMPLETED') return 'Completed';
  if (eventCode === 'AUDIT_CANCELLED_BY_MANAGER') return 'Cancelled by manager';
  if (eventCode === 'AUDIT_DENIED_BY_MANAGER') return 'Denied by manager';
  if (eventCode === 'AUDIT_REJECTED_BY_MANAGER') return 'Rejected by manager';
  if (eventCode === 'AUDIT_CANCELLED_BY_AUDITOR') return 'Cancelled by auditor';
  if (eventCode === 'AUDIT_DENIED_BY_AUDITOR') return 'Denied by auditor';
  if (eventCode === 'EXTENSION_APPLIED') return 'Extension applied';
  if (eventCode === 'EXTENSION_UNDONE') return 'Extension undone';
  return '';
}

function NB_defaultResultStatus_(eventCode) {
  eventCode = NB_eventCode_(eventCode);
  if (eventCode === 'AUDIT_PLANNED_BY_MANAGER') return 'Approved';
  if (eventCode === 'AUDIT_PLANNED_BY_AUDITOR') return 'Pending Approval';
  if (eventCode === 'AUDIT_APPROVED') return 'Approved';
  if (eventCode === 'AUDIT_ACCEPTED') return 'Accepted';
  if (eventCode === 'AUDIT_COMPLETED') return 'Completed';
  if (eventCode === 'AUDIT_CANCELLED_BY_MANAGER') return 'Returned to Pending Planning';
  if (eventCode === 'AUDIT_DENIED_BY_MANAGER') return 'Returned to Pending Planning';
  if (eventCode === 'AUDIT_REJECTED_BY_MANAGER') return 'Rejected';
  if (eventCode === 'AUDIT_CANCELLED_BY_AUDITOR') return 'Returned to Pending Planning';
  if (eventCode === 'AUDIT_DENIED_BY_AUDITOR') return 'Returned to Pending Planning';
  if (eventCode === 'EXTENSION_APPLIED') return 'Extension applied';
  if (eventCode === 'EXTENSION_UNDONE') return 'Extension undone';
  return '';
}

function NB_displayResultStatus_(eventCode, resultStatus, recipientRole) {
  eventCode = NB_eventCode_(eventCode);
  var role = NB_clean_(recipientRole).toLowerCase();
  var status = NB_clean_(resultStatus);
  var key = status.toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
  if (eventCode === 'AUDIT_PLANNED_BY_MANAGER' && role === 'auditor' && key === 'approved') return 'Pending acceptance';
  return status;
}

function NB_nextStepsForEvent_(eventCode, recipientRole) {
  eventCode = NB_eventCode_(eventCode);
  if (eventCode === 'AUDIT_PLANNED_BY_MANAGER') return ['The audit has been planned by the manager.', 'Please review and accept or deny the planning.'];
  if (eventCode === 'AUDIT_PLANNED_BY_AUDITOR') return ['The audit has been planned by the auditor.', 'The manager should review and approve or deny the planning.'];
  if (eventCode === 'AUDIT_APPROVED') return ['The planning is approved.', 'Please add the calendar item(s) for each audit day.'];
  if (eventCode === 'AUDIT_ACCEPTED') return ['The audit is accepted by the auditor.', 'Execution can proceed as planned.'];
  if (eventCode === 'AUDIT_COMPLETED') return ['Completion data was submitted.', 'The manager should review and finalize.'];
  if (eventCode === 'AUDIT_CANCELLED_BY_MANAGER' || eventCode === 'AUDIT_CANCELLED_BY_AUDITOR') return ['The audit is cancelled.', 'If needed, a new planning must be created.'];
  if (eventCode === 'AUDIT_DENIED_BY_MANAGER' || eventCode === 'AUDIT_DENIED_BY_AUDITOR') return ['Planning was denied.', 'The audit returns to replanning flow.'];
  if (eventCode === 'AUDIT_REJECTED_BY_MANAGER') return ['The audit is rejected final.', 'Follow-up should be handled outside the planning flow.'];
  if (eventCode === 'EXTENSION_APPLIED') return ['The planning window extension has been applied.'];
  if (eventCode === 'EXTENSION_UNDONE') return ['The planning window extension has been undone.'];
  return [];
}

function NB_shouldIncludeComment_(eventCode, comment, cfg) {
  eventCode = NB_eventCode_(eventCode);
  comment = NB_clean_(comment);
  cfg = cfg || NB_getEventConfig_(eventCode);
  if (cfg && cfg.hasOwnProperty('includeComment')) {
    if (!cfg.includeComment) return false;
    if (!comment && !cfg.requireReason) return false;
    return true;
  }
  return (
    eventCode === 'AUDIT_CANCELLED_BY_MANAGER' ||
    eventCode === 'AUDIT_DENIED_BY_MANAGER' ||
    eventCode === 'AUDIT_REJECTED_BY_MANAGER' ||
    eventCode === 'AUDIT_CANCELLED_BY_AUDITOR' ||
    eventCode === 'AUDIT_DENIED_BY_AUDITOR'
  ) && !!comment;
}

function NB_assertRequiredReason_(eventCode, cfg, normalized) {
  cfg = cfg || {};
  normalized = normalized || {};
  if (!cfg.requireReason) return;
  var reason = NB_clean_(normalized.reason || normalized.comment || normalized.decisionReason || normalized.cancelReason || normalized.denyReason || normalized.rejectReason);
  if (!reason) throw new Error('Notification reason is required but missing for event ' + NB_eventCode_(eventCode) + '. Queue row not created.');
}

function NB_reasonText_(data, briefing) {
  data = data || {};
  briefing = briefing || {};
  return NB_clean_(
    data.reason || data.cancelReason || data.cancellationReason || data.denyReason || data.denialReason ||
    data.rejectReason || data.rejectionReason || data.decisionReason || data.managerDecisionReason ||
    data.auditorDecisionReason || data.lastDecisionReason || data.comment || data.comments ||
    briefing.reason || briefing.cancelReason || briefing.decisionReason || briefing.comment || ''
  );
}

/* ============================================================
 * Audit briefing loader
 * ============================================================ */

function NB_loadAuditBriefing_(auditId, payload) {
  payload = payload || {};
  auditId = NB_clean_(auditId || payload.auditId);
  var out = {
    auditId:auditId,
    auditNumber:NB_clean_(payload.auditNumber || payload.mpsNumber || payload.number),
    company:NB_clean_(payload.company),
    companyUid:'',
    status:NB_clean_(payload.resultStatus),
    auditorEmail:NB_clean_(payload.auditorEmail),
    auditorName:NB_clean_(payload.auditorName),
    contactName:NB_clean_(payload.contactName),
    contactEmail:NB_clean_(payload.contactEmail),
    contactPhone:NB_clean_(payload.contactPhone),
    language:NB_clean_(payload.language),
    region:NB_clean_(payload.region),
    country:NB_clean_(payload.country),
    comments:NB_clean_(payload.companyComments || payload.companyComment || payload.comments),
    reason:NB_reasonText_(payload, {}),
    planningWindowFrom:NB_clean_(payload.planningWindowFrom || payload.planFrom || payload.windowFrom),
    planningWindowTo:NB_clean_(payload.planningWindowTo || payload.planTo || payload.windowTo),
    scopes:NB_normalizeList_(payload.scopes || []),
    blocks:Array.isArray(payload.blocks) ? payload.blocks.slice() : [],
    plannedHours:payload.plannedHours != null ? payload.plannedHours : '',
    planningJson:NB_clean_(payload.planningJson),
    locations:NB_normalizeLocations_(payload.locations || []),
    warnings:[]
  };
  if (!auditId) return out;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ap = ss.getSheetByName('Audit planning');
    if (!ap) { out.warnings.push("Missing sheet 'Audit planning'"); return out; }
    var lastRow = ap.getLastRow();
    var lastCol = ap.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return out;

    var hdr = ap.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var idx = NB_headerIndexMapLoose_(hdr);
    var cAuditId = NB_findColLoose_(idx, ['Audit ID', 'Audit_ID', 'AuditId']);
    if (cAuditId < 0) return out;

    var cell = ap.getRange(2, cAuditId + 1, lastRow - 1, 1).createTextFinder(auditId).matchEntireCell(true).findNext();
    if (!cell) return out;
    var row = ap.getRange(cell.getRow(), 1, 1, lastCol).getValues()[0] || [];

    out.company = out.company || NB_cellLoose_(row, idx, ['Company']);
    out.auditNumber = out.auditNumber || NB_cellLoose_(row, idx, ['Number', 'MPS Number', 'MPS-number', 'MPS no', 'MPS No.']);
    out.companyUid = NB_cellLoose_(row, idx, ['Company_UID', 'Company UID', 'CompanyUid']);
    out.status = out.status || NB_cellLoose_(row, idx, ['Status']);
    out.auditorEmail = out.auditorEmail || NB_cellLoose_(row, idx, ['Assigned to', 'Assigned To', 'Assigned auditor', 'Auditor']);
    out.contactName = out.contactName || NB_cellLoose_(row, idx, ['Contactperson', 'Contact person', 'Contact']);
    out.contactEmail = out.contactEmail || NB_cellLoose_(row, idx, ['Contactperson e-mail', 'Contactperson email', 'Contact e-mail', 'Contact email']);
    out.contactPhone = out.contactPhone || NB_cellLoose_(row, idx, ['Contactperson phone', 'Contact phone', 'Phone', 'Telephone']);
    out.language = out.language || NB_cellLoose_(row, idx, ['Language communication', 'Language', 'Communication language']);
    out.region = out.region || NB_cellLoose_(row, idx, ['Region']);
    out.country = out.country || NB_cellLoose_(row, idx, ['Country']);
    out.comments = out.comments || NB_cellLoose_(row, idx, ['Comments', 'Comment', 'Company comments']);
    out.reason = out.reason || NB_cellLoose_(row, idx, ['Reason', 'Decision reason', 'Last decision reason', 'Cancel reason', 'Cancellation reason', 'Deny reason', 'Denial reason', 'Reject reason', 'Rejection reason', 'Manager decision reason', 'Auditor decision reason']);
    out.planningWindowFrom = out.planningWindowFrom || NB_cellLoose_(row, idx, ['Planning window from', 'Plan van', 'Audit window from']);
    out.planningWindowTo = out.planningWindowTo || NB_cellLoose_(row, idx, ['Planning window to', 'Plant tot', 'Audit window to']);

    var planRaw = NB_cellLoose_(row, idx, ['Planning JSON', 'PlanningJSON', 'Planning']);
    out.planningJson = out.planningJson || planRaw;
    var parsedBlocks = NB_parsePlanningBlocks_(planRaw);
    if (parsedBlocks.length) out.blocks = parsedBlocks;
    if (out.plannedHours === '' || out.plannedHours === null) out.plannedHours = NB_sumBlockHours_(out.blocks);
    if (!out.scopes.length) out.scopes = NB_extractScopesFromAuditRow_(hdr, row);
    if (!out.locations.length) out.locations = NB_loadCompanyLocationsForBriefing_(ss, out.companyUid, out.company);
    if (!out.auditNumber) out.auditNumber = NB_loadCompanyNumberForBriefing_(ss, out.companyUid, out.company);
  } catch (e) {
    out.warnings.push('Briefing load failed: ' + String(e && e.message ? e.message : e));
  }
  return out;
}

function NB_parsePlanningBlocks_(raw) {
  var out = [];
  raw = NB_clean_(raw);
  if (!raw) return out;
  try {
    var obj = JSON.parse(raw);
    var arr = [];
    if (Array.isArray(obj)) arr = obj;
    else if (obj && Array.isArray(obj.blocks)) arr = obj.blocks;
    else if (obj && Array.isArray(obj.slots)) arr = obj.slots;
    else if (obj && Array.isArray(obj.days)) arr = obj.days;
    else if (obj && Array.isArray(obj.segments)) arr = obj.segments;
    for (var i = 0; i < arr.length; i++) out.push(NB_normalizeBlock_(arr[i] || {}));
  } catch (e) {}
  return out;
}

function NB_normalizeBlocks_(blocks, planningJson) {
  var out = [];
  if (Array.isArray(blocks)) for (var i = 0; i < blocks.length; i++) out.push(NB_normalizeBlock_(blocks[i] || {}));
  if (!out.length && planningJson) out = NB_parsePlanningBlocks_(planningJson);
  return out;
}

function NB_normalizeBlock_(b) {
  b = b || {};
  return {
    date:NB_clean_(b.date || b.day || b.plannedDate),
    dayName:NB_clean_(b.dayName || b.weekday),
    start:NB_clean_(b.start || b.startTime || b.from),
    end:NB_clean_(b.end || b.endTime || b.to),
    hours:b.hours != null && b.hours !== '' ? b.hours : '',
    execLoc:NB_clean_(b.execLoc || b.executionLocation || b.location || b.locationName),
    gps:NB_clean_(b.gps || b.GPS || b.coordinates),
    slotComment:NB_clean_(b.slotComment || b.comment || b.comments),
    calendarLink:NB_clean_(b.calendarLink || b.googleCalendarLink || b.calendarUrl),
    googleCalendarLink:NB_clean_(b.googleCalendarLink || b.calendarLink || b.calendarUrl),
    appleCalendarLink:NB_clean_(b.appleCalendarLink || b.appleCalendarUrl || b.icsUrl)
  };
}

function NB_sumBlockHours_(blocks) {
  var total = 0;
  for (var i = 0; i < (blocks || []).length; i++) {
    var b = blocks[i] || {};
    var h = Number(b.hours || 0);
    if (isFinite(h) && h > 0) { total += h; continue; }
    var s = NB_hhmmToMinutes_(b.start);
    var e = NB_hhmmToMinutes_(b.end);
    if (isFinite(s) && isFinite(e) && e > s) total += (e - s) / 60;
  }
  return total ? Math.round(total * 100) / 100 : '';
}

function NB_hhmmToMinutes_(v) {
  var m = NB_clean_(v).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function NB_blocksToDates_(blocks) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (blocks || []).length; i++) {
    var d = NB_clean_(blocks[i].date);
    if (!d || seen[d]) continue;
    seen[d] = true;
    out.push(d);
  }
  return out;
}

function NB_extractScopesFromAuditRow_(hdr, row) {
  var out = [];
  var seen = {};
  function push_(value) {
    var v = NB_clean_(value);
    if (!v || /^(NO|FALSE|0|N)$/i.test(v)) return;
    var parts = v.split(/[,;\n]/);
    for (var p = 0; p < parts.length; p++) {
      var part = NB_clean_(parts[p]);
      if (!part || /^(YES|TRUE|1|Y|X)$/i.test(part)) continue;
      var key = NB_normLoose_(part);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(part);
    }
  }

  var scopeHeaderMap = NB_loadScopeHeaderMap_();
  for (var i = 0; i < (hdr || []).length; i++) {
    var rawHeader = NB_clean_(hdr[i]);
    var h = rawHeader.toUpperCase();
    var value = NB_clean_(row[i]);
    if (/^(SCOPES|SCOPE|SCOPES_LIST|SCOPE_LIST)$/i.test(rawHeader)) { push_(value); continue; }
    if (/^SCOPE_\d+/.test(h) && h.indexOf('DURATION') < 0) {
      if (!value || /^(NO|FALSE|0|N)$/i.test(value)) continue;
      push_(NB_clean_(rawHeader.replace(/^SCOPE_\d+[_\s-]*/i, '')) || value || rawHeader);
      continue;
    }
    var mapped = scopeHeaderMap[NB_normLoose_(rawHeader)];
    if (mapped && value && !/^(NO|FALSE|0|N)$/i.test(value)) push_(mapped);
  }
  return out;
}

function NB_loadScopeHeaderMap_() {
  var out = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Config_Scopes');
    if (!sh) return out;
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return out;
    var hdr = values[0] || [];
    var idx = NB_headerIndexMapLoose_(hdr);
    var cSlot = NB_findColLoose_(idx, ['SlotKey', 'Slot Key', 'Header', 'Column']);
    var cCode = NB_findColLoose_(idx, ['ScopeCode', 'Scope Code', 'Code']);
    var cName = NB_findColLoose_(idx, ['DisplayName', 'Display Name', 'Name', 'Label']);
    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var slot = cSlot >= 0 ? NB_clean_(row[cSlot]) : '';
      var code = cCode >= 0 ? NB_clean_(row[cCode]) : '';
      var name = cName >= 0 ? NB_clean_(row[cName]) : '';
      var label = name || code || slot;
      if (!label) continue;
      if (slot) out[NB_normLoose_(slot)] = label;
      if (code) out[NB_normLoose_(code)] = label;
      if (name) out[NB_normLoose_(name)] = label;
    }
  } catch (e) {}
  return out;
}

/* ============================================================
 * Validation summary
 * ============================================================ */

function NB_buildValidationSummary_(data, briefing, blocks, companyUid, companyName, scopes) {
  data = data || {};
  briefing = briefing || {};
  blocks = blocks || [];
  scopes = scopes || [];
  var out = { companyConstraints:[], auditConstraints:[], auditorRotation:[], qualification:[], complete:false, sources:[] };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var companyMeta = NB_loadCompanyConstraintMeta_(ss, companyUid, companyName);
    out.companyConstraints = NB_evaluateCompanyConstraints_(companyMeta, blocks);
    out.sources.push('Companies');
  } catch (e) {
    out.companyConstraints = [{ level:'info', checked:false, text:'Company constraints not checked: ' + NB_clean_(e && e.message ? e.message : e) }];
  }

  try {
    out.auditConstraints = NB_evaluateAuditConstraints_(data, briefing, blocks);
    out.sources.push('Audit planning');
  } catch (e2) {
    out.auditConstraints = [{ level:'info', checked:false, text:'Audit constraints not checked: ' + NB_clean_(e2 && e2.message ? e2.message : e2) }];
  }

  var rq = NB_evaluateAuditorRotationAndQualification_(data, briefing, scopes);
  out.auditorRotation = rq.rotation || [];
  out.qualification = rq.qualification || [];
  for (var q = 0; q < out.qualification.length; q++) out.auditorRotation.push(out.qualification[q]);
  if (rq.sources && rq.sources.length) for (var s = 0; s < rq.sources.length; s++) out.sources.push(rq.sources[s]);
  out.complete = NB_validationGroupComplete_(out.companyConstraints) && NB_validationGroupComplete_(out.auditConstraints) && NB_validationGroupComplete_(out.auditorRotation);
  return out;
}

function NB_validationGroupComplete_(items) {
  items = items || [];
  if (!items.length) return false;
  for (var i = 0; i < items.length; i++) if (items[i] && items[i].checked === false) return false;
  return true;
}

function NB_loadCompanyConstraintMeta_(ss, companyUid, companyName) {
  var out = { found:false };
  try {
    var sh = ss.getSheetByName('Companies');
    if (!sh) return out;
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return out;
    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var idx = NB_headerIndexMapLoose_(hdr);
    var cUid = NB_findColLoose_(idx, ['Company_UID', 'Company UID', 'CompanyUid']);
    var cName = NB_findColLoose_(idx, ['Company', 'Company name', 'Name']);
    var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var uidKey = NB_clean_(companyUid).toLowerCase();
    var nameKey = NB_clean_(companyName).toLowerCase();
    var row = null;
    for (var r = 0; r < rows.length; r++) {
      var candidate = rows[r] || [];
      var uid = cUid >= 0 ? NB_clean_(candidate[cUid]).toLowerCase() : '';
      var nm = cName >= 0 ? NB_clean_(candidate[cName]).toLowerCase() : '';
      if ((uidKey && uid === uidKey) || (!uidKey && nameKey && nm === nameKey)) { row = candidate; break; }
    }
    if (!row) return out;
    out.found = true;
    out.preferredDays = NB_cellLoose_(row, idx, ['Preferred audit weekdays', 'Preferred weekdays', 'Preferred days', 'Audit weekdays', 'Preferred audit days']);
    out.avoidDays = NB_cellLoose_(row, idx, ['Avoid weekdays', 'Blocked weekdays', 'Company blocked weekdays', 'Not on weekdays', 'No audit weekdays']);
    out.timeFrom = NB_cellLoose_(row, idx, ['Preferred start time', 'Audit time from', 'Preferred time from', 'Time from']);
    out.timeTo = NB_cellLoose_(row, idx, ['Preferred end time', 'Audit time to', 'Preferred time to', 'Time to']);
  } catch (e) {}
  return out;
}

function NB_evaluateCompanyConstraints_(meta, blocks) {
  meta = meta || {};
  blocks = blocks || [];
  var out = [];
  if (!meta.found) return [{ level:'info', checked:false, text:'Company constraints not checked: company record not found' }];

  var plannedDayTokens = [];
  for (var i = 0; i < blocks.length; i++) {
    var day = NB_dayToken_(blocks[i].dayName || blocks[i].date);
    if (day) plannedDayTokens.push(day);
  }
  var avoidTokens = NB_dayTokens_(meta.avoidDays);
  var preferredTokens = NB_dayTokens_(meta.preferredDays);
  var hasAvoidHit = NB_anyOverlap_(plannedDayTokens, avoidTokens);
  var hasPreferredMiss = preferredTokens.length ? !NB_allIn_(plannedDayTokens, preferredTokens) : false;

  if (hasAvoidHit || hasPreferredMiss) out.push({ level:'warning', checked:true, text:'Planned on non-preferred day' });
  else if (preferredTokens.length || avoidTokens.length) out.push({ level:'ok', checked:true, text:'Preferred day constraint OK' });
  else out.push({ level:'info', checked:false, text:'Preferred/blocked weekdays not configured' });

  if (meta.timeFrom || meta.timeTo) {
    var inTime = NB_blocksWithinTimeWindow_(blocks, meta.timeFrom, meta.timeTo);
    out.push({ level:inTime ? 'ok' : 'warning', checked:true, text:inTime ? 'Time window OK' : 'Outside preferred time window' });
  } else {
    out.push({ level:'info', checked:false, text:'Company time window not configured' });
  }
  return out;
}

function NB_evaluateAuditConstraints_(data, briefing, blocks) {
  data = data || {};
  briefing = briefing || {};
  blocks = blocks || [];
  var out = [];
  var from = NB_clean_(data.planningWindowFrom || data.planFrom || data.windowFrom || briefing.planningWindowFrom);
  var to = NB_clean_(data.planningWindowTo || data.planTo || data.windowTo || briefing.planningWindowTo);
  if (from || to) {
    var inWindow = NB_blocksWithinDateWindow_(blocks, from, to);
    out.push({ level:inWindow ? 'ok' : 'warning', checked:true, text:inWindow ? 'Planning window OK' : 'Outside planning window' });
  } else {
    out.push({ level:'info', checked:false, text:'Planning window not checked: source values missing' });
  }
  if (data.availabilityChecks || data.availabilityCheck) {
    var av = data.availabilityChecks || data.availabilityCheck;
    if (!Array.isArray(av)) av = [av];
    for (var i = 0; i < av.length; i++) out.push(NB_normalizeValidationItem_(av[i], 'Availability check supplied'));
  } else {
    out.push({ level:'info', checked:false, text:'Availability conflict check not supplied to notification builder' });
  }
  return out;
}

function NB_evaluateAuditorRotationAndQualification_(data, briefing, scopes) {
  data = data || {};
  briefing = briefing || {};
  scopes = scopes || [];
  if (data.rotationChecks || data.auditorChecks || data.qualificationChecks) {
    var provided = data.rotationChecks || data.auditorChecks || data.qualificationChecks;
    var arr = Array.isArray(provided) ? provided : [provided];
    return { rotation:arr.map(function(x){ return NB_normalizeValidationItem_(x, 'Auditor check supplied'); }), qualification:[], sources:['payload'] };
  }

  var auditorEmail = NB_clean_(data.auditorEmail || briefing.auditorEmail || data.actorEmail || data.actor);
  var companyUid = NB_clean_(data.companyUid || data.companyUID || briefing.companyUid);
  var companyName = NB_clean_(data.company || briefing.company);
  var rotation = [];
  var qualification = [];
  var sources = [];

  if (!auditorEmail) return { rotation:[{ level:'info', checked:false, text:'Rotation not checked: auditor email missing' }], qualification:[{ level:'info', checked:false, text:'Qualification not checked: auditor email missing' }], sources:sources };
  if (!scopes.length) return { rotation:[{ level:'info', checked:false, text:'Rotation not checked: scopes missing' }], qualification:[{ level:'info', checked:false, text:'Qualification not checked: scopes missing' }], sources:sources };

  if (typeof RotationAuditorService_getAuditorScopeResult === 'function') {
    sources.push('RotationAuditorService');
    for (var r = 0; r < scopes.length; r++) {
      var scope = scopes[r];
      try {
        var rr = RotationAuditorService_getAuditorScopeResult({ companyUid:companyUid, companyName:companyName, company:companyName, auditorEmail:auditorEmail, scope:scope }) || {};
        var status = NB_clean_(rr.status || '').toUpperCase();
        var detail = NB_clean_(rr.detail || (scope + ': rotation checked'));
        var warn = status.indexOf('LIMIT') >= 0 || status.indexOf('BLOCK') >= 0 || status.indexOf('FAIL') >= 0;
        rotation.push({ level:warn ? 'warning' : 'ok', checked:true, text:warn ? ('Rotation warning: ' + detail) : ('Rotation compliant: ' + detail) });
      } catch (e) {
        rotation.push({ level:'info', checked:false, text:'Rotation not checked for ' + scope + ': ' + NB_clean_(e && e.message ? e.message : e) });
      }
    }
  } else {
    rotation.push({ level:'info', checked:false, text:'Rotation not checked: RotationAuditorService_getAuditorScopeResult unavailable' });
  }

  if (typeof AuditorsIndex_IsQualified === 'function') {
    sources.push('AuditorsIndex');
    for (var q = 0; q < scopes.length; q++) {
      var qScope = scopes[q];
      try {
        var ok = AuditorsIndex_IsQualified(auditorEmail, qScope);
        qualification.push({ level:ok ? 'ok' : 'warning', checked:true, text:ok ? ('Qualified for ' + qScope) : ('Not qualified for ' + qScope) });
      } catch (e2) {
        qualification.push({ level:'info', checked:false, text:'Qualification not checked for ' + qScope + ': ' + NB_clean_(e2 && e2.message ? e2.message : e2) });
      }
    }
  } else {
    qualification.push({ level:'info', checked:false, text:'Qualification not checked: AuditorsIndex_IsQualified unavailable' });
  }
  return { rotation:rotation, qualification:qualification, sources:sources };
}

function NB_normalizeValidationItem_(item, fallbackText) {
  if (typeof item === 'string') return { level:'ok', checked:true, text:item || fallbackText || 'Check supplied' };
  item = item || {};
  var text = NB_clean_(item.text || item.message || item.label || item.name || fallbackText || 'Check supplied');
  var level = NB_clean_(item.level || item.status || '').toLowerCase() || 'ok';
  var checked = item.checked === false ? false : true;
  return { level:level, checked:checked, text:text };
}

/* ============================================================
 * Company lookup helpers
 * ============================================================ */

function NB_loadCompanyNumberForBriefing_(ss, companyUid, companyName) {
  try {
    var sh = ss.getSheetByName('Companies');
    if (!sh) return '';
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return '';
    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var idx = NB_headerIndexMapLoose_(hdr);
    var cUid = NB_findColLoose_(idx, ['Company_UID', 'Company UID', 'CompanyUid']);
    var cName = NB_findColLoose_(idx, ['Company', 'Company name', 'Name']);
    var cNumber = NB_findColLoose_(idx, ['Number', 'MPS Number', 'MPS-number', 'MPS no', 'MPS No.']);
    if (cNumber < 0) return '';
    var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var uidKey = NB_clean_(companyUid).toLowerCase();
    var nameKey = NB_clean_(companyName).toLowerCase();
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [];
      var uid = cUid >= 0 ? NB_clean_(row[cUid]).toLowerCase() : '';
      var nm = cName >= 0 ? NB_clean_(row[cName]).toLowerCase() : '';
      if ((uidKey && uid === uidKey) || (!uidKey && nameKey && nm === nameKey)) return NB_clean_(row[cNumber]);
    }
  } catch (e) {}
  return '';
}

function NB_loadCompanyLocationsForBriefing_(ss, companyUid, companyName) {
  var out = [];
  try {
    var sh = ss.getSheetByName('Companies');
    if (!sh) return out;
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return out;
    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var idx = NB_headerIndexMapLoose_(hdr);
    var cUid = NB_findColLoose_(idx, ['Company_UID', 'Company UID', 'CompanyUid']);
    var cName = NB_findColLoose_(idx, ['Company', 'Company name', 'Name']);
    var cJson = NB_findColLoose_(idx, ['Locations_JSON', 'Locations JSON', 'LocationsJson']);
    var cGps = NB_findColLoose_(idx, ['GPS-data', 'GPS data', 'GPS']);
    var cComments = NB_findColLoose_(idx, ['Comments', 'Comment']);
    var cCountry = NB_findColLoose_(idx, ['Country']);
    var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var uidKey = NB_clean_(companyUid).toLowerCase();
    var nameKey = NB_clean_(companyName).toLowerCase();
    var matchRow = null;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [];
      var uid = cUid >= 0 ? NB_clean_(row[cUid]).toLowerCase() : '';
      var nm = cName >= 0 ? NB_clean_(row[cName]).toLowerCase() : '';
      if ((uidKey && uid === uidKey) || (!uidKey && nameKey && nm === nameKey)) { matchRow = row; break; }
    }
    if (!matchRow) return out;
    out = NB_parseLocationsJson_(cJson >= 0 ? NB_clean_(matchRow[cJson]) : '');
    if (!out.length) {
      var gps = cGps >= 0 ? NB_clean_(matchRow[cGps]) : '';
      var comments = cComments >= 0 ? NB_clean_(matchRow[cComments]) : '';
      if (gps || comments) out.push({ active:true, code:'HQ', name:'HQ', gps:gps, comment:comments, country:cCountry >= 0 ? NB_clean_(matchRow[cCountry]) : '' });
    }
  } catch (e) {}
  return out;
}

function NB_parseLocationsJson_(raw) {
  var out = [];
  raw = NB_clean_(raw);
  if (!raw) return out;
  try {
    var parsed = JSON.parse(raw);
    var arr = [];
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.locations)) arr = parsed.locations;
    else if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach(function(k) {
        var v = parsed[k];
        if (v && typeof v === 'object') {
          if (!v.code && !v.key) v.code = k;
          arr.push(v);
        }
      });
    }
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i] || {};
      var activeRaw = NB_clean_(it.active != null ? it.active : it.isActive);
      var active = activeRaw ? !/^(NO|FALSE|0|N)$/i.test(activeRaw) : true;
      if (!active) continue;
      out.push({
        active:true,
        code:NB_clean_(it.code || it.key || it.locationCode || it.id),
        name:NB_clean_(it.name || it.locationName || it.label || it.code || it.key || 'Location'),
        gps:NB_clean_(it.gps || it.GPS || it.coordinates || it.gpsData),
        comment:NB_clean_(it.comment || it.comments || it.note || it.notes),
        country:NB_clean_(it.country || it.Country)
      });
    }
  } catch (e) {}
  return out;
}

/* ============================================================
 * Constraint date/time helpers
 * ============================================================ */

function NB_dayTokens_(value) {
  var out = [];
  var parts = NB_clean_(value).split(/[,;\n\/|]+/);
  for (var i = 0; i < parts.length; i++) {
    var t = NB_dayToken_(parts[i]);
    if (t && out.indexOf(t) < 0) out.push(t);
  }
  return out;
}

function NB_dayToken_(value) {
  var s = NB_clean_(value).toLowerCase();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var d = NB_parseIsoDate_(s);
    if (!d) return '';
    return ['sun','mon','tue','wed','thu','fri','sat'][d.getDay()];
  }
  if (s.indexOf('mon') === 0 || s.indexOf('maa') === 0) return 'mon';
  if (s.indexOf('tue') === 0 || s.indexOf('din') === 0) return 'tue';
  if (s.indexOf('wed') === 0 || s.indexOf('woe') === 0) return 'wed';
  if (s.indexOf('thu') === 0 || s.indexOf('don') === 0) return 'thu';
  if (s.indexOf('fri') === 0 || s.indexOf('vrij') === 0) return 'fri';
  if (s.indexOf('sat') === 0 || s.indexOf('zat') === 0) return 'sat';
  if (s.indexOf('sun') === 0 || s.indexOf('zon') === 0) return 'sun';
  return '';
}

function NB_anyOverlap_(a, b) {
  var set = {};
  for (var i = 0; i < (a || []).length; i++) set[a[i]] = true;
  for (var j = 0; j < (b || []).length; j++) if (set[b[j]]) return true;
  return false;
}

function NB_allIn_(values, allowed) {
  if (!(values || []).length) return false;
  var set = {};
  for (var i = 0; i < (allowed || []).length; i++) set[allowed[i]] = true;
  for (var j = 0; j < values.length; j++) if (!set[values[j]]) return false;
  return true;
}

function NB_blocksWithinTimeWindow_(blocks, from, to) {
  var f = NB_hhmmToMinutes_(NB_timeOnly_(from));
  var t = NB_hhmmToMinutes_(NB_timeOnly_(to));
  if (!isFinite(f) && !isFinite(t)) return true;
  for (var i = 0; i < (blocks || []).length; i++) {
    var b = blocks[i] || {};
    var s = NB_hhmmToMinutes_(NB_timeOnly_(b.start));
    var e = NB_hhmmToMinutes_(NB_timeOnly_(b.end));
    if (isFinite(f) && isFinite(s) && s < f) return false;
    if (isFinite(t) && isFinite(e) && e > t) return false;
  }
  return true;
}

function NB_blocksWithinDateWindow_(blocks, from, to) {
  var f = NB_parseIsoDate_(from);
  var t = NB_parseIsoDate_(to);
  if (!f && !t) return true;
  for (var i = 0; i < (blocks || []).length; i++) {
    var d = NB_parseIsoDate_(blocks[i] && blocks[i].date);
    if (!d) continue;
    if (f && d.getTime() < f.getTime()) return false;
    if (t && d.getTime() > t.getTime()) return false;
  }
  return true;
}

function NB_parseIsoDate_(value) {
  var s = NB_clean_(value);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function NB_timeOnly_(value) {
  var s = NB_clean_(value);
  var m = s.match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : s;
}

/* ============================================================
 * Config consumer only
 * ============================================================ */

function NB_getEventConfig_(eventCode) {
  eventCode = NB_eventCode_(eventCode);
  if (typeof NotificationConfig_GetEvent === 'function') return NotificationConfig_GetEvent(eventCode);
  return NB_defaultEventConfig_(eventCode);
}

function NB_defaultEventConfig_(eventCode) {
  eventCode = NB_eventCode_(eventCode);
  var includeComment = false;
  var requireReason = false;
  if (eventCode === 'AUDIT_CANCELLED_BY_MANAGER' || eventCode === 'AUDIT_DENIED_BY_MANAGER' || eventCode === 'AUDIT_REJECTED_BY_MANAGER') {
    includeComment = true;
    requireReason = true;
  } else if (eventCode === 'AUDIT_CANCELLED_BY_AUDITOR' || eventCode === 'AUDIT_DENIED_BY_AUDITOR') {
    includeComment = true;
    requireReason = false;
  }
  return {
    eventKey:eventCode,
    active:true,
    sendEmail:true,
    logOnly:false,
    eventClass:'TRANSACTION',
    description:'',
    recipientMode:'',
    recipientTarget:'',
    consolidate:true,
    bufferMinutes:10,
    digestGroup:'',
    templateFamily:'',
    templateKeyDefault:eventCode,
    fromEmail:NB_DEFAULT_FROM_EMAIL,
    fromName:NB_DEFAULT_FROM_NAME,
    replyTo:'',
    requireReason:requireReason,
    includeComment:includeComment,
    sortOrder:0,
    notes:''
  };
}

function NB_loadNotificationConfig_() {
  if (typeof NotificationConfig_GetAllEvents === 'function') return NotificationConfig_GetAllEvents();
  return {};
}

function NB_getRuleValue_(ruleKey, defaultValue) {
  if (typeof NotificationConfig_GetRule === 'function') return NotificationConfig_GetRule(ruleKey, defaultValue);
  return defaultValue;
}

function NB_loadNotificationRules_() {
  if (typeof NotificationConfig_GetAllRules === 'function') return NotificationConfig_GetAllRules();
  return {};
}

function NB_InvalidateConfigCache() {
  if (typeof NotificationConfig_ClearCache === 'function') return NotificationConfig_ClearCache();
  return { success:true, ok:true };
}

/* ============================================================
 * Generic non-renderer helpers
 * ============================================================ */

function NB_eventCode_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function NB_clean_(v) { return String(v == null ? '' : v).trim(); }

function NB_normalizeList_(value) {
  var out = [];
  var seen = {};
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) NB_pushUnique_(out, seen, value[i]);
    return out;
  }
  var raw = NB_clean_(value);
  if (!raw) return out;
  var parts = raw.split(/[,;\n]/);
  for (var j = 0; j < parts.length; j++) NB_pushUnique_(out, seen, parts[j]);
  return out;
}

function NB_pushUnique_(out, seen, value) {
  var v = NB_clean_(value);
  if (!v) return;
  var k = v.toLowerCase();
  if (seen[k]) return;
  seen[k] = true;
  out.push(v);
}

function NB_normalizeLocations_(locations) {
  var out = [];
  if (!Array.isArray(locations)) return out;
  for (var i = 0; i < locations.length; i++) {
    var it = locations[i] || {};
    out.push({
      active:it.active !== false,
      code:NB_clean_(it.code || it.key || it.locationCode),
      name:NB_clean_(it.name || it.locationName || it.label || it.code || 'Location'),
      gps:NB_clean_(it.gps || it.GPS || it.coordinates),
      comment:NB_clean_(it.comment || it.comments || it.note),
      country:NB_clean_(it.country)
    });
  }
  return out;
}

function NB_normalizeCta_(cta) {
  cta = cta || {};
  return {
    acceptUrl:NB_clean_(cta.acceptUrl || cta.accept || ''),
    denyUrl:NB_clean_(cta.denyUrl || cta.deny || ''),
    portalUrl:NB_clean_(cta.portalUrl || cta.auditorPortalUrl || cta.portal || '')
  };
}

function NB_mergeObjects_(a, b) {
  var out = {};
  var k;
  a = a || {};
  b = b || {};
  for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
  for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
  return out;
}

function NB_blockLineText_(b) {
  b = b || {};
  var parts = [];
  if (b.date) parts.push(b.date);
  if (b.dayName) parts.push(b.dayName);
  if (b.start || b.end) parts.push(NB_clean_(b.start) + '-' + NB_clean_(b.end));
  if (b.hours !== '' && b.hours !== null && typeof b.hours !== 'undefined') parts.push(String(b.hours) + 'h');
  if (b.execLoc) parts.push(b.execLoc);
  if (b.gps) parts.push('GPS: ' + b.gps);
  if (b.slotComment) parts.push(b.slotComment);
  return parts.join(' | ');
}

function NB_planningSummaryText_(n) {
  var blocks = (n && n.blocks) || [];
  if (!blocks.length) return '';
  if (blocks.length === 1) return NB_blockLineText_(blocks[0]);
  return blocks[0].date + ' - ' + blocks[blocks.length - 1].date + ' (' + blocks.length + ' days)';
}

function NB_formatHours_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  var n = Number(value);
  if (!isNaN(n)) return String(n).replace(/\.0+$/, '') + 'h';
  var s = NB_clean_(value);
  if (!s) return '';
  return /h$/i.test(s) ? s : s + 'h';
}

function NB_hashQueueRow_(recipientEmail, eventType, payload, built) {
  return NB_hashText_(JSON.stringify({ to:recipientEmail, type:String(eventType || ''), payload:payload, subject:built.subject, body:built.body }));
}

function NB_hashText_(text) {
  try {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text || ''), Utilities.Charset.UTF_8).map(function(b) {
      var v = (b < 0 ? b + 256 : b);
      return ('0' + v.toString(16)).slice(-2);
    }).join('');
  } catch (e) { return ''; }
}

function NB_copyIcsAttachments_(items) {
  var out = [];
  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i] || {};
    if (!it.ics) continue;
    out.push({ filename:NB_clean_(it.filename), ics:String(it.ics) });
  }
  return out;
}

function NB_extractPayload_(it) {
  if (!it) return {};

  var payload = {};
  if (it.payload && typeof it.payload === 'object') {
    payload = it.payload;
  } else {
    try {
      if (it.reserved) {
        var obj = JSON.parse(it.reserved);
        if (obj && obj.payload && typeof obj.payload === 'object') payload = obj.payload;
      }
    } catch (e) {}
  }

  var bodyFallback = NB_extractExternalDigestPayloadFromBody_(it.body || '');
  if (bodyFallback && Object.keys(bodyFallback).length) {
    payload = NB_mergeExternalPayloadFallback_(payload, bodyFallback);
  }

  return payload || {};
}

function NB_mergeExternalPayloadFallback_(payload, fallback) {
  payload = payload || {};
  fallback = fallback || {};
  var out = NB_mergeObjects_(fallback, payload);

  if ((!out.mpsNumber && !out.auditNumber && !out.number) && fallback.mpsNumber) out.mpsNumber = fallback.mpsNumber;
  if ((!out.auditorEmail && !out.auditorName) && (fallback.auditorEmail || fallback.auditorName)) {
    out.auditorEmail = fallback.auditorEmail || '';
    out.auditorName = fallback.auditorName || '';
  }
  if ((!out.scopes || !out.scopes.length) && fallback.scopes && fallback.scopes.length) out.scopes = fallback.scopes;
  if ((!out.blocks || !out.blocks.length) && fallback.blocks && fallback.blocks.length) out.blocks = fallback.blocks;
  if ((!out.plannedDates || !out.plannedDates.length) && fallback.plannedDates && fallback.plannedDates.length) out.plannedDates = fallback.plannedDates;
  if ((out.plannedHours === '' || out.plannedHours === null || typeof out.plannedHours === 'undefined') && fallback.plannedHours !== '') out.plannedHours = fallback.plannedHours;
  return out;
}

function NB_extractExternalDigestPayloadFromBody_(body) {
  body = NB_cleanMultiline_(body);
  if (!body || body.indexOf('Overzicht auditopdracht Ecert') < 0) return {};

  var out = { blocks:[], plannedDates:[] };
  var lines = body.split(/\r?\n/);
  var inPlanning = false;

  for (var i = 0; i < lines.length; i++) {
    var line = NB_clean_(lines[i]);
    if (!line) continue;

    var m;
    if ((m = line.match(/^Bedrijf:\s*(.+)$/i))) { out.company = NB_clean_(m[1]); inPlanning = false; continue; }
    if ((m = line.match(/^MPS\s*(?:No\.?|Number)?:\s*(.+)$/i))) { out.mpsNumber = NB_clean_(m[1]); out.auditNumber = out.mpsNumber; inPlanning = false; continue; }
    if ((m = line.match(/^Audit\s*ID:\s*(.+)$/i))) { out.auditId = NB_clean_(m[1]); inPlanning = false; continue; }
    if ((m = line.match(/^Auditor:\s*(.+)$/i))) { NB_applyExternalAuditorLine_(out, m[1]); inPlanning = false; continue; }
    if ((m = line.match(/^Scopes:\s*(.+)$/i))) { out.scopes = NB_normalizeList_(m[1]); inPlanning = false; continue; }
    if (/^Geplande auditplanning:/i.test(line)) { inPlanning = true; continue; }
    if ((m = line.match(/^Totaal\s*uren:\s*(.+)$/i))) { out.plannedHours = NB_parseExternalHours_(m[1]); inPlanning = false; continue; }

    if (inPlanning && line.charAt(0) === '-') {
      var block = NB_parseExternalPlanningLine_(line.replace(/^[-•]\s*/, ''));
      if (block.date || block.start || block.end) {
        out.blocks.push(block);
        if (block.date) out.plannedDates.push(block.date);
      }
    }
  }

  if (!out.blocks.length) delete out.blocks;
  if (!out.plannedDates.length) delete out.plannedDates;
  if (!out.scopes || !out.scopes.length) delete out.scopes;
  return out;
}

function NB_applyExternalAuditorLine_(out, value) {
  value = NB_clean_(value);
  if (!value) return;
  var m = value.match(/([^\s()<>]+@[^\s()<>]+)(?:\s*\(([^)]*)\))?/);
  if (m) {
    out.auditorEmail = NB_clean_(m[1]);
    out.auditorName = NB_clean_(m[2] || '');
    return;
  }
  out.auditorName = value;
}

function NB_parseExternalPlanningLine_(value) {
  value = NB_clean_(value);
  var out = { date:'', start:'', end:'', hours:'' };
  var m = value.match(/^(?:Zo|Ma|Di|Wo|Do|Vr|Za)?\s*(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2}))?/i);
  if (m) {
    out.date = m[3] + '-' + m[2] + '-' + m[1];
    out.start = NB_clean_(m[4] || '');
    out.end = NB_clean_(m[5] || '');
    if (out.start && out.end) {
      var s = NB_hhmmToMinutes_(out.start);
      var e = NB_hhmmToMinutes_(out.end);
      if (isFinite(s) && isFinite(e) && e > s) out.hours = Math.round(((e - s) / 60) * 100) / 100;
    }
    return out;
  }

  var iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2}))?/);
  if (iso) {
    out.date = iso[1];
    out.start = NB_clean_(iso[2] || '');
    out.end = NB_clean_(iso[3] || '');
  }
  return out;
}

function NB_parseExternalHours_(value) {
  var s = NB_clean_(value).replace(/hours?/i, '').replace(/uur/i, '').replace(/h$/i, '').trim();
  var n = Number(s.replace(',', '.'));
  return isFinite(n) ? n : NB_clean_(value);
}

function NB_cleanMultiline_(v) {
  return String(v == null ? '' : v).replace(/ /g, ' ').trim();
}

function NB_getTz_(ss) {
  try {
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

function NB_headerIndexMapLoose_(headers) {
  var map = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var raw = NB_clean_(headers[i]);
    if (!raw) continue;
    map[NB_normLoose_(raw)] = i;
  }
  return map;
}

function NB_findColLoose_(idx, names) {
  for (var i = 0; i < (names || []).length; i++) {
    var k = NB_normLoose_(names[i]);
    if (idx && Object.prototype.hasOwnProperty.call(idx, k)) return idx[k];
  }
  return -1;
}

function NB_cellLoose_(row, idx, names) {
  var c = NB_findColLoose_(idx, names);
  return c >= 0 ? NB_clean_(row[c]) : '';
}

function NB_normLoose_(v) {
  return NB_clean_(v).toLowerCase().replace(/[–—−]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function NB_html_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function NB_htmlAttr_(v) {
  return NB_html_(v).replace(/`/g, '&#96;');
}

function NB_googleMapsUrl_(gps) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(NB_clean_(gps));
}

/* ============================================================
 * Diagnostics
 * ============================================================ */

function RUN_NOTIFICATIONBUILDER_CACHE_CLEAR() {
  return NB_InvalidateConfigCache();
}

function RUN_NOTIFICATIONBUILDER_CACHE_HIT_TEST() {
  var started = new Date().getTime();
  var out = { ok:true, service:'NotificationBuilder config consumer', build:NB_BUILD, sourceOwner:'NotificationConfig', checks:{}, errors:[] };
  function timed_(name, fn) {
    var t = new Date().getTime();
    try {
      var res = fn();
      out.checks[name] = { ok:true, durationMs:new Date().getTime() - t, summary:res };
    } catch (e) {
      out.checks[name] = { ok:false, durationMs:new Date().getTime() - t, error:String(e && e.message ? e.message : e) };
      out.errors.push(name + ': ' + String(e && e.message ? e.message : e));
    }
  }
  timed_('configOwnerAvailable', function(){
    return {
      NotificationConfig_GetAllEvents:typeof NotificationConfig_GetAllEvents === 'function',
      NotificationConfig_GetAllRules:typeof NotificationConfig_GetAllRules === 'function',
      NotificationConfig_GetRule:typeof NotificationConfig_GetRule === 'function'
    };
  });
  timed_('builderConfigReadViaOwner', function(){
    var cfg = NB_loadNotificationConfig_();
    return { count:Object.keys(cfg || {}).length, owner:'NotificationConfig' };
  });
  timed_('builderRulesReadViaOwner', function(){
    var rules = NB_loadNotificationRules_();
    return { count:Object.keys(rules || {}).length, queueSheetName:NB_getQueueSheetName_(), owner:'NotificationConfig' };
  });
  timed_('buildRichOperationalSmoke', function(){
    var built = NB_buildNotification_('AUDIT_PLANNED_BY_MANAGER', {
      company:'CONFIG OWNER TEST COMPANY', auditId:'CONFIG_OWNER_TEST_AUDIT', mpsNumber:'123456', auditNumber:'123456',
      actor:'config-test', actorRole:'Manager', recipientRole:'auditor', resultStatus:'Approved', skipAuditBriefing:true,
      blocks:[{ date:'2026-05-12', dayName:'Tuesday', start:'09:00', end:'13:00', hours:4, execLoc:'HQ', gps:'41.0,2.0', slotComment:'Demo' }],
      scopes:['MPS-ABC'], plannedHours:4
    });
    return { hasSubject:!!built.subject, hasBody:!!built.body, hasHtml:!!built.htmlBody, rendererProfile:built.rendererProfile };
  });
  timed_('buildExternalOperationalSmoke', function(){
    var built = NB_buildNotification_('AUDIT_ACCEPTED', {
      company:'CONFIG OWNER TEST COMPANY', auditId:'CONFIG_OWNER_TEST_AUDIT', mpsNumber:'123456', auditNumber:'123456',
      actor:'auditor@example.com', actorRole:'Auditor', recipientRole:'manager', skipAuditBriefing:true
    });
    return { hasSubject:!!built.subject, hasBody:!!built.body, hasHtml:!!built.htmlBody, rendererProfile:built.rendererProfile };
  });
  out.durationMs = new Date().getTime() - started;
  out.timestamp = new Date().toISOString();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
 * Backward-compatible internal helper names retained
 * ============================================================ */

function NB_isOperationalDetailEvent_(eventCode) {
  var family = NB_resolveEventFamily_(eventCode, NB_getEventConfig_(eventCode));
  return family === 'RICH_OPERATIONAL' || family === 'APPROVAL_OPERATIONAL' || family === 'MANAGER_APPROVAL_OPERATIONAL';
}

function NB_indexMap_(headers) {
  var idx = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h) idx[h] = i;
  }
  return idx;
}

function NB_rawCell_(row, idx, key) {
  var c = idx[key];
  return c == null ? '' : row[c];
}

function NB_textCell_(row, idx, key) { return NB_clean_(NB_rawCell_(row, idx, key)); }
function NB_upperCell_(row, idx, key) { return NB_textCell_(row, idx, key).toUpperCase(); }

function NB_numberCell_(row, idx, key, fallback) {
  var n = Number(NB_rawCell_(row, idx, key));
  return isFinite(n) ? n : fallback;
}

function NB_yesNoCell_(row, idx, key, fallback) {
  var v = NB_textCell_(row, idx, key).toUpperCase();
  if (!v) return !!fallback;
  return v === 'YES' || v === 'TRUE' || v === '1' || v === 'Y';
}

function NB_renderAuditBriefingText_(briefing, eventCode, recipientRole) {
  var code = eventCode || 'AUDIT_PLANNED_BY_MANAGER';
  var n = NB_normalizePayload_(code, briefing || {}, NB_getEventConfig_(code));
  var profile = NB_resolveRendererProfile_(code, NB_getEventConfig_(code), n);
  if (profile !== 'RICH_OPERATIONAL') throw new Error('NB_renderAuditBriefingText_: unsupported profile ' + profile);
  NB_requireRenderer_('NB_renderRichOperational_', profile);
  var rendered = NB_renderRichOperational_(n);
  return rendered.body || '';
}

function NB_renderAuditBriefingHtml_(briefing) {
  var n = NB_normalizePayload_('AUDIT_PLANNED_BY_MANAGER', briefing || {}, NB_getEventConfig_('AUDIT_PLANNED_BY_MANAGER'));
  NB_requireRenderer_('NB_renderRichOperationalHtml_', 'RICH_OPERATIONAL');
  return NB_renderRichOperationalHtml_(n);
}
