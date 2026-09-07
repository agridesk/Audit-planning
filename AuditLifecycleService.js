/**
 * =========================================================
 * AUDIT LIFECYCLE SERVICE
 * =========================================================
 * Build: 2026-05-01_LIFECYCLE_SIDE_EFFECTS_003_PROTECTED_FIELDS
 *
 * PURPOSE
 * - Central owner for lifecycle side effects after CoreStatusMachine or
 *   domain workflow services have already determined the lifecycle outcome.
 * - Does NOT decide statuses.
 * - Does NOT validate transitions.
 * - Does NOT write Planning JSON, availability, completion history or rejected archive rows.
 *
 * OWNED SIDE EFFECTS
 * - Last manager decision
 * - Last decision timestamp
 * - Status since
 * - lifecycle cache invalidation events
 * - lightweight audit-trail hook passthrough when a compatible hook exists
 *
 * INTERNAL DTO CONTRACT
 * Lifecycle_onStatusChanged_({
 *   auditId: string,
 *   action: string,
 *   actorRole: 'MANAGER' | 'AUDITOR' | 'SYSTEM',
 *   actorEmail?: string,
 *   beforeStatus?: string,
 *   beforeStatusDisplay?: string,
 *   afterStatus?: string,
 *   afterStatusDisplay?: string,
 *   reason?: string,
 *   source?: string,
 *
 *   // Optional direct Audit planning row target for active-row mutations.
 *   sheet?: GoogleAppsScript.Spreadsheet.Sheet,
 *   rowIndex?: number,             // 1-based sheet row
 *   headers?: string[] | any[],
 *   hdr?: string[] | any[],
 *
 *   // Optional arbitrary payload from the calling route.
 *   payload?: object
 * })
 *
 * RETURN DTO
 * {
 *   success: boolean,
 *   auditId: string,
 *   action: string,
 *   actorRole: string,
 *   statusChanged: boolean,
 *   managerMetadataWritten: boolean,
 *   statusSinceWritten: boolean,
 *   invalidation: object,
 *   auditTrail: object
 * }
 * =========================================================
 */

var AUDIT_LIFECYCLE_SERVICE_BUILD = '2026-05-01_LIFECYCLE_SIDE_EFFECTS_003_PROTECTED_FIELDS';

function Lifecycle_onStatusChanged_(ctx) {
  ctx = ctx || {};

  var auditId = lifecycle_clean_(ctx.auditId);
  var action = lifecycle_normAction_(ctx.action);
  var actorRole = lifecycle_normRole_(ctx.actorRole || ctx.role);
  var beforeStatus = lifecycle_statusDisplay_(ctx.beforeStatusDisplay || ctx.beforeStatus || '');
  var afterStatus = lifecycle_statusDisplay_(ctx.afterStatusDisplay || ctx.afterStatus || '');
  var statusChanged = !!(beforeStatus && afterStatus && beforeStatus !== afterStatus);

  var result = {
    success: true,
    build: AUDIT_LIFECYCLE_SERVICE_BUILD,
    auditId: auditId,
    action: action,
    actorRole: actorRole,
    source: lifecycle_clean_(ctx.source || ''),
    beforeStatus: beforeStatus,
    afterStatus: afterStatus,
    statusChanged: statusChanged,
    managerMetadataWritten: false,
    auditorMetadataWritten: false,
    statusSinceWritten: false,
    invalidation: { success:true, skipped:true },
    auditTrail: { success:true, skipped:true },
    warnings: []
  };

  if (!auditId) {
    result.success = false;
    result.message = 'Lifecycle_onStatusChanged_: missing auditId';
    return result;
  }

  if (!statusChanged) {
    result.invalidation = Lifecycle_invalidateAfterLifecycleChange_(ctx);
    return result;
  }

  var stamp = lifecycle_nowStamp_();

  var stampRes = Lifecycle_stampStatusSince_(ctx, stamp);
  result.statusSinceWritten = !!(stampRes && stampRes.written);
  if (stampRes && stampRes.warning) result.warnings.push(stampRes.warning);

  if (actorRole === 'MANAGER') {
    var mgrRes = Lifecycle_stampManagerDecision_(ctx, stamp);
    result.managerMetadataWritten = !!(mgrRes && mgrRes.written);
    if (mgrRes && mgrRes.warning) result.warnings.push(mgrRes.warning);
  }

  if (actorRole === 'AUDITOR') {
    var audRes = Lifecycle_stampAuditorDecision_(ctx, stamp);
    result.auditorMetadataWritten = !!(audRes && audRes.written);
    if (audRes && audRes.warning) result.warnings.push(audRes.warning);
  }

  result.invalidation = Lifecycle_invalidateAfterLifecycleChange_(ctx);
  result.auditTrail = Lifecycle_emitAuditTrail_(ctx, stamp);

  return result;
}

function Lifecycle_stampManagerDecision_(ctx, stampOpt) {
  ctx = ctx || {};
  var target = lifecycle_resolveSheetTarget_(ctx);
  if (!target.success) return target;

  var stamp = stampOpt || lifecycle_nowStamp_();
  var action = lifecycle_normAction_(ctx.action);
  var afterStatus = lifecycle_statusDisplay_(ctx.afterStatusDisplay || ctx.afterStatus || '');
  var decisionText = lifecycle_managerDecisionText_(action, afterStatus, ctx);

  var comment = lifecycle_clean_(ctx.reason || (ctx.payload && (ctx.payload.reason || ctx.payload.comment || ctx.payload.managerComment)) || '');

  var updates = [];
  lifecycle_addCellUpdate_(updates, target, ['Last manager decision'], decisionText);
  lifecycle_addCellUpdate_(updates, target, ['Last decision timestamp'], stamp);
  lifecycle_addCellUpdate_(updates, target, ['Manager comment (last)'], comment);

  return lifecycle_writeUpdates_(target.sheet, target.rowIndex, updates, 'manager decision metadata');
}

function Lifecycle_stampAuditorDecision_(ctx, stampOpt) {
  ctx = ctx || {};
  var target = lifecycle_resolveSheetTarget_(ctx);
  if (!target.success) return target;

  var stamp = stampOpt || lifecycle_nowStamp_();
  var action = lifecycle_normAction_(ctx.action);
  var comment = lifecycle_clean_(ctx.reason || (ctx.payload && (ctx.payload.reason || ctx.payload.comment)) || '');

  var updates = [];
  lifecycle_addCellUpdate_(updates, target, ['Last auditor decision'], action || 'STATUS_CHANGED');
  lifecycle_addCellUpdate_(updates, target, ['Last auditor decision timestamp'], stamp);
  lifecycle_addCellUpdate_(updates, target, ['Auditor comment (last)'], comment);

  return lifecycle_writeUpdates_(target.sheet, target.rowIndex, updates, 'auditor decision metadata');
}

function Lifecycle_stampStatusSince_(ctx, stampOpt) {
  ctx = ctx || {};
  var target = lifecycle_resolveSheetTarget_(ctx);
  if (!target.success) return target;

  var updates = [];
  lifecycle_addCellUpdate_(updates, target, ['Status since'], stampOpt || lifecycle_nowStamp_());
  return lifecycle_writeUpdates_(target.sheet, target.rowIndex, updates, 'status since metadata');
}

function Lifecycle_invalidateAfterLifecycleChange_(ctx) {
  ctx = ctx || {};
  var auditId = lifecycle_clean_(ctx.auditId);
  var out = {
    success:true,
    auditId:auditId,
    events:[],
    errors:[]
  };

  function run_(name, fn) {
    try {
      fn();
      out.events.push(name);
    } catch (e) {
      out.errors.push(name + ': ' + lifecycle_err_(e));
    }
  }

  run_('__mp_invalidateAuditPlanningPack_', function(){
    if (typeof __mp_invalidateAuditPlanningPack_ === 'function') __mp_invalidateAuditPlanningPack_();
  });

  run_('__mp_invalidatePersistCaches_:Audit planning', function(){
    if (typeof __mp_invalidatePersistCaches_ === 'function') __mp_invalidatePersistCaches_(['Audit planning']);
  });

  if (auditId) {
    run_('_mp_open_cacheInvalidate_', function(){
      if (typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId);
    });

    run_('_mp_aud_cacheInvalidate_', function(){
      if (typeof _mp_aud_cacheInvalidate_ === 'function') _mp_aud_cacheInvalidate_(auditId);
    });
  }

  run_('V5_clearManagerOpenCache_', function(){
    if (typeof V5_clearManagerOpenCache_ === 'function') V5_clearManagerOpenCache_();
  });

  run_('AUDIT_CACHE.removeNamespace(manager)', function(){
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace('manager');
    }
  });

  run_('AUDIT_CACHE.removeNamespace(auditor_grid)', function(){
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace('auditor_grid');
    }
  });

  out.success = out.errors.length === 0;
  return out;
}

function Lifecycle_emitAuditTrail_(ctx, stampOpt) {
  ctx = ctx || {};

  try {
    if (typeof managerV5_appendAuditTrailToNotificationQueue_ !== 'function') {
      return { success:true, skipped:true, reason:'audit trail hook unavailable' };
    }

    var ss = lifecycle_getSpreadsheet_();
    var shNotif = ss.getSheetByName(typeof SHEET_NOTIFICATION_QUEUE !== 'undefined' ? SHEET_NOTIFICATION_QUEUE : 'Notification Queue');
    if (!shNotif) return { success:true, skipped:true, reason:'notification queue missing' };

    managerV5_appendAuditTrailToNotificationQueue_(shNotif, {
      type:'LIFECYCLE_STATUS_CHANGED',
      auditId:lifecycle_clean_(ctx.auditId),
      action:lifecycle_normAction_(ctx.action),
      actorRole:lifecycle_normRole_(ctx.actorRole || ctx.role),
      actorEmail:lifecycle_clean_(ctx.actorEmail || ''),
      beforeStatus:lifecycle_statusDisplay_(ctx.beforeStatusDisplay || ctx.beforeStatus || ''),
      afterStatus:lifecycle_statusDisplay_(ctx.afterStatusDisplay || ctx.afterStatus || ''),
      reason:lifecycle_clean_(ctx.reason || (ctx.payload && ctx.payload.reason) || ''),
      source:lifecycle_clean_(ctx.source || ''),
      timestamp:stampOpt || lifecycle_nowStamp_()
    });

    return { success:true, skipped:false };
  } catch (e) {
    return { success:false, skipped:false, message:lifecycle_err_(e) };
  }
}

function lifecycle_resolveSheetTarget_(ctx) {
  ctx = ctx || {};

  var sheet = ctx.sheet || null;
  var rowIndex = Number(ctx.rowIndex || 0);
  var headers = ctx.headers || ctx.hdr || null;

  if (!sheet || !rowIndex) {
    var auditId = lifecycle_clean_(ctx.auditId);
    if (!auditId) return { success:false, written:false, warning:'No sheet target and no auditId' };

    var ss = lifecycle_getSpreadsheet_();
    sheet = ss.getSheetByName('Audit planning');
    if (!sheet) return { success:false, written:false, warning:"Missing sheet 'Audit planning'" };

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return { success:false, written:false, warning:'Audit planning is empty' };

    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var idCol = lifecycle_findHeaderIndex_(headers, ['Audit ID']);
    if (idCol < 0) return { success:false, written:false, warning:"Missing 'Audit ID' column" };

    var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getDisplayValues();
    for (var i = 0; i < ids.length; i++) {
      if (lifecycle_clean_(ids[i][0]) === auditId) {
        rowIndex = i + 2;
        break;
      }
    }
    if (!rowIndex) return { success:false, written:false, warning:'Audit row not found: ' + auditId };
  }

  if (!headers || !headers.length) {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
  }

  return {
    success:true,
    sheet:sheet,
    rowIndex:rowIndex,
    headers:headers
  };
}

function lifecycle_addCellUpdate_(updates, target, candidates, value) {
  var idx = lifecycle_findHeaderIndex_(target.headers || [], candidates || []);
  if (idx < 0) return false;
  updates.push({ col:idx + 1, value:value });
  return true;
}

function lifecycle_writeUpdates_(sheet, rowIndex, updates, label) {
  updates = updates || [];
  if (!sheet || !rowIndex) return { success:false, written:false, warning:'Missing sheet target for ' + label };
  if (!updates.length) return { success:true, written:false, warning:'No matching columns for ' + label };

  try {
    for (var i = 0; i < updates.length; i++) {
      sheet.getRange(rowIndex, updates[i].col).setValue(updates[i].value);
    }
    return { success:true, written:true, count:updates.length };
  } catch (e) {
    return { success:false, written:false, warning:'Write failed for ' + label + ': ' + lifecycle_err_(e) };
  }
}

function lifecycle_findHeaderIndex_(headers, candidates) {
  headers = headers || [];
  candidates = Array.isArray(candidates) ? candidates : [candidates];

  var exact = {};
  var norm = {};
  for (var i = 0; i < headers.length; i++) {
    var raw = lifecycle_clean_(headers[i]);
    if (!raw) continue;
    exact[raw] = i;
    norm[lifecycle_normHeader_(raw)] = i;
  }

  for (var j = 0; j < candidates.length; j++) {
    var c = lifecycle_clean_(candidates[j]);
    if (!c) continue;
    if (exact.hasOwnProperty(c)) return exact[c];
    var k = lifecycle_normHeader_(c);
    if (norm.hasOwnProperty(k)) return norm[k];
  }
  return -1;
}

function lifecycle_managerDecisionText_(action, afterStatus, ctx) {
  // Governance: AJ "Last manager decision" stores ONLY the manager action label.
  // No transition prose, no target status, no reason/comment concatenation.
  // Reason/comment belongs in dedicated comment/audit-trail fields, not in AJ.
  var a = lifecycle_normAction_(action);
  if (!a) return 'STATUS_CHANGED';

  if (a === 'PLAN') return 'PLAN';
  if (a === 'APPROVE') return 'APPROVE';
  if (a === 'DENY') return 'DENY';
  if (a === 'CANCEL') return 'CANCEL';
  if (a === 'REJECT') return 'REJECT';
  if (a === 'COMPLETE') return 'COMPLETE';
  if (a === 'ACCEPT') return 'ACCEPT';

  return a;
}

function lifecycle_statusDisplay_(v) {
  var raw = lifecycle_clean_(v);
  if (!raw) return '';
  try {
    if (typeof Status_toDisplayStatus_ === 'function') return Status_toDisplayStatus_(raw);
  } catch (e) {}
  return raw;
}

function lifecycle_normAction_(v) {
  return lifecycle_clean_(v).toUpperCase().replace(/[\s\-]+/g, '_');
}

function lifecycle_normRole_(v) {
  return lifecycle_clean_(v).toUpperCase().replace(/[\s\-]+/g, '_');
}

function lifecycle_normHeader_(v) {
  return lifecycle_clean_(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function lifecycle_clean_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function lifecycle_nowStamp_() {
  return Utilities.formatDate(new Date(), lifecycle_getTimezone_(), 'yyyy-MM-dd HH:mm:ss');
}

function lifecycle_getTimezone_() {
  try {
    var ss = lifecycle_getSpreadsheet_();
    if (ss && ss.getSpreadsheetTimeZone) {
      var tz = lifecycle_clean_(ss.getSpreadsheetTimeZone());
      if (tz) return tz;
    }
  } catch (e) {}
  try {
    var stz = lifecycle_clean_(Session.getScriptTimeZone());
    if (stz) return stz;
  } catch (e2) {}
  return 'Europe/Amsterdam';
}

function lifecycle_getSpreadsheet_() {
  try {
    var id = lifecycle_clean_(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID'));
    if (id) return SpreadsheetApp.openById(id);
  } catch (e0) {}
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
}

function lifecycle_err_(e) {
  return String(e && e.message ? e.message : e);
}


/**
 * Snapshot fields that lifecycle actions must never clear or mutate.
 * This service does not decide statuses; it only protects persistence side effects.
 *
 * Protected fields for Cancel/Deny/Reopen-style routes:
 * - Date - Will Expire
 * - Extended Expiration Date
 * - Planning window from
 * - Planning window to
 * - Company_UID
 *
 * Call before a route clears planning allocation fields, then call restore after
 * the route has written status/planning cleanup. Restore only writes if a
 * protected value changed during the route.
 */
function Lifecycle_snapshotProtectedPlanningFields_(ctx) {
  ctx = ctx || {};
  var target = lifecycle_resolveSheetTarget_(ctx);
  if (!target.success) return target;

  var protectedDefs = lifecycle_protectedPlanningFieldDefs_();
  var rowValues = target.sheet.getRange(target.rowIndex, 1, 1, target.headers.length).getValues()[0] || [];
  var fields = [];

  for (var i = 0; i < protectedDefs.length; i++) {
    var def = protectedDefs[i];
    var idx = lifecycle_findHeaderIndex_(target.headers, def.candidates);
    if (idx < 0) continue;
    fields.push({
      key: def.key,
      label: def.label,
      col: idx + 1,
      value: rowValues[idx]
    });
  }

  return {
    success: true,
    build: AUDIT_LIFECYCLE_SERVICE_BUILD,
    auditId: lifecycle_clean_(ctx.auditId || ''),
    sheet: target.sheet,
    rowIndex: target.rowIndex,
    fields: fields,
    count: fields.length
  };
}

function Lifecycle_restoreProtectedPlanningFields_(snapshot, opts) {
  opts = opts || {};
  if (!snapshot || snapshot.success === false) return snapshot || { success:false, message:'Missing protected-field snapshot' };
  if (!snapshot.sheet || !snapshot.rowIndex || !snapshot.fields) return { success:false, message:'Invalid protected-field snapshot' };

  var restored = [];
  var checked = 0;

  for (var i = 0; i < snapshot.fields.length; i++) {
    var f = snapshot.fields[i] || {};
    if (!f.col) continue;
    checked++;
    var current = snapshot.sheet.getRange(snapshot.rowIndex, f.col).getValue();
    if (!lifecycle_valuesEqual_(current, f.value)) {
      snapshot.sheet.getRange(snapshot.rowIndex, f.col).setValue(f.value);
      restored.push({ key:f.key, label:f.label, col:f.col });
    }
  }

  return {
    success: true,
    build: AUDIT_LIFECYCLE_SERVICE_BUILD,
    auditId: lifecycle_clean_(snapshot.auditId || ''),
    checked: checked,
    restored: restored.length,
    restoredFields: restored,
    source: lifecycle_clean_(opts.source || '')
  };
}

function Lifecycle_assertProtectedPlanningFieldsUnchanged_(snapshot, opts) {
  opts = opts || {};
  var restored = Lifecycle_restoreProtectedPlanningFields_(snapshot, opts);
  if (restored && restored.restored > 0 && opts.failOnRestore === true) {
    restored.success = false;
    restored.message = 'Protected planning fields changed and were restored';
  }
  return restored;
}

function lifecycle_protectedPlanningFieldDefs_() {
  return [
    { key:'willExpire', label:'Date - Will Expire', candidates:['Date - Will Expire','Date – Will Expire','Will Expire'] },
    { key:'extendedExpiration', label:'Extended Expiration Date', candidates:['Extended Expiration Date','Extende Expiration Date','Extended Expiry Date','Extended Expiration'] },
    { key:'planningWindowFrom', label:'Planning window from', candidates:['Planning window from','Planning Window From','Plan van'] },
    { key:'planningWindowTo', label:'Planning window to', candidates:['Planning window to','Planning Window To','Plan tot'] },
    { key:'companyUid', label:'Company_UID', candidates:['Company_UID','Company UID','CompanyUid'] }
  ];
}

function lifecycle_valuesEqual_(a, b) {
  if (a === b) return true;
  if (a === null || typeof a === 'undefined') a = '';
  if (b === null || typeof b === 'undefined') b = '';
  if (Object.prototype.toString.call(a) === '[object Date]' && Object.prototype.toString.call(b) === '[object Date]') {
    return a.getTime() === b.getTime();
  }
  return String(a) === String(b);
}

function AuditLifecycleService_Diagnostics() {
  return {
    success:true,
    build:AUDIT_LIFECYCLE_SERVICE_BUILD,
    functions:{
      Lifecycle_onStatusChanged_: typeof Lifecycle_onStatusChanged_ === 'function',
      Lifecycle_stampManagerDecision_: typeof Lifecycle_stampManagerDecision_ === 'function',
      Lifecycle_stampAuditorDecision_: typeof Lifecycle_stampAuditorDecision_ === 'function',
      Lifecycle_stampStatusSince_: typeof Lifecycle_stampStatusSince_ === 'function',
      Lifecycle_invalidateAfterLifecycleChange_: typeof Lifecycle_invalidateAfterLifecycleChange_ === 'function',
      Lifecycle_snapshotProtectedPlanningFields_: typeof Lifecycle_snapshotProtectedPlanningFields_ === 'function',
      Lifecycle_restoreProtectedPlanningFields_: typeof Lifecycle_restoreProtectedPlanningFields_ === 'function'
    },
    dependencies:{
      AUDIT_CACHE: typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE,
      Status_toDisplayStatus_: typeof Status_toDisplayStatus_ === 'function'
    }
  };
}
