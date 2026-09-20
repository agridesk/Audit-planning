/**
 * AMS-01.6 Model C Phase 2B consolidated acceptance gate.
 * Controlled DEV acceptance:
 * - Canonicalizes the dedicated DEV test audit to MPS-GAP 8.0 through the real Scope Manager route first.
 * - Verifies Scope Manager UI reads formal hours from Model C.
 * - Verifies annual-cycle successor creation/finalization routes through Model C and rolls back test writes.
 * - Runs regression, preflight and full reconciliation against the restored canonical state.
 */
var MODEL_C_PHASE2B_ACCEPTANCE_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_ACCEPTANCE_R4_FULL_OWNER_CLOSURE';

function RUN_MODEL_C_PHASE2B_ACCEPTANCE() {
  var out = {
    success: false,
    build: MODEL_C_PHASE2B_ACCEPTANCE_BUILD,
    readOnly: false,
    writesPerformed: false,
    gates: {},
    errors: []
  };

  try {
    var restore = ModelCPhase2BRouteSmoke_run_(8, 'ACCEPTANCE_RESTORE');
    out.restore = restore;
    out.writesPerformed = !!(restore && restore.writesPerformed === true);
    out.gates.testAuditCanonicalized = !!(restore && restore.success === true && Number(restore.modelGapHours) === 8);
    if (!out.gates.testAuditCanonicalized) out.errors.push('Dedicated DEV test audit canonicalization failed');
  } catch (eRestore) {
    out.gates.testAuditCanonicalized = false;
    out.errors.push('Dedicated DEV test audit canonicalization exception: ' + String(eRestore && eRestore.message ? eRestore.message : eRestore));
  }

  try {
    var uiRead = RUN_MODEL_C_SCOPE_UI_READ_ACCEPTANCE();
    out.uiRead = uiRead;
    out.gates.uiReadsFormalHoursFromModelC = !!(
      uiRead &&
      uiRead.success === true &&
      uiRead.readOnly === true &&
      uiRead.writesPerformed === false &&
      uiRead.gates &&
      uiRead.gates.customHoursFromModelC === true &&
      uiRead.gates.usedHoursFromModelC === true
    );
    if (!out.gates.uiReadsFormalHoursFromModelC) out.errors.push('Scope Manager UI read ownership failed');
  } catch (eUi) {
    out.gates.uiReadsFormalHoursFromModelC = false;
    out.errors.push('Scope Manager UI read ownership exception: ' + String(eUi && eUi.message ? eUi.message : eUi));
  }

  try {
    var annualRouting = RUN_MODEL_C_ANNUAL_CYCLE_ROUTE_ACCEPTANCE();
    out.annualRouting = annualRouting;
    out.writesPerformed = out.writesPerformed || !!(annualRouting && annualRouting.writesPerformed === true);
    out.gates.annualCycleOwnedByModelC = !!(
      annualRouting &&
      annualRouting.success === true &&
      annualRouting.rolledBack === true &&
      annualRouting.gates &&
      annualRouting.gates.modelCOwnerUsed === true &&
      annualRouting.gates.twoCanonicalSuccessorObligations === true &&
      annualRouting.gates.noAbcSuccessor === true &&
      annualRouting.gates.finalizerCompletesObligations === true &&
      annualRouting.gates.finalizerUnlinksVisit === true &&
      annualRouting.gates.postRestorePreflightGreen === true
    );
    if (!out.gates.annualCycleOwnedByModelC) out.errors.push('Annual-cycle Model C ownership acceptance failed');
  } catch (eAnnual) {
    out.gates.annualCycleOwnedByModelC = false;
    out.errors.push('Annual-cycle Model C ownership exception: ' + String(eAnnual && eAnnual.message ? eAnnual.message : eAnnual));
  }

  try {
    var regression = RUN_MODEL_C_PHASE2B_SCOPE_OWNER_REGRESSION();
    out.regression = regression;
    out.gates.regression = !!(regression && regression.ok === true && Number(regression.passed) === Number(regression.total));
    if (!out.gates.regression) out.errors.push('Scope owner regression failed');
  } catch (eRegression) {
    out.gates.regression = false;
    out.errors.push('Scope owner regression exception: ' + String(eRegression && eRegression.message ? eRegression.message : eRegression));
  }

  try {
    var preflight = RUN_MODEL_C_PHASE2B_SCOPE_OWNER_PREFLIGHT();
    out.preflight = preflight;
    out.gates.preflight = !!(preflight && preflight.success === true && preflight.readyForScopeOwnerRouting === true);
    if (!out.gates.preflight) out.errors.push('Scope owner preflight failed');
  } catch (ePreflight) {
    out.gates.preflight = false;
    out.errors.push('Scope owner preflight exception: ' + String(ePreflight && ePreflight.message ? ePreflight.message : ePreflight));
  }

  try {
    SpreadsheetApp.flush();
    var ss = SpreadsheetApp.getActive();
    var source = ModelCMigration_readSource_(ss);
    var target = ModelCRecon_readTargets_(ss);
    var reconciliation = (source && source.success && target && target.success)
      ? ModelCPhase2BRecon_compare_(ss, source, target)
      : { success:false, errors:['Unable to read reconciliation source/target'] };
    out.reconciliation = (typeof ModelCPhase2BRecon_compact_ === 'function')
      ? ModelCPhase2BRecon_compact_(reconciliation)
      : reconciliation;
    out.gates.reconciliation = reconciliation.success === true;
    if (!out.gates.reconciliation) {
      (reconciliation.errors || ['Phase 2B reconciliation failed']).slice(0, 10).forEach(function(x) { out.errors.push(String(x)); });
    }
  } catch (eRecon) {
    out.gates.reconciliation = false;
    out.errors.push('Phase 2B reconciliation exception: ' + String(eRecon && eRecon.message ? eRecon.message : eRecon));
  }

  try {
    var ss2 = SpreadsheetApp.getActive();
    var auditId = 'AUD_TEST_AcceptedDelta_HQ_1777979469906_101';
    var target2 = ModelCRecon_readTargets_(ss2);
    var rows = (target2 && target2.rows) || {};
    var obligations = rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS] || [];
    var links = rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS] || [];
    var obById = {};
    obligations.forEach(function(x) { obById[String(x.Obligation_ID || '')] = x; });
    var gapHours = null;
    links.forEach(function(x) {
      if (String(x.Audit_ID || '') !== auditId || String(x.Link_State || '').toUpperCase() !== 'ACTIVE') return;
      var ob = obById[String(x.Obligation_ID || '')];
      if (ob && String(ob.ScopeCode || '') === 'MPS-GAP') gapHours = Number(ob.Formal_Hours);
    });
    out.testAudit = { auditId:auditId, mpsGapFormalHours:gapHours };
    out.gates.testAuditRestored = gapHours === 8;
    if (!out.gates.testAuditRestored) out.errors.push('Dedicated DEV test audit MPS-GAP hours not restored to 8.0');
  } catch (eVerify) {
    out.gates.testAuditRestored = false;
    out.errors.push('Test audit restore verification exception: ' + String(eVerify && eVerify.message ? eVerify.message : eVerify));
  }

  out.success = Object.keys(out.gates).every(function(k) { return out.gates[k] === true; }) && out.errors.length === 0;
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.success) throw new Error('Model C Phase 2B acceptance failed: ' + out.errors.join('; '));
  return out;
}
