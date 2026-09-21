/**
 * AMS-01.6 generic scope dependency owner override.
 *
 * Purpose:
 * - Config_Scope_Dependencies is canonical for parent/child scope relationships.
 * - Supports any number of active children per parent.
 * - Share_Expiry=YES makes the child inherit the selected parent's expiry/birthday.
 * - Must_Audit_Together=YES requires the selected child to have its parent selected.
 * - Removes runtime dependence on former hardcoded MPS-GAP -> GRASP logic.
 * - Test helpers accept synthetic dependency rows, so regression tests never need
 *   temporary production-like config rows.
 */
var MODEL_C_SCOPE_DEPENDENCY_GENERIC_BUILD = '2026-09-21_AMS_01_6_SCOPE_DEPENDENCY_GENERIC_R2_SYNTHETIC_TESTABLE';

function ModelCScopeDependency_activeRows_(ss) {
  ss = ss || SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Config_Scope_Dependencies');
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var hdr = (values[0] || []).map(function(v){ return String(v || '').trim(); });
  function idx_(name){ return hdr.indexOf(name); }

  var cId = idx_('Dependency_ID');
  var cParent = idx_('Parent_ScopeCode');
  var cChild = idx_('Child_ScopeCode');
  var cRel = idx_('Relationship_Type');
  var cTogether = idx_('Must_Audit_Together');
  var cShare = idx_('Share_Expiry');
  var cActive = idx_('Active');

  if (cParent < 0 || cChild < 0 || cTogether < 0 || cShare < 0 || cActive < 0) {
    throw new Error('Config_Scope_Dependencies headers incomplete');
  }

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var active = String(row[cActive] || '').trim().toUpperCase();
    if (active !== 'YES' && active !== 'TRUE' && active !== '1' && active !== 'X') continue;

    var parent = String(row[cParent] || '').trim();
    var child = String(row[cChild] || '').trim();
    if (!parent || !child) continue;

    out.push({
      dependencyId: cId >= 0 ? String(row[cId] || '').trim() : '',
      parent: parent,
      child: child,
      relationshipType: cRel >= 0 ? String(row[cRel] || '').trim() : '',
      mustAuditTogether: String(row[cTogether] || '').trim().toUpperCase(),
      shareExpiry: String(row[cShare] || '').trim().toUpperCase(),
      active: active
    });
  }
  return out;
}

function ModelCScopeDependency_isYes_(v) {
  var s = String(v || '').trim().toUpperCase();
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'X';
}

function ModelCScopeDependency_applySharedLifecycleWithRows_(selected, deps) {
  selected = selected || {};
  deps = deps || [];
  var maxPasses = Math.max(1, deps.length + 1);

  for (var pass = 0; pass < maxPasses; pass++) {
    var changed = false;
    deps.forEach(function(dep) {
      if (!ModelCScopeDependency_isYes_(dep.shareExpiry)) return;
      var parent = selected[dep.parent];
      var child = selected[dep.child];
      if (!parent || !child) return;
      if (child.recurring !== true || parent.recurring !== true) return;

      var parentExpiry = String(parent.baseExpiry || '').trim();
      var parentBirthday = String(parent.certificateBirthday || '').trim();
      if (parentExpiry && String(child.baseExpiry || '') !== parentExpiry) {
        child.baseExpiry = parentExpiry;
        changed = true;
      }
      if (String(child.certificateBirthday || '') !== parentBirthday) {
        child.certificateBirthday = parentBirthday;
        changed = true;
      }
    });
    if (!changed) break;
  }
  return selected;
}

function ModelCScopeDependency_applySharedLifecycle_(ss, selected) {
  return ModelCScopeDependency_applySharedLifecycleWithRows_(selected, ModelCScopeDependency_activeRows_(ss));
}

function ModelCScopeDependency_validateWithRows_(selected, deps) {
  selected = selected || {};
  deps = deps || [];

  deps.forEach(function(dep) {
    var child = selected[dep.child];
    if (!child) return;

    if (ModelCScopeDependency_isYes_(dep.mustAuditTogether) && !selected[dep.parent]) {
      throw new Error(dep.child + ' requires ' + dep.parent + ' via Config_Scope_Dependencies');
    }

    if (ModelCScopeDependency_isYes_(dep.shareExpiry) && selected[dep.parent] && child.recurring === true && selected[dep.parent].recurring === true) {
      if (String(child.baseExpiry || '') !== String(selected[dep.parent].baseExpiry || '')) {
        throw new Error(dep.child + ' must share expiry with ' + dep.parent);
      }
    }
  });

  Object.keys(selected).forEach(function(code) {
    var x = selected[code] || {};
    if (x.recurring !== true) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.baseExpiry || ''))) throw new Error('Expiry date required for ' + code);
    if (x.certificateBirthday && !/^\d{4}-\d{2}-\d{2}$/.test(String(x.certificateBirthday))) throw new Error('Invalid certificate birthday for ' + code);
  });
}

function ModelCScopeOwner_normalizeSelected_(items) {
  var ss = SpreadsheetApp.getActive();
  var out = {};

  (items || []).forEach(function(raw) {
    raw = raw || {};
    if (!(raw.enabled === true || String(raw.enabled).toLowerCase() === 'true')) return;

    var code = String(raw.scopeCode || raw.scope || '').trim();
    if (!code) return;

    var recurring = ModelCRecurringConfig_isRecurring_(ss, code);
    out[code] = {
      scopeCode: code,
      recurring: recurring,
      formalHours: raw.formalHours === undefined ? raw.customHours : raw.formalHours,
      baseExpiry: recurring ? String(raw.baseExpiry || raw.dateWillExpire || '').trim() : '',
      certificateBirthday: recurring ? String(raw.certificateBirthday || raw.birthdate || '').trim() : '',
      lifecycleType: recurring ? 'CERTIFICATE_RECURRING' : 'NON_RECURRING'
    };
  });

  return ModelCScopeDependency_applySharedLifecycle_(ss, out);
}

function ModelCScopeOwner_validateSelection_(selected) {
  var ss = SpreadsheetApp.getActive();
  ModelCScopeDependency_validateWithRows_(selected || {}, ModelCScopeDependency_activeRows_(ss));
}

function RUN_MODEL_C_SCOPE_DEPENDENCY_GENERIC_OWNER_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActive();
  var liveDeps = ModelCScopeDependency_activeRows_(ss);
  var liveGapChildren = liveDeps.filter(function(x){ return x.parent === 'MPS-GAP'; });
  var liveGrasp = liveGapChildren.filter(function(x){ return x.child === 'GRASP'; });
  var liveSq = liveGapChildren.filter(function(x){ return x.child === 'MPS-SQ'; });

  var syntheticDeps = [
    {dependencyId:'TEST_DEP_GAP_GRASP', parent:'MPS-GAP', child:'GRASP', relationshipType:'ADD_ON', mustAuditTogether:'YES', shareExpiry:'YES', active:'YES'},
    {dependencyId:'TEST_DEP_GAP_SQ', parent:'MPS-GAP', child:'MPS-SQ', relationshipType:'ADD_ON', mustAuditTogether:'YES', shareExpiry:'YES', active:'YES'}
  ];
  var syntheticSelected = {
    'MPS-GAP': {scopeCode:'MPS-GAP', recurring:true, formalHours:4, baseExpiry:'2027-03-31', certificateBirthday:'2026-03-31'},
    'GRASP': {scopeCode:'GRASP', recurring:true, formalHours:2, baseExpiry:'2027-08-15', certificateBirthday:'2026-08-15'},
    'MPS-SQ': {scopeCode:'MPS-SQ', recurring:true, formalHours:3, baseExpiry:'2027-11-20', certificateBirthday:'2026-11-20'}
  };

  var normalized = ModelCScopeDependency_applySharedLifecycleWithRows_(syntheticSelected, syntheticDeps);
  var errors = [];
  try { ModelCScopeDependency_validateWithRows_(normalized, syntheticDeps); } catch(e) { errors.push(String(e && e.message ? e.message : e)); }

  var missingParentBlocked = false;
  try {
    ModelCScopeDependency_validateWithRows_({
      'GRASP': {scopeCode:'GRASP', recurring:true, baseExpiry:'2027-03-31', certificateBirthday:'2026-03-31'}
    }, syntheticDeps);
  } catch(expected) {
    missingParentBlocked = String(expected && expected.message ? expected.message : expected).indexOf('requires MPS-GAP') >= 0;
  }

  var gapExpiry = normalized['MPS-GAP'] ? normalized['MPS-GAP'].baseExpiry : '';
  var graspExpiry = normalized.GRASP ? normalized.GRASP.baseExpiry : '';
  var sqExpiry = normalized['MPS-SQ'] ? normalized['MPS-SQ'].baseExpiry : '';
  var gates = {
    liveGraspDependencyPresent: liveGrasp.length === 1,
    temporaryMpsSqDependencyRemoved: liveSq.length === 0,
    syntheticTwoChildrenSupported: graspExpiry === gapExpiry && sqExpiry === gapExpiry,
    syntheticMustAuditTogetherEnforced: missingParentBlocked,
    readOnly: true
  };
  Object.keys(gates).forEach(function(k){ if (gates[k] !== true) errors.push('Gate failed: ' + k); });

  var out = {
    success: errors.length === 0,
    build: MODEL_C_SCOPE_DEPENDENCY_GENERIC_BUILD,
    readOnly: true,
    writesPerformed: false,
    counts: { liveGapChildren: liveGapChildren.length, syntheticGapChildren: syntheticDeps.length },
    gates: gates,
    normalizedExpiries: {'MPS-GAP':gapExpiry,'GRASP':graspExpiry,'MPS-SQ':sqExpiry},
    errors: errors
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
