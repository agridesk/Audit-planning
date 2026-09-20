/**
 * AMS-01.6 Model C Phase 2B consolidated acceptance gate.
 * Read-only: no writes are performed.
 */
var MODEL_C_PHASE2B_ACCEPTANCE_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_2B_ACCEPTANCE_R2_STABLE_READ';

function RUN_MODEL_C_PHASE2B_ACCEPTANCE() {
  var out = {
    success: false,
    build: MODEL_C_PHASE2B_ACCEPTANCE_BUILD,
    readOnly: true,
    writesPerformed: false,
    gates: {},
    errors: []
  };

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
    var stableRecon = ModelCPhase2BAcceptance_readStableReconciliation_();
    out.reconciliation = stableRecon.compact;
    out.reconciliationReadAttempts = stableRecon.attempts;
    out.reconciliationStabilized = stableRecon.stabilized;
    out.gates.reconciliation = stableRecon.success === true;
    if (!out.gates.reconciliation) {
      (stableRecon.errors || ['Phase 2B reconciliation failed']).slice(0, 10).forEach(function(x) { out.errors.push(String(x)); });
    }
  } catch (eRecon) {
    out.gates.reconciliation = false;
    out.errors.push('Phase 2B reconciliation exception: ' + String(eRecon && eRecon.message ? eRecon.message : eRecon));
  }

  try {
    var ss2 = SpreadsheetApp.getActive();
    SpreadsheetApp.flush();
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
  } catch (eRestore) {
    out.gates.testAuditRestored = false;
    out.errors.push('Test audit restore verification exception: ' + String(eRestore && eRestore.message ? eRestore.message : eRestore));
  }

  out.success = Object.keys(out.gates).every(function(k) { return out.gates[k] === true; }) && out.errors.length === 0;
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.success) throw new Error('Model C Phase 2B acceptance failed: ' + out.errors.join('; '));
  return out;
}

function ModelCPhase2BAcceptance_readStableReconciliation_() {
  var attempts = [];
  var last = null;
  var successStreak = 0;
  var maxAttempts = 3;

  for (var i = 0; i < maxAttempts; i++) {
    SpreadsheetApp.flush();
    if (i > 0) Utilities.sleep(350);

    var ss = SpreadsheetApp.getActive();
    var source = ModelCMigration_readSource_(ss);
    var target = ModelCRecon_readTargets_(ss);
    var reconciliation = (source && source.success && target && target.success)
      ? ModelCPhase2BRecon_compare_(ss, source, target)
      : { success:false, errors:['Unable to read reconciliation source/target'] };

    var compact = (typeof ModelCPhase2BRecon_compact_ === 'function')
      ? ModelCPhase2BRecon_compact_(reconciliation)
      : reconciliation;

    attempts.push({
      attempt: i + 1,
      success: reconciliation.success === true,
      errors: (reconciliation.errors || []).slice(0, 5)
    });

    last = { reconciliation:reconciliation, compact:compact };

    if (reconciliation.success === true) {
      successStreak++;
      if (successStreak >= 2) {
        return {
          success:true,
          compact:compact,
          attempts:attempts,
          stabilized:attempts.length > 2 || attempts[0].success !== true,
          errors:[]
        };
      }
    } else {
      successStreak = 0;
    }
  }

  return {
    success:false,
    compact:last ? last.compact : { success:false },
    attempts:attempts,
    stabilized:false,
    errors:last && last.reconciliation ? (last.reconciliation.errors || []) : ['Phase 2B reconciliation did not stabilize']
  };
}
