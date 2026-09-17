/**
 * FILE: BatchPlanningConceptEngineTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_CONCEPT_ENGINE_TESTS_R1_ROUTE_CHAIN
 * RUN: RUN_BATCH_PLANNING_CONCEPT_ENGINE_REGRESSION
 */
var BATCH_PLANNING_CONCEPT_ENGINE_TEST_BUILD='2026-09-17_BATCH_PLANNING_CONCEPT_ENGINE_TESTS_R1_ROUTE_CHAIN';
function RUN_BATCH_PLANNING_CONCEPT_ENGINE_REGRESSION(){
 var results=[];function test(name,fn){try{var ok=!!fn();results.push({name:name,ok:ok,detail:ok?'':'Contract failed'});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}
 var src=String(BatchPlanningConceptEngine_Generate)+String(BatchPlanningConceptEngine_boundaries_);
 test('engineAvailable',function(){return typeof BatchPlanningConceptEngine_Generate==='function';});
 test('candidateEngineCanonical',function(){return src.indexOf('BatchPlanningCandidateEngine_Collect')>=0;});
 test('routeMatrixCanonical',function(){return src.indexOf('BatchPlanningRouteMatrix_Get')>=0;});
 test('oneIdealConcept',function(){return src.indexOf('oneIdealConceptPlan:true')>=0;});
 test('travelTimeLeading',function(){return src.indexOf('durationSeconds')>=0&&src.indexOf('travelTimeLeading:true')>=0;});
 test('distanceSecondary',function(){return src.indexOf('distanceMeters')>=0&&src.indexOf('distanceInformational:true')>=0;});
 test('openRouteInboundOutbound',function(){return src.indexOf('inboundPoint')>=0&&src.indexOf('outboundPoint')>=0;});
 test('previousNextAnchors',function(){return src.indexOf('previousPlannedStop')>=0&&src.indexOf('nextPlannedStop')>=0;});
 test('homeFallback',function(){return src.indexOf('defaultDepartureFrom')>=0;});
 test('plannerControl',function(){return src.indexOf('plannerControlsFinalSelection:true')>=0&&src.indexOf('manualDragDropAfterGeneration:true')>=0;});
 test('noAutoReoptimisation',function(){return src.indexOf('noAutomaticReoptimisationAfterPlannerMove:true')>=0;});
 test('unresolvedLocationsVisible',function(){return src.indexOf('AUDIT_LOCATION_UNRESOLVED')>=0;});
 test('unresolvedRoutesVisible',function(){return src.indexOf('ROUTE_UNRESOLVED')>=0&&src.indexOf('OUTBOUND_ROUTE_UNRESOLVED')>=0;});
 test('noPlanningWrites',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});
 var a=BatchPlanningConceptEngine_boundaries_({home:'Valencia'},{defaultDepartureFrom:'Madrid'});
 test('explicitHomeWins',function(){return a.home.label==='Valencia'&&a.inbound.label==='Valencia'&&a.outbound.label==='Valencia';});
 var b=BatchPlanningConceptEngine_boundaries_({inboundPoint:'Lisbon Airport',outboundPoint:'Porto Airport'},{defaultDepartureFrom:'Valencia'});
 test('independentOverrides',function(){return b.home.label==='Valencia'&&b.inbound.label==='Lisbon Airport'&&b.outbound.label==='Porto Airport'&&b.inboundSource==='PLANNER_OVERRIDE'&&b.outboundSource==='PLANNER_OVERRIDE';});
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:BATCH_PLANNING_CONCEPT_ENGINE_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'First Batch Planning concept engine builds one advisory open route between independent inbound/outbound boundaries using the canonical candidate engine and cached Google route matrix. Planner drag/drop and final confirmation remain leading.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
