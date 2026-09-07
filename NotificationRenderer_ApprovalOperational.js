/***********************************************************************
 * FILE: NotificationRenderer_ApprovalOperational.gs
 * BUILD: 2026-05-14_RENDERER_APPROVAL_OPERATIONAL_SHARED_HELPERS_R2
 *
 * PURPOSE
 * - Single renderer owner for APPROVAL_OPERATIONAL mails.
 * - Owns NB_renderApprovalOperational_(), NB_renderApprovalOperationalHtml_(),
 *   validation helpers for this renderer, and NB_renderOperationalDigest_().
 * - No queue writes.
 * - No status decisions.
 * - No delivery logic.
 * - Shared badge/table/date helpers live in NotificationRenderer_SharedHtmlHelpers.gs.
 ***********************************************************************/

/* ============================================================
 * Renderers: approval operational
 * ============================================================ */

function NB_renderApprovalOperational_(n) {
  var subject = n.subject || NB_subjectForEvent_(n.eventCode, n.company, n.auditId);
  var lines = [];
  lines.push('Event: ' + n.eventCode);
  if (n.company) lines.push('Company: ' + n.company);
  if (NB_mpsNumber_(n)) lines.push('MPS Number: ' + NB_mpsNumber_(n));
  if (n.auditId) lines.push('Audit ID: ' + n.auditId);
  if (n.actor) lines.push((n.actorRole || 'Actor') + ': ' + n.actor);
  if (n.displayStatus) lines.push('Status result: ' + n.displayStatus);
  if (n.scopes && n.scopes.length) lines.push('Scopes: ' + n.scopes.join(', '));
  if (n.plannedHours !== '' && n.plannedHours !== null) lines.push('Planned hours: ' + n.plannedHours);
  if (n.blocks && n.blocks.length) {
    lines.push('');
    lines.push('Proposed planning:');
    for (var i = 0; i < n.blocks.length; i++) lines.push('- ' + NB_blockLineText_(n.blocks[i]));
  }
  if (n.comment) {
    lines.push('');
    lines.push('Comment:');
    lines.push(n.comment);
  }
  if (n.nextSteps && n.nextSteps.length) {
    lines.push('');
    lines.push('What happens next:');
    for (var j = 0; j < n.nextSteps.length; j++) lines.push(n.nextSteps[j]);
  }

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_renderApprovalOperationalHtml_(n)
  };
}

function NB_renderApprovalOperationalHtml_(n) {
  var html = [];
  var mpsNumber = NB_mpsNumber_(n);

  html.push(NB_htmlShellStart_());
  html.push('<div style="border:1px solid #d8e1ef;border-radius:14px;background:#ffffff;padding:14px 18px">');
  html.push('<div style="font-size:12px;color:#667085;text-transform:uppercase;letter-spacing:.06em">Approval required</div>');
  html.push('<div style="font-size:18px;font-weight:700;margin:4px 0 8px">' + NB_html_(n.company || 'Audit approval') + '</div>');
  if (mpsNumber) html.push('<div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:4px">' + NB_html_(mpsNumber) + '</div>');
  if (n.auditId) html.push('<div style="font-size:12px;color:#64748b;margin-bottom:12px">Audit ID: ' + NB_html_(n.auditId) + '</div>');
  html.push(NB_statusBadgeHtml_(n.displayStatus || 'Pending approval'));

  html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:14px 0">');
  html.push(NB_htmlRow_('Company', n.company));
  if (mpsNumber) html.push(NB_htmlRow_('MPS Number', mpsNumber));
  if (n.actor) html.push(NB_htmlRow_(n.actorRole || 'Actor', n.actor));
  if (n.auditorEmail) html.push(NB_htmlRow_('Auditor', n.auditorEmail));
  if (n.scopes && n.scopes.length) html.push(NB_htmlRowHtml_('Scopes', NB_scopeBadgesHtml_(n.scopes)));
  if (n.plannedHours !== '' && n.plannedHours !== null) html.push(NB_htmlRow_('Planned hours', NB_formatHours_(n.plannedHours)));
  html.push('</table>');

  html.push(NB_renderPlanningTableHtml_(n.blocks, false, n));
  html.push(NB_renderApprovalValidationHtml_(n));

  if (n.comment) html.push(NB_sectionHtml_('Comment', '<div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px">' + NB_html_(n.comment) + '</div>'));
  html.push('<div style="margin-top:16px;font-size:11px;color:#64748b">Review and approve or deny this planning in the Manager interface.</div>');
  html.push('</div>');
  html.push(NB_htmlShellEnd_());
  return html.join('');
}

function NB_renderApprovalValidationHtml_(n) {
  n = n || {};
  var checks = n.validation || n.checks || {};
  var hasAny = !!(checks.companyConstraints || checks.auditorRotation || checks.rotation || checks.qualification || checks.qualifications || checks.consecutive);
  if (!hasAny) return '';

  var html = [];
  html.push('<div style="margin-top:16px"><div style="font-weight:700;margin-bottom:6px">Constraints & rotation checks</div>');
  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>');

  html.push('<td valign="top" style="width:50%;padding-right:8px"><div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#ffffff">');
  html.push('<div style="font-weight:700;font-size:13px;margin-bottom:6px">Company constraints</div>');
  html.push(NB_validationListHtml_(checks.companyConstraints || checks.company || []));
  html.push('</div></td>');

  html.push('<td valign="top" style="width:50%;padding-left:8px"><div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#ffffff">');
  html.push('<div style="font-weight:700;font-size:13px;margin-bottom:6px">Auditor rotation & qualification</div>');
  html.push(NB_validationListHtml_(checks.auditorRotation || checks.auditor || checks.rotation || checks.qualification || checks.qualifications || checks.consecutive || []));
  html.push('</div></td>');

  html.push('</tr></table></div>');
  return html.join('');
}

function NB_validationListHtml_(items) {
  if (!items) return '<div style="font-size:11px;color:#64748b">No issues reported.</div>';
  if (!Array.isArray(items)) items = [items];
  if (!items.length) return '<div style="font-size:13px;color:#166534">✓ No issues reported</div>';
  var html = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var text = '';
    var level = 'ok';
    if (typeof item === 'string') {
      text = item;
      level = item.indexOf('⚠') >= 0 ? 'warning' : 'ok';
    } else if (item && typeof item === 'object') {
      text = NB_clean_(item.label || item.message || item.text || item.name);
      level = NB_clean_(item.level || item.status || '').toLowerCase();
    }
    if (!text) continue;
    var color = (level.indexOf('warn') >= 0 || level.indexOf('fail') >= 0 || level.indexOf('issue') >= 0) ? '#92400e' : '#166534';
    var prefix = (color === '#92400e' && text.indexOf('⚠') < 0) ? '⚠ ' : (text.indexOf('✓') < 0 && text.indexOf('⚠') < 0 ? '✓ ' : '');
    html.push('<div style="font-size:11px;line-height:1.5;color:' + color + '">' + NB_html_(prefix + text) + '</div>');
  }
  return html.join('') || '<div style="font-size:11px;color:#64748b">No issues reported.</div>';
}

function NB_renderOperationalDigest_(recipientEmail, normalizedItems) {
  normalizedItems = normalizedItems || [];

  if (normalizedItems.length === 1) {
    var single = normalizedItems[0] || {};
    var singleProfile = NB_clean_(single.rendererProfile).toUpperCase();
    if (singleProfile === 'APPROVAL_OPERATIONAL') return NB_renderApprovalOperational_(single);
    if (singleProfile === 'MANAGER_APPROVAL_OPERATIONAL') return NB_renderManagerApprovalOperational_(single);
    return NB_renderRichOperational_(single);
  }

  var subject = '[Audit Planning] Operational planning packages (' + normalizedItems.length + ')';
  var lines = [];
  var cards = [];
  lines.push('Hello,');
  lines.push('');
  lines.push('You have ' + normalizedItems.length + ' operational planning package(s):');
  lines.push('');

  for (var i = 0; i < normalizedItems.length; i++) {
    var n = normalizedItems[i] || {};
    var profile = NB_clean_(n.rendererProfile).toUpperCase();
    var rendered;
    if (profile === 'APPROVAL_OPERATIONAL') {
      rendered = NB_renderApprovalOperational_(n);
    } else if (profile === 'MANAGER_APPROVAL_OPERATIONAL') {
      rendered = NB_renderManagerApprovalOperational_(n);
    } else {
      rendered = NB_renderRichOperational_(n);
    }
    lines.push('------------------------------------------------------------');
    lines.push(rendered.body);
    lines.push('');
    cards.push(rendered.htmlBody);
  }

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_wrapDigestHtml_(subject, recipientEmail, cards, normalizedItems.length)
  };
}

function NB_wrapDigestHtml_(subject, recipientEmail, cards, count) {
  cards = cards || [];
  var html = [];
  html.push(NB_htmlShellStart_());
  html.push('<div style="font-size:22px;font-weight:700;margin-bottom:10px">' + NB_html_(subject || 'Audit Planning notification') + '</div>');
  html.push('<p style="margin:0 0 12px">Hello,</p>');
  html.push('<p style="margin:0 0 16px">You have ' + NB_html_(String(count || cards.length || 0)) + ' new notification(s):</p>');
  for (var i = 0; i < cards.length; i++) html.push(cards[i]);
  html.push('<div style="color:#667085;font-size:12px;margin-top:18px;border-top:1px solid #e6edf7;padding-top:10px">This is an automated message from the ' + NB_html_(NB_SYSTEM_NAME) + '.</div>');
  html.push(NB_htmlShellEnd_());
  return html.join('');
}
