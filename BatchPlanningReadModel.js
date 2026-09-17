/**
 * FILE: BatchPlanningReadModel.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_READ_MODEL_R1
 *
 * Read-only Batch Planning inputs. No planning/status/availability writes.
 */
var BATCH_PLANNING_READ_MODEL_BUILD = '2026-09-17_BATCH_PLANNING_READ_MODEL_R1';

function BatchPlanningReadModel_GetAuditor(auditorEmail, forceRefresh) {
  var email = String(auditorEmail || '').trim().toLowerCase();
  if (!email) return { ok:false, reason:'AUDITOR_EMAIL_REQUIRED' };

  var directory = (typeof AuditorsIndex_GetDirectory === 'function')
    ? AuditorsIndex_GetDirectory(!!forceRefresh)
    : null;
  var base = directory && directory.byEmail ? directory.byEmail[email] : null;
  if (!base) return { ok:false, reason:'AUDITOR_NOT_FOUND', auditorEmail:email };

  var departure = BatchPlanningReadModel_getDepartureFrom_(email);
  return {
    ok:true,
    build:BATCH_PLANNING_READ_MODEL_BUILD,
    auditorEmail:email,
    name:String(base.name || ''),
    timezone:String(base.timezone || ''),
    blockedWeekdays:String(base.blockedWeekdays || ''),
    defaultDepartureFrom:departure,
    defaultInbound:departure,
    defaultOutbound:departure,
    source:'Auditors',
    sourceField:'Default departure from',
    sourceColumn:'Q'
  };
}

function BatchPlanningReadModel_getDepartureFrom_(auditorEmail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Auditors');
  if (!sh) return '';
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return '';
  var headers = values[0] || [];
  var emailCol = BatchPlanningReadModel_findHeader_(headers, ['E-mail','Email','E mail','Auditor email','Auditor_Email']);
  var departureCol = BatchPlanningReadModel_findHeader_(headers, ['Default departure from']);
  if (emailCol < 0 || departureCol < 0) return '';
  var wanted = String(auditorEmail || '').trim().toLowerCase();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][emailCol] || '').trim().toLowerCase() === wanted) {
      return String(values[r][departureCol] || '').trim();
    }
  }
  return '';
}

function BatchPlanningReadModel_findHeader_(headers, candidates) {
  var wanted = {};
  (candidates || []).forEach(function(x){ wanted[BatchPlanningReadModel_norm_(x)] = true; });
  for (var i = 0; i < (headers || []).length; i++) {
    if (wanted[BatchPlanningReadModel_norm_(headers[i])]) return i;
  }
  return -1;
}

function BatchPlanningReadModel_norm_(v) {
  return String(v == null ? '' : v).replace(/\u00A0/g,' ').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
}

function BatchPlanningReadModel_GetCompanyLocation(companyName, locationCodeOrLabel) {
  if (typeof BatchPlanning_getCompanyLocation_ !== 'function') {
    return { ok:false, reason:'BATCH_PLANNING_FOUNDATION_MISSING' };
  }
  return BatchPlanning_getCompanyLocation_(companyName, locationCodeOrLabel);
}

function BatchPlanningReadModel_GetBoundaryDefaults(auditorEmail, input) {
  input = input || {};
  var auditor = BatchPlanningReadModel_GetAuditor(auditorEmail, false);
  if (!auditor.ok) return auditor;
  var home = { label:auditor.defaultDepartureFrom };
  var boundaries = BatchPlanning_resolveBoundaryPoints_({
    home:home,
    inbound:input.inbound,
    outbound:input.outbound,
    previousPlannedStop:input.previousPlannedStop,
    nextPlannedStop:input.nextPlannedStop
  });
  return { ok:true, build:BATCH_PLANNING_READ_MODEL_BUILD, auditor:auditor, boundaries:boundaries };
}

function RUN_BATCH_PLANNING_READ_MODEL_DIAGNOSTICS() {
  var directory = AuditorsIndex_GetDirectory(false);
  var list = directory && directory.list ? directory.list : [];
  var sample = [];
  for (var i = 0; i < list.length; i++) {
    var rec = BatchPlanningReadModel_GetAuditor(list[i].email, false);
    sample.push({
      auditorEmail:rec.auditorEmail,
      name:rec.name,
      defaultDepartureFrom:rec.defaultDepartureFrom,
      sourceColumn:rec.sourceColumn
    });
  }
  var out = {
    ok:!!(directory && directory.ok),
    build:BATCH_PLANNING_READ_MODEL_BUILD,
    auditorCount:list.length,
    sample:sample,
    nonDestructive:true
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
