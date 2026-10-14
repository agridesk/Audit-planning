'use strict';
const assert=require('node:assert/strict');
const {inspectRotationPolicySource20:inspect}=require('./rotation-policy-source-diagnostic-20');
// Contract names here are test-only placeholders, not a schema migration.
const contract=['Rotation_Normal_Maximum','Rotation_Applies','Rotation_Plus_One_Permitted'];
const h=['SlotKey','ScopeCode','Extension','Max number audits'];
const rows=Array.from({length:8},(_,i)=>['SCOPE_0'+(i+1),'CODE_'+i,'4','3']);
assert.deepEqual(inspect([h,...rows],contract),{ready:false,reason:'ROTATION_POLICY_COLUMNS_MISSING',missing:contract});
assert.throws(()=>inspect([h,...rows],[]),/CONTRACT_MISSING/);
assert.throws(()=>inspect([h,...rows],[contract[0],contract[0],contract[2]]),/DUPLICATE/);
const extended=[...h,...contract];
const populated=rows.map(r=>[...r,'3','TRUE','FALSE']);
assert.equal(inspect([extended,...populated],contract).ready,true);
assert.equal(inspect([extended,...populated.slice(0,7)],contract).ready,false);
assert.equal(inspect([extended,...populated.map((r,i)=>i===0?[...r.slice(0,4),'0',...r.slice(5)]:r)],contract).reason,'ROTATION_POLICY_VALUES_INCOMPLETE');
console.log('Rotation policy source diagnostic: 6 checks passed');
