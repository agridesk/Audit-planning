import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const coordinator=src('../../Swap20TransactionCoordinator.js');
const gate=src('../../Swap20AtomicCommitGate.js');
const bridge=src('../../Swap20Bridge20.js');
const manager=src('./manager-portal.js');
assert.match(coordinator,/performanceMs:\s*\{/,'Only verified successful commit returns phase timings');
for(const phase of ['entryReads','canonicalGuard','canonicalSnapshot','availabilitySnapshot','planAndPreparation','preparedAndPreWriteChecks','availabilityWrite','canonicalWrite','verification','committedJournal']){
 assert(coordinator.includes(phase+':'),'Missing SWAP phase '+phase);
}
assert(!coordinator.includes('setProperty('),'Never use Script Properties for performance telemetry');
assert.match(gate,/performanceMs:result\.performanceMs\|\|null/,'Atomic manager gate must forward successful timings');
assert.match(bridge,/performanceMs:committed\.performanceMs\|\|null/,'Only authenticated manager bridge may expose timings');
assert(manager.includes('if(outcome.performanceMs&&Number.isFinite(outcome.performanceMs.total))'),'Manager must reject malformed timings');
assert(manager.includes('var swapLiveStatus=document.getElementById("status")'),'Show timings after grid refresh');
assert(manager.includes('SWAP DEV timings: '),'Timings should be visible without Apps Script logs');
assert(!src('../../Swap20AvailabilityWriter.js').includes('performanceMs'),'Writer must stay unchanged');
assert(!src('../../Swap20DurableJournal.js').includes('performanceMs'),'Journal payload must stay unchanged');
console.log('SWAP manager DEV commit timing instrumentation contract PASS');
