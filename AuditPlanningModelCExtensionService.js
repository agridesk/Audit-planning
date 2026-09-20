/** Model C Phase 2A: obligation-owned extension and planning-window mutation. */
var MODEL_C_EXTENSION_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_2A_EXTENSION_R1';

function RUN_MODEL_C_PHASE2A_EXTENSION_PREFLIGHT() {
  var ss = SpreadsheetApp.getActive();
  var target = ModelCRecon_readTargets_(ss);
  var errors = (target.errors || []).slice();
  var obligations = (target.rows && target.rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS]) || [];
  var links = (target.rows && target.rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS]) || [];
  var obligationById = {}, activeByObligation = {}, certificateLinks = 0, abcLinks = 0;
  obligations.forEach(function(x) { obligationById[String(x.Obligation_ID)] = x; });
  links.forEach(function(x) {
    if (String(x.Link_State).toUpperCase() !== 'ACTIVE') return;
    var id = String(x.Obligation_ID);
    if (!obligationById[id]) { errors.push('Orphan active link: ' + id); return; }
    if (activeByObligation[id]) errors.push('Duplicate active link: ' + id);
    activeByObligation[id] = true;
    if (String(obligationById[id].Trigger_Source).toUpperCase() === 'ECAS' || ModelCFoundation_isAbc_(obligationById[id].ScopeCode, '')) abcLinks++;
    else certificateLinks++;
  });
  if (typeof AC_applyCentralPlanningWindow_ !== 'function') errors.push('Central planning-window calculator unavailable');
  if (typeof V5_recalculateExtensionAndPlanningWindow_ !== 'function') errors.push('Manager extension route unavailable');
  var out = { success:errors.length === 0, readyForOwnerSwitch:errors.length === 0, build:MODEL_C_EXTENSION_BUILD, readOnly:true, writesPerformed:false, counts:{ obligations:obligations.length, activeLinks:Object.keys(activeByObligation).length, certificateLinks:certificateLinks, abcLinks:abcLinks }, errors:errors.slice(0, 25) };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function ModelCExtension_commit(command) {
  command = ModelCExtension_validateCommand_(command);
  var ss = SpreadsheetApp.getActive();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var before = [];
  try {
    var obSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS);
    var linkSheet = ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
    var apSheet = ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING);
    if (!obSheet || !linkSheet || !apSheet) throw new Error('Model C extension sheets missing');
    var obValues = obSheet.getDataRange().getValues();
    var linkValues = linkSheet.getDataRange().getValues();
    var plan = ModelCExtension_planMutation_(command, ModelCMigration_rowsToObjects_(obValues), ModelCMigration_rowsToObjects_(linkValues));
    if (!plan.success) throw new Error(plan.error);
    var obHeaders = obValues[0];
    var obMap = ModelCFoundation_headerMap_(obHeaders);
    for (var i = 0; i < plan.obligationIds.length; i++) {
      var rowIndex = ModelCExtension_findRow_(obValues, obMap, 'Obligation_ID', plan.obligationIds[i]);
      if (!rowIndex) throw new Error('Obligation disappeared: ' + plan.obligationIds[i]);
      var range = obSheet.getRange(rowIndex, 1, 1, obHeaders.length);
      var oldRow = range.getValues()[0];
      before.push({ range: range, values: [oldRow] });
      var next = oldRow.slice();
      ModelCExtension_set_(next, obMap, 'Extension_Applied', command.extensionApplied);
      ModelCExtension_set_(next, obMap, 'Extension_Metadata_JSON', JSON.stringify(command.metadata));
      ModelCExtension_set_(next, obMap, 'Effective_Expiry_Date', command.effectiveExpiry);
      ModelCExtension_set_(next, obMap, 'Planning_Window_From', command.planningWindowFrom);
      ModelCExtension_set_(next, obMap, 'Planning_Window_To', command.planningWindowTo);
      ModelCExtension_set_(next, obMap, 'Updated_At', new Date().toISOString());
      range.setValues([next]);
    }
    before.push(ModelCExtension_snapshotLegacy_(apSheet, command.auditId));
    ModelCExtension_projectLegacy_(apSheet, command);
    SpreadsheetApp.flush();
    return { success:true, build:MODEL_C_EXTENSION_BUILD, owner:'Audit_Obligations', auditId:command.auditId, obligationsUpdated:plan.obligationIds.length, obligationIds:plan.obligationIds, projectionWritten:true, writesPerformed:true };
  } catch (e) {
    for (var b = before.length - 1; b >= 0; b--) try { before[b].range.setValues(before[b].values); } catch (ignore) {}
    return { success:false, build:MODEL_C_EXTENSION_BUILD, auditId:command.auditId, writesPerformed:before.length > 0, rolledBack:before.length > 0, message:String(e && e.message ? e.message : e) };
  } finally {
    try { lock.releaseLock(); } catch (ignoreLock) {}
  }
}

function ModelCExtension_validateCommand_(command) {
  command = command || {};
  var out = {
    auditId:String(command.auditId || '').trim(),
    extensionApplied:command.extensionApplied ? 'Yes' : '',
    effectiveExpiry:String(command.effectiveExpiry || '').trim(),
    planningWindowFrom:String(command.planningWindowFrom || '').trim(),
    planningWindowTo:String(command.planningWindowTo || '').trim(),
    metadata:command.metadata || {}
  };
  if (!out.auditId) throw new Error('Missing auditId');
  [out.effectiveExpiry, out.planningWindowFrom, out.planningWindowTo].forEach(function(v) { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Invalid ISO date: ' + v); });
  if (out.planningWindowFrom > out.planningWindowTo) throw new Error('Planning window is inverted');
  return out;
}

function ModelCExtension_planMutation_(command, obligations, links) {
  var linked = {};
  (links || []).forEach(function(x) { if (String(x.Audit_ID) === command.auditId && String(x.Link_State).toUpperCase() === 'ACTIVE') linked[String(x.Obligation_ID)] = true; });
  var ids = [];
  (obligations || []).forEach(function(x) {
    if (!linked[String(x.Obligation_ID)]) return;
    if (String(x.Trigger_Source).toUpperCase() === 'ECAS' || ModelCFoundation_isAbc_(x.ScopeCode, '')) return;
    ids.push(String(x.Obligation_ID));
  });
  return ids.length ? { success:true, obligationIds:ids } : { success:false, obligationIds:[], error:'No active certificate obligation linked to Audit ID' };
}

function ModelCExtension_projectLegacy_(sheet, command) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var map = ModelCFoundation_headerMap_(headers);
  var rowIndex = ModelCExtension_findRow_(values, map, 'Audit ID', command.auditId);
  if (!rowIndex) throw new Error('Legacy projection row missing: ' + command.auditId);
  var names = ['Extension applied', 'Extended Expiration Date', 'Planning window from', 'Planning window to'];
  var nextValues = [command.extensionApplied, command.effectiveExpiry, command.planningWindowFrom, command.planningWindowTo];
  for (var i = 0; i < names.length; i++) {
    var col = map[ModelCFoundation_normHeader_(names[i])];
    if (col === undefined) throw new Error('Legacy projection column missing: ' + names[i]);
    var cell = sheet.getRange(rowIndex, col + 1);
    if (i > 0) cell.setNumberFormat('@');
    cell.setValue(nextValues[i]);
  }
  return { success:true, rowIndex:rowIndex };
}

function ModelCExtension_snapshotLegacy_(sheet, auditId) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var map = ModelCFoundation_headerMap_(headers);
  var rowIndex = ModelCExtension_findRow_(values, map, 'Audit ID', auditId);
  if (!rowIndex) throw new Error('Legacy projection row missing: ' + auditId);
  var range = sheet.getRange(rowIndex, 1, 1, headers.length);
  return { range:range, values:range.getValues() };
}

function ModelCExtension_findRow_(values, map, header, wanted) {
  var col = map[ModelCFoundation_normHeader_(header)];
  if (col === undefined) return 0;
  for (var r = 1; r < values.length; r++) if (String(values[r][col] || '').trim() === String(wanted)) return r + 1;
  return 0;
}

function ModelCExtension_set_(row, map, header, value) {
  var col = map[ModelCFoundation_normHeader_(header)];
  if (col === undefined) throw new Error('Obligation column missing: ' + header);
  row[col] = value;
}
