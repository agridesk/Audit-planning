import assert from 'node:assert/strict';
import {updateScopeCertificationBody20} from './scope-certification-body-20.js';
const h=[
 ['SlotKey','ScopeCode','Certification_Body_ID','Active'],
 ['Certification_Body_ID','Active'],
 ['Company_Scope_ID','ScopeCode'],
 ['Obligation_ID','ScopeCode'],
 ['Audit ID','SCOPE_10','Scopes_List'],
 ['Audit ID','SCOPE_10']
];
const base=[
 [h[0],['SCOPE_10','TESTNAME10','ECAS',false]],
 [h[1],['ECAS',true],['OTHER',true],['INACTIVE',false]],
 [h[2]],
 [h[3]],
 [h[4]],
 [h[5]]
];
const deps={
 actor:{email:'manager@example.com'},SID:'dev',clean:x=>String(x??'').trim(),
 accessToken:async()=> 'token',
 sheetsBatchGet:async()=>base.map(values=>({values}))
};
const body={scopeCode:'TESTNAME10',expected:'ECAS',certificationBodyId:'OTHER',confirmation:'CHANGE_UNUSED_SCOPE_CB'};
let updates=[];
globalThis.fetch=async(url,opts)=>{
 if(url.includes('?fields='))return{ok:true,json:async()=>({sheets:[{properties:{title:'Config_Scopes',sheetId:42}}]})};
 updates=JSON.parse(opts.body).requests;return{ok:true,status:200};
};
let result=await updateScopeCertificationBody20({...deps,body});
assert.equal(result.certificationBodyId,'OTHER');
assert.equal(updates.length,1);
assert.equal(updates[0].updateCells.start.rowIndex,1);
assert.equal(updates[0].updateCells.start.columnIndex,2);
assert.deepEqual(updates[0].updateCells.rows[0].values[0].userEnteredValue,{stringValue:'OTHER'});
const check=async(pos,row,error)=>{
 updates=[];
 const data=base.map((r,i)=>({values:i===pos?[...r,row]:r}));
 await assert.rejects(updateScopeCertificationBody20({...deps,body,sheetsBatchGet:async()=>data}),new RegExp(error));
 assert.equal(updates.length,0,'blocked association must not write');
};
await check(2,['CS1','TESTNAME10'],'SCOPE_CB_IN_USE_COMPANY_SCOPES');
await check(3,['OB1','TESTNAME10'],'SCOPE_CB_IN_USE_OBLIGATIONS');
await check(4,['A1',true,''],'SCOPE_CB_IN_USE_AUDIT_PLANNING');
await check(4,['A1',false,'TESTNAME10'],'SCOPE_CB_IN_USE_AUDIT_PLANNING');
await check(5,['A1',true],'SCOPE_CB_IN_USE_REALIZED_AUDITS');
await assert.rejects(updateScopeCertificationBody20({...deps,body:{...body,expected:'WRONG'}}),/SCOPE_CB_STALE_VALUE/);
await assert.rejects(updateScopeCertificationBody20({...deps,body:{...body,certificationBodyId:'INACTIVE'}}),/SCOPE_CB_TARGET_NOT_ACTIVE/);
await assert.rejects(updateScopeCertificationBody20({...deps,body:{...body,confirmation:''}}),/SCOPE_CB_CHANGE_INVALID/);
const unchanged=await updateScopeCertificationBody20({...deps,body:{...body,certificationBodyId:'ECAS'}});
assert.equal(unchanged.unchanged,true);
// An empty table without even its schema header is incomplete and must fail closed.
for(let i=0;i<6;i++){
 updates=[];
 const incomplete=base.map((values,j)=>({values:j===i?[]:values}));
 await assert.rejects(updateScopeCertificationBody20({...deps,body,sheetsBatchGet:async()=>incomplete}),/SCOPE_CB_ASSOCIATION_SCAN_INCOMPLETE/);
 assert.equal(updates.length,0,'incomplete scan must never write');
}
// A valid association table with its header only is empty, not an incomplete scan.
const emptyAssociationTables=base.map((values,i)=>({values:i>=2?[values[0]]:values}));
updates=[];
const emptyResult=await updateScopeCertificationBody20({...deps,body,sheetsBatchGet:async()=>emptyAssociationTables});
assert.equal(emptyResult.certificationBodyId,'OTHER');
assert.equal(updates.length,1);
console.log('scope-certification-body-20: guarded edit and association tests passed');
