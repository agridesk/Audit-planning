/** Pure, read-only tests for Model C Phase 1 reconciliation. */
var MODEL_C_RECON_TEST_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_1_RECON_TESTS_R2';

function RUN_MODEL_C_PHASE1_RECONCILIATION_REGRESSION() {
  var tests = [ModelCReconTest_green_, ModelCReconTest_dateObjectCycle_, ModelCReconTest_hoursMismatch_, ModelCReconTest_linkMismatch_, ModelCReconTest_abcExpiry_, ModelCReconTest_dependency_];
  var results = [], passed = 0;
  for (var i = 0; i < tests.length; i++) {
    try { tests[i](); results.push({ name: tests[i].name, ok: true }); passed++; }
    catch (e) { results.push({ name: tests[i].name, ok: false, error: String(e.message || e) }); }
  }
  var out = { ok: passed === tests.length, build: MODEL_C_RECON_TEST_BUILD, reconciliationBuild: MODEL_C_RECON_BUILD, passed: passed, total: tests.length, writesPerformed: false, results: results };
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.ok) throw new Error('Reconciliation regression failed');
  return out;
}

function ModelCReconTest_green_() { ModelCReconTest_assert_(ModelCRecon_compare_(ModelCReconTest_source_(), ModelCReconTest_target_()).success, 'green fixture failed'); }
function ModelCReconTest_dateObjectCycle_() { var t = ModelCReconTest_target_(); t.rows.Audit_Obligations[0].Cycle_Key = new Date(2027, 4, 31); ModelCReconTest_assert_(ModelCRecon_compare_(ModelCReconTest_source_(), t).success, 'date object cycle did not normalize'); }
function ModelCReconTest_hoursMismatch_() { var t = ModelCReconTest_target_(); t.rows.Audit_Obligations[0].Formal_Hours = 9; ModelCReconTest_assert_(!ModelCRecon_compare_(ModelCReconTest_source_(), t).success, 'hours mismatch accepted'); }
function ModelCReconTest_linkMismatch_() { var t = ModelCReconTest_target_(); t.rows.Audit_Visit_Obligations[0].Audit_ID = 'WRONG'; ModelCReconTest_assert_(!ModelCRecon_compare_(ModelCReconTest_source_(), t).success, 'link mismatch accepted'); }
function ModelCReconTest_abcExpiry_() { var s = ModelCReconTest_source_('MPS-ABC'); var t = ModelCReconTest_target_('MPS-ABC'); t.rows.Audit_Obligations[0].Base_Expiry_Date = '2026-12-31'; ModelCReconTest_assert_(!ModelCRecon_compare_(s, t).success, 'ABC expiry accepted'); }
function ModelCReconTest_dependency_() { var t = ModelCReconTest_target_(); t.rows.Config_Scope_Dependencies = []; ModelCReconTest_assert_(!ModelCRecon_compare_(ModelCReconTest_source_(), t).success, 'missing dependency accepted'); }

function ModelCReconTest_source_(code) {
  code = code || 'MPS-GAP';
  var headers = ['Company_UID', 'Audit ID', 'SCOPE_01', 'Duration SCOPE_01', 'Date - Will Expire', 'Planning window from', 'Birthdate certificate'];
  var catalogItem = { slotKey: 'SCOPE_01', scopeCode: code, displayName: code, recurring: 'YES' };
  return { planningHeaders: headers, planningRows: [['C1', 'A1', 'x', 8, code === 'MPS-ABC' ? '2026-12-31' : '2027-05-31', '2026-01-01', '2026-12-31']], scopeCatalog: { bySlot: { SCOPE_01: catalogItem }, byCode: { 'MPS-GAP': catalogItem, GRASP: { scopeCode: 'GRASP' } } } };
}

function ModelCReconTest_target_(code) {
  code = code || 'MPS-GAP';
  var abc = code === 'MPS-ABC';
  return { success: true, rows: {
    Company_Scopes: [{ Company_Scope_ID: 'CS1', Company_UID: 'C1', ScopeCode: code, Certificate_Birthday: '' }],
    Audit_Obligations: [{ Obligation_ID: 'O1', Company_Scope_ID: 'CS1', Company_UID: 'C1', ScopeCode: code, Cycle_Key: abc ? '2026' : '2027-05-31', Trigger_Source: abc ? 'ECAS' : 'CERTIFICATE_LIFECYCLE', Formal_Hours: 8, Base_Expiry_Date: '', Effective_Expiry_Date: '' }],
    Audit_Visit_Obligations: [{ Audit_ID: 'A1', Obligation_ID: 'O1', Link_State: 'ACTIVE' }],
    Config_Scope_Dependencies: [{ Parent_ScopeCode: 'MPS-GAP', Child_ScopeCode: 'GRASP', Active: 'YES', Must_Audit_Together: 'YES', Share_Expiry: 'YES' }]
  } };
}

function ModelCReconTest_assert_(value, message) { if (!value) throw new Error(message); }
