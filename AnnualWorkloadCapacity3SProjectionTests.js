/**
 * FILE: AnnualWorkloadCapacity3SProjectionTests.gs
 * BUILD: 2026-09-22_AMS03_ANNUAL_WORKLOAD_3S_TEST_R1
 */
function RUN_AMS03_ANNUAL_WORKLOAD_3S_ACCEPTANCE(){
  var year=new Date().getFullYear()+1;
  var out=getAnnualWorkloadCapacity3SV5({year:year});
  var gates={
    success:out&&out.success===true,
    readOnly:out&&out.readOnly===true&&out.writesPerformed===false,
    canonicalYear:Number(out&&out.year)===year,
    regionProjection:Array.isArray(out&&out.byRegion),
    scopeProjection:Array.isArray(out&&out.byScope),
    monthProjection:Array.isArray(out&&out.byMonth),
    reconciliation:!!(out&&out.diagnostics&&out.diagnostics.reconciled),
    baseReadModelPreserved:!!(out&&out.diagnostics&&out.diagnostics.baseBuild),
    noCapacityTruthInvented:!(out&&Object.prototype.hasOwnProperty.call(out,'availableCapacityHours')),
    deterministicScopeOrder:AnnualWorkload3STest_sorted_(out&&out.byScope),
    deterministicRegionOrder:AnnualWorkload3STest_sorted_(out&&out.byRegion),
    readOnlyFlag:true
  };
  var errors=[];Object.keys(gates).forEach(function(k){if(!gates[k])errors.push(k);});
  var result={
    success:errors.length===0,
    build:'2026-09-22_AMS03_ANNUAL_WORKLOAD_3S_TEST_R1',
    readOnly:true,
    writesPerformed:false,
    year:year,
    counts:{
      workloadRows:(out&&out.workload||[]).length,
      auditorRows:(out&&out.auditors||[]).length,
      regionRows:(out&&out.byRegion||[]).length,
      scopeRows:(out&&out.byScope||[]).length,
      monthRows:(out&&out.byMonth||[]).length
    },
    diagnostics:out&&out.diagnostics||{},
    gates:gates,
    errors:errors.concat(out&&out.errors||[])
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
function AnnualWorkload3STest_sorted_(rows){
  rows=rows||[];
  for(var i=1;i<rows.length;i++)if(String(rows[i-1].key||'').localeCompare(String(rows[i].key||''))>0)return false;
  return true;
}
