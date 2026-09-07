/**
 * FILE: RepairDatePlannedFromPlanningJson_2026-05-05.gs
 * Purpose: repair Audit planning "Date - Planned" from Planning JSON as plain ISO text.
 * Read truth: Planning JSON blocks/slots date.
 * Writes only: Audit planning Date - Planned.
 * Safe for date drift: stores yyyy-mm-dd as text, not as spreadsheet Date object.
 */

function RUN_REPAIR_DATE_PLANNED_FROM_PLANNING_JSON() {
  return REPAIR_DatePlannedFromPlanningJson_({ dryRun: false, onlyAuditId: '' });
}

function RUN_DRY_REPAIR_DATE_PLANNED_FROM_PLANNING_JSON() {
  return REPAIR_DatePlannedFromPlanningJson_({ dryRun: true, onlyAuditId: '' });
}

function RUN_REPAIR_DATE_PLANNED_POLEPLANTS_ONLY() {
  return REPAIR_DatePlannedFromPlanningJson_({
    dryRun: false,
    onlyAuditId: 'AUD_Poleplants_HQ_1777531729465_66'
  });
}

function REPAIR_DatePlannedFromPlanningJson_(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var onlyAuditId = String(opts.onlyAuditId || '').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error("Missing sheet: Audit planning");

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return { success: true, dryRun: dryRun, checked: 0, changed: 0, rows: [] };

  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var cAuditId = REPAIR_findHeader_(hdr, ['Audit ID']);
  var cPlanningJson = REPAIR_findHeader_(hdr, ['Planning JSON']);
  var cDatePlanned = REPAIR_findHeader_(hdr, ['Date - Planned', 'Date planned', 'Date Planned']);

  if (cAuditId < 0) throw new Error('Missing header: Audit ID');
  if (cPlanningJson < 0) throw new Error('Missing header: Planning JSON');
  if (cDatePlanned < 0) throw new Error('Missing header: Date - Planned');

  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var displayValues = sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  var checked = 0;
  var changed = 0;
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var rowNo = i + 2;
    var row = values[i] || [];
    var disp = displayValues[i] || [];
    var auditId = String(row[cAuditId] || '').trim();
    if (!auditId) continue;
    if (onlyAuditId && auditId !== onlyAuditId) continue;

    checked++;

    var planningJsonRaw = row[cPlanningJson];
    var jsonDate = REPAIR_firstDateFromPlanningJson_(planningJsonRaw);
    if (!jsonDate) continue;

    var currentDisplay = String(disp[cDatePlanned] || '').trim();
    var currentRuntime = REPAIR_runtimeDateString_(row[cDatePlanned]);

    var needsWrite = currentDisplay !== jsonDate || currentRuntime !== jsonDate;

    rows.push({
      row: rowNo,
      auditId: auditId,
      currentDisplay: currentDisplay,
      currentRuntime: currentRuntime,
      planningJsonDate: jsonDate,
      action: needsWrite ? (dryRun ? 'WOULD_WRITE_TEXT' : 'WRITE_TEXT') : 'OK'
    });

    if (!needsWrite) continue;

    changed++;
    if (!dryRun) {
      var cell = sh.getRange(rowNo, cDatePlanned + 1);
      cell.setNumberFormat('@');
      cell.setValue(jsonDate);
    }
  }

  SpreadsheetApp.flush();

  var result = {
    success: true,
    dryRun: dryRun,
    onlyAuditId: onlyAuditId,
    checked: checked,
    changed: changed,
    rows: rows
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function REPAIR_firstDateFromPlanningJson_(raw) {
  raw = String(raw || '').trim();
  if (!raw) return '';

  var obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return '';
  }

  var dates = [];

  function visit(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) visit(node[i]);
      return;
    }
    if (typeof node !== 'object') return;

    var d = REPAIR_isoDateText_(node.date || node.day || node.iso || node.dateIso || node.auditDate || node.plannedDate || '');
    if (d) dates.push(d);

    var keys = ['blocks', 'slots', 'days', 'segments', 'plannedDays', 'plannedDates', 'items'];
    for (var k = 0; k < keys.length; k++) {
      if (node[keys[k]] !== undefined) visit(node[keys[k]]);
    }
  }

  visit(obj);
  dates = dates.filter(function(x, ix, arr){ return x && arr.indexOf(x) === ix; });
  dates.sort();
  return dates.length ? dates[0] : '';
}

function REPAIR_isoDateText_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return m[1] + '-' + m[2] + '-' + m[3];
}

function REPAIR_runtimeDateString_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return REPAIR_isoDateText_(v) || String(v).trim();
}

function REPAIR_findHeader_(headers, candidates) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = REPAIR_normHeader_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }
  for (var j = 0; j < candidates.length; j++) {
    var c = REPAIR_normHeader_(candidates[j]);
    if (map[c] !== undefined) return map[c];
  }
  return -1;
}

function REPAIR_normHeader_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function RUN_DATE_CONTRACT_CHECK_CANARY() {
  var auditId = "AUD_CanaryCactusSA_HQ_1777555361288_127";

  var res = {};

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Audit planning");
  var data = sh.getDataRange().getValues();
  var hdr = data[0];

  var colAI = hdr.indexOf("Audit ID");
  var colJSON = hdr.indexOf("Planning JSON");
  var colDate = hdr.indexOf("Date - Planned");

  var row;
  for (var i=1;i<data.length;i++){
    if (String(data[i][colAI]) === auditId){
      row = data[i]; break;
    }
  }

  var json = JSON.parse(row[colJSON] || "{}");
  var jsonDate = (json.blocks && json.blocks[0]) ? json.blocks[0].date : null;

  res.sheetDate = row[colDate];
  res.jsonDate = jsonDate;

  if (typeof getManagerV5Open === "function") {
    var open = getManagerV5Open(auditId);
    res.openDate = open?.planningSummary?.blocks?.[0]?.date;
  }

  if (typeof getManagerV5OpenEnriched === "function") {
    var enr = getManagerV5OpenEnriched(auditId);
    res.enrichedDate = enr?.planningSummary?.blocks?.[0]?.date;
  }

  Logger.log(JSON.stringify(res, null, 2));
}