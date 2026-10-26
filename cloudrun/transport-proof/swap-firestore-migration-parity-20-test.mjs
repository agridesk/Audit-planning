import assert from 'node:assert/strict';
import {verifySwapFirestoreMigration} from './swap-firestore-migration-parity-20.mjs';
const ids=['A','B'];
const audits=ids.map(auditId=>({auditId,data:{status:'Accepted',plannedBlocks:[{date:'2026-10-27',start:'09:00',end:'11:00'}]}}));
const availability=ids.map(auditId=>({auditId,data:{reservations:[]}}));
const input={expectedAuditIds:ids,sheetAudits:audits,firestoreAudits:audits.map(row=>({...row,data:{plannedBlocks:row.data.plannedBlocks,status:'Accepted'}})),sheetAvailability:availability,firestoreAvailability:availability};
assert.equal(verifySwapFirestoreMigration(input).ok,true);
assert.equal(verifySwapFirestoreMigration(input).cutoverAuthorized,false);
assert.equal(verifySwapFirestoreMigration({...input,firestoreAudits:audits.slice(0,1)}).issues[0].kind,'MISSING');
assert.equal(verifySwapFirestoreMigration({...input,firestoreAvailability:[...availability,availability[0]]}).issues[0].kind,'DUPLICATE_OR_INVALID');
assert.equal(verifySwapFirestoreMigration({...input,firestoreAudits:audits.map((row,i)=>i?{...row,data:{status:'Completed'}}:row)}).issues[0].kind,'MISMATCH');
console.log('SWAP migration parity coverage and mismatch checks passed');

import {assessSwapFirestorePreviewReadiness} from './swap-firestore-dev-transport-20.mjs';
const previewPair=ids.map(auditId=>({auditId,source:'firestore-canonical',canonical:{status:'Accepted',assignedTo:'auditor@example.com',plannedBlocks:[{date:'2026-10-27',start:'09:00',end:'11:00'}]},updateTime:'2026-10-26T10:00:00Z'}));
const previewAvailability=ids.map(auditId=>({auditId,source:'firestore-canonical',reservations:[{auditId}],updateTime:'2026-10-26T10:00:00Z'}));
const gateInput={pair:previewPair,availability:previewAvailability,index:{complete:true,documentCount:20},expectedDocuments:20};
assert.equal(assessSwapFirestorePreviewReadiness(gateInput).ready,false);
assert.ok(assessSwapFirestorePreviewReadiness(gateInput).reasons.includes('ORPHAN_RESERVATIONS_UNRESOLVED'));
assert.equal(assessSwapFirestorePreviewReadiness({...gateInput,orphanReservationsUnresolved:false}).ready,true);
assert.equal(assessSwapFirestorePreviewReadiness({...gateInput,orphanReservationsUnresolved:false}).commitAuthorized,false);
assert.equal(assessSwapFirestorePreviewReadiness({...gateInput,orphanReservationsUnresolved:false,index:{complete:true,documentCount:15}}).ready,false);

import {assessHistoricalOrphanIsolation} from './swap-firestore-dev-transport-20.mjs';
const historical={orphanSlots:[{date:'2026-04-20',owner:'auditor@example.com',start:'08:30',end:'16:30'},{date:'2026-10-10',owner:'auditor@example.com',start:'08:30',end:'16:30'}],targetBlocks:[{date:'2026-10-27'}],referenceDate:'2026-10-26'};
assert.equal(assessHistoricalOrphanIsolation(historical).isolated,true);
assert.equal(assessHistoricalOrphanIsolation(historical).cutoverAuthorized,false);
assert.equal(assessHistoricalOrphanIsolation({...historical,orphanSlots:[{...historical.orphanSlots[0],date:'2026-10-27'}]}).isolated,false);
assert.equal(assessHistoricalOrphanIsolation({...historical,targetBlocks:[{date:'2026-10-20'}]}).isolated,false);
