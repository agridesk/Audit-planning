/**
 * AuditPlanningModelCFoundation.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_0_R1
 *
 * Read-only architecture foundation for the Model C migration.
 *
 * Boundaries:
 * - Does not create sheets.
 * - Does not write, clear, append or delete cells.
 * - Does not change Audit planning ownership.
 * - Does not change statuses, Availability or cache state.
 * - Produces schema/readiness diagnostics only.
 */

var MODEL_C_FOUNDATION_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_0_R1';

var MODEL_C_SHEETS = Object.freeze({
  AUDIT_PLANNING: 'Audit planning',
  CONFIG_SCOPES: 'Config_Scopes',
  COMPANY_SCOPES: 'Company_Scopes',
  AUDIT_OBLIGATIONS: 'Audit_Obligations',
  VISIT_OBLIGATIONS: 'Audit_Visit_Obligations',
  SCOPE_DEPENDENCIES: 'Config_Scope_Dependencies'
});

var MODEL_C_SCHEMA = Object.freeze({
  Company_Scopes: Object.freeze([
    'Company_Scope_ID',
    'Company_UID',
    'ScopeCode',
    'Active',
    'Lifecycle_Type',
    'Certificate_Birthday',
    'Company_Formal_Hours_Override',
    'Certificate_Metadata_JSON',
    'Migration_Batch_ID',
    'Source_Audit_ID',
    'Created_At',
    'Updated_At'
  ]),
  Audit_Obligations: Object.freeze([
    'Obligation_ID',
    'Company_Scope_ID',
    'Company_UID',
    'ScopeCode',
    'Cycle_Key',
    'Trigger_Source',
    'Obligation_State',
    'Base_Expiry_Date',
    'Extension_Applied',
    'Extension_Metadata_JSON',
    'Effective_Expiry_Date',
    'Planning_Window_From',
    'Planning_Window_To',
    'Formal_Hours',
    'Preassigned_Auditor_Email',
    'Allow_Self_Planning',
    'Migration_Batch_ID',
    'Source_Audit_ID',
    'Created_At',
    'Updated_At',
    'Closed_At'
  ]),
  Audit_Visit_Obligations: Object.freeze([
    'Audit_ID',
    'Obligation_ID',
    'Link_State',
    'Migration_Batch_ID',
    'Linked_At',
    'Unlinked_At'
  ]),
  Config_Scope_Dependencies: Object.freeze([
    'Dependency_ID',
    'Parent_ScopeCode',
    'Child_ScopeCode',
    'Relationship_Type',
    'Must_Audit_Together',
    'Share_Expiry',
    'Active'
  ])
});

var MODEL_C_REQUIRED_AUDIT_PLANNING_HEADERS = Object.freeze([
  'Company',
  'Company_UID',
  'Status',
  'Audit ID',
  'Birthdate certificate',
  'Preassigned Auditor',
  'Date - Will Expire',
  'Extended Expiration Date',
  'Allow self planning',
  'Extension applied',
  'Planning window from',
  'Planning window to'
]);

var MODEL_C_REQUIRED_CONFIG_SCOPE_HEADERS = Object.freeze([
  'SlotKey',
  'ScopeCode',
  'DisplayName',
  'Default_hours',
  'Planning from',
  'Planning to',
  'Extension',
  'Recurring'
]);

function RUN_MODEL_C_PHASE0_READINESS() {
  var result = ModelCFoundation_analyzeMigrationReadiness();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function ModelCFoundation_getContract() {
  return {
    success: true,
    build: MODEL_C_FOUNDATION_BUILD,
    readOnly: true,
    sheets: MODEL_C_SHEETS,
    schema: MODEL_C_SCHEMA,
    identifierPrefixes: {
      companyScope: 'CS_',
      obligation: 'OBL_',
      dependency: 'DEP_',
      auditVisit: 'AUD_ (existing Audit IDs remain unchanged)'
    },
    canonicalRules: {
      availabilityKey: 'Audit ID',
      planningTruth: 'Audit_Visits.Planning_JSON; currently Audit planning.Planning JSON',
      companyScopeNaturalKey: 'Company_UID + ScopeCode',
      obligationNaturalKey: 'Company_Scope_ID + Cycle_Key + Trigger_Source',
      visitObligationNaturalKey: 'Audit_ID + Obligation_ID',
      planningDurationOwner: 'Config_Scopes',
      companyPlanningDurationOverride: false,
      abcCertificateLifecycle: false,
      abcSuccessorOnCompletion: false
    }
  };
}

function ModelCFoundation_analyzeMigrationReadiness() {
  var ss = SpreadsheetApp.getActive();
  var planningSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var configSheet = ss.getSheetByName(MODEL_C_SHEETS.CONFIG_SCOPES);
  var out = {
    success: true,
    build: MODEL_C_FOUNDATION_BUILD,
    readOnly: true,
    writesPerformed: false,
    source: {},
    targetSheets: {},
    counts: {},
    blockers: [],
    warnings: [],
    samples: {
      missingCompanyUid: [],
      missingAuditId: [],
      duplicateAuditId: [],
      unknownScopeSlot: [],
      abcFakeCertificateLifecycle: [],
      emptyWindowIntersection: []
    }
  };

  if (!planningSheet) out.blockers.push('Missing sheet: ' + MODEL_C_SHEETS.AUDIT_PLANNING);
  if (!configSheet) out.blockers.push('Missing sheet: ' + MODEL_C_SHEETS.CONFIG_SCOPES);
  if (out.blockers.length) {
    out.success = false;
    return out;
  }

  var planningValues = planningSheet.getDataRange().getValues();
  var configValues = configSheet.getDataRange().getValues();
  var planningHeaders = planningValues.length ? planningValues[0] : [];
  var configHeaders = configValues.length ? configValues[0] : [];

  out.source.auditPlanning = ModelCFoundation_validateHeaders_(
    MODEL_C_SHEETS.AUDIT_PLANNING,
    planningHeaders,
    MODEL_C_REQUIRED_AUDIT_PLANNING_HEADERS
  );
  out.source.configScopes = ModelCFoundation_validateHeaders_(
    MODEL_C_SHEETS.CONFIG_SCOPES,
    configHeaders,
    MODEL_C_REQUIRED_CONFIG_SCOPE_HEADERS
  );

  if (!out.source.auditPlanning.valid) {
    out.blockers.push('Audit planning missing headers: ' + out.source.auditPlanning.missing.join(', '));
  }
  if (!out.source.configScopes.valid) {
    out.blockers.push('Config_Scopes missing headers: ' + out.source.configScopes.missing.join(', '));
  }

  var targetNames = [
    MODEL_C_SHEETS.COMPANY_SCOPES,
    MODEL_C_SHEETS.AUDIT_OBLIGATIONS,
    MODEL_C_SHEETS.VISIT_OBLIGATIONS,
    MODEL_C_SHEETS.SCOPE_DEPENDENCIES
  ];
  for (var t = 0; t < targetNames.length; t++) {
    var targetName = targetNames[t];
    var targetSheet = ss.getSheetByName(targetName);
    out.targetSheets[targetName] = targetSheet
      ? ModelCFoundation_validateHeaders_(targetName, targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0], MODEL_C_SCHEMA[targetName])
      : { exists: false, valid: false, missing: MODEL_C_SCHEMA[targetName].slice(), extra: [] };
  }

  if (out.blockers.length) {
    out.success = false;
    return out;
  }

  var scopeCatalog = ModelCFoundation_buildScopeCatalog_(configValues);
  var analysis = ModelCFoundation_analyzeRows_(planningHeaders, planningValues.slice(1), scopeCatalog);
  out.counts = analysis.counts;
  out.samples = analysis.samples;
  out.warnings = out.warnings.concat(analysis.warnings);
  out.proposedCompanyScopeNaturalKeys = analysis.companyScopeNaturalKeys;
  out.proposedObligationNaturalKeys = analysis.obligationNaturalKeys;
  out.success = out.blockers.length === 0;
  return out;
}

function ModelCFoundation_validateHeaders_(sheetName, actualHeaders, requiredHeaders) {
  actualHeaders = actualHeaders || [];
  requiredHeaders = requiredHeaders || [];
  var actualByNorm = {};
  var duplicates = [];
  var emptyColumns = [];

  for (var i = 0; i < actualHeaders.length; i++) {
    var raw = ModelCFoundation_clean_(actualHeaders[i]);
    var key = ModelCFoundation_normHeader_(raw);
    if (!key) {
      emptyColumns.push(i + 1);
      continue;
    }
    if (actualByNorm.hasOwnProperty(key)) duplicates.push(raw);
    actualByNorm[key] = i;
  }

  var missing = [];
  for (var r = 0; r < requiredHeaders.length; r++) {
    var required = ModelCFoundation_clean_(requiredHeaders[r]);
    if (!actualByNorm.hasOwnProperty(ModelCFoundation_normHeader_(required))) missing.push(required);
  }

  var requiredByNorm = {};
  for (var q = 0; q < requiredHeaders.length; q++) {
    requiredByNorm[ModelCFoundation_normHeader_(requiredHeaders[q])] = true;
  }
  var extra = [];
  for (var a = 0; a < actualHeaders.length; a++) {
    var actual = ModelCFoundation_clean_(actualHeaders[a]);
    var actualKey = ModelCFoundation_normHeader_(actual);
    if (actualKey && !requiredByNorm[actualKey]) extra.push(actual);
  }

  return {
    sheet: sheetName,
    exists: true,
    valid: missing.length === 0 && duplicates.length === 0,
    missing: missing,
    duplicates: duplicates,
    emptyColumns: emptyColumns,
    extra: extra,
    columnCount: actualHeaders.length
  };
}

function ModelCFoundation_buildScopeCatalog_(configValues) {
  if (!configValues || configValues.length < 2) return { bySlot: {}, byCode: {}, warnings: ['Config_Scopes has no data rows'] };
  var headers = configValues[0];
  var map = ModelCFoundation_headerMap_(headers);
  var bySlot = {};
  var byCode = {};
  var warnings = [];

  for (var r = 1; r < configValues.length; r++) {
    var row = configValues[r];
    var slot = ModelCFoundation_valueByHeader_(row, map, ['SlotKey']);
    var code = ModelCFoundation_valueByHeader_(row, map, ['ScopeCode']);
    var display = ModelCFoundation_valueByHeader_(row, map, ['DisplayName']);
    if (!slot && !code && !display) continue;
    if (!slot || !code) {
      warnings.push('Config_Scopes row ' + (r + 1) + ' missing SlotKey or ScopeCode');
      continue;
    }
    var item = {
      slotKey: slot,
      scopeCode: code,
      displayName: display || code,
      formalHoursDefault: ModelCFoundation_numberOrBlank_(ModelCFoundation_valueByHeaderRaw_(row, map, ['Formal_hours', 'Default_hours'])),
      planningDuration: ModelCFoundation_numberOrBlank_(ModelCFoundation_valueByHeaderRaw_(row, map, ['Planning_duration', 'Scheduling_hours'])),
      recurring: ModelCFoundation_valueByHeader_(row, map, ['Recurring'])
    };
    if (bySlot[slot]) warnings.push('Duplicate Config_Scopes SlotKey: ' + slot);
    if (byCode[code]) warnings.push('Duplicate Config_Scopes ScopeCode: ' + code);
    bySlot[slot] = item;
    byCode[code] = item;
  }
  return { bySlot: bySlot, byCode: byCode, warnings: warnings };
}

function ModelCFoundation_analyzeRows_(headers, rows, scopeCatalog) {
  headers = headers || [];
  rows = rows || [];
  scopeCatalog = scopeCatalog || { bySlot: {}, byCode: {}, warnings: [] };
  var map = ModelCFoundation_headerMap_(headers);
  var samples = {
    missingCompanyUid: [],
    missingAuditId: [],
    duplicateAuditId: [],
    unknownScopeSlot: [],
    abcFakeCertificateLifecycle: [],
    emptyWindowIntersection: []
  };
  var counts = {
    auditPlanningRows: rows.length,
    rowsWithScopes: 0,
    selectedScopeInstances: 0,
    proposedCompanyScopes: 0,
    proposedObligations: 0,
    proposedVisitLinks: 0,
    rowsMissingCompanyUid: 0,
    rowsMissingAuditId: 0,
    duplicateAuditIds: 0,
    abcOnlyRows: 0,
    abcRowsWithFakeCertificateLifecycle: 0
  };
  var seenAuditIds = {};
  var companyScopeKeys = {};
  var obligationKeys = {};
  var warnings = (scopeCatalog.warnings || []).slice();

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var sheetRow = r + 2;
    var companyUid = ModelCFoundation_valueByHeader_(row, map, ['Company_UID']);
    var company = ModelCFoundation_valueByHeader_(row, map, ['Company']);
    var auditId = ModelCFoundation_valueByHeader_(row, map, ['Audit ID']);
    var selected = ModelCFoundation_selectedScopes_(headers, row, scopeCatalog);

    if (!companyUid) {
      counts.rowsMissingCompanyUid++;
      ModelCFoundation_addSample_(samples.missingCompanyUid, { row: sheetRow, company: company, auditId: auditId });
    }
    if (!auditId) {
      counts.rowsMissingAuditId++;
      ModelCFoundation_addSample_(samples.missingAuditId, { row: sheetRow, company: company });
    } else if (seenAuditIds[auditId]) {
      counts.duplicateAuditIds++;
      ModelCFoundation_addSample_(samples.duplicateAuditId, { auditId: auditId, firstRow: seenAuditIds[auditId], duplicateRow: sheetRow });
    } else {
      seenAuditIds[auditId] = sheetRow;
    }

    if (!selected.length) continue;
    counts.rowsWithScopes++;
    counts.selectedScopeInstances += selected.length;

    var abcOnly = selected.length === 1 && ModelCFoundation_isAbc_(selected[0].scopeCode, selected[0].displayName);
    if (abcOnly) {
      counts.abcOnlyRows++;
      var birthday = ModelCFoundation_valueByHeader_(row, map, ['Birthdate certificate']);
      var expiry = ModelCFoundation_valueByHeader_(row, map, ['Date - Will Expire']);
      var effectiveExpiry = ModelCFoundation_valueByHeader_(row, map, ['Extended Expiration Date']);
      if (birthday || expiry || effectiveExpiry) {
        counts.abcRowsWithFakeCertificateLifecycle++;
        ModelCFoundation_addSample_(samples.abcFakeCertificateLifecycle, {
          row: sheetRow,
          company: company,
          auditId: auditId,
          birthday: birthday,
          expiry: expiry,
          effectiveExpiry: effectiveExpiry
        });
      }
    }

    for (var s = 0; s < selected.length; s++) {
      var scope = selected[s];
      if (!scope.known) {
        ModelCFoundation_addSample_(samples.unknownScopeSlot, { row: sheetRow, auditId: auditId, slotKey: scope.slotKey });
      }
      if (!companyUid || !scope.scopeCode) continue;
      var csKey = companyUid + '|' + scope.scopeCode;
      companyScopeKeys[csKey] = true;
      var cycleKey = ModelCFoundation_cycleKey_(row, map, scope);
      var trigger = ModelCFoundation_isAbc_(scope.scopeCode, scope.displayName) ? 'ECAS' : 'CERTIFICATE_LIFECYCLE';
      obligationKeys[csKey + '|' + cycleKey + '|' + trigger] = true;
      if (auditId) counts.proposedVisitLinks++;
    }
  }

  counts.proposedCompanyScopes = Object.keys(companyScopeKeys).length;
  counts.proposedObligations = Object.keys(obligationKeys).length;
  return {
    counts: counts,
    samples: samples,
    warnings: warnings,
    companyScopeNaturalKeys: Object.keys(companyScopeKeys).sort().slice(0, 25),
    obligationNaturalKeys: Object.keys(obligationKeys).sort().slice(0, 25)
  };
}

function ModelCFoundation_selectedScopes_(headers, row, scopeCatalog) {
  var out = [];
  for (var i = 0; i < headers.length; i++) {
    var raw = ModelCFoundation_clean_(headers[i]);
    var match = /^SCOPE_(\d{2})$/i.exec(raw);
    if (!match) continue;
    if (!ModelCFoundation_isSelected_(row[i])) continue;
    var slot = 'SCOPE_' + match[1];
    var catalogItem = scopeCatalog.bySlot[slot] || null;
    var durationHeader = 'Duration ' + slot;
    var durationIndex = ModelCFoundation_findHeader_(headers, [durationHeader]);
    out.push({
      slotKey: slot,
      scopeCode: catalogItem ? catalogItem.scopeCode : slot,
      displayName: catalogItem ? catalogItem.displayName : slot,
      formalHours: durationIndex >= 0 ? ModelCFoundation_numberOrBlank_(row[durationIndex]) : '',
      known: !!catalogItem
    });
  }
  return out;
}

function ModelCFoundation_cycleKey_(row, map, scope) {
  if (ModelCFoundation_isAbc_(scope.scopeCode, scope.displayName)) {
    var windowFrom = ModelCFoundation_valueByHeader_(row, map, ['Planning window from']);
    var yearMatch = /^(\d{4})/.exec(windowFrom);
    if (yearMatch) return yearMatch[1];
    var birthday = ModelCFoundation_valueByHeader_(row, map, ['Birthdate certificate']);
    yearMatch = /^(\d{4})/.exec(birthday);
    return yearMatch ? yearMatch[1] : 'UNRESOLVED_YEAR';
  }
  var baseExpiry = ModelCFoundation_valueByHeader_(row, map, ['Date - Will Expire']);
  return baseExpiry || 'UNRESOLVED_CYCLE';
}

function ModelCFoundation_isAbc_(scopeCode, displayName) {
  var joined = (ModelCFoundation_clean_(scopeCode) + ' ' + ModelCFoundation_clean_(displayName)).toUpperCase();
  return joined.indexOf('MPS-ABC') >= 0 || joined.indexOf('MPS ABC') >= 0;
}

function ModelCFoundation_isSelected_(value) {
  if (value === true || value === 1) return true;
  var s = ModelCFoundation_clean_(value).toUpperCase();
  return s === 'X' || s === 'YES' || s === 'TRUE' || s === '1';
}

function ModelCFoundation_headerMap_(headers) {
  var map = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var key = ModelCFoundation_normHeader_(headers[i]);
    if (key) map[key] = i;
  }
  return map;
}

function ModelCFoundation_findHeader_(headers, candidates) {
  var map = ModelCFoundation_headerMap_(headers);
  for (var i = 0; i < candidates.length; i++) {
    var key = ModelCFoundation_normHeader_(candidates[i]);
    if (map.hasOwnProperty(key)) return map[key];
  }
  return -1;
}

function ModelCFoundation_valueByHeader_(row, map, candidates) {
  return ModelCFoundation_clean_(ModelCFoundation_valueByHeaderRaw_(row, map, candidates));
}

function ModelCFoundation_valueByHeaderRaw_(row, map, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var key = ModelCFoundation_normHeader_(candidates[i]);
    if (map.hasOwnProperty(key)) return row[map[key]];
  }
  return '';
}

function ModelCFoundation_numberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var n = Number(value);
  return isFinite(n) ? n : '';
}

function ModelCFoundation_addSample_(list, item) {
  if (list.length < 10) list.push(item);
}

function ModelCFoundation_clean_(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
  }
  return String(value).trim();
}

function ModelCFoundation_normHeader_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[–—−]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

