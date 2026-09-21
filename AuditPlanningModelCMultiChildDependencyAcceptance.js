/**
 * AMS-01.6 Model C multi-child dependency acceptance.
 * Read-only. Uses current Config_Scope_Dependencies data.
 *
 * Expected test setup:
 * - MPS-GAP -> GRASP, Share_Expiry=YES, Must_Audit_Together=YES, Active=YES
 * - MPS-GAP -> MPS-SQ, Share_Expiry=YES, Must_Audit_Together=YES, Active=YES
 */
var MODEL_C_MULTI_CHILD_DEP_ACCEPT_BUILD = '2026-09-21_AMS_01_6_MODEL_C_MULTI_CHILD_DEP_ACCEPT_R1';

function RUN_MODEL_C_MULTI_CHILD_DEPENDENCY_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Config_Scope_Dependencies');
  var errors = [];
  var items = [];
  var rows = [];

  if (!sh) {
    errors.push('Missing Config_Scope_Dependencies');
  } else {
    var values = sh.getDataRange().getValues();
    if (!values.length) errors.push('Config_Scope_Dependencies is empty');
    else {
      var hdr = values[0].map(function(v){ return String(v || '').trim(); });
      function idx_(name){ return hdr.indexOf(name); }
      var cId = idx_('Dependency_ID');
      var cParent = idx_('Parent_ScopeCode');
      var cChild = idx_('Child_ScopeCode');
      var cRel = idx_('Relationship_Type');
      var cTogether = idx_('Must_Audit_Together');
      var cShare = idx_('Share_Expiry');
      var cActive = idx_('Active');
      [cId,cParent,cChild,cRel,cTogether,cShare,cActive].forEach(function(x){ if (x < 0) errors.push('Dependency headers incomplete'); });
      if (!errors.length) {
        for (var r = 1; r < values.length; r++) {
          var row = values[r] || [];
          var parent = String(row[cParent] || '').trim();
          var child = String(row[cChild] || '').trim();
          var active = String(row[cActive] || '').trim().toUpperCase();
          if (parent !== 'MPS-GAP' || active !== 'YES') continue;
          rows.push({
            dependencyId:String(row[cId] || '').trim(),
            parent:parent,
            child:child,
            relationshipType:String(row[cRel] || '').trim(),
            mustAuditTogether:String(row[cTogether] || '').trim().toUpperCase(),
            shareExpiry:String(row[cShare] || '').trim().toUpperCase(),
            active:active
          });
        }
      }
    }
  }

  var byChild = {};
  rows.forEach(function(x){ if (x.child) byChild[x.child] = x; });
  var grasp = byChild.GRASP || null;
  var sq = byChild['MPS-SQ'] || null;

  var synthetic = [
    {enabled:true, scopeCode:'MPS-GAP', formalHours:4, baseExpiry:'2027-03-31', certificateBirthday:'2026-03-31'},
    {enabled:true, scopeCode:'GRASP', formalHours:2, baseExpiry:'2027-08-15', certificateBirthday:'2026-08-15'},
    {enabled:true, scopeCode:'MPS-SQ', formalHours:3, baseExpiry:'2027-11-20', certificateBirthday:'2026-11-20'}
  ];

  var normalized = null;
  try {
    normalized = ModelCScopeOwner_normalizeSelected_(synthetic);
  } catch (e) {
    errors.push('ModelCScopeOwner_normalizeSelected_ failed: ' + String(e && e.message ? e.message : e));
  }

  var gapExpiry = normalized && normalized['MPS-GAP'] ? String(normalized['MPS-GAP'].baseExpiry || '') : '';
  var graspExpiry = normalized && normalized.GRASP ? String(normalized.GRASP.baseExpiry || '') : '';
  var sqExpiry = normalized && normalized['MPS-SQ'] ? String(normalized['MPS-SQ'].baseExpiry || '') : '';

  var gates = {
    configHasTwoActiveChildren: rows.length >= 2,
    graspDependencyPresent: !!grasp,
    mpsSqDependencyPresent: !!sq,
    graspMustAuditTogether: !!(grasp && grasp.mustAuditTogether === 'YES'),
    mpsSqMustAuditTogether: !!(sq && sq.mustAuditTogether === 'YES'),
    graspSharesExpiry: !!(grasp && grasp.shareExpiry === 'YES'),
    mpsSqSharesExpiry: !!(sq && sq.shareExpiry === 'YES'),
    graspRuntimeInheritsParentExpiry: !!gapExpiry && graspExpiry === gapExpiry,
    mpsSqRuntimeInheritsParentExpiry: !!gapExpiry && sqExpiry === gapExpiry,
    readOnly: true
  };

  Object.keys(gates).forEach(function(k){ if (gates[k] !== true) errors.push('Gate failed: ' + k); });

  items.push({
    parent:'MPS-GAP',
    configuredChildren:rows,
    syntheticParentExpiry:'2027-03-31',
    normalizedExpiries:{'MPS-GAP':gapExpiry,'GRASP':graspExpiry,'MPS-SQ':sqExpiry}
  });

  var out = {
    success: errors.length === 0,
    build: MODEL_C_MULTI_CHILD_DEP_ACCEPT_BUILD,
    readOnly: true,
    writesPerformed: false,
    counts: { activeGapChildren: rows.length },
    gates: gates,
    errors: errors,
    items: items
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
