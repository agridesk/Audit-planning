import assert from 'node:assert/strict';
import {executeSwapAtomic} from './swap-atomic-20.mjs';
const input={operationId:'x',auditA:'A',auditB:'B',expectedRevisions:{A:'1',B:'2'},blocksA:[{}],blocksB:[{}]};
function mock(fail){
 const state={phase:'',restored:false,writes:0};
 const a={
 withPairLock:async(ids,fn)=>fn(),
 readJournal:async()=>state.phase==='COMMITTED'?{phase:'COMMITTED',auditIds:['A','B']}:null,
 readCanonicalPair:async()=>({A:{revision:'1',status:'Accepted'},B:{revision:'2',status:'Accepted'}}),
 validateFinalState:async()=>({ok:true}),
 captureBeforeImages:async()=>({canonical:{A:{},B:{}},reservations:{A:[],B:[]}}),
 persistJournal:async(j)=>{state.phase=j.phase;},
 replacePairReservations:async()=>{state.writes++;},
 replacePairPlans:async()=>{state.writes++;if(fail)throw Error('write failed');},
 verifyPair:async()=>({ok:true}),
 restoreBeforeImages:async()=>{state.restored=true;}
 };
 return {a,state};
}
const ok=mock(false);
assert.equal((await executeSwapAtomic(input,ok.a)).success,true);
assert.equal(ok.state.phase,'COMMITTED');
assert.equal((await executeSwapAtomic(input,ok.a)).idempotent,true);
assert.equal(ok.state.writes,2);
const mismatch=mock(false);
mismatch.a.readJournal=async()=>({phase:'COMMITTED',auditIds:['A','C']});
await assert.rejects(executeSwapAtomic(input,mismatch.a),/Operation identity conflict/);
assert.equal(mismatch.state.writes,0);
const bad=mock(true);
await assert.rejects(executeSwapAtomic(input,bad.a));
assert.equal(bad.state.phase,'ROLLED_BACK');
assert.equal(bad.state.restored,true);
console.log('Swap atomic coordinator tests passed');
