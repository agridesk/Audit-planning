import assert from 'node:assert/strict';
import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
const root='projects/ams-test-dev/databases/(default)/documents/';
const fetchImpl=async(url,init)=>{
 const names=JSON.parse(init.body).documents;
 return {ok:true,text:async()=>names.map(name=>JSON.stringify({found:{name,updateTime:'2026-10-25T10:00:00Z',fields:{payload:{stringValue:JSON.stringify({status:'Accepted',plannedBlocks:[]})}}}})).join('\n')};
};
const reader=createSwapFirestoreCanonicalReader({project:'ams-test-dev',getToken:async()=>'token',fetchImpl});
assert.equal((await reader.readPair(['A','B'])).length,2);
assert.throws(()=>createSwapFirestoreCanonicalReader({project:'ams-test-prod',getToken:async()=>'token'}));
console.log('Firestore batchGet JSON streaming parser passed');
