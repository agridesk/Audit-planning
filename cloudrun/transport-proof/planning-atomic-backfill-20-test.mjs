import assert from 'node:assert/strict';
import {preparePlanningBackfill,createPlanningBackfillRunner} from './planning-atomic-backfill-20.js';
const heads=['Audit ID','Status','Assigned to','Planning JSON','Last decision timestamp','Status since','Date - Planned'];
const plan=blocks=>JSON.stringify({blocks});
const valid=[heads,['A1','Approved','a@example.test',plan([{date:'2027-03-01',start:'09:00',end:'10:00'}]),'2026-10-28','2026-10-28'],['A2','Pending Planning','','','',''],['A3','Accepted','b@example.test',plan([{date:'2027-03-01',start:'09:30',end:'11:00'}]),'2026-10-28','2026-10-28']];
const roster=[{role:'auditor',auditorId:'aud-1',email:'a@example.test'},{role:'auditor',auditorId:'aud-2',email:'b@example.test'}];
const out=preparePlanningBackfill({rows:valid,roster});
assert.equal(out.stats.audits,3);assert.equal(out.stats.active,2);assert.equal(out.stats.claimedSlots,10);
assert.equal(out.items[0].snapshot.sourceRevision.length,24);
assert.equal(out.items[1].blocks.length,0);
await assert.rejects(async()=>preparePlanningBackfill({rows:[...valid,valid[1]],roster}),/BACKFILL_AUDIT_ID_DUPLICATE/);
await assert.rejects(async()=>preparePlanningBackfill({rows:[heads,valid[1],['A4','Approved','a@example.test',plan([{date:'2027-03-01',start:'09:30',end:'10:30'}]),'','']],roster}),/BACKFILL_EXISTING_AUDITOR_COLLISION/);
await assert.rejects(async()=>preparePlanningBackfill({rows:[heads,['A4','Approved','missing@example.test',plan([{date:'2027-03-01',start:'09:00',end:'10:00'}]),'','']],roster}),/BACKFILL_ACTIVE_AUDITOR_UID_UNRESOLVED/);
const historical=[heads,
 ['OLD1','Accepted','a@example.test','','2026-03-01','2026-03-01','2026-03-01'],
 ['OLD2','Approved','a@example.test',plan([{date:'2026-03-01',start:'09:00',end:'10:00'}]),'2026-03-01','2026-03-01','2026-03-01'],
 ['PROPOSAL','Pending Approval','',plan([{date:'2027-03-01',start:'10:00',end:'12:00'}]),'2026-10-28','2026-10-28','2027-03-01']
];
const old=preparePlanningBackfill({rows:historical,roster,asOfDate:'2026-10-29'});
assert.equal(old.stats.audits,3);
assert.equal(old.stats.claimedSlots,0);
assert.equal(old.stats.legacyUnverified,1);
assert.equal(old.items[0].snapshot.legacyUnverified,true);
assert.equal(old.items[1].blocks.length,0);
assert.equal(old.items[2].auditorId,null);
let writes=0;
const runner=createPlanningBackfillRunner({atomicStore:{async seed(){writes++;return {seeded:true};}},readPlanningRows:async()=>valid,getRoster:async()=>roster});
const preview=await runner.run({dryRun:true,limit:2});assert.equal(preview.batch,2);assert.equal(writes,0);
const result=await runner.run({dryRun:false,limit:2});assert.equal(result.seeded,2);assert.equal(result.nextRow,4);
console.log('Backfill: canonical parity, collisions, identity, dry run and bounded seed passed');
