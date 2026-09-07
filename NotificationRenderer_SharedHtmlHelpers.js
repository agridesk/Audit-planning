/***********************************************************************
 * FILE: NotificationRenderer_SharedHtmlHelpers.gs
 * BUILD: 2026-05-15_RENDERER_SHARED_HTML_HELPERS_SCOPE_LABELS_R3
 *
 * PURPOSE
 * - Shared HTML helpers for notification renderers only.
 * - Config_Scopes is the canonical source for scope label/color rendering.
 * - No queue writes.
 * - No delivery logic.
 * - No status decisions.
 * - No renderer dispatch.
 ***********************************************************************/

/* ============================================================
 * Shared base HTML helpers
 * ============================================================ */

function NB_mpsNumber_(n) {
  n = n || {};
  return NB_clean_(n.mpsNumber || n.auditNumber || n.number || '');
}

function NB_htmlShellStart_() {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:14px;line-height:1.45;max-width:1040px">';
}

function NB_htmlShellEnd_() {
  return '</div>';
}

function NB_statusBadgeHtml_(status) {
  status = NB_clean_(status);
  if (!status) return '';
  return '<span style="display:inline-block;border-radius:999px;background:#e0f2fe;color:#075985;font-weight:800;font-size:11px;padding:4px 8px;margin:0">' + NB_html_(status) + '</span>';
}

function NB_statusBadgeForLifecycleHtml_(label) {
  label = NB_clean_(label);
  var key = label.toLowerCase();
  var bg = '#e0f2fe', color = '#075985';
  if (key.indexOf('accepted') >= 0) { bg = '#dcfce7'; color = '#166534'; }
  else if (key.indexOf('completed') >= 0) { bg = '#dbeafe'; color = '#1d4ed8'; }
  else if (key.indexOf('cancel') >= 0) { bg = '#fee2e2'; color = '#991b1b'; }
  else if (key.indexOf('den') >= 0) { bg = '#ffedd5'; color = '#9a3412'; }
  else if (key.indexOf('reject') >= 0) { bg = '#fecaca'; color = '#7f1d1d'; }
  else if (key.indexOf('extension') >= 0) { bg = '#f3e8ff'; color = '#6b21a8'; }
  return '<span style="display:inline-block;border-radius:999px;background:' + bg + ';color:' + color + ';font-weight:700;font-size:12px;padding:4px 8px;white-space:nowrap">' + NB_html_(label) + '</span>';
}

function NB_sectionHtml_(title, innerHtml) {
  if (!innerHtml) return '';
  return '<div style="margin-top:16px"><div style="font-weight:700;margin-bottom:6px">' + NB_html_(title) + '</div>' + innerHtml + '</div>';
}

function NB_nextStepsHtml_(steps) {
  steps = steps || [];
  if (!steps.length) return '';
  var html = [];
  html.push('<div style="margin-top:16px"><div style="font-weight:700;margin-bottom:6px">Next steps</div><ul style="margin:6px 0 0 20px;padding:0">');
  for (var i = 0; i < steps.length; i++) html.push('<li>' + NB_html_(steps[i]) + '</li>');
  html.push('</ul></div>');
  return html.join('');
}

function NB_htmlRowHtml_(label, htmlValue) {
  if (!htmlValue) return '';
  return '<tr><td style="width:155px;color:#667085;padding:4px 10px 4px 0;vertical-align:top">' + NB_html_(label) + '</td><td style="padding:4px 0;vertical-align:top;font-weight:600">' + htmlValue + '</td></tr>';
}

function NB_htmlRow_(label, value) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') return '';
  return '<tr><td style="width:155px;color:#667085;padding:4px 10px 4px 0;vertical-align:top">' + NB_html_(label) + '</td><td style="padding:4px 0;vertical-align:top;font-weight:600">' + NB_html_(value) + '</td></tr>';
}

function NB_th_(label) {
  return '<th align="left" style="padding:7px;border:1px solid #d8e1ef;font-weight:700">' + NB_html_(label) + '</th>';
}

function NB_td_(value) {
  return '<td style="padding:7px;border:1px solid #d8e1ef;vertical-align:top">' + NB_html_(value) + '</td>';
}

function NB_tdHtml_(html) {
  return '<td style="padding:7px;border:1px solid #d8e1ef;vertical-align:top">' + (html || '') + '</td>';
}

function NB_thSoft_(label) {
  return '<th align="left" style="padding:7px 8px;border-bottom:1px solid #dbe4f0;border-right:1px solid #e2e8f0;font-weight:900;background:#f8fbff;color:#0f172a">' + NB_html_(label) + '</th>';
}

function NB_tdSoft_(value) {
  return '<td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;vertical-align:middle;color:#0f172a">' + NB_html_(value) + '</td>';
}

function NB_tdSoftHtml_(html) {
  return '<td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;border-right:1px solid #e2e8f0;vertical-align:middle;color:#0f172a">' + (html || '') + '</td>';
}

function NB_prettyDate_(iso) {
  iso = NB_clean_(iso);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NB_html_(iso);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return String(Number(m[3])) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
}

function NB_formatExternalDate_(iso) {
  iso = NB_clean_(iso);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return m[3] + '-' + m[2] + '-' + m[1];
}

function NB_externalTimeRange_(start, end) {
  start = NB_clean_(start);
  end = NB_clean_(end);
  if (start && end) return '(' + start + ' - ' + end + ')';
  if (start) return '(' + start + ')';
  if (end) return '(until ' + end + ')';
  return '';
}

function NB_externalTimeRangePlain_(start, end) {
  start = NB_clean_(start);
  end = NB_clean_(end);
  if (start && end) return start + ' - ' + end;
  if (start) return start;
  if (end) return 'until ' + end;
  return '';
}

function NB_renderLocationsTableHtml_(locations) {
  locations = locations || [];
  if (!locations.length) return '';
  var html = [];
  html.push('<div style="font-weight:700;margin:16px 0 6px">Location summary</div>');
  html.push('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px">');
  html.push('<thead><tr style="background:#f1f5f9">');
  html.push(NB_th_('Code'));
  html.push(NB_th_('Location'));
  html.push(NB_th_('GPS'));
  html.push(NB_th_('Comment'));
  html.push('</tr></thead><tbody>');
  for (var i = 0; i < locations.length; i++) {
    var l = locations[i] || {};
    var gpsHtml = l.gps ? '<a href="' + NB_htmlAttr_(NB_googleMapsUrl_(l.gps)) + '">' + NB_html_(l.gps) + '</a>' : '';
    html.push('<tr>');
    html.push(NB_td_(l.code));
    html.push(NB_td_(l.name));
    html.push(NB_tdHtml_(gpsHtml));
    html.push(NB_td_(l.comment));
    html.push('</tr>');
  }
  html.push('</tbody></table>');
  return html.join('');
}

/* ============================================================
 * Shared planning table / calendar helpers
 * ============================================================ */


function NB_renderPlanningTableHtml_(blocks, includeGps, context) {
  blocks = blocks || [];
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
    html.push(NB_tdSoftHtml_(NB_calendarLinksHtml_(NB_enrichCalendarBlock_(b, context), i)));
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


function NB_dayDisplay_(b, index) {
  b = b || {};
  var d = NB_clean_(b.dayName || b.weekday || b.day || '');
  if (d) return d;
  var iso = NB_clean_(b.date);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  try {
    var dt = new Date(iso + 'T00:00:00Z');
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()] || '';
  } catch (e) {}
  return '';
}


function NB_calendarLinksHtml_(b, index) {
  b = b || {};
  var google = NB_clean_(b.googleCalendarLink || b.googleCalendarUrl || b.calendarLink || b.calendarUrl || '');
  var apple = NB_clean_(b.appleCalendarLink || b.appleCalendarUrl || b.icsUrl || b.icsLink || '');
  if (!google) google = NB_buildGoogleCalendarUrlFromBlock_(b);
  if (!apple) apple = NB_buildAppleCalendarDataUrlFromBlock_(b, index) || google;
  return '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>' +
    '<td style="padding:0 7px 0 0">' + NB_googleCalendarIconLinkHtml_(google) + '</td>' +
    '<td style="padding:0">' + NB_appleCalendarIconLinkHtml_(apple) + '</td>' +
    '</tr></table>';
}


function NB_googleCalendarIconLinkHtml_(url) {
  var href = NB_clean_(url) || '#';
  return '<a href="' + NB_htmlAttr_(href) + '" target="_blank" title="Google Calendar" style="display:inline-block;width:22px;height:22px;text-decoration:none;vertical-align:middle">' +
    '<img src="https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png" width="22" height="22" alt="Google Calendar" style="display:block;width:22px;height:22px;border:0;outline:none;text-decoration:none">' +
    '</a>';
}


function NB_appleCalendarIconLinkHtml_(url) {
  var href = NB_clean_(url) || '#';
  return '<a href="' + NB_htmlAttr_(href) + '" target="_blank" title="Apple Calendar" style="display:inline-block;width:22px;height:22px;text-decoration:none;vertical-align:middle">' +
    '<img src="https://img.icons8.com/color/48/calendar--v1.png" width="22" height="22" alt="Apple Calendar" style="display:block;width:22px;height:22px;border:0;outline:none;text-decoration:none;border-radius:6px">' +
    '</a>';
}



function NB_enrichCalendarBlock_(block, context) {
  block = block || {};
  context = context || {};

  var out = {};
  var k;
  for (k in block) {
    if (Object.prototype.hasOwnProperty.call(block, k)) out[k] = block[k];
  }

  out.company = NB_clean_(out.company || out.companyName || context.company || '');
  out.mpsNumber = NB_clean_(out.mpsNumber || out.auditNumber || context.mpsNumber || context.auditNumber || '');
  out.auditId = NB_clean_(out.auditId || context.auditId || '');
  out.scopes = Array.isArray(out.scopes) && out.scopes.length ? out.scopes : (Array.isArray(context.scopes) ? context.scopes.slice() : []);
  out.scopeText = NB_clean_(out.scopeText || out.scope || (out.scopes && out.scopes.length ? out.scopes.join(' / ') : ''));

  out.contactName = NB_clean_(out.contactName || out.contact || context.contactName || '');
  out.contactEmail = NB_clean_(out.contactEmail || context.contactEmail || '');
  out.contactPhone = NB_clean_(out.contactPhone || context.contactPhone || '');

  out.companyComments = NB_clean_(out.companyComments || out.companyComment || context.companyComments || '');
  out.locationComments = NB_clean_(out.locationComments || context.locationComments || '');
  out.country = NB_clean_(out.country || context.country || '');
  out.region = NB_clean_(out.region || context.region || '');

  return out;
}


function NB_calendarLocationText_(b) {
  b = b || {};
  var raw = NB_clean_(b.execLoc || b.location || b.locationName || '');
  if (!raw) return '';
  if (/^hq$/i.test(raw)) return 'First point to meet';
  return raw;
}


function NB_calendarTitleFromBlock_(b) {
  b = b || {};

  var mps = NB_clean_(b.mpsNumber || b.auditNumber || '');
  var company = NB_clean_(b.company || b.companyName || '');
  var scopes = Array.isArray(b.scopes) && b.scopes.length
    ? b.scopes.join(' / ')
    : NB_clean_(b.scopeText || b.scope || '');

  var parts = [];
  if (mps) parts.push(mps);
  if (company) parts.push(company);
  if (scopes) parts.push(scopes);

  return parts.length ? parts.join(' – ') : 'Audit planning';
}


function NB_calendarDescriptionLines_(b) {
  b = b || {};

  var locationName = NB_calendarLocationText_(b);
  var gps = NB_clean_(b.gps || '');
  var mapsUrl = gps ? NB_googleMapsUrl_(gps) : '';

  var desc = [];
  if (b.auditId) desc.push('Audit ID: ' + NB_clean_(b.auditId));
  if (locationName) desc.push('Location: ' + locationName);
  if (gps) desc.push('GPS: ' + gps);
  if (mapsUrl) desc.push('Google Maps: ' + mapsUrl);

  if (b.slotComment) {
    desc.push('');
    desc.push('Audit slot comment:');
    desc.push(NB_clean_(b.slotComment));
  }

  if (b.locationComments) {
    desc.push('');
    desc.push('Location comments:');
    desc.push(NB_clean_(b.locationComments));
  }

  if (b.companyComments) {
    desc.push('');
    desc.push('Company comments:');
    desc.push(NB_clean_(b.companyComments));
  }

  if (b.contactName || b.contactEmail || b.contactPhone) {
    desc.push('');
    desc.push('Contact details:');
    if (b.contactName) desc.push('Name: ' + NB_clean_(b.contactName));
    if (b.contactEmail) desc.push('Email: ' + NB_clean_(b.contactEmail));
    if (b.contactPhone) desc.push('Phone: ' + NB_clean_(b.contactPhone));
  }

  return desc;
}


function NB_buildGoogleCalendarUrlFromBlock_(b) {
  b = b || {};

  var date = NB_calendarYmd_(b.date);
  if (!date) return '';

  var start = NB_calendarTime_(b.start || '09:00');
  var end = NB_calendarTime_(b.end || b.start || '10:00');

  var startStamp = date + 'T' + start + '00';
  var endStamp = date + 'T' + end + '00';

  var title = NB_calendarTitleFromBlock_(b);
  var locationName = NB_calendarLocationText_(b);
  var gps = NB_clean_(b.gps || '');
  var location = locationName + (gps ? ' | GPS: ' + gps : '');
  var details = NB_calendarDescriptionLines_(b);

  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(title) +
    '&dates=' + encodeURIComponent(startStamp + '/' + endStamp) +
    '&details=' + encodeURIComponent(details.join('\\n')) +
    '&location=' + encodeURIComponent(location);
}


function NB_buildAppleCalendarDataUrlFromBlock_(b, index) {
  b = b || {};

  var date = NB_calendarYmd_(b.date);
  if (!date) return '';

  var start = NB_calendarTime_(b.start || '09:00');
  var end = NB_calendarTime_(b.end || b.start || '10:00');

  var auditId = NB_clean_(b.auditId || 'audit');
  var uid = 'audit-planning-' + auditId + '-' + date + '-' + String(index || 0) + '@audit-planning-system';

  var title = NB_calendarTitleFromBlock_(b);
  var locationName = NB_calendarLocationText_(b);
  var gps = NB_clean_(b.gps || '');
  var location = locationName + (gps ? ' | GPS: ' + gps : '');
  var desc = NB_calendarDescriptionLines_(b);

  var ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Audit Planning System//Operational Renderer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + NB_icsEscape_(uid),
    'DTSTAMP:' + date + 'T000000',
    'DTSTART:' + date + 'T' + start + '00',
    'DTEND:' + date + 'T' + end + '00',
    'SUMMARY:' + NB_icsEscape_(title),
    'LOCATION:' + NB_icsEscape_(location),
    'DESCRIPTION:' + NB_icsEscape_(desc.join('\\n')),
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


function NB_calendarYmd_(v) {
  v = NB_clean_(v);
  var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + m[2] + m[3];
  var m2 = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m2) return m2[3] + ('0' + m2[2]).slice(-2) + ('0' + m2[1]).slice(-2);
  return '';
}


function NB_calendarTime_(v) {
  v = NB_clean_(v);
  var m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '0900';
  return ('0' + m[1]).slice(-2) + m[2];
}


function NB_icsEscape_(v) {
  return NB_clean_(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}


function NB_portalOnlyCtaHtml_(n) {
  return NB_acceptInPortalCtaHtml_(n);
}

/* ============================================================
 * Scope badge colors: Config_Scopes owner
 * ============================================================ */


function NB_scopeBadgesHtml_(scopes) {
  scopes = scopes || [];
  if (!scopes.length) return '';
  var map = NB_loadScopeColorMap_();
  var html = [];
  for (var i = 0; i < scopes.length; i++) {
    var scope = NB_clean_(scopes[i]);
    if (!scope) continue;
    var st = NB_scopeBadgeStyleFromConfig_(scope, map);
    var label = NB_scopeDisplayLabel_(scope, map);
    html.push('<span style="display:inline-block;margin:0 5px 5px 0;padding:4px 7px;border-radius:8px;background:' + st.bg + ';color:' + st.color + ';font-size:9px;font-weight:900;white-space:nowrap;border:1px solid ' + st.border + '">' + NB_html_(label) + '</span>');
  }
  return html.join('');
}

function NB_scopeDisplayList_(scopes) {
  scopes = scopes || [];
  var map = NB_loadScopeColorMap_();
  var out = [];
  var seen = {};
  for (var i = 0; i < scopes.length; i++) {
    var raw = NB_clean_(scopes[i]);
    if (!raw) continue;
    var label = NB_scopeDisplayLabel_(raw, map);
    var key = NB_normLoose_(label);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(label);
  }
  return out;
}

function NB_scopeDisplayLabel_(scope, map) {
  var raw = NB_clean_(scope);
  if (!raw) return '';
  map = map || NB_loadScopeColorMap_();
  var cfg = map && map[NB_normLoose_(raw)] ? map[NB_normLoose_(raw)] : null;
  return NB_clean_(cfg && cfg.label) || raw;
}

function NB_scopeBadgeStyleFromConfig_(scope, map) {
  var key = NB_normLoose_(scope);
  var cfg = map && map[key] ? map[key] : null;
  if (cfg && (cfg.bg || cfg.color || cfg.border)) {
    var bg = cfg.bg || '#eef2ff';
    var color = cfg.color || NB_readableTextColorForHex_(bg);
    var border = cfg.border || bg;
    return { bg:bg, color:color, border:border };
  }

  var s = NB_clean_(scope).toUpperCase();
  if (s.indexOf('MPS-GAP') >= 0) return { bg:'#dcfce7', color:'#166534', border:'#bbf7d0' };
  if (s.indexOf('GRASP') >= 0) return { bg:'#dbeafe', color:'#1d4ed8', border:'#bfdbfe' };
  if (s.indexOf('GLOBAL') >= 0) return { bg:'#f3e8ff', color:'#5b21b6', border:'#e9d5ff' };
  if (s.indexOf('MPS-ABC') >= 0) return { bg:'#dbeafe', color:'#1e40af', border:'#bfdbfe' };
  if (s.indexOf('FLORIMARK') >= 0) return { bg:'#fef3c7', color:'#92400e', border:'#fde68a' };
  if (s.indexOf('MPS-COMPACT') >= 0) return { bg:'#f3f4f6', color:'#111827', border:'#e5e7eb' };
  if (s.indexOf('MPS-SQ') >= 0) return { bg:'#ede9fe', color:'#6d28d9', border:'#ddd6fe' };
  return { bg:'#eef2ff', color:'#1e3a8a', border:'#dbeafe' };
}

function NB_loadScopeColorMap_() {
  var out = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss && ss.getSheetByName ? ss.getSheetByName('Config_Scopes') : null;
    if (!sh) return out;
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return out;

    var range = sh.getRange(1, 1, lastRow, lastCol);
    var values = range.getValues();
    var bgs = range.getBackgrounds();
    var fonts = range.getFontColors();

    var hdr = values[0] || [];
    var idx = NB_headerIndexMapLoose_(hdr);
    var cLabel = NB_findColLoose_(idx, [
      'DisplayName', 'Display Name', 'ScopeName', 'Scope Name', 'ScopeLabel', 'Scope Label',
      'FullName', 'Full Name', 'Label', 'Name', 'ScopeCode', 'Scope Code', 'Code', 'Standard', 'Scheme'
    ]);
    var cBg = NB_findColLoose_(idx, [
      'Color', 'Colour', 'ScopeColor', 'Scope Color', 'Badge background', 'Badge bg', 'BadgeColor', 'Badge color',
      'Background color', 'Background', 'Scope color', 'Scope colour',
      'Hex color', 'Hex', 'color_hex', 'UI color', 'Mail color', 'Email color'
    ]);
    var cText = NB_findColLoose_(idx, [
      'TextColor', 'Text Color', 'Badge text color', 'Text color', 'Font color', 'Foreground color',
      'Foreground', 'BadgeTextColor'
    ]);
    var cBorder = NB_findColLoose_(idx, ['Badge border', 'Border color', 'Border', 'BorderColor']);

    var keyCols = [];
    var keyNames = [
      'SlotKey', 'Slot Key', 'ScopeSlot', 'Scope Slot', 'ScopeKey', 'Scope Key',
      'ScopeCode', 'Scope Code', 'Scope_Code', 'Code', 'Standard', 'Scheme',
      'Header', 'Column', 'ColumnName', 'Column Name', 'DisplayName', 'Display Name',
      'Name', 'Label'
    ];
    for (var k = 0; k < keyNames.length; k++) {
      var c = NB_findColLoose_(idx, [keyNames[k]]);
      if (c >= 0 && keyCols.indexOf(c) < 0) keyCols.push(c);
    }
    if (!keyCols.length && cLabel >= 0) keyCols.push(cLabel);

    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var label = cLabel >= 0 ? NB_clean_(row[cLabel]) : '';
      if (!label) {
        for (var lc = 0; lc < keyCols.length; lc++) {
          label = NB_clean_(row[keyCols[lc]]);
          if (label) break;
        }
      }
      if (!label) continue;

      var bg = cBg >= 0 ? NB_cssColor_(row[cBg]) : '';
      var text = cText >= 0 ? NB_cssColor_(row[cText]) : '';
      var border = cBorder >= 0 ? NB_cssColor_(row[cBorder]) : '';

      if (!bg && cBg >= 0) bg = NB_nonWhiteHex_(bgs[r][cBg]);
      if (!bg && cLabel >= 0) bg = NB_nonWhiteHex_(bgs[r][cLabel]);
      if (!text && cText >= 0) text = NB_nonWhiteHex_(fonts[r][cText]);
      if (!text && cLabel >= 0) text = NB_nonWhiteHex_(fonts[r][cLabel]);
      if (!border && cBorder >= 0) border = NB_nonWhiteHex_(bgs[r][cBorder]);
      if (!border && bg) border = bg;

      var style = { label:label, bg:bg, color:text, border:border };
      for (var i = 0; i < keyCols.length; i++) {
        var keyVal = NB_clean_(row[keyCols[i]]);
        if (keyVal) out[NB_normLoose_(keyVal)] = style;
      }
      out[NB_normLoose_(label)] = style;
    }
  } catch (e) {}
  return out;
}


function NB_nonWhiteHex_(v) {
  v = NB_cssColor_(v);
  if (!v) return '';
  var k = v.toLowerCase();
  if (k === '#ffffff' || k === '#fff' || k === 'white' || k === '#000000' || k === '#000') return '';
  return v;
}


function NB_cssColor_(v) {
  v = NB_clean_(v);
  if (!v) return '';
  if (/^[0-9a-fA-F]{6}$/.test(v)) return '#' + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v) || /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(v)) return v;
  if (/^[a-zA-Z]+$/.test(v)) return v;
  return '';
}


function NB_readableTextColorForHex_(hex) {
  hex = NB_clean_(hex);
  var m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return '#0f172a';
  var x = m[1];
  var r = parseInt(x.substr(0, 2), 16);
  var g = parseInt(x.substr(2, 2), 16);
  var b = parseInt(x.substr(4, 2), 16);
  var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 150 ? '#0f172a' : '#ffffff';
}
