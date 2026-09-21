/** AMS-01.6 — planning-window hard-block acceptance. READ-ONLY. */
var MODEL_C_WINDOW_HARD_BLOCK_ACCEPTANCE_BUILD='2026-09-21_AMS_01_6_MODEL_C_WINDOW_HARD_BLOCK_ACCEPTANCE_R1';

function RUN_MODEL_C_PLANNING_WINDOW_HARD_BLOCK_ACCEPTANCE(){
  var errors=[];
  var conflict={
    success:true,
    startDate:'2027-01-01',
    endDate:'2027-03-31',
    mode:'MODEL_C_UNION_RENDER_HARD_BLOCK',
    source:'Audit_Obligations',
    hardBlock:true,
    activeScopes:['TEST_A','TEST_B'],
    scopeWindows:[
      {scope:'TEST_A',start:'2027-01-01',end:'2027-01-31'},
      {scope:'TEST_B',start:'2027-03-01',end:'2027-03-31'}
    ],
    warnings:[{
      code:'SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION',
      severity:'ERROR',
      message:'Planning windows have no intersection; planning must be blocked.'
    }]
  };

  var verdict=CPV_planningWindowFromResolved_({
    auditId:'TEST_AUDIT',
    auditorEmail:'test@example.com',
    requiredScopes:['TEST_A','TEST_B'],
    blocks:[{date:'2027-01-15',start:'09:00',end:'17:00'}]
  },conflict);

  var aggregate=CanonicalValidator_aggregate([verdict]);
  var decision=PCP_decisionFromAggregate_(aggregate,false);

  var normal=CPV_planningWindowFromResolved_({
    auditId:'TEST_AUDIT_OK',
    auditorEmail:'test@example.com',
    requiredScopes:['TEST_A','TEST_B'],
    blocks:[{date:'2027-02-15',start:'09:00',end:'17:00'}]
  },{
    success:true,
    startDate:'2027-02-01',
    endDate:'2027-02-28',
    mode:'MODEL_C_INTERSECTION',
    source:'Audit_Obligations',
    hardBlock:false,
    activeScopes:['TEST_A','TEST_B'],
    scopeWindows:[
      {scope:'TEST_A',start:'2027-01-01',end:'2027-02-28'},
      {scope:'TEST_B',start:'2027-02-01',end:'2027-03-31'}
    ],
    warnings:[]
  });

  if(!verdict||String(verdict.level||'').toUpperCase()!=='HARD_BLOCK')errors.push('Conflict verdict is not HARD_BLOCK');
  if(String(verdict.ruleCode||'')!=='SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION')errors.push('Wrong conflict rule code');
  if(decision.canCommit!==false)errors.push('Commit decision incorrectly allows conflict');
  if(String(decision.level||'').toUpperCase()!=='HARD_BLOCK')errors.push('Preflight decision is not HARD_BLOCK');
  if(!normal||String(normal.level||'').toUpperCase()!=='OK')errors.push('Normal intersecting window no longer returns OK');

  var out={
    success:errors.length===0,
    build:MODEL_C_WINDOW_HARD_BLOCK_ACCEPTANCE_BUILD,
    ownerBuild:typeof MODEL_C_PLANNING_WINDOW_HARD_BLOCK_BUILD!=='undefined'?MODEL_C_PLANNING_WINDOW_HARD_BLOCK_BUILD:'MISSING',
    readOnly:true,
    writesPerformed:false,
    gates:{
      emptyIntersectionHardBlocks:verdict&&String(verdict.level||'').toUpperCase()==='HARD_BLOCK',
      commitPreflightCannotProceed:decision&&decision.canCommit===false&&String(decision.level||'').toUpperCase()==='HARD_BLOCK',
      normalIntersectionStillAllowed:normal&&String(normal.level||'').toUpperCase()==='OK'
    },
    conflictVerdict:verdict,
    commitDecision:decision,
    normalVerdict:normal,
    errors:errors
  };
  Logger.log(JSON.stringify(out,null,2));
  if(!out.success)throw new Error('Model C planning-window hard-block acceptance failed');
  return out;
}
