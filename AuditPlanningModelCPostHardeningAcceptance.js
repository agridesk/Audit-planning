/**
 * AMS-01.6 Model C post-hardening acceptance.
 * Read-only consolidation after generic scope-dependency hardening.
 */
var MODEL_C_POST_HARDENING_ACCEPTANCE_BUILD = '2026-09-22_AMS_01_6_MODEL_C_POST_HARDENING_ACCEPTANCE_R1';

function RUN_MODEL_C_POST_HARDENING_ACCEPTANCE() {
  var out = {
    success:false,
    build:MODEL_C_POST_HARDENING_ACCEPTANCE_BUILD,
    readOnly:true,
    writesPerformed:false,
    gates:{},
    components:{},
    errors:[]
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

  out.gates.releaseAcceptance = run_.call(this, 'releaseAcceptance', 'RUN_MODEL_C_RELEASE_ACCEPTANCE');
  out.gates.genericDependencyOwner = run_.call(this, 'genericDependencyOwner', 'RUN_MODEL_C_SCOPE_DEPENDENCY_GENERIC_OWNER_ACCEPTANCE');
  out.gates.multiChildDependency = run_.call(this, 'multiChildDependency', 'RUN_MODEL_C_MULTI_CHILD_DEPENDENCY_ACCEPTANCE');

  try {
    var src = typeof _mp_getCurrentCycleYearFromAuditRow_ === 'function'
      ? String(_mp_getCurrentCycleYearFromAuditRow_)
      : '';
    out.gates.toolkitCycleOwnerUsesModelC = src.indexOf('ModelCToolkitCycle_yearForAudit_') >= 0;
    out.gates.toolkitCycleOwnerHasNoLegacyExpiryFallback =
      src.indexOf('Date - Will Expire') < 0 &&
      src.indexOf('Will expire date') < 0 &&
      src.indexOf('Expiry date') < 0;
    if (!out.gates.toolkitCycleOwnerUsesModelC) out.errors.push('Toolkit cycle owner does not route through Model C');
    if (!out.gates.toolkitCycleOwnerHasNoLegacyExpiryFallback) out.errors.push('Toolkit cycle owner still exposes legacy expiry fallback');
  } catch (eCycle) {
    out.gates.toolkitCycleOwnerUsesModelC = false;
    out.gates.toolkitCycleOwnerHasNoLegacyExpiryFallback = false;
    out.errors.push('toolkitCycleOwner: ' + String(eCycle && eCycle.message ? eCycle.message : eCycle));
  }

  try {
    var deps = ModelCScopeDependency_activeRows_(SpreadsheetApp.getActive());
    var gapChildren = deps.filter(function(x){ return x.parent === 'MPS-GAP'; });
    var grasp = gapChildren.filter(function(x){ return x.child === 'GRASP'; });
    var sq = gapChildren.filter(function(x){ return x.child === 'MPS-SQ'; });
    out.gates.liveDependencyConfigClean = gapChildren.length === 1 && grasp.length === 1 && sq.length === 0;
    if (!out.gates.liveDependencyConfigClean) out.errors.push('Live MPS-GAP dependency config is not in canonical single-GRASP state');
  } catch (eDep) {
    out.gates.liveDependencyConfigClean = false;
    out.errors.push('dependencyConfig: ' + String(eDep && eDep.message ? eDep.message : eDep));
  }

  out.success = out.errors.length === 0 && Object.keys(out.gates).every(function(k){ return out.gates[k] === true; });
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.success) throw new Error('Model C post-hardening acceptance failed: ' + out.errors.join('; '));
  return out;
}
