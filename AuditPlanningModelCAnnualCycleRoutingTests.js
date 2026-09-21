/** AMS-01.6 Model C annual-cycle runtime routing acceptance. */
var MODEL_C_ANNUAL_CYCLE_ROUTING_TEST_BUILD='2026-09-21_AMS_01_6_MODEL_C_ANNUAL_CYCLE_ROUTING_TEST_R2_NON_RECURRING_RUNTIME';
var MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID='AUD_TEST_AcceptedDelta_HQ_1777979469906_101';

function RUN_MODEL_C_ANNUAL_CYCLE_ROUTE_ACCEPTANCE(){
  var ss=SpreadsheetApp.getActive();
  var out={success:false,build:MODEL_C_ANNUAL_CYCLE_ROUTING_TEST_BUILD,runtimeBuild:(typeof MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD!=='undefined'?MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD:''),writesPerformed:true,rolledBack:false,auditId:MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID,nonRecurringAuditId:'',gates:{},errors:[],successorSmoke:null,nonRecurringSmoke:null,finalizerSmoke:null,postRestore:null};
  var ap=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_PLANNING),obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!ap||!obSheet||!lkSheet){out.errors.push('Required sheet missing');Logger.log(JSON.stringify(out,null,2));return out;}

  out.gates.annualEntryPointResolved=typeof AnnualCycleEngineV5_HandleCompletionRow_==='function'&&String(AnnualCycleEngineV5_HandleCompletionRow_).indexOf('ModelCAnnualCycle_HandleCompletionRow_')>=0;
  out.gates.completionFinalizerResolved=typeof CompletionService_CommitCompletion==='function'&&String(CompletionService_CommitCompletion).indexOf('ModelCAnnualCycle_finalizeCompletedVisit_')>=0;
  out.gates.runtimeBuildPresent=typeof MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD!=='undefined'&&String(MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD).indexOf('MODEL_C_ANNUAL_CYCLE_RUNTIME')>=0;
  if(!out.gates.annualEntryPointResolved)out.errors.push('Annual-cycle entry point did not resolve to Model C runtime');
  if(!out.gates.completionFinalizerResolved)out.errors.push('CompletionService public entry point did not resolve to Model C finalizer wrapper');
  if(!out.gates.runtimeBuildPresent)out.errors.push('Model C annual-cycle runtime build marker missing');
  if(out.errors.length){Logger.log(JSON.stringify(out,null,2));return out;}

  var apSnap=ModelCScopeOwner_snapshotSheet_(ap),obSnap=ModelCScopeOwner_snapshotSheet_(obSheet),lkSnap=ModelCScopeOwner_snapshotSheet_(lkSheet);
  try{
    var values=ap.getDataRange().getValues(),headers=values[0]||[],rowIndex=ModelCAnnualCycle_findAuditRow_(values,headers,MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID);
    if(!rowIndex)throw new Error('Dedicated test audit not found');
    var row=values[rowIndex-1]||[],rowObj={};for(var c=0;c<headers.length;c++)rowObj[String(headers[c]||'')]=row[c];
    var beforePlan=ModelCAnnualCycle_planForAudit_(ss,MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID);
    if(!beforePlan.success)throw new Error('Dedicated audit successor plan failed: '+(beforePlan.errors||[]).join('; '));
    out.gates.abcExcludedFromSuccessor=(beforePlan.externalScopes||[]).indexOf('MPS-ABC')>=0&&(beforePlan.recurringScopes||[]).indexOf('MPS-ABC')<0;
    out.gates.gapGraspSuccessors=(beforePlan.recurringScopes||[]).indexOf('MPS-GAP')>=0&&(beforePlan.recurringScopes||[]).indexOf('GRASP')>=0&&Number(beforePlan.successorObligations||0)===2;

    var smoke=AnnualCycleEngineV5_HandleCompletionRow_(rowObj);
    out.successorSmoke=smoke;
    if(!smoke||smoke.success!==true)throw new Error('Model C annual-cycle runtime smoke failed: '+((smoke&&smoke.message)||'unknown'));
    var createdIds=(smoke.nextAuditIds||[]).slice();
    out.gates.successorVisitCreated=smoke.spawned===true&&createdIds.length===1;
    out.gates.modelCOwnerUsed=smoke.modelCOwner===true&&String(smoke.build||'')===String(MODEL_C_ANNUAL_CYCLE_RUNTIME_BUILD);

    var obNow=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),lkNow=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues());
    var newOb=obNow.filter(function(x){return createdIds.indexOf(String(x.Source_Audit_ID||''))>=0;});
    var newCodes=newOb.map(function(x){return String(x.ScopeCode||'');}).sort();
    out.gates.twoCanonicalSuccessorObligations=newOb.length===2&&newCodes.join('|')==='GRASP|MPS-GAP';
    out.gates.noAbcSuccessor=newCodes.indexOf('MPS-ABC')<0;
    out.gates.successorLinksActive=newOb.every(function(x){return lkNow.some(function(l){return String(l.Audit_ID||'')===createdIds[0]&&String(l.Obligation_ID||'')===String(x.Obligation_ID||'')&&String(l.Link_State||'').toUpperCase()==='ACTIVE';});});
    out.gates.perScopeSuccessorExpiry=newOb.every(function(x){var expected=(beforePlan.successorGroups[0].obligations||[]).filter(function(p){return String(p.scopeCode)===String(x.ScopeCode);})[0];return expected&&String(x.Base_Expiry_Date||'')===String(expected.baseExpiry||'')&&String(x.Planning_Window_From||'')===String(expected.planningWindowFrom||'')&&String(x.Planning_Window_To||'')===String(expected.planningWindowTo||'');});

    ModelCScopeOwner_restoreSnapshot_(apSnap);ModelCScopeOwner_restoreSnapshot_(obSnap);ModelCScopeOwner_restoreSnapshot_(lkSnap);SpreadsheetApp.flush();ModelCAnnualCycle_invalidateAuditPlanningCaches_();

    var nr=ModelCAnnualCycleRouting_findNonRecurringOnlyAudit_(ss);
    if(!nr||!nr.auditId)throw new Error('No non-recurring-only Model C audit found for runtime acceptance');
    out.nonRecurringAuditId=nr.auditId;
    var nrValues=ap.getDataRange().getValues(),nrHeaders=nrValues[0]||[],nrRowIndex=ModelCAnnualCycle_findAuditRow_(nrValues,nrHeaders,nr.auditId);
    if(!nrRowIndex)throw new Error('Non-recurring audit row not found: '+nr.auditId);
    var nrRow=nrValues[nrRowIndex-1]||[],nrObj={};for(var nc=0;nc<nrHeaders.length;nc++)nrObj[String(nrHeaders[nc]||'')]=nrRow[nc];
    var nrBeforeRows=ap.getLastRow(),nrBeforeOb=obSheet.getLastRow(),nrBeforeLinks=lkSheet.getLastRow();
    var nrSmoke=AnnualCycleEngineV5_HandleCompletionRow_(nrObj);out.nonRecurringSmoke=nrSmoke;
    out.gates.nonRecurringRuntimeNoSuccessor=!!nrSmoke&&nrSmoke.success===true&&nrSmoke.recurring===false&&nrSmoke.spawned===false&&nrSmoke.nextCycleEligible===false&&!(nrSmoke.nextAuditIds||[]).length;
    out.gates.nonRecurringRuntimeNoWrites=ap.getLastRow()===nrBeforeRows&&obSheet.getLastRow()===nrBeforeOb&&lkSheet.getLastRow()===nrBeforeLinks;
    out.gates.nonRecurringCycleKeyResolved=Number(ModelCToolkitCycle_yearForAudit_(ss,nr.auditId))===Number(nr.cycleYear);

    var finalObSnap=ModelCScopeOwner_snapshotSheet_(obSheet),finalLkSnap=ModelCScopeOwner_snapshotSheet_(lkSheet);
    try{
      var fin=ModelCAnnualCycle_finalizeCompletedVisit_(MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID);out.finalizerSmoke=fin;
      if(!fin||fin.success!==true||Number(fin.finalized||0)<1)throw new Error('Model C completion finalizer smoke failed: '+((fin&&fin.message)||'unknown'));
      var obFin=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),lkFin=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues()),linkedIds={};
      lkFin.forEach(function(l){if(String(l.Audit_ID||'')===MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID){linkedIds[String(l.Obligation_ID||'')]=true;}});
      out.gates.finalizerCompletesObligations=obFin.filter(function(x){return linkedIds[String(x.Obligation_ID||'')];}).every(function(x){return String(x.Obligation_State||'').toUpperCase()==='COMPLETED';});
      out.gates.finalizerUnlinksVisit=lkFin.filter(function(l){return String(l.Audit_ID||'')===MODEL_C_ANNUAL_CYCLE_TEST_AUDIT_ID;}).every(function(l){return String(l.Link_State||'').toUpperCase()==='INACTIVE';});
    }finally{
      ModelCScopeOwner_restoreSnapshot_(finalObSnap);ModelCScopeOwner_restoreSnapshot_(finalLkSnap);SpreadsheetApp.flush();
    }

    out.rolledBack=true;
    var post=RUN_MODEL_C_ANNUAL_CYCLE_PREFLIGHT();out.postRestore={success:!!(post&&post.success),counts:post&&post.counts?post.counts:{},errors:post&&post.errors?post.errors:[]};
    out.gates.postRestorePreflightGreen=!!(post&&post.success);
    out.success=Object.keys(out.gates).every(function(k){return out.gates[k]===true;})&&out.errors.length===0&&out.rolledBack;
    if(!out.success)Object.keys(out.gates).forEach(function(k){if(out.gates[k]!==true)out.errors.push('Gate failed: '+k);});
    Logger.log(JSON.stringify(out,null,2));return out;
  }catch(e){
    out.errors.push(String(e&&e.message?e.message:e));
    try{ModelCScopeOwner_restoreSnapshot_(apSnap);}catch(ignore1){}
    try{ModelCScopeOwner_restoreSnapshot_(obSnap);}catch(ignore2){}
    try{ModelCScopeOwner_restoreSnapshot_(lkSnap);}catch(ignore3){}
    SpreadsheetApp.flush();ModelCAnnualCycle_invalidateAuditPlanningCaches_();out.rolledBack=true;
    Logger.log(JSON.stringify(out,null,2));return out;
  }
}

function ModelCAnnualCycleRouting_findNonRecurringOnlyAudit_(ss){
  ss=ss||SpreadsheetApp.getActive();
  var obSheet=ss.getSheetByName(MODEL_C_SHEETS.AUDIT_OBLIGATIONS),lkSheet=ss.getSheetByName(MODEL_C_SHEETS.VISIT_OBLIGATIONS);
  if(!obSheet||!lkSheet)return null;
  var obs=ModelCMigration_rowsToObjects_(obSheet.getDataRange().getValues()),links=ModelCMigration_rowsToObjects_(lkSheet.getDataRange().getValues()),byId={},byAudit={};
  obs.forEach(function(ob){byId[String(ob.Obligation_ID||'')]=ob;});
  links.forEach(function(link){if(String(link.Link_State||'').toUpperCase()!=='ACTIVE')return;var aid=String(link.Audit_ID||''),ob=byId[String(link.Obligation_ID||'')];if(!aid||!ob)return;if(!byAudit[aid])byAudit[aid]=[];byAudit[aid].push(ob);});
  var ids=Object.keys(byAudit).sort();
  for(var i=0;i<ids.length;i++){
    var list=byAudit[ids[i]]||[],recurring=false,year='';
    for(var j=0;j<list.length;j++){
      if(ModelCRecurringConfig_isRecurring_(ss,String(list[j].ScopeCode||'')))recurring=true;
      var m=String(list[j].Cycle_Key||'').match(/^(\d{4})/);if(m&&!year)year=m[1];
    }
    if(!recurring&&year)return{auditId:ids[i],cycleYear:Number(year),obligations:list.length};
  }
  return null;
}
