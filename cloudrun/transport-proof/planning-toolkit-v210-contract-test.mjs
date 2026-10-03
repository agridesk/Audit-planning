import fs from 'node:fs';

const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=fs.readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=fs.readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');

const checks=[
  ['Toolkit exposes canonical scheduling target',r4.includes('schedulingHoursTarget:schedulingTargetForAudit(')],
  ['Toolkit keeps formal hours separate',r4.includes('formalHours:Number(String(g([')],
  ['Save validation uses scheduling target',r4.includes("PLANNED_HOURS_BELOW_SCHEDULING_TARGET")&&r4.includes('schedulingTarget=Number(audit.schedulingHoursTarget||audit.requiredHours||0)')],
  ['Planning JSON keeps formal target and actual scheduled semantics',r4.includes('formalHours,schedulingHours,scheduledHours,totalPlannedHours:formalHours')],
  ['Calendar direct click toggle retained',r5.includes('function toggleCalendarDay(date,visualState)')&&r5.includes('Day removed from planning.')&&r5.includes('Day added to planning.')],
  ['No Add slot control exposed',!r5.includes('>Add slot<')&&!r5.includes('id="addSlot"')],
  ['Maximum five selected days retained',r5.includes('Maximum 5 planning days.')],
  ['Toolkit totals use scheduling target',r5.includes('function planningTarget()')&&r5.includes("Scheduling target '+target.toFixed(2)+' h · Planned ")],
  ['Default slot is remaining-driven with eight-hour default cap',r5.includes('const duration=target>0?Math.min(remaining,8):8')],
  ['Same-day non-overlap default can move after committed occupancy',r5.includes('startMin=next')&&r5.includes('No non-overlapping default slot could be found on this day.')],
  ['Formal duration remains visible in Toolkit',r5.includes("txt('#formalHours',a.requiredHours?'Formal ")],
  ['Initial slot duration uses scheduling target',r5.includes('const target=Number(a.schedulingHoursTarget||a.requiredHours||0)')&&r5.includes('d=Math.min(target,8)')],
  ['Save enablement compares planned hours with scheduling target',r5.includes('hoursComplete=target<=0||Math.abs(hours-target)<=0.001')],
  ['Committed overlap remains hard',r4.includes("throw new Error('AVAILABILITY_COLLISION_'+b.date)")],
  ['Actual Availability block writes remain requested start/end',r4.includes('x.row[z.s]=b.start;x.row[z.e]=b.end;x.row[z.id]=auditId')],
  ['Combined visit uses scheduling delta fallback',r6.includes('schedulingHoursDelta')&&r6.includes('x.formalHours+delta')],
  ['Combined visit Planning JSON keeps formal target and actual scheduled',r6.includes('formalHours:Math.round(formalRequired*100)/100')&&r6.includes('scheduledHours:Math.round(total*100)/100')],
  ['R6 is sole combined Toolkit HTML owner',r6.includes("function planningTarget(){return requiredVisitHours()}")&&r6.includes('PLANNING_COMBINED_TARGET_PATCH_NOT_APPLIED')],
  ['R7 is transparent and contains no Planning HTML monkey patch',!r7.includes('patchPlanningHtml')&&!r7.includes('PLANNING_COMBINED_REQUIRED_DISPLAY_PATCH_NOT_APPLIED')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('planning-toolkit-v210-contract-test passed');
