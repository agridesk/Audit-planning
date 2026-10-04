import fs from 'node:fs';

const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=fs.readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=fs.readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');

const checks=[
  ['Toolkit projects formal hours as required hours',r4.includes('formalHours:Number(String(g([')&&r4.includes('requiredHours:Number(String(g([')],
  ['Toolkit does not expose schedulingHoursTarget',!r4.includes('schedulingHoursTarget:')],
  ['Save validation uses formal hours',r4.includes("PLANNED_HOURS_BELOW_FORMAL_HOURS")&&r4.includes('formalTarget=Math.round(Number(audit.formalHours||audit.requiredHours||0)*100)/100')],
  ['Planning JSON keeps one formal-hours truth plus concrete on/off-site blocks',r4.includes('JSON.stringify({blocks:requested,formalHours,totalPlannedHours:formalHours,offsiteHours,maxOffsiteHours:Number(offsitePolicy.maxOffsiteHours||0),auditorEmail,auditorName})')&&!r4.includes('scheduledHours')],
  ['Direct PLAN persists Hours planned from formalHours',r4.includes("set(['Hours planned','Planned hours','Hours Planned'],formalHours)")],
  ['Direct PLAN enforces Max_Offsite_Hours',r4.includes("OFFSITE_HOURS_ABOVE_SCOPE_MAX")&&r4.includes("OFFSITE_MULTI_SCOPE_ALLOCATION_REQUIRED")&&r4.includes("executionType==='OFFSITE'")],
  ['Toolkit exposes explicit on-site/off-site block type',r5.includes('id="executionType"')&&r5.includes('plannedOffsiteHours()')&&r5.includes('id="offsiteSummary"')],
  ['Toolkit hard-disables save when off-site policy is exceeded',r5.includes('offsiteValid=offsite<=maxOff+0.001')&&r5.includes('policy.requiresScopeAllocation')],
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
  ['Combined visit Planning JSON keeps one hours truth and off-site is fail-closed pending scope allocation',r6.includes('formalHours:Math.round(formalRequired*100)/100')&&r6.includes("OFFSITE_MULTI_SCOPE_ALLOCATION_REQUIRED")&&!r6.includes('scheduledHours:Math.round(total*100)/100')],
  ['R6 combined Toolkit target sums formal hours',r6.includes('Number(r.formalHours||r.requiredHours||0)')&&r6.includes("function planningTarget(){return requiredVisitHours()}")],
  ['R7 is transparent and contains no Planning HTML monkey patch',!r7.includes('patchPlanningHtml')&&!r7.includes('PLANNING_COMBINED_REQUIRED_DISPLAY_PATCH_NOT_APPLIED')],
  ['R4 layout keeps information left and large calendar right',r5.includes('class="panel leftPanel"')&&r5.includes('class="panel calendarPanel"')&&r5.includes('.calendarToolbar{position:sticky')],
  ['R4 planned slots are directly editable',r5.includes('function slotUpdate(i,patch)')&&r5.includes('data-start')&&r5.includes('data-end')&&r5.includes('data-location')&&r5.includes('data-comment')],
  ['R4 slot location metadata includes GPS and read-only short comment',r5.includes('function gpsHref(gps)')&&r5.includes('slotGps')&&r5.includes('slotShort')&&r5.includes("loc&&loc.comment||'-'")],
  ['R4 keeps slot comment separate from location short comment',r5.includes('slotCommentInput')&&r5.includes('Slot comment — audit/block specific')],
  ['R4 location picker uses canonical audit locations',r5.includes('function locationOptionMarkup(selected)')&&r5.includes('model?.data?.audit')&&r5.includes('a.locations||[]')],
  ['R4 off-site hard maximum remains live in inline editing',r5.includes('maxOffsiteHours()')&&r5.includes("offsiteValid=offsite<=maxOff+0.001")&&r5.includes("OFFSITE")],
  ['R4 successful save notifies parent and closes popup',r5.includes("type:'AMS_PLANNING_SAVED'")&&r5.includes('window.close()')],

  ['R4 save message carries canonical planning row patch data',r5.includes("planningJson:savedPlanning")&&r5.includes("datePlanned:draftBlocks[0]?.date")&&r5.includes("hoursPlanned:planningTarget()")],  ['R4 company context includes general and auditor comments',r4.includes("auditorComments:''")&&r5.includes("General comments: ")&&r5.includes("Auditor comments: ")],

  ['R4 keeps Company and Auditor constraints visibly available',r5.includes('id="planningConstraints"')&&r5.includes('function renderPlanningConstraints()')&&r5.includes("Auditor less available: ")&&r5.includes("Company less available: ")&&r5.includes("renderPlanningConstraints();renderAvailability();validate();loadRotation()")],
  ['R4 left slot column avoids horizontal overflow',r5.includes('overflow-y:auto;overflow-x:hidden')&&r5.includes('.slotTop>*{min-width:0}')&&r5.includes('class="slotWork"')&&r5.includes('class="slotLocation"')],  ['R4 slot comments remain persisted in canonical Planning JSON blocks',r4.includes('slotComment=clean(x?.slotComment||x?.comment)')&&r4.includes('planningJson=JSON.stringify({blocks:requested')],

  ['R4 off-site blocks display no Company execution location',r5.includes("off?'<option value=\"\" selected>—</option>':locationOptionMarkup")&&r5.includes("b.execLoc=b.executionType==='OFFSITE'?'':")],
  ['R4 save synchronizes visible slot editors before payload',r5.includes('function syncVisibleSlotEditors()')&&r5.includes('async function save(){syncVisibleSlotEditors();if(!validate())return;')],
  ['R4 slot time inputs use real scrollable quarter-hour selects',r5.includes('function quarterTimeOptions(selected)')&&r5.includes('for(const m of [0,15,30,45])')&&r5.includes('<select data-start>')&&r5.includes('<select data-end>')&&!r5.includes('data-start type="time"')&&!r5.includes('data-end type="time"')]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('planning-toolkit-v210-contract-test passed');
