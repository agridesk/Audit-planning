/**
 * FILE: BatchPlanningCandidateEngine.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_CANDIDATE_ENGINE_R1
 *
 * Read-only first candidate collection layer.
 * Planning window is hard/leading. Qualification is hard. Existing planned
 * audits are not returned as movable candidates. Hours to be planned remains
 * the canonical duration total. No planning writes and no route API calls.
 */
var BATCH_PLANNING_CANDIDATE_ENGINE_BUILD = '2026-09-17_BATCH_PLANNING_CANDIDATE_ENGINE_R1';

function BatchPlanningCandidateEngine_Collect(input) {
  input = input || {};
  var auditorEmail = String(input.auditorEmail || '').trim().toLowerCase();
  var periodFrom = BatchPlanningCandidateEngine_date_(input.periodFrom);
  var periodTo = BatchPlanningCandidateEngine_date_(input.periodTo);
  if (!auditorEmail) return {ok:false, error:'AUDITOR_REQUIRED', candidates:[]};
  if (!periodFrom || !periodTo || periodTo.getTime() < periodFrom.getTime()) return {ok:false, error:'VALID_PERIOD_REQUIRED', candidates:[]};

  var auditor = BatchPlanningReadModel_GetAuditor(auditorEmail, false);
  if (!auditor || !auditor.ok) return {ok:false, error:'AUDITOR_NOT_FOUND', candidates:[]};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return {ok:false, error:'AUDIT_PLANNING_NOT_FOUND', candidates:[]};
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return BatchPlanningCandidateEngine_result_(auditor, periodFrom, periodTo, [], []);

  var headers = values[0] || [];
  var idx = BatchPlanningCandidateEngine_headerMap_(headers);
  var rejected = [];
  var candidates = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var auditId = BatchPlanningCandidateEngine_text_(row, idx, ['Audit ID']);
    if (!auditId) continue;
    var status = BatchPlanningCandidateEngine_text_(row, idx, ['Status']);
    if (status !== 'Pending Planning') continue;

    var windowFrom = BatchPlanningCandidateEngine_date_(BatchPlanningCandidateEngine_value_(row, idx, ['Planning window from']));
    var windowTo = BatchPlanningCandidateEngine_date_(BatchPlanningCandidateEngine_value_(row, idx, ['Planning window to']));
    if (!windowFrom || !windowTo) {
      rejected.push({auditId:auditId, reason:'PLANNING_WINDOW_MISSING'});
      continue;
    }

    // Candidate must have at least one schedulable day inside both requested period and formal planning window.
    var overlapFrom = periodFrom.getTime() > windowFrom.getTime() ? periodFrom : windowFrom;
    var overlapTo = periodTo.getTime() < windowTo.getTime() ? periodTo : windowTo;
    if (overlapFrom.getTime() > overlapTo.getTime()) {
      rejected.push({auditId:auditId, reason:'OUTSIDE_PLANNING_WINDOW'});
      continue;
    }

    var scopes = BatchPlanningCandidateEngine_scopes_(headers, row);
    var unqualified = scopes.filter(function(scope){ return !AuditorsIndex_IsQualified(auditorEmail, scope); });
    if (unqualified.length) {
      rejected.push({auditId:auditId, reason:'AUDITOR_NOT_QUALIFIED', scopes:unqualified});
      continue;
    }

    var hours = Number(BatchPlanningCandidateEngine_value_(row, idx, ['Hours to be planned','Hours To Be Planned','Required hours','Total hours']));
    if (!isFinite(hours) || hours < 0) hours = 0;

    var company = BatchPlanningCandidateEngine_text_(row, idx, ['Company']);
    var companyUid = BatchPlanningCandidateEngine_text_(row, idx, ['Company_UID','Company UID']);
    var location = BatchPlanningCandidateEngine_text_(row, idx, ['Location','Audit location','Execution location']);
    var preferredMonths = BatchPlanningCandidateEngine_companyPreferredMonths_(company, companyUid);
    var soft = [];
    if (preferredMonths.length && !BatchPlanningCandidateEngine_periodTouchesPreferredMonth_(overlapFrom, overlapTo, preferredMonths)) {
      soft.push({code:'OUTSIDE_PREFERRED_AUDIT_MONTHS', owner:'Companies', advisory:true});
    }

    candidates.push({
      auditId:auditId,
      company:company,
      companyUid:companyUid,
      location:location,
      status:status,
      scopes:scopes,
      hoursToBePlanned:hours,
      planningWindowFrom:BatchPlanningCandidateEngine_iso_(windowFrom),
      planningWindowTo:BatchPlanningCandidateEngine_iso_(windowTo),
      schedulableFrom:BatchPlanningCandidateEngine_iso_(overlapFrom),
      schedulableTo:BatchPlanningCandidateEngine_iso_(overlapTo),
      preferredAuditMonths:preferredMonths,
      softWarnings:soft,
      route:null,
      routePending:true
    });
  }

  candidates.sort(function(a,b){
    var ato = String(a.planningWindowTo || '');
    var bto = String(b.planningWindowTo || '');
    if (ato !== bto) return ato < bto ? -1 : 1;
    return String(a.company || '').localeCompare(String(b.company || ''));
  });

  return BatchPlanningCandidateEngine_result_(auditor, periodFrom, periodTo, candidates, rejected);
}

function BatchPlanningCandidateEngine_result_(auditor, from, to, candidates, rejected) {
  return {
    ok:true,
    build:BATCH_PLANNING_CANDIDATE_ENGINE_BUILD,
    advisoryOnly:true,
    auditor:auditor,
    period:{from:BatchPlanningCandidateEngine_iso_(from), to:BatchPlanningCandidateEngine_iso_(to)},
    candidates:candidates || [],
    rejected:rejected || [],
    candidateCount:(candidates || []).length,
    rejectedCount:(rejected || []).length,
    routeMatrixPending:true,
    availabilityIntegrationPending:true,
    rotationIntegrationPending:true,
    writesPerformed:false
  };
}

function BatchPlanningCandidateEngine_scopes_(headers, row) {
  try {
    if (typeof v5_extractScopesForAuditPlanningRow_ === 'function') {
      var res = v5_extractScopesForAuditPlanningRow_(headers, row);
      var arr = res && res.scopes ? res.scopes : [];
      return arr.map(function(s){ return String((s && (s.name || s.code || s.slot)) || '').trim(); }).filter(Boolean);
    }
  } catch (e) {}
  var idx = BatchPlanningCandidateEngine_headerMap_(headers);
  var text = BatchPlanningCandidateEngine_text_(row, idx, ['Scopes','Scopes_List']);
  return text ? text.split(/[,;|]+/).map(function(x){return String(x || '').trim();}).filter(Boolean) : [];
}

function BatchPlanningCandidateEngine_companyPreferredMonths_(company, companyUid) {
  try {
    if (typeof CompaniesIndex_GetCompanyCoreByName === 'function' && company) {
      var rec = CompaniesIndex_GetCompanyCoreByName(company);
      if (rec) {
        var raw = rec.preferredAuditMonths || rec.preferredMonths || '';
        return BatchPlanningCandidateEngine_months_(raw);
      }
    }
  } catch (e) {}
  return [];
}

function BatchPlanningCandidateEngine_months_(raw) {
  if (Array.isArray(raw)) return raw.map(Number).filter(function(n){return n >= 1 && n <= 12;});
  var s = String(raw || '').trim();
  if (!s) return [];
  var names = {jan:1,january:1,januari:1,feb:2,february:2,februari:2,mar:3,march:3,maart:3,apr:4,april:4,may:5,mei:5,jun:6,june:6,juni:6,jul:7,july:7,juli:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,oktober:10,nov:11,november:11,dec:12,december:12};
  var out = [], seen = {};
  s.split(/[,;|\s]+/).forEach(function(v){
    var k = String(v || '').toLowerCase();
    var n = /^\d+$/.test(k) ? Number(k) : names[k];
    if (n >= 1 && n <= 12 && !seen[n]) { seen[n]=true; out.push(n); }
  });
  return out.sort(function(a,b){return a-b;});
}

function BatchPlanningCandidateEngine_periodTouchesPreferredMonth_(from, to, months) {
  var d = new Date(from.getFullYear(), from.getMonth(), 1);
  var end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (d.getTime() <= end.getTime()) {
    if (months.indexOf(d.getMonth()+1) >= 0) return true;
    d.setMonth(d.getMonth()+1);
  }
  return false;
}

function BatchPlanningCandidateEngine_headerMap_(headers) {
  var map = {};
  (headers || []).forEach(function(h,i){
    var s=String(h || '').trim();
    if (!s) return;
    map[s]=i; map[s.toLowerCase()]=i; map[s.toLowerCase().replace(/[^a-z0-9]+/g,'')]=i;
  });
  return map;
}
function BatchPlanningCandidateEngine_value_(row, idx, names) {
  for (var i=0;i<(names||[]).length;i++) {
    var s=String(names[i] || '').trim(), k=s.toLowerCase().replace(/[^a-z0-9]+/g,'');
    if (idx.hasOwnProperty(s)) return row[idx[s]];
    if (idx.hasOwnProperty(s.toLowerCase())) return row[idx[s.toLowerCase()]];
    if (idx.hasOwnProperty(k)) return row[idx[k]];
  }
  return '';
}
function BatchPlanningCandidateEngine_text_(row, idx, names){ return String(BatchPlanningCandidateEngine_value_(row,idx,names) || '').trim(); }
function BatchPlanningCandidateEngine_date_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())) return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  var s=String(v).trim(), m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  var d=new Date(s); return isNaN(d.getTime()) ? null : new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function BatchPlanningCandidateEngine_iso_(d){ return d ? Utilities.formatDate(d, Session.getScriptTimeZone() || 'Europe/Amsterdam','yyyy-MM-dd') : ''; }

function RUN_BATCH_PLANNING_CANDIDATE_ENGINE_DIAGNOSTICS() {
  var directory=AuditorsIndex_GetDirectory(false), list=directory && directory.list ? directory.list : [];
  var auditor=list.length ? list[0].email : '';
  var today=new Date(), to=new Date(today.getTime()); to.setDate(to.getDate()+90);
  var out=BatchPlanningCandidateEngine_Collect({auditorEmail:auditor,periodFrom:today,periodTo:to});
  Logger.log(JSON.stringify({ok:out.ok,build:out.build,auditorEmail:auditor,candidateCount:out.candidateCount,rejectedCount:out.rejectedCount,writesPerformed:false},null,2));
  return out;
}
