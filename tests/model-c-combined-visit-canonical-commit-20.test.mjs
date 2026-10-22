import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const planner=readFileSync(new URL('../ModelCCombinedVisitPlanner20.js',import.meta.url),'utf8');
const commit=readFileSync(new URL('../ModelCCombinedVisitCanonicalCommit20.js',import.meta.url),'utf8');
function sheet(data){
 const rows=data.map(r=>r.slice());
 return{rows,getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),
  getLastRow:()=>rows.length,appendRow:r=>rows.push(r.slice()),deleteRow:r=>rows.splice(r-1,1),
  getRange:(r,c,n,m)=>({getValues:()=>[rows[r-1].slice(c-1,c-1+m)],setValues:v=>{rows[r-1]=v[0].slice()}})};
}
function scenario(commitResult){
 const sheets={
  'Audit planning':sheet([['Audit ID','Status','Company_UID','Total audit time in hours','MPS-GAP','GRASP','Planning JSON'],['A1','Pending Planning','C1',4,'X','',''],['A2','Pending Planning','C1',2,'','X','']]),
  'Audit_Obligations':sheet([['Obligation_ID','Obligation_State','Company_UID','ScopeCode','Formal_Hours'],['O1','OPEN','C1','MPS-GAP',4],['O2','LINKED_TO_VISIT','C1','GRASP',2]]),
  'Audit_Visit_Obligations':sheet([['Audit_ID','Obligation_ID','Link_State','Unlinked_At','Linked_At'],['A1','O1','ACTIVE','',''],['A2','O2','ACTIVE','','']]),
  'Config_Scopes':sheet([['ScopeCode','DisplayName'],['MPS-GAP','MPS-GAP'],['GRASP','GRASP']])
 };
 const seen=[];let released=0;
 const ctx=vm.createContext({Date,AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_:false,
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},
  PlanningRevisionTokenService_getMany:()=>({byAuditId:{A1:'PRT1-'+'a'.repeat(40),A2:'PRT1-'+'b'.repeat(40)}}),
  PlanningCanonicalCommitService_commit:input=>{seen.push(input);return commitResult},
  __mp_invalidateAuditPlanningPack_:()=>{}});
 vm.runInContext(planner,ctx);vm.runInContext(commit,ctx);
 const input={runtimeEnv:'DEV',actorRole:'MANAGER',actorEmail:'m@example.test',targetAuditId:'A1',sourceAuditIds:['A2'],auditorEmail:'a@example.test',blocks:[{date:'2026-11-07',start:'09:00',end:'15:00',hours:6}],expectedRevisionsByAudit:{A1:'PRT1-'+'a'.repeat(40),A2:'PRT1-'+'b'.repeat(40)}};
 return{sheets,seen,ctx,input,get released(){return released}};
}
const ok=scenario({success:true,committed:true,meta:{postCommitRepairRequired:false}}),result=ok.ctx.ModelCCombinedVisitCanonicalCommit20_execute(ok.input);
assert.equal(result.committed,true);
assert.equal(ok.sheets['Audit planning'].rows[1][3],6);
assert.equal(ok.sheets['Audit planning'].rows[2][0],'');
assert.equal(ok.sheets['Audit_Visit_Obligations'].rows[2][2],'INACTIVE');
assert.equal(ok.sheets['Audit_Visit_Obligations'].rows[3][0],'A1');
assert.equal(ok.seen[0].combinedVisitComposition.sourceAuditIds[0],'A2');
assert.equal(ok.ctx.AMS_EXTERNAL_MANAGER_ACTION_LOCK_HELD_,false);
assert.equal(ok.released,1);
const failed=scenario({success:false,committed:false,reason:'CONCEPT_STALE_CANONICAL_STATUS',meta:{}});
const before=JSON.stringify(Object.fromEntries(Object.entries(failed.sheets).map(([k,v])=>[k,v.rows])));
const declined=failed.ctx.ModelCCombinedVisitCanonicalCommit20_execute(failed.input);
assert.equal(declined.committed,false);assert.equal(declined.rolledBack,true);
assert.equal(JSON.stringify(Object.fromEntries(Object.entries(failed.sheets).map(([k,v])=>[k,v.rows]))),before);
assert.equal(failed.released,1);
const stale=scenario({success:true,committed:true,meta:{}});
stale.input.expectedRevisionsByAudit.A1='PRT1-'+'c'.repeat(40);
const conflict=stale.ctx.ModelCCombinedVisitCanonicalCommit20_execute(stale.input);
assert.equal(conflict.committed,false);assert.match(conflict.error,/REVISION_CONFLICT/);
console.log('MODEL_C_COMBINED_CANONICAL_COMMIT: PASS success rollback stale revision and lock release');
