/**
 * AMS-01.6 Model C — ECAS import foundation/preflight.
 * Read-only. No import/apply yet.
 */
var MODEL_C_ECAS_IMPORT_FOUNDATION_BUILD = '2026-09-20_AMS_01_6_MODEL_C_ECAS_IMPORT_FOUNDATION_R1';

function RUN_MODEL_C_ECAS_IMPORT_PREFLIGHT() {
  var ss = SpreadsheetApp.getActive();
  var out = {
    success: false,
    build: MODEL_C_ECAS_IMPORT_FOUNDATION_BUILD,
    readOnly: true,
    writesPerformed: false,
    gates: {},
    counts: {},
    warnings: [],
    errors: [],
    inputContract: {
      source: 'ECAS annual MPS-ABC import',
      pipeline: ['UPLOAD_OR_STAGING','COLUMN_MAPPING','VALIDATION','PREVIEW','CONTROLLED_APPLY','RECONCILIATION'],
      canonicalWriteTargets: ['Company_Scopes','Audit_Obligations'],
      directAuditPlanningWriteAllowed: false,
      scopeCode: 'MPS-ABC',
      triggerSource: 'ECAS',
      certificateExpiryAllowed: false,
      certificateBirthdayAllowed: false
    }
  };

  var requiredSheets = [
    MODEL_C_SHEETS.CONFIG_SCOPES,
    MODEL_C_SHEETS.COMPANY_SCOPES,
    MODEL_C_SHEETS.AUDIT_OBLIGATIONS,
    MODEL_C_SHEETS.VISIT_OBLIGATIONS
  ];
  requiredSheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) out.errors.push('Missing sheet: ' + name);
  });
  out.gates.requiredSheets = out.errors.length === 0;
  if (!out.gates.requiredSheets) return ModelCEcasImport_log_(out);

  var config = ss.getSheetByName(MODEL_C_SHEETS.CONFIG_SCOPES).getDataRange().getValues();
  var configHeaders = config[0] || [];
  var configMap = ModelCFoundation_headerMap_(configHeaders);
  var abcConfigRows = [];
  for (var r = 1; r < config.length; r++) {
    var code = ModelCFoundation_valueByHeader_(config[r], configMap, ['ScopeCode']);
    if (String(code).trim().toUpperCase() === 'MPS-ABC') abcConfigRows.push(r + 1);
  }
  out.counts.abcConfigRows = abcConfigRows.length;
  out.gates.abcConfiguredExactlyOnce = abcConfigRows.length === 1;
  if (!out.gates.abcConfiguredExactlyOnce) out.errors.push('Config_Scopes must contain exactly one MPS-ABC row; found ' + abcConfigRows.length);

  var csSheet = ss.getSheetByName(MODEL_C_SHEETS.COMPANY_SCOPES);
  var obSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);

  var csValues = csSheet.getDataRange().getValues();
  var obValues = obSheet.getDataRange().getValues();
  var lkValues = lkSheet.getDataRange().getValues();
  var csMap = ModelCFoundation_headerMap_(csValues[0] || []);
  var obMap = ModelCFoundation_headerMap_(obValues[0] || []);
  var lkMap = ModelCFoundation_headerMap_(lkValues[0] || []);

  var abcCompanyScopes = {};
  var activeNaturalKeys = {};
  var duplicateActiveCompanyScopes = [];
  for (var c = 1; c < csValues.length; c++) {
    var csRow = csValues[c];
    var scope = ModelCFoundation_valueByHeader_(csRow, csMap, ['ScopeCode']);
    if (String(scope).trim().toUpperCase() !== 'MPS-ABC') continue;
    var csId = ModelCFoundation_valueByHeader_(csRow, csMap, ['Company_Scope_ID']);
    var companyUid = ModelCFoundation_valueByHeader_(csRow, csMap, ['Company_UID']);
    var active = String(ModelCFoundation_valueByHeader_(csRow, csMap, ['Active'])).trim().toUpperCase();
    abcCompanyScopes[csId] = { companyUid: companyUid, active: active };
    if (active === 'YES') {
      var nk = companyUid + '|MPS-ABC';
      if (activeNaturalKeys[nk]) duplicateActiveCompanyScopes.push(nk);
      activeNaturalKeys[nk] = true;
    }
  }

  var abcObligations = 0;
  var abcOpenObligations = 0;
  var abcWithCertificateDates = [];
  var duplicateObligationKeys = [];
  var obligationNaturalKeys = {};
  var abcObligationIds = {};
  for (var o = 1; o < obValues.length; o++) {
    var obRow = obValues[o];
    var obScope = ModelCFoundation_valueByHeader_(obRow, obMap, ['ScopeCode']);
    if (String(obScope).trim().toUpperCase() !== 'MPS-ABC') continue;
    abcObligations++;
    var obId = ModelCFoundation_valueByHeader_(obRow, obMap, ['Obligation_ID']);
    var csId2 = ModelCFoundation_valueByHeader_(obRow, obMap, ['Company_Scope_ID']);
    var cycleKey = ModelCFoundation_valueByHeader_(obRow, obMap, ['Cycle_Key']);
    var trigger = String(ModelCFoundation_valueByHeader_(obRow, obMap, ['Trigger_Source'])).trim().toUpperCase();
    var state = String(ModelCFoundation_valueByHeader_(obRow, obMap, ['Obligation_State'])).trim().toUpperCase();
    var baseExpiry = ModelCFoundation_valueByHeader_(obRow, obMap, ['Base_Expiry_Date']);
    var effectiveExpiry = ModelCFoundation_valueByHeader_(obRow, obMap, ['Effective_Expiry_Date']);
    abcObligationIds[obId] = true;
    if (!abcCompanyScopes[csId2]) out.errors.push('Orphan MPS-ABC obligation: ' + obId);
    if (state === 'OPEN' || state === 'LINKED_TO_VISIT') abcOpenObligations++;
    if (baseExpiry || effectiveExpiry) abcWithCertificateDates.push(obId);
    var ok = csId2 + '|' + cycleKey + '|' + trigger;
    if (obligationNaturalKeys[ok]) duplicateObligationKeys.push(ok);
    obligationNaturalKeys[ok] = true;
  }

  var abcActiveLinks = 0;
  for (var l = 1; l < lkValues.length; l++) {
    var lkRow = lkValues[l];
    var obligationId = ModelCFoundation_valueByHeader_(lkRow, lkMap, ['Obligation_ID']);
    var state2 = String(ModelCFoundation_valueByHeader_(lkRow, lkMap, ['Link_State'])).trim().toUpperCase();
    if (abcObligationIds[obligationId] && state2 === 'ACTIVE') abcActiveLinks++;
  }

  out.counts.abcCompanyScopes = Object.keys(abcCompanyScopes).length;
  out.counts.abcObligations = abcObligations;
  out.counts.abcOpenObligations = abcOpenObligations;
  out.counts.abcActiveLinks = abcActiveLinks;

  out.gates.noDuplicateActiveCompanyScopes = duplicateActiveCompanyScopes.length === 0;
  out.gates.noDuplicateObligationNaturalKeys = duplicateObligationKeys.length === 0;
  out.gates.noCertificateDatesOnAbcObligations = abcWithCertificateDates.length === 0;
  out.gates.noOrphanAbcObligations = !out.errors.some(function(x){ return x.indexOf('Orphan MPS-ABC obligation:') === 0; });

  if (!out.gates.noDuplicateActiveCompanyScopes) out.errors.push('Duplicate active MPS-ABC Company Scope natural keys: ' + duplicateActiveCompanyScopes.slice(0,10).join(', '));
  if (!out.gates.noDuplicateObligationNaturalKeys) out.errors.push('Duplicate MPS-ABC obligation natural keys: ' + duplicateObligationKeys.slice(0,10).join(', '));
  if (!out.gates.noCertificateDatesOnAbcObligations) out.errors.push('MPS-ABC obligations contain certificate expiry dates: ' + abcWithCertificateDates.slice(0,10).join(', '));

  out.nextRequiredInput = {
    item: 'Representative ECAS export/file',
    reason: 'Needed to lock column mapping and the annual Cycle_Key source before building staging/preview/apply.'
  };

  out.success = Object.keys(out.gates).every(function(k){ return out.gates[k] === true; }) && out.errors.length === 0;
  return ModelCEcasImport_log_(out);
}

function ModelCEcasImport_log_(out) {
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.success) throw new Error('Model C ECAS import preflight failed: ' + (out.errors || []).join('; '));
  return out;
}
