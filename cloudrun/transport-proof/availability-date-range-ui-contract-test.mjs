import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const name of ['availability-my-calendar-20.html','availability-manager-calendar-20.html']){
 const s=readFileSync(new URL('./'+name,import.meta.url),'utf8');
 assert.match(s,/function bindCoherentDateRange\(fromId,toId\)/);
 assert.match(s,/to\.min=from\.value\|\|''/);
 assert.match(s,/to\.value<from\.value/);
 assert.match(s,/\['from','through'\]/);
 assert.match(s,/\['editFrom','editThrough'\]/);
 assert.match(s,/from\.addEventListener\('change',sync\)/);
 assert.match(s,/from\.addEventListener\('input',sync\)/);
}
for(const [file,ids] of [
 ['AuditorAvailabilityV5.html',['rng_fromDate','rng_toDate']],
 ['PlanningWorkspace.html',['pwFrom','pwTo','batchPlanFrom','batchPlanTo']],
 ['ManagerV5ToolsUI.html',['m5tBatchFrom','m5tBatchTo']]
]){
 const content=readFileSync(new URL('../../'+file,import.meta.url),'utf8');
 for(const id of ids)assert(content.includes(id),file+' missing expected date input '+id);
 assert(content.includes('.min='),file+' missing minimum end-date binding');
}
console.log('PASS: date ranges respect lower bound and preserve later end dates');
