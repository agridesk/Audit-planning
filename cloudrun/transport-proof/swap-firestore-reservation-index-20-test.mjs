import assert from 'node:assert/strict';
import {createSwapFirestoreReservationIndex} from './swap-firestore-reservation-index-20.mjs';
const root='projects/ams-test-dev/databases/(default)/documents/ams_swap20_dev_availability/';
let page=0;
const fetchImpl=async()=>{
 page++;
 const id=page===1?'A':'B';
 const doc={name:root+id,fields:{payload:{stringValue:JSON.stringify({reservations:[{auditId:id,owner:'a@example.test',date:'2026-10-27',start:'09:00',end:'11:00'}]})}}};
 return {ok:true,json:async()=>({documents:[doc],...(page===1?{nextPageToken:'second'}:{})})};
};
const index=createSwapFirestoreReservationIndex({project:'ams-test-dev',getToken:async()=>'token',fetchImpl});
const result=await index.loadCompleteReservationIndex();
assert.equal(result.documentCount,2);
assert.equal(result.reservations.length,2);
assert.equal(page,2);
console.log('SWAP complete Firestore reservation index pagination passed');

const duplicate=createSwapFirestoreReservationIndex({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async()=>({ok:true,json:async()=>({documents:[{name:root+'A',fields:{payload:{stringValue:JSON.stringify({reservations:[{auditId:'A',owner:'a@example.test',date:'2026-10-27',start:'09:00',end:'11:00'},{auditId:'A',owner:'a@example.test',date:'2026-10-27',start:'09:00',end:'11:00'}]})}}}]})})});
await assert.rejects(duplicate.loadCompleteReservationIndex(),/SWAP_INDEX_DUPLICATE_RESERVATION/);

const malformed=createSwapFirestoreReservationIndex({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async()=>({ok:true,json:async()=>({documents:[{name:root+'A',fields:{payload:{stringValue:JSON.stringify({reservations:[{auditId:'A'}]})}}}]})})});
await assert.rejects(malformed.loadCompleteReservationIndex(),/SWAP_INDEX_RESERVATION_SHAPE_INVALID/);

const nested=createSwapFirestoreReservationIndex({project:'ams-test-dev',getToken:async()=>'token',fetchImpl:async()=>({ok:true,json:async()=>({documents:[{name:root+'A/child/B',fields:{payload:{stringValue:JSON.stringify({reservations:[]})}}}]})})});
await assert.rejects(nested.loadCompleteReservationIndex(),/SWAP_INDEX_DOCUMENT_PATH_INVALID/);
