/**
 * FILE: BatchPlanningCandidateEngineTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_CANDIDATE_ENGINE_TESTS_R2_AVAILABILITY_ROTATION
 * RUN: RUN_BATCH_PLANNING_CANDIDATE_ENGINE_REGRESSION
 */
var BATCH_PLANNING_CANDIDATE_ENGINE_TEST_BUILD='2026-09-17_BATCH_PLANNING_CANDIDATE_ENGINE_TESTS_R2_AVAILABILITY_ROTATION';
function RUN_BATCH_PLANNING_CANDIDATE_ENGINE_REGRESSION(){
 var results=[];function test(name,fn){try{var ok=!!fn();results.push({name:name,ok:ok,detail:ok?'':'Contract failed'});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}
 var src=String(BatchPlanningCandidateEngine_Collect)+String(BatchPlanningCandidateEngine_availability_)+String(BatchPlanningCandidateEngine_rotation_)+String(BatchPlanningCandidateEngine_schedulableDays_)+String(BatchPlanningCandidateEngine_result_);
 test('collectorAvailable',function(){return typeof BatchPlanningCandidateEngine_Collect==='function';});
 test('planningWindowLeading',function(){return src.indexOf('OUTSIDE_PLANNING_WINDOW')>=0;});
 test('pendingPlanningOnly',function(){return src.indexOf("status!=='Pending Planning'")>=0;});
 test('qualificationHardGate',function(){return src.indexOf('AuditorsIndex_IsQualified')>=0&&src.indexOf('AUDITOR_NOT_QUALIFIED')>=0;});
 test('hoursToBePlannedCanonical',function(){return src.indexOf("'Hours to be planned'")>=0&&src.indexOf('hoursToBePlanned')>=0;});
 test('availabilityCanonicalOwner',function(){return src.indexOf('AvailabilityService.loadAuditorAvailabilityMap')>=0&&src.indexOf("availabilityOwner:'AvailabilityService'")>=0;});
 test('availabilityHardGate',function(){return src.indexOf('NO_HARD_AVAILABLE_DAY')>=0;});
 test('softAvailabilityAdvisory',function(){return src.indexOf('SOFT_AVAILABILITY_DAYS_PRESENT')>=0;});
 test('rotationCanonicalOwner',function(){return src.indexOf('RotationAuditorService_getAuditorScopeResult')>=0&&src.indexOf("rotationOwner:'RotationAuditorService'")>=0;});
 test('rotationUsesApprovedEvaluator',function(){return src.indexOf('BatchPlanning_evaluateRotation_')>=0;});
 test('rotationHardGate',function(){return src.indexOf('ROTATION_HARD_BLOCK')>=0;});
 test('rotationExceptionAdvisory',function(){return src.indexOf('ROTATION_EXCEPTION_REQUIRED')>=0;});
 test('preferredMonthsSoftOnly',function(){return src.indexOf('OUTSIDE_PREFERRED_AUDIT_MONTHS')>=0;});
 test('routeStillPending',function(){return src.indexOf('routeMatrixPending:true')>=0;});
 test('readOnlyNoPlanningWrites',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});
 var evOk=BatchPlanning_evaluateRotation_(1,3),evWarn=BatchPlanning_evaluateRotation_(3,3),evHard=BatchPlanning_evaluateRotation_(4,3);
 test('rotationDynamicExample',function(){return evOk.status==='OK'&&evWarn.status==='WARNING'&&evWarn.exceptionRequired===true&&evHard.status==='HARD_BLOCK';});
 var directory=AuditorsIndex_GetDirectory(false),auditors=directory&&directory.list?directory.list:[],live=null;
 if(auditors.length){var from=new Date(),to=new Date(from.getTime());to.setDate(to.getDate()+180);live=BatchPlanningCandidateEngine_Collect({auditorEmail:auditors[0].email,periodFrom:from,periodTo:to});}
 test('liveCollectorRuns',function(){return auditors.length===0||(live&&live.ok===true);});
 test('liveCanonicalOwners',function(){return auditors.length===0||(live&&live.availabilityOwner==='AvailabilityService'&&live.rotationOwner==='RotationAuditorService');});
 test('liveReadOnly',function(){return auditors.length===0||(live&&live.writesPerformed===false);});
 test('liveCandidatesHaveAvailability',function(){return auditors.length===0||(live.candidates||[]).every(function(c){return Array.isArray(c.hardAvailableDays)&&c.hardAvailableDays.length>0;});});
 test('liveCandidatesHaveRotation',function(){return auditors.length===0||(live.candidates||[]).every(function(c){return c.rotation&&c.rotation.owner==='RotationAuditorService'&&c.rotation.hardBlock===false;});});
 test('liveCandidatesRespectWindow',function(){return auditors.length===0||(live.candidates||[]).every(function(c){return c.schedulableFrom>=live.period.from&&c.schedulableTo<=live.period.to&&c.schedulableFrom>=c.planningWindowFrom&&c.schedulableTo<=c.planningWindowTo;});});
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:BATCH_PLANNING_CANDIDATE_ENGINE_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,contract:'Batch Planning candidates now use canonical AvailabilityService and RotationAuditorService. Hard Availability and rotation hard block reject; soft Availability and max+1 rotation exception remain advisory. Route matrix remains next integration.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
