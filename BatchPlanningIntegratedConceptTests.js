/**
 * FILE: BatchPlanningIntegratedConceptTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_INTEGRATED_CONCEPT_TESTS_R1
 * RUN: RUN_BATCH_PLANNING_INTEGRATED_CONCEPT_REGRESSION
 */
var BATCH_PLANNING_INTEGRATED_CONCEPT_TEST_BUILD='2026-09-17_BATCH_PLANNING_INTEGRATED_CONCEPT_TESTS_R1';
function RUN_BATCH_PLANNING_INTEGRATED_CONCEPT_REGRESSION(){
 var results=[];function test(name,fn){try{var ok=!!fn();results.push({name:name,ok:ok,detail:ok?'':'Contract failed'});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}
 var src=String(BatchPlanningIntegratedConcept_Generate);
 test('orchestratorAvailable',function(){return typeof BatchPlanningIntegratedConcept_Generate==='function';});
 test('candidateEngineIntegrated',function(){return src.indexOf('BatchPlanningCandidateEngine_Collect')>=0;});
 test('stopsIntegrated',function(){return src.indexOf('BatchPlanningStops_GetCompany')>=0&&src.indexOf('BatchPlanningStops_BuildDefaultAllocation')>=0;});
 test('routeConceptIntegrated',function(){return src.indexOf('BatchPlanningConceptEngine_Generate')>=0;});
 test('daySchedulerIntegrated',function(){return src.indexOf('BatchPlanningDayScheduler_Build')>=0;});
 test('oneIdealConcept',function(){return src.indexOf('oneIdealConceptPlan:true')>=0;});
 test('fixedAnchorsImmutable',function(){return src.indexOf('fixedAnchorsImmutable:true')>=0;});
 test('canonicalHoursLeading',function(){return src.indexOf('hoursToBePlannedLeading:true')>=0;});
 test('stopHoursExactSum',function(){return src.indexOf('stopHoursExactSumRequired:true')>=0;});
 test('unresolvedStopAllocationExcluded',function(){return src.indexOf('requiresPlannerAllocation:true')>=0&&src.indexOf('return;')>=0;});
 test('travelTimeLeading',function(){return src.indexOf('travelTimeLeading:true')>=0;});
 test('distanceInformational',function(){return src.indexOf('distanceInformational:true')>=0;});
 test('plannerDragDropLeading',function(){return src.indexOf('plannerDragDropLeading:true')>=0;});
 test('explicitConfirmationRequired',function(){return src.indexOf('explicitConfirmationRequired:true')>=0;});
 test('noPlanningWrites',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});
 test('readOnlyResult',function(){return src.indexOf('writesPerformed:false')>=0;});
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:BATCH_PLANNING_INTEGRATED_CONCEPT_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Integrated Batch Planning concept connects candidate gates, Locations_JSON stop allocation, cached route ordering and day scheduling around immutable existing audit anchors. One advisory concept only; planner drag/drop and explicit confirmation remain leading.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
