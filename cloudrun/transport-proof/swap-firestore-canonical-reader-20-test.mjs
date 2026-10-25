import assert from 'node:assert/strict';
import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
const root='projects/ams-test-dev/databases/(default)/documents/';
const updateTime='2026-10-25T10:00:00Z';
let calls=0;
const payloads={
 'ams_swap20_dev_audits/A':{status:'Accepted',plannedBlocks:['a']},
 'ams_swap20_dev_audits/B':{status:'Accepted',plannedBlocks:['b']},
 'ams_swap20_dev_availability/A':{reservations:['a']},
 'ams_swap20_dev_availability/B':{reservations:['b']},
 'ams_swap20_dev_proposals/swap_12345678':{operationId:'swap_12345678',status:'CONFIRMED'},
 'ams_swap20_dev_journal/swap_12345678':{operationId:'swap_12345678',stage:'COMMITTED'}
};
const fetchImpl=async(url,init)=>{
 calls++;
 assert.ok(url.endsWith(':batchGet'));
 const paths=JSON.parse(init.body).documents.map(name=>name.slice(root.length));
 return {ok:true,text:async()=>JSON.stringify(paths.reverse().map(path=>({found:{name:root+path,updateTime,fields:{payload:{stringValue:JSON.stringify(payloads[path])}}}})))};
};
const reader=createSwapFirestoreCanonicalReader({project:'ams-test-dev',getToken:async()=>'token',fetchImpl});
const pair=await reader.readPair(['A','B']);
assert.deepEqual(pair.map(row=>row.auditId),['A','B']);
assert.equal(pair[0].canonical.plannedBlocks[0],'a');
assert.equal(pair[0].source,'firestore-canonical');
const availability=await reader.readAvailability(['A','B']);
assert.deepEqual(availability[1].reservations,['b']);
const proposal=await reader.readProposal('swap_12345678');
assert.equal(proposal.updateTime,updateTime);
assert.equal((await reader.readJournal('swap_12345678')).stage,'COMMITTED');
assert.equal(calls,4);
await assert.rejects(reader.readPair(['A','A']),/SWAP_CANONICAL_READER_PAIR_INVALID/);
const broken=createSwapFirestoreCanonicalReader({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async()=>({ok:true,text:async()=>'[]'})});
await assert.rejects(broken.readPair(['A','B']),/SWAP_CANONICAL_READER_COUNT_INVALID/);
console.log('SWAP direct Firestore canonical batch reader checks passed');

const single=createSwapFirestoreCanonicalReader({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async(url,init)=>{const name=JSON.parse(init.body).documents[0];return {ok:true,text:async()=>JSON.stringify({found:{name,updateTime,fields:{payload:{stringValue:JSON.stringify(payloads[name.slice(root.length)])}}}})};}});
assert.equal((await single.readProposal('swap_12345678')).status,'CONFIRMED');

const noJournal=createSwapFirestoreCanonicalReader({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async(url,init)=>({ok:true,text:async()=>JSON.stringify({missing:JSON.parse(init.body).documents[0]})})});
assert.equal(await noJournal.readJournal('swap_12345678'),null);
await assert.rejects(noJournal.readProposal('swap_12345678'),/SWAP_CANONICAL_READER_DOCUMENT_MISSING/);
