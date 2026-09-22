/**
 * AMS-01.6 Model C — final closure acceptance after projection repair.
 * Read-only orchestration. No sheet writes.
 */
var MODEL_C_FINAL_CLOSURE_ACCEPTANCE_BUILD = '2026-09-22_AMS_01_6_MODEL_C_FINAL_CLOSURE_ACCEPTANCE_R1';

function RUN_MODEL_C_FINAL_CLOSURE_ACCEPTANCE() {
  var out = {
    success: false,
    build: MODEL_C_FINAL_CLOSURE_ACCEPTANCE_BUILD,
    readOnly: true,
    writesPerformed: false,
    gates: {},
    components: {},
    errors: []
  };

  function run_(name, fnName) {
    try {
      if (typeof this[fnName] !== 'function') throw new Error('Missing function: ' + fnName);
      var r = this[fnName]();
      out.components[name] = r || null;
      return !!(r && r.success === true);
    } catch (e) {
      out.errors.push(name + ': ' + String(e && e.message ? e.message : e));
      return false;
    }
  }

  out.gates.postHardeningAcceptance = run_.call(this, 'postHardeningAcceptance', 'RUN_MODEL_C_POST_HARDENING_ACCEPTANCE');
  out.gates.projectionDriftAcceptance = run_.call(this, 'projectionDriftAcceptance', 'RUN_MODEL_C_PROJECTION_DRIFT_ACCEPTANCE');

  try {
    var p = out.components.projectionDriftAcceptance || {};
    var c = p.counts || {};
    out.gates.projectionNoMismatches = Number(c.mismatches || 0) === 0;
    out.gates.projectionNoPartialWindows = Number(c.sheetPartial || 0) === 0;
    out.gates.projectionNoCanonicalHardBlocks = Number(c.canonicalHardBlocks || 0) === 0;
    out.gates.modelCBackedAuditsResolved = Number(c.modelCBackedAudits || 0) === Number(c.canonicalResolved || 0);
    out.gates.auditPlanningProjectionRetained = Number(c.sheetExplicitBoth || 0) + Number(c.sheetBlankBoth || 0) === Number(c.modelCBackedAudits || 0);
  } catch (eProjection) {
    out.errors.push('projectionInvariant: ' + String(eProjection && eProjection.message ? eProjection.message : eProjection));
  }

  Object.keys(out.gates).forEach(function(k) {
    if (out.gates[k] !== true) out.errors.push('Gate failed: ' + k);
  });

  out.success = out.errors.length === 0;
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.success) throw new Error('Model C final closure acceptance failed: ' + out.errors.join('; '));
  return out;
}
