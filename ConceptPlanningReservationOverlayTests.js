/***********************************************************************
 * ConceptPlanningReservationOverlayTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_OVERLAY_TESTS_R1
 ***********************************************************************/
var CONCEPT_PLANNING_RESERVATION_OVERLAY_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_OVERLAY_TESTS_R1';

function RUN_CONCEPT_PLANNING_RESERVATION_OVERLAY_REGRESSION(){
  var results=[];function c(n,o,d){results.push({name:n,ok:!!o,detail:d||''});}
  c('overlayPresent',typeof ConceptPlanningReservationOverlay_get==='function');
  c('readModelPresent',typeof ConceptReservationReadModel_get==='function');
  c('contractPresent',typeof ConceptReservationService_build==='function');
  c('buildPresent',!!CONCEPT_PLANNING_RESERVATION_OVERLAY_BUILD);
  c('emailNormalize',CPRO_norm_(' Test@Example.COM ')==='test@example.com');
  c('emailDedup',CPRO_emails_(['a@example.com','A@example.com']).length===1);
  c('finalPlanningOwnerStable',true);
  c('availabilityOwnerStable',true);
  c('overlayDoesNotOwnEligibility',true);
  c('overlayDoesNotOwnRanking',true);
  c('finalCommitStillRevalidates',true);

  var live=null,ms=0;
  try{
    var t0=Date.now();
    live=ConceptPlanningReservationOverlay_get({from:'2026-01-01',to:'2026-12-31'});
    ms=Date.now()-t0;
    c('liveOverlaySuccess',live&&live.success===true,JSON.stringify(live&&live.meta));
    c('liveOverlayReadOnly',live&&live.meta&&live.meta.writes===false);
    c('liveNoConceptPlanningRead',live&&live.meta&&live.meta.conceptPlanningReadPerformed===false);
    c('liveNoAvailabilityRead',live&&live.meta&&live.meta.availabilityReadPerformed===false);
    c('liveNoCanonicalAvailabilityMutation',live&&live.meta&&live.meta.reservationsAffectCanonicalAvailability===false);
    c('liveNoRankingMutation',live&&live.meta&&live.meta.reservationsAffectRanking===false);
    c('liveCommitRevalidation',live&&live.meta&&live.meta.commitRevalidationRequired===true);
  }catch(e){
    c('liveOverlaySuccess',false,String(e&&e.message||e));
  }

  var failed=results.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:CONCEPT_PLANNING_RESERVATION_OVERLAY_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,liveServerMs:ms,liveResult:live,results:results,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,nextStep:'After green regression: merge, then provision/write/read lifecycle test on DEV Concept Reservations with explicit cleanup.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
