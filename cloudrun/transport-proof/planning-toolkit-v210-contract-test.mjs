import fs from 'node:fs';

const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=fs.readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=fs.readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');
const minIntervalMigration=fs.readFileSync(new URL('../../ConfigScopesMinIntervalMigration.js',import.meta.url),'utf8');
const configScopesService=fs.readFileSync(new URL('../../ConfigScopesService.js',import.meta.url),'utf8');
const exclusionsMigration=fs.readFileSync(new URL('../../CompaniesAuditorExclusionsMigration.js',import.meta.url),'utf8');
const v211SchemaMigration=fs.readFileSync(new URL('../../V211PlanningSchemaMigration.js',import.meta.url),'utf8');
const companiesBackend=fs.readFileSync(new URL('../../CompaniesBackend.js',import.meta.url),'utf8');

const checks=[
  ['Toolkit projects formal hours as required hours',r4.includes('formalHours:Number(String(g([')&&r4.includes('requiredHours:Number(String(g([')],
  ['Toolkit does not expose schedulingHoursTarget',!r4.includes('schedulingHoursTarget:')],
  ['Save validation uses formal hours with minute-safe 15-minute tolerance',r4.includes("PLANNED_HOURS_BELOW_FORMAL_HOURS")&&r4.includes('formalTargetMinutes=Math.round(formalTarget*60)')&&r4.includes('planningDeltaMinutes < -15')&&r4.includes('planningDeltaMinutes > 15')],
  ['Planning JSON keeps formal target separate from actual concrete block duration',r4.includes('JSON.stringify({blocks:requested,formalHours,totalPlannedHours:Math.round(total*100)/100')&&!r4.includes('scheduledHours')],
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
  ['Save enablement compares planned hours with formal target using 15-minute tolerance',r5.includes('Math.abs(Math.round(hours*60)-Math.round(target*60))<=15')],
  ['Committed overlap remains hard',r4.includes("throw new Error('AVAILABILITY_COLLISION_'+b.date)")],
  ['Actual Availability block writes remain requested start/end',r4.includes('x.row[z.s]=b.start;x.row[z.e]=b.end;x.row[z.id]=auditId')],
  ['Combined visit validates against summed formal hours with 15-minute tolerance',r6.includes('formalRequired+=Number(a?.formalHours||0)')&&r6.includes('formalRequiredMinutes=Math.round(formalRequired*60)')&&r6.includes('Math.abs(planningDeltaMinutes)>15')],
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

  ['R4 keeps Company comments separate from audit-visit notes',r4.includes("managerCommentLast:g(['Manager comment (last)'")&&r4.includes("auditorCommentLast:g(['Auditor comment (last)'")&&r5.includes("Company auditor comments: ")&&r5.includes("Audit/visit manager note: ")&&r5.includes("Audit/visit auditor note: ")],
  ['R4 keeps Company and Auditor constraints visibly available',r5.includes('id="planningConstraints"')&&r5.includes('function renderPlanningConstraints()')&&r5.includes("Auditor less available: ")&&r5.includes("Company less available: ")&&r5.includes("renderPlanningConstraints();renderAvailability();validate();loadRotation()")],

  ['R4 blocks Save on hard unavailable date and committed overlap',r5.includes('function hardDraftAvailabilityErrors()')&&r5.includes("day?.visualState==='HARD_BLOCKED'")&&r5.includes('externalConflicts(b).length')&&r5.includes('!hardAvailabilityErrors.length')],  ['R4 left slot column avoids horizontal overflow',r5.includes('overflow-y:auto;overflow-x:hidden')&&r5.includes('.slotTop>*{min-width:0}')&&r5.includes('class="slotWork"')&&r5.includes('class="slotLocation"')],  ['R4 slot comments remain persisted in canonical Planning JSON blocks',r4.includes('slotComment=clean(x?.slotComment||x?.comment)')&&r4.includes('planningJson=JSON.stringify({blocks:requested')],

  ['R4 slot comments do not overwrite Manager comment last',!r4.includes("set(['Manager comment (last)'],clean(body?.comment))")&&!r5.includes("draftBlocks.map(b=>b.slotComment).filter(Boolean).join(' | ')" )],
  ['R4 off-site blocks display no Company execution location',r5.includes("off?'<option value=\"\" selected>—</option>':locationOptionMarkup")&&r5.includes("b.execLoc=b.executionType==='OFFSITE'?'':")],
  ['R4 save synchronizes visible slot editors before payload',r5.includes('function syncVisibleSlotEditors()')&&r5.includes('async function save(){syncVisibleSlotEditors();if(!validate())return;')],
  ['R4 slot time inputs use real scrollable quarter-hour selects',r5.includes('function quarterTimeOptions(selected)')&&r5.includes('for(const m of [0,15,30,45])')&&r5.includes('<select data-start>')&&r5.includes('<select data-end>')&&!r5.includes('data-start type="time"')&&!r5.includes('data-end type="time"')],
  ['R4 backend enforces valid quarter-hour planning times',r4.includes('PLANNING_BLOCK_QUARTER_HOUR_REQUIRED')&&r4.includes('![0,15,30,45].includes(sm)')&&r4.includes('![0,15,30,45].includes(em)')],
  ['R4 backend rejects overlapping draft blocks',r4.includes("throw new Error('PLANNING_BLOCKS_OVERLAP')")&&r4.includes('requested[i].date===requested[j].date')],
  ['R4 backend validates onsite execution location against Company locations',r4.includes("throw new Error('PLANNING_EXECUTION_LOCATION_INVALID')")&&r4.includes('companyPlanningContext(vr[5]?.values||[]')&&r4.includes('allowedExecLocs')],
  ['R4 client disables Save when any draft block is outside planning window',r5.includes('windowValid=draftBlocks.every')&&r5.includes('&&windowValid&&hoursComplete')],
  ['R4 backend limits five distinct audit days rather than five blocks',r4.includes('new Set(requested.map(b=>b.date)).size>5')&&!r4.includes('requested.length>5')],
  ['R4 client limits five distinct audit days rather than five blocks',r5.includes('new Set(draftBlocks.map(b=>b.date)).size>=5')&&!r5.includes('draftBlocks.length>=5')],
  ['R4 calendar deselect removes all blocks for the selected day',r5.includes('const existing=draftBlocks.some(b=>b.date===date)')&&r5.includes('draftBlocks=draftBlocks.filter(b=>b.date!==date)')],
  ['V2.11 calendar has no generic 8h or 09:00-17:00 full-day occupancy ceiling',!r5.includes('blockedOp>=8*60')&&!r5.includes('Math.min(x[1],17*60)')&&r5.includes("visualState=fullDayUnavailable?'no'")],
  ['V2.11 HARD Availability remains absolute while timed HARD blocks only their own interval',r5.includes("hardTimedSlots=slotsArr.filter(s=>s.kind==='hard'&&s.start&&s.end)")&&r5.includes('fullDayUnavailable=hardUnavailable&&!hardTimedSlots.length')&&r4.includes('wholeDayHard')&&r4.includes('timedHard')&&r6.includes('wholeDayHard')&&r6.includes('timedHard')],
  ['Toolkit has no separate Add slot path; calendar click owns slot creation',!r5.includes('function addSlot(){')&&!r5.includes('Add slot')],
  ['V2.11 Toolkit can add multiple non-overlapping blocks on one selected day without restoring the old global Add slot step',r5.includes('function addBlockSameDay(i)')&&r5.includes('data-addblock')&&r5.includes("row.querySelector('[data-addblock]').onclick=()=>addBlockSameDay(i)")],
  ['R4 slot edit action supports select-based time picker',r5.includes("typeof startEl.showPicker==='function'")&&!r5.includes('startEl.select()')],
  ['R4 default slot never generates an invalid next-day time',r5.includes("endMin>23*60+45")&&r5.includes('No valid same-day quarter-hour slot fits the remaining hours on this day.')],
  ['R4 client structurally validates all draft blocks before Save',r5.includes('function draftBlocksStructurallyValid()')&&r5.includes('blocksValid=draftBlocksStructurallyValid()')&&r5.includes('&&blocksValid&&windowValid')],
  ['V2.11 rotation maximum is hard in Toolkit and canonical commit',r5.includes("rotationState==='ROTATION_LIMIT'")&&r5.includes('rotationValid')&&r4.includes("PLANNING_ROTATION_LIMIT_HARD_BLOCK")&&r4.includes('await directRotationRead(auditId,auditorEmail)')],
  ['Rotation check failure fails closed in Toolkit and commit',r5.includes('candidate.rotationCheckFailed')&&r4.includes("PLANNING_ROTATION_CHECK_FAILED")],
  ['Toolkit Save stays blocked while hard rotation validation is pending',r5.includes("candidate.rotationState='LOADING'")&&r5.includes("'DEFERRED','LOADING','CHECK_FAILED','ROTATION_LIMIT'")],
  ['Planning JSON keeps formal target separate from actual committed block duration',r4.includes('formalHours,totalPlannedHours:Math.round(total*100)/100')&&r6.includes('formalHours:Math.round(formalRequired*100)/100,totalPlannedHours:Math.round(total*100)/100')&&r5.includes("totalPlannedHours:Math.round(plannedHours()*100)/100")],
  ['R6 combined writer enforces quarter-hour and five-day rules',r6.includes('PLANNING_BLOCK_QUARTER_HOUR_REQUIRED')&&r6.includes('new Set(requested.map(b=>b.date)).size>5')&&r6.includes("throw new Error('PLANNING_BLOCKS_OVERLAP')")],
  ['R6 combined writer enforces V2.11 hard rotation for every Visit member',r6.includes('async function innerRotationCheck')&&r6.includes('for(const memberId of memberIds)')&&r6.includes("PLANNING_ROTATION_LIMIT_HARD_BLOCK")&&r6.includes("PLANNING_ROTATION_CHECK_FAILED")],
  ['R6 combined writer validates onsite execution locations against canonical Company Locations_JSON',r6.includes('function companyLocationCodes')&&r6.includes("'Companies!A1:AJ686'")&&r6.includes("PLANNING_EXECUTION_LOCATION_INVALID")],
  ['V2.11 Company Auditor_Exclusions are hard in single and combined Planning when configured',r4.includes('function companyAuditorExclusions')&&r4.includes("AUDITOR_EXCLUDED_FOR_COMPANY")&&r6.includes('function companyAuditorExcluded')&&r6.includes("AUDITOR_EXCLUDED_FOR_COMPANY")],
  ['V2.11 Config_Scopes Min_Interval_Months is a hard single and combined Planning constraint when configured',r4.includes("Min_Interval_Months")&&r4.includes('function minimumIntervalConstraint')&&r4.includes("MIN_INTERVAL_HARD_BLOCK_")&&r6.includes('function combinedMinPlanningDate')&&r6.includes("MIN_INTERVAL_HARD_BLOCK_")&&r5.includes('minIntervalValid')&&r5.includes('Minimum audit interval: not before ')],
  ['V2.11 minimum interval migration is schema-only and business values stay in Config_Scopes',minIntervalMigration.includes('ConfigScopesMinIntervalMigration_Preview')&&minIntervalMigration.includes('ConfigScopesMinIntervalMigration_Apply')&&minIntervalMigration.includes("HEADER: 'Min_Interval_Months'")&&!minIntervalMigration.includes('MPS_GAP_MONTHS')&&!minIntervalMigration.includes('MPS-GAP = 6')],
  ['Central ConfigScopesService exposes Min_Interval_Months to other AMS consumers',configScopesService.includes('minIntervalMonths: ConfigScopes_numOrNull_')&&configScopesService.includes("'Min_Interval_Months'")],
  ['V2.11 Company Auditor_Exclusions schema migration is explicit and non-destructive',exclusionsMigration.includes('CompaniesAuditorExclusionsMigration_Preview')&&exclusionsMigration.includes('CompaniesAuditorExclusionsMigration_Apply')&&exclusionsMigration.includes("HEADER: 'Auditor_Exclusions'")&&exclusionsMigration.includes('Existing data is never changed')],
  ['CompaniesBackend normalizes structured Auditor_Exclusions to unique lowercase emails with active/reason metadata',companiesBackend.includes("auditorEmail: email, active: !!active, reason: reason")&&companiesBackend.includes("seen[email]")&&companiesBackend.includes("email = COMP_cleanText_(email).toLowerCase()")],
  ['V2.11 Planning schema changes have one bundled preview/apply runner',v211SchemaMigration.includes('V211PlanningSchemaMigration_Preview')&&v211SchemaMigration.includes('V211PlanningSchemaMigration_Apply')&&v211SchemaMigration.includes('ConfigScopesMinIntervalMigration_Apply()')&&v211SchemaMigration.includes('CompaniesAuditorExclusionsMigration_Apply()')],
  ['CompaniesBackend preserves Auditor_Exclusions on ordinary saves and only writes them when explicitly supplied',companiesBackend.includes("Object.prototype.hasOwnProperty.call(payload, 'auditorExclusions')")&&companiesBackend.includes("if (clean.auditorExclusions !== null) COMP_writeIfHeaderExists_")&&companiesBackend.includes('function COMP_normalizeAuditorExclusions_')],
  ['R6 combined writer does not overwrite Manager comment with planning payload',!r6.includes("setTarget(['Manager comment (last)'],clean(body?.comment))")]
];

const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('planning-toolkit-v210-contract-test passed');
