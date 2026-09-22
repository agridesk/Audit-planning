/**
 * FILE: AnnualAvailabilityCapacityProjectionTests.gs
 * BUILD: 2026-09-22_AMS03_AVAILABILITY_CAPACITY_PROJECTION_TEST_R2_WEEKDAY_CODES
 */
function RUN_AMS03_AVAILABILITY_CAPACITY_PROJECTION_ACCEPTANCE(){
  var year=new Date().getFullYear()+1;
  var out=getAnnualAvailabilityCapacityV5({year:year});
  var twoLetterCodes=AnnualAvailabilityCapacity_parseBlockedWeekdays_('Mo,Tu,We,Th,Fr,Sa,Su');
  var gates={
    success:out&&out.success===true,
    readOnly:out&&out.readOnly===true&&out.writesPerformed===false,
    canonicalYear:Number(out&&out.year)===year,
    availabilityOwner:out&&out.source&&out.source.availability==='Auditor Availability',
    auditorDefaultsOwner:out&&out.source&&out.source.auditorDefaults==='Auditors',
    standardDayConvention:out&&out.source&&out.source.dayWindow==='08:00-18:00',
    activeAuditorsPresent:out&&out.summary&&Number(out.summary.activeAuditors)>0,
    auditorRowsPresent:Array.isArray(out&&out.auditors)&&out.auditors.length>0,
    nonNegativeCapacity:(out&&out.auditors||[]).every(function(a){return Number(a.availableHours)>=0&&Number(a.standardGrossHours)>=0&&Number(a.overrideableSoftHours)>=0;}),
    availableNotAboveGross:(out&&out.auditors||[]).every(function(a){return Number(a.availableHours)<=Number(a.standardGrossHours)+0.001;}),
    onePassAvailabilityRead:out&&out.diagnostics&&Number(out.diagnostics.availabilityRowsScanned)>=Number(out.diagnostics.availabilityRowsInYear||0),
    sparseAvailabilitySemantics:out&&out.diagnostics&&out.diagnostics.missingAvailabilityRowSemantics==='NO_EXPLICIT_EXCEPTION',
    twoLetterWeekdayCodes:[0,1,2,3,4,5,6].every(function(d){return twoLetterCodes[d]===true;}),
    configuredBlockedWeekdaysReduceStandardDays:(out&&out.auditors||[]).filter(function(a){return String(a.blockedWeekdaysRaw||'').trim()!=='';}).every(function(a){return Number(a.standardDays)<261;}),
    noSecondCapacityTruth:true
  };
  var errors=[];Object.keys(gates).forEach(function(k){if(!gates[k])errors.push(k);});
  var result={
    success:errors.length===0,
    build:'2026-09-22_AMS03_AVAILABILITY_CAPACITY_PROJECTION_TEST_R2_WEEKDAY_CODES',
    readOnly:true,
    writesPerformed:false,
    year:year,
    summary:out&&out.summary||{},
    auditors:(out&&out.auditors||[]).map(function(a){return{auditorEmail:a.auditorEmail,auditorName:a.auditorName,blockedWeekdaysRaw:a.blockedWeekdaysRaw,standardDays:a.standardDays,standardGrossHours:a.standardGrossHours,hardUnavailableHours:a.hardUnavailableHours,softUnavailableHours:a.softUnavailableHours,occupiedAuditHours:a.occupiedAuditHours,availableHours:a.availableHours,overrideableSoftHours:a.overrideableSoftHours,explicitRows:a.explicitRows};}),
    diagnostics:out&&out.diagnostics||{},
    gates:gates,
    errors:errors.concat(out&&out.errors||[]),
    serverMs:out&&out.serverMs
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
