/***********************************************************************
 * FILE: AMS01_AvailabilityPeriodBoundedReadTests.js
 * BUILD: 2026-09-10_AMS01_2_AVAILABILITY_BOUNDED_READ_TEST_R1
 *
 * PURPOSE
 * - Non-destructive semantic regression for AvailabilityPeriodReadModel R2.
 * - Compare bounded production result with an independent full-body baseline.
 * - Report cold/warm performance for the live Workspace default period.
 ***********************************************************************/

var AMS01_APRM_BOUNDED_TEST_BUILD = '2026-09-10_AMS01_2_AVAILABILITY_BOUNDED_READ_TEST_R1';

function AMS01_APRM_TEST_period_() {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var now = new Date();
  var from = Utilities.formatDate(now, tz, 'yyyy-MM-01');
  var y = Number(Utilities.formatDate(now, tz, 'yyyy'));
  var m = Number(Utilities.formatDate(now, tz, 'M')) - 1;
  var end = new Date(y, m + 4, 0, 12, 0, 0, 0);
  return { from: from, to: Utilities.formatDate(end, tz, 'yyyy-MM-dd'), timezone: tz };
}

function AMS01_APRM_TEST_fullBaseline_(input) {
  input = input || {};
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var period = APRM_period_(input, tz);
  var auditorSet = APRM_auditorSet_(input);
  var sh = APRM_sheet_();
  if (!sh) throw new Error("Missing sheet 'Auditor Availability'");

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var cDate = APRM_findCol_(headers, ['Date']);
  var cAud = APRM_findCol_(headers, ['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']);
  var cAvail = APRM_findCol_(headers, ['Available']);
  var cS1 = APRM_findCol_(headers, ['First_Audit_Start_Time','First Audit Start Time']);
  var cE1 = APRM_findCol_(headers, ['First_Audit_End_Time','First Audit End Time']);
  var cID1 = APRM_findCol_(headers, ['Audit_ID_1','Audit ID 1','AuditId1']);
  var cSt1 = APRM_findCol_(headers, ['Status_1','Status 1','Status','Source']);
  var cS2 = APRM_findCol_(headers, ['Second_Audit_Start_Time','Second Audit Start Time']);
  var cE2 = APRM_findCol_(headers, ['Second_Audit_End_Time','Second Audit End Time']);
  var cID2 = APRM_findCol_(headers, ['Audit_ID_2','Audit ID 2','AuditId2']);
  var cSt2 = APRM_findCol_(headers, ['Status_2','Status 2']);
  var cUpd = APRM_findCol_(headers, ['Last_Updated','Last Updated','Timestamp']);
  var required = [cDate,cAud,cAvail,cS1,cE1,cID1,cSt1,cS2,cE2,cID2,cSt2,cUpd].filter(function(x){ return x >= 0; });
  var maxCol = required.length ? Math.max.apply(null, required) + 1 : lastCol;
  var values = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, maxCol).getValues() : [];
  var rows = [];

  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [];
    var date = APRM_isoDate_(row[cDate], tz);
    if (!date || date < period.from || date > period.to) continue;
    var auditorEmail = APRM_norm_(row[cAud]);
    if (!auditorEmail) continue;
    if (auditorSet && !auditorSet[auditorEmail]) continue;
    var rec = {
      date: date,
      auditorEmail: auditorEmail,
      available: APRM_clean_(row[cAvail]),
      slots: [],
      lastUpdated: cUpd >= 0 ? APRM_clean_(row[cUpd]) : '',
      sourceRow: r + 2
    };
    var s1 = APRM_slot_(row, cS1, cE1, cID1, cSt1, tz, 1);
    var s2 = APRM_slot_(row, cS2, cE2, cID2, cSt2, tz, 2);
    if (s1) rec.slots.push(s1);
    if (s2) rec.slots.push(s2);
    rows.push(rec);
  }

  rows.sort(function(a,b){
    if (a.auditorEmail !== b.auditorEmail) return a.auditorEmail.localeCompare(b.auditorEmail);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.sourceRow - b.sourceRow;
  });
  return rows;
}

function AMS01_APRM_TEST_signature_(row) {
  return JSON.stringify({
    date: row.date,
    auditorEmail: row.auditorEmail,
    available: row.available,
    slots: row.slots,
    lastUpdated: row.lastUpdated,
    sourceRow: row.sourceRow
  });
}

function RUN_AMS01_2_AVAILABILITY_BOUNDED_READ_REGRESSION() {
  var p = AMS01_APRM_TEST_period_();
  var baselineStart = Date.now();
  var baseline = AMS01_APRM_TEST_fullBaseline_({from:p.from,to:p.to});
  var baselineMs = Date.now() - baselineStart;

  var coldStart = Date.now();
  var cold = AvailabilityPeriodReadModel_get({from:p.from,to:p.to});
  var coldMs = Date.now() - coldStart;

  var warmStart = Date.now();
  var warm = AvailabilityPeriodReadModel_get({from:p.from,to:p.to});
  var warmMs = Date.now() - warmStart;

  var actual = warm && warm.rows ? warm.rows : [];
  var mismatches = [];
  var max = Math.max(baseline.length, actual.length);
  for (var i = 0; i < max; i++) {
    var b = baseline[i] || null;
    var a = actual[i] || null;
    if (!b || !a || AMS01_APRM_TEST_signature_(b) !== AMS01_APRM_TEST_signature_(a)) {
      mismatches.push({index:i, baseline:b, actual:a});
      if (mismatches.length >= 10) break;
    }
  }

  var out = {
    ok: mismatches.length === 0,
    build: AMS01_APRM_BOUNDED_TEST_BUILD,
    serviceBuild: AVAILABILITY_PERIOD_READ_MODEL_BUILD,
    period: p,
    baselineRows: baseline.length,
    actualRows: actual.length,
    mismatches: mismatches,
    baselineFullReadMs: baselineMs,
    coldBoundedMs: coldMs,
    warmBoundedMs: warmMs,
    coldPerformance: cold ? cold.devPerformance || null : null,
    warmPerformance: warm ? warm.devPerformance || null : null,
    meta: warm ? warm.meta || null : null,
    readOnly: true
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
