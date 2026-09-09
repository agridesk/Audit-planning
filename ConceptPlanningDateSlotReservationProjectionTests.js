/***********************************************************************
 * ConceptPlanningDateSlotReservationProjectionTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_DATE_SLOT_RESERVATION_PROJECTION_TESTS_R1
 ***********************************************************************/
var CONCEPT_DATE_SLOT_RESERVATION_TEST_BUILD='2026-09-09_ROADMAP_2_4_DATE_SLOT_RESERVATION_PROJECTION_TESTS_R1';
function RUN_CONCEPT_DATE_SLOT_RESERVATION_PROJECTION_REGRESSION(){
  var r=[];function c(n,o,d){r.push({name:n,ok:!!o,detail:d||''});}
  var advisory={rows:[{auditId:'AUD_2',slots:[{date:'2026-12-15',availableAuditors:[{email:'a@example.com',name:'A'}],unknownAuditors:[{email:'b@example.com',name:'B'}]}]}]};
  var overlay={rows:[{auditId:'AUD_1',reservationId:'CR-AUD_1',auditorEmail:'a@example.com',blocks:[{date:'2026-12-15',start:'09:00',end:'12:00'}]},{auditId:'AUD_2',reservationId:'CR-AUD_2',auditorEmail:'b@example.com',blocks:[{date:'2026-12-15',start:'09:00',end:'12:00'}]}]};
  var x=ConceptPlanningDateSlotReservationProjection_get({dateSlotAdvisory:advisory,reservationOverlay:overlay});
  var slot=x.rows[0].slots[0],a=slot.availableAuditors[0],b=slot.unknownAuditors[0];
  c('projectionPresent',typeof ConceptPlanningDateSlotReservationProjection_get==='function');
  c('success',x.success===true);
  c('otherAuditReservationDetected',a.preliminarilyReserved===true&&a.conceptReservationSignal==='PRELIMINARY_RESERVED');
  c('conflictCarriesReservation',a.reservationConflicts.length===1&&a.reservationConflicts[0].reservationId==='CR-AUD_1');
  c('selfReservationIgnored',b.preliminarilyReserved===false&&b.conceptReservationSignal==='CLEAR');
  c('slotConflictFlag',slot.hasPreliminaryReservationConflict===true&&slot.preliminarilyReservedCount===1);
  c('totalReservedCandidates',x.totals.reservedCandidates===1);
  c('zeroSheetReads',x.meta.sheetReads===0);
  c('zeroServiceReads',x.meta.serviceReads===0);
  c('zeroRpcReads',x.meta.rpcReads===0);
  c('availabilityUntouched',x.meta.canonicalAvailabilityMutated===false);
  c('eligibilityUntouched',x.meta.eligibilityMutated===false);
  c('rankingUntouched',x.meta.rankingMutated===false);
  c('loadedSlotsReused',x.meta.reusesLoadedDateSlotAdvisory===true);
  c('loadedReservationsReused',x.meta.reusesLoadedReservationOverlay===true);
  c('commitRevalidation',x.meta.commitRevalidationRequired===true);
  var failed=r.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:CONCEPT_DATE_SLOT_RESERVATION_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,pureProjection:true}};
  console.log(JSON.stringify(out,null,2));return out;
}
