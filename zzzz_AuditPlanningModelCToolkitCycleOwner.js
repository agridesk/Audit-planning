/**
 * AMS-01.6 Model C Toolkit cycle-year runtime owner.
 * Loaded late on purpose: removes Toolkit rotation-year dependence on the
 * legacy aggregate Date - Will Expire field.
 */
var MODEL_C_TOOLKIT_CYCLE_OWNER_BUILD = '2026-09-20_AMS_01_6_MODEL_C_TOOLKIT_CYCLE_OWNER_R1';

function _mp_getCurrentCycleYearFromAuditRow_(hdr, row) {
  var nowY = new Date().getFullYear();
  try {
    hdr = hdr || [];
    row = row || [];
    var auditIdx = _mp_findHeaderIdxCI_(hdr, ['Audit ID','Audit_ID','AuditId','Audit Id']);
    var auditId = auditIdx >= 0 ? String(row[auditIdx] || '').trim() : '';
    if (auditId) {
      var modelYear = ModelCToolkitCycle_yearForAudit_(SpreadsheetApp.getActiveSpreadsheet(), auditId);
      if (modelYear) return modelYear;
    }

    var ixY = _mp_findHeaderIdxCI_(hdr, ['Year','Cycle year','Audit year']);
    if (ixY >= 0) {
      var v = row[ixY];
      var n = (typeof v === 'number') ? v : Number(String(v || '').trim());
      if (isFinite(n) && n > 2000 && n < 3000) return Math.floor(n);
    }
  } catch (e) {}
  return nowY;
}

function ModelCToolkitCycle_yearForAudit_(ss, auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return null;
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();

  var target = ModelCRecon_readTargets_(ss);
  if (!target || target.success === false) return null;
  var rows = target.rows || {};
  var obligations = rows[MODEL_C_SHEETS.AUDIT_OBLIGATIONS] || [];
  var links = rows[MODEL_C_SHEETS.VISIT_OBLIGATIONS] || [];
  var obById = {};
  obligations.forEach(function(ob) {
    obById[String(ob.Obligation_ID || '')] = ob;
  });

  var years = [];
  links.forEach(function(link) {
    if (String(link.Audit_ID || '') !== auditId) return;
    if (String(link.Link_State || '').toUpperCase() !== 'ACTIVE') return;
    var ob = obById[String(link.Obligation_ID || '')];
    if (!ob) return;
    if (String(ob.Obligation_State || '').toUpperCase() === 'CANCELLED') return;
    if (ModelCFoundation_isAbc_(ob.ScopeCode, ob.ScopeCode)) return;
    var cycle = String(ob.Cycle_Key || ob.Base_Expiry_Date || '').trim();
    var m = cycle.match(/^(\d{4})-/);
    if (m) years.push(Number(m[1]));
  });

  if (!years.length) return null;
  years.sort(function(a,b){ return a-b; });
  return years[0];
}
