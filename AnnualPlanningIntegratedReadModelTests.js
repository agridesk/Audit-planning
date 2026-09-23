/**
 * FILE: AnnualPlanningIntegratedReadModelTests.gs
 * BUILD: 2026-09-23_AMS03_ANNUAL_PLANNING_INTEGRATED_TEST_R1
 * PURPOSE: Non-destructive acceptance for the integrated annual planning model.
 ***********************************************************************/
var ANNUAL_PLANNING_INTEGRATED_TEST_BUILD='2026-09-23_AMS03_ANNUAL_PLANNING_INTEGRATED_TEST_R1';

function RUN_AMS03_ANNUAL_PLANNING_INTEGRATED_ACCEPTANCE(){
  var year=2027;
  var r=getAnnualPlanningIntegratedV5({year:year});
  var gates={
    success:r&&r.success===true,
    readOnly:r&&r.readOnly===true,
    noWrites:r&&r.writesPerformed===false,
    year:r&&Number(r.year)===year,
    workloadReconciled:!!(r&&r.diagnostics&&r.diagnostics.workloadReconciled),
    auditorProjection:Array.isArray(r&&r.auditors),
    regionProjection:Array.isArray(r&&r.byRegion),
    scopeProjection:Array.isArray(r&&r.byScope),
    monthProjection:Array.isArray(r&&r.byMonth),
    workloadProjection:Array.isArray(r&&r.workload),
    noNewSsot:!!(r&&r.diagnostics&&r.diagnostics.newSsot===false),
    obligationLabels:!!(r&&r.summary&&Object.prototype.hasOwnProperty.call(r.summary,'obligationsToPlan')),
    capacityPresent:!!(r&&r.summary&&Object.prototype.hasOwnProperty.call(r.summary,'availableHours'))
  };
  var passed=0,total=0;Object.keys(gates).forEach(function(k){total++;if(gates[k])passed++;});
  var out={
    ok:passed===total,
    build:ANNUAL_PLANNING_INTEGRATED_TEST_BUILD,
    year:year,
    passed:passed,
    total:total,
    gates:gates,
    summary:r?r.summary:{},
    auditors:r&&r.auditors?r.auditors:[],
    diagnostics:r?r.diagnostics:{},
    meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,availabilityWrites:false}
  };
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
