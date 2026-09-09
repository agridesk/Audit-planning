/***********************************************************************
 * AvailabilityPeriodReadModelTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_AVAILABILITY_PERIOD_READ_MODEL_TESTS_R1
 *
 * Permanent, non-destructive regression for the read-only period projection.
 ***********************************************************************/

var AVAILABILITY_PERIOD_READ_MODEL_TEST_BUILD = '2026-09-09_ROADMAP_2_4_AVAILABILITY_PERIOD_READ_MODEL_TESTS_R1';

function APRMT_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
  return ok;
}

function RUN_AVAILABILITY_PERIOD_READ_MODEL_REGRESSION() {
  var results = [];

  APRMT_assert_('headerKey', APRM_headerKey_('Auditor Email') === 'auditor_email', 'header normalization', results);
  APRMT_assert_('isoDateText', APRM_isoDate_('2026-09-09', 'Europe/Amsterdam') === '2026-09-09', 'ISO parsing', results);
  APRMT_assert_('timeNormalize', APRM_time_('8:05', 'Europe/Amsterdam') === '08:05', 'time normalization', results);

  var audSet = APRM_auditorSet_({ auditors: ['A@EXAMPLE.COM', 'b@example.com', 'a@example.com'] });
  APRMT_assert_('auditorSetDedupes', audSet && Object.keys(audSet).length === 2 && audSet['a@example.com'] && audSet['b@example.com'], 'auditor set', results);

  var invalidPeriodRejected = false;
  try { APRM_period_({ from: '2026-09-10', to: '2026-09-09' }, 'Europe/Amsterdam'); } catch (e) { invalidPeriodRejected = true; }
  APRMT_assert_('invalidPeriodRejected', invalidPeriodRejected, 'reverse period must fail', results);

  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var d = new Date();
  d.setDate(d.getDate() + 31);
  var future = Utilities.formatDate(d, tz, 'yyyy-MM-dd');

  var t0 = Date.now();
  var smoke = AvailabilityPeriodReadModel_get({ from: today, to: future });
  var smokeMs = Date.now() - t0;

  APRMT_assert_('realDataSmokeSuccess', smoke && smoke.success === true, 'service success', results);
  APRMT_assert_('realDataRowsArray', smoke && Array.isArray(smoke.rows), 'rows array', results);
  APRMT_assert_('realDataDaysObject', smoke && smoke.days && typeof smoke.days === 'object', 'days object', results);
  APRMT_assert_('readOnlyContract', smoke && smoke.meta && smoke.meta.writes === false, 'must be read-only', results);
  APRMT_assert_('canonicalOwnerDeclared', smoke && smoke.meta && smoke.meta.canonicalOwner === 'AvailabilityService / Auditor Availability', 'canonical owner', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  return {
    ok: passed === results.length,
    build: AVAILABILITY_PERIOD_READ_MODEL_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    smokePeriod: { from: today, to: future },
    smokeReturnedRows: smoke && smoke.meta ? smoke.meta.returnedRows : 0,
    smokeAuditors: smoke && smoke.meta ? smoke.meta.auditors : 0,
    smokeColumnsRead: smoke && smoke.meta ? smoke.meta.columnsRead : 0,
    smokeServerMs: smokeMs,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };
}
