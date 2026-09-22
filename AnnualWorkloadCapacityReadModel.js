/**
 * FILE: AnnualWorkloadCapacityReadModel.gs
 * BUILD: 2026-09-22_AMS03_ANNUAL_WORKLOAD_CAPACITY_R1
 * PURPOSE:
 *   Read-only annual planner workload/capacity model on top of Model C.
 *
 * Canonical ownership:
 * - Workload truth: Audit_Obligations (Formal_Hours, Cycle_Key, obligation state).
 * - Visit linkage: Audit_Visit_Obligations.
 * - Operational planning/status projection: Audit planning.
 * - Auditor identity/capacity roster: Auditors.
 * - Company/region labels: Companies.
 *
 * No writes. No status changes. No Availability writes. No new planning truth.
 */
var ANNUAL_WORKLOAD_CAPACITY_BUILD = '2026-09-22_AMS03_ANNUAL_WORKLOAD_CAPACITY_R1';

function getAnnualWorkloadCapacityV5(payload) {
  payload = payload || {};
  var year = Number(payload.year || new Date().getFullYear());
  if (!isFinite(year) || year < 2000 || year > 3000) year = new Date().getFullYear();
  return AnnualWorkloadCapacity_build_(SpreadsheetApp.getActive(), year);
}

function AnnualWorkloadCapacity_build_(ss, year) {
  ss = ss || SpreadsheetApp.getActive();
  year = Number(year || new Date().getFullYear());
  var t0 = Date.now();
  var out = {
    success: false,
    build: ANNUAL_WORKLOAD_CAPACITY_BUILD,
    readOnly: true,
    writesPerformed: false,
    year: year,
    summary: {},
    auditors: [],
    workload: [],
    warnings: [],
    errors: [],
    __serverMs: 0
  };

  var shOb = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var shLink = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var shAp = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var shAud = ss.getSheetByName('Auditors');
  var shComp = ss.getSheetByName('Companies');
  if (!shOb) out.errors.push('Missing sheet: ' + MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  if (!shLink) out.errors.push('Missing sheet: ' + MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if (!shAp) out.errors.push('Missing sheet: ' + MODEL_C_SHEETS.AUDIT_PLANNING);
  if (!shAud) out.errors.push('Missing sheet: Auditors');
  if (!shComp) out.errors.push('Missing sheet: Companies');
  if (out.errors.length) { out.__serverMs = Date.now() - t0; return out; }

  var obligations = AnnualWorkloadCapacity_rowsToObjects_(shOb.getDataRange().getValues());
  var links = AnnualWorkloadCapacity_rowsToObjects_(shLink.getDataRange().getValues());
  var ap = AnnualWorkloadCapacity_rowsToObjects_(shAp.getDataRange().getValues());
  var companies = AnnualWorkloadCapacity_rowsToObjects_(shComp.getDataRange().getValues());
  var auditors = AnnualWorkloadCapacity_rowsToObjects_(shAud.getDataRange().getValues());

  var companyByUid = {};
  companies.forEach(function(c) {
    var uid = AnnualWorkloadCapacity_pick_(c, ['Company_UID','Company UID','CompanyUid']);
    if (!uid) return;
    companyByUid[String(uid)] = {
      company: String(AnnualWorkloadCapacity_pick_(c, ['Company','Company name','Customer','Bedrijf','Name']) || '').trim(),
      region: String(AnnualWorkloadCapacity_pick_(c, ['Region']) || '').trim(),
      country: String(AnnualWorkloadCapacity_pick_(c, ['Country','Country code']) || '').trim()
    };
  });

  var apByAudit = {};
  ap.forEach(function(r) {
    var auditId = String(AnnualWorkloadCapacity_pick_(r, ['Audit ID','Audit_ID','AuditId']) || '').trim();
    if (!auditId) return;
    apByAudit[auditId] = {
      status: String(AnnualWorkloadCapacity_pick_(r, ['Status']) || '').trim(),
      preassigned: String(AnnualWorkloadCapacity_pick_(r, ['Preassigned Auditor','Preassigned auditor']) || '').trim().toLowerCase(),
      assigned: String(AnnualWorkloadCapacity_pick_(r, ['Assigned to','Assigned auditor','Auditor']) || '').trim().toLowerCase(),
      datePlanned: AnnualWorkloadCapacity_dateKey_(AnnualWorkloadCapacity_pick_(r, ['Date - Planned','Date planned','Planned date'])),
      planningJson: AnnualWorkloadCapacity_pick_(r, ['Planning JSON','Planning_JSON'])
    };
  });

  var activeAuditIdsByOb = {};
  links.forEach(function(l) {
    if (String(l.Link_State || '').trim().toUpperCase() !== 'ACTIVE') return;
    var obId = String(l.Obligation_ID || '').trim();
    var auditId = String(l.Audit_ID || '').trim();
    if (!obId || !auditId) return;
    (activeAuditIdsByOb[obId] || (activeAuditIdsByOb[obId] = [])).push(auditId);
  });

  var workload = [];
  obligations.forEach(function(ob) {
    var cycle = String(ob.Cycle_Key || '').trim();
    if (String(year) !== cycle) return;
    if (AnnualWorkloadCapacity_terminalObligation_(ob.Obligation_State)) return;

    var formalHours = AnnualWorkloadCapacity_num_(ob.Formal_Hours);
    var obId = String(ob.Obligation_ID || '').trim();
    var uid = String(ob.Company_UID || '').trim();
    var comp = companyByUid[uid] || { company: uid, region: '', country: '' };
    var linked = (activeAuditIdsByOb[obId] || []).slice();
    var auditId = linked.length ? linked[0] : '';
    var apRow = auditId ? (apByAudit[auditId] || {}) : {};
    var status = String(apRow.status || (linked.length ? 'Linked' : 'Pending Planning')).trim();
    var auditor = String(apRow.assigned || apRow.preassigned || ob.Preassigned_Auditor_Email || '').trim().toLowerCase();
    var planned = AnnualWorkloadCapacity_statusIsPlanned_(status) || !!AnnualWorkloadCapacity_hasPlanning_(apRow);

    workload.push({
      obligationId: obId,
      auditId: auditId,
      companyUid: uid,
      company: comp.company || uid,
      region: comp.region || '',
      country: comp.country || '',
      scope: String(ob.ScopeCode || '').trim(),
      cycleKey: cycle,
      formalHours: formalHours,
      planningWindowFrom: AnnualWorkloadCapacity_dateKey_(ob.Planning_Window_From),
      planningWindowTo: AnnualWorkloadCapacity_dateKey_(ob.Planning_Window_To),
      status: status,
      auditorEmail: auditor,
      planned: planned,
      unallocated: !auditor,
      linkedVisitCount: linked.length
    });
  });

  var roster = {};
  auditors.forEach(function(a) {
    var active = AnnualWorkloadCapacity_yes_(AnnualWorkloadCapacity_pick_(a, ['Active','Is active']));
    var role = String(AnnualWorkloadCapacity_pick_(a, ['Role','Function']) || '').trim().toLowerCase();
    if (!active || role !== 'auditor') return;
    var email = String(AnnualWorkloadCapacity_pick_(a, ['E-mail','Email','E-mail address','Mail']) || '').trim().toLowerCase();
    var name = String(AnnualWorkloadCapacity_pick_(a, ['Name','Auditor','Auditor name']) || '').trim();
    if (!email && !name) return;
    var key = email || name.toLowerCase();
    roster[key] = {
      auditorEmail: email,
      auditorName: name,
      auditsToPlan: 0,
      formalHoursToPlan: 0,
      auditsPlanned: 0,
      formalHoursPlanned: 0,
      totalAudits: 0,
      totalFormalHours: 0,
      regions: {},
      scopes: {}
    };
  });

  var unallocated = { audits: 0, formalHours: 0 };
  workload.forEach(function(w) {
    var key = w.auditorEmail;
    if (!key || !roster[key]) {
      if (!w.planned) {
        unallocated.audits++;
        unallocated.formalHours += w.formalHours;
      }
      return;
    }
    var a = roster[key];
    a.totalAudits++;
    a.totalFormalHours += w.formalHours;
    if (w.planned) {
      a.auditsPlanned++;
      a.formalHoursPlanned += w.formalHours;
    } else {
      a.auditsToPlan++;
      a.formalHoursToPlan += w.formalHours;
    }
    if (w.region) a.regions[w.region] = (a.regions[w.region] || 0) + w.formalHours;
    if (w.scope) a.scopes[w.scope] = (a.scopes[w.scope] || 0) + w.formalHours;
  });

  var auditorRows = Object.keys(roster).map(function(k) {
    var a = roster[k];
    a.totalFormalHours = AnnualWorkloadCapacity_round_(a.totalFormalHours);
    a.formalHoursToPlan = AnnualWorkloadCapacity_round_(a.formalHoursToPlan);
    a.formalHoursPlanned = AnnualWorkloadCapacity_round_(a.formalHoursPlanned);
    a.regions = AnnualWorkloadCapacity_mapToList_(a.regions);
    a.scopes = AnnualWorkloadCapacity_mapToList_(a.scopes);
    return a;
  });
  auditorRows.sort(function(a,b){ return String(a.auditorName || a.auditorEmail).localeCompare(String(b.auditorName || b.auditorEmail)); });

  var totalHours = 0, plannedHours = 0, toPlanHours = 0, plannedAudits = 0, toPlanAudits = 0;
  workload.forEach(function(w){
    totalHours += w.formalHours;
    if (w.planned) { plannedHours += w.formalHours; plannedAudits++; }
    else { toPlanHours += w.formalHours; toPlanAudits++; }
  });

  out.summary = {
    obligations: workload.length,
    auditsPlanned: plannedAudits,
    auditsToPlan: toPlanAudits,
    totalFormalHours: AnnualWorkloadCapacity_round_(totalHours),
    formalHoursPlanned: AnnualWorkloadCapacity_round_(plannedHours),
    formalHoursToPlan: AnnualWorkloadCapacity_round_(toPlanHours),
    unallocatedAuditsToPlan: unallocated.audits,
    unallocatedFormalHoursToPlan: AnnualWorkloadCapacity_round_(unallocated.formalHours),
    activeAuditors: auditorRows.length
  };
  out.auditors = auditorRows;
  out.workload = workload;
  out.success = true;
  out.__serverMs = Date.now() - t0;
  return out;
}

function AnnualWorkloadCapacity_rowsToObjects_(values) {
  values = values || [];
  if (!values.length) return [];
  var h = values[0] || [];
  var out = [];
  for (var r=1;r<values.length;r++) {
    var o = {};
    var has = false;
    for (var c=0;c<h.length;c++) {
      var k = String(h[c] || '').trim();
      if (!k) continue;
      o[k] = values[r][c];
      if (values[r][c] !== '' && values[r][c] != null) has = true;
    }
    if (has) out.push(o);
  }
  return out;
}
function AnnualWorkloadCapacity_pick_(obj, names) {
  obj = obj || {}; names = names || [];
  var norm = {};
  Object.keys(obj).forEach(function(k){ norm[String(k).trim().toLowerCase()] = obj[k]; });
  for (var i=0;i<names.length;i++) {
    var key = String(names[i] || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(norm,key)) return norm[key];
  }
  return '';
}
function AnnualWorkloadCapacity_yes_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'x' || s === 'y';
}
function AnnualWorkloadCapacity_num_(v) {
  var n = (typeof v === 'number') ? v : Number(String(v == null ? '' : v).replace(',','.').trim());
  return isFinite(n) ? n : 0;
}
function AnnualWorkloadCapacity_round_(n) { return Math.round(Number(n || 0) * 100) / 100; }
function AnnualWorkloadCapacity_terminalObligation_(state) {
  var s = String(state || '').trim().toUpperCase();
  return s === 'COMPLETED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'INACTIVE' || s === 'CLOSED';
}
function AnnualWorkloadCapacity_statusIsPlanned_(status) {
  var s = String(status || '').trim().toLowerCase();
  return s === 'pending approval' || s === 'approved' || s === 'accepted' || s === 'completed';
}
function AnnualWorkloadCapacity_hasPlanning_(apRow) {
  apRow = apRow || {};
  if (apRow.datePlanned) return true;
  var raw = apRow.planningJson;
  if (raw == null || String(raw).trim() === '') return false;
  try {
    var p = JSON.parse(String(raw));
    if (Array.isArray(p)) return p.length > 0;
    if (p && typeof p === 'object') {
      var arr = p.days || p.items || p.slots || p.entries;
      if (Array.isArray(arr)) return arr.length > 0;
      return !!(p.date || p.day || p.start || p.startTime);
    }
  } catch(e) {}
  return false;
}
function AnnualWorkloadCapacity_dateKey_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
  return m ? (m[1]+'-'+m[2]+'-'+m[3]) : s;
}
function AnnualWorkloadCapacity_mapToList_(m) {
  return Object.keys(m || {}).map(function(k){ return { key:k, formalHours:AnnualWorkloadCapacity_round_(m[k]) }; })
    .sort(function(a,b){ return b.formalHours-a.formalHours || a.key.localeCompare(b.key); });
}
