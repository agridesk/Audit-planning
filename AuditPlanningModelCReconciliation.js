/**
 * AuditPlanningModelCReconciliation.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_1_RECONCILIATION_R1
 * Read-only comparison of legacy Audit planning and Model C backfill.
 */

var MODEL_C_RECON_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_1_RECONCILIATION_R1';

function RUN_MODEL_C_PHASE1_RECONCILIATION() {
  var ss = SpreadsheetApp.getActive();
  var source = ModelCMigration_readSource_(ss);
  if (!source.success) throw new Error(source.error || 'Unable to read source');
  var target = ModelCRecon_readTargets_(ss);
  var result = target.success ? ModelCRecon_compare_(source, target) : target;
  Logger.log(JSON.stringify(ModelCRecon_compact_(result), null, 2));
  if (!result.success) throw new Error('Model C reconciliation failed: ' + (result.errors || []).join('; '));
  return result;
}

function ModelCRecon_readTargets_(ss) {
  var names = [MODEL_C_SHEETS.COMPANY_SCOPES, MODEL_C_SHEETS.AUDIT_OBLIGATIONS, MODEL_C_SHEETS.VISIT_OBLIGATIONS, MODEL_C_SHEETS.SCOPE_DEPENDENCIES];
  var out = { success: true, rows: {}, errors: [] };
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (!sheet) {
      out.success = false;
      out.errors.push('Missing target sheet: ' + names[i]);
      continue;
    }
    var values = sheet.getDataRange().getValues();
    var schema = ModelCFoundation_validateHeaders_(names[i], values[0] || [], MODEL_C_SCHEMA[names[i]]);
    if (!schema.valid) {
      out.success = false;
      out.errors.push('Invalid target schema: ' + names[i]);
    }
    out.rows[names[i]] = ModelCMigration_rowsToObjects_(values);
  }
  out.writesPerformed = false;
  out.build = MODEL_C_RECON_BUILD;
  return out;
}

function ModelCRecon_compare_(source, target) {
  var errors = [];
  var expected = ModelCRecon_expected_(source, errors);
  var csRows = target.rows[MODEL_C_SHEETS.COMPANY_SCOPES] || [];
  var obRows = target.rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS] || [];
  var linkRows = target.rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS] || [];
  var depRows = target.rows[MODEL_C_SHEETS.SCOPE_DEPENDENCIES] || [];
  var csById = ModelCRecon_uniqueIndex_(csRows, 'Company_Scope_ID', 'Company Scope ID', errors);
  var csByNatural = ModelCRecon_uniqueComputedIndex_(csRows, function(x) { return x.Company_UID + '|' + x.ScopeCode; }, 'Company Scope natural key', errors);
  var obById = ModelCRecon_uniqueIndex_(obRows, 'Obligation_ID', 'Obligation ID', errors);
  var obByNatural = ModelCRecon_uniqueComputedIndex_(obRows, function(x) { return x.Company_UID + '|' + x.ScopeCode + '|' + x.Cycle_Key + '|' + x.Trigger_Source; }, 'Obligation natural key', errors);
  var activeLinkByObligation = {};
  var linkedAudits = {};

  for (var l = 0; l < linkRows.length; l++) {
    var link = linkRows[l];
    if (!obById[link.Obligation_ID]) errors.push('Orphan link obligation: ' + link.Obligation_ID);
    if (String(link.Link_State).toUpperCase() !== 'ACTIVE') continue;
    if (activeLinkByObligation[link.Obligation_ID]) errors.push('Multiple active links: ' + link.Obligation_ID);
    activeLinkByObligation[link.Obligation_ID] = link;
    linkedAudits[link.Audit_ID] = true;
  }

  Object.keys(expected.companyScopes).forEach(function(key) {
    if (!csByNatural[key]) errors.push('Missing Company Scope: ' + key);
  });
  Object.keys(expected.obligations).forEach(function(key) {
    var wanted = expected.obligations[key];
    var actual = obByNatural[key];
    if (!actual) {
      errors.push('Missing obligation: ' + key);
      return;
    }
    var cs = csById[actual.Company_Scope_ID];
    if (!cs || cs.Company_UID !== actual.Company_UID || cs.ScopeCode !== actual.ScopeCode) errors.push('Company identity mismatch: ' + actual.Obligation_ID);
    if (!ModelCRecon_sameNumber_(wanted.formalHours, actual.Formal_Hours)) errors.push('Formal hours mismatch: ' + key);
    var activeLink = activeLinkByObligation[actual.Obligation_ID];
    if (!activeLink || activeLink.Audit_ID !== wanted.auditId) errors.push('Visit link mismatch: ' + key);
    if (wanted.isAbc && (actual.Base_Expiry_Date || actual.Effective_Expiry_Date || (cs && cs.Certificate_Birthday))) errors.push('ABC certificate lifecycle persisted: ' + key);
  });
  Object.keys(expected.auditIds).forEach(function(auditId) {
    if (!linkedAudits[auditId]) errors.push('Active Audit ID without obligation link: ' + auditId);
  });

  if (csRows.length !== Object.keys(expected.companyScopes).length) errors.push('Company Scope count mismatch');
  if (obRows.length !== Object.keys(expected.obligations).length) errors.push('Obligation count mismatch');
  if (linkRows.length !== Object.keys(expected.obligations).length) errors.push('Visit-link count mismatch');
  var gapGrasp = depRows.filter(function(x) { return x.Parent_ScopeCode === 'MPS-GAP' && x.Child_ScopeCode === 'GRASP' && String(x.Active).toUpperCase() === 'YES'; });
  if (expected.needsGapGraspDependency && (gapGrasp.length !== 1 || String(gapGrasp[0].Must_Audit_Together).toUpperCase() !== 'YES' || String(gapGrasp[0].Share_Expiry).toUpperCase() !== 'YES')) errors.push('GAP/GRASP dependency invalid');

  return {
    success: errors.length === 0,
    build: MODEL_C_RECON_BUILD,
    readOnly: true,
    writesPerformed: false,
    counts: { sourceRows: source.planningRows.length, expectedCompanyScopes: Object.keys(expected.companyScopes).length, expectedObligations: Object.keys(expected.obligations).length, companyScopes: csRows.length, obligations: obRows.length, visitLinks: linkRows.length, dependencies: depRows.length },
    gates: { exactScopeMapping: errors.filter(function(x) { return /Company Scope|obligation/.test(x); }).length === 0, visitLinks: errors.filter(function(x) { return /link|Audit ID/.test(x); }).length === 0, companyIdentity: errors.filter(function(x) { return /identity/.test(x); }).length === 0, formalHours: errors.filter(function(x) { return /Formal hours/.test(x); }).length === 0, abcLifecycle: errors.filter(function(x) { return /ABC certificate/.test(x); }).length === 0, gapGraspDependency: errors.filter(function(x) { return /GAP\/GRASP/.test(x); }).length === 0 },
    errors: errors.slice(0, 25)
  };
}

function ModelCRecon_expected_(source, errors) {
  var headers = source.planningHeaders;
  var map = ModelCFoundation_headerMap_(headers);
  var out = { companyScopes: {}, obligations: {}, auditIds: {}, needsGapGraspDependency: false };
  for (var r = 0; r < source.planningRows.length; r++) {
    var row = source.planningRows[r];
    var companyUid = ModelCFoundation_valueByHeader_(row, map, ['Company_UID']);
    var auditId = ModelCFoundation_valueByHeader_(row, map, ['Audit ID']);
    var scopes = ModelCFoundation_selectedScopes_(headers, row, source.scopeCatalog);
    if (!companyUid || !auditId || !scopes.length) { errors.push('Invalid source row: ' + (r + 2)); continue; }
    out.auditIds[auditId] = true;
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      var isAbc = ModelCFoundation_isAbc_(scope.scopeCode, scope.displayName);
      var trigger = isAbc ? 'ECAS' : 'CERTIFICATE_LIFECYCLE';
      var cycle = ModelCFoundation_cycleKey_(row, map, scope);
      var csKey = companyUid + '|' + scope.scopeCode;
      var obKey = csKey + '|' + cycle + '|' + trigger;
      out.companyScopes[csKey] = true;
      if (out.obligations[obKey]) errors.push('Duplicate expected obligation: ' + obKey);
      out.obligations[obKey] = { auditId: auditId, formalHours: scope.formalHours, isAbc: isAbc };
    }
  }
  out.needsGapGraspDependency = !!(source.scopeCatalog.byCode['MPS-GAP'] && source.scopeCatalog.byCode.GRASP);
  return out;
}

function ModelCRecon_uniqueIndex_(rows, field, label, errors) {
  return ModelCRecon_uniqueComputedIndex_(rows, function(x) { return x[field]; }, label, errors);
}

function ModelCRecon_uniqueComputedIndex_(rows, keyFn, label, errors) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var key = String(keyFn(rows[i]) || '');
    if (!key || out[key]) errors.push('Missing/duplicate ' + label + ': ' + key);
    out[key] = rows[i];
  }
  return out;
}

function ModelCRecon_sameNumber_(left, right) {
  if ((left === '' || left === null) && (right === '' || right === null)) return true;
  return Number(left) === Number(right);
}

function ModelCRecon_compact_(result) {
  return { success: result.success === true, build: result.build || MODEL_C_RECON_BUILD, readOnly: true, writesPerformed: false, counts: result.counts || {}, gates: result.gates || {}, errors: result.errors || [] };
}
