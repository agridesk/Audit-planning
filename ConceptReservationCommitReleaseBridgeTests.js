/***********************************************************************
 * ConceptReservationCommitReleaseBridgeTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_TESTS_R1
 ***********************************************************************/
var CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_TESTS_R1';
function RUN_CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_REGRESSION(){
  var r=[];function c(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  c('bridgePresent',typeof ConceptReservationCommitReleaseBridge_releaseLocked==='function');
  c('commandHelpersPresent',typeof CRCS_sheet_==='function'&&typeof CRCS_findRow_==='function'&&typeof CRCS_headerMap_==='function');
  c('buildPresent',!!CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_BUILD);
  var nf=null,err='';try{nf=ConceptReservationCommitReleaseBridge_releaseLocked({auditId:'__NO_SUCH_AUDIT__',dryRun:true});}catch(e){err=String(e&&e.message||e);}
  c('notFoundSafe',nf&&nf.success===true&&nf.released===false&&nf.reason==='NOT_FOUND',err||JSON.stringify(nf));
  var m=nf&&nf.meta||{};
  c('callerOwnsLock',m.callerOwnsLock===true);
  c('noNestedLock',m.nestedLock===false);
  c('noFinalPlanningWrites',m.finalPlanningWrites===false);
  c('noAvailabilityWrites',m.availabilityWrites===false);
  c('noStatusWrites',m.statusWrites===false);
  c('notFoundNoWrite',m.writes===false);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:CONCEPT_RESERVATION_COMMIT_RELEASE_BRIDGE_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,nextStep:'Wire bridge only after successful canonical commit under existing planning lock.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
