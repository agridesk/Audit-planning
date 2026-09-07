/***********************************************************************
 * FILE: NotificationRenderer_PlanningToClientDigest.gs
 * BUILD: 2026-05-21_RENDERER_PLANNING_TO_CLIENT_DIGEST_GROUP_SORT_COMPACT_R4
 *
 * PURPOSE
 * - Single renderer owner for EXTERNAL_OPERATIONAL planning-to-client digest mails.
 * - Dutch, compact, forwarding-friendly operational digest for planning@agriqa.es and client forwarding.
 * - Grouped per auditor.
 * - Uses shared scope badges from NotificationRenderer_SharedHtmlHelpers.gs; Config_Scopes remains canonical.
 * - No lifecycle/status decisions.
 * - No queue writes.
 ***********************************************************************/

/* ============================================================
 * Renderer: planning to client digest
 * ============================================================ */

function NB_renderExternalOperationalSingle_(n) {
  var subject = n.subject || NB_externalOperationalSubject_();
  var lines = [];
  lines.push('Overzicht auditopdracht Ecert');
  if (n.company) lines.push('Bedrijf: ' + n.company);
  if (NB_mpsNumber_(n)) lines.push('MPS No.: ' + NB_mpsNumber_(n));
  if (n.auditId) lines.push('Audit ID: ' + n.auditId);
  if (n.auditorEmail || n.auditorName) lines.push('Auditor: ' + NB_externalAuditorText_(n));
  if (n.scopes && n.scopes.length) lines.push('Scopes: ' + NB_scopeDisplayList_(n.scopes).join(', '));
  if (n.blocks && n.blocks.length) {
    lines.push('Geplande auditplanning:');
    for (var i = 0; i < n.blocks.length; i++) lines.push('- ' + NB_externalScheduleBlockText_(n.blocks[i]));
  }
  if (n.plannedHours !== '' && n.plannedHours !== null) lines.push('Totaal uren: ' + NB_formatHours_(n.plannedHours));
  if (NB_externalReasonText_(n)) lines.push('Reden: ' + NB_externalReasonText_(n));

  return {
    subject: subject,
    body: lines.join('\n'),
    htmlBody: NB_renderExternalOperationalDigest_('', [n]).htmlBody
  };
}

function NB_renderExternalOperationalDigest_(recipientEmail, normalizedItems) {
  normalizedItems = normalizedItems || [];
  var validation = NB_externalValidateDigestItems_(normalizedItems);
  var validItems = validation.validItems;
  if (!validItems.length) {
    throw new Error('PlanningToClientDigest has no valid rows. Missing required fields: auditor, MPS number, scopes, planning dates and planned hours. Invalid rows: ' + JSON.stringify(validation.invalid));
  }

  var subject = NB_externalOperationalSubject_();
  var tableHtml = NB_renderExternalOperationalTableHtml_(validItems);
  var tableText = NB_renderExternalOperationalTableText_(validItems);

  var body = 'Hallo,\n\n' +
    'Hierbij een overzicht van de audits die zijn ingepland of geannuleerd, gegroepeerd per auditor.\n' +
    'Zouden jullie deze in Ecert willen verwerken en formeel aan de betreffende bedrijven willen bevestigen?\n\n' +
    tableText +
    '\n\nBedankt,\n\nRené Rombouts';

  var html = [];
  html.push(NB_externalShellStart_());
  html.push('<div style="font-size:13px;line-height:1.45;color:#111827;margin:0 0 14px 0">Hallo,<br><br>');
  html.push('Hierbij een overzicht van de audits die zijn ingepland of geannuleerd, gegroepeerd per auditor.<br>');
  html.push('Zouden jullie deze in Ecert willen verwerken en formeel aan de betreffende bedrijven willen bevestigen?</div>');
  html.push('<div style="border-top:1px solid #111827;margin:12px 0 14px 0"></div>');
  html.push(tableHtml);
  if (validation.invalid.length) html.push(NB_externalSkippedRowsHtml_(validation.invalid));
  html.push('<div style="border-top:1px solid #111827;margin:18px 0 14px 0"></div>');
  html.push('<div style="font-size:13px;line-height:1.5;color:#111827">Bedankt,<br><br>René Rombouts</div>');
  html.push(NB_externalShellEnd_());

  return {
    subject: subject,
    body: body,
    htmlBody: html.join('')
  };
}

function NB_externalOperationalSubject_() {
  var now = new Date();
  var tz = NB_getTz_(SpreadsheetApp.getActiveSpreadsheet());
  var stamp = Utilities.formatDate(now, tz, 'dd-MM-yyyy HH:mm');
  return 'Overzicht auditopdrachten Ecert — ' + stamp;
}

function NB_renderExternalOperationalTableHtml_(normalizedItems) {
  normalizedItems = NB_externalSortItems_(normalizedItems || []);
  if (!normalizedItems.length) {
    return '<div style="border:1px solid #d1d5db;padding:8px 9px;color:#4b5563;border-radius:6px;font-size:12px">Geen auditopdrachten.</div>';
  }

  var grouped = NB_groupByAuditor_(normalizedItems);
  var html = [];

  for (var g = 0; g < grouped.length; g++) {
    var group = grouped[g];
    group.items = NB_externalSortItems_(group.items || []);

    html.push('<div style="font-size:13px;font-weight:700;color:#111827;margin:12px 0 5px 0">Auditor: ' + NB_html_(group.auditor || 'Onbekende auditor') + '</div>');

    html.push('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:11px;line-height:1.25;table-layout:auto;margin:0 0 9px 0;color:#111827">');
    html.push('<thead><tr>');
    html.push(NB_externalTh_('Status', 'width:92px'));
    html.push(NB_externalTh_('MPS No.', 'width:82px'));
    html.push(NB_externalTh_('Bedrijf', 'width:175px'));
    html.push(NB_externalTh_('Scopes', 'width:138px'));
    html.push(NB_externalTh_('Geplande auditplanning', ''));
    html.push(NB_externalTh_('Uren', 'width:64px'));
    html.push(NB_externalTh_('Reden', 'width:125px'));
    html.push('</tr></thead><tbody>');

    var totalHours = 0;
    for (var j = 0; j < group.items.length; j++) {
      var it = group.items[j] || {};
      var h = Number(it.plannedHours || 0);
      if (isFinite(h)) totalHours += h;

      html.push('<tr>');
      html.push(NB_externalTd_(NB_externalStatusText_(it), 'text-align:center;white-space:nowrap'));
      html.push(NB_externalTd_(NB_mpsNumber_(it), 'text-align:center;white-space:nowrap'));
      html.push(NB_externalTd_(it.company, ''));
      html.push(NB_externalTdHtml_(NB_scopeBadgesHtml_(it.scopes || []), ''));
      html.push(NB_externalTdHtml_(NB_externalScheduleTableHtml_(it), ''));
      html.push(NB_externalTd_(NB_externalFormatHoursNl_(it.plannedHours), 'text-align:center;white-space:nowrap'));
      html.push(NB_externalTd_(NB_externalReasonText_(it) || '-', ''));
      html.push('</tr>');
    }

    html.push('<tr>');
    html.push('<td colspan="5" style="border:1px solid #111827;padding:5px 7px;text-align:right;font-weight:700">Totaal uren auditor</td>');
    html.push('<td style="border:1px solid #111827;padding:5px 7px;text-align:center;font-weight:700;white-space:nowrap">' + NB_html_(NB_externalFormatHoursNl_(totalHours)) + '</td>');
    html.push('<td style="border:1px solid #111827;padding:5px 7px">&nbsp;</td>');
    html.push('</tr>');

    html.push('</tbody></table>');
  }

  return html.join('');
}


function NB_renderExternalOperationalTableText_(normalizedItems) {
  normalizedItems = NB_externalSortItems_(normalizedItems || []);
  if (!normalizedItems.length) return 'Geen auditopdrachten.';

  var grouped = NB_groupByAuditor_(normalizedItems);
  var lines = [];

  for (var g = 0; g < grouped.length; g++) {
    var group = grouped[g];
    group.items = NB_externalSortItems_(group.items || []);
    var totalHours = 0;
    lines.push('Auditor: ' + (group.auditor || 'Onbekende auditor'));
    for (var i = 0; i < group.items.length; i++) {
      var n = group.items[i] || {};
      var h = Number(n.plannedHours || 0);
      if (isFinite(h)) totalHours += h;
      lines.push('- ' + [
        NB_externalStatusText_(n),
        NB_mpsNumber_(n),
        n.company,
        NB_scopeDisplayList_(n.scopes || []).join(', '),
        NB_externalScheduleText_(n),
        NB_externalFormatHoursNl_(n.plannedHours),
        NB_externalReasonText_(n) || '-'
      ].filter(Boolean).join(' | '));
    }
    lines.push('Totaal uren auditor: ' + NB_externalFormatHoursNl_(totalHours));
    lines.push('');
  }

  return lines.join('\n');
}


function NB_groupByAuditor_(items) {
  items = NB_externalSortItems_(items || []);

  var map = {};
  var order = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var email = NB_clean_(it.auditorEmail || '').toLowerCase();
    var key = email || ('unknown-' + i);

    if (!map[key]) {
      map[key] = {
        auditor: NB_externalAuditorText_(it) || email || 'Onbekende auditor',
        auditorKey: key,
        firstDateSortKey: NB_externalFirstDateSortKey_(it),
        items: []
      };
      order.push(key);
    }

    map[key].items.push(it);

    var sortKey = NB_externalFirstDateSortKey_(it);
    if (sortKey < map[key].firstDateSortKey) {
      map[key].firstDateSortKey = sortKey;
    }

    if (email && map[key].auditor === email) {
      map[key].auditor = NB_externalAuditorText_(it) || email;
    }
  }

  order.sort(function(a, b) {
    var da = map[a].firstDateSortKey;
    var db = map[b].firstDateSortKey;
    if (da !== db) return da - db;
    return String(map[a].auditor || '').localeCompare(String(map[b].auditor || ''));
  });

  return order.map(function(k) {
    map[k].items = NB_externalSortItems_(map[k].items || []);
    return map[k];
  });
}


function NB_externalAuditorText_(n) {
  n = n || {};
  var email = NB_clean_(n.auditorEmail || '');
  var name = NB_clean_(n.auditorName || '');

  if (email && name && name.toLowerCase() !== email.toLowerCase()) {
    return email + ' (' + name + ')';
  }

  return email || name || '';
}

function NB_externalSortItems_(items) {
  items = (items || []).slice();
  items.sort(function(a, b) {
    var da = NB_externalFirstDateSortKey_(a);
    var db = NB_externalFirstDateSortKey_(b);
    if (da !== db) return da - db;

    var ca = NB_clean_(a && a.company).toLowerCase();
    var cb = NB_clean_(b && b.company).toLowerCase();
    return ca.localeCompare(cb);
  });
  return items;
}

function NB_externalFirstDateSortKey_(n) {
  var rows = NB_externalScheduleRows_(n || []);
  if (!rows.length) return 99999999;

  var best = 99999999;
  for (var i = 0; i < rows.length; i++) {
    var key = NB_externalDateSortKey_(rows[i].date);
    if (key < best) best = key;
  }
  return best;
}

function NB_externalDateSortKey_(value) {
  value = NB_clean_(value);

  var iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Number(iso[1] + iso[2] + iso[3]);

  var nl = value.match(/(?:Zo|Ma|Di|Wo|Do|Vr|Za)?\s*(\d{2})-(\d{2})-(\d{4})/i);
  if (nl) return Number(nl[3] + nl[2] + nl[1]);

  return 99999999;
}



function NB_externalStatusText_(n) {
  var code = NB_clean_(n && (n.eventCode || n.eventType || n.type)).toUpperCase();
  if (code.indexOf('CANCELLED') >= 0 || code.indexOf('CANCEL') >= 0) return 'Geannuleerd';
  if (code.indexOf('DENIED') >= 0 || code.indexOf('DENY') >= 0) return 'Geweigerd';
  if (code.indexOf('REJECTED') >= 0 || code.indexOf('REJECT') >= 0) return 'Afgewezen';
  return 'Ingepland';
}

function NB_externalScheduleTableHtml_(n) {
  var rows = NB_externalScheduleRows_(n);
  if (!rows.length) return '';
  var html = [];
  html.push('<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:11px;line-height:1.25">');
  html.push('<tbody>');
  for (var i = 0; i < rows.length; i++) {
    html.push('<tr>');
    html.push('<td style="padding:1px 10px 1px 0;color:#111827;white-space:nowrap;border:0">' + NB_html_(rows[i].date) + '</td>');
    html.push('<td style="padding:1px 0;color:#111827;white-space:nowrap;border:0">' + NB_html_(rows[i].time) + '</td>');
    html.push('</tr>');
  }
  html.push('</tbody></table>');
  return html.join('');
}

function NB_externalScheduleText_(n) {
  return NB_externalScheduleRows_(n).map(function(r) {
    return [r.date, r.time].filter(Boolean).join(' ');
  }).join('; ');
}

function NB_externalScheduleBlockText_(b) {
  b = b || {};
  return [NB_externalFormatDateNl_(b.date), NB_externalTimeRangeNl_(b.start, b.end)].filter(Boolean).join(' ');
}

function NB_externalScheduleRows_(n) {
  n = n || {};
  var blocks = n.blocks || [];
  var out = [];
  if (blocks.length) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i] || {};
      var date = NB_externalFormatDateNl_(b.date);
      var time = NB_externalTimeRangeNl_(b.start, b.end);
      if (date || time) out.push({ date:date, time:time });
    }
    return out;
  }

  var dates = n.plannedDates || [];
  for (var j = 0; j < dates.length; j++) {
    var raw = NB_clean_(dates[j]);
    if (!raw) continue;
    var parsed = NB_externalParsePlannedDateLine_(raw);
    out.push(parsed);
  }
  return out;
}

function NB_externalParsePlannedDateLine_(raw) {
  raw = NB_clean_(raw);
  var m = raw.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
  if (m) return { date:NB_externalFormatDateNl_(m[1]), time:NB_clean_(m[2]) };
  return { date:raw, time:'' };
}

function NB_externalTimeRangeNl_(start, end) {
  start = NB_clean_(start);
  end = NB_clean_(end);
  if (start && end) return start + ' – ' + end;
  return start || end || '';
}

function NB_externalReasonText_(n) {
  n = n || {};
  var code = NB_clean_(n.eventCode || n.eventType || n.type).toUpperCase();
  if (code.indexOf('CANCELLED') >= 0 || code.indexOf('CANCEL') >= 0 || code.indexOf('DENIED') >= 0 || code.indexOf('DENY') >= 0 || code.indexOf('REJECTED') >= 0 || code.indexOf('REJECT') >= 0) {
    return NB_clean_(n.comment || n.reason || 'Geen reden opgegeven');
  }
  return '';
}

/* ============================================================
 * Input validation / row skipping
 * ============================================================ */

function NB_externalValidateDigestItems_(items) {
  var out = { validItems:[], invalid:[] };
  for (var i = 0; i < (items || []).length; i++) {
    var n = items[i] || {};
    var missing = NB_externalMissingRequiredFields_(n);
    if (missing.length) {
      out.invalid.push({
        index: i,
        auditId: NB_clean_(n.auditId),
        company: NB_clean_(n.company),
        missing: missing
      });
    } else {
      out.validItems.push(n);
    }
  }
  return out;
}

function NB_externalMissingRequiredFields_(n) {
  n = n || {};
  var missing = [];
  if (!NB_clean_(n.company)) missing.push('company');
  if (!NB_clean_(NB_mpsNumber_(n))) missing.push('mpsNumber');
  if (!NB_clean_(n.auditorEmail || n.auditorName)) missing.push('auditor');
  if (!n.scopes || !n.scopes.length) missing.push('scopes');
  if (!NB_externalScheduleRows_(n).length) missing.push('planning');
  if (n.plannedHours === '' || n.plannedHours === null || typeof n.plannedHours === 'undefined') missing.push('plannedHours');
  return missing;
}

function NB_externalSkippedRowsHtml_(invalidRows) {
  invalidRows = invalidRows || [];
  if (!invalidRows.length) return '';
  var html = [];
  html.push('<div style="margin:12px 0 0 0;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.35">');
  html.push('<div style="font-weight:800;margin-bottom:4px">Let op: enkele auditregels zijn overgeslagen wegens ontbrekende verplichte gegevens.</div>');
  for (var i = 0; i < invalidRows.length; i++) {
    var r = invalidRows[i] || {};
    html.push('<div>Row ' + NB_html_(String(Number(r.index || 0) + 1)) + ': ' + NB_html_(r.company || r.auditId || 'onbekend') + ' — ontbreekt: ' + NB_html_((r.missing || []).join(', ')) + '</div>');
  }
  html.push('</div>');
  return html.join('');
}


/* ============================================================
 * Formatting / HTML helpers
 * ============================================================ */

function NB_externalFormatHoursNl_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  var n = Number(value);
  if (!isNaN(n)) return n.toFixed(2).replace('.', ',');
  var s = NB_clean_(value).replace(/h$/i, '');
  var n2 = Number(s.replace(',', '.'));
  if (!isNaN(n2)) return n2.toFixed(2).replace('.', ',');
  return NB_clean_(value);
}

function NB_externalFormatDateNl_(iso) {
  iso = NB_clean_(iso);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  var d = new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00Z');
  var days = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  return days[d.getUTCDay()] + ' ' + m[3] + '-' + m[2] + '-' + m[1];
}

function NB_externalShellStart_() {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:13px;line-height:1.4;max-width:1180px">';
}


function NB_externalShellEnd_() {
  return '</div>';
}

function NB_externalTh_(label, extraStyle) {
  return '<th align="center" style="border:1px solid #111827;padding:5px 7px;font-weight:700;background:#ffffff;color:#111827;' + (extraStyle || '') + '">' + NB_html_(label) + '</th>';
}


function NB_externalTd_(value, extraStyle) {
  return '<td style="border:1px solid #111827;padding:5px 7px;vertical-align:middle;color:#111827;' + (extraStyle || '') + '">' + NB_html_(value) + '</td>';
}


function NB_externalTdHtml_(html, extraStyle) {
  return '<td style="border:1px solid #111827;padding:5px 7px;vertical-align:middle;color:#111827;' + (extraStyle || '') + '">' + (html || '') + '</td>';
}

