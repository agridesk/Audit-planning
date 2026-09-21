/**
 * ECAS_AnnualValidation.js
 * RETIRED LEGACY COMPATIBILITY SURFACE
 * BUILD: 2026-09-21_AMS_01_6_ECAS_LEGACY_RETIREMENT_R1_MODEL_C_ONLY
 *
 * Model C is the only canonical ECAS owner.
 *
 * Historical implementation removed because it could:
 * - write Audit planning directly;
 * - derive completion from generic company/year log matches;
 * - fabricate MPS-ABC certificate birthdays / yyyy-12-31 semantics;
 * - mutate Companies.Active Audits from annual import reconciliation;
 * - create legacy Audit planning rows outside Company_Scopes /
 *   Audit_Obligations / Audit_Visit_Obligations ownership.
 *
 * Compatibility policy:
 * - legacy read/check entry points route to current Model C read-only checks;
 * - legacy write entry points hard-block with an explicit retirement error;
 * - no legacy helper remains capable of canonical writes.
 */
var ECAS_IMPORT_VALIDATION_BUILD='2026-09-21_AMS_01_6_ECAS_LEGACY_RETIREMENT_R1_MODEL_C_ONLY';
var CHECK_ACTIVE_AUDITS_VERSION=ECAS_IMPORT_VALIDATION_BUILD;

function ECAS_LegacyRetirement_error_(entryPoint){
  throw new Error(
    'RETIRED_LEGACY_ECAS_ENTRY_POINT: '+String(entryPoint||'unknown')+
    '. ECAS annual writes are owned by Model C. Use RUN_MODEL_C_ECAS_IMPORT_PREVIEW / APPLY, '+
    'RUN_MODEL_C_ECAS_VISIT_MATERIALIZATION_PREVIEW / APPLY, and the Model C acceptance runners.'
  );
}

/**
 * Backward-compatible READ-ONLY alias.
 * Historical report-tab generation is intentionally not preserved.
 */
function checkEcasImportDryRun(){
  var ss=SpreadsheetApp.getActive();
  var out=ModelCEcasAnnualImport_buildPlan_(ss);
  var compact=typeof ModelCEcasAnnualImport_compact_==='function'?ModelCEcasAnnualImport_compact_(out):out;
  Logger.log(JSON.stringify({
    success:!!(out&&out.success),
    build:ECAS_IMPORT_VALIDATION_BUILD,
    retiredLegacy:true,
    canonicalOwner:'AuditPlanningModelCEcasAnnualImport.js',
    readOnly:true,
    writesPerformed:false,
    result:compact
  },null,2));
  if(!out||out.success!==true)throw new Error('Canonical Model C ECAS preview failed');
  return out;
}

/** Legacy writer retired: direct Audit planning / Companies mutation prohibited. */
function applyEcasImportCorrections(){
  return ECAS_LegacyRetirement_error_('applyEcasImportCorrections');
}

/** Legacy writer retired: visit creation is owned by Model C materialization. */
function createMissingEcasAuditPlanningRowsFromReport(){
  return ECAS_LegacyRetirement_error_('createMissingEcasAuditPlanningRowsFromReport');
}

/**
 * Backward-compatible READ-ONLY consistency alias.
 * Replaces the former Companies/Audit planning/generic-LRA annual heuristic
 * with the canonical Model C end-to-end acceptance.
 */
function CHECK_ActiveAudits_vs_AuditPlanning(){
  if(typeof RUN_MODEL_C_ECAS_END_TO_END_ACCEPTANCE!=='function'){
    throw new Error('Canonical Model C ECAS end-to-end acceptance is unavailable');
  }
  return RUN_MODEL_C_ECAS_END_TO_END_ACCEPTANCE();
}

function RUN_ECAS_LEGACY_RETIREMENT_ACCEPTANCE(){
  var out={
    success:true,
    build:ECAS_IMPORT_VALIDATION_BUILD,
    readOnly:true,
    writesPerformed:false,
    gates:{
      legacyApplyHardBlocked:true,
      legacyMissingRowCreatorHardBlocked:true,
      legacyDryRunRoutesModelC:typeof ModelCEcasAnnualImport_buildPlan_==='function',
      activeAuditsCheckRoutesModelC:typeof RUN_MODEL_C_ECAS_END_TO_END_ACCEPTANCE==='function',
      noLegacyCertificateBirthdayWriter:true,
      noLegacyDirectAuditPlanningWriter:true,
      noGenericCompanyYearCompletionOwner:true
    },
    errors:[]
  };
  Object.keys(out.gates).forEach(function(k){if(out.gates[k]!==true){out.success=false;out.errors.push(k);}});
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('ECAS legacy retirement acceptance failed: '+out.errors.join(', '));
  return out;
}
