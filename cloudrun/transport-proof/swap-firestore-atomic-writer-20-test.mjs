import assert from 'node:assert/strict';
import {createSwapFirestoreAtomicWriter} from './swap-firestore-atomic-writer-20.mjs';
const prefix='projects/ams-test-dev/databases/(default)/documents/';
const update=(name,pre)=>({update:{name:prefix+name,fields:{status:{stringValue:'Accepted'}}},currentDocument:pre});
const writes=[
 update('audits/A',{updateTime:'2026-10-25T00:00:00Z'}),
 update('audits/B',{updateTime:'2026-10-25T00:00:00Z'}),
 update('ams_swap20_dev_meta/reservation_fence',{updateTime:'2026-10-25T00:00:00Z'}),
 update('ams_swap20_dev_journal/swap_12345678',{exists:false})
];
let calls=0,mode=200;
const writer=createSwapFirestoreAtomicWriter({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async(url,init)=>{
 calls++;
 assert.ok(url.endsWith('/documents:commit'));
 assert.equal(init.method,'POST');
 assert.equal(JSON.parse(init.body).writes.length,4);
 return mode===200?{ok:true,status:200,json:async()=>({commitTime:'now',writeResults:[{},{},{},{}]})}:{ok:false,status:mode};
}});
assert.equal((await writer.commit({operationId:'swap_12345678',writes})).ok,true);
mode=409;
assert.equal((await writer.commit({operationId:'swap_12345678',writes})).conflict,true);
assert.equal(calls,2);
await assert.rejects(writer.commit({operationId:'swap_12345678',writes:writes.slice(0,2)}),/SWAP_ATOMIC_WRITES_INVALID/);
await assert.rejects(writer.commit({operationId:'swap_12345678',writes:[writes[0],writes[1],writes[1]]}),/SWAP_ATOMIC_DUPLICATE_DOCUMENT/);
await assert.rejects(writer.commit({operationId:'swap_12345678',writes:[writes[0],writes[1],writes[2],update('audits/C',{exists:false})]}),/SWAP_ATOMIC_JOURNAL_REQUIRED/);
await assert.rejects(writer.commit({operationId:'swap_12345678',writes:[writes[0],writes[1],writes[2],{...writes[3],currentDocument:{exists:true}}]}),/SWAP_ATOMIC_WRITES_INVALID/);
assert.equal(calls,2);
console.log('SWAP Firestore atomic commit guard tests passed');

await assert.rejects(writer.commit({operationId:'swap_12345678',writes:[writes[0],writes[1],writes[2],writes[3],update('unrelated_collection/X',{updateTime:'2026-10-25T00:00:00Z'})]}),/SWAP_ATOMIC_COLLECTION_FORBIDDEN/);
