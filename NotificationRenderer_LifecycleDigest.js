/***********************************************************************
 * FILE: NotificationRenderer_LifecycleDigest.gs
 * BUILD: 2026-05-14_RENDERER_LIFECYCLE_DIGEST_R1
 *
 * PURPOSE
 * - Renders compact lifecycle/status digest mails.
 * - Status update digest tables.
 * - No operational rich rendering.
 * - No weekly rendering.
 ***********************************************************************/

/* ============================================================
 * Renderers: compact lifecycle
 * ============================================================ */

function NB_renderCompactLifecycle_(n) {
  var subject = n.subject || NB_subjectForEvent_(n.eventCode, n.company, n.auditId);
  var lines = [];
  lines.push('Event: ' + n.eventCode);
  if (n.company) lines.push('Company: ' + n.company);
  if (n.auditId) lines.push('Audit: ' + n.auditId);
  if (n.title) lines.push('Action: ' + n.title);
  if (n.displayStatus) lines.push('Status result: ' + n.displayStatus);
  if (n.actor) lines.push((n.actorRole || 'Actor') + ': ' + n.actor);
  if (n.includeComment) {
    lines.push('');
    lines.push('Comment:');
    lines.push(NB_lifecycleDetailText_(n));
  }
  if (n.nextSteps && n.nextSteps.length) {
    lines.push('');
    lines.push('What happens next:');
    for (var i = 0; i < n.nextSteps.length; i++) lines.push(n.nextSteps[i]);
  }

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_renderCompactLifecycleHtml_(n)
  };
}

function NB_renderCompactLifecycleHtml_(n) {
  var html = [];
  html.push(NB_htmlShellStart_());
  html.push('<div style="border:1px solid #d8e1ef;border-radius:12px;padding:16px 18px;background:#ffffff;margin:0 0 12px 0">');
  html.push('<div style="font-size:12px;color:#667085;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">' + NB_html_(n.eventCode) + '</div>');
  html.push('<div style="font-size:18px;font-weight:700;margin-bottom:10px">' + NB_html_(n.title || n.subject || 'Audit notification') + '</div>');
  html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin-bottom:10px">');
  if (n.company) html.push(NB_htmlRow_('Company', n.company));
  if (n.auditId) html.push(NB_htmlRow_('Audit ID', n.auditId));
  if (n.displayStatus) html.push(NB_htmlRow_('Status result', n.displayStatus));
  if (n.actor) html.push(NB_htmlRow_(n.actorRole || 'Actor', n.actor));
  html.push('</table>');
  if (n.includeComment) html.push(NB_sectionHtml_('Comment', '<div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px">' + NB_html_(NB_lifecycleDetailText_(n)) + '</div>'));
  html.push(NB_nextStepsHtml_(n.nextSteps));
  html.push('</div>');
  html.push(NB_htmlShellEnd_());
  return html.join('');
}

/* ============================================================
 * Renderers: digests
 * ============================================================ */

function NB_renderLifecycleDigest_(recipientEmail, normalizedItems) {
  normalizedItems = normalizedItems || [];
  var auditorName = NB_lifecycleDigestAuditor_(recipientEmail, normalizedItems);
  var now = new Date();
  var tz = NB_getTz_(SpreadsheetApp.getActiveSpreadsheet());
  var digestDate = Utilities.formatDate(now, tz, 'dd-MM-yyyy');
  var digestTime = Utilities.formatDate(now, tz, 'HH:mm');
  var subject = 'Audit status overview — ' + auditorName + ' — ' + digestDate + ' ' + digestTime;

  var lines = [];
  lines.push('Hello,');
  lines.push('');
  lines.push('Below is an overview of recent audit status updates.');
  lines.push('');
  lines.push('Auditor: ' + auditorName);
  lines.push('');
  lines.push('Status | MPS No. | Company | Scopes | Date(s)' + (NB_lifecycleHasReason_(normalizedItems) ? ' | Reason' : ''));

  for (var i = 0; i < normalizedItems.length; i++) {
    var n = normalizedItems[i] || {};
    var cols = [
      NB_lifecycleEventLabel_(n),
      NB_mpsNumber_(n),
      NB_clean_(n.company),
      (n.scopes || []).join(', '),
      NB_lifecycleDatesText_(n)
    ];
    if (NB_lifecycleHasReason_(normalizedItems)) cols.push(NB_lifecycleDetailText_(n));
    lines.push(cols.join(' | '));
  }

  lines.push('');
  lines.push('Thank you,');
  lines.push('');
  lines.push('René Rombouts');

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_renderLifecycleDigestHtml_(subject, recipientEmail, normalizedItems, auditorName)
  };
}

function NB_renderLifecycleDigestHtml_(subject, recipientEmail, items, auditorName) {
  items = items || [];
  auditorName = auditorName || NB_lifecycleDigestAuditor_(recipientEmail, items);
  var hasReason = NB_lifecycleHasReason_(items);
  var html = [];

  html.push(NB_htmlShellStart_());
  html.push('<div style="font-size:17px;font-weight:700;margin-bottom:8px">' + NB_html_(subject || 'Audit status overview') + '</div>');
  html.push('<p style="margin:0 0 12px;color:#475569">Hello,</p>');
  html.push('<p style="margin:0 0 14px;color:#475569">Below is an overview of recent audit status updates.</p>');
  html.push('<div style="margin:0 0 10px;padding:6px 8px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:9px;font-weight:700">Auditor: ' + NB_html_(auditorName) + '</div>');

  html.push('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:11px;margin:0 0 12px 0">');
  html.push('<thead><tr style="background:#f8fafc">');
  html.push(NB_th_('Status'));
  html.push(NB_th_('MPS No.'));
  html.push(NB_th_('Company'));
  html.push(NB_th_('Scopes'));
  html.push(NB_th_('Date(s)'));
  if (hasReason) html.push(NB_th_('Reason'));
  html.push('</tr></thead><tbody>');

  if (!items.length) {
    html.push('<tr><td colspan="' + (hasReason ? '6' : '5') + '" style="padding:8px;border:1px solid #d8e1ef;color:#64748b">No lifecycle updates.</td></tr>');
  }

  for (var i = 0; i < items.length; i++) {
    var n = items[i] || {};
    html.push('<tr>');
    html.push(NB_tdHtml_(NB_statusBadgeForLifecycleHtml_(NB_lifecycleEventLabel_(n))));
    html.push(NB_td_(NB_mpsNumber_(n)));
    html.push(NB_td_(n.company));
    html.push(NB_tdHtml_(NB_scopeBadgesHtml_(n.scopes || [])));
    html.push(NB_td_(NB_lifecycleDatesText_(n)));
    if (hasReason) html.push(NB_td_(NB_lifecycleDetailText_(n)));
    html.push('</tr>');
  }

  html.push('</tbody></table>');
  html.push('<div style="font-size:11px;color:#334155;margin-top:18px">Thank you,<br><br>René Rombouts</div>');
  html.push(NB_htmlShellEnd_());
  return html.join('');
}

function NB_lifecycleDigestAuditor_(recipientEmail, items) {
  for (var i = 0; i < (items || []).length; i++) {
    var n = items[i] || {};
    var a = NB_clean_(n.auditorName || n.auditorEmail);
    if (a) return a;
  }
  return NB_clean_(recipientEmail) || 'Auditor';
}

function NB_lifecycleHasReason_(items) {
  for (var i = 0; i < (items || []).length; i++) {
    if (NB_lifecycleDetailText_(items[i])) return true;
  }
  return false;
}

function NB_lifecycleDatesText_(n) {
  n = n || {};
  if (n.blocks && n.blocks.length) {
    if (n.blocks.length === 1) return NB_formatExternalDate_(n.blocks[0].date);
    return NB_formatExternalDate_(n.blocks[0].date) + '–' + NB_formatExternalDate_(n.blocks[n.blocks.length - 1].date);
  }
  if (n.plannedDates && n.plannedDates.length) return n.plannedDates.join(', ');
  return '';
}

function NB_lifecycleEventLabel_(n) {
  n = n || {};
  var code = NB_clean_(n.eventCode);
  if (code === 'AUDIT_ACCEPTED') return 'Accepted';
  if (code === 'AUDIT_COMPLETED') {
    var role = NB_clean_(n.actorRole).toLowerCase();
    if (role === 'manager') return 'Completed on behalf of auditor';
    return 'Completed';
  }
  if (code === 'COMPLETED_ON_BEHALF') return 'Completed on behalf of auditor';
  if (code === 'AUDIT_CANCELLED_BY_MANAGER') return 'Cancel by manager';
  if (code === 'AUDIT_CANCELLED_BY_AUDITOR') return 'Cancel by auditor';
  if (code === 'AUDIT_DENIED_BY_MANAGER') return 'Deny by manager';
  if (code === 'AUDIT_DENIED_BY_AUDITOR') return 'Deny by auditor';
  if (code === 'AUDIT_REJECTED_BY_MANAGER') return 'Rejected by manager';
  if (code === 'AUDIT_APPROVED') return 'Approved';
  if (code === 'EXTENSION_APPLIED') return 'Extension applied';
  if (code === 'EXTENSION_UNDONE') return 'Extension undone';
  return n.title || code || 'Update';
}

function NB_lifecycleActorText_(n) {
  n = n || {};
  var actor = NB_clean_(n.actor);
  var role = NB_clean_(n.actorRole);
  if (actor && role) return role + ': ' + actor;
  return actor || role || '';
}

function NB_lifecycleDetailText_(n) {
  n = n || {};
  if (n.includeComment) return NB_clean_(n.reason || n.comment || n.decisionReason || n.cancelReason || n.denyReason || n.rejectReason || '');
  return NB_clean_(n.comment);
}
