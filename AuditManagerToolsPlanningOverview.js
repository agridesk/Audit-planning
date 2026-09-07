// BUILD: AuditManagerToolsPlanningOverview_20260425
// Planning overview helpers unchanged.

function m5t_getPlanningOverview(payload) {
  payload = payload || {};
  var months = Number(payload.months || 6);
  if (!isFinite(months) || months < 1) months = 6;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { success: false, error: 'MISSING_AUDIT_PLANNING' };

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { success: true, rows: [] };

  var header = values[0];
  var hm = m5t_makeHeaderMap_(header);

  var companyCol      = m5t_pickHeader_(hm, ['Company','Customer','Bedrijf']);
  var totalHoursCol   = m5t_pickHeader_(hm, ['Total audit time in hours','Total audit time (hours)','Total audit time','Total hours']);
  var preassignedCol  = m5t_pickHeader_(hm, ['Preassigned Auditor']);
  var assignedCol     = m5t_pickHeader_(hm, ['Assigned to','Assigned auditor','Auditor']);
  var datePlannedCol  = m5t_pickHeader_(hm, ['Date - Planned','Date planned','Planned date']);
  var statusCol       = m5t_pickHeader_(hm, ['Status']);
  var planningJsonCol = m5t_pickHeader_(hm, ['Planning JSON']);
  var auditIdCol      = m5t_pickHeader_(hm, ['Audit ID']);

  if (companyCol < 0 || statusCol < 0) {
    return { success: false, error: 'PLANNING_OVERVIEW_MISSING_REQUIRED_HEADERS' };
  }

  var allowedStatuses = {
    'pending approval': true,
    'approved': true,
    'accepted': true
  };

  var today = new Date();
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var end = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());

  var scopeFlagCols = m5t_po_getScopeFlagCols_(header);
  var scopeMeta = m5t_po_getScopeMeta_(ss);
  var companyRegionMap = m5t_po_getCompanyRegionMap_(ss);

  var out = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var status = String(row[statusCol] || '').trim();
    if (!allowedStatuses[String(status).toLowerCase()]) continue;

    var auditor = '';
    if (assignedCol >= 0) auditor = String(row[assignedCol] || '').trim();
    if (!auditor && preassignedCol >= 0) auditor = String(row[preassignedCol] || '').trim();

    var company = String(row[companyCol] || '').trim();
    var auditId = auditIdCol >= 0 ? String(row[auditIdCol] || '').trim() : '';
    var hours   = totalHoursCol >= 0 ? row[totalHoursCol] : '';

    var scopesStyled = m5t_po_extractScopesStyled_(ss, row, header, scopeFlagCols, scopeMeta);
    var scopesText = scopesStyled.map(function(s) {
      return s.code || s.name || '';
    }).filter(function(x) {
      return !!String(x || '').trim();
    }).join(', ');

    var plannedDateDetails = m5t_po_extractPlannedDateDetails_(row, datePlannedCol, planningJsonCol);
    if (!plannedDateDetails.length) continue;

    var region = companyRegionMap[m5t_normHeader_(company)] || '';

    for (var i = 0; i < plannedDateDetails.length; i++) {
      var detail = plannedDateDetails[i] || {};
      var d = detail.date;
      if (!d) continue;
      if (d < today || d > end) continue;

      out.push({
        date: Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        auditor: auditor,
        company: company,
        region: region,
        scopes: scopesText,
        scopesStyled: scopesStyled,
        status: status,
        hours: detail.hours || hours,
        auditId: auditId,
        dayIndex: detail.dayIndex || (plannedDateDetails.length > 1 ? (i + 1) : 1),
        dayCount: detail.dayCount || plannedDateDetails.length,
        dayLabel: m5t_po_buildDayLabel_(detail, i, plannedDateDetails.length),
        dayTooltip: m5t_po_buildDayTooltip_(detail, i, plannedDateDetails.length)
      });
    }
  }

  out = m5t_po_dedupeRows_(out);

  out.sort(function(a, b) {
    if (a.date !== b.date) return String(a.date || '').localeCompare(String(b.date || ''));
    if (a.auditor !== b.auditor) return String(a.auditor || '').localeCompare(String(b.auditor || ''));
    return String(a.company || '').localeCompare(String(b.company || ''));
  });

  return { success: true, rows: out };
}

function m5t_po_getScopeFlagCols_(header) {
  var cols = [];
  for (var c = 0; c < header.length && c <= 15; c++) {
    var h = String(header[c] || '').trim();
    if (!h) continue;
    if (String(h).toLowerCase().indexOf('duration ') === 0) continue;
    cols.push(c);
  }
  return cols;
}

function m5t_po_getScopeMeta_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Config_Scopes');
  if (!sh) return out;

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return out;

  var hm = m5t_makeHeaderMap_(values[0]);
  var nameCol = m5t_pickHeader_(hm, ['DisplayName','Display name','Name','ScopeName','Scope']);
  var codeCol = m5t_pickHeader_(hm, ['ScopeCode','Scope code','Code','SlotKey','Slot key','Slot']);
  var bgCol   = m5t_pickHeader_(hm, ['Color','Colour','BackgroundColor','Background color','BgColor','FillColor','Fill color','BadgeColor','Badge color']);
  var textCol = m5t_pickHeader_(hm, ['TextColor','Text color','FontColor','Font color','LabelColor','Label color']);

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
    if (!name) continue;

    var item = {
      name: name,
      code: codeCol >= 0 ? String(row[codeCol] || '').trim() : name,
      bgColor: bgCol >= 0 ? String(row[bgCol] || '').trim() : '',
      textColor: textCol >= 0 ? String(row[textCol] || '').trim() : ''
    };

    out[m5t_normHeader_(name)] = item;
    if (item.code) out[m5t_normHeader_(item.code)] = item;
  }

  return out;
}

function m5t_po_extractScopesStyled_(ss, row, header, flagCols, meta) {
  var out = [];
  for (var i = 0; i < flagCols.length; i++) {
    var c = flagCols[i];
    if (c >= row.length || c >= header.length) continue;
    var marked = String(row[c] || '').trim().toLowerCase();
    if (marked !== 'x') continue;

    var rawName = String(header[c] || '').trim();
    var canonical = (typeof m5t_scopeCanonicalName_ === 'function')
      ? (m5t_scopeCanonicalName_(ss, rawName) || rawName)
      : rawName;

    var item = meta[m5t_normHeader_(canonical)] || meta[m5t_normHeader_(rawName)] || {};

    out.push({
      name: canonical,
      code: item.code || canonical,
      color: item.bgColor || '',
      textColor: item.textColor || ''
    });
  }
  return out;
}


function m5t_po_getCompanyRegionMap_(ss) {
  var out = {};
  var sh = ss.getSheetByName('Companies');
  if (!sh) return out;

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return out;

  var hm = m5t_makeHeaderMap_(values[0]);
  var nameCol = m5t_pickHeader_(hm, ['Company','Company name','Customer','Bedrijf','Name']);
  var regionCol = m5t_pickHeader_(hm, ['Region']);

  if (nameCol < 0 || regionCol < 0) return out;

  for (var r = 1; r < values.length; r++) {
    var name = String(values[r][nameCol] || '').trim();
    if (!name) continue;
    out[m5t_normHeader_(name)] = String(values[r][regionCol] || '').trim();
  }

  return out;
}


function m5t_po_extractPlannedDateDetails_(row, datePlannedCol, planningJsonCol) {
  var out = [];

  try {
    if (planningJsonCol >= 0) {
      var raw = row[planningJsonCol];
      if (raw != null && String(raw).trim()) {
        var parsed = JSON.parse(String(raw).trim());
        var nodes = [];

        if (Array.isArray(parsed)) {
          nodes = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.days)) nodes = nodes.concat(parsed.days);
          if (Array.isArray(parsed.items)) nodes = nodes.concat(parsed.items);
          if (Array.isArray(parsed.slots)) nodes = nodes.concat(parsed.slots);
          if (Array.isArray(parsed.entries)) nodes = nodes.concat(parsed.entries);
          if (!nodes.length) nodes.push(parsed);
        }

        for (var i = 0; i < nodes.length; i++) {
          var detail = m5t_po_extractDateDetailFromNode_(nodes[i]);
          if (detail && detail.date) out.push(detail);
        }
      }
    }
  } catch (e) {}

  if (!out.length && datePlannedCol >= 0) {
    var d0 = m5t_po_anyToDate_(row[datePlannedCol]);
    if (d0) out.push({ date: d0 });
  }

  var count = out.length;
  for (var j = 0; j < out.length; j++) {
    if (!out[j].dayIndex) out[j].dayIndex = j + 1;
    if (!out[j].dayCount) out[j].dayCount = count;
  }

  return out;
}


function m5t_po_extractDateDetailFromNode_(node) {
  if (!node) return null;

  var d = m5t_po_anyToDate_(
    node.date ||
    node.day ||
    node.iso ||
    node.datePlanned ||
    node.plannedDate ||
    node.d ||
    ''
  );

  if (!d) return null;

  return {
    date: d,
    start: String(node.start || node.startTime || node.from || node.timeFrom || '').trim(),
    end: String(node.end || node.endTime || node.to || node.timeTo || '').trim(),
    hours: node.hours || node.duration || '',
    location: String(node.location || node.locationName || node.execLoc || node.locationLabel || '').trim(),
    comment: String(node.comment || node.comments || node.slotComment || '').trim()
  };
}


function m5t_po_buildDayLabel_(detail, index, count) {
  detail = detail || {};
  count = Number(count || detail.dayCount || 1);
  if (count <= 1) return '';
  return 'Day ' + String(Number(detail.dayIndex || index + 1)) + '/' + String(count);
}


function m5t_po_buildDayTooltip_(detail, index, count) {
  detail = detail || {};
  var lines = [];
  var label = m5t_po_buildDayLabel_(detail, index, count);
  if (label) lines.push(label);
  if (detail.start || detail.end) lines.push('Time: ' + String(detail.start || '?') + ' - ' + String(detail.end || '?'));
  if (detail.location) lines.push('Location: ' + detail.location);
  if (detail.hours) lines.push('Hours: ' + String(detail.hours));
  if (detail.comment) lines.push('Comment: ' + detail.comment);
  return lines.join('\\n');
}



function m5t_po_extractPlannedDates_(row, datePlannedCol, planningJsonCol) {
  var out = [];

  try {
    if (planningJsonCol >= 0) {
      var raw = row[planningJsonCol];
      if (raw != null && String(raw).trim()) {
        var parsed = JSON.parse(String(raw).trim());
        var nodes = [];

        if (Array.isArray(parsed)) {
          nodes = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.days)) nodes = nodes.concat(parsed.days);
          if (Array.isArray(parsed.items)) nodes = nodes.concat(parsed.items);
          if (Array.isArray(parsed.slots)) nodes = nodes.concat(parsed.slots);
          if (Array.isArray(parsed.entries)) nodes = nodes.concat(parsed.entries);
          if (!nodes.length) nodes.push(parsed);
        }

        for (var i = 0; i < nodes.length; i++) {
          var d = m5t_po_extractDateFromNode_(nodes[i]);
          if (d) out.push(d);
        }
      }
    }
  } catch (e) {}

  if (!out.length && datePlannedCol >= 0) {
    var d0 = m5t_po_anyToDate_(row[datePlannedCol]);
    if (d0) out.push(d0);
  }

  return out;
}

function m5t_po_extractDateFromNode_(node) {
  if (!node) return null;
  return m5t_po_anyToDate_(
    node.date ||
    node.day ||
    node.iso ||
    node.datePlanned ||
    node.plannedDate ||
    node.d ||
    ''
  );
}

function m5t_po_anyToDate_(v) {
  if (v == null || v === '') return null;

  if (Object.prototype.toString.call(v) === '[object Date]') {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }

  var s = String(v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  var m1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));

  var m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));

  return null;
}



function m5t_po_dedupeRows_(rows) {
  rows = Array.isArray(rows) ? rows : [];
  var seen = {};
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var key = [
      String(r.date || '').trim(),
      String(r.auditId || '').trim(),
      String(r.auditor || '').trim().toLowerCase(),
      String(r.company || '').trim().toLowerCase(),
      String(r.status || '').trim().toLowerCase()
    ].join('|');
    if (!String(r.auditId || '').trim()) {
      key = [
        String(r.date || '').trim(),
        String(r.auditor || '').trim().toLowerCase(),
        String(r.company || '').trim().toLowerCase(),
        String(r.scopes || '').trim().toLowerCase(),
        String(r.status || '').trim().toLowerCase()
      ].join('|');
    }
    if (seen[key]) continue;
    seen[key] = true;
    out.push(r);
  }
  return out;
}
