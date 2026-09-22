/**
 * AMS-01.6 Model C — Audit planning projection drift acceptance.
 * Read-only. Verifies legacy Audit planning AS/AT projection against the
 * canonical Model C planning-window owner without dismantling Audit planning.
 */
var MODEL_C_PROJECTION_DRIFT_BUILD = '2026-09-22_AMS_01_6_MODEL_C_PROJECTION_DRIFT_R1';

function RUN_MODEL_C_PROJECTION_DRIFT_ACCEPTANCE() {
  var ss = SpreadsheetApp.getActive();
  var out = {
    success: false,
    build: MODEL_C_PROJECTION_DRIFT_BUILD,
    readOnly: true,
    writesPerformed: false,
    counts: {
      auditPlanningRows: 0,
      modelCBackedAudits: 0,
      canonicalResolved: 0,
      sheetExplicitBoth: 0,
      sheetBlankBoth: 0,
      sheetPartial: 0,
      exactMatches: 0,
      acceptableBlankNonRecurringFallback: 0,
      mismatches: 0,
      canonicalHardBlocks: 0
    },
    gates: {},
    errors: [],
    mismatches: []
  };

  var ap = ss.getSheetByName('Audit planning');
  var ob = ss.getSheetByName('Audit_Obligations');
  var lk = ss.getSheetByName('Audit_Visit_Obligations');
  if (!ap || !ob || !lk) {
    out.errors.push('Required sheet missing');
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  var apValues = ap.getDataRange().getValues();
  var hdr = apValues[0] || [];
  out.counts.auditPlanningRows = Math.max(0, apValues.length - 1);

  function idx_(names) {
    for (var n = 0; n < names.length; n++) {
      var want = String(names[n] || '').trim().toLowerCase();
      for (var i = 0; i < hdr.length; i++) {
        if (String(hdr[i] || '').trim().toLowerCase() === want) return i;
      }
    }
    return -1;
  }

  function fmt_(v) {
    if (!v) return '';
    try {
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      }
    } catch (e0) {}
    var s = String(v || '').trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  var cAudit = idx_(['Audit ID']);
  var cFrom = idx_(['Planning window from']);
  var cTo = idx_(['Planning window to']);
  if (cAudit < 0) {
    out.errors.push('Audit planning missing Audit ID');
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  var obligations = ModelCMigration_rowsToObjects_(ob.getDataRange().getValues());
  var links = ModelCMigration_rowsToObjects_(lk.getDataRange().getValues());
  var obById = {};
  obligations.forEach(function(x){ obById[String(x.Obligation_ID || '')] = x; });

  var modelAudit = {};
  links.forEach(function(link){
    if (String(link.Link_State || '').toUpperCase() !== 'ACTIVE') return;
    var auditId = String(link.Audit_ID || '').trim();
    var obligation = obById[String(link.Obligation_ID || '')];
    if (!auditId || !obligation) return;
    var state = String(obligation.Obligation_State || '').toUpperCase();
    if (state === 'CANCELLED' || state === 'REJECTED' || state === 'COMPLETED') return;
    modelAudit[auditId] = true;
  });

  for (var r = 1; r < apValues.length; r++) {
    var row = apValues[r] || [];
    var auditId = String(row[cAudit] || '').trim();
    if (!auditId || !modelAudit[auditId]) continue;
    out.counts.modelCBackedAudits++;

    var sheetFrom = cFrom >= 0 ? fmt_(row[cFrom]) : '';
    var sheetTo = cTo >= 0 ? fmt_(row[cTo]) : '';
    if (sheetFrom && sheetTo) out.counts.sheetExplicitBoth++;
    else if (!sheetFrom && !sheetTo) out.counts.sheetBlankBoth++;
    else out.counts.sheetPartial++;

    var canonical = null;
    try {
      canonical = _mp_resolvePlanningWindow_(ss, hdr, row) || null;
    } catch (eCanonical) {
      out.counts.canonicalHardBlocks++;
      out.mismatches.push({auditId:auditId, kind:'CANONICAL_EXCEPTION', message:String(eCanonical && eCanonical.message ? eCanonical.message : eCanonical)});
      continue;
    }

    if (!canonical || canonical.hardBlock === true) {
      out.counts.canonicalHardBlocks++;
      out.mismatches.push({auditId:auditId, kind:'CANONICAL_HARD_BLOCK', canonical:canonical || null});
      continue;
    }

    var canFrom = fmt_(canonical.startDate || canonical.from || canonical.planningWindowFrom || '');
    var canTo = fmt_(canonical.endDate || canonical.to || canonical.planningWindowTo || '');
    if (canFrom && canTo) out.counts.canonicalResolved++;

    if (sheetFrom === canFrom && sheetTo === canTo) {
      out.counts.exactMatches++;
      continue;
    }

    if (!sheetFrom && !sheetTo && canFrom && canTo) {
      var linked = links.filter(function(link){ return String(link.Audit_ID || '') === auditId && String(link.Link_State || '').toUpperCase() === 'ACTIVE'; });
      var hasRecurring = false;
      linked.forEach(function(link){
        var x = obById[String(link.Obligation_ID || '')];
        if (!x) return;
        var code = String(x.ScopeCode || '').trim();
        try { if (ModelCRecurringConfig_isRecurring_(ss, code) === true) hasRecurring = true; } catch(eRec) {}
      });
      if (!hasRecurring) {
        out.counts.acceptableBlankNonRecurringFallback++;
        continue;
      }
    }

    out.counts.mismatches++;
    if (out.mismatches.length < 50) {
      out.mismatches.push({auditId:auditId, sheetFrom:sheetFrom, sheetTo:sheetTo, canonicalFrom:canFrom, canonicalTo:canTo, canonicalSource:String(canonical.source || canonical.mode || '')});
    }
  }

  out.gates.noPartialSheetWindows = out.counts.sheetPartial === 0;
  out.gates.noCanonicalHardBlocks = out.counts.canonicalHardBlocks === 0;
  out.gates.noMaterialProjectionMismatches = out.counts.mismatches === 0;
  out.gates.readOnly = true;

  Object.keys(out.gates).forEach(function(k){ if (out.gates[k] !== true) out.errors.push('Gate failed: ' + k); });
  out.success = out.errors.length === 0;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
