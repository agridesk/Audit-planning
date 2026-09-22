/**
 * AMS-01.6 Model C — Audit planning AS/AT projection drift repair.
 *
 * Purpose:
 * - Keep Audit planning intact as operational/compatibility projection.
 * - Repair only material AS/AT drift where Model C has a valid canonical window.
 * - Leave blank non-recurring AS/AT rows blank when runtime full-year fallback is canonical.
 * - Never mutate Model C lifecycle data.
 *
 * Safety:
 * - PREVIEW is read-only.
 * - APPLY snapshots Audit planning, writes only Planning window from/to cells for
 *   identified material mismatches, flushes, then reruns the drift acceptance.
 * - Any failed post-verification restores the Audit planning snapshot.
 */
var MODEL_C_PROJECTION_DRIFT_REPAIR_BUILD = '2026-09-22_AMS_01_6_MODEL_C_PROJECTION_DRIFT_REPAIR_R1';

function RUN_MODEL_C_PROJECTION_DRIFT_REPAIR_PREVIEW() {
  var out = ModelCProjectionDriftRepair_buildPlan_(SpreadsheetApp.getActive());
  Logger.log(JSON.stringify(ModelCProjectionDriftRepair_compact_(out), null, 2));
  return out;
}

function RUN_MODEL_C_PROJECTION_DRIFT_REPAIR_APPLY() {
  var ss = SpreadsheetApp.getActive();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var snapshot = null;
  try {
    var plan = ModelCProjectionDriftRepair_buildPlan_(ss);
    if (!plan.success) throw new Error('Projection drift repair preflight failed: ' + (plan.errors || []).join('; '));
    if ((plan.counts.partialSheetWindows || 0) > 0) throw new Error('Projection drift repair blocked: partial AS/AT windows exist');
    if ((plan.counts.canonicalHardBlocks || 0) > 0) throw new Error('Projection drift repair blocked: canonical hard blocks exist');

    if (!(plan.actions || []).length) {
      var noop = {
        success: true,
        build: MODEL_C_PROJECTION_DRIFT_REPAIR_BUILD,
        writesPerformed: false,
        repaired: 0,
        postVerify: ModelCProjectionDriftRepair_compact_(plan),
        errors: []
      };
      Logger.log(JSON.stringify(noop, null, 2));
      return noop;
    }

    var sh = ss.getSheetByName('Audit planning');
    if (!sh) throw new Error("Missing sheet 'Audit planning'");
    snapshot = ModelCScopeOwner_snapshotSheet_(sh);

    var values = sh.getDataRange().getValues();
    var hdr = values[0] || [];
    var cAudit = ModelCProjectionDriftRepair_idx_(hdr, ['Audit ID']);
    var cFrom = ModelCProjectionDriftRepair_idx_(hdr, ['Planning window from']);
    var cTo = ModelCProjectionDriftRepair_idx_(hdr, ['Planning window to']);
    if (cAudit < 0 || cFrom < 0 || cTo < 0) throw new Error('Audit planning missing Audit ID / Planning window from / Planning window to');

    var rowByAudit = {};
    for (var r = 1; r < values.length; r++) {
      var id = String(values[r][cAudit] || '').trim();
      if (id) rowByAudit[id] = r + 1;
    }

    var repaired = 0;
    (plan.actions || []).forEach(function(a) {
      var rowNumber = rowByAudit[String(a.auditId || '')];
      if (!rowNumber) throw new Error('Audit planning row disappeared: ' + String(a.auditId || ''));
      sh.getRange(rowNumber, cFrom + 1).setNumberFormat('@').setValue(String(a.canonicalFrom || ''));
      sh.getRange(rowNumber, cTo + 1).setNumberFormat('@').setValue(String(a.canonicalTo || ''));
      repaired++;
    });

    SpreadsheetApp.flush();
    try { if (typeof __mp_resetExecCache_ === 'function') __mp_resetExecCache_(); } catch (ignore0) {}
    try { if (typeof ModelCAnnualCycle_invalidateAuditPlanningCaches_ === 'function') ModelCAnnualCycle_invalidateAuditPlanningCaches_(); } catch (ignore1) {}

    var verify = RUN_MODEL_C_PROJECTION_DRIFT_ACCEPTANCE();
    if (!verify || verify.success !== true || Number(verify.counts && verify.counts.mismatches || 0) !== 0) {
      throw new Error('Projection drift post-verification failed');
    }

    var out = {
      success: true,
      build: MODEL_C_PROJECTION_DRIFT_REPAIR_BUILD,
      writesPerformed: true,
      repaired: repaired,
      postVerify: {
        success: verify.success,
        counts: verify.counts,
        gates: verify.gates,
        errors: verify.errors || []
      },
      errors: []
    };
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  } catch (e) {
    if (snapshot) {
      try { ModelCScopeOwner_restoreSnapshot_(snapshot); SpreadsheetApp.flush(); } catch (ignoreRestore) {}
    }
    throw e;
  } finally {
    try { lock.releaseLock(); } catch (ignoreLock) {}
  }
}

function ModelCProjectionDriftRepair_buildPlan_(ss) {
  ss = ss || SpreadsheetApp.getActive();
  var out = {
    success: false,
    build: MODEL_C_PROJECTION_DRIFT_REPAIR_BUILD,
    readOnly: true,
    writesPerformed: false,
    counts: {
      modelCBackedAudits: 0,
      exactMatches: 0,
      acceptableBlankNonRecurringFallback: 0,
      materialMismatches: 0,
      partialSheetWindows: 0,
      canonicalHardBlocks: 0
    },
    actions: [],
    errors: []
  };

  var ap = ss.getSheetByName('Audit planning');
  var ob = ss.getSheetByName('Audit_Obligations');
  var lk = ss.getSheetByName('Audit_Visit_Obligations');
  if (!ap || !ob || !lk) {
    out.errors.push('Required sheet missing');
    return out;
  }

  var apValues = ap.getDataRange().getValues();
  var hdr = apValues[0] || [];
  var cAudit = ModelCProjectionDriftRepair_idx_(hdr, ['Audit ID']);
  var cFrom = ModelCProjectionDriftRepair_idx_(hdr, ['Planning window from']);
  var cTo = ModelCProjectionDriftRepair_idx_(hdr, ['Planning window to']);
  if (cAudit < 0 || cFrom < 0 || cTo < 0) {
    out.errors.push('Audit planning missing Audit ID / Planning window from / Planning window to');
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

    var sheetFrom = ModelCProjectionDriftRepair_fmt_(ss, row[cFrom]);
    var sheetTo = ModelCProjectionDriftRepair_fmt_(ss, row[cTo]);
    if (!!sheetFrom !== !!sheetTo) {
      out.counts.partialSheetWindows++;
      continue;
    }

    var canonical = null;
    try { canonical = _mp_resolvePlanningWindow_(ss, hdr, row) || null; }
    catch (eCanonical) {
      out.counts.canonicalHardBlocks++;
      continue;
    }
    if (!canonical || canonical.hardBlock === true) {
      out.counts.canonicalHardBlocks++;
      continue;
    }

    var canFrom = ModelCProjectionDriftRepair_fmt_(ss, canonical.startDate || canonical.from || canonical.planningWindowFrom || '');
    var canTo = ModelCProjectionDriftRepair_fmt_(ss, canonical.endDate || canonical.to || canonical.planningWindowTo || '');
    if (!canFrom || !canTo) {
      out.counts.canonicalHardBlocks++;
      continue;
    }

    if (sheetFrom === canFrom && sheetTo === canTo) {
      out.counts.exactMatches++;
      continue;
    }

    if (!sheetFrom && !sheetTo) {
      var linked = links.filter(function(link){
        return String(link.Audit_ID || '') === auditId && String(link.Link_State || '').toUpperCase() === 'ACTIVE';
      });
      var hasRecurring = false;
      linked.forEach(function(link){
        var x = obById[String(link.Obligation_ID || '')];
        if (!x) return;
        var state = String(x.Obligation_State || '').toUpperCase();
        if (state === 'CANCELLED' || state === 'REJECTED' || state === 'COMPLETED') return;
        var code = String(x.ScopeCode || '').trim();
        try { if (ModelCRecurringConfig_isRecurring_(ss, code) === true) hasRecurring = true; } catch (eRec) {}
      });
      if (!hasRecurring) {
        out.counts.acceptableBlankNonRecurringFallback++;
        continue;
      }
    }

    out.counts.materialMismatches++;
    out.actions.push({
      auditId: auditId,
      sheetFrom: sheetFrom,
      sheetTo: sheetTo,
      canonicalFrom: canFrom,
      canonicalTo: canTo,
      canonicalSource: String(canonical.source || canonical.mode || '')
    });
  }

  if (out.counts.partialSheetWindows > 0) out.errors.push('Partial Audit planning AS/AT windows found');
  if (out.counts.canonicalHardBlocks > 0) out.errors.push('Canonical planning-window hard blocks found');
  out.success = out.errors.length === 0;
  return out;
}

function ModelCProjectionDriftRepair_idx_(hdr, names) {
  for (var n = 0; n < (names || []).length; n++) {
    var want = String(names[n] || '').trim().toLowerCase();
    for (var i = 0; i < (hdr || []).length; i++) {
      if (String(hdr[i] || '').trim().toLowerCase() === want) return i;
    }
  }
  return -1;
}

function ModelCProjectionDriftRepair_fmt_(ss, v) {
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

function ModelCProjectionDriftRepair_compact_(out) {
  return {
    success: !!(out && out.success),
    build: out && out.build,
    readOnly: true,
    writesPerformed: false,
    counts: out && out.counts ? out.counts : {},
    actions: out && out.actions ? out.actions.slice(0, 50) : [],
    errors: out && out.errors ? out.errors : []
  };
}
