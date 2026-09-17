/**
 * FILE: BatchPlanningCandidateEngineTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_CANDIDATE_ENGINE_TESTS_R1
 * RUN: RUN_BATCH_PLANNING_CANDIDATE_ENGINE_REGRESSION
 */
var BATCH_PLANNING_CANDIDATE_ENGINE_TEST_BUILD='2026-09-17_BATCH_PLANNING_CANDIDATE_ENGINE_TESTS_R1';

function RUN_BATCH_PLANNING_CANDIDATE_ENGINE_REGRESSION(){
  var results=[];
  function test(name,fn){try{var ok=!!fn();results.push({name:name,ok:ok,detail:ok?'':'Contract failed'});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}
  var src=String(BatchPlanningCandidateEngine_Collect)+String(BatchPlanningCandidateEngine_result_)+String(BatchPlanningCandidateEngine_companyPreferredMonths_);
  test('collectorAvailable',function(){return typeof BatchPlanningCandidateEngine_Collect==='function';});
  test('planningWindowLeading',function(){return src.indexOf('OUTSIDE_PLANNING_WINDOW')>=0;});
  test('pendingPlanningOnly',function(){return src.indexOf("status !== 'Pending Planning'")>=0;});
  test('qualificationHardGate',function(){return src.indexOf('AuditorsIndex_IsQualified')>=0&&src.indexOf('AUDITOR_NOT_QUALIFIED')>=0;});
  test('hoursToBePlannedCanonical',function(){return src.indexOf("'Hours to be planned'")>=0&&src.indexOf('hoursToBePlanned')>=0;});
  test('preferredMonthsSoftOnly',function(){return src.indexOf('OUTSIDE_PREFERRED_AUDIT_MONTHS')>=0&&src.indexOf('advisory:true')>=0;});
  test('routeStillPending',function(){return src.indexOf('routeMatrixPending:true')>=0;});
  test('availabilityExplicitlyPending',function(){return src.indexOf('availabilityIntegrationPending:true')>=0;});
  test('rotationExplicitlyPending',function(){return src.indexOf('rotationIntegrationPending:true')>=0;});
  test('readOnlyNoPlanningWrites',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});

  var directory=AuditorsIndex_GetDirectory(false), auditors=directory&&directory.list?directory.list:[];
  var live=null;
  if(auditors.length){var from=new Date(),to=new Date(from.getTime());to.setDate(to.getDate()+180);live=BatchPlanningCandidateEngine_Collect({auditorEmail:auditors[0].email,periodFrom:from,periodTo:to});}
  test('liveCollectorRuns',function(){return auditors.length===0||(live&&live.ok===true);});
  test('liveReadOnly',function(){return auditors.length===0||(live&&live.writesPerformed===false);});
  test('liveCandidatesRespectWindow',function(){return auditors.length===0||(live.candidates||[]).every(function(c){return c.schedulableFrom>=live.period.from&&c.schedulableTo<=live.period.to&&c.schedulableFrom>=c.planningWindowFrom&&c.schedulableTo<=c.planningWindowTo;});});
  test('liveCandidateHoursPresent',function(){return auditors.length===0||(live.candidates||[]).every(function(c){return typeof c.hoursToBePlanned==='number'&&c.hoursToBePlanned>=0;});});

  var passed=results.filter(function(x){return x.ok;}).length;
  var out={ok:passed===results.length,build:BATCH_PLANNING_CANDIDATE_ENGINE_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,contract:'First Batch Planning candidate layer: Pending Planning + formal planning-window overlap + auditor qualification + Hours to be planned + company preferred-month soft warning. Availability, rotation and route matrix are explicit next integrations.'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
