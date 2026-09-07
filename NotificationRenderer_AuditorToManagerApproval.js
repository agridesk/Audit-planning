/***********************************************************************
 * FILE: NotificationRenderer_AuditorToManagerApproval.gs
 * BUILD: 2026-05-23_RENDERER_AUDITOR_TO_MANAGER_APPROVAL_CALENDAR_CONTACT_ALWAYS_R7
 *
 * PURPOSE
 * - Renders auditor self-planned audit mails to managers. Compact operational approval package for approve/deny decision.
 * - Intended event/profile:
 *   - AUDIT_PLANNED_BY_AUDITOR
 *   - MANAGER_APPROVAL_OPERATIONAL
 *
 * R3 FIX
 * - Calendar item body mirrors ManagerToAuditorPlanning reference.
 * - Same title/details/location/GPS/contact/comment composition; only local function prefixes differ.
 * GOVERNANCE
 * - No queue writes.
 * - No status decisions.
 * - No delivery logic.
 * - Shared badge/table/date helpers live in NotificationRenderer_SharedHtmlHelpers.gs.
 * - Calendar links are generated from the proposed planning blocks.
 * - Manager receives a compact operational approval package.
 * - Auditor can receive a self-copy with the same calendar links and adjusted wording.
 ***********************************************************************/

/* ============================================================
 * Renderer: auditor to manager approval
 * ============================================================ */

function NB_renderManagerApprovalOperational_(n) {
  n = n || {};

  var subject = NB_managerApprovalSubject_(n);
  var lines = [];

  lines.push('Event: ' + (n.eventCode || 'AUDIT_PLANNED_BY_AUDITOR'));
  if (n.company) lines.push('Company: ' + n.company);
  if (NB_mpsNumber_(n)) lines.push('MPS Number: ' + NB_mpsNumber_(n));
  if (n.auditId) lines.push('Audit ID: ' + n.auditId);
  if (n.displayStatus) lines.push('Status result: ' + n.displayStatus);
  if (n.auditorEmail) lines.push('Auditor: ' + n.auditorEmail);
  if (n.actor) lines.push((n.actorRole || 'Submitted by') + ': ' + n.actor);
  if (n.scopes && n.scopes.length) lines.push('Scopes: ' + n.scopes.join(', '));
  if (n.country) lines.push('Country: ' + n.country);
  if (n.region) lines.push('Region: ' + n.region);
  if (n.plannedHours !== '' && n.plannedHours !== null && typeof n.plannedHours !== 'undefined') {
    lines.push('Total planned hours: ' + n.plannedHours);
  }

  if (n.blocks && n.blocks.length) {
    lines.push('');
    lines.push('Proposed planning:');
    for (var i = 0; i < n.blocks.length; i++) {
      lines.push('- ' + NB_blockLineText_(n.blocks[i]));
    }
  }

  if (n.companyComments || n.comment) {
    lines.push('');
    lines.push('Comments:');
    lines.push(n.companyComments || n.comment);
  }

  lines.push('');
  lines.push('What happens next:');
  if (NB_managerApprovalIsAuditorCopy_(n)) {
    lines.push('Your proposed planning has been submitted for manager approval.');
    lines.push('You can add the proposed audit day(s) to your own calendar from this mail.');
    lines.push('The audit is final only after manager approval.');
  } else {
    lines.push('Review the proposed planning in the Manager interface.');
    lines.push('Approve the planning if it is acceptable.');
    lines.push('Deny it if it needs to return to planning.');
  }

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_renderManagerApprovalOperationalHtml_(n)
  };
}

function NB_renderManagerApprovalOperationalHtml_(n) {
  n = n || {};

  var html = [];
  var mpsNumber = NB_mpsNumber_(n);
  var submittedBy = NB_clean_(n.actor || n.actorEmail || n.auditorEmail || '');
  var submittedOn = NB_clean_(n.plannedOn || n.timestamp || n.submittedOn || '');
  var status = NB_clean_(n.displayStatus || 'Pending Approval');
  var auditorCopy = NB_managerApprovalIsAuditorCopy_(n);
  var heroTitle = auditorCopy ? 'Your planning proposal was submitted' : 'Audit planned by auditor';
  var heroSub = auditorCopy ? 'Your planning proposal has been sent to the manager for approval.' : 'The auditor has submitted a planning proposal for manager approval.';

  html.push('<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:11px;line-height:1.35;max-width:820px;background:#ffffff">');
  html.push('<div style="max-width:760px;border:1px solid #dbe4f0;border-radius:10px;background:#ffffff;padding:13px 17px;color:#0f172a">');

  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border-collapse:collapse"><tr>');
  html.push('<td valign="top">');
  html.push('<div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;font-weight:900;margin:0 0 4px 0">APPROVAL REQUIRED</div>');
  html.push('<div style="font-size:22px;line-height:1.08;font-weight:900;color:#0f172a;margin:0 0 6px 0">' + NB_html_(heroTitle) + '</div>');
  html.push('<div style="font-size:10.5px;color:#475569;margin:0">' + NB_html_(heroSub) + '</div>');
  html.push('</td>');
  html.push('<td align="right" valign="top" style="width:56px"><div style="width:43px;height:43px;border-radius:999px;border:2px solid #2563eb;color:#2563eb;text-align:center;line-height:43px;font-size:25px;font-weight:900">!</div></td>');
  html.push('</tr></table>');

  html.push('<div style="border:1px solid #dbe4f0;border-radius:10px;background:#ffffff;padding:12px 15px;margin:0 0 18px 0">');
  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>');

  html.push('<td valign="top" style="width:32%;padding-right:19px">');
  html.push(NB_managerApprovalLabelValue_('Company', n.company));
  html.push(NB_managerApprovalLabelValue_('MPS Number', mpsNumber || 'Not available', 'bigblue'));
  if (n.auditId) html.push(NB_managerApprovalLabelValue_('Audit ID', n.auditId, 'muted'));
  html.push('</td>');

  html.push('<td valign="top" style="width:28%;padding:0 19px;border-left:1px solid #dbe4f0">');
  html.push(NB_managerApprovalLabelValue_('Status', NB_statusBadgeHtml_(status), 'html'));
  if (n.plannedHours !== '' && n.plannedHours !== null && typeof n.plannedHours !== 'undefined') {
    html.push(NB_managerApprovalLabelValue_('Planned total hours', NB_formatHours_(n.plannedHours)));
  }
  html.push('</td>');

  html.push('<td valign="top" style="width:40%;padding-left:19px;border-left:1px solid #dbe4f0">');
  if (submittedBy) html.push(NB_managerApprovalLabelValue_('Submitted by', NB_managerApprovalMailtoMaybeHtml_(submittedBy), 'html'));
  if (n.auditorEmail) html.push(NB_managerApprovalLabelValue_('Auditor', NB_managerApprovalMailtoMaybeHtml_(n.auditorEmail), 'html'));
  if (submittedOn) html.push(NB_managerApprovalLabelValue_('Submitted on', submittedOn));
  html.push('</td>');

  html.push('</tr></table>');
  html.push('</div>');

  html.push('<div style="font-size:16px;font-weight:900;color:#0f172a;margin:0 0 10px 0">Audit overview</div>');
  html.push('<div style="border:1px solid #dbe4f0;border-radius:10px;background:#ffffff;padding:11px 13px;margin:0 0 18px 0">');
  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>');
  html.push('<td valign="top" style="width:31%;padding-right:19px"><div style="font-size:10.5px;color:#475569;font-weight:900;margin:0 0 10px 0">Scopes</div>' + NB_scopeBadgesHtml_(n.scopes || []) + '</td>');
  html.push('<td valign="top" style="width:25%;padding:0 19px;border-left:1px solid #dbe4f0"><div style="font-size:10.5px;color:#475569;font-weight:900;margin:0 0 10px 0">Country</div><div style="font-size:11px;color:#0f172a">' + NB_html_(n.country || '-') + '</div></td>');
  html.push('<td valign="top" style="padding-left:19px;border-left:1px solid #dbe4f0"><div style="font-size:10.5px;color:#475569;font-weight:900;margin:0 0 10px 0">Comments</div><div style="font-size:11px;color:#0f172a">' + NB_html_(n.companyComments || n.comment || '-') + '</div></td>');
  html.push('</tr></table>');
  html.push('</div>');

  html.push(NB_renderManagerApprovalValidationHtml_(n));

  html.push('<div style="font-size:16px;font-weight:900;color:#0f172a;margin:18px 0 8px 0">Proposed planning</div>');
  html.push(NB_renderManagerApprovalPlanningTableHtml_(n));

  html.push('<div style="border:1px solid #dbe4f0;border-radius:10px;background:#ffffff;padding:11px 13px;margin:18px 0 0 0">');
  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>');
  html.push('<td valign="top" style="width:60%;padding-right:21px">');
  html.push('<div style="font-size:16px;font-weight:900;color:#0f172a;margin:0 0 12px 0">What happens next</div>');
  html.push('<div style="font-size:10.5px;line-height:1.45;color:#334155">');
  if (auditorCopy) {
    html.push('<div><span style="display:inline-block;width:22px;color:#334155">✓</span>Your proposal has been submitted to the manager.</div>');
    html.push('<div><span style="display:inline-block;width:22px;color:#334155">📅</span>Use the calendar links in the table to add the proposed audit day(s).</div>');
    html.push('<div><span style="display:inline-block;width:22px;color:#334155">•</span>The planning is final only after manager approval.</div>');
  } else {
    html.push('<div><span style="display:inline-block;width:22px;color:#334155">▣</span>Review the proposed planning in the Manager interface.</div>');
    html.push('<div><span style="display:inline-block;width:22px;color:#334155">✓</span>Approve the planning if it is acceptable.</div>');
    html.push('<div><span style="display:inline-block;width:22px;color:#334155">↩</span>Deny it if it needs to return to planning.</div>');
  }
  html.push('</div>');
  html.push('</td>');
  html.push('<td valign="middle" style="border-left:1px solid #dbe4f0;padding-left:22px">');
  html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>');
  html.push('<td valign="middle" style="width:48px;padding-right:12px"><div style="width:42px;height:42px;border-radius:8px;background:#eaf2ff;text-align:center;line-height:42px;color:#2563eb;font-size:24px;font-weight:900">✓</div></td>');
  html.push('<td valign="middle" style="font-size:11px;line-height:1.45;color:#334155">' + (auditorCopy ? 'Calendar links are included per proposed day. Await manager approval before treating the planning as final.' : NB_managerApprovalCtaHtml_(n)) + '</td>');
  html.push('</tr></table>');
  html.push('</td>');
  html.push('</tr></table>');
  html.push('</div>');

  html.push('<div style="margin-top:14px;color:#64748b;font-size:11px;line-height:1.35">Automated message from the Audit Planning System. Please do not reply to this email.</div>');

  html.push('</div>');
  html.push('</div>');

  return html.join('');
}

/* ============================================================
 * Validation block
 * ============================================================ */

function NB_renderManagerApprovalValidationHtml_(n) {
  n = n || {};
  var checks = n.validation || n.checks || {};

  var rawCompanyItems = NB_managerApprovalValidationItems_(checks.companyConstraints || checks.company || []);
  var rawAuditItems = NB_managerApprovalValidationItems_(checks.auditConstraints || checks.audit || []);
  var constraintGroups = NB_managerApprovalConstraintGroups_(rawCompanyItems, rawAuditItems);
  var auditorItems = NB_managerApprovalValidationItems_(checks.auditorRotation || checks.auditor || checks.rotation || checks.qualification || checks.qualifications || checks.consecutive || []);

  if (!constraintGroups.hasAny && !auditorItems.length) return '';

  var html = [];
  html.push('<div style="font-size:16px;font-weight:900;color:#0f172a;margin:0 0 12px 0">Constraints & validation</div>');
  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px 0"><tr>');

  html.push('<td valign="top" style="width:50%;padding-right:10px">');
  html.push('<div style="border:1px solid #fbbf24;border-radius:10px;background:#fffbeb;padding:11px 13px;min-height:108px">');
  html.push('<div style="font-size:13px;font-weight:900;color:#0f172a;margin:0 0 8px 0">⚠&nbsp;&nbsp;Company constraints</div>');
  html.push(NB_managerApprovalValidationRowsHtml_(constraintGroups.company));
  html.push('<div style="font-size:13px;font-weight:900;color:#0f172a;margin:10px 0 8px 0">📅&nbsp;&nbsp;Audit constraints</div>');
  html.push(NB_managerApprovalValidationRowsHtml_(constraintGroups.audit));
  html.push('</div>');
  html.push('</td>');

  html.push('<td valign="top" style="width:50%;padding-left:10px">');
  html.push('<div style="border:1px solid #86efac;border-radius:10px;background:#f0fdf4;padding:11px 13px;min-height:108px">');
  html.push('<div style="font-size:13px;font-weight:900;color:#0f172a;margin:0 0 10px 0">🛡&nbsp;&nbsp;Auditor rotation & qualification</div>');
  html.push(NB_managerApprovalValidationRowsHtml_(auditorItems));
  html.push('</div>');
  html.push('</td>');

  html.push('</tr></table>');
  return html.join('');
}

function NB_managerApprovalConstraintGroups_(companyItems, auditItems) {
  companyItems = companyItems || [];
  auditItems = auditItems || [];

  var company = [];
  var audit = [];

  for (var i = 0; i < companyItems.length; i++) {
    var it = companyItems[i] || {};
    var text = NB_clean_(it.text);
    var key = text.toLowerCase();
    var out = { text: text, level: it.level || 'ok', checked: it.checked };

    if (key.indexOf('time window') >= 0 || key.indexOf('preferred time') >= 0 || key.indexOf('outside preferred time') >= 0) {
      out.text = key.indexOf('conflict') >= 0 || key.indexOf('outside') >= 0 ? 'Time window conflict' : text;
      company.push(out);
      continue;
    }

    if (key.indexOf('company availability') >= 0 || key.indexOf('blocked weekday') >= 0 || key.indexOf('company unavailable') >= 0 || key.indexOf('non-preferred day') >= 0) {
      out.text = (key.indexOf('conflict') >= 0 || key.indexOf('blocked') >= 0 || key.indexOf('unavailable') >= 0 || key.indexOf('non-preferred') >= 0)
        ? 'Company availability conflict'
        : text;
      company.push(out);
      continue;
    }

    company.push(out);
  }

  for (var j = 0; j < auditItems.length; j++) {
    var ai = auditItems[j] || {};
    var aText = NB_clean_(ai.text);
    var aKey = aText.toLowerCase();
    var aOut = { text: aText, level: ai.level || 'ok', checked: ai.checked };

    if (aKey.indexOf('planning window') >= 0 || aKey.indexOf('outside planning window') >= 0) {
      aOut.text = aKey.indexOf('conflict') >= 0 || aKey.indexOf('outside') >= 0 ? 'Planning window conflict' : aText;
    }

    audit.push(aOut);
  }

  return {
    company: company,
    audit: audit,
    hasAny: company.length > 0 || audit.length > 0
  };
}

function NB_managerApprovalValidationItems_(items) {
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];

  var out = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var text = '';
    var level = 'ok';
    var checked = true;
    var source = '';

    if (typeof item === 'string') {
      text = NB_clean_(item).replace(/^[✓⚠•✕]\s*/, '');
      var k = text.toLowerCase();

      if (item.indexOf('⚠') >= 0 || k.indexOf('not checked') >= 0 || k.indexOf('not configured') >= 0 || k.indexOf('unavailable') >= 0) {
        level = 'warning';
      }

      checked = !(k.indexOf('not checked') >= 0 || k.indexOf('not configured') >= 0 || k.indexOf('unavailable') >= 0);
    } else if (item && typeof item === 'object') {
      text = NB_clean_(item.label || item.message || item.text || item.name);
      level = NB_clean_(item.level || item.status || '').toLowerCase() || 'ok';
      checked = item.checked === false ? false : true;
      source = NB_clean_(item.source || '');
    }

    if (!text) continue;
    if (!checked && level === 'ok') level = 'info';

    out.push({
      text: text,
      level: level,
      checked: checked,
      source: source
    });
  }

  return out;
}

function NB_managerApprovalValidationRowsHtml_(items) {
  items = items || [];

  if (!items.length) {
    return '<div style="font-size:11px;line-height:1.6;color:#64748b">Not checked / not supplied</div>';
  }

  var html = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var level = String(it.level || '').toLowerCase();
    var textKey = String(it.text || '').toLowerCase();
    var checked = it.checked !== false;

    var icon = '✓';
    var color = '#15803d';

    if (!checked || level === 'info' || level === 'unknown' || textKey.indexOf('not checked') >= 0 || textKey.indexOf('not configured') >= 0 || textKey.indexOf('unavailable') >= 0) {
      icon = '•';
      color = '#64748b';
    } else if (level.indexOf('warn') >= 0 || level.indexOf('fail') >= 0 || level.indexOf('issue') >= 0 || textKey.indexOf('conflict') >= 0) {
      icon = '⚠';
      color = '#92400e';
    }

    html.push('<div style="font-size:11px;line-height:1.6;color:#0f172a"><span style="color:' + color + ';font-weight:900">' + icon + '</span>&nbsp;&nbsp;' + NB_html_(it.text) + '</div>');
  }

  return html.join('');
}

/* ============================================================
 * Proposed planning table
 * ============================================================ */

function NB_renderManagerApprovalPlanningTableHtml_(nOrBlocks) {
  var n = {};
  var blocks = [];

  if (Array.isArray(nOrBlocks)) {
    blocks = nOrBlocks;
  } else {
    n = nOrBlocks || {};
    blocks = n.blocks || [];
  }

  blocks = NB_managerApprovalEnrichedBlocks_(n, blocks);
  if (!blocks.length) return '';

  var html = [];
  var total = NB_sumBlockHours_(blocks);

  html.push('<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;width:100%;font-size:9px;border:1px solid #dbe4f0;margin:0 0 8px 0">');
  html.push('<tr style="background:#f8fbff;color:#0f172a">');
  html.push(NB_thSoft_('Date'));
  html.push(NB_thSoft_('Day'));
  html.push(NB_thSoft_('Time'));
  html.push(NB_thSoft_('Hours'));
  html.push(NB_thSoft_('Location'));
  html.push(NB_thSoft_('GPS'));
  html.push(NB_thSoft_('Comment'));
  html.push(NB_thSoft_('Add to calendar'));
  html.push('</tr>');

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    var dateText = NB_prettyDate_(b.date);

    if (blocks.length > 1) {
      dateText += '<br><span style="color:#64748b">Day ' + (i + 1) + '</span>';
    }

    html.push('<tr>');
    html.push(NB_tdSoftHtml_(dateText));
    html.push(NB_tdSoft_(NB_managerApprovalDayDisplay_(b, i)));
    html.push(NB_tdSoft_(NB_externalTimeRangePlain_(b.start, b.end)));
    html.push(NB_tdSoft_(b.hours !== '' && b.hours !== null ? NB_formatHours_(b.hours) : ''));
    html.push(NB_tdSoft_(b.execLoc || b.location || '-'));
    html.push(NB_tdSoftHtml_(b.gps ? '<a href="' + NB_htmlAttr_(NB_googleMapsUrl_(b.gps)) + '" target="_blank" style="color:#2563eb;text-decoration:underline">' + NB_html_(b.gps) + '</a>' : '-'));
    html.push(NB_tdSoft_(b.slotComment || '-'));
    html.push(NB_tdSoftHtml_(NB_managerApprovalCalendarLinksHtml_(n, b, i)));
    html.push('</tr>');
  }

  if (total !== '') {
    html.push('<tr style="background:#f8fbff;font-weight:900">');
    html.push('<td colspan="3" style="padding:6px 7px;border-top:1px solid #e2e8f0;color:#0f172a">Total planned hours</td>');
    html.push('<td colspan="5" style="padding:6px 7px;border-top:1px solid #e2e8f0;color:#0f172a">' + NB_html_(NB_formatHours_(total)) + '</td>');
    html.push('</tr>');
  }

  html.push('</table>');

  return html.join('');
}

function NB_managerApprovalDayDisplay_(b, index) {
  b = b || {};
  var d = NB_clean_(b.dayName || b.weekday || b.day || '');
  if (d) return d;

  var iso = NB_clean_(b.date);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';

  try {
    var dt = new Date(iso + 'T00:00:00Z');
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()] || '';
  } catch (e) {}

  return '';
}


function NB_managerApprovalIsAuditorCopy_(n) {
  n = n || {};
  var role = NB_clean_(n.recipientRole || n.recipientTarget || '').toLowerCase();
  var copy = NB_clean_(n.copyType || n.notificationCopy || '').toLowerCase();
  return role === 'auditor' || copy === 'auditor_self_copy' || copy === 'auditor copy';
}

function NB_managerApprovalSubject_(n) {
  n = n || {};
  if (NB_managerApprovalIsAuditorCopy_(n)) {
    var company = NB_clean_(n.company || '');
    var mps = NB_mpsNumber_(n);
    var parts = ['Your audit planning proposal was submitted'];
    if (mps) parts.push(mps);
    if (company) parts.push(company);
    return parts.join(' – ');
  }
  return n.subject || NB_subjectForEvent_(n.eventCode, n.company, n.auditId);
}

function NB_managerApprovalCalendarLinksHtml_(n, b, index) {
  var google = NB_managerApprovalGoogleCalendarUrl_(n, b);
  var apple = NB_managerApprovalAppleCalendarDataUrl_(n, b, index);
  return '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>' +
    '<td style="padding:0 7px 0 0">' + NB_googleCalendarIconLinkHtml_(google) + '</td>' +
    '<td style="padding:0">' + NB_appleCalendarIconLinkHtml_(apple) + '</td>' +
    '</tr></table>';
}

function NB_managerApprovalCalendarTitle_(n, block) {
  n = n || {};
  block = block || {};
  var mps = NB_mpsNumber_(n) || NB_clean_(block.mpsNumber || block.auditNumber || '');
  var company = NB_clean_(n.company || block.company || block.companyName || '');
  var scopes = NB_managerApprovalScopeTitle_(n);
  if (!scopes) scopes = NB_clean_(block.scopeText || block.scope || '');
  var parts = [];
  if (mps) parts.push(mps);
  if (company) parts.push(company);
  if (scopes) parts.push(scopes);
  return parts.length ? parts.join(' – ') : 'Audit planning';
}

function NB_managerApprovalCalendarDescriptionLines_(n, b) {
  n = n || {};
  b = b || {};
  var locationName = NB_managerApprovalLocationText_(b.execLoc || b.location || '');
  var gps = NB_clean_(b.gps || '');
  var mapsUrl = gps ? NB_googleMapsUrl_(gps) : '';
  var desc = [];

  if (n.auditId || b.auditId) desc.push('Audit ID: ' + NB_clean_(n.auditId || b.auditId));
  if (NB_mpsNumber_(n) || b.mpsNumber || b.auditNumber) desc.push('MPS: ' + NB_clean_(NB_mpsNumber_(n) || b.mpsNumber || b.auditNumber));
  if (n.company || b.company) desc.push('Company: ' + NB_clean_(n.company || b.company));
  if (NB_managerApprovalScopeTitle_(n)) desc.push('Scopes: ' + NB_managerApprovalScopeTitle_(n));
  if (locationName) desc.push('Location: ' + locationName);
  if (gps) desc.push('GPS: ' + gps);
  if (mapsUrl) desc.push('Google Maps: ' + mapsUrl);

  if (b.slotComment) {
    desc.push('');
    desc.push('Audit slot comment:');
    desc.push(NB_clean_(b.slotComment));
  }

  if (n.companyComments || b.companyComments) {
    desc.push('');
    desc.push('Company comments:');
    desc.push(NB_clean_(n.companyComments || b.companyComments));
  }

  desc.push('');
  desc.push('Contact details:');
  desc.push('Name: ' + NB_clean_(n.contactName || b.contactName || '-'));
  desc.push('Email: ' + NB_clean_(n.contactEmail || b.contactEmail || '-'));
  desc.push('Phone: ' + NB_clean_(n.contactPhone || n.contactTelephone || b.contactPhone || b.contactTelephone || '-'));

  return desc;
}

function NB_managerApprovalGoogleCalendarUrl_(n, b) {
  b = b || {};
  var date = NB_calendarYmd_(b.date);
  if (!date) return '';

  var start = NB_calendarTime_(b.start || '09:00');
  var end = NB_calendarTime_(b.end || b.start || '10:00');

  var startStamp = date + 'T' + start + '00';
  var endStamp = date + 'T' + end + '00';

  var title = NB_managerApprovalCalendarTitle_(n, b);
  var locationName = NB_managerApprovalLocationText_(b.execLoc || b.location || '');
  var gps = NB_clean_(b.gps || '');
  var location = gps || locationName;
  var details = NB_managerApprovalCalendarDescriptionLines_(n, b);

  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(title) +
    '&dates=' + encodeURIComponent(startStamp + '/' + endStamp) +
    '&details=' + encodeURIComponent(details.join('\n')) +
    '&location=' + encodeURIComponent(location);
}

function NB_managerApprovalAppleCalendarDataUrl_(n, b, index) {
  b = b || {};
  var date = NB_calendarYmd_(b.date);
  if (!date) return '';

  var start = NB_calendarTime_(b.start || '09:00');
  var end = NB_calendarTime_(b.end || b.start || '10:00');
  var auditId = NB_clean_(n.auditId || b.auditId || 'audit');
  var uid = 'audit-planning-' + auditId + '-' + date + '-' + String(index || 0) + '@audit-planning-system';

  var title = NB_managerApprovalCalendarTitle_(n, b);
  var locationName = NB_managerApprovalLocationText_(b.execLoc || b.location || '');
  var gps = NB_clean_(b.gps || '');
  var location = gps || locationName;
  var desc = NB_managerApprovalCalendarDescriptionLines_(n, b);

  var ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Audit Planning System//ManagerToAuditorPlanning//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + NB_icsEscape_(uid),
    'DTSTAMP:' + date + 'T000000',
    'DTSTART:' + date + 'T' + start + '00',
    'DTEND:' + date + 'T' + end + '00',
    'SUMMARY:' + NB_icsEscape_(title),
    'LOCATION:' + NB_icsEscape_(location),
    'DESCRIPTION:' + NB_icsEscape_(desc.join('\n')),
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + NB_icsEscape_('Audit reminder: ' + title),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return 'data:text/calendar;charset=utf8,' + encodeURIComponent(ics);
}

/* ============================================================
 * CTA helpers
 * ============================================================ */

function NB_managerApprovalCtaHtml_(n) {
  var url = NB_managerUrlForApprovalOperational_(n || {});
  if (!url) url = '#';

  return '<a href="' + NB_htmlAttr_(url) + '" target="_blank" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:8px 12px;border-radius:7px;font-size:11px;font-weight:900;line-height:1.1">Review in Manager</a>';
}

function NB_managerUrlForApprovalOperational_(n) {
  n = n || {};

  var cta = n.cta || {};
  var url = NB_clean_(cta.managerUrl || cta.approvalUrl || cta.portalUrl || n.managerUrl || n.approvalUrl || '');

  if (url) return url;

  try {
    url = NB_clean_(
      NB_getRuleValue_('MANAGER_URL', '') ||
      NB_getRuleValue_('MANAGER_PORTAL_URL', '') ||
      NB_getRuleValue_('APP_MANAGER_URL', '') ||
      NB_getRuleValue_('PORTAL_MANAGER_URL', '')
    );

    if (url) return url;
  } catch (e) {}

  return '';
}

/* ============================================================
 * Local display helpers
 * ============================================================ */

function NB_managerApprovalLabelValue_(label, value, mode) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') return '';

  var v = mode === 'html' ? String(value) : NB_html_(value);
  var valueStyle = 'font-size:10.5px;font-weight:800;color:#0f172a;margin-top:3px;margin-bottom:10px';

  if (mode === 'bigblue') {
    valueStyle = 'font-size:16px;font-weight:900;color:#2563eb;margin-top:3px;margin-bottom:10px;letter-spacing:.01em';
  }

  if (mode === 'muted') {
    valueStyle = 'font-size:9px;font-weight:700;color:#64748b;margin-top:3px;margin-bottom:10px';
  }

  return '<div style="font-size:9px;color:#64748b;font-weight:900;margin-bottom:2px">' + NB_html_(label) + '</div>' +
    '<div style="' + valueStyle + '">' + v + '</div>';
}

function NB_managerApprovalMailtoMaybeHtml_(value) {
  value = NB_clean_(value);
  if (!value) return '';

  if (value.indexOf('@') >= 0) {
    return '<a href="mailto:' + NB_htmlAttr_(value) + '" style="color:#2563eb;text-decoration:underline;font-weight:800">' + NB_html_(value) + '</a>';
  }

  return NB_html_(value);
}

/* ============================================================
 * Optional smoke
 * ============================================================ */

function RUN_NF_MANAGER_APPROVAL_OPERATIONAL_SMOKE() {
  var sample = {
    eventCode: 'AUDIT_PLANNED_BY_AUDITOR',
    rendererProfile: 'MANAGER_APPROVAL_OPERATIONAL',
    subject: '[DEV] Audit planned by auditor - approval required',
    company: 'Test Company BV',
    mpsNumber: '123456',
    auditId: 'AUD-2026-001',
    displayStatus: 'Pending Approval',
    actor: 'auditor@example.com',
    actorRole: 'Auditor',
    auditorEmail: 'auditor@example.com',
    plannedHours: 6.5,
    country: 'Spain',
    region: 'Murcia',
    scopes: ['MPS-GAP', 'GRASP'],
    companyComments: 'Company prefers morning audits.',
    blocks: [
      {
        date: '2026-05-22',
        start: '09:00',
        end: '15:30',
        hours: 6.5,
        execLoc: 'Main site',
        slotComment: 'Self-planned by auditor.'
      }
    ],
    checks: {
      companyConstraints: [
        { text: 'Company availability checked', level: 'ok' },
        { text: 'Preferred time window checked', level: 'ok' }
      ],
      auditConstraints: [
        { text: 'Planning window checked', level: 'ok' }
      ],
      auditorRotation: [
        { text: 'Auditor qualified', level: 'ok' },
        { text: 'Rotation checked', level: 'ok' }
      ]
    }
  };

  var rendered = NB_renderManagerApprovalOperational_(sample);

  var out = {
    ok: true,
    build: '2026-05-13_RENDERER_MANAGER_APPROVAL_OPERATIONAL_SPLIT_d02_TRIGGER_CONTRACT_ALIGNED',
    subject: rendered.subject,
    bodyLength: rendered.body.length,
    htmlLength: rendered.htmlBody.length,
    containsValidation: rendered.htmlBody.indexOf('Constraints & validation') >= 0,
    containsPlanning: rendered.htmlBody.indexOf('Proposed planning') >= 0,
    containsCalendar: rendered.htmlBody.indexOf('Google Calendar') >= 0 || rendered.htmlBody.indexOf('Apple Calendar') >= 0
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function NB_managerApprovalScopeTitle_(n) {
  n = n || {};
  var scopes = [];
  try {
    if (n.scopes && n.scopes.length) scopes = NB_scopeDisplayList_(n.scopes);
  } catch (e) {
    if (n.scopes && n.scopes.length) scopes = n.scopes.slice();
  }
  return scopes.join(' / ');
}

function NB_managerApprovalLocationText_(value) {
  var v = NB_clean_(value);
  if (!v) return '';
  if (/^hq$/i.test(v)) return 'First point to meet';
  return v;
}

function NB_managerApprovalEnrichedBlocks_(n, blocks) {
  n = n || {};
  blocks = blocks || n.blocks || [];
  var out = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    var c = {};
    for (var k in b) {
      if (Object.prototype.hasOwnProperty.call(b, k)) c[k] = b[k];
    }

    c.company = NB_clean_(c.company || c.companyName || n.company || '');
    c.companyName = c.company;
    c.auditId = NB_clean_(c.auditId || n.auditId || '');
    c.mpsNumber = NB_clean_(c.mpsNumber || c.auditNumber || NB_mpsNumber_(n));
    c.auditNumber = c.mpsNumber;
    c.scopes = (c.scopes && c.scopes.length) ? c.scopes : ((n.scopes && n.scopes.length) ? n.scopes.slice() : []);
    c.scopeText = NB_managerApprovalScopeTitle_(n);
    c.execLoc = NB_managerApprovalLocationText_(c.execLoc || c.executionLocation || c.location || c.locationName || '');
    c.location = c.execLoc;
    c.companyComments = NB_clean_(c.companyComments || n.companyComments || '');
    c.locationComments = NB_clean_(c.locationComments || n.locationComments || '');
    c.contactName = NB_clean_(c.contactName || n.contactName || '');
    c.contactEmail = NB_clean_(c.contactEmail || n.contactEmail || '');
    c.contactPhone = NB_clean_(c.contactPhone || c.contactTelephone || n.contactPhone || n.contactTelephone || '');
    c.comment = NB_clean_(c.comment || n.comment || '');
    c.planningComment = NB_clean_(c.planningComment || c.slotComment || n.planningComment || '');
    c.country = NB_clean_(c.country || n.country || '');
    c.region = NB_clean_(c.region || n.region || '');
    out.push(c);
  }
  return out;
}