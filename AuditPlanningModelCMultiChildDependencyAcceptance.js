/**
 * AMS-01.6 Model C multi-child dependency acceptance.
 * Read-only. Does not require temporary rows in Config_Scope_Dependencies.
 */
var MODEL_C_MULTI_CHILD_DEP_ACCEPT_BUILD = '2026-09-21_AMS_01_6_MODEL_C_MULTI_CHILD_DEP_ACCEPT_R2_SYNTHETIC';

function RUN_MODEL_C_MULTI_CHILD_DEPENDENCY_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActive();
  var errors = [];
  var liveDeps = [];
  try {
    liveDeps = ModelCScopeDependency_activeRows_(ss);
  } catch (eConfig) {
    errors.push('Config read failed: ' + String(eConfig && eConfig.message ? eConfig.message : eConfig));
  }

  var liveGapChildren = liveDeps.filter(function(x){ return x.parent === 'MPS-GAP'; });
  var liveGrasp = liveGapChildren.filter(function(x){ return x.child === 'GRASP'; });
  var liveSq = liveGapChildren.filter(function(x){ return x.child === 'MPS-SQ'; });

  var syntheticDeps = [
    {dependencyId:'TEST_DEP_GAP_GRASP', parent:'MPS-GAP', child:'GRASP', relationshipType:'ADD_ON', mustAuditTogether:'YES', shareExpiry:'YES', active:'YES'},
    {dependencyId:'TEST_DEP_GAP_SQ', parent:'MPS-GAP', child:'MPS-SQ', relationshipType:'ADD_ON', mustAuditTogether:'YES', shareExpiry:'YES', active:'YES'}
  ];
  var selected = {
    'MPS-GAP': {scopeCode:'MPS-GAP', recurring:true, formalHours:4, baseExpiry:'2027-03-31', certificateBirthday:'2026-03-31'},
    'GRASP': {scopeCode:'GRASP', recurring:true, formalHours:2, baseExpiry:'2027-08-15', certificateBirthday:'2026-08-15'},
    'MPS-SQ': {scopeCode:'MPS-SQ', recurring:true, formalHours:3, baseExpiry:'2027-11-20', certificateBirthday:'2026-11-20'}
  };

  var normalized = null;
  try {
    normalized = ModelCScopeDependency_applySharedLifecycleWithRows_(selected, syntheticDeps);
    ModelCScopeDependency_validateWithRows_(normalized, syntheticDeps);
  } catch (eRuntime) {
    errors.push('Synthetic runtime failed: ' + String(eRuntime && eRuntime.message ? eRuntime.message : eRuntime));
  }

  var gapExpiry = normalized && normalized['MPS-GAP'] ? String(normalized['MPS-GAP'].baseExpiry || '') : '';
  var graspExpiry = normalized && normalized.GRASP ? String(normalized.GRASP.baseExpiry || '') : '';
  var sqExpiry = normalized && normalized['MPS-SQ'] ? String(normalized['MPS-SQ'].baseExpiry || '') : '';

  var missingParentBlocked = false;
  try {
    ModelCScopeDependency_validateWithRows_({
      'MPS-SQ': {scopeCode:'MPS-SQ', recurring:true, baseExpiry:'2027-03-31', certificateBirthday:'2026-03-31'}
    }, syntheticDeps);
  } catch (expected) {
    missingParentBlocked = String(expected && expected.message ? expected.message : expected).indexOf('requires MPS-GAP') >= 0;
  }

  var gates = {
    liveGraspDependencyPresent: liveGrasp.length === 1,
    temporaryMpsSqDependencyRemoved: liveSq.length === 0,
    syntheticConfigHasTwoChildren: syntheticDeps.length === 2,
    graspRuntimeInheritsParentExpiry: !!gapExpiry && graspExpiry === gapExpiry,
    mpsSqRuntimeInheritsParentExpiry: !!gapExpiry && sqExpiry === gapExpiry,
    mustAuditTogetherGeneric: missingParentBlocked,
    readOnly: true
  };

  Object.keys(gates).forEach(function(k){ if (gates[k] !== true) errors.push('Gate failed: ' + k); });

  var out = {
    success: errors.length === 0,
    build: MODEL_C_MULTI_CHILD_DEP_ACCEPT_BUILD,
    readOnly: true,
    writesPerformed: false,
    counts: {
      liveGapChildren: liveGapChildren.length,
      syntheticGapChildren: syntheticDeps.length
    },
    gates: gates,
    errors: errors,
    items: [{
      liveGapChildren: liveGapChildren,
      syntheticDependencies: syntheticDeps,
      syntheticParentExpiry: '2027-03-31',
      normalizedExpiries: {'MPS-GAP':gapExpiry,'GRASP':graspExpiry,'MPS-SQ':sqExpiry}
    }]
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
