/***********************************************************************
 * FILE: NotificationRenderer_ManagerToAuditorPlanning.gs
 * BUILD: 2026-05-23_RENDERER_MANAGER_TO_AUDITOR_PLANNING_CONSTRAINTS_R2
 *
 * PURPOSE
 * - Renders manager-planned audit mails to auditors. Detailed operational planning package with GPS, planning days, calendar links, scopes and acceptance CTA.
 * - Shared badge/table/date helpers live in NotificationRenderer_SharedHtmlHelpers.gs.
 * - No queue writes.
 * - No status decisions.
 * - No delivery logic.
 ***********************************************************************/

/* ============================================================
 * Renderer: manager to auditor planning
 * ============================================================ */

function NB_renderRichOperational_(n) {
  var subject = NB_managerToAuditorMailSubject_(n);
  var lines = [];
  lines.push('Event: ' + n.eventCode);
  if (n.company) lines.push('Company: ' + n.company);
  if (NB_mpsNumber_(n)) lines.push('MPS Number: ' + NB_mpsNumber_(n));
  if (n.auditId) lines.push('Audit ID: ' + n.auditId);
  if (n.displayStatus) lines.push('Status result: ' + n.displayStatus);
  if (n.auditorEmail) lines.push('Auditor: ' + n.auditorEmail);
  if (n.scopes && n.scopes.length) lines.push('Scopes: ' + n.scopes.join(', '));
  if (n.country) lines.push('Country: ' + n.country);
  if (n.region) lines.push('Region: ' + n.region);
  if (n.plannedHours !== '' && n.plannedHours !== null) lines.push('Total planned hours: ' + n.plannedHours);

  var managerToAuditorBlocks = NB_managerToAuditorEnrichedBlocks_(n);

  if (managerToAuditorBlocks && managerToAuditorBlocks.length) {
    lines.push('');
    lines.push('Planning days:');
    for (var i = 0; i < managerToAuditorBlocks.length; i++) {
      var b = managerToAuditorBlocks[i];
      lines.push('- ' + NB_blockLineText_(b));
    }
  }

  if (n.locations && n.locations.length) {
    lines.push('');
    lines.push('Locations / GPS:');
    for (var j = 0; j < n.locations.length; j++) {
      var l = n.locations[j];
      lines.push('- ' + (l.code ? l.code + ': ' : '') + (l.name || 'Location') + (l.gps ? ' | GPS: ' + l.gps : '') + (l.comment ? ' | ' + l.comment : ''));
    }
  }

  if (n.companyComments) {
    lines.push('');
    lines.push('Comments:');
    lines.push(n.companyComments);
  }

  if (n.nextSteps && n.nextSteps.length) {
    lines.push('');
    lines.push('What happens next:');
    for (var k = 0; k < n.nextSteps.length; k++) lines.push(n.nextSteps[k]);
  }

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_renderRichOperationalHtml_(n)
  };
}

function NB_renderRichOperationalHtml_(n) {
  n = n || {};
  var html = [];
  var mpsNumber = NB_mpsNumber_(n);
  var plannedBy = NB_clean_(n.actor || n.actorEmail || '');
  var plannedOn = NB_clean_(n.plannedOn || n.timestamp || '');
  var status = NB_clean_(n.displayStatus || 'Pending acceptance');
  var contactName = NB_clean_(n.contactName || '');
  var contactPhone = NB_clean_(n.contactPhone || n.contactTelephone || '');
  var contactEmail = NB_clean_(n.contactEmail || '');
  var comment = NB_clean_(n.comment || '');
  var companyComment = NB_clean_(n.companyComments || '');

  html.push('<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:12px;line-height:1.35;max-width:820px">');
  html.push('<div style="border:1px solid #d8e1ef;border-radius:12px;background:#ffffff;padding:14px 18px">');

  html.push('<div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.06em;font-weight:800">Audit planning package</div>');
  html.push('<div style="font-size:20px;font-weight:800;margin:4px 0 6px;color:#0f172a">Audit planned for you</div>');
  html.push('<div style="font-size:11px;color:#475569;margin:0 0 12px">The following audit has been planned by your manager.</div>');

  html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:12px 0">');
  html.push('<tr>');
  html.push('<td valign="top" style="width:34%;padding-right:16px">');
  html.push(NB_managerToAuditorLabelValue_('Company', n.company));
  html.push(NB_managerToAuditorLabelValue_('MPS Number', mpsNumber || 'Not available', 'bigblue'));
  if (n.auditId) html.push(NB_managerToAuditorLabelValue_('Audit ID', n.auditId, 'muted'));
  html.push('</td>');

  html.push('<td valign="top" style="width:28%;padding:0 16px;border-left:1px solid #dbe4f0">');
  html.push(NB_managerToAuditorLabelValue_('Status', NB_statusBadgeHtml_(status), 'html'));
  if (n.plannedHours !== '' && n.plannedHours !== null && typeof n.plannedHours !== 'undefined') {
    html.push(NB_managerToAuditorLabelValue_('Planned total hours', NB_formatHours_(n.plannedHours)));
  }
  if (n.country) html.push(NB_managerToAuditorLabelValue_('Country', n.country));
  if (n.region) html.push(NB_managerToAuditorLabelValue_('Region', n.region));
  html.push('</td>');

  html.push('<td valign="top" style="padding-left:16px;border-left:1px solid #dbe4f0">');
  if (plannedBy) html.push(NB_managerToAuditorLabelValue_('Planned by', NB_managerToAuditorMailtoMaybeHtml_(plannedBy), 'html'));
  if (n.auditorEmail) html.push(NB_managerToAuditorLabelValue_('Auditor', NB_managerToAuditorMailtoMaybeHtml_(n.auditorEmail), 'html'));
  if (plannedOn) html.push(NB_managerToAuditorLabelValue_('Planned on', plannedOn));
  html.push('</td>');
  html.push('</tr>');
  html.push('</table>');

  html.push('<div style="font-size:15px;font-weight:800;color:#0f172a;margin:14px 0 8px">Audit overview</div>');
  html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:0 0 12px">');
  html.push('<tr>');
  html.push('<td valign="top" style="width:34%;padding-right:16px"><div style="font-size:10px;color:#667085;font-weight:800;margin-bottom:6px">Scopes</div>' + NB_scopeBadgesHtml_(n.scopes || []) + '</td>');
  html.push('<td valign="top" style="padding-left:16px;border-left:1px solid #dbe4f0"><div style="font-size:10px;color:#667085;font-weight:800;margin-bottom:6px">Comments</div>');
  html.push('<div style="font-size:11px;color:#0f172a;white-space:pre-wrap">' + NB_html_(comment || companyComment || '-') + '</div>');
  html.push('</td>');
  html.push('</tr>');
  html.push('</table>');

  if (contactName || contactPhone || contactEmail || comment || companyComment || mpsNumber) {
    html.push('<div style="font-size:15px;font-weight:800;color:#0f172a;margin:14px 0 8px">Contact details</div>');
    html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:0 0 12px">');
    html.push(NB_managerToAuditorSimpleRowHtml_('MPS Number', mpsNumber || '-'));
    html.push(NB_managerToAuditorSimpleRowHtml_('Contact name', contactName || '-'));
    html.push(NB_managerToAuditorSimpleRowHtml_('Contact telephone', contactPhone || '-'));
    html.push(NB_managerToAuditorSimpleRowHtml_('Contact e-mail', contactEmail || '-'));
    html.push('</table>');
  }

  html.push(NB_renderManagerToAuditorValidationHtml_(n));

  html.push('<div style="font-size:15px;font-weight:800;color:#0f172a;margin:14px 0 8px">Planned days</div>');
  html.push(NB_managerToAuditorPlanningTableHtml_(n));

  if (n.locations && n.locations.length > 1) html.push(NB_renderLocationsTableHtml_(n.locations));

  html.push('<div style="font-size:15px;font-weight:800;color:#0f172a;margin:14px 0 8px">What happens next</div>');
  html.push('<div style="font-size:11px;line-height:1.45;color:#334155;margin-bottom:10px">');
  html.push('<div>Review the planning details in the Auditor Portal.</div>');
  html.push('<div>' + NB_managerToAuditorPortalTextLinkHtml_(n, 'Go to portal to accept or deny the audit.') + '</div>');
  html.push('<div>The audit will be confirmed once you accept the planning.</div>');
  html.push('</div>');
  html.push(NB_managerToAuditorAcceptInPortalCtaHtml_(n));

  html.push('<div style="margin-top:14px;color:#64748b;font-size:10.5px;line-height:1.35;border-top:1px solid #e6edf7;padding-top:9px">Automated message from the Audit Planning System. Please do not reply to this email.</div>');
  html.push('</div>');
  html.push('</div>');
  return html.join('');
}

function NB_managerToAuditorSimpleRowHtml_(label, value) {
  value = NB_clean_(value);
  var shown = NB_html_(value || '-');
  if (label.toLowerCase().indexOf('mail') >= 0 && value.indexOf('@') >= 0) {
    shown = '<a href="mailto:' + NB_htmlAttr_(value) + '" style="color:#2563eb;text-decoration:underline">' + NB_html_(value) + '</a>';
  }
  return '<tr><td style="width:155px;color:#667085;padding:3px 10px 3px 0;vertical-align:top;font-size:11px">' + NB_html_(label) + '</td><td style="padding:3px 0;vertical-align:top;font-size:11px;font-weight:700;color:#0f172a">' + shown + '</td></tr>';
}

function NB_miniLabelValue_(label, value, mode) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') return '';
  var st = 'font-size:12px;font-weight:800;color:#0f172a;margin:2px 0 7px 0';
  if (mode === 'mps') st = 'font-size:16px;font-weight:900;color:#2563eb;margin:2px 0 7px 0;letter-spacing:.01em';
  if (mode === 'muted') st = 'font-size:10.5px;font-weight:700;color:#64748b;margin:2px 0 7px 0';
  return '<div style="font-size:10px;color:#64748b;font-weight:900;margin:0 0 1px 0">' + NB_html_(label) + '</div><div style="' + st + '">' + NB_html_(value) + '</div>';
}

function NB_miniLabelValueHtml_(label, htmlValue) {
  if (!htmlValue) return '';
  return '<div style="font-size:10px;color:#64748b;font-weight:900;margin:0 0 1px 0">' + NB_html_(label) + '</div><div style="font-size:12px;font-weight:800;color:#0f172a;margin:2px 0 7px 0">' + htmlValue + '</div>';
}

function NB_managerToAuditorLabelValue_(label, value, mode) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') return '';
  var v = mode === 'html' ? String(value) : NB_html_(value);
  var valueStyle = 'font-size:10.5px;font-weight:800;color:#0f172a;margin-top:3px;margin-bottom:10px';
  if (mode === 'bigblue') valueStyle = 'font-size:16px;font-weight:900;color:#2563eb;margin-top:3px;margin-bottom:10px;letter-spacing:.01em';
  if (mode === 'muted') valueStyle = 'font-size:9px;font-weight:700;color:#64748b;margin-top:3px;margin-bottom:10px';
  return '<div style="font-size:9px;color:#64748b;font-weight:900;margin-bottom:2px">' + NB_html_(label) + '</div>' +
    '<div style="' + valueStyle + '">' + v + '</div>';
}

function NB_managerToAuditorMailtoMaybeHtml_(value) {
  value = NB_clean_(value);
  if (!value) return '';
  if (value.indexOf('@') >= 0) {
    return '<a href="mailto:' + NB_htmlAttr_(value) + '" style="color:#2563eb;text-decoration:underline;font-weight:800">' + NB_html_(value) + '</a>';
  }
  return NB_html_(value);
}

function NB_renderManagerToAuditorValidationHtml_(n) {
  n = n || {};
  var checks = n.validation || n.checks || {};

  var companyRows = NB_managerToAuditorOperationalConstraintRows_(n, checks);
  var rawAuditItems = NB_managerToAuditorValidationItems_(checks.auditConstraints || checks.audit || []);
  var constraintGroups = NB_operationalConstraintGroups_([], rawAuditItems);
  var auditorItems = NB_managerToAuditorValidationItems_(checks.auditorRotation || checks.auditor || checks.rotation || checks.qualification || checks.qualifications || checks.consecutive || []);

  if (!companyRows.length && !constraintGroups.audit.length && !auditorItems.length) return '';

  var html = [];
  html.push('<div style="font-size:14px;font-weight:900;color:#0f172a;margin:0 0 8px 0">Constraints & validation</div>');
  html.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 14px 0"><tr>');

  html.push('<td valign="top" style="width:50%;padding-right:7px">');
  html.push('<div style="border:1px solid #fbbf24;border-radius:9px;background:#fffbeb;padding:8px 10px;min-height:86px">');
  html.push('<div style="font-size:11.5px;font-weight:900;color:#0f172a;margin:0 0 6px 0">Soft company constraints</div>');
  html.push(NB_managerToAuditorConstraintRowsHtml_(companyRows));
  if (constraintGroups.audit.length) {
    html.push('<div style="font-size:11.5px;font-weight:900;color:#0f172a;margin:8px 0 5px 0">Audit constraints</div>');
    html.push(NB_managerToAuditorValidationRowsHtml_(constraintGroups.audit));
  }
  html.push('<div style="font-size:10px;color:#92400e;margin-top:6px;line-height:1.35">Soft constraints are preferences only and do not block planning.</div>');
  html.push('</div>');
  html.push('</td>');

  html.push('<td valign="top" style="width:50%;padding-left:7px">');
  html.push('<div style="border:1px solid #86efac;border-radius:9px;background:#f0fdf4;padding:8px 10px;min-height:86px">');
  html.push('<div style="font-size:11.5px;font-weight:900;color:#0f172a;margin:0 0 6px 0">Auditor rotation & qualification</div>');
  html.push(NB_managerToAuditorValidationRowsHtml_(auditorItems));
  html.push('</div>');
  html.push('</td>');

  html.push('</tr></table>');
  return html.join('');
}

function NB_operationalConstraintGroups_(companyItems, auditItems) {
  companyItems = companyItems || [];
  auditItems = auditItems || [];
  var company = [];
  var audit = [];

  for (var i = 0; i < companyItems.length; i++) {
    var it = companyItems[i] || {};
    var text = NB_clean_(it.text);
    var key = text.toLowerCase();
    var out = { text: text, level: it.level || 'ok' };

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
    var aOut = { text: aText, level: ai.level || 'ok' };
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


function NB_managerToAuditorOperationalConstraintRows_(n, checks) {
  n = n || {};
  checks = checks || {};
  var rows = [];

  function firstClean_() {
    for (var i = 0; i < arguments.length; i++) {
      var v = NB_clean_(arguments[i]);
      if (v && v !== '-') return v;
    }
    return '';
  }

  function push_(label, value) {
    value = NB_clean_(value);
    if (!value) value = '-';
    rows.push({ label: label, value: value });
  }

  var company = n.companyConstraints || n.companyConstraintMeta || n.companyMeta || {};
  var validation = n.validation || n.checks || {};
  var companyValidation = validation.companyConstraintMeta || validation.companyConstraintsMeta || {};

  var blocked = firstClean_(
    n.companyBlockedWeekdays,
    n.blockedWeekdays,
    n.companyLessAvailableOn,
    n.companyUnavailableWeekdays,
    company.blockedWeekdays,
    company.avoidDays,
    company.companyBlockedWeekdays,
    companyValidation.blockedWeekdays,
    companyValidation.avoidDays
  );

  var windowValue = firstClean_(
    n.companyTimeWindow,
    n.timeWindow,
    n.companyPreferredTimeWindow,
    n.companyPrefersAuditsBetween,
    company.timeWindow,
    company.companyTimeWindow,
    companyValidation.timeWindow
  );

  var from = firstClean_(n.companyTimeFrom, n.timeFrom, company.timeFrom, companyValidation.timeFrom);
  var to = firstClean_(n.companyTimeTo, n.timeTo, company.timeTo, companyValidation.timeTo);
  if (!windowValue && (from || to)) windowValue = (from || '-') + ' – ' + (to || '-');

  var preferredMonths = firstClean_(
    n.preferredAuditMonths,
    n.preferredAuditPeriod,
    n.preferred_audit_months,
    n.preferred_audit_period,
    company.preferredAuditMonths,
    company.preferredAuditPeriod,
    companyValidation.preferredAuditMonths,
    companyValidation.preferredAuditPeriod
  );

  var auditorUnavailable = firstClean_(
    n.auditorBlockedWeekdays,
    n.auditorUnavailableWeekdays,
    n.auditorLessAvailableOn,
    n.auditorDefaultBlockedWeekdays,
    company.auditorBlockedWeekdays,
    companyValidation.auditorBlockedWeekdays
  );

  push_('Company is less available on', blocked);
  push_('Company prefers audits between', windowValue);
  if (preferredMonths) push_('Preferred audit period', preferredMonths);
  push_('Auditor is less available on', auditorUnavailable);

  return rows;
}

function NB_managerToAuditorConstraintRowsHtml_(rows) {
  rows = rows || [];
  if (!rows.length) return '<div style="font-size:10.5px;line-height:1.55;color:#64748b">Not supplied</div>';

  var html = [];
  html.push('<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse">');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    html.push('<tr>');
    html.push('<td style="font-size:10.5px;line-height:1.45;color:#475569;padding:2px 7px 2px 0;vertical-align:top;width:58%">' + NB_html_(r.label || '') + '</td>');
    html.push('<td style="font-size:10.5px;line-height:1.45;color:#0f172a;font-weight:800;padding:2px 0;vertical-align:top;text-align:right">' + NB_html_(r.value || '-') + '</td>');
    html.push('</tr>');
  }
  html.push('</table>');
  return html.join('');
}


function NB_managerToAuditorValidationItems_(items) {
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
      if (item.indexOf('⚠') >= 0 || k.indexOf('not checked') >= 0 || k.indexOf('not configured') >= 0 || k.indexOf('unavailable') >= 0) level = 'warning';
      checked = !(k.indexOf('not checked') >= 0 || k.indexOf('not configured') >= 0 || k.indexOf('unavailable') >= 0);
    } else if (item && typeof item === 'object') {
      text = NB_clean_(item.label || item.message || item.text || item.name);
      level = NB_clean_(item.level || item.status || '').toLowerCase() || 'ok';
      checked = item.checked === false ? false : true;
      source = NB_clean_(item.source || '');
    }
    if (!text) continue;
    if (!checked && level === 'ok') level = 'info';
    out.push({ text:text, level:level, checked:checked, source:source });
  }
  return out;
}

function NB_managerToAuditorValidationRowsHtml_(items) {
  items = items || [];
  if (!items.length) return '<div style="font-size:11px;line-height:1.6;color:#64748b">Not checked / not supplied</div>';
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

function NB_managerToAuditorAcceptInPortalCtaHtml_(n) {
  var url = NB_portalUrlForOperational_(n || {});
  if (!url) return '<span style="font-size:11px;color:#991b1b;font-weight:800">Portal URL unavailable</span>';
  return '<a href="' + NB_htmlAttr_(url) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:8px 12px;border-radius:7px;font-size:11px;font-weight:900;line-height:1.1">Go to portal</a>';
}

function NB_managerToAuditorPortalTextLinkHtml_(n, label) {
  var text = NB_html_(label || 'Go to portal to accept or deny the audit.');
  var url = NB_portalUrlForOperational_(n || {});
  if (!url) return text;
  return '<a href="' + NB_htmlAttr_(url) + '" target="_blank" style="color:#334155;text-decoration:none">' + text + '</a>';
}

function NB_portalUrlForOperational_(n) {
  n = n || {};
  var cta = n.cta || {};
  var url = NB_clean_(cta.acceptUrl || cta.portalUrl || cta.auditorPortalUrl || cta.portal || cta.accept || n.acceptUrl || n.portalUrl || n.auditorPortalUrl || '');
  if (url) return url;
  try {
    url = NB_clean_(NB_getRuleValue_('AUDITOR_PORTAL_URL', '') || NB_getRuleValue_('PORTAL_URL', '') || NB_getRuleValue_('AUDIT_PORTAL_URL', '') || NB_getRuleValue_('APP_AUDITOR_PORTAL_URL', ''));
    if (url) return url;
  } catch (e) {}
  return '';
}



/* ============================================================
 * Manager -> Auditor calendar / CTA helpers
 * Owner: this renderer only.
 * No queue writes, no status decisions, no delivery logic.
 * ============================================================ */

function NB_managerToAuditorMailSubject_(n) {
  n = n || {};
  var mps = NB_mpsNumber_(n);
  var company = NB_clean_(n.company || '');
  var scopes = NB_managerToAuditorScopeTitle_(n);
  var parts = ['Audit planned'];
  if (mps) parts.push(mps);
  if (company) parts.push(company);
  if (scopes) parts.push(scopes);
  return parts.join(' – ');
}

function NB_managerToAuditorScopeTitle_(n) {
  n = n || {};
  var scopes = [];
  try {
    if (n.scopes && n.scopes.length) scopes = NB_scopeDisplayList_(n.scopes);
  } catch (e) {
    if (n.scopes && n.scopes.length) scopes = n.scopes.slice();
  }
  return scopes.join(' / ');
}

function NB_managerToAuditorCalendarTitle_(n, block) {
  n = n || {};
  block = block || {};
  var mps = NB_mpsNumber_(n) || NB_clean_(block.mpsNumber || block.auditNumber || '');
  var company = NB_clean_(n.company || block.company || block.companyName || '');
  var scopes = NB_managerToAuditorScopeTitle_(n);
  if (!scopes) scopes = NB_clean_(block.scopeText || block.scope || '');
  var parts = [];
  if (mps) parts.push(mps);
  if (company) parts.push(company);
  if (scopes) parts.push(scopes);
  return parts.length ? parts.join(' – ') : 'Audit planning';
}

function NB_managerToAuditorLocationText_(value) {
  var v = NB_clean_(value);
  if (!v) return '';
  if (/^hq$/i.test(v)) return 'First point to meet';
  return v;
}

function NB_managerToAuditorEnrichedBlocks_(n) {
  n = n || {};
  var blocks = n.blocks || [];
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
    c.scopeText = NB_managerToAuditorScopeTitle_(n);
    c.execLoc = NB_managerToAuditorLocationText_(c.execLoc || c.executionLocation || c.location || c.locationName || '');
    c.location = c.execLoc;
    c.companyComments = NB_clean_(c.companyComments || n.companyComments || '');
    c.locationComments = NB_clean_(c.locationComments || n.locationComments || '');
    c.contactName = NB_clean_(c.contactName || n.contactName || '');
    c.contactEmail = NB_clean_(c.contactEmail || n.contactEmail || '');
    c.contactPhone = NB_clean_(c.contactPhone || n.contactPhone || '');
    c.country = NB_clean_(c.country || n.country || '');
    c.region = NB_clean_(c.region || n.region || '');
    out.push(c);
  }
  return out;
}

function NB_managerToAuditorPlanningTableHtml_(n) {
  n = n || {};
  var blocks = NB_managerToAuditorEnrichedBlocks_(n);
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
    if (blocks.length > 1) dateText += '<br><span style="color:#64748b">Day ' + (i + 1) + '</span>';

    html.push('<tr>');
    html.push(NB_tdSoftHtml_(dateText));
    html.push(NB_tdSoft_(NB_dayDisplay_(b, i)));
    html.push(NB_tdSoft_(NB_externalTimeRangePlain_(b.start, b.end)));
    html.push(NB_tdSoft_(b.hours !== '' && b.hours !== null ? NB_formatHours_(b.hours) : ''));
    html.push(NB_tdSoft_(b.execLoc || '-'));
    html.push(NB_tdSoftHtml_(b.gps ? '<a href="' + NB_htmlAttr_(NB_googleMapsUrl_(b.gps)) + '" target="_blank" style="color:#2563eb;text-decoration:underline">' + NB_html_(b.gps) + '</a>' : '-'));
    html.push(NB_tdSoft_(b.slotComment || '-'));
    html.push(NB_tdSoftHtml_(NB_managerToAuditorCalendarLinksHtml_(n, b, i)));
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

function NB_managerToAuditorCalendarLinksHtml_(n, b, index) {
  var google = NB_managerToAuditorGoogleCalendarUrl_(n, b);
  var apple = NB_managerToAuditorAppleCalendarDataUrl_(n, b, index);
  return '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>' +
    '<td style="padding:0 7px 0 0">' + NB_googleCalendarIconLinkHtml_(google) + '</td>' +
    '<td style="padding:0">' + NB_appleCalendarIconLinkHtml_(apple) + '</td>' +
    '</tr></table>';
}

function NB_managerToAuditorCalendarDescriptionLines_(n, b) {
  n = n || {};
  b = b || {};
  var locationName = NB_managerToAuditorLocationText_(b.execLoc || b.location || '');
  var gps = NB_clean_(b.gps || '');
  var mapsUrl = gps ? NB_googleMapsUrl_(gps) : '';
  var desc = [];

  if (n.auditId || b.auditId) desc.push('Audit ID: ' + NB_clean_(n.auditId || b.auditId));
  if (NB_mpsNumber_(n) || b.mpsNumber || b.auditNumber) desc.push('MPS: ' + NB_clean_(NB_mpsNumber_(n) || b.mpsNumber || b.auditNumber));
  if (n.company || b.company) desc.push('Company: ' + NB_clean_(n.company || b.company));
  if (NB_managerToAuditorScopeTitle_(n)) desc.push('Scopes: ' + NB_managerToAuditorScopeTitle_(n));
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

  if (n.contactName || n.contactEmail || n.contactPhone || b.contactName || b.contactEmail || b.contactPhone) {
    desc.push('');
    desc.push('Contact details:');
    if (n.contactName || b.contactName) desc.push('Name: ' + NB_clean_(n.contactName || b.contactName));
    if (n.contactEmail || b.contactEmail) desc.push('Email: ' + NB_clean_(n.contactEmail || b.contactEmail));
    if (n.contactPhone || b.contactPhone) desc.push('Phone: ' + NB_clean_(n.contactPhone || b.contactPhone));
  }

  return desc;
}

function NB_managerToAuditorGoogleCalendarUrl_(n, b) {
  b = b || {};
  var date = NB_calendarYmd_(b.date);
  if (!date) return '';

  var start = NB_calendarTime_(b.start || '09:00');
  var end = NB_calendarTime_(b.end || b.start || '10:00');

  var startStamp = date + 'T' + start + '00';
  var endStamp = date + 'T' + end + '00';

  var title = NB_managerToAuditorCalendarTitle_(n, b);
  var locationName = NB_managerToAuditorLocationText_(b.execLoc || b.location || '');
  var gps = NB_clean_(b.gps || '');
  var location = gps || locationName;
  var details = NB_managerToAuditorCalendarDescriptionLines_(n, b);

  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(title) +
    '&dates=' + encodeURIComponent(startStamp + '/' + endStamp) +
    '&details=' + encodeURIComponent(details.join('\n')) +
    '&location=' + encodeURIComponent(location);
}

function NB_managerToAuditorAppleCalendarDataUrl_(n, b, index) {
  b = b || {};
  var date = NB_calendarYmd_(b.date);
  if (!date) return '';

  var start = NB_calendarTime_(b.start || '09:00');
  var end = NB_calendarTime_(b.end || b.start || '10:00');
  var auditId = NB_clean_(n.auditId || b.auditId || 'audit');
  var uid = 'audit-planning-' + auditId + '-' + date + '-' + String(index || 0) + '@audit-planning-system';

  var title = NB_managerToAuditorCalendarTitle_(n, b);
  var locationName = NB_managerToAuditorLocationText_(b.execLoc || b.location || '');
  var gps = NB_clean_(b.gps || '');
  var location = gps || locationName;
  var desc = NB_managerToAuditorCalendarDescriptionLines_(n, b);

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
 * Scope badge colors: Config_Scopes owner
 * ============================================================ */

/* ============================================================
 * APPROVAL_OPERATIONAL moved to NotificationRenderer_ApprovalOperational.gs
 * Operational digest routing moved with approval renderer.
 * This file owns RICH_OPERATIONAL only.
 * ============================================================ */
