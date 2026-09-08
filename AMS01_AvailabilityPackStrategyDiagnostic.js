/**
 * FILE: AMS01_AvailabilityPackStrategyDiagnostic.js
 * BUILD: AMS01_AVAILABILITY_PACK_STRATEGY_DIAG_20260908_R1
 * DEV-only read-only diagnostic.
 * Compares the current TextFinder-based single-auditor pack strategy with
 * a narrow two-column bulk scan over Date + Auditor_Email on the current
 * Auditor Availability sheet. No writes, no cache ownership changes.
 */
var AMS01_AVAIL_PACK_STRATEGY_DIAG_BUILD = 'AMS01_AVAILABILITY_PACK_STRATEGY_DIAG_20260908_R1';

function AMS01_RunAvailabilityPackStrategyDiagnostic() {
  var tAll = Date.now();
  var auditorEmail = 'david@agriqa.es';
  var monthStart = '2026-09-01';
  var monthEnd = '2026-09-30';
  var out = {
    success: true,
    build: AMS01_AVAIL_PACK_STRATEGY_DIAG_BUILD,
    auditorEmail: auditorEmail,
    monthStart: monthStart,
    monthEnd: monthEnd,
    probes: []
  };

  function probe_(label, fn) {
    var t0 = Date.now();
    var rec = { label: label, wallMs: 0, ok: true, result: null, error: '' };
    try {
      rec.result = fn();
    } catch (e) {
      rec.ok = false;
      rec.error = String(e && e.message ? e.message : e);
      out.success = false;
    }
    rec.wallMs = Date.now() - t0;
    out.probes.push(rec);
    return rec;
  }

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Auditor Availability') || ss.getSheetByName('Auditor availability');
  if (!sh) throw new Error("Missing sheet 'Auditor Availability'");

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];

  function norm_(v) {
    return String(v == null ? '' : v).replace(/\u00A0/g, ' ').trim().toLowerCase();
  }
  function findCol_(names) {
    for (var i = 0; i < headers.length; i++) {
      var h = norm_(headers[i]);
      for (var j = 0; j < names.length; j++) {
        if (h === norm_(names[j])) return i + 1;
      }
    }
    return -1;
  }
  function dateIso_(v) {
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    }
    var s = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  var dateCol = findCol_(['Date']);
  var audCol = findCol_(['Auditor_Email', 'Auditor Email', 'Email', 'E-mail', 'Auditor_Name', 'Auditor Name']);
  if (dateCol < 1 || audCol < 1) throw new Error('Required Date/Auditor column not found');

  probe_('Current TextFinder strategy', function () {
    var tFind0 = Date.now();
    var finder = sh.createTextFinder(auditorEmail).matchEntireCell(true).matchCase(false);
    var matches = finder.findAll() || [];
    var findMs = Date.now() - tFind0;

    var rowNumbers = [];
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].getColumn() !== audCol) continue;
      var r = matches[i].getRow();
      if (r >= 2) rowNumbers.push(r);
    }
    rowNumbers.sort(function(a, b) { return a - b; });

    var dateReadMs = 0;
    var monthRows = [];
    var span = 0;
    if (rowNumbers.length) {
      var minR = rowNumbers[0];
      var maxR = rowNumbers[rowNumbers.length - 1];
      span = maxR - minR + 1;
      var rnSet = {};
      for (var x = 0; x < rowNumbers.length; x++) rnSet[rowNumbers[x]] = true;
      var tDates0 = Date.now();
      var dateVals = sh.getRange(minR, dateCol, span, 1).getValues();
      dateReadMs = Date.now() - tDates0;
      for (var k = 0; k < span; k++) {
        var actualRow = minR + k;
        if (!rnSet[actualRow]) continue;
        var iso = dateIso_(dateVals[k][0]);
        if (iso && iso >= monthStart && iso <= monthEnd) monthRows.push(actualRow);
      }
    }

    return {
      totalMatches: matches.length,
      auditorRows: rowNumbers.length,
      monthRows: monthRows.length,
      spanningRows: span,
      findMs: findMs,
      dateReadMs: dateReadMs
    };
  });

  probe_('Two-column bulk scan', function () {
    if (lastRow < 2) return { sheetRows: lastRow, monthRows: 0, readMs: 0, scanMs: 0 };
    var firstCol = Math.min(dateCol, audCol);
    var width = Math.abs(audCol - dateCol) + 1;
    var tRead0 = Date.now();
    var vals = sh.getRange(2, firstCol, lastRow - 1, width).getValues();
    var readMs = Date.now() - tRead0;
    var dateIdx = dateCol - firstCol;
    var audIdx = audCol - firstCol;
    var tScan0 = Date.now();
    var monthRows = [];
    var auditorRows = 0;
    for (var r = 0; r < vals.length; r++) {
      if (norm_(vals[r][audIdx]) !== auditorEmail) continue;
      auditorRows++;
      var iso = dateIso_(vals[r][dateIdx]);
      if (iso && iso >= monthStart && iso <= monthEnd) monthRows.push(r + 2);
    }
    var scanMs = Date.now() - tScan0;
    return {
      sheetRows: lastRow,
      auditorRows: auditorRows,
      monthRows: monthRows.length,
      readMs: readMs,
      scanMs: scanMs,
      cellsRead: (lastRow - 1) * width,
      width: width
    };
  });

  out.totalMs = Date.now() - tAll;
  try { Logger.log('[AMS01_AVAIL_PACK_STRATEGY_DIAG] ' + JSON.stringify(out)); } catch (eLog) {}
  return out;
}
