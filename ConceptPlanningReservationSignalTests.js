/***********************************************************************
 * ConceptPlanningReservationSignalTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_SIGNAL_TESTS_R1
 ***********************************************************************/
var CONCEPT_RESERVATION_SIGNAL_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_SIGNAL_TESTS_R1';
function RUN_CONCEPT_RESERVATION_SIGNAL_REGRESSION(){
  var r=[];function c(n,o,d){r.push({name:n,ok:!!o,detail:d||''});}
  var overlay={rows:[{auditId:'AUD_1',reservationId:'CR-AUD_1',auditorEmail:'a@example.com',blocks:[{date:'2026-12-15',start:'09:00',end:'12:00'}]}]};
  var hit=ConceptPlanningReservationSignal_evaluate({auditId:'AUD_2',auditorEmail:'A@EXAMPLE.COM',blocks:[{date:'2026-12-15',start:'11:00',end:'13:00'}],reservationOverlay:overlay});
  c('signalPresent',typeof ConceptPlanningReservationSignal_evaluate==='function');
  c('conflictDetected',hit.conflict===true);
  c('reservedSignal',hit.signal==='PRELIMINARY_RESERVED');
  c('conflictCarriesAudit',hit.conflicts.length===1&&hit.conflicts[0].auditId==='AUD_1');
  var clear=ConceptPlanningReservationSignal_evaluate({auditId:'AUD_2',auditorEmail:'a@example.com',blocks:[{date:'2026-12-15',start:'13:00',end:'14:00'}],reservationOverlay:overlay});
  c('nonOverlapClear',clear.conflict===false&&clear.signal==='CLEAR');
  var other=ConceptPlanningReservationSignal_evaluate({auditId:'AUD_2',auditorEmail:'b@example.com',blocks:[{date:'2026-12-15',start:'10:00',end:'11:00'}],reservationOverlay:overlay});
  c('otherAuditorClear',other.conflict===false);
  var self=ConceptPlanningReservationSignal_evaluate({auditId:'AUD_1',auditorEmail:'a@example.com',blocks:[{date:'2026-12-15',start:'10:00',end:'11:00'}],reservationOverlay:overlay});
  c('selfReservationIgnored',self.conflict===false);
  c('zeroSheetReads',hit.meta.zeroSheetReads===true);
  c('zeroServiceReads',hit.meta.zeroServiceReads===true);
  c('zeroRpcReads',hit.meta.zeroRpcReads===true);
  c('canonicalAvailabilityUntouched',hit.meta.canonicalAvailabilityMutated===false);
  c('eligibilityUntouched',hit.meta.eligibilityMutated===false);
  c('rankingUntouched',hit.meta.rankingMutated===false);
  c('commitRevalidationRequired',hit.meta.commitRevalidationRequired===true);
  var failed=r.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:CONCEPT_RESERVATION_SIGNAL_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,pureProjection:true}};
  console.log(JSON.stringify(out,null,2));return out;
}
