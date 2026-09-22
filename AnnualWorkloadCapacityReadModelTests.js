/**
 * FILE: AnnualWorkloadCapacityReadModelTests.gs
 * BUILD: 2026-09-22_AMS03_ANNUAL_WORKLOAD_CAPACITY_TEST_R1
 */
function RUN_AMS03_ANNUAL_WORKLOAD_CAPACITY_ACCEPTANCE() {
  var year = 2027;
  var res = AnnualWorkloadCapacity_build_(SpreadsheetApp.getActive(), year);
  var gates = {};
  var errors = [];

  function gate(name, ok, detail) {
    gates[name] = !!ok;
    if (!ok) errors.push(name + (detail ? ': ' + detail : ''));
  }

  gate('success', res && res.success === true, (res && res.errors || []).join('; '));
  gate('readOnly', res && res.readOnly === true && res.writesPerformed === false);
  gate('canonicalYear', res && Number(res.year) === year);
  gate('summaryPresent', res && res.summary && typeof res.summary.obligations === 'number');
  gate('workloadRowsPresent', res && Array.isArray(res.workload) && res.workload.length > 0);
  gate('activeAuditorRosterPresent', res && Array.isArray(res.auditors) && res.auditors.length > 0);

  var rows = (res && res.workload) || [];
  var duplicateOb = {};
  var dupCount = 0;
  var hours = 0;
  var plannedHours = 0;
  var toPlanHours = 0;
  var plannedAudits = 0;
  var toPlanAudits = 0;
  var badCycle = 0;
  var missingObId = 0;
  rows.forEach(function(r) {
    var id = String(r.obligationId || '');
    if (!id) missingObId++;
    if (id && duplicateOb[id]) dupCount++;
    if (id) duplicateOb[id] = true;
    if (String(r.cycleKey || '') !== String(year)) badCycle++;
    var h = Number(r.formalHours || 0);
    hours += h;
    if (r.planned) { plannedHours += h; plannedAudits++; }
    else { toPlanHours += h; toPlanAudits++; }
  });
  gate('oneRowPerObligation', dupCount === 0, 'duplicates=' + dupCount);
  gate('obligationIdentityPresent', missingObId === 0, 'missing=' + missingObId);
  gate('onlyRequestedCycle', badCycle === 0, 'badCycle=' + badCycle);
  gate('summaryObligationCountMatches', res && res.summary && Number(res.summary.obligations) === rows.length);
  gate('summaryHoursReconciles', res && res.summary && Math.abs(Number(res.summary.totalFormalHours || 0) - hours) < 0.01);
  gate('plannedHoursReconcile', res && res.summary && Math.abs(Number(res.summary.formalHoursPlanned || 0) - plannedHours) < 0.01);
  gate('toPlanHoursReconcile', res && res.summary && Math.abs(Number(res.summary.formalHoursToPlan || 0) - toPlanHours) < 0.01);
  gate('plannedAuditCountReconciles', res && res.summary && Number(res.summary.auditsPlanned || 0) === plannedAudits);
  gate('toPlanAuditCountReconciles', res && res.summary && Number(res.summary.auditsToPlan || 0) === toPlanAudits);
  gate('readModelDoesNotOwnCapacityTruth', res && res.auditors.every(function(a){
    return !Object.prototype.hasOwnProperty.call(a, 'capacityHours') && !Object.prototype.hasOwnProperty.call(a, 'availableHours');
  }), 'R1 must report workload only; capacity availability requires a separately governed source');

  var out = {
    success: errors.length === 0,
    build: '2026-09-22_AMS03_ANNUAL_WORKLOAD_CAPACITY_TEST_R1',
    readOnly: true,
    writesPerformed: false,
    year: year,
    counts: {
      obligations: rows.length,
      activeAuditors: (res && res.auditors || []).length,
      auditsPlanned: plannedAudits,
      auditsToPlan: toPlanAudits,
      totalFormalHours: Math.round(hours * 100) / 100,
      formalHoursPlanned: Math.round(plannedHours * 100) / 100,
      formalHoursToPlan: Math.round(toPlanHours * 100) / 100,
      unallocatedAuditsToPlan: res && res.summary ? res.summary.unallocatedAuditsToPlan : null,
      unallocatedFormalHoursToPlan: res && res.summary ? res.summary.unallocatedFormalHoursToPlan : null
    },
    gates: gates,
    errors: errors,
    serverMs: res ? res.__serverMs : null
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
