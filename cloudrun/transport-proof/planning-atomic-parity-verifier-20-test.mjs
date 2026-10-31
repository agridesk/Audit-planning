import assert from 'node:assert/strict';
import {createPlanningAtomicParityVerifier} from './planning-atomic-parity-verifier-20.js';
import {preparePlanningBackfill} from './planning-atomic-backfill-20.js';
const headers=['Audit ID','Status','Assigned to','Planning JSON','Last decision timestamp','Status since','Date - Planned'];
const rows=[headers,['AUD-1','Approved','aud@example.test',JSON.stringify({blocks:[{date:'2027-02-01',start:'09:00',end:'10:00'}]}),'2026-10-29','2026-10-29','2027-02-01'],['AUD-2','Pending Approval','','','','','']];
const roster=[{role:'auditor',email:'aud@example.test',auditorId:'uid-1'}];
const prepared=preparePlanningBackfill({rows,roster,asOfDate:'2026-10-29'});
const docs=new Map(prepared.items.map(item=>[item.auditId,{auditId:item.auditId,revision:0,auditorId:item.auditorId,pendingOperationId:null,snapshot:item.snapshot,blocks:item.blocks}]));
let corrupted=false,claimCorrupt=false;
const service=createPlanningAtomicParityVerifier({
 store:{
  async readAudit(id){if(corrupted&&id==='AUD-1')return {...docs.get(id),snapshot:{...docs.get(id).snapshot,sourceRevision:'bad'}};return docs.get(id)||null;},
  async inspectAuditClaimIndex(id){return claimCorrupt?{ok:false,reason:'CLAIM_INTEGRITY_MISMATCH'}:{ok:true,checked:id==='AUD-1'?4:0};}
 },readPlanningRows:async()=>rows,getRoster:async()=>roster
});
const first=await service.verify({asOfDate:'2026-10-29'});
assert.equal(first.ready,true);assert.equal(first.sourceAudits,2);assert.equal(first.claims,4);
corrupted=true;
const changed=await service.verify({asOfDate:'2026-10-29'});
assert.equal(changed.ready,false);assert.equal(changed.problems[0].reason,'SOURCE_ROW_MISMATCH');
corrupted=false;claimCorrupt=true;
assert.equal((await service.verify({asOfDate:'2026-10-29'})).problems[0].reason,'CLAIM_INTEGRITY_MISMATCH');
claimCorrupt=false;
const page=await service.verify({asOfDate:'2026-10-29',limit:1});
assert.equal(page.ready,false);assert.equal(page.remaining,true);assert.equal(page.nextRow,3);
await assert.rejects(()=>service.verify({limit:251}),/PLANNING_PARITY_BATCH_INVALID/);
console.log('Atomic parity: complete read-only source/revision/claim checks, corruption and pagination guards passed');
