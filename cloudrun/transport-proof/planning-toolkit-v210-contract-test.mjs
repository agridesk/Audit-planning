import fs from 'node:fs';

const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=fs.readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=fs.readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');

const checks=[
  ['Toolkit projects formal hours as required hours',r4.includes('formalHours:Number(String(g([')&&r4.includes('requiredHours:Number(String(g([')],
  ['Toolkit does not expose schedulingHoursTarget',!r4.includes('schedulingHoursTarget:')],
  ['Save validation uses formal hours',r4.includes("PLANNED_HOURS_BELOW_FORMAL_HOURS")&&r4.includes('formalTarget=Math.round(Number(audit.formalHours||audit.requiredHours||0)*100)/100')],
  ['Planning JSON keeps one hours truth plus concrete blocks',r4.includes('JSON.stringify({blocks:requested,formalHours,totalPlannedHours:formalHours,auditorEmail,auditorName})')&&!r4.includes('scheduledHours')],
  ['Direct PLAN persists Hours planned from formalHours',r4.includes("set(['Hours planned','Planned hours','Hours Planned'],formalHours)")],
  ['Calendar direct click toggle retained',r5.includes('function toggleCalendarDay(date,visualState)')&&r5.includes('Day removed from planning.')&&r5.includes('Day added to planning.')],
  ['No Add slot control exposed',!r5.includes('>Add slot<')&&!r5.includes('id="addSlot"')],
  ['Maximum five selected days retained',r5.includes('Maximum 5 planning days.')],
  ['Toolkit totals use Required Planned Remaining',r5.includes('function planningTarget()')&&r5.includes("Required '+target.toFixed(2)+' h · Planned ")],
  ['Toolkit planning target is formal hours only',r5.includes('Number(a.formalHours??a.requiredHours??0)')&&!r5.includes('a.schedulingHoursTarget')],
  ['Default slot is remaining-driven with eight-hour default cap',r5.includes('const duration=target>0?Math.min(remaining,8):8')],
  ['Same-day non-overlap default can move after committed occupancy',r5.includes('startMin=next')&&r5.includes('No non-overlapping default slot could be found on this day.')],
  ['No separate formal line below Required',!r5.includes('id="formalHours"')],
  ['Initial slot duration uses formal target',r5.includes('const target=Number(a.formalHours??a.requiredHours??0)')&&r5.includes('d=Math.min(target,8)')],
  ['Save enablement compares planned hours with formal target',r5.includes('hoursComplete=target<=0||Math.abs(hours-target)<=0.001')],
  ['Committed overlap remains hard',r4.includes("throw new Error('AVAILABILITY_COLLISION_'+b.date)")],
  ['Actual Availability block writes remain requested start/end',r4.includes('x.row[z.s]=b.start;x.row[z.e]=b.end;x.row[z.id]=auditId')],
  ['Combined visit validates against summed formal hours',r6.includes('formalRequired+=Number(a?.formalHours||0)')&&r6.includes('Math.abs(total-formalRequired)>0.001')],
  ['Combined visit Planning JSON keeps one hours truth',r6.includes('formalHours:Math.round(formalRequired*100)/100')&&!r6.includes('scheduledHours:Math.round(total*100)/100')],
  ['R6 combined Toolkit target sums formal hours',r6.includes('Number(r.formalHours||r.requiredHours||0)')&&r6.includes("function planningTarget(){return requiredVisitHours()}")],
  ['R7 is transparent and contains no Planning HTML monkey patch',!r7.includes('patchPlanningHtml')&&!r7.includes('PLANNING_COMBINED_REQUIRED_DISPLAY_PATCH_NOT_APPLIED')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('planning-toolkit-v210-contract-test passed');
