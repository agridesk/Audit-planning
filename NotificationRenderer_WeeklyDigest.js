// ============================================================
// FILE: NotificationRenderer_WeeklyDigest.gs
// BUILD: 2026-05-25_WEEKLY_QUEUE_DRIVEN_R1
// PURPOSE:
//   Weekly digest collectors/renderers. Runners now queue weekly mails instead of sending directly.
//
// PUBLIC API PRESERVED:
//   - runManagerWeeklyAlert()
//   - runAuditorWeeklyAlert()
//
// GOVERNANCE:
//   - Weekly digests are oversight, not transaction mail.
//   - NotificationConfig owns thresholds/sender settings.
//   - Notification Queue owns staging.
//   - NotificationSender owns DEV/PROD delivery guard and transport routing.
//   - NotificationMailGateway owns transport.
//   - No direct workflow/status transitions here.
//
// INSTALL:
//   1. Replace NotificationRenderer_WeeklyDigest.gs with this file.
//   2. Remove/disable NotificationWeekly.gs after grep verification to avoid duplicate functions.
//   3. Keep triggers pointed at runManagerWeeklyAlert and runAuditorWeeklyAlert.
//   4. Replace NotificationSender.gs with the matching WEEKLY_QUEUE_PRE_RENDERED_R13 build.
// ============================================================



// ============================================================
// MANAGER WEEKLY RUNNER — migrated from NotificationWeekly_Manager.js
// ============================================================

// ============================================================
// FILE: NotificationWeekly_Manager.gs
// BUILD: 2026-05-12_MANAGER_WEEKLY_SENDER_IDENTITY
// PURPOSE:
//   Manager weekly alert / digest
//
// RULES
// - 1 email per active manager
// - reads Audit planning as active audit source
// - excludes Completed / Rejected
// - uses NotificationConfig for thresholds and sender settings
// - uses NotificationSender delivery guard before any NotificationMailGateway_SendEmail
// - fail-closed: if System_Config delivery cannot be resolved, no email is sent
// ============================================================

var NRM2_SHEET_AUDIT_PLANNING = 'Audit planning';
var NRM2_SHEET_AUDITORS = 'Auditors';
var NRM2_SHEET_SCOPE_CONFIG = 'Config_Scopes';
var NRM2_SHEET_COMPANIES = 'Companies';

function runManagerWeeklyAlert() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NRM2_SHEET_AUDIT_PLANNING);
  if (!sh) return { ok:false, error:'Audit planning not found' };

  var weeklyConfig = (typeof NotificationConfig_GetWeeklyManagerConfig === 'function') ? NotificationConfig_GetWeeklyManagerConfig() : {};
  var settings = weeklyConfig.settings || nrm2_loadSettings_(ss);
  var thresholds = nrm2_getThresholds_(weeklyConfig);
  var scopeConfig = nrm2_loadScopeConfig_(ss);
  var companiesMap = nrm2_loadCompaniesMap_(ss);
  var recipients = nrm2_getManagerRecipients_(ss, settings);

  if (!recipients.length) return { ok:false, error:'No manager recipients found' };

  var data = sh.getDataRange().getValues();
  if (!data || data.length <= 1) return { ok:true, processed:0, recipients:recipients };

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) m[String(headers[i] || '').trim()] = i;

  var idxCompany = nrm2_idx_(m, ['Company']);
  var idxStatus = nrm2_idx_(m, ['Status']);
  var idxAssigned = nrm2_findOptionalIdx_(m, ['Assigned to', 'Auditor']);
  var idxPreassigned = nrm2_findOptionalIdx_(m, ['Preassigned Auditor']);
  var idxAllowSelfPlanning = nrm2_findOptionalIdx_(m, ['Allow self planning']);
  var idxPlanningWindowFrom = nrm2_findOptionalIdx_(m, ['Planning window from']);
  var idxPlanningWindowTo = nrm2_findOptionalIdx_(m, ['Planning window to']);
  var idxPlanned = nrm2_findOptionalIdx_(m, ['Date - Planned']);
  var idxPlanningJson = nrm2_findOptionalIdx_(m, ['Planning JSON']);
  var idxScopesText = nrm2_findOptionalIdx_(m, ['Scopes', 'Scopes_List']);
  var idxExpiry = nrm2_findOptionalIdx_(m, ['Extended Expiration Date', 'Date - Will Expire']);
  var idxAuditId = nrm2_findOptionalIdx_(m, ['Audit ID']);

  var today = nrm2_startOfDay_(new Date());
  var blocks = {
    critical: [],
    urgent: [],
    upcoming: [],
    pendingApproval: [],
    pendingAcceptance: [],
    comingUp: [],
    pendingCompletion: []
  };

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var company = String(row[idxCompany] || '').trim();
    if (!company) continue;

    var status = String(row[idxStatus] || '').trim();
    if (!status) continue;

    var upStatus = nrm2_up_(status);
    if (upStatus === 'COMPLETED' || upStatus === 'REJECTED') continue;

    var planningWindowFrom = idxPlanningWindowFrom >= 0 ? nrm2_parseSheetDate_(row[idxPlanningWindowFrom]) : null;
    var planningWindowTo = idxPlanningWindowTo >= 0 ? nrm2_parseSheetDate_(row[idxPlanningWindowTo]) : null;
    var expiryDate = idxExpiry >= 0 ? nrm2_parseSheetDate_(row[idxExpiry]) : null;
    var plannedInfo = nrm2_getPlannedInfo_(idxPlanningJson >= 0 ? row[idxPlanningJson] : '', idxPlanned >= 0 ? row[idxPlanned] : '');
    var companyMeta = companiesMap[company.toUpperCase()] || {};
    var scopes = nrm2_extractScopesFromRow_(row, m, idxScopesText, scopeConfig.headerMap);

    var record = {
      auditId: idxAuditId >= 0 ? String(row[idxAuditId] || '').trim() : '',
      company: company,
      number: companyMeta.number || '',
      country: companyMeta.country || '',
      status: status,
      assigned: idxAssigned >= 0 ? String(row[idxAssigned] || '').trim() : '',
      preassigned: idxPreassigned >= 0 ? String(row[idxPreassigned] || '').trim() : '',
      allowSelfPlanning: idxAllowSelfPlanning >= 0 ? nrm2_up_(row[idxAllowSelfPlanning]) : '',
      planningWindowDisplay: nrm2_formatWindow_(planningWindowFrom, planningWindowTo),
      expiryDisplay: expiryDate ? Utilities.formatDate(expiryDate, nrm2_getTz_(), 'dd-MM-yyyy') : '',
      daysLeft: planningWindowTo ? nrm2_daysBetween_(today, planningWindowTo) : '',
      plannedDisplay: plannedInfo.display,
      firstPlannedDate: plannedInfo.firstDate,
      daysOverdue: plannedInfo.firstDate && plannedInfo.firstDate < today ? Math.abs(nrm2_daysBetween_(today, plannedInfo.firstDate)) : '',
      scopes: scopes
    };

    if (upStatus === 'PENDING PLANNING') {
      if (record.daysLeft !== '') {
        if (record.daysLeft <= thresholds.criticalDays) blocks.critical.push(record);
        else if (record.daysLeft <= thresholds.urgentDays) blocks.urgent.push(record);
        else if (record.daysLeft <= thresholds.upcomingDays) blocks.upcoming.push(record);
      }
    }

    if (upStatus === 'PENDING APPROVAL') blocks.pendingApproval.push(record);
    if (upStatus === 'APPROVED') blocks.pendingAcceptance.push(record);

    if (
      record.firstPlannedDate &&
      record.firstPlannedDate >= today &&
      record.firstPlannedDate <= nrm2_addDays_(today, thresholds.comingUpDays)
    ) {
      blocks.comingUp.push(record);
    }

    if (
      upStatus === 'ACCEPTED' &&
      record.firstPlannedDate &&
      record.firstPlannedDate < today
    ) {
      blocks.pendingCompletion.push(record);
    }
  }

  nrm2_sortByDaysLeft_(blocks.critical);
  nrm2_sortByDaysLeft_(blocks.urgent);
  nrm2_sortByDaysLeft_(blocks.upcoming);
  nrm2_sortByPlannedDate_(blocks.pendingApproval);
  nrm2_sortByPlannedDate_(blocks.pendingAcceptance);
  nrm2_sortByPlannedDate_(blocks.comingUp);
  nrm2_sortByPlannedDate_(blocks.pendingCompletion);

  var total = blocks.critical.length + blocks.urgent.length + blocks.upcoming.length + blocks.pendingApproval.length + blocks.pendingAcceptance.length + blocks.comingUp.length + blocks.pendingCompletion.length;
  if (!total) return { ok:true, sent:false, reason:'No rows for manager weekly alert', thresholds:thresholds };

  var subject = 'Weekly manager audit overview - ' + Utilities.formatDate(today, nrm2_getTz_(), 'dd-MM-yyyy');
  var body = 'See HTML version';
  var html = nrm2_buildMail_(blocks, thresholds, scopeConfig.styleMap);
  var results = [];

  for (var x = 0; x < recipients.length; x++) {
    var recipient = recipients[x];
    var queueResult = nrm2_queueWeeklyMail_(ss, {
      eventKey: 'WEEKLY_MANAGER_DIGEST',
      digestGroup: 'MANAGER_WEEKLY',
      recipient: recipient,
      subject: subject,
      body: body,
      htmlBody: html,
      fromName: settings.DEFAULT_FROM_NAME || 'Audit Management System',
      replyTo: settings.DEFAULT_REPLY_TO || '',
      meta: {
        source: 'runManagerWeeklyAlert',
        counts: {
          critical: blocks.critical.length,
          urgent: blocks.urgent.length,
          upcoming: blocks.upcoming.length,
          pendingApproval: blocks.pendingApproval.length,
          pendingAcceptance: blocks.pendingAcceptance.length,
          comingUp: blocks.comingUp.length,
          pendingCompletion: blocks.pendingCompletion.length
        },
        thresholds: thresholds
      }
    });

    results.push({
      manager: recipient,
      queued: !!queueResult.ok,
      queueRow: queueResult.row || '',
      status: queueResult.status || '',
      error: queueResult.error || ''
    });
  }

  return {
    ok:true,
    queued:true,
    results:results,
    total:total,
    counts:{
      critical:blocks.critical.length,
      urgent:blocks.urgent.length,
      upcoming:blocks.upcoming.length,
      pendingApproval:blocks.pendingApproval.length,
      pendingAcceptance:blocks.pendingAcceptance.length,
      comingUp:blocks.comingUp.length,
      pendingCompletion:blocks.pendingCompletion.length
    },
    thresholds:thresholds
  };
}


function nrm2_queueWeeklyMail_(ss, mail) {
  mail = mail || {};
  var recipient = String(mail.recipient || '').trim();
  if (!recipient) return { ok:false, error:'MISSING_RECIPIENT' };

  var queueName = 'Notification Queue';
  try {
    if (typeof NotificationConfig_GetQueueSheetName === 'function') {
      queueName = String(NotificationConfig_GetQueueSheetName() || queueName).trim() || queueName;
    }
  } catch (eQueueName) {}

  var nq = ss.getSheetByName(queueName);
  if (!nq) return { ok:false, error:'MISSING_QUEUE_SHEET:' + queueName };

  var eventKey = String(mail.eventKey || 'WEEKLY_DIGEST').trim();
  var digestGroup = String(mail.digestGroup || 'WEEKLY').trim();
  var subject = String(mail.subject || 'Weekly audit overview');
  var body = String(mail.body || 'See HTML version');
  var htmlBody = String(mail.htmlBody || '');

  var payload = {
    config: {
      consolidate: false,
      bufferMinutes: 0,
      digestGroup: digestGroup,
      templateFamily: 'WEEKLY',
      sendEmail: true,
      logOnly: false,
      fromName: String(mail.fromName || ''),
      replyTo: String(mail.replyTo || '')
    },
    weeklyPreRendered: {
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      fromName: String(mail.fromName || ''),
      replyTo: String(mail.replyTo || '')
    },
    meta: mail.meta || {}
  };

  var row = [
    new Date(),
    'PENDING',
    eventKey,
    recipient,
    '',
    '',
    subject,
    body,
    0,
    '',
    nrm2_payloadHash_(eventKey, recipient, subject, htmlBody),
    '',
    JSON.stringify({ payload: payload })
  ];

  nq.appendRow(row);
  return { ok:true, status:'PENDING', row:nq.getLastRow(), queueSheet:queueName, eventKey:eventKey, recipient:recipient };
}

function nrm2_payloadHash_(eventKey, recipient, subject, htmlBody) {
  var raw = [eventKey, recipient, subject, htmlBody, new Date().getTime()].join('|');
  try {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
    return Utilities.base64EncodeWebSafe(bytes).substring(0, 32);
  } catch (e) {
    return String(raw.length) + '_' + String(new Date().getTime());
  }
}

function RUN_NF_WEEKLY_QUEUE_SMOKE() {
  var manager = runManagerWeeklyAlert();
  var auditor = runAuditorWeeklyAlert();
  var out = { ok:true, manager:manager, auditor:auditor };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function nrm2_buildMail_(blocks, thresholds, scopeStyleMap) {
  var html = [];
  html.push('<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;color:#24292f;">');
  html.push('<h2 style="margin:0 0 12px 0;">Weekly manager audit overview</h2>');
  html.push('<p style="margin:0 0 16px 0;">Below are the active audit planning items requiring management attention. Report generated on: ' + nrm2_safe_(Utilities.formatDate(new Date(), nrm2_getTz_(), 'dd-MM-yyyy')) + '</p>');

  var pendingPlanningTotal = blocks.critical.length + blocks.urgent.length + blocks.upcoming.length;
  html.push('<div style="margin:0 0 22px 0;">');
  html.push('<div style="font-size:18px;font-weight:700;margin:0 0 6px 0;">1) Pending planning (' + pendingPlanningTotal + ')</div>');
  html.push('<div style="margin:0 0 10px 0;color:#57606a;">Urgency is based on the last day of the planning window.</div>');
  html.push(nrm2_renderGroupTable_('Critical (≤ ' + thresholds.criticalDays + ' days)', blocks.critical, scopeStyleMap));
  html.push(nrm2_renderGroupTable_('Urgent (' + (thresholds.criticalDays + 1) + ' - ' + thresholds.urgentDays + ' days)', blocks.urgent, scopeStyleMap));
  html.push(nrm2_renderGroupTable_('Upcoming (' + (thresholds.urgentDays + 1) + ' - ' + thresholds.upcomingDays + ' days)', blocks.upcoming, scopeStyleMap));
  html.push('</div>');

  html.push(nrm2_renderSection_('2) Pending approval', blocks.pendingApproval, scopeStyleMap, 'Auditor self-planned audits waiting for manager approval.'));
  html.push(nrm2_renderSection_('3) Pending acceptance', blocks.pendingAcceptance, scopeStyleMap, 'Approved audits waiting for auditor acceptance.'));
  html.push(nrm2_renderSection_('4) Coming up', blocks.comingUp, scopeStyleMap, 'Audits planned in the configured coming-up window.'));
  html.push(nrm2_renderSection_('5) Pending completion', blocks.pendingCompletion, scopeStyleMap, 'Accepted audits planned in the past and still requiring completion.'));

  html.push('<p style="margin-top:18px;color:#57606a;">This is an automated weekly report from the Audit Management System.</p>');
  html.push('</div>');
  return html.join('');
}

function nrm2_renderSection_(title, rows, scopeStyleMap, helpText) {
  var html = [];
  html.push('<div style="margin:0 0 22px 0;">');
  html.push('<div style="font-size:18px;font-weight:700;margin:0 0 6px 0;">' + nrm2_safe_(title) + ' (' + (rows ? rows.length : 0) + ')</div>');
  html.push('<div style="margin:0 0 10px 0;color:#57606a;">' + nrm2_safe_(helpText || '') + '</div>');
  html.push(nrm2_renderStandardTable_(rows, scopeStyleMap, [
    { key:'company', label:'Company' },
    { key:'number', label:'Number' },
    { key:'country', label:'Country' },
    { key:'plannedDisplay', label:'Planned' },
    { key:'assigned', label:'Assigned to' },
    { key:'status', label:'Status' },
    { key:'scopes', label:'Scopes' }
  ], 'No rows.'));
  html.push('</div>');
  return html.join('');
}

function nrm2_renderGroupTable_(title, rows, scopeStyleMap) {
  return '<div style="margin:0 0 14px 0;">' +
    '<div style="font-weight:700;margin:0 0 6px 0;">' + nrm2_safe_(title) + '</div>' +
    nrm2_renderStandardTable_(rows, scopeStyleMap, [
      { key:'company', label:'Company' },
      { key:'number', label:'Number' },
      { key:'country', label:'Country' },
      { key:'planningWindowDisplay', label:'Planning window' },
      { key:'expiryDisplay', label:'Expiration date' },
      { key:'daysLeft', label:'Days left' },
      { key:'preassigned', label:'Preassigned' },
      { key:'allowSelfPlanning', label:'Self planning' },
      { key:'scopes', label:'Scopes' }
    ], 'No audits in this group.') +
    '</div>';
}

function nrm2_renderStandardTable_(rows, scopeStyleMap, columns, emptyText) {
  var html = [];
  html.push('<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 10px 0;">');
  html.push('<tr style="background:#f6f8fa;">');
  for (var c = 0; c < columns.length; c++) html.push('<th style="border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top;background:#f6f8fa;font-weight:600;">' + nrm2_safe_(columns[c].label) + '</th>');
  html.push('</tr>');

  if (!rows || !rows.length) {
    html.push('<tr><td colspan="' + columns.length + '" style="border:1px solid #d0d7de;padding:8px;color:#57606a;background:#ffffff;">' + nrm2_safe_(emptyText || 'No rows') + '</td></tr>');
    html.push('</table>');
    return html.join('');
  }

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    html.push('<tr>');
    for (var k = 0; k < columns.length; k++) {
      var key = columns[k].key;
      var cellHtml = key === 'scopes' ? nrm2_renderScopes_(row.scopes, scopeStyleMap) : nrm2_safe_(row[key] !== null && row[key] !== undefined ? row[key] : '');
      html.push('<td style="border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;background:#ffffff;">' + cellHtml + '</td>');
    }
    html.push('</tr>');
  }
  html.push('</table>');
  return html.join('');
}

function nrm2_loadSettings_(ss) {
  if (typeof NotificationConfig_GetSenderSettings === 'function') return NotificationConfig_GetSenderSettings();
  return {};
}

function nrm2_getThresholds_(weeklyConfig) {
  weeklyConfig = weeklyConfig || {};
  if (weeklyConfig.planningWindow || weeklyConfig.nextWeekDays != null) {
    var pw = weeklyConfig.planningWindow || {};
    return {
      upcomingDays: Number(pw.upcomingDays || 0),
      urgentDays: Number(pw.urgentDays || 0),
      criticalDays: Number(pw.criticalDays || 0),
      comingUpDays: Number(weeklyConfig.nextWeekDays || weeklyConfig.comingUpDays || 14)
    };
  }
  if (typeof NotificationConfig_GetPlanningWindowThresholds === 'function') {
    var pw2 = NotificationConfig_GetPlanningWindowThresholds();
    var coming = (typeof NotificationConfig_GetComingUpDays === 'function') ? NotificationConfig_GetComingUpDays() : 14;
    return {
      upcomingDays:Number(pw2.upcomingDays || 0),
      urgentDays:Number(pw2.urgentDays || 0),
      criticalDays:Number(pw2.criticalDays || 0),
      comingUpDays:Number(coming || 14)
    };
  }
  return { upcomingDays:120, urgentDays:90, criticalDays:60, comingUpDays:14 };
}

function nrm2_getManagerRecipients_(ss, settings) {
  var testMode = nrm2_up_(settings.TEST_MODE || '') === 'YES';
  var testRecipient = String(settings.TEST_RECIPIENT || '').trim();
  if (testMode && testRecipient) return [testRecipient];

  var sh = ss.getSheetByName(NRM2_SHEET_AUDITORS);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) m[String(headers[i] || '').trim()] = i;

  var idxEmail = nrm2_findOptionalIdx_(m, ['E-mail', 'Email']);
  var idxActive = nrm2_findOptionalIdx_(m, ['Active']);
  var idxRole = nrm2_findOptionalIdx_(m, ['Role']);
  if (idxEmail < 0) return [];

  var recipients = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var email = String(row[idxEmail] || '').trim();
    var active = idxActive >= 0 ? nrm2_up_(row[idxActive]) : 'YES';
    var role = idxRole >= 0 ? nrm2_up_(row[idxRole]) : '';
    if (!email) continue;
    if (active && active !== 'YES' && active !== 'TRUE') continue;
    if (role !== 'MANAGER') continue;
    recipients.push(email);
  }
  return nrm2_unique_(recipients);
}

function nrm2_loadScopeConfig_(ss) {
  var sh = ss.getSheetByName(NRM2_SHEET_SCOPE_CONFIG);
  if (!sh) return { styleMap:{}, headerMap:{} };
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return { styleMap:{}, headerMap:{} };

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) m[String(headers[i] || '').trim()] = i;

  var idxSlotKey = nrm2_idx_(m, ['SlotKey']);
  var idxScopeCode = nrm2_findOptionalIdx_(m, ['ScopeCode']);
  var idxDisplayName = nrm2_findOptionalIdx_(m, ['DisplayName']);
  var idxColor = nrm2_findOptionalIdx_(m, ['Color']);
  var idxTextColor = nrm2_findOptionalIdx_(m, ['TextColor']);
  var styleMap = {};
  var headerMap = {};

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var slotKey = String(row[idxSlotKey] || '').trim();
    if (!slotKey) continue;
    var scopeCode = idxScopeCode >= 0 ? String(row[idxScopeCode] || '').trim() : '';
    var displayName = idxDisplayName >= 0 ? String(row[idxDisplayName] || '').trim() : '';
    var color = idxColor >= 0 ? String(row[idxColor] || '').trim() : '';
    var textColor = idxTextColor >= 0 ? String(row[idxTextColor] || '').trim() : '';
    styleMap[slotKey] = { label:displayName || scopeCode || slotKey, bg:color || '#e5e7eb', fg:textColor || '#111827' };
    headerMap[nrm2_scopeKey_(slotKey)] = slotKey;
    if (scopeCode) headerMap[nrm2_scopeKey_(scopeCode)] = slotKey;
    if (displayName) headerMap[nrm2_scopeKey_(displayName)] = slotKey;
  }
  return { styleMap:styleMap, headerMap:headerMap };
}

function nrm2_loadCompaniesMap_(ss) {
  try {
    if (typeof CompaniesIndex_GetUidCoreIndex === 'function') {
      var core = CompaniesIndex_GetUidCoreIndex(false);
      if (core && core.ok && core.byUid) {
        var indexedMap = {};
        Object.keys(core.byUid || {}).forEach(function(uid) {
          var rec = core.byUid[uid] || {};
          var company = String(rec.companyName || '').trim();
          if (!company) return;
          indexedMap[company.toUpperCase()] = { number:String(rec.number || '').trim(), country:String(rec.country || '').trim() };
        });
        return indexedMap;
      }
    }
  } catch (eIndex) {}

  var sh = ss.getSheetByName(NRM2_SHEET_COMPANIES);
  if (!sh) return {};
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return {};
  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) m[String(headers[i] || '').trim()] = i;
  var idxCompany = nrm2_idx_(m, ['Company']);
  var idxNumber = nrm2_findOptionalIdx_(m, ['Number']);
  var idxCountry = nrm2_findOptionalIdx_(m, ['Country']);
  var map = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var company = String(row[idxCompany] || '').trim();
    if (!company) continue;
    map[company.toUpperCase()] = { number:idxNumber >= 0 ? String(row[idxNumber] || '').trim() : '', country:idxCountry >= 0 ? String(row[idxCountry] || '').trim() : '' };
  }
  return map;
}

function nrm2_extractScopesFromRow_(row, m, idxScopesText, headerMap) {
  var found = [];
  var seen = {};
  headerMap = headerMap || {};
  var headers = Object.keys(m);
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h] || '').trim();
    if (!header) continue;
    var slotKey = headerMap[nrm2_scopeKey_(header)];
    if (!slotKey) continue;
    var idx = m[header];
    if (idx < 0) continue;
    var v = String(row[idx] || '').trim();
    if (!v) continue;
    var upv = nrm2_up_(v);
    if (upv === 'NO' || upv === 'FALSE' || upv === '0') continue;
    if (!seen[slotKey]) { seen[slotKey] = true; found.push(slotKey); }
  }
  if (idxScopesText >= 0) {
    var raw = String(row[idxScopesText] || '').trim();
    if (raw) {
      var parts = raw.split(/[,;\n]/);
      for (var p = 0; p < parts.length; p++) {
        var part = String(parts[p] || '').trim();
        if (!part) continue;
        var mappedSlot = headerMap[nrm2_scopeKey_(part)];
        if (!mappedSlot) continue;
        if (!seen[mappedSlot]) { seen[mappedSlot] = true; found.push(mappedSlot); }
      }
    }
  }
  return found;
}

function nrm2_getPlannedInfo_(planningJsonText, legacyDateValue) {
  var dates = [];
  var firstDate = null;
  var parsed = null;
  try { parsed = planningJsonText ? JSON.parse(planningJsonText) : null; } catch (e) { parsed = null; }
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed)) {
      for (var i = 0; i < parsed.length; i++) if (parsed[i] && parsed[i].date) dates.push(parsed[i].date);
    } else if (Array.isArray(parsed.days)) {
      for (var j = 0; j < parsed.days.length; j++) if (parsed.days[j] && parsed.days[j].date) dates.push(parsed.days[j].date);
    } else if (Array.isArray(parsed.segments)) {
      for (var k = 0; k < parsed.segments.length; k++) if (parsed.segments[k] && parsed.segments[k].date) dates.push(parsed.segments[k].date);
    }
  }
  if (!dates.length) {
    var legacyDate = nrm2_parseSheetDate_(legacyDateValue);
    if (legacyDate) dates.push(Utilities.formatDate(legacyDate, nrm2_getTz_(), 'yyyy-MM-dd'));
  }
  var display = '';
  if (dates.length) {
    var sorted = dates.slice().sort();
    firstDate = nrm2_parseSheetDate_(sorted[0]);
    display = dates.length === 1 ? nrm2_formatIsoDate_(sorted[0]) : nrm2_formatIsoDate_(sorted[0]) + ' - ' + nrm2_formatIsoDate_(sorted[sorted.length - 1]);
  }
  return { dates:dates, display:display, firstDate:firstDate };
}

function nrm2_renderScopes_(scopes, scopeStyleMap) {
  if (!scopes || !scopes.length) return '';
  var html = [];
  for (var i = 0; i < scopes.length; i++) {
    var slotKey = scopes[i];
    var style = scopeStyleMap[slotKey] || { label:slotKey, bg:'#e5e7eb', fg:'#111827' };
    html.push('<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:' + nrm2_safe_(style.bg) + ';color:' + nrm2_safe_(style.fg) + ';font-weight:700;font-size:12px;line-height:1.2;white-space:nowrap;">' + nrm2_safe_(style.label) + '</span>');
  }
  return html.join('');
}

function nrm2_sendEmailRespectingSystemConfig_(recipient, subject, body, options) {
  var delivery = null;
  if (typeof NotificationSender_ResolveDelivery === 'function') delivery = NotificationSender_ResolveDelivery(recipient);
  else if (typeof ns_resolveNotificationDelivery_ === 'function') delivery = ns_resolveNotificationDelivery_(recipient);
  else delivery = { mode:'NOTIFICATION_SENDER_RESOLVER_MISSING_FAIL_CLOSED', send:false, recipient:'', recipients:[], originalRecipients:[String(recipient || '').trim()].filter(Boolean), overridden:false, source:'WeeklyManagerFailClosed', failClosed:true };

  if (!delivery || !delivery.send) {
    return { sent:false, status:'SUPPRESSED', mode:delivery && delivery.mode ? delivery.mode : 'UNKNOWN', note:delivery && delivery.error ? delivery.error : 'Sending suppressed by notification delivery guard.' };
  }

  var finalSubject = String(subject || '');
  var finalBody = String(body || '');
  var opt = options || {};
  if (delivery.overridden) {
    finalSubject = '[DEV TEST] ' + finalSubject;
    if (opt.htmlBody) opt.htmlBody = '<div style="font-family:Arial,sans-serif;color:#b42318;font-weight:700;">DEV TEST_TO_SELF redirect.<br>Original recipient(s): ' + nrm2_safe_((delivery.originalRecipients || []).join(', ')) + '</div><hr>' + opt.htmlBody;
    finalBody = 'DEV TEST_TO_SELF redirect. Original recipient(s): ' + (delivery.originalRecipients || []).join(', ') + '\n\n' + finalBody;
  }
  NS_sendEmailWithConfiguredIdentity_(delivery.recipient, finalSubject, finalBody, opt, { source: 'runManagerWeeklyAlert', deliveryMode: delivery.mode });
  return { sent:true, status:delivery.overridden ? 'SENT_DEV_REDIRECT' : 'SENT', mode:delivery.mode || '', note:delivery.overridden ? 'Redirected to ' + delivery.recipient : '' };
}

function nrm2_sortByDaysLeft_(rows) {
  rows.sort(function(a, b) {
    var da = a.daysLeft === '' ? 999999 : Number(a.daysLeft);
    var db = b.daysLeft === '' ? 999999 : Number(b.daysLeft);
    if (da !== db) return da - db;
    var ca = nrm2_up_(a.company), cb = nrm2_up_(b.company);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
  });
}

function nrm2_sortByPlannedDate_(rows) {
  rows.sort(function(a, b) {
    var ta = a.firstPlannedDate ? a.firstPlannedDate.getTime() : 0;
    var tb = b.firstPlannedDate ? b.firstPlannedDate.getTime() : 0;
    if (ta !== tb) return ta - tb;
    var ca = nrm2_up_(a.company), cb = nrm2_up_(b.company);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
  });
}

function nrm2_formatWindow_(fromDate, toDate) {
  var fromText = fromDate ? Utilities.formatDate(fromDate, nrm2_getTz_(), 'dd-MM-yyyy') : '';
  var toText = toDate ? Utilities.formatDate(toDate, nrm2_getTz_(), 'dd-MM-yyyy') : '';
  if (fromText && toText) return fromText + ' → ' + toText;
  if (toText) return '→ ' + toText;
  if (fromText) return fromText + ' →';
  return '';
}

function nrm2_idx_(m, keys) {
  for (var i = 0; i < keys.length; i++) if (m.hasOwnProperty(keys[i])) return m[keys[i]];
  throw new Error('Missing column: ' + keys.join(' / '));
}

function nrm2_findOptionalIdx_(m, keys) {
  for (var i = 0; i < keys.length; i++) if (m.hasOwnProperty(keys[i])) return m[keys[i]];
  return -1;
}

function nrm2_safe_(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nrm2_up_(v) { return String(v || '').toUpperCase().trim(); }

function nrm2_parseSheetDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return nrm2_startOfDay_(v);
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(s);
  if (!isNaN(d.getTime())) return nrm2_startOfDay_(d);
  return null;
}

function nrm2_startOfDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function nrm2_addDays_(d, days) { var out = new Date(d.getTime()); out.setDate(out.getDate() + days); return out; }
function nrm2_daysBetween_(fromDate, toDate) { return Math.floor((nrm2_startOfDay_(toDate).getTime() - nrm2_startOfDay_(fromDate).getTime()) / 86400000); }
function nrm2_formatIsoDate_(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return String(iso || ''); return m[3] + '-' + m[2] + '-' + m[1]; }
function nrm2_scopeKey_(v) { return String(v || '').toUpperCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function nrm2_unique_(arr) { var out = [], seen = {}; for (var i = 0; i < arr.length; i++) { var key = String(arr[i] || '').trim().toLowerCase(); if (!key || seen[key]) continue; seen[key] = true; out.push(String(arr[i]).trim()); } return out; }
function nrm2_getTz_() { try { var ss = SpreadsheetApp.getActiveSpreadsheet(); if (ss && ss.getSpreadsheetTimeZone) { var tz = String(ss.getSpreadsheetTimeZone() || '').trim(); if (tz) return tz; } } catch (e) {} try { var tz2 = String(Session.getScriptTimeZone() || '').trim(); if (tz2) return tz2; } catch (e2) {} return 'Europe/Amsterdam'; }


// ============================================================
// AUDITOR WEEKLY RUNNER — migrated from NotificationWeekly_Auditor.js
// ============================================================

// ============================================================
// FILE: NotificationRunner_V2_AUDITOR_WEEKLY_CLEAN.gs
// BUILD: 2026-05-12_AUDITOR_WEEKLY_SENDER_IDENTITY
// PURPOSE:
// Auditor weekly alert / digest
//
// RULES
// - 1 email per auditor
// - only audits where auditor must act:
//     A) Pending Planning + Preassigned Auditor = auditor + Allow self planning = YES
//     B) Assigned to = auditor for pending acceptance / coming up / pending completion
// - exclude Completed / Rejected
// - self-planning urgency is based on:
//     Days left = "Planning window to" - today
// - urgency thresholds come from NotificationConfig:
//     EVENT_KEY = PLANNING_WINDOW_ALERT
//     LEVEL1_DAYS = 90   => Upcoming
//     LEVEL2_DAYS = 60   => Urgent
//     LEVEL3_DAYS = 30   => Critical
// - coming up window comes from NotificationConfig:
//     EVENT_KEY = UPCOMING_AUDIT
//   fallback = 14 days
// - sender / reply-to / test mode come from NotificationConfig
// - scopes styled from Config_Scopes
// ============================================================

var NRA2_SHEET_AUDIT_PLANNING = 'Audit planning';
var NRA2_SHEET_AUDITORS = 'Auditors';
var NRA2_SHEET_SCOPE_CONFIG = 'Config_Scopes';
var NRA2_SHEET_COMPANIES = 'Companies';

// ============================================================
// RUNNER
// ============================================================

function runAuditorWeeklyAlert() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NRA2_SHEET_AUDIT_PLANNING);
  if (!sh) return { ok: false, error: 'Audit planning not found' };

  var weeklyConfig = (typeof NotificationConfig_GetWeeklyAuditorConfig === 'function') ? NotificationConfig_GetWeeklyAuditorConfig() : {};
  var settings = weeklyConfig.settings || nra2_loadSettings_(ss);
  var notificationConfig = {};
  var thresholds = nra2_getThresholds_(weeklyConfig);
  var scopeConfig = nra2_loadScopeConfig_(ss);
  var companiesMap = nra2_loadCompaniesMap_(ss);
  var recipients = nra2_getAuditorRecipients_(ss, settings);

  if (!recipients.length) {
    return { ok: false, error: 'No auditor recipients found' };
  }

  var data = sh.getDataRange().getValues();
  if (!data || data.length <= 1) {
    return { ok: true, processed: 0, recipients: recipients };
  }

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) {
    m[String(headers[i] || '').trim()] = i;
  }

  var idxCompany = nra2_idx_(m, ['Company']);
  var idxStatus = nra2_idx_(m, ['Status']);
  var idxAssigned = nra2_findOptionalIdx_(m, ['Assigned to', 'Auditor']);
  var idxPreassigned = nra2_findOptionalIdx_(m, ['Preassigned Auditor']);
  var idxAllowSelfPlanning = nra2_findOptionalIdx_(m, ['Allow self planning']);
  var idxPlanningWindowFrom = nra2_findOptionalIdx_(m, ['Planning window from']);
  var idxPlanningWindowTo = nra2_findOptionalIdx_(m, ['Planning window to']);
  var idxPlanned = nra2_findOptionalIdx_(m, ['Date - Planned']);
  var idxPlanningJson = nra2_findOptionalIdx_(m, ['Planning JSON']);
  var idxScopesText = nra2_findOptionalIdx_(m, ['Scopes']);
  var idxExpiry = nra2_findOptionalIdx_(m, ['Extended Expiration Date', 'Date - Will Expire']);

  var today = nra2_startOfDay_(new Date());
  var results = [];

  for (var rcp = 0; rcp < recipients.length; rcp++) {
    var recipient = recipients[rcp];
    if (!recipient) continue;

    var blocks = {
      critical: [],
      urgent: [],
      upcoming: [],
      pendingAcceptance: [],
      comingUp: [],
      pendingCompletion: []
    };

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var company = String(row[idxCompany] || '').trim();
      if (!company) continue;

      var status = String(row[idxStatus] || '').trim();
      if (!status) continue;

      var upStatus = nra2_up_(status);
      if (upStatus === 'COMPLETED' || upStatus === 'REJECTED') continue;

      var assigned = idxAssigned >= 0 ? String(row[idxAssigned] || '').trim() : '';
      var preassigned = idxPreassigned >= 0 ? String(row[idxPreassigned] || '').trim() : '';
      var allowSelfPlanning = idxAllowSelfPlanning >= 0 ? nra2_up_(row[idxAllowSelfPlanning]) : '';

      var planningWindowFrom = idxPlanningWindowFrom >= 0 ? nra2_parseSheetDate_(row[idxPlanningWindowFrom]) : null;
      var planningWindowTo = idxPlanningWindowTo >= 0 ? nra2_parseSheetDate_(row[idxPlanningWindowTo]) : null;
      var expiryDate = idxExpiry >= 0 ? nra2_parseSheetDate_(row[idxExpiry]) : null;

      var plannedInfo = nra2_getPlannedInfo_(
        idxPlanningJson >= 0 ? row[idxPlanningJson] : '',
        idxPlanned >= 0 ? row[idxPlanned] : ''
      );

      var companyMeta = companiesMap[company.toUpperCase()] || {};
      var scopes = nra2_extractScopesFromRow_(row, m, idxScopesText, scopeConfig.headerMap);

      var record = {
        company: company,
        number: companyMeta.number || '',
        country: companyMeta.country || '',
        status: status,
        planningWindowDisplay: nra2_formatWindow_(planningWindowFrom, planningWindowTo),
        expiryDisplay: expiryDate ? Utilities.formatDate(expiryDate, Session.getScriptTimeZone(), 'dd-MM-yyyy') : '',
        daysLeft: planningWindowTo ? nra2_daysBetween_(today, planningWindowTo) : '',
        plannedDisplay: plannedInfo.display,
        firstPlannedDate: plannedInfo.firstDate,
        daysOverdue: plannedInfo.firstDate && plannedInfo.firstPlannedDate < today ? Math.abs(nra2_daysBetween_(today, plannedInfo.firstDate)) : '',
        scopes: scopes
      };

      // 1) Pending planning - self planning required
      if (
        preassigned &&
        recipient &&
        preassigned.toLowerCase() === recipient.toLowerCase() &&
        allowSelfPlanning === 'YES' &&
        upStatus === 'PENDING PLANNING'
      ) {
        if (record.daysLeft !== '') {
          if (record.daysLeft <= thresholds.criticalDays) {
            blocks.critical.push(record);
          } else if (record.daysLeft <= thresholds.urgentDays) {
            blocks.urgent.push(record);
          } else if (record.daysLeft <= thresholds.upcomingDays) {
            blocks.upcoming.push(record);
          }
        }
      }

      // 2) Pending acceptance
      if (
        assigned &&
        recipient &&
        assigned.toLowerCase() === recipient.toLowerCase() &&
        upStatus === 'APPROVED'
      ) {
        blocks.pendingAcceptance.push(record);
      }

      // 3) Coming up
      if (
        assigned &&
        recipient &&
        assigned.toLowerCase() === recipient.toLowerCase() &&
        record.firstPlannedDate &&
        record.firstPlannedDate >= today &&
        record.firstPlannedDate <= nra2_addDays_(today, thresholds.comingUpDays)
      ) {
        blocks.comingUp.push(record);
      }

      // 4) Pending completion
      if (
        assigned &&
        recipient &&
        assigned.toLowerCase() === recipient.toLowerCase() &&
        record.firstPlannedDate &&
        record.firstPlannedDate < today
      ) {
        blocks.pendingCompletion.push(record);
      }
    }

    nra2_sortByDaysLeft_(blocks.critical);
    nra2_sortByDaysLeft_(blocks.urgent);
    nra2_sortByDaysLeft_(blocks.upcoming);
    nra2_sortByPlannedDate_(blocks.pendingAcceptance);
    nra2_sortByPlannedDate_(blocks.comingUp);
    nra2_sortByPlannedDate_(blocks.pendingCompletion);

    var total =
      blocks.critical.length +
      blocks.urgent.length +
      blocks.upcoming.length +
      blocks.pendingAcceptance.length +
      blocks.comingUp.length +
      blocks.pendingCompletion.length;

    if (!total) {
      results.push({ auditor: recipient, sent: false, reason: 'No rows' });
      continue;
    }

    var recipientName = nra2_nameFromEmail_(recipient);
    var subject = 'Weekly audit actions - ' + recipientName + ' - ' + Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd-MM-yyyy');
    var body = 'See HTML version';
    var html = nra2_buildMail_(recipientName, blocks, thresholds, scopeConfig.styleMap);

    var queueResult = nrm2_queueWeeklyMail_(ss, {
      eventKey: 'WEEKLY_AUDITOR_DIGEST',
      digestGroup: 'AUDITOR_WEEKLY',
      recipient: recipient,
      subject: subject,
      body: body,
      htmlBody: html,
      fromName: settings.DEFAULT_FROM_NAME || 'Audit Management System',
      replyTo: settings.DEFAULT_REPLY_TO || '',
      meta: {
        source: 'runAuditorWeeklyAlert',
        auditorName: recipientName,
        counts: {
          critical: blocks.critical.length,
          urgent: blocks.urgent.length,
          upcoming: blocks.upcoming.length,
          pendingAcceptance: blocks.pendingAcceptance.length,
          comingUp: blocks.comingUp.length,
          pendingCompletion: blocks.pendingCompletion.length
        },
        thresholds: thresholds
      }
    });

    results.push({
      auditor: recipient,
      queued: !!queueResult.ok,
      queueRow: queueResult.row || '',
      status: queueResult.status || '',
      error: queueResult.error || '',
      counts: {
        critical: blocks.critical.length,
        urgent: blocks.urgent.length,
        upcoming: blocks.upcoming.length,
        pendingAcceptance: blocks.pendingAcceptance.length,
        comingUp: blocks.comingUp.length,
        pendingCompletion: blocks.pendingCompletion.length
      }
    });
  }

  return {
    ok: true,
    results: results,
    thresholds: thresholds
  };
}

// ============================================================
// MAIL RENDER
// ============================================================

function nra2_buildMail_(auditorName, blocks, thresholds, scopeStyleMap) {
  var html = [];
  html.push('<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;color:#24292f;">');
  html.push('<h2 style="margin:0 0 12px 0;">Weekly audit actions</h2>');
  html.push('<p style="margin:0 0 10px 0;">Hello ' + nra2_safe_(auditorName) + '</p>');
  html.push('<p style="margin:0 0 16px 0;">Below are the audits that currently require your action. Report generated on: ' + nra2_safe_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy')) + '</p>');

  var pendingPlanningTotal = blocks.critical.length + blocks.urgent.length + blocks.upcoming.length;
  html.push('<div style="margin:0 0 22px 0;">');
  html.push('<div style="font-size:18px;font-weight:700;margin:0 0 6px 0;">1) Pending planning - self planning required (' + pendingPlanningTotal + ')</div>');
  html.push('<div style="margin:0 0 10px 0;color:#57606a;">You are preassigned and allowed to plan these audits. Urgency is based on the last day of the planning window.</div>');

  html.push(nra2_renderGroupTable_(
    'Critical (≤ ' + thresholds.criticalDays + ' days)',
    blocks.critical,
    scopeStyleMap
  ));
  html.push(nra2_renderGroupTable_(
    'Urgent (' + (thresholds.criticalDays + 1) + ' - ' + thresholds.urgentDays + ' days)',
    blocks.urgent,
    scopeStyleMap
  ));
  html.push(nra2_renderGroupTable_(
    'Upcoming (' + (thresholds.urgentDays + 1) + ' - ' + thresholds.upcomingDays + ' days)',
    blocks.upcoming,
    scopeStyleMap
  ));
  html.push('</div>');

  html.push('<div style="margin:0 0 22px 0;">');
  html.push('<div style="font-size:18px;font-weight:700;margin:0 0 6px 0;">2) Pending acceptance (' + blocks.pendingAcceptance.length + ')</div>');
  html.push('<div style="margin:0 0 10px 0;color:#57606a;">These audits are approved and require your acceptance.</div>');
  html.push(nra2_renderStandardTable_(
    blocks.pendingAcceptance,
    scopeStyleMap,
    [
      { key: 'company', label: 'Company' },
      { key: 'number', label: 'Number' },
      { key: 'country', label: 'Country' },
      { key: 'plannedDisplay', label: 'Planned' },
      { key: 'status', label: 'Status' },
      { key: 'scopes', label: 'Scopes' }
    ],
    'No approved audits waiting for acceptance.'
  ));
  html.push('</div>');

  html.push('<div style="margin:0 0 22px 0;">');
  html.push('<div style="font-size:18px;font-weight:700;margin:0 0 6px 0;">3) Coming up (' + blocks.comingUp.length + ')</div>');
  html.push('<div style="margin:0 0 10px 0;color:#57606a;">Prepare for upcoming audits.</div>');
  html.push(nra2_renderStandardTable_(
    blocks.comingUp,
    scopeStyleMap,
    [
      { key: 'company', label: 'Company' },
      { key: 'number', label: 'Number' },
      { key: 'country', label: 'Country' },
      { key: 'plannedDisplay', label: 'Planned' },
      { key: 'status', label: 'Status' },
      { key: 'scopes', label: 'Scopes' }
    ],
    'No upcoming audits in the configured window.'
  ));
  html.push('</div>');

  html.push('<div style="margin:0 0 22px 0;">');
  html.push('<div style="font-size:18px;font-weight:700;margin:0 0 6px 0;">4) Pending completion (' + blocks.pendingCompletion.length + ')</div>');
  html.push('<div style="margin:0 0 10px 0;color:#57606a;">These audits were planned in the past and still need completion.</div>');
  html.push(nra2_renderStandardTable_(
    blocks.pendingCompletion,
    scopeStyleMap,
    [
      { key: 'company', label: 'Company' },
      { key: 'number', label: 'Number' },
      { key: 'country', label: 'Country' },
      { key: 'plannedDisplay', label: 'Executed on / Planned' },
      { key: 'daysOverdue', label: 'Days overdue' },
      { key: 'status', label: 'Status' },
      { key: 'scopes', label: 'Scopes' }
    ],
    'No pending completion audits.'
  ));
  html.push('</div>');

  html.push('<p style="margin-top:18px;color:#57606a;">This is an automated weekly report from the Audit Management System.</p>');
  html.push('</div>');
  return html.join('');
}

function nra2_renderGroupTable_(title, rows, scopeStyleMap) {
  return (
    '<div style="margin:0 0 14px 0;">' +
      '<div style="font-weight:700;margin:0 0 6px 0;">' + nra2_safe_(title) + '</div>' +
      nra2_renderStandardTable_(
        rows,
        scopeStyleMap,
        [
          { key: 'company', label: 'Company' },
          { key: 'number', label: 'Number' },
          { key: 'country', label: 'Country' },
          { key: 'planningWindowDisplay', label: 'Planning window' },
          { key: 'expiryDisplay', label: 'Expiration date' },
          { key: 'daysLeft', label: 'Days left' },
          { key: 'scopes', label: 'Scopes' }
        ],
        'No audits in this group.'
      ) +
    '</div>'
  );
}

function nra2_renderStandardTable_(rows, scopeStyleMap, columns, emptyText) {
  var html = [];
  html.push('<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 10px 0;">');
  html.push('<tr style="background:#f6f8fa;">');

  for (var c = 0; c < columns.length; c++) {
    html.push('<th style="border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top;background:#f6f8fa;font-weight:600;">' + nra2_safe_(columns[c].label) + '</th>');
  }
  html.push('</tr>');

  if (!rows || !rows.length) {
    html.push('<tr><td colspan="' + columns.length + '" style="border:1px solid #d0d7de;padding:8px;color:#57606a;background:#ffffff;">' + nra2_safe_(emptyText || 'No rows') + '</td></tr>');
    html.push('</table>');
    return html.join('');
  }

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    html.push('<tr>');
    for (var k = 0; k < columns.length; k++) {
      var key = columns[k].key;
      var cellHtml = '';
      if (key === 'scopes') {
        cellHtml = nra2_renderScopes_(row.scopes, scopeStyleMap);
      } else {
        cellHtml = nra2_safe_(row[key] !== null && row[key] !== undefined ? row[key] : '');
      }
      html.push('<td style="border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;background:#ffffff;">' + cellHtml + '</td>');
    }
    html.push('</tr>');
  }

  html.push('</table>');
  return html.join('');
}

// ============================================================
// SETTINGS / CONFIG / RECIPIENTS
// ============================================================

function nra2_loadSettings_(ss) {
  if (typeof NotificationConfig_GetSenderSettings === 'function') return NotificationConfig_GetSenderSettings();
  return {};
}

function nra2_loadNotificationConfig_(ss) {
  return {};
}

function nra2_getThresholds_(weeklyConfig) {
  weeklyConfig = weeklyConfig || {};
  if (weeklyConfig.planningWindow || weeklyConfig.comingUpDays != null) {
    var pw = weeklyConfig.planningWindow || {};
    return {
      upcomingDays: Number(pw.upcomingDays || 0),
      urgentDays: Number(pw.urgentDays || 0),
      criticalDays: Number(pw.criticalDays || 0),
      comingUpDays: Number(weeklyConfig.comingUpDays || 0)
    };
  }
  if (typeof NotificationConfig_GetPlanningWindowThresholds === 'function') {
    var pw2 = NotificationConfig_GetPlanningWindowThresholds();
    var coming = (typeof NotificationConfig_GetComingUpDays === 'function') ? NotificationConfig_GetComingUpDays() : 14;
    return {
      upcomingDays: Number(pw2.upcomingDays || 0),
      urgentDays: Number(pw2.urgentDays || 0),
      criticalDays: Number(pw2.criticalDays || 0),
      comingUpDays: Number(coming || 0)
    };
  }
  return { upcomingDays: 0, urgentDays: 0, criticalDays: 0, comingUpDays: 14 };
}

function nra2_getActiveLevelDays_(cfg) {
  if (!cfg || cfg.active === false || !cfg.useLevels || !cfg.levels || !cfg.levels.length) return [];
  var out = [];
  for (var i = 0; i < cfg.levels.length; i++) {
    var days = cfg.levels[i];
    if (days !== null && days !== '' && !isNaN(days)) out.push(Number(days));
  }
  return out.sort(function(a, b) { return a - b; });
}

function nra2_getAuditorRecipients_(ss, settings) {
  var sh = ss.getSheetByName(NRA2_SHEET_AUDITORS);
  if (!sh) return [];

  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) {
    m[String(headers[i] || '').trim()] = i;
  }

  var idxEmail = nra2_findOptionalIdx_(m, ['E-mail', 'Email']);
  var idxActive = nra2_findOptionalIdx_(m, ['Active']);
  var idxRole = nra2_findOptionalIdx_(m, ['Role']);

  if (idxEmail < 0) return [];

  var testMode = nra2_up_(settings.TEST_MODE || '') === 'YES';
  var testRecipient = String(settings.TEST_RECIPIENT || '').trim();
  if (testMode && testRecipient) {
    return [testRecipient];
  }

  var recipients = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var email = String(row[idxEmail] || '').trim();
    var active = idxActive >= 0 ? nra2_up_(row[idxActive]) : 'YES';
    var role = idxRole >= 0 ? nra2_up_(row[idxRole]) : '';

    if (!email) continue;
    if (active && active !== 'YES' && active !== 'TRUE') continue;
    if (role === 'MANAGER') continue;

    recipients.push(email);
  }

  return nra2_unique_(recipients);
}

// ============================================================
// SUPPORT DATA
// ============================================================

function nra2_loadScopeConfig_(ss) {
  var sh = ss.getSheetByName(NRA2_SHEET_SCOPE_CONFIG);
  if (!sh) {
    return { styleMap: {}, headerMap: {} };
  }

  var data = sh.getDataRange().getValues();
  if (data.length <= 1) {
    return { styleMap: {}, headerMap: {} };
  }

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) {
    m[String(headers[i] || '').trim()] = i;
  }

  var idxSlotKey = nra2_idx_(m, ['SlotKey']);
  var idxScopeCode = nra2_findOptionalIdx_(m, ['ScopeCode']);
  var idxDisplayName = nra2_findOptionalIdx_(m, ['DisplayName']);
  var idxColor = nra2_findOptionalIdx_(m, ['Color']);
  var idxTextColor = nra2_findOptionalIdx_(m, ['TextColor']);

  var styleMap = {};
  var headerMap = {};

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var slotKey = String(row[idxSlotKey] || '').trim();
    if (!slotKey) continue;

    var scopeCode = idxScopeCode >= 0 ? String(row[idxScopeCode] || '').trim() : '';
    var displayName = idxDisplayName >= 0 ? String(row[idxDisplayName] || '').trim() : '';
    var color = idxColor >= 0 ? String(row[idxColor] || '').trim() : '';
    var textColor = idxTextColor >= 0 ? String(row[idxTextColor] || '').trim() : '';

    styleMap[slotKey] = {
      label: displayName || scopeCode || slotKey,
      bg: color || '#e5e7eb',
      fg: textColor || '#111827'
    };

    headerMap[nra2_scopeKey_(slotKey)] = slotKey;
    if (scopeCode) headerMap[nra2_scopeKey_(scopeCode)] = slotKey;
    if (displayName) headerMap[nra2_scopeKey_(displayName)] = slotKey;
  }

  return {
    styleMap: styleMap,
    headerMap: headerMap
  };
}

function nra2_loadCompaniesMap_(ss) {
  /*
   * COMPANIES READ CENTRALIZATION — 2026-04-27
   * Prefer CompaniesIndexService to avoid a full Companies getDataRange()
   * during weekly auditor alert generation. Fallback keeps legacy behavior.
   */
  try {
    if (typeof CompaniesIndex_GetUidCoreIndex === 'function') {
      var core = CompaniesIndex_GetUidCoreIndex(false);
      if (core && core.ok && core.byUid) {
        var indexedMap = {};
        Object.keys(core.byUid || {}).forEach(function(uid) {
          var rec = core.byUid[uid] || {};
          var company = String(rec.companyName || '').trim();
          if (!company) return;
          indexedMap[company.toUpperCase()] = {
            number: String(rec.number || '').trim(),
            country: String(rec.country || '').trim()
          };
        });
        return indexedMap;
      }
    }
  } catch (eIndex) {
    // Safe fallback below.
  }

  var sh = ss.getSheetByName(NRA2_SHEET_COMPANIES);
  if (!sh) return {};

  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return {};

  var headers = data[0];
  var m = {};
  for (var i = 0; i < headers.length; i++) {
    m[String(headers[i] || '').trim()] = i;
  }

  var idxCompany = nra2_idx_(m, ['Company']);
  var idxNumber = nra2_findOptionalIdx_(m, ['Number']);
  var idxCountry = nra2_findOptionalIdx_(m, ['Country']);

  var map = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var company = String(row[idxCompany] || '').trim();
    if (!company) continue;

    map[company.toUpperCase()] = {
      number: idxNumber >= 0 ? String(row[idxNumber] || '').trim() : '',
      country: idxCountry >= 0 ? String(row[idxCountry] || '').trim() : ''
    };
  }

  return map;
}

// ============================================================
// SCOPES / DATES / SORT
// ============================================================

function nra2_extractScopesFromRow_(row, m, idxScopesText, headerMap) {
  var found = [];
  var seen = {};
  headerMap = headerMap || {};

  var headers = Object.keys(m);
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h] || '').trim();
    if (!header) continue;

    var slotKey = headerMap[nra2_scopeKey_(header)];
    if (!slotKey) continue;

    var idx = m[header];
    if (idx < 0) continue;

    var v = String(row[idx] || '').trim();
    if (!v) continue;
    var upv = nra2_up_(v);
    if (upv === 'NO' || upv === 'FALSE' || upv === '0') continue;

    if (!seen[slotKey]) {
      seen[slotKey] = true;
      found.push(slotKey);
    }
  }

  if (idxScopesText >= 0) {
    var raw = String(row[idxScopesText] || '').trim();
    if (raw) {
      var parts = raw.split(/[,;\n]/);
      for (var p = 0; p < parts.length; p++) {
        var part = String(parts[p] || '').trim();
        if (!part) continue;
        var mappedSlot = headerMap[nra2_scopeKey_(part)];
        if (!mappedSlot) continue;
        if (!seen[mappedSlot]) {
          seen[mappedSlot] = true;
          found.push(mappedSlot);
        }
      }
    }
  }

  return found;
}

function nra2_getPlannedInfo_(planningJsonText, legacyDateValue) {
  var dates = [];
  var firstDate = null;

  var parsed = null;
  try { parsed = planningJsonText ? JSON.parse(planningJsonText) : null; } catch (e) { parsed = null; }

  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed)) {
      for (var i = 0; i < parsed.length; i++) {
        if (parsed[i] && parsed[i].date) dates.push(parsed[i].date);
      }
    } else if (Array.isArray(parsed.days)) {
      for (var j = 0; j < parsed.days.length; j++) {
        if (parsed.days[j] && parsed.days[j].date) dates.push(parsed.days[j].date);
      }
    }
  }

  if (!dates.length) {
    var legacyDate = nra2_parseSheetDate_(legacyDateValue);
    if (legacyDate) dates.push(Utilities.formatDate(legacyDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  }

  var display = '';
  if (dates.length) {
    var sorted = dates.slice().sort();
    firstDate = nra2_parseSheetDate_(sorted[0]);
    if (dates.length === 1) {
      display = nra2_formatIsoDate_(sorted[0]);
    } else {
      display = nra2_formatIsoDate_(sorted[0]) + ' - ' + nra2_formatIsoDate_(sorted[sorted.length - 1]);
    }
  }

  return {
    dates: dates,
    display: display,
    firstDate: firstDate
  };
}

function nra2_renderScopes_(scopes, scopeStyleMap) {
  if (!scopes || !scopes.length) return '';
  var html = [];
  for (var i = 0; i < scopes.length; i++) {
    var slotKey = scopes[i];
    var style = scopeStyleMap[slotKey] || { label: slotKey, bg: '#e5e7eb', fg: '#111827' };
    html.push(
      '<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border-radius:999px;background:' +
      nra2_safe_(style.bg) +
      ';color:' +
      nra2_safe_(style.fg) +
      ';font-weight:700;font-size:12px;line-height:1.2;white-space:nowrap;">' +
      nra2_safe_(style.label) +
      '</span>'
    );
  }
  return html.join('');
}

function nra2_sortByDaysLeft_(rows) {
  rows.sort(function(a, b) {
    var da = a.daysLeft === '' ? 999999 : Number(a.daysLeft);
    var db = b.daysLeft === '' ? 999999 : Number(b.daysLeft);
    if (da !== db) return da - db;
    var ca = nra2_up_(a.company);
    var cb = nra2_up_(b.company);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
  });
}

function nra2_sortByPlannedDate_(rows) {
  rows.sort(function(a, b) {
    var ta = a.firstPlannedDate ? a.firstPlannedDate.getTime() : 0;
    var tb = b.firstPlannedDate ? b.firstPlannedDate.getTime() : 0;
    if (ta !== tb) return ta - tb;
    var ca = nra2_up_(a.company);
    var cb = nra2_up_(b.company);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
  });
}

function nra2_formatWindow_(fromDate, toDate) {
  var fromText = fromDate ? Utilities.formatDate(fromDate, Session.getScriptTimeZone(), 'dd-MM-yyyy') : '';
  var toText = toDate ? Utilities.formatDate(toDate, Session.getScriptTimeZone(), 'dd-MM-yyyy') : '';
  if (fromText && toText) return fromText + ' → ' + toText;
  if (toText) return '→ ' + toText;
  if (fromText) return fromText + ' →';
  return '';
}

// ============================================================
// GENERIC HELPERS
// ============================================================

function nra2_idx_(m, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (m.hasOwnProperty(keys[i])) return m[keys[i]];
  }
  throw new Error('Missing column: ' + keys.join(' / '));
}

function nra2_findOptionalIdx_(m, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (m.hasOwnProperty(keys[i])) return m[keys[i]];
  }
  return -1;
}

function nra2_safe_(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nra2_up_(v) {
  return String(v || '').toUpperCase().trim();
}

function nra2_toNumber_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function nra2_parseSheetDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return nra2_startOfDay_(v);
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(s);
  if (!isNaN(d.getTime())) return nra2_startOfDay_(d);
  return null;
}

function nra2_startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nra2_addDays_(d, days) {
  var out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

function nra2_daysBetween_(fromDate, toDate) {
  return Math.floor((nra2_startOfDay_(toDate).getTime() - nra2_startOfDay_(fromDate).getTime()) / 86400000);
}

function nra2_formatIsoDate_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || '');
  return m[3] + '-' + m[2] + '-' + m[1];
}

function nra2_scopeKey_(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nra2_unique_(arr) {
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var key = String(arr[i] || '').trim().toLowerCase();
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(String(arr[i]).trim());
  }
  return out;
}

function nra2_nameFromEmail_(email) {
  var local = String(email || '').split('@')[0];
  if (!local) return String(email || '');
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}



function nra2_sendEmailRespectingSystemConfig_(recipient, subject, body, options) {
  var delivery = null;
  if (typeof NotificationSender_ResolveDelivery === 'function') {
    delivery = NotificationSender_ResolveDelivery(recipient);
  } else if (typeof ns_resolveNotificationDelivery_ === 'function') {
    delivery = ns_resolveNotificationDelivery_(recipient);
  } else {
    delivery = {
      mode: 'NOTIFICATION_SENDER_RESOLVER_MISSING_FAIL_CLOSED',
      send: false,
      recipient: '',
      recipients: [],
      originalRecipients: [String(recipient || '').trim()].filter(Boolean),
      overridden: false,
      source: 'WeeklyAuditorFailClosed',
      failClosed: true
    };
  }

  if (!delivery || !delivery.send) {
    return {
      sent: false,
      status: 'SUPPRESSED',
      mode: delivery && delivery.mode ? delivery.mode : 'UNKNOWN',
      note: delivery && delivery.error ? delivery.error : 'Sending suppressed by notification delivery guard.'
    };
  }

  var finalSubject = String(subject || '');
  var finalBody = String(body || '');
  var opt = options || {};

  if (delivery.overridden) {
    finalSubject = '[DEV TEST] ' + finalSubject;
    if (opt.htmlBody) {
      opt.htmlBody = '<div style="font-family:Arial,sans-serif;color:#b42318;font-weight:700;">DEV TEST_TO_SELF redirect.<br>Original recipient(s): ' + nra2_safe_((delivery.originalRecipients || []).join(', ')) + '</div><hr>' + opt.htmlBody;
    }
    finalBody = 'DEV TEST_TO_SELF redirect. Original recipient(s): ' + (delivery.originalRecipients || []).join(', ') + '\n\n' + finalBody;
  }

  NS_sendEmailWithConfiguredIdentity_(delivery.recipient, finalSubject, finalBody, opt, { source: 'runAuditorWeeklyAlert', deliveryMode: delivery.mode });
  return {
    sent: true,
    status: delivery.overridden ? 'SENT_DEV_REDIRECT' : 'SENT',
    mode: delivery.mode || '',
    note: delivery.overridden ? 'Redirected to ' + delivery.recipient : ''
  };
}


// ============================================================
// BUILDER BRIDGE COMPATIBILITY
// ============================================================
// Weekly mails are generated by runManagerWeeklyAlert() and runAuditorWeeklyAlert().
// These functions are kept so NotificationBuilder's WEEKLY profile does not fall
// through to Compact Lifecycle if a queued WEEKLY item is ever routed here.

function NB_renderWeekly_(n) {
  n = n || {};
  return {
    subject: n.subject || 'Weekly audit actions',
    body: n.body || 'Weekly audit actions are generated by runAuditorWeeklyAlert() and runManagerWeeklyAlert().',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;color:#24292f;">' +
      '<h2 style="margin:0 0 12px 0;">Weekly audit actions</h2>' +
      '<p style="margin:0;">Weekly audit actions are generated by the weekly runner functions.</p>' +
      '</div>'
  };
}

function NB_renderWeeklyDigest_(recipientEmail, items) {
  items = items || [];
  return {
    subject: 'Weekly audit actions',
    body: 'Weekly audit digest items: ' + items.length + '\nWeekly digest mails are generated by runAuditorWeeklyAlert() and runManagerWeeklyAlert().',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;color:#24292f;">' +
      '<h2 style="margin:0 0 12px 0;">Weekly audit actions</h2>' +
      '<p style="margin:0 0 8px 0;">Weekly digest mails are generated by the weekly runner functions.</p>' +
      '<p style="margin:0;color:#57606a;">Items routed through builder: ' + String(items.length).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>' +
      '</div>'
  };
}
