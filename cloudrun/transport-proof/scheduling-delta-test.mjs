import assert from 'node:assert/strict';
import fs from 'node:fs';

const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=fs.readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const r11=fs.readFileSync(new URL('./server-r11.js',import.meta.url),'utf8');
const r12=fs.readFileSync(new URL('./server-r12.js',import.meta.url),'utf8');

assert.ok(!r4.includes('Scheduling_hours_delta'),'Grid backend must no longer read scheduling delta');
assert.ok(!r6.includes('Scheduling_hours_delta'),'Combined Toolkit backend must no longer read scheduling delta');
assert.ok(!r4.includes('schedulingHoursTarget'),'R4 must not expose schedulingHoursTarget');
assert.ok(!r5.includes('schedulingHoursTarget'),'Toolkit must not consume schedulingHoursTarget');
assert.ok(!r6.includes('schedulingHoursTarget'),'Combined visit must not consume schedulingHoursTarget');
assert.ok(!r10.includes('schedulingHoursTarget'),'Manager Grid proxy must not expose schedulingHoursTarget');
assert.ok(!r11.includes('Scheduling_hours_delta'),'R11 must not reinterpret scheduling delta');
assert.ok(!r11.includes('scheduledHours'),'R11 must stay transparent for hours semantics');
assert.ok(!r12.includes('scheduledHours'),'R12 must not reintroduce scheduledHours');
assert.ok(r5.includes('Number(a.formalHours??a.requiredHours??0)'),'Toolkit target must be formalHours');

console.log(JSON.stringify({
  success:true,
  build:'2026-10-03_OFFSITE_POLICY_NO_SCHEDULING_DELTA_R4',
  passed:10,
  writesPerformed:false
},null,2));
