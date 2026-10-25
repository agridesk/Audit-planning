import assert from 'node:assert/strict';
import {validateSwapCanonicalSchedule} from './swap-firestore-schedule-guard-20.mjs';
const block=(date,start='09:00',end='11:00')=>({date,start,end});
const proposal={auditA:'A',auditB:'B',originalRevisions:{A:'v1',B:'v1'},blocksA:[block('2026-10-27')],blocksB:[block('2026-10-26')]};
const pair=[{auditId:'A',status:'Accepted',canonical:{assignedTo:'a@example.test',revision:'v1',plannedBlocks:[block('2026-10-26')]}},{auditId:'B',status:'Accepted',canonical:{assignedTo:'b@example.test',revision:'v1',plannedBlocks:[block('2026-10-27')]}}];
const test=(p=proposal,rows=pair)=>validateSwapCanonicalSchedule({proposal:p,pair:rows});
assert.equal(test().ok,true);
assert.throws(()=>test({...proposal,blocksA:[block('2026-02-30')]}),/DATE_INVALID/);
assert.throws(()=>test({...proposal,blocksA:[block('2026-10-27','09:00','10:00')]}),/DURATION_MISMATCH/);
assert.throws(()=>test({...proposal,blocksA:[block('2026-10-27','25:00','27:00')]}),/TIME_INVALID/);
assert.throws(()=>test({...proposal,blocksA:[]}),/BLOCK_COUNT/);
const sameOwner=pair.map(row=>({...row,canonical:{...row.canonical,assignedTo:'a@example.test'}}));
assert.throws(()=>test({...proposal,blocksB:[block('2026-10-27')]},sameOwner),/CROSS_AUDIT_OVERLAP/);
assert.throws(()=>test({...proposal,originalRevisions:{A:'stale',B:'v1'}},pair),/REVISION_CONFLICT/);
console.log('SWAP canonical schedule parity guards passed');

assert.throws(()=>test(proposal,pair.map((row,i)=>i===0?{...row,canonical:{...row.canonical,status:'Completed'}}:row)),/SWAP_SCHEDULE_STATUS_MISMATCH/);
