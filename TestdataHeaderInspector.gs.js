/**
 * TestdataHeaderInspector.gs
 * Version: 2026-04-28_003_SKIP_EMPTY_HEADERS_IN_REPORT
 *
 * Purpose:
 * - Read headers from relevant DEV sheets
 * - Write a structured report tab for copy/export
 * - Avoid huge Logger output truncation
 * - Keep report clean by skipping empty header rows by default
 *
 * Safe:
 * - TESTDATA_HEADERS_getDefault() is read-only
 * - TESTDATA_HEADERS_logSummary() is read-only
 * - TESTDATA_HEADERS_writeReport() only writes/refreshes TESTDATA_Header_Report
 */

var TESTDATA_HEADERS_VERSION = '2026-04-28_003_SKIP_EMPTY_HEADERS_IN_REPORT';

var TESTDATA_HEADERS_DEFAULT_SHEETS = [
  'Audit planning',
  'Companies',
  'Log realized audits',
  'Rejected audits',
  'Auditor availability',
  'Auditors',
  'Config_Scopes',
  'Notification Queue',
  'Notification_Config',
  'Notification_Rules',
  'Notification_Settings',
  'System_Config'
];

var TESTDATA_HEADERS_REPORT_INCLUDE_EMPTY_HEADERS = false;

/**
 * MAIN: recommended function.
 * Writes TESTDATA_Header_Report and logs only a compact summary.
 */
function TESTDATA_HEADERS_writeReport() {
  var result = TESTDATA_HEADERS_getDefault();
  return TESTDATA_HEADERS_writeResultToReport_(result, 'TESTDATA_Header_Report');
}

/**
 * MAIN: compact log only. Does not write anything.
 */
function TESTDATA_HEADERS_logSummary() {
  var result = TESTDATA_HEADERS_getDefault();
  var summary = TESTDATA_HEADERS_buildSummary_(result, '');
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * Legacy-safe alias.
 * Important: this no longer logs the full JSON, because Apps Script truncates it.
 */
function TESTDATA_HEADERS_logDefault() {
  return TESTDATA_HEADERS_logSummary();
}

/**
 * Returns structured headers for the default relevant sheets.
 * Warning: returning this to the execution log may be too large.
 */
function TESTDATA_HEADERS_getDefault() {
  return TESTDATA_HEADERS_getForSheets(TESTDATA_HEADERS_DEFAULT_SHEETS);
}

/**
 * Returns structured headers for all sheets in the spreadsheet.
 * Warning: returning this to the execution log may be too large.
 */
function TESTDATA_HEADERS_getAllSheets() {
  var ss = SpreadsheetApp.getActive();
  var sheets = ss.getSheets().map(function(sh) {
    return sh.getName();
  });
  return TESTDATA_HEADERS_getForSheets(sheets);
}

/**
 * Writes all sheets, not just default relevant sheets, to TESTDATA_Header_Report_All.
 */
function TESTDATA_HEADERS_writeReportAllSheets() {
  var ss = SpreadsheetApp.getActive();
  var sheets = ss.getSheets().map(function(sh) {
    return sh.getName();
  });
  var result = TESTDATA_HEADERS_getForSheets(sheets);
  return TESTDATA_HEADERS_writeResultToReport_(result, 'TESTDATA_Header_Report_All');
}

/**
 * Returns structured headers for supplied sheet names.
 * @param {string[]} sheetNames
 */
function TESTDATA_HEADERS_getForSheets(sheetNames) {
  var ss = SpreadsheetApp.getActive();
  var result = {
    ok: true,
    version: TESTDATA_HEADERS_VERSION,
    generatedAt: TESTDATA_HEADERS_formatDateTime_(new Date()),
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    requestedSheets: sheetNames || [],
    sheets: [],
    missingSheets: [],
    warnings: []
  };

  var names = Array.isArray(sheetNames) ? sheetNames : [];

  for (var i = 0; i < names.length; i++) {
    var sheetName = String(names[i] || '').trim();
    if (!sheetName) continue;

    var inspected = TESTDATA_HEADERS_inspectSheet_(ss, sheetName);
    result.sheets.push(inspected);

    if (!inspected.exists) {
      result.missingSheets.push(sheetName);
    }

    for (var w = 0; w < inspected.warnings.length; w++) {
      result.warnings.push(inspected.warnings[w]);
    }
  }

  return result;
}

function TESTDATA_HEADERS_writeResultToReport_(result, reportName) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(reportName);

  if (!sh) {
    sh = ss.insertSheet(reportName);
  } else {
    sh.clearContents();
  }

  var rows = [];
  rows.push([
    'Sheet',
    'Exists',
    'Header index',
    'Column',
    'Column letter',
    'Header',
    'Normalized header',
    'Duplicate',
    'Empty header',
    'Last row',
    'Last column',
    'Warnings'
  ]);

  for (var i = 0; i < result.sheets.length; i++) {
    var s = result.sheets[i];
    var warningText = s.warnings.join(' | ');

    if (!s.exists) {
      rows.push([s.sheetName, false, '', '', '', '', '', '', '', '', '', warningText]);
      continue;
    }

    if (!s.headers.length) {
      rows.push([s.sheetName, true, '', '', '', '', '', '', true, s.lastRow, s.lastColumn, warningText]);
      continue;
    }

    for (var j = 0; j < s.headers.length; j++) {
      var h = s.headers[j];

      if (h.isEmpty && !TESTDATA_HEADERS_REPORT_INCLUDE_EMPTY_HEADERS) {
        continue;
      }

      rows.push([
        s.sheetName,
        true,
        h.index,
        h.column,
        h.columnLetter,
        h.header,
        h.normalized,
        h.isDuplicate,
        h.isEmpty,
        s.lastRow,
        s.lastColumn,
        warningText
      ]);
    }
  }

  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, rows[0].length);

  var summary = TESTDATA_HEADERS_buildSummary_(result, reportName);
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function TESTDATA_HEADERS_inspectSheet_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  var out = {
    sheetName: sheetName,
    exists: !!sh,
    lastRow: 0,
    lastColumn: 0,
    headerRow: 1,
    headers: [],
    headerNames: [],
    headerMap: {},
    duplicates: [],
    emptyHeaderColumns: [],
    warnings: []
  };

  if (!sh) {
    out.warnings.push('Missing sheet: ' + sheetName);
    return out;
  }

  out.lastRow = sh.getLastRow();
  out.lastColumn = sh.getLastColumn();

  if (out.lastColumn < 1) {
    out.warnings.push('Sheet has no columns: ' + sheetName);
    return out;
  }

  var rawHeaders = sh.getRange(1, 1, 1, out.lastColumn).getValues()[0];
  var seen = {};

  for (var i = 0; i < rawHeaders.length; i++) {
    var raw = rawHeaders[i];
    var header = String(raw || '').trim();
    var normalized = TESTDATA_HEADERS_normalizeHeader_(header);
    var isEmpty = !header;
    var isDuplicate = false;

    if (isEmpty) {
      out.emptyHeaderColumns.push(i + 1);
    } else {
      if (Object.prototype.hasOwnProperty.call(seen, header)) {
        isDuplicate = true;
        if (out.duplicates.indexOf(header) === -1) out.duplicates.push(header);
      }
      seen[header] = true;
      out.headerNames.push(header);
      out.headerMap[header] = {
        index: i,
        column: i + 1,
        columnLetter: TESTDATA_HEADERS_columnLetter_(i + 1),
        normalized: normalized
      };
    }

    out.headers.push({
      index: i,
      column: i + 1,
      columnLetter: TESTDATA_HEADERS_columnLetter_(i + 1),
      header: header,
      normalized: normalized,
      isDuplicate: isDuplicate,
      isEmpty: isEmpty
    });
  }

  if (out.duplicates.length) {
    out.warnings.push('Duplicate headers in ' + sheetName + ': ' + out.duplicates.join(', '));
  }

  if (out.emptyHeaderColumns.length) {
    out.warnings.push('Empty headers in ' + sheetName + ' columns: ' + out.emptyHeaderColumns.join(', '));
  }

  return out;
}

function TESTDATA_HEADERS_buildSummary_(result, reportName) {
  var sheetSummaries = [];
  var totalHeaderCells = 0;
  var visibleHeaderCells = 0;
  var existingSheets = 0;

  for (var i = 0; i < result.sheets.length; i++) {
    var s = result.sheets[i];
    if (s.exists) existingSheets++;

    totalHeaderCells += s.headers.length;
    visibleHeaderCells += s.headerNames.length;

    sheetSummaries.push({
      sheetName: s.sheetName,
      exists: s.exists,
      lastRow: s.lastRow,
      lastColumn: s.lastColumn,
      headerCount: s.headers.length,
      visibleHeaderCount: s.headerNames.length,
      duplicateCount: s.duplicates.length,
      emptyHeaderCount: s.emptyHeaderColumns.length
    });
  }

  return {
    ok: result.ok,
    version: result.version,
    generatedAt: result.generatedAt,
    spreadsheetName: result.spreadsheetName,
    reportSheet: reportName || '',
    includeEmptyHeadersInReport: TESTDATA_HEADERS_REPORT_INCLUDE_EMPTY_HEADERS,
    requestedSheetCount: result.requestedSheets.length,
    existingSheetCount: existingSheets,
    missingSheets: result.missingSheets,
    totalHeaderCells: totalHeaderCells,
    visibleHeaderCells: visibleHeaderCells,
    warningCount: result.warnings.length,
    warnings: result.warnings,
    sheets: sheetSummaries
  };
}

function TESTDATA_HEADERS_normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function TESTDATA_HEADERS_columnLetter_(columnNumber) {
  var temp = '';
  var letter = '';
  var col = Number(columnNumber || 0);

  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }

  return letter;
}

function TESTDATA_HEADERS_formatDateTime_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
