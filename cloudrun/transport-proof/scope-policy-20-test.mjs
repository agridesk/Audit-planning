import assert from 'node:assert/strict';
import {updateScopePolicy20} from './scope-policy-20.js';
const headers=['ScopeCode','Max number audits','Min_Interval_Months','Max_Offsite_Hours','Planning from','Planning to','Active','Archived','Extension','Recurring'];
const values=[headers,['MPS-GAP','4','12','2','-6','3','TRUE','FALSE','4','YES']];
let writes=null;
globalThis.fetch=async(url,opts)=>{if(url.includes('?fields='))return{ok:true,json:async()=>({sheets:[{properties:{title:'Config_Scopes',sheetId:42}}]})};writes=JSON.parse(opts.body);return{ok:true,status:200};};
const deps={SID:'dev',actor:{email:'manager@example.com'},sheetsBatchGet:async()=>[{values}],accessToken:async()=> 'token',clean:x=>String(x??'').trim()};
const body={scopeCode:'MPS-GAP',field:'Min_Interval_Months',expected:'12',value:'13',reason:'New planning requirement',impactConfirmed:true};
const result=await updateScopePolicy20({...deps,body});
assert.equal(result.ok,true);assert.equal(writes.requests[0].updateCells.start.columnIndex,2);
await assert.rejects(updateScopePolicy20({...deps,body:{...body,expected:'11'}}),/STALE_SCOPE_POLICY/);
await assert.rejects(updateScopePolicy20({...deps,body:{...body,impactConfirmed:false}}),/INVALID_POLICY_CHANGE/);
await assert.rejects(updateScopePolicy20({...deps,body:{...body,value:'1.5'}}),/INVALID_POLICY_VALUE/);
await assert.rejects(updateScopePolicy20({...deps,body:{...body,field:'Unapproved setting'}}),/INVALID_POLICY_CHANGE/);
const extension=await updateScopePolicy20({...deps,body:{scopeCode:'MPS-GAP',field:'Extension',expected:'4',value:'6',reason:'Extend policy window',impactConfirmed:true}});
assert.equal(extension.ok,true);assert.equal(writes.requests[0].updateCells.start.columnIndex,8);
assert.equal(writes.requests[0].updateCells.rows[0].values[0].userEnteredValue.numberValue,6);
await assert.rejects(updateScopePolicy20({...deps,body:{scopeCode:'MPS-GAP',field:'Extension',expected:'4',value:'6.5',reason:'Invalid fractional months',impactConfirmed:true}}),/INVALID_POLICY_VALUE/);
const recurring=await updateScopePolicy20({...deps,body:{scopeCode:'MPS-GAP',field:'Recurring',expected:'YES',value:'NO',reason:'Rule updated',impactConfirmed:true}});
assert.equal(recurring.ok,true);
await assert.rejects(updateScopePolicy20({...deps,body:{scopeCode:'MPS-GAP',field:'Recurring',expected:'YES',value:'MAYBE',reason:'Invalid',impactConfirmed:true}}),/INVALID_RECURRING_VALUE/);
const fullHeaders=[...headers,'Obligation cycle','Complete by','Provisioning source','Trigger source','Source service'];
const fullRow=[...values[1],'','','','',''];
const fullDeps={...deps,sheetsBatchGet:async()=>[{values:[fullHeaders,fullRow]}]};
for(const field of ['Obligation cycle','Complete by','Provisioning source','Trigger source','Source service']){
 const result=await updateScopePolicy20({...fullDeps,body:{scopeCode:'MPS-GAP',field,expected:'',value:'Configured',reason:'Policy configuration',impactConfirmed:true}});
 assert.equal(result.ok,true);
}
// Native boolean round-trips: legacy Yes/No and native boolean both compare canonically.
const booleanHeaders=['ScopeCode','Active','Archived'];
const cases=[
 {existing:'No',expected:'FALSE',next:'TRUE',flag:'Active',bool:true},
 {existing:'Yes',expected:'TRUE',next:'FALSE',flag:'Active',bool:false},
 {existing:false,expected:'No',next:'Yes',flag:'Archived',bool:true},
 {existing:true,expected:'Yes',next:'No',flag:'Archived',bool:false}
];
for(const c of cases){
 const header=booleanHeaders.indexOf(c.flag);
 const sample=[booleanHeaders,['TESTSCOPE-2',c.flag==='Active'?c.existing:false,c.flag==='Archived'?c.existing:false]];
 await updateScopePolicy20({...deps,sheetsBatchGet:async()=>[{values:sample}],body:{scopeCode:'TESTSCOPE-2',field:c.flag,expected:c.expected,value:c.next,reason:'Native boolean regression',impactConfirmed:true}});
 assert.deepEqual(writes.requests[0].updateCells.rows[0].values[0].userEnteredValue,{boolValue:c.bool});
 assert.equal(writes.requests[0].updateCells.start.columnIndex,header);
}
const nativeUnchanged=await updateScopePolicy20({...deps,sheetsBatchGet:async()=>[{values:[booleanHeaders,['TESTSCOPE-2',false,false]]}],body:{scopeCode:'TESTSCOPE-2',field:'Active',expected:'FALSE',value:'NO',reason:'Native boolean regression',impactConfirmed:true}});
assert.equal(nativeUnchanged.unchanged,true);
await assert.rejects(updateScopePolicy20({...deps,sheetsBatchGet:async()=>[{values:[booleanHeaders,['TESTSCOPE-2',true,false]]}],body:{scopeCode:'TESTSCOPE-2',field:'Active',expected:'FALSE',value:'YES',reason:'Native boolean regression',impactConfirmed:true}}),/STALE_SCOPE_POLICY/);

// Rotation rules use canonical W/X/Y, preserving legacy J in the same atomic batch.
const rotationHeaders=['ScopeCode','Max number audits','Rotation_Normal_Maximum','Rotation_Applies','Rotation_Plus_One_Permitted','Planning from','Planning to','Recurring'];
const rotationRows=[rotationHeaders,['TESTSCOPE-2',3,3,true,false,-4,-1,'NO']];
const rotationDeps={...deps,sheetsBatchGet:async()=>[{values:rotationRows}]};
await updateScopePolicy20({...rotationDeps,body:{scopeCode:'TESTSCOPE-2',field:'Rotation_Normal_Maximum',expected:'3',value:'4',reason:'Rotation policy',impactConfirmed:true}});
assert.equal(writes.requests.length,2,'Canonical W and legacy J must be written atomically');
assert.equal(writes.requests[0].updateCells.start.columnIndex,2);
assert.deepEqual(writes.requests[0].updateCells.rows[0].values[0].userEnteredValue,{numberValue:4});
assert.equal(writes.requests[1].updateCells.start.columnIndex,1);
assert.deepEqual(writes.requests[1].updateCells.rows[0].values[0].userEnteredValue,{numberValue:4});
for(const [field,expected,value,bool] of [
 ['Rotation_Applies','TRUE','FALSE',false],
 ['Rotation_Plus_One_Permitted','FALSE','TRUE',true]
]){
 await updateScopePolicy20({...rotationDeps,body:{scopeCode:'TESTSCOPE-2',field,expected,value,reason:'Rotation policy',impactConfirmed:true}});
 assert.deepEqual(writes.requests[0].updateCells.rows[0].values[0].userEnteredValue,{boolValue:bool},field);
}
for(const [field,expected,value,asNumber] of [
 ['Planning from','-4','-5',-5],
 ['Planning to','-1','0',0]
]){
 await updateScopePolicy20({...rotationDeps,body:{scopeCode:'TESTSCOPE-2',field,expected,value,reason:'Planning offset',impactConfirmed:true}});
 assert.deepEqual(writes.requests[0].updateCells.rows[0].values[0].userEnteredValue,{numberValue:asNumber},field);
}
await updateScopePolicy20({...rotationDeps,body:{scopeCode:'TESTSCOPE-2',field:'Recurring',expected:'NO',value:'YES',reason:'Recurring toggle',impactConfirmed:true}});
assert.deepEqual(writes.requests[0].updateCells.rows[0].values[0].userEnteredValue,{stringValue:'YES'});
console.log('scope-policy-20: 15 checks passed');
