/**
 * FILE: AvailabilityPlanningReconciler.gs
 * BUILD: 2026-10-04_V211_PLANNING_AVAILABILITY_RECONCILER_R1
 * PURPOSE:
 *   Reconcile legacy Auditor Availability audit slots against canonical
 *   Audit planning.Planning JSON + Assigned to.
 *
 * SAFETY:
 *   - Preview performs no writes.
 *   - Apply only clears stale Manager Planned audit reservations.
 *   - Canonical Planning JSON is never changed.
 *   - User availability / HARD / SOFT rows are not rewritten.
 */

function AvailabilityPlanningReconciler_Preview() {
  return AvailabilityPlanningReconciler_run_(false);
}

function AvailabilityPlanningReconciler_Apply() {
  return AvailabilityPlanningReconciler_run_(true);
}

function AvailabilityPlanningReconciler_run_(apply) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ap = ss.getSheetByName('Audit planning');
  var av = ss.getSheetByName('Auditor Availability');
  if (!ap) throw new Error('AUDIT_PLANNING_SHEET_NOT_FOUND');
  if (!av) throw new Error('AUDITOR_AVAILABILITY_SHEET_NOT_FOUND');

  var apValues = ap.getDataRange().getValues();
  var avValues = av.getDataRange().getValues();
  if (!apValues.length || !avValues.length) throw new Error('PLANNING_RECONCILE_EMPTY_SOURCE');

  var aph = AvailabilityPlanningReconciler_headerMap_(apValues[0]);
  var avh = AvailabilityPlanningReconciler_headerMap_(avValues[0]);

  var apAuditId = AvailabilityPlanningReconciler_col_(aph, ['Audit ID','Audit_ID','AuditId']);
  var apAssigned = AvailabilityPlanningReconciler_col_(aph, ['Assigned to','Assigned To','Assigned auditor','Assigned Auditor']);
  var apPlanning = AvailabilityPlanningReconciler_col_(aph, ['Planning JSON','PlanningJSON','Planning']);
  var apStatus = AvailabilityPlanningReconciler_col_(aph, ['Status']);

  var avDate = AvailabilityPlanningReconciler_col_(avh, ['Date']);
  var avEmail = AvailabilityPlanningReconciler_col_(avh, ['Auditor_Email','Auditor Email','Email','E-mail']);
  var avAvailable = AvailabilityPlanningReconciler_col_(avh, ['Available']);
  var avS1 = AvailabilityPlanningReconciler_col_(avh, ['First_Audit_Start_Time']);
  var avE1 = AvailabilityPlanningReconciler_col_(avh, ['First_Audit_End_Time']);
  var avId1 = AvailabilityPlanningReconciler_col_(avh, ['Audit_ID_1','Audit ID 1']);
  var avS2 = AvailabilityPlanningReconciler_col_(avh, ['Second_Audit_Start_Time']);
  var avE2 = AvailabilityPlanningReconciler_col_(avh, ['Second_Audit_End_Time']);
  var avId2 = AvailabilityPlanningReconciler_col_(avh, ['Audit_ID_2','Audit ID 2']);
  var avSt1 = AvailabilityPlanningReconciler_col_(avh, ['Status_1']);
  var avSt2 = AvailabilityPlanningReconciler_col_(avh, ['Status_2']);
  var avUpdated = AvailabilityPlanningReconciler_col_(avh, ['Last_Updated']);

  if ([apAuditId,apAssigned,apPlanning,avDate,avEmail,avS1,avE1,avId1,avS2,avE2,avId2,avSt1,avSt2].some(function(x){return x<0;})) {
    throw new Error('PLANNING_RECONCILE_SCHEMA_INVALID');
  }

  var canonical = {};
  for (var r = 1; r < apValues.length; r++) {
    var row = apValues[r] || [];
    var auditId = AvailabilityPlanningReconciler_clean_(row[apAuditId]);
    if (!auditId) continue;

    var status = apStatus >= 0 ? AvailabilityPlanningReconciler_clean_(row[apStatus]).toUpperCase().replace(/[\s-]+/g,'_') : '';
    var assigned = AvailabilityPlanningReconciler_clean_(row[apAssigned]).toLowerCase();
    var blocks = [];

    try {
      var parsed = JSON.parse(AvailabilityPlanningReconciler_clean_(row[apPlanning]) || '{}');
      if (parsed && Array.isArray(parsed.blocks)) blocks = parsed.blocks;
    } catch (e) {}

    var keys = {};
    blocks.forEach(function(b) {
      var d = AvailabilityPlanningReconciler_date_(b && b.date);
      var s = AvailabilityPlanningReconciler_clean_(b && b.start);
      var e = AvailabilityPlanningReconciler_clean_(b && b.end);
      if (d && s && e) keys[d+'|'+s+'|'+e] = true;
    });

    canonical[auditId] = {
      assignedEmail: assigned,
      status: status,
      blocks: keys,
      hasCanonicalPlanning: !!assigned && Object.keys(keys).length > 0
    };
  }

  var changes = [];
  var now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm');

  for (var i = 1; i < avValues.length; i++) {
    var row2 = avValues[i] || [];
    var rowChanged = false;
    var date = AvailabilityPlanningReconciler_date_(row2[avDate]);
    var email = AvailabilityPlanningReconciler_clean_(row2[avEmail]).toLowerCase();

    var slots = [
      {slot:1,s:avS1,e:avE1,id:avId1,st:avSt1},
      {slot:2,s:avS2,e:avE2,id:avId2,st:avSt2}
    ];

    slots.forEach(function(z) {
      var auditId = AvailabilityPlanningReconciler_clean_(row2[z.id]);
      if (!auditId) return;

      var statusText = AvailabilityPlanningReconciler_clean_(row2[z.st]);
      if (!/^Manager Planned$/i.test(statusText)) return;

      var c = canonical[auditId];
      var start = AvailabilityPlanningReconciler_clean_(row2[z.s]);
      var end = AvailabilityPlanningReconciler_clean_(row2[z.e]);
      var exactKey = date+'|'+start+'|'+end;

      var valid = !!(c && c.hasCanonicalPlanning && c.assignedEmail === email && c.blocks[exactKey]);
      if (valid) return;

      changes.push({
        sheetRow: i + 1,
        slot: z.slot,
        auditId: auditId,
        date: date,
        auditorEmail: email,
        start: start,
        end: end,
        reason: !c ? 'AUDIT_NOT_FOUND' :
                !c.hasCanonicalPlanning ? 'NO_CANONICAL_ACTIVE_PLANNING' :
                c.assignedEmail !== email ? 'WRONG_AUDITOR' :
                'BLOCK_NOT_IN_CANONICAL_PLANNING'
      });

      if (apply) {
        row2[z.s] = '';
        row2[z.e] = '';
        row2[z.id] = '';
        row2[z.st] = '';
        rowChanged = true;
      }
    });

    if (apply && rowChanged) {
      var hasAudit1 = AvailabilityPlanningReconciler_clean_(row2[avId1]);
      var hasAudit2 = AvailabilityPlanningReconciler_clean_(row2[avId2]);
      var s1 = AvailabilityPlanningReconciler_clean_(row2[avSt1]);
      var s2 = AvailabilityPlanningReconciler_clean_(row2[avSt2]);
      var soft1 = /^(DEFAULT_|MANUAL_|SYSTEM_DEFAULT|USER_MANUAL|CALENDAR|CALENDER)/i.test(s1);
      var soft2 = /^(DEFAULT_|MANUAL_|SYSTEM_DEFAULT|USER_MANUAL|CALENDAR|CALENDER)/i.test(s2);

      if (avAvailable >= 0) row2[avAvailable] = (hasAudit1 || hasAudit2 || soft1 || soft2) ? 'NO' : 'YES';
      if (avUpdated >= 0) row2[avUpdated] = now;
      av.getRange(i + 1, 1, 1, avValues[0].length).setValues([row2]);
    }
  }

  var out = {
    success: true,
    build: '2026-10-04_V211_PLANNING_AVAILABILITY_RECONCILER_R1',
    apply: !!apply,
    staleReservations: changes.length,
    changes: changes,
    writesPerformed: !!apply && changes.length > 0
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function AvailabilityPlanningReconciler_headerMap_(headers) {
  var map = {};
  (headers || []).forEach(function(v,i) {
    var k = AvailabilityPlanningReconciler_key_(v);
    if (k && map[k] === undefined) map[k] = i;
  });
  return map;
}

function AvailabilityPlanningReconciler_col_(map, names) {
  for (var i = 0; i < names.length; i++) {
    var k = AvailabilityPlanningReconciler_key_(names[i]);
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

function AvailabilityPlanningReconciler_key_(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
}

function AvailabilityPlanningReconciler_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function AvailabilityPlanningReconciler_date_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd');
  }
  var s = AvailabilityPlanningReconciler_clean_(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1]+'-'+m[2]+'-'+m[3];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Europe/Amsterdam', 'yyyy-MM-dd');
  return '';
}
