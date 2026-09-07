/***********************************************************************
 * EligibilityService_GATE_A_RUNNERS.gs
 *
 * Companion file with parameterless runner wrappers for the GATE A
 * test functions. Apps Script Run-button cannot pass arguments; this
 * file solves that without you having to edit any code.
 *
 * Hardcoded test audit:
 *   AUD_TEST_PendingPlanning_HQ_1777629793840_103
 *
 * If you want to test a different audit, tell the agent which Audit ID
 * and a new version of this file will be delivered. Do NOT edit this
 * file by hand — that's the working agreement.
 *
 * Run sequence from Apps Script editor:
 *   1. RUN_BOOTSTRAP            (already done — safe to re-run)
 *   2. RUN_WARM_DRYRUN          (already done — safe to re-run)
 *   3. RUN_WRITE_ONE
 *   4. RUN_READ_ONE
 *   5. RUN_COMPARE_OUTPUT       <-- this is the correctness gate
 *   6. RUN_INVALIDATE_ONE
 *   7. RUN_WARM_FIRST_5
 *
 * Optional: if any wrappers you added earlier produced errors, you may
 * leave them — they will simply not be selected. Or remove them. Your
 * call.
 ***********************************************************************/

var ELIG_TEST_AUDIT_ID = 'AUD_TEST_PendingPlanning_HQ_1777629793840_103';


function RUN_BOOTSTRAP() {
  return GATE_A_TEST_bootstrap();
}

function RUN_WARM_DRYRUN() {
  return GATE_A_TEST_warmDryRun();
}

function RUN_WRITE_ONE() {
  return GATE_A_TEST_writeOne(ELIG_TEST_AUDIT_ID);
}

function RUN_READ_ONE() {
  return GATE_A_TEST_readOne(ELIG_TEST_AUDIT_ID);
}

function RUN_COMPARE_OUTPUT() {
  return GATE_A_TEST_compareOutput(ELIG_TEST_AUDIT_ID);
}

function RUN_INVALIDATE_ONE() {
  return GATE_A_TEST_invalidateOne(ELIG_TEST_AUDIT_ID);
}

function RUN_WARM_FIRST_5() {
  return GATE_A_TEST_warmFirst(5);
}

function RUN_WARM_FIRST_25() {
  return GATE_A_TEST_warmFirst(25);
}


/***********************************************************************
 * RUN_FULL_GATE_A_SUITE
 *
 * One-shot: bootstrap → write → read → compare → invalidate → warm 5.
 * Returns a single report so you can paste one log instead of seven.
 ***********************************************************************/
function RUN_FULL_GATE_A_SUITE() {
  var report = {
    auditId: ELIG_TEST_AUDIT_ID,
    startedAt: new Date().toISOString(),
    steps: {}
  };
  try { report.steps.bootstrap        = GATE_A_TEST_bootstrap(); }                            catch (e) { report.steps.bootstrap        = { ok: false, error: String(e) }; }
  try { report.steps.warmDryRun       = GATE_A_TEST_warmDryRun(); }                           catch (e) { report.steps.warmDryRun       = { ok: false, error: String(e) }; }
  try { report.steps.writeOne         = GATE_A_TEST_writeOne(ELIG_TEST_AUDIT_ID); }           catch (e) { report.steps.writeOne         = { ok: false, error: String(e) }; }
  try { report.steps.readOne          = GATE_A_TEST_readOne(ELIG_TEST_AUDIT_ID); }            catch (e) { report.steps.readOne          = { ok: false, error: String(e) }; }
  try { report.steps.compareOutput    = GATE_A_TEST_compareOutput(ELIG_TEST_AUDIT_ID); }      catch (e) { report.steps.compareOutput    = { ok: false, error: String(e) }; }
  try { report.steps.invalidateOne    = GATE_A_TEST_invalidateOne(ELIG_TEST_AUDIT_ID); }      catch (e) { report.steps.invalidateOne    = { ok: false, error: String(e) }; }
  try { report.steps.warmFirst5       = GATE_A_TEST_warmFirst(5); }                           catch (e) { report.steps.warmFirst5       = { ok: false, error: String(e) }; }
  report.finishedAt = new Date().toISOString();
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
