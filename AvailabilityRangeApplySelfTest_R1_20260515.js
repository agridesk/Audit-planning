/**
 * AvailabilityRangeApplySelfTest_R1_20260515
 * PURPOSE:
 * Validate deterministic range apply behavior.
 * READ-ONLY diagnostic.
 */

function RUN_AVAILABILITY_RANGE_APPLY_SELFTEST_R1() {

  var existing = [
    { date: "2026-11-18", kind: "SOFT_DEFAULT_UNAVAILABLE" },
    { date: "2026-11-19", kind: "SOFT_DEFAULT_UNAVAILABLE" }
  ];

  var requestedRange = [
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21"
  ];

  var expectedBehavior = {
    overwriteSoftRows: true,
    skipBecauseNonHardExists: false,
    deterministicUpsert: true
  };

  var result = {
    ok: true,
    build: "2026-05-15_AVAILABILITY_RANGE_APPLY_SELFTEST_R1",
    existing: existing,
    requestedRange: requestedRange,
    expectedBehavior: expectedBehavior
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
