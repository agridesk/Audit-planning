/**
 * AuditPlanningModelCMigration.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_1_R1_DRY_RUN_FIRST
 *
 * Phase 1 migration foundation for Model C.
 *
 * Public runners:
 * - RUN_MODEL_C_PHASE1_DRY_RUN       read-only
 * - RUN_MODEL_C_PHASE1_APPLY         creates/backfills target sheets
 * - RUN_MODEL_C_PHASE1_VALIDATE      read-only validation
 * - RUN_MODEL_C_PHASE1_ROLLBACK_LAST removes only the last migration batch
 *
 * No ownership switch is performed. Audit planning remains canonical.
 */

var MODEL_C_MIGRATION_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_1_R2_DRY_RUN_FIRST';
var MODEL_C_MIGRATION_PROPERTY_LAST_BATCH = 'MODEL_C_PHASE1_LAST_BATCH_ID';

function RUN_MODEL_C_PHASE1_DRY_RUN() {
  var result = ModelCMigration_run({ apply: false });
  Logger.log(JSON.stringify(ModelCMigration_compactResult_(result), null, 2));
  return result;
}

function RUN_MODEL_C_PHASE1_APPLY() {
  var result = ModelCMigration_run({ apply: true });
  Logger.log(JSON.stringify(ModelCMigration_compactResult_(result), null, 2));
  return result;
}

function RUN_MODEL_C_PHASE1_VALIDATE() {
  var result = ModelCMigration_validatePersisted();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_MODEL_C_PHASE1_ROLLBACK_LAST() {
  var batchId = PropertiesService.getScriptProperties().getProperty(MODEL_C_MIGRATION_PROPERTY_LAST_BATCH) || '';
  var result = ModelCMigration_rollbackBatch(batchId);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function ModelCMigration_run(options) {
  options = options || {};
  var apply = options.apply === true;
  var readiness = ModelCFoundation_analyzeMigrationReadiness();
  if (!readiness || readiness.readyForPhase1 !== true) {
    return {
      success: false,
      build: MODEL_C_MIGRATION_BUILD,
      apply: apply,
      writesPerformed: false,
      error: 'PHASE0_NOT_READY',
      blockers: readiness && readiness.blockers ? readiness.blockers : ['Unknown readiness failure']
    };
  }

  var ss = SpreadsheetApp.getActive();
  var source = ModelCMigration_readSource_(ss);
  if (!source.success) return source;
  var existing = ModelCMigration_inspectTargets_(ss);
  var preflight = ModelCMigration_preflightTargets_(existing);
  if (!preflight.success) {
    return {
      success: false,
      build: MODEL_C_MIGRATION_BUILD,
      apply: apply,
      writesPerformed: false,
      error: 'TARGET_PREFLIGHT_FAILED',
      blockers: preflight.blockers,
      targets: existing
    };
  }

  var batchId = ModelCMigration_newBatchId_();
  var prepared = ModelCMigration_prepare_(source, batchId, apply);
  var out = {
    success: prepared.success,
    build: MODEL_C_MIGRATION_BUILD,
    apply: apply,
    writesPerformed: false,
    batchId: batchId,
    sourceCounts: prepared.sourceCounts,
    proposedCounts: prepared.proposedCounts,
    targetState: existing,
    gates: prepared.gates,
    samples: prepared.samples
  };
  if (!prepared.success || !apply) return out;

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var createdSheets = [];
  try {
    var freshReadiness = ModelCFoundation_analyzeMigrationReadiness();
    if (!freshReadiness || freshReadiness.readyForPhase1 !== true) {
      throw new Error('Readiness changed before apply');
    }
    var freshExisting = ModelCMigration_inspectTargets_(ss);
    var freshPreflight = ModelCMigration_preflightTargets_(freshExisting);
    if (!freshPreflight.success) throw new Error('Target state changed before apply: ' + freshPreflight.blockers.join('; '));

    var writeResult = ModelCMigration_writePrepared_(ss, prepared, createdSheets);
    out.writesPerformed = true;
    out.writeResult = writeResult;

    var validation = ModelCMigration_validatePersisted();
    out.validation = validation;
    if (!validation.success) throw new Error('Post-write validation failed: ' + (validation.errors || []).join('; '));

    PropertiesService.getScriptProperties().setProperty(MODEL_C_MIGRATION_PROPERTY_LAST_BATCH, batchId);
    out.success = true;
    return out;
  } catch (e) {
    var rollback = ModelCMigration_rollbackBatchInternal_(ss, batchId, createdSheets);
    out.success = false;
    out.error = String(e && e.message ? e.message : e);
    out.rollback = rollback;
    return out;
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function ModelCMigration_readSource_(ss) {
  var planningSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var configSheet = ss.getSheetByName(MODEL_C_SHEETS.CONFIG_SCOPES);
  if (!planningSheet || !configSheet) {
    return { success: false, build: MODEL_C_MIGRATION_BUILD, writesPerformed: false, error: 'SOURCE_SHEET_MISSING' };
  }
  var planningValues = planningSheet.getDataRange().getValues();
  var configValues = configSheet.getDataRange().getValues();
  return {
    success: true,
    planningHeaders: planningValues[0] || [],
    planningRows: planningValues.slice(1),
    configValues: configValues,
    scopeCatalog: ModelCFoundation_buildScopeCatalog_(configValues)
  };
}

function ModelCMigration_inspectTargets_(ss) {
  var names = [
    MODEL_C_SHEETS.COMPANY_SCOPES,
    MODEL_C_SHEETS.AUDIT_OBLIGATIONS,
    MODEL_C_SHEETS.VISIT_OBLIGATIONS,
    MODEL_C_SHEETS.SCOPE_DEPENDENCIES
  ];
  var out = {};
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var sh = ss.getSheetByName(name);
    out[name] = {
      exists: !!sh,
      rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
      columns: sh ? sh.getLastColumn() : 0,
      schemaValid: sh ? ModelCFoundation_validateHeaders_(name, sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], MODEL_C_SCHEMA[name]).valid : false
    };
  }
  return out;
}

function ModelCMigration_preflightTargets_(targets) {
  var blockers = [];
  Object.keys(targets || {}).forEach(function(name) {
    var target = targets[name];
    if (!target.exists) return;
    if (!target.schemaValid) blockers.push(name + ' exists with invalid schema');
    if (target.rows > 0) blockers.push(name + ' already contains data rows');
  });
  return { success: blockers.length === 0, blockers: blockers };
}

function ModelCMigration_prepare_(source, batchId, generateIds) {
  var headers = source.planningHeaders;
  var rows = source.planningRows;
  var map = ModelCFoundation_headerMap_(headers);
  var companyScopesByKey = {};
  var obligations = [];
  var visitLinks = [];
  var samples = { companyScopes: [], obligations: [], visitLinks: [] };
  var errors = [];
  var stamp = new Date().toISOString();

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var sheetRow = r + 2;
    var companyUid = ModelCFoundation_valueByHeader_(row, map, ['Company_UID']);
    var auditId = ModelCFoundation_valueByHeader_(row, map, ['Audit ID']);
    var selected = ModelCFoundation_selectedScopes_(headers, row, source.scopeCatalog);
    if (!companyUid || !auditId || !selected.length) {
      errors.push('Unmigratable Audit planning row ' + sheetRow);
      continue;
    }

    for (var s = 0; s < selected.length; s++) {
      var scope = selected[s];
      var csNaturalKey = companyUid + '|' + scope.scopeCode;
      var companyScope = companyScopesByKey[csNaturalKey];
      if (!companyScope) {
        companyScope = ModelCMigration_buildCompanyScope_(row, map, scope, companyUid, auditId, batchId, stamp, generateIds);
        companyScopesByKey[csNaturalKey] = companyScope;
        ModelCMigration_addSample_(samples.companyScopes, companyScope);
      }
      var obligation = ModelCMigration_buildObligation_(row, map, scope, companyScope, companyUid, auditId, batchId, stamp, generateIds);
      obligations.push(obligation);
      visitLinks.push({
        Audit_ID: auditId,
        Obligation_ID: obligation.Obligation_ID,
        Link_State: 'ACTIVE',
        Migration_Batch_ID: batchId,
        Linked_At: stamp,
        Unlinked_At: ''
      });
      ModelCMigration_addSample_(samples.obligations, obligation);
      ModelCMigration_addSample_(samples.visitLinks, visitLinks[visitLinks.length - 1]);
    }
  }

  var companyScopes = Object.keys(companyScopesByKey).sort().map(function(key) { return companyScopesByKey[key]; });
  var dependencies = ModelCMigration_prepareDependencies_(source.scopeCatalog, generateIds);
  var gates = ModelCMigration_validatePrepared_(rows, companyScopes, obligations, visitLinks, errors);
  return {
    success: gates.success,
    batchId: batchId,
    companyScopes: companyScopes,
    obligations: obligations,
    visitLinks: visitLinks,
    dependencies: dependencies,
    sourceCounts: { auditPlanningRows: rows.length },
    proposedCounts: {
      companyScopes: companyScopes.length,
      obligations: obligations.length,
      visitLinks: visitLinks.length,
      dependencies: dependencies.length
    },
    gates: gates,
    samples: samples
  };
}

function ModelCMigration_prepareDependencies_(scopeCatalog, generateIds) {
  var byCode = (scopeCatalog && scopeCatalog.byCode) || {};
  if (!byCode['MPS-GAP'] || !byCode['GRASP']) return [];
  return [{
    Dependency_ID: generateIds ? ModelCMigration_newId_('DEP_') : 'PREVIEW_DEP_MPS_GAP_GRASP',
    Parent_ScopeCode: 'MPS-GAP',
    Child_ScopeCode: 'GRASP',
    Relationship_Type: 'ADD_ON',
    Must_Audit_Together: 'YES',
    Share_Expiry: 'YES',
    Active: 'YES'
  }];
}

function ModelCMigration_buildCompanyScope_(row, map, scope, companyUid, auditId, batchId, stamp, generateIds) {
  var isAbc = ModelCFoundation_isAbc_(scope.scopeCode, scope.displayName);
  var recurring = String((scope && scope.recurring) || '').trim().toUpperCase();
  return {
    Company_Scope_ID: generateIds ? ModelCMigration_newId_('CS_') : 'PREVIEW_CS_' + ModelCMigration_safeKey_(companyUid + '_' + scope.scopeCode),
    Company_UID: companyUid,
    ScopeCode: scope.scopeCode,
    Active: 'YES',
    Lifecycle_Type: isAbc ? 'EXTERNAL_ANNUAL' : (recurring === 'YES' || recurring === 'TRUE' || recurring === '1' ? 'CERTIFICATE_RECURRING' : 'CERTIFICATE_NON_RECURRING'),
    Certificate_Birthday: isAbc ? '' : ModelCFoundation_valueByHeader_(row, map, ['Birthdate certificate']),
    Company_Formal_Hours_Override: scope.formalHours,
    Certificate_Metadata_JSON: '',
    Migration_Batch_ID: batchId,
    Source_Audit_ID: auditId,
    Created_At: stamp,
    Updated_At: stamp
  };
}

function ModelCMigration_buildObligation_(row, map, scope, companyScope, companyUid, auditId, batchId, stamp, generateIds) {
  var isAbc = ModelCFoundation_isAbc_(scope.scopeCode, scope.displayName);
  var status = ModelCFoundation_valueByHeader_(row, map, ['Status']) || 'Pending Planning';
  return {
    Obligation_ID: generateIds ? ModelCMigration_newId_('OBL_') : 'PREVIEW_OBL_' + ModelCMigration_safeKey_(auditId + '_' + scope.scopeCode),
    Company_Scope_ID: companyScope.Company_Scope_ID,
    Company_UID: companyUid,
    ScopeCode: scope.scopeCode,
    Cycle_Key: ModelCFoundation_cycleKey_(row, map, scope),
    Trigger_Source: isAbc ? 'ECAS' : 'CERTIFICATE_LIFECYCLE',
    Obligation_State: ModelCMigration_obligationStateFromVisitStatus_(status),
    Base_Expiry_Date: isAbc ? '' : ModelCFoundation_valueByHeader_(row, map, ['Date - Will Expire']),
    Extension_Applied: isAbc ? '' : ModelCFoundation_valueByHeader_(row, map, ['Extension applied']),
    Extension_Metadata_JSON: '',
    Effective_Expiry_Date: isAbc ? '' : ModelCFoundation_valueByHeader_(row, map, ['Extended Expiration Date', 'Date - Will Expire']),
    Planning_Window_From: ModelCFoundation_valueByHeader_(row, map, ['Planning window from']),
    Planning_Window_To: ModelCFoundation_valueByHeader_(row, map, ['Planning window to']),
    Formal_Hours: scope.formalHours,
    Preassigned_Auditor_Email: ModelCFoundation_valueByHeader_(row, map, ['Preassigned Auditor']).toLowerCase(),
    Allow_Self_Planning: ModelCFoundation_valueByHeader_(row, map, ['Allow self planning']),
    Migration_Batch_ID: batchId,
    Source_Audit_ID: auditId,
    Created_At: stamp,
    Updated_At: stamp,
    Closed_At: ''
  };
}

function ModelCMigration_obligationStateFromVisitStatus_(status) {
  var normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'COMPLETED';
  if (normalized === 'REJECTED') return 'REJECTED';
  if (normalized === 'PENDING PLANNING') return 'OPEN';
  return 'LINKED_TO_VISIT';
}

function ModelCMigration_validatePrepared_(sourceRows, companyScopes, obligations, links, errors) {
  errors = (errors || []).slice();
  var csIds = {};
  var obligationIds = {};
  var activeLinkByObligation = {};
  var csNaturalKeys = {};
  var obligationNaturalKeys = {};

  for (var c = 0; c < companyScopes.length; c++) {
    var cs = companyScopes[c];
    if (!cs.Company_Scope_ID || csIds[cs.Company_Scope_ID]) errors.push('Missing/duplicate Company_Scope_ID');
    csIds[cs.Company_Scope_ID] = true;
    var csKey = cs.Company_UID + '|' + cs.ScopeCode;
    if (csNaturalKeys[csKey]) errors.push('Duplicate Company Scope natural key: ' + csKey);
    csNaturalKeys[csKey] = true;
  }
  for (var o = 0; o < obligations.length; o++) {
    var obligation = obligations[o];
    if (!obligation.Obligation_ID || obligationIds[obligation.Obligation_ID]) errors.push('Missing/duplicate Obligation_ID');
    obligationIds[obligation.Obligation_ID] = true;
    if (!csIds[obligation.Company_Scope_ID]) errors.push('Orphan obligation: ' + obligation.Obligation_ID);
    if (ModelCFoundation_isAbc_(obligation.ScopeCode, '') && (obligation.Base_Expiry_Date || obligation.Effective_Expiry_Date)) {
      errors.push('ABC obligation contains certificate expiry: ' + obligation.Obligation_ID);
    }
    var obligationKey = obligation.Company_Scope_ID + '|' + obligation.Cycle_Key + '|' + obligation.Trigger_Source;
    if (obligationNaturalKeys[obligationKey]) errors.push('Duplicate obligation natural key: ' + obligationKey);
    obligationNaturalKeys[obligationKey] = true;
  }
  for (var l = 0; l < links.length; l++) {
    var link = links[l];
    if (!link.Audit_ID || !obligationIds[link.Obligation_ID]) errors.push('Invalid visit-obligation link');
    if (link.Link_State === 'ACTIVE') {
      if (activeLinkByObligation[link.Obligation_ID]) errors.push('Multiple active links for obligation: ' + link.Obligation_ID);
      activeLinkByObligation[link.Obligation_ID] = true;
    }
  }
  if (links.length !== obligations.length) errors.push('Visit-link count does not equal obligation count');
  return {
    success: errors.length === 0,
    errors: errors,
    sourceRows: sourceRows.length,
    companyScopes: companyScopes.length,
    obligations: obligations.length,
    visitLinks: links.length
  };
}

function ModelCMigration_writePrepared_(ss, prepared, createdSheets) {
  var specs = [
    { name: MODEL_C_SHEETS.COMPANY_SCOPES, rows: prepared.companyScopes },
    { name: MODEL_C_SHEETS.AUDIT_OBLIGATIONS, rows: prepared.obligations },
    { name: MODEL_C_SHEETS.VISIT_OBLIGATIONS, rows: prepared.visitLinks },
    { name: MODEL_C_SHEETS.SCOPE_DEPENDENCIES, rows: prepared.dependencies }
  ];
  var counts = {};
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    var sh = ss.getSheetByName(spec.name);
    if (!sh) {
      sh = ss.insertSheet(spec.name);
      createdSheets.push(spec.name);
    }
    var headers = MODEL_C_SCHEMA[spec.name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (spec.rows.length) {
      var values = spec.rows.map(function(item) {
        return headers.map(function(header) { return item[header] === undefined ? '' : item[header]; });
      });
      sh.getRange(2, 1, values.length, headers.length).setValues(values);
    }
    sh.setFrozenRows(1);
    counts[spec.name] = spec.rows.length;
  }
  SpreadsheetApp.flush();
  return { success: true, counts: counts, createdSheets: createdSheets.slice() };
}

function ModelCMigration_validatePersisted() {
  var ss = SpreadsheetApp.getActive();
  var errors = [];
  var counts = {};
  var valuesBySheet = {};
  var names = [MODEL_C_SHEETS.COMPANY_SCOPES, MODEL_C_SHEETS.AUDIT_OBLIGATIONS, MODEL_C_SHEETS.VISIT_OBLIGATIONS, MODEL_C_SHEETS.SCOPE_DEPENDENCIES];
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      errors.push('Missing target sheet: ' + name);
      continue;
    }
    var values = sh.getDataRange().getValues();
    var validation = ModelCFoundation_validateHeaders_(name, values[0] || [], MODEL_C_SCHEMA[name]);
    if (!validation.valid) errors.push('Invalid schema: ' + name);
    valuesBySheet[name] = values;
    counts[name] = Math.max(0, values.length - 1);
  }
  if (!errors.length) {
    var csRows = ModelCMigration_rowsToObjects_(valuesBySheet[MODEL_C_SHEETS.COMPANY_SCOPES]);
    var obligationRows = ModelCMigration_rowsToObjects_(valuesBySheet[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]);
    var linkRows = ModelCMigration_rowsToObjects_(valuesBySheet[MODEL_C_SHEETS.VISIT_OBLIGATIONS]);
    var gates = ModelCMigration_validatePrepared_([], csRows, obligationRows, linkRows, []);
    if (!gates.success) errors = errors.concat(gates.errors);
  }
  return { success: errors.length === 0, build: MODEL_C_MIGRATION_BUILD, readOnly: true, writesPerformed: false, counts: counts, errors: errors };
}

function ModelCMigration_rollbackBatch(batchId) {
  if (!batchId) return { success: false, build: MODEL_C_MIGRATION_BUILD, error: 'MISSING_BATCH_ID', writesPerformed: false };
  var ss = SpreadsheetApp.getActive();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return ModelCMigration_rollbackBatchInternal_(ss, batchId, []);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function ModelCMigration_rollbackBatchInternal_(ss, batchId, createdSheets) {
  var deletedSheets = [];
  var removedRows = {};
  var created = {};
  for (var i = 0; i < (createdSheets || []).length; i++) created[createdSheets[i]] = true;
  var names = [MODEL_C_SHEETS.VISIT_OBLIGATIONS, MODEL_C_SHEETS.AUDIT_OBLIGATIONS, MODEL_C_SHEETS.COMPANY_SCOPES, MODEL_C_SHEETS.SCOPE_DEPENDENCIES];
  for (var n = 0; n < names.length; n++) {
    var name = names[n];
    var sh = ss.getSheetByName(name);
    if (!sh) continue;
    if (created[name]) {
      ss.deleteSheet(sh);
      deletedSheets.push(name);
      continue;
    }
    removedRows[name] = ModelCMigration_removeBatchRows_(sh, batchId);
  }
  try { PropertiesService.getScriptProperties().deleteProperty(MODEL_C_MIGRATION_PROPERTY_LAST_BATCH); } catch (ignoreProp) {}
  return { success: true, build: MODEL_C_MIGRATION_BUILD, batchId: batchId, writesPerformed: true, deletedSheets: deletedSheets, removedRows: removedRows };
}

function ModelCMigration_removeBatchRows_(sheet, batchId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  var headers = values[0];
  var batchCol = ModelCFoundation_findHeader_(headers, ['Migration_Batch_ID']);
  if (batchCol < 0) return 0;
  var keep = [headers];
  var removed = 0;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][batchCol] || '').trim() === batchId) removed++;
    else keep.push(values[r]);
  }
  if (!removed) return 0;
  sheet.clearContents();
  sheet.getRange(1, 1, keep.length, headers.length).setValues(keep);
  return removed;
}

function ModelCMigration_rowsToObjects_(values) {
  values = values || [];
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[String(headers[c])] = values[r][c];
    out.push(obj);
  }
  return out;
}

function ModelCMigration_newBatchId_() {
  return 'MCB_' + new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 14) + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
}

function ModelCMigration_newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '');
}

function ModelCMigration_safeKey_(value) {
  return String(value || '').replace(/[^A-Za-z0-9]+/g, '_').substring(0, 80);
}

function ModelCMigration_addSample_(list, item) {
  if (list.length < 3) list.push(item);
}

function ModelCMigration_compactResult_(result) {
  result = result || {};
  return {
    success: result.success === true,
    build: result.build || MODEL_C_MIGRATION_BUILD,
    apply: result.apply === true,
    writesPerformed: result.writesPerformed === true,
    batchId: result.batchId || '',
    sourceCounts: result.sourceCounts || {},
    proposedCounts: result.proposedCounts || {},
    gates: result.gates || {},
    blockers: result.blockers || [],
    error: result.error || '',
    validation: result.validation || null,
    rollback: result.rollback || null
  };
}
