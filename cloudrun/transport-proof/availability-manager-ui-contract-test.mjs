import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('./availability-manager-calendar-20.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Manager calendar script required');new vm.Script(script);
for(const marker of ['id="availabilityFilter"','All auditors','Available auditors only','id="dayDetails"','Scopes: ','Location: ','auditDetailsByAuditor','data-date=','MAKE_AVAILABLE','SET_FREE_OVERRIDE','RELEASE_BASELINE','BLOCK_PERIOD','addDays(today,27)']){
 assert.ok(html.includes(marker),'Missing manager capability: '+marker);
}
assert.ok(html.includes("days.map(date=>'<tr><th>'"),'Rows must represent calendar days');
assert.ok(html.includes('shown.map((a,i)=>'),'Columns must represent auditors');
assert.ok(html.includes('S.hasHard&&!S.activeBlock'),'Unknown or overlapping HARD blocks fail closed instead of reporting false availability');
assert.ok(html.includes('id="filterDate"'),'Available auditors filter requires a date');
assert.ok(html.includes('d.date===target&&freeWork(d.segments)>0'),'Availability filter uses the selected date');
assert.ok(html.includes('HARD · blocked by auditor/manager'),'Hard unavailability is clearly identified');
assert.ok(html.includes('SOFT · normally unavailable'),'Soft unavailability is clearly identified');
assert.ok(!html.includes('Baseline ID'),'Manager must not manually enter internal baseline IDs');
assert.ok(!html.includes('id="auditor"'),'No legacy auditor dropdown required');
console.log('PASS Manager Availability matrix and editor contract');
