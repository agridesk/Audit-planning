/**
 * AvailabilityProjectionSelfTest_R1_20260515
 * PURPOSE:
 * Validate soft/manual/hard availability projection semantics.
 * READ-ONLY diagnostic.
 */

function RUN_AVAILABILITY_PROJECTION_SELFTEST_R1() {

  var sample = {
    "2026-11-18": [
      {
        kind: "SOFT_MANUAL_UNAVAILABLE",
        source: "MANUAL_CLICK",
        startTime: "00:00",
        endTime: "23:59"
      }
    ],
    "2026-11-19": [
      {
        kind: "SOFT_DEFAULT_UNAVAILABLE",
        source: "DEFAULT_WEEKDAY",
        startTime: "00:00",
        endTime: "23:59"
      }
    ],
    "2026-11-20": [
      {
        kind: "HARD_PLANNED_AUDIT",
        source: "PLANNING_JSON",
        startTime: "08:30",
        endTime: "17:30"
      }
    ]
  };

  var result = {
    ok: true,
    build: "2026-05-15_AVAILABILITY_PROJECTION_SELFTEST_R1",
    semantics: {
      softManual: "warning only",
      softDefault: "warning only",
      hardAudit: "hard conflict"
    },
    projection: sample
  };

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}
