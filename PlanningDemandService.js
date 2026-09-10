/***********************************************************************
 * PlanningDemandService.js
 * BUILD: 2026-09-10_AMS01_2_PLANNING_DEMAND_R3_FINE_GRAINED_PERF
 *
 * PURPOSE
 *   First Roadmap 2.4 Planning Demand product slice.
 *   Answers: which audits must/can be planned in period X and what workload
 *   does that represent?
 *
 * SPEED CONTRACT
 *   - One bulk read of Audit planning per request.
 *   - Filter on persisted planning-window columns BEFORE enrichment.
 *   - No per-row Spreadsheet reads.
 *   - Company enrichment reads one bounded projection only for needed fields.
 *   - Never builds/loads the oversized full Companies name-core index here.
 *   - Scope extraction happens only for period candidates.
 *   - DEV-only lightweight timing via DevPerformanceLog.
 *   - Fine-grained probes separate Spreadsheet service time from local work.
 *   - No writes, no lifecycle effects, no Availability writes.
 ***********************************************************************/

var PLANNING_DEMAND_BUILD = '2026-09-10_AMS01_2_PLANNING_DEMAND_R3_FINE_GRAINED_PERF';

function PDS_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function PDS_norm_(v) {
  return PDS_clean_(v).toLowerCase();
}

function PDS_findCol_(headers, candidates) {
  headers = headers || [];
  candidates = candidates || [];
  var exact = {};
  for (var i = 0; i < headers.length; i++) exact[PDS_norm_(headers[i])] = i;
  for (var j = 0; j < candidates.length; j++) {
    var k = PDS_norm_(candidates[j]);
    if (Object.prototype.hasOwnProperty.call(exact, k)) return exact[k];
  }
  return -1;
}

function PDS_isoDate_(v, tz) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = PDS_clean_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function PDS_num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var n = Number(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function PDS_period_(input, tz) {
  input = input || {};
  var from = PDS_isoDate_(input.from || input.start || input.periodFrom, tz);
  var to = PDS_isoDate_(input.to || input.end || input.periodTo, tz);
  if (!from || !to) throw new Error('PlanningDemandService: valid from/to dates are required');
  if (to < from) throw new Error('PlanningDemandService: periodTo cannot be before periodFrom');
  return { from: from, to: to };
}

function PDS_windowOverlaps_(from, to, period) {
  if (!from || !to) return false;
  return from <= period.to && to >= period.from;
}

function PDS_statusIncluded_(raw) {
  var s = PDS_norm_(raw).replace(/\s+/g, ' ');
  return s === 'pending planning' || s === 'pending approval' || s === 'approved' || s === 'accepted';
}

function PDS_scopeNames_(headers, row) {
  if (typeof v5_extractScopesForAuditPlanningRow_ !== 'function') return [];
  var res = v5_extractScopesForAuditPlanningRow_(headers || [], row || []) || {};
  var scopes = Array.isArray(res.scopes) ? res.scopes : [];
  return scopes.map(function(s) {
    return PDS_clean_(s && (s.name || s.code || s.slot));
  }).filter(function(x) { return !!x; });
}

function PDS_companyLookupKey_(uid, company) {
  uid = PDS_clean_(uid);
  company = PDS_norm_(company).replace(/\s+/g, ' ');
  return uid ? ('UID::' + uid) : ('NAME::' + company);
}

/**
 * Speed-first bounded Companies projection.
 * Reads only the contiguous span needed for UID/name/country/region and only
 * once per Planning Demand request. No persistent oversized cache payload.
 */
function PDS_companyProjection_(ss, candidates, cCompany, cCompanyUid) {
  var needed = {};
  for (var i = 0; i < candidates.length; i++) {
    var row = candidates[i].row || [];
    var company = cCompany >= 0 ? PDS_clean_(row[cCompany]) : '';
    var uid = cCompanyUid >= 0 ? PDS_clean_(row[cCompanyUid]) : '';
    needed[PDS_companyLookupKey_(uid, company)] = true;
    if (company) needed['NAME::' + PDS_norm_(company).replace(/\s+/g, ' ')] = true;
  }

  var sh = ss.getSheetByName('Companies');
  if (!sh || sh.getLastRow() < 2) return { byKey: {}, rowsRead: 0, colsRead: 0 };

  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var iUid = PDS_findCol_(headers, ['Company_UID','Company UID','CompanyUID','UID']);
  var iName = PDS_findCol_(headers, ['Company','Company name','Name','Bedrijf']);
  var iCountry = PDS_findCol_(headers, ['Country']);
  var iRegion = PDS_findCol_(headers, ['Region']);

  var used = [iUid, iName, iCountry, iRegion].filter(function(x) { return x >= 0; });
  if (!used.length || iName < 0) return { byKey: {}, rowsRead: 0, colsRead: 0 };

  var minCol = Math.min.apply(null, used);
  var maxCol = Math.max.apply(null, used);
  var width = maxCol - minCol + 1;
  var rowCount = sh.getLastRow() - 1;
  var values = sh.getRange(2, minCol + 1, rowCount, width).getValues();
  var byKey = {};

  function rel_(absoluteIndex) { return absoluteIndex < 0 ? -1 : absoluteIndex - minCol; }
  var rUid = rel_(iUid), rName = rel_(iName), rCountry = rel_(iCountry), rRegion = rel_(iRegion);

  for (var r = 0; r < values.length; r++) {
    var v = values[r] || [];
    var uid = rUid >= 0 ? PDS_clean_(v[rUid]) : '';
    var name = rName >= 0 ? PDS_clean_(v[rName]) : '';
    if (!name && !uid) continue;
    var uidKey = uid ? ('UID::' + uid) : '';
    var nameKey = name ? ('NAME::' + PDS_norm_(name).replace(/\s+/g, ' ')) : '';
    if (!(uidKey && needed[uidKey]) && !(nameKey && needed[nameKey])) continue;

    var core = {
      companyUid: uid,
      companyName: name,
      country: rCountry >= 0 ? PDS_clean_(v[rCountry]) : '',
      region: rRegion >= 0 ? PDS_clean_(v[rRegion]) : ''
    };
    if (uidKey) byKey[uidKey] = core;
    if (nameKey) byKey[nameKey] = core;
  }

  return { byKey: byKey, rowsRead: values.length, colsRead: width };
}

function PDS_companyCore_(projection, uid, company) {
  if (!projection || !projection.byKey) return null;
  var uidKey = PDS_clean_(uid) ? ('UID::' + PDS_clean_(uid)) : '';
  if (uidKey && projection.byKey[uidKey]) return projection.byKey[uidKey];
  var nameKey = 'NAME::' + PDS_norm_(company).replace(/\s+/g, ' ');
  return projection.byKey[nameKey] || null;
}

function PDS_parsePlanningJsonHours_(raw) {
  raw = PDS_clean_(raw);
  if (!raw) return 0;
  try {
    var p = JSON.parse(raw);
    var nodes = [];
    if (Array.isArray(p)) nodes = p;
    else if (p && Array.isArray(p.blocks)) nodes = p.blocks;
    else if (p && Array.isArray(p.slots)) nodes = p.slots;
    else if (p && Array.isArray(p.days)) nodes = p.days;
    var total = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i] || {};
      if (isFinite(Number(n.hours))) {
        total += Number(n.hours);
        continue;
      }
      var st = PDS_clean_(n.start || n.startTime);
      var en = PDS_clean_(n.end || n.endTime);
      var sm = PDS_hhmmMinutes_(st);
      var em = PDS_hhmmMinutes_(en);
      if (isFinite(sm) && isFinite(em) && em > sm) total += (em - sm) / 60;
    }
    return total;
  } catch (e) {
    return 0;
  }
}

function PDS_hhmmMinutes_(v) {
  var m = PDS_clean_(v).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  var hh = Number(m[1]), mm = Number(m[2]);
  if (!isFinite(hh) || !isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return NaN;
  return hh * 60 + mm;
}

function PDS_urgency_(windowTo, period) {
  if (!windowTo) return 'UNKNOWN';
  if (windowTo < period.from) return 'OVERDUE';
  if (windowTo <= period.to) return 'DUE_IN_PERIOD';
  return 'OPEN_IN_PERIOD';
}

function PlanningDemandService_get(input) {
  input = input || {};
  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningDemandService_get', {
    from: input.from || input.start || input.periodFrom || '',
    to: input.to || input.end || input.periodTo || ''
  }) : null;

  var ss = SpreadsheetApp.getActive();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'resolveSpreadsheet');

  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var period = PDS_period_(input, tz);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'resolvePeriod', { timezone: tz });

  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error("PlanningDemandService: missing sheet 'Audit planning'");
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'resolveAuditPlanningSheet');

  var dataRange = sh.getDataRange();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'resolveAuditPlanningRange');

  var values = dataRange.getValues();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'readAuditPlanningValues', { rows: Math.max(0, values.length - 1), cols: values.length ? values[0].length : 0 });

  if (!values || values.length < 2) {
    var empty = { success: true, build: PLANNING_DEMAND_BUILD, period: period, rows: [], totals: { audits: 0, hoursToPlan: 0, hoursPlanned: 0, hoursDedicated: 0 } };
    if (typeof DPL_end_ === 'function') empty.devPerformance = DPL_end_(perf, { candidates: 0 });
    return empty;
  }

  var hdr = values[0] || [];
  var cAuditId = PDS_findCol_(hdr, ['Audit ID','Audit_ID','AuditId','Audit Id']);
  var cCompany = PDS_findCol_(hdr, ['Company']);
  var cCompanyUid = PDS_findCol_(hdr, ['Company_UID','Company UID','CompanyUid']);
  var cStatus = PDS_findCol_(hdr, ['Status']);
  var cFrom = PDS_findCol_(hdr, ['Planning window from','Plan van','Planning from','Planning start','Plan start']);
  var cTo = PDS_findCol_(hdr, ['Planning window to','Plan tot','Planning to','Planning end','Plan end']);
  var cTotalHours = PDS_findCol_(hdr, ['Total audit time in hours','Total audit time (hours)','Total audit time','Total hours','Audit hours']);
  var cHoursPlanned = PDS_findCol_(hdr, ['Hours planned','Planned hours','Hours Planned']);
  var cPlanningJson = PDS_findCol_(hdr, ['Planning JSON','Planning','PlanningJSON','Planning_Js']);
  var cAssigned = PDS_findCol_(hdr, ['Assigned to','Assigned auditor','Auditor']);
  var cPreassigned = PDS_findCol_(hdr, ['Preassigned Auditor','Preassigned auditor','Pre-assigned auditor']);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'resolveColumns');

  if (cAuditId < 0 || cCompany < 0 || cStatus < 0 || cFrom < 0 || cTo < 0) {
    throw new Error('PlanningDemandService: required Audit planning columns missing');
  }

  var candidates = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var status = PDS_clean_(row[cStatus]);
    if (!PDS_statusIncluded_(status)) continue;
    if (input.status && PDS_norm_(status) !== PDS_norm_(input.status)) continue;

    var wf = PDS_isoDate_(row[cFrom], tz);
    var wt = PDS_isoDate_(row[cTo], tz);
    if (!PDS_windowOverlaps_(wf, wt, period)) continue;

    var assigned = cAssigned >= 0 ? PDS_clean_(row[cAssigned]) : '';
    var preassigned = cPreassigned >= 0 ? PDS_clean_(row[cPreassigned]) : '';
    if (input.auditor) {
      var needAud = PDS_norm_(input.auditor);
      if (PDS_norm_(assigned) !== needAud && PDS_norm_(preassigned) !== needAud) continue;
    }

    candidates.push({ row: row, rowNumber: r + 1, status: status, windowFrom: wf, windowTo: wt, assigned: assigned, preassigned: preassigned });
  }
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'periodFilter', { candidates: candidates.length });

  var companyProjection = { byKey: {}, rowsRead: 0, colsRead: 0 };
  if (input.country || input.region || input.includeCompanyMeta !== false) {
    companyProjection = PDS_companyProjection_(ss, candidates, cCompany, cCompanyUid);
  }
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'companyProjection', {
    rowsRead: companyProjection.rowsRead || 0,
    colsRead: companyProjection.colsRead || 0,
    matches: Object.keys(companyProjection.byKey || {}).length
  });

  var out = [];
  var totals = { audits: 0, hoursToPlan: 0, hoursPlanned: 0, hoursDedicated: 0 };
  var limit = Math.max(1, Math.min(2000, Number(input.limit || 500) || 500));
  var scopeExtractMs = 0;
  var planningJsonParseMs = 0;
  var scopeExtractCalls = 0;
  var planningJsonParseCalls = 0;

  for (var i = 0; i < candidates.length && out.length < limit; i++) {
    var c = candidates[i];
    var row2 = c.row;
    var company = PDS_clean_(row2[cCompany]);
    var companyUid = cCompanyUid >= 0 ? PDS_clean_(row2[cCompanyUid]) : '';
    var core = PDS_companyCore_(companyProjection, companyUid, company) || {};
    var country = PDS_clean_(core.country);
    var region = PDS_clean_(core.region);

    if (input.country && PDS_norm_(country) !== PDS_norm_(input.country)) continue;
    if (input.region && PDS_norm_(region) !== PDS_norm_(input.region)) continue;

    var scopeStarted = Date.now();
    var scopes = PDS_scopeNames_(hdr, row2);
    scopeExtractMs += Date.now() - scopeStarted;
    scopeExtractCalls++;
    if (input.scope) {
      var needScope = PDS_norm_(input.scope);
      var scopeMatch = scopes.some(function(s) { return PDS_norm_(s) === needScope; });
      if (!scopeMatch) continue;
    }

    var hoursToPlan = cTotalHours >= 0 ? PDS_num_(row2[cTotalHours]) : 0;
    var hoursPlanned = cHoursPlanned >= 0 ? PDS_num_(row2[cHoursPlanned]) : 0;
    if (!hoursPlanned && cPlanningJson >= 0) {
      var jsonStarted = Date.now();
      hoursPlanned = PDS_parsePlanningJsonHours_(row2[cPlanningJson]);
      planningJsonParseMs += Date.now() - jsonStarted;
      planningJsonParseCalls++;
    }
    var hoursDedicated = Math.min(hoursToPlan || 0, hoursPlanned || 0);

    out.push({
      auditId: PDS_clean_(row2[cAuditId]),
      companyUid: companyUid || PDS_clean_(core.companyUid),
      company: company,
      country: country,
      region: region,
      status: c.status,
      planningWindowFrom: c.windowFrom,
      planningWindowTo: c.windowTo,
      urgency: PDS_urgency_(c.windowTo, period),
      scopes: scopes,
      hoursToPlan: hoursToPlan,
      hoursPlanned: hoursPlanned,
      hoursDedicated: hoursDedicated,
      assignedTo: c.assigned,
      preassignedAuditor: c.preassigned,
      rowNumber: c.rowNumber
    });

    totals.audits++;
    totals.hoursToPlan += hoursToPlan;
    totals.hoursPlanned += hoursPlanned;
    totals.hoursDedicated += hoursDedicated;
  }
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'enrichAndProject', {
    returned: out.length,
    limit: limit,
    scopeExtractCalls: scopeExtractCalls,
    scopeExtractMs: scopeExtractMs,
    planningJsonParseCalls: planningJsonParseCalls,
    planningJsonParseMs: planningJsonParseMs
  });

  out.sort(function(a, b) {
    if (a.planningWindowTo !== b.planningWindowTo) return String(a.planningWindowTo).localeCompare(String(b.planningWindowTo));
    if (a.country !== b.country) return String(a.country).localeCompare(String(b.country));
    if (a.region !== b.region) return String(a.region).localeCompare(String(b.region));
    return String(a.company).localeCompare(String(b.company));
  });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'sort');

  totals.hoursToPlan = Math.round(totals.hoursToPlan * 100) / 100;
  totals.hoursPlanned = Math.round(totals.hoursPlanned * 100) / 100;
  totals.hoursDedicated = Math.round(totals.hoursDedicated * 100) / 100;

  var result = {
    success: true,
    build: PLANNING_DEMAND_BUILD,
    period: period,
    rows: out,
    totals: totals,
    meta: {
      sourceRows: Math.max(0, values.length - 1),
      periodCandidates: candidates.length,
      returned: out.length,
      truncated: out.length >= limit && candidates.length > out.length,
      readModel: 'Audit planning + targeted Companies projection',
      writes: false,
      perfProbe: {
        scopeExtractCalls: scopeExtractCalls,
        scopeExtractMs: scopeExtractMs,
        planningJsonParseCalls: planningJsonParseCalls,
        planningJsonParseMs: planningJsonParseMs
      }
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    candidates: candidates.length,
    returned: out.length,
    scopeExtractMs: scopeExtractMs,
    planningJsonParseMs: planningJsonParseMs
  });
  return result;
}
