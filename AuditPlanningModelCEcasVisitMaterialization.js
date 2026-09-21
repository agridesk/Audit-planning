/**
 * AMS-01.6 Model C — ECAS MPS-ABC visit materialization preview.
 *
 * Purpose:
 * - Inspect ECAS MPS-ABC obligations for the explicit batch year.
 * - Never infer the year from ECAS row data.
 * - Determine whether an obligation is already linked, can join exactly one
 *   existing same-company/same-cycle visit, or needs a new visit.
 * - Read-only: no Audit planning or Model C writes.
 */
var MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD = '2026-09-21_AMS_01_6_MODEL_C_ECAS_VISIT_MATERIALIZATION_PREVIEW_R1';

function RUN_MODEL_C_ECAS_VISIT_MATERIALIZATION_PREVIEW() {
  var out = ModelCEcasVisitMaterialization_buildPreview_(SpreadsheetApp.getActive());
  Logger.log(JSON.stringify(ModelCEcasVisitMaterialization_compact_(out), null, 2));
  if (!out.success) throw new Error('ECAS visit materialization preview failed: ' + (out.errors || []).join('; '));
  return out;
}

function ModelCEcasVisitMaterialization_buildPreview_(ss) {
  ss = ss || SpreadsheetApp.getActive();
  var out = {
    success: false,
    build: MODEL_C_ECAS_VISIT_MATERIALIZATION_BUILD,
    readOnly: true,
    writesPerformed: false,
    batchYear: '',
    counts: {
      targetObligations: 0,
      alreadyLinked: 0,
      linkExistingVisit: 0,
      createVisit: 0,
      conflicts: 0
    },
    gates: {},
    errors: [],
    warnings: [],
    actions: []
  };

  var source = ss.getSheetByName('BronBedrijfUrenScopes');
  var apSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
  var obSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
  var lkSheet = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  var companies = ss.getSheetByName('Companies');
  var required = {
    BronBedrijfUrenScopes: source,
    'Audit planning': apSheet,
    Audit_Obligations: obSheet,
    Audit_Visit_Obligations: lkSheet,
    Companies: companies
  };
  Object.keys(required).forEach(function(name) {
    if (!required[name]) out.errors.push('Missing sheet: ' + name);
  });
  out.gates.requiredSheets = out.errors.length === 0;
  if (!out.gates.requiredSheets) return out;

  var year = String(source.getRange('G1').getDisplayValue() || '').trim();
  out.batchYear = year;
  out.gates.explicitBatchYear = /^20\d{2}$/.test(year);
  if (!out.gates.explicitBatchYear) out.errors.push('BronBedrijfUrenScopes!G1 must contain explicit four-digit batch year');

  var cfg = ModelCRecurringConfig_get_(ss, 'MPS-ABC');
  out.gates.abcConfiguredNonRecurring = cfg.recurring === false;
  if (!out.gates.abcConfiguredNonRecurring) out.errors.push('MPS-ABC must be Recurring=NO in Config_Scopes');
  if (out.errors.length) return out;

  var obligations = ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues());
  var links = ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
  var apValues = apSheet.getDataRange().getValues();
  var apHeaders = apValues[0] || [];
  var apMap = ModelCFoundation_headerMap_(apHeaders);
  var ixAudit = ModelCEcasVisitMaterialization_header_(apMap, ['Audit ID']);
  var ixCompanyUid = ModelCEcasVisitMaterialization_header_(apMap, ['Company_UID', 'Company UID']);
  var ixStatus = ModelCEcasVisitMaterialization_header_(apMap, ['Status']);
  if (ixAudit < 0 || ixCompanyUid < 0) {
    out.errors.push('Audit planning missing Audit ID or Company_UID');
    return out;
  }

  var apByAudit = {};
  for (var ar = 1; ar < apValues.length; ar++) {
    var auditId = String(apValues[ar][ixAudit] || '').trim();
    if (!auditId) continue;
    if (apByAudit[auditId]) out.errors.push('Duplicate Audit ID in Audit planning: ' + auditId);
    apByAudit[auditId] = {
      row: ar + 1,
      auditId: auditId,
      companyUid: String(apValues[ar][ixCompanyUid] || '').trim(),
      status: ixStatus >= 0 ? String(apValues[ar][ixStatus] || '').trim() : ''
    };
  }

  var companyNames = ModelCEcasVisitMaterialization_companyNames_(companies, out.errors);
  var obById = {};
  obligations.forEach(function(ob) {
    var id = String(ob.Obligation_ID || '').trim();
    if (!id) return;
    if (obById[id]) out.errors.push('Duplicate Obligation_ID: ' + id);
    obById[id] = ob;
  });

  var activeLinksByOb = {};
  var activeLinksByAudit = {};
  links.forEach(function(link) {
    if (String(link.Link_State || '').trim().toUpperCase() !== 'ACTIVE') return;
    var obligationId = String(link.Obligation_ID || '').trim();
    var auditId = String(link.Audit_ID || '').trim();
    if (!obligationId || !auditId) return;
    if (!activeLinksByOb[obligationId]) activeLinksByOb[obligationId] = [];
    activeLinksByOb[obligationId].push(link);
    if (!activeLinksByAudit[auditId]) activeLinksByAudit[auditId] = [];
    activeLinksByAudit[auditId].push(link);
  });

  Object.keys(activeLinksByOb).forEach(function(obId) {
    if (activeLinksByOb[obId].length > 1) out.errors.push('Obligation has multiple active visit links: ' + obId);
  });

  var candidateAuditsByCompanyCycle = {};
  Object.keys(activeLinksByAudit).forEach(function(auditId) {
    var ap = apByAudit[auditId];
    if (!ap || ModelCEcasVisitMaterialization_terminalVisitStatus_(ap.status)) return;
    var seenKeys = {};
    (activeLinksByAudit[auditId] || []).forEach(function(link) {
      var ob = obById[String(link.Obligation_ID || '')];
      if (!ob || ModelCEcasVisitMaterialization_terminalObligation_(ob)) return;
      var companyUid = String(ob.Company_UID || '').trim();
      var cycleKey = String(ob.Cycle_Key || '').trim();
      if (!companyUid || !cycleKey) return;
      if (ap.companyUid && ap.companyUid !== companyUid) {
        out.errors.push('Audit/company mismatch: ' + auditId + ' / ' + companyUid);
        return;
      }
      var key = companyUid + '|' + cycleKey;
      if (seenKeys[key]) return;
      seenKeys[key] = true;
      if (!candidateAuditsByCompanyCycle[key]) candidateAuditsByCompanyCycle[key] = [];
      candidateAuditsByCompanyCycle[key].push(auditId);
    });
  });

  var targets = obligations.filter(function(ob) {
    return String(ob.ScopeCode || '').trim().toUpperCase() === 'MPS-ABC' &&
      String(ob.Trigger_Source || '').trim().toUpperCase() === 'ECAS' &&
      String(ob.Cycle_Key || '').trim() === year &&
      !ModelCEcasVisitMaterialization_terminalObligation_(ob);
  });
  out.counts.targetObligations = targets.length;

  targets.forEach(function(ob) {
    var obId = String(ob.Obligation_ID || '').trim();
    var companyUid = String(ob.Company_UID || '').trim();
    var action = {
      obligationId: obId,
      companyUid: companyUid,
      company: companyNames[companyUid] || '',
      cycleKey: String(ob.Cycle_Key || ''),
      formalHours: ModelCEcasVisitMaterialization_number_(ob.Formal_Hours),
      action: '',
      auditId: '',
      candidates: []
    };

    var ownLinks = activeLinksByOb[obId] || [];
    if (ownLinks.length === 1) {
      var ownAuditId = String(ownLinks[0].Audit_ID || '').trim();
      var ownAp = apByAudit[ownAuditId];
      if (!ownAp) {
        action.action = 'CONFLICT';
        action.auditId = ownAuditId;
        action.reason = 'ACTIVE_LINK_WITHOUT_AUDIT_PLANNING_ROW';
        out.counts.conflicts++;
        out.errors.push('Active ECAS link has no Audit planning row: ' + obId + ' -> ' + ownAuditId);
      } else if (ownAp.companyUid && ownAp.companyUid !== companyUid) {
        action.action = 'CONFLICT';
        action.auditId = ownAuditId;
        action.reason = 'ACTIVE_LINK_COMPANY_MISMATCH';
        out.counts.conflicts++;
        out.errors.push('Active ECAS link company mismatch: ' + obId + ' -> ' + ownAuditId);
      } else {
        action.action = 'ALREADY_LINKED';
        action.auditId = ownAuditId;
        action.visitStatus = ownAp.status;
        out.counts.alreadyLinked++;
      }
      out.actions.push(action);
      return;
    }
    if (ownLinks.length > 1) {
      action.action = 'CONFLICT';
      action.reason = 'MULTIPLE_ACTIVE_LINKS';
      action.candidates = ownLinks.map(function(x) { return String(x.Audit_ID || ''); });
      out.counts.conflicts++;
      out.actions.push(action);
      return;
    }

    var key = companyUid + '|' + year;
    var candidates = (candidateAuditsByCompanyCycle[key] || []).filter(function(id, ix, arr) {
      return arr.indexOf(id) === ix;
    });
    action.candidates = candidates.slice();
    if (candidates.length === 0) {
      action.action = 'CREATE_VISIT';
      action.reason = 'NO_EXISTING_SAME_COMPANY_SAME_CYCLE_VISIT';
      out.counts.createVisit++;
    } else if (candidates.length === 1) {
      action.action = 'LINK_EXISTING_VISIT';
      action.auditId = candidates[0];
      action.visitStatus = apByAudit[candidates[0]] ? apByAudit[candidates[0]].status : '';
      action.reason = 'EXACTLY_ONE_EXISTING_SAME_COMPANY_SAME_CYCLE_VISIT';
      out.counts.linkExistingVisit++;
    } else {
      action.action = 'CONFLICT';
      action.reason = 'MULTIPLE_EXISTING_SAME_COMPANY_SAME_CYCLE_VISITS';
      out.counts.conflicts++;
      out.errors.push('Multiple candidate visits for ECAS obligation ' + obId + ': ' + candidates.join(', '));
    }
    out.actions.push(action);
  });

  out.gates.targetsFound = targets.length > 0;
  out.gates.singleActiveLinkPerObligation = !out.errors.some(function(x) { return x.indexOf('Obligation has multiple active visit links:') === 0; });
  out.gates.noMaterializationConflicts = out.counts.conflicts === 0;
  out.gates.readOnly = true;
  out.success = out.errors.length === 0 && out.gates.targetsFound && out.gates.singleActiveLinkPerObligation && out.gates.noMaterializationConflicts;
  return out;
}

function ModelCEcasVisitMaterialization_companyNames_(sheet, errors) {
  var v = sheet.getDataRange().getValues();
  var h = v[0] || [];
  var m = ModelCFoundation_headerMap_(h);
  var ixUid = ModelCEcasVisitMaterialization_header_(m, ['Company_UID', 'Company UID']);
  var ixName = ModelCEcasVisitMaterialization_header_(m, ['Company', 'Company name', 'Name']);
  if (ixUid < 0 || ixName < 0) {
    errors.push('Companies missing Company_UID or Company');
    return {};
  }
  var out = {};
  for (var r = 1; r < v.length; r++) {
    var uid = String(v[r][ixUid] || '').trim();
    if (!uid) continue;
    out[uid] = String(v[r][ixName] || '').trim();
  }
  return out;
}

function ModelCEcasVisitMaterialization_terminalObligation_(ob) {
  var s = String((ob && ob.Obligation_State) || '').trim().toUpperCase();
  return s === 'COMPLETED' || s === 'CANCELLED' || s === 'REJECTED';
}

function ModelCEcasVisitMaterialization_terminalVisitStatus_(status) {
  var s = String(status || '').trim().toUpperCase().replace(/_/g, ' ');
  return s === 'COMPLETED' || s === 'CANCELLED' || s === 'REJECTED';
}

function ModelCEcasVisitMaterialization_number_(v) {
  var n = Number(String(v === null || v === undefined ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : '';
}

function ModelCEcasVisitMaterialization_header_(map, names) {
  for (var i = 0; i < names.length; i++) {
    var key = ModelCFoundation_normHeader_(names[i]);
    if (map[key] !== undefined) return map[key];
  }
  return -1;
}

function ModelCEcasVisitMaterialization_compact_(out) {
  out = out || {};
  return {
    success: out.success === true,
    build: out.build,
    batchYear: out.batchYear,
    readOnly: out.readOnly === true,
    writesPerformed: out.writesPerformed === true,
    counts: out.counts || {},
    gates: out.gates || {},
    errors: (out.errors || []).slice(0, 25),
    warnings: (out.warnings || []).slice(0, 25),
    actions: (out.actions || []).slice(0, 50)
  };
}
