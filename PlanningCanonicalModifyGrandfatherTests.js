/***********************************************************************
 * PlanningCanonicalModifyGrandfatherTests.js
 * BUILD: 2026-09-14_CANONICAL_MODIFY_GRANDFATHER_TESTS_R2
 *
 * Non-destructive regression for the Modify-only planning-window exception.
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD='2026-09-14_CANONICAL_MODIFY_GRANDFATHER_TESTS_R2';

function PCMOD_TEST_rowInfo_(oldDates){
  var planning={blocks:(oldDates||[]).map(function(d){return{date:d,start:'08:30',end:'16:30'};}),auditorEmail:'auditor@example.com',auditorName:'Auditor'};
  return{ctx:{colJson:1,colAssigned:2},row:[JSON.stringify(planning),'auditor@example.com']};
}
function PCMOD_TEST_gate_(extraHard){
  var verdicts=[{kind:'PLANNING_WINDOW',level:'HARD_BLOCK',ruleCode:'PLANNING_WINDOW_OUTSIDE',reason:'outside',evidence:{from:'2026-05-20',to:'2026-08-20'}}];
  if(extraHard)verdicts.push({kind:'AVAILABILITY',level:'HARD_BLOCK',ruleCode:'AVAILABILITY_CONFLICT',reason:'busy'});
  return{revisionAccepted:true,canCommit:false,reason:'HARD_BLOCK',preflight:{validatorResult:{verdicts:verdicts}}};
}
function PCMOD_TEST_blocks_(dates){return(dates||[]).map(function(d){return{date:d,start:'08:30',end:'16:30'};});}

function RUN_PLANNING_CANONICAL_MODIFY_GRANDFATHER_REGRESSION(){
  var results=[];
  function t(name,fn){try{var x=fn();results.push({name:name,ok:x===true,detail:x===true?'':String(x)});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}

  t('salm_17_18_sep_to_10_11_sep_allowed',function(){
    var x=PCMOD_grandfatherWindow_(PCMOD_TEST_gate_(false),PCMOD_TEST_rowInfo_(['2026-09-17','2026-09-18']),PCMOD_TEST_blocks_(['2026-09-10','2026-09-11']));
    return x.allowed===true&&x.oldMaxDays===29&&x.newMaxDays===22;
  });
  t('salm_17_18_sep_to_1_2_oct_allowed',function(){
    var x=PCMOD_grandfatherWindow_(PCMOD_TEST_gate_(false),PCMOD_TEST_rowInfo_(['2026-09-17','2026-09-18']),PCMOD_TEST_blocks_(['2026-10-01','2026-10-02']));
    return x.allowed===true&&x.oldMaxDays===29&&x.newMaxDays===43&&x.reason==='GRANDFATHERED_EXISTING_OUTSIDE_WINDOW_MODIFY';
  });
  t('existing_inside_window_gets_no_exception',function(){
    var x=PCMOD_grandfatherWindow_(PCMOD_TEST_gate_(false),PCMOD_TEST_rowInfo_(['2026-08-10','2026-08-11']),PCMOD_TEST_blocks_(['2026-09-10','2026-09-11']));
    return x.allowed===false&&x.reason==='EXISTING_PLANNING_NOT_OUTSIDE_WINDOW';
  });
  t('availability_hard_block_never_overridden',function(){
    var x=PCMOD_grandfatherWindow_(PCMOD_TEST_gate_(true),PCMOD_TEST_rowInfo_(['2026-09-17','2026-09-18']),PCMOD_TEST_blocks_(['2026-10-01','2026-10-02']));
    return x.allowed===false&&x.reason==='OTHER_HARD_BLOCKS';
  });
  t('revision_conflict_never_overridden',function(){
    var g=PCMOD_TEST_gate_(false);g.revisionAccepted=false;
    var x=PCMOD_grandfatherWindow_(g,PCMOD_TEST_rowInfo_(['2026-09-17','2026-09-18']),PCMOD_TEST_blocks_(['2026-10-01','2026-10-02']));
    return x.allowed===false&&x.reason==='GATE_NOT_ELIGIBLE';
  });
  t('moving_into_window_allowed',function(){
    var x=PCMOD_grandfatherWindow_(PCMOD_TEST_gate_(false),PCMOD_TEST_rowInfo_(['2026-09-17','2026-09-18']),PCMOD_TEST_blocks_(['2026-08-18','2026-08-19']));
    return x.allowed===true&&x.newMaxDays===0;
  });

  var failed=results.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Modify-only: an audit whose existing canonical planning is already outside the planning window may be rescheduled outside that window. Other hard blocks and revision conflicts remain hard. New/inside-window planning keeps normal planning-window enforcement.'}};
  console.log(JSON.stringify(out,null,2));
  return out;
}
