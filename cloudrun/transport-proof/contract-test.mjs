import fs from 'node:fs';
const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const checks=[
 ['r5 focused planning route',r5.includes("u.pathname==='/planning'")&&r5.includes('planningHtml(auditId)')],
 ['r5 canonical save route',r5.includes("u.pathname==='/api/v1/planning/save'")&&r5.includes('canonicalPlanningSave')],
 ['r5 session required',r5.includes("error:'SESSION_REQUIRED'")],
 ['r5 canonical GAS writer',r5.includes("searchParams.set('action','externalplanningworkspace')")],
 ['r5 required-hours UI',r5.includes('id="requiredHours"')&&r5.includes('a.requiredHours')],
 ['r5 preassigned UI',r5.includes('id="preassigned"')&&r5.includes('a.preassignedAuditor')],
 ['r5 warning surface',r5.includes('id="warnings"')&&r5.includes('warningMessages()')],
 ['r5 planning-window hard date guard',r5.includes("d>=a.planningWindowFrom")&&r5.includes("d<=a.planningWindowTo")],
 ['r5 required-hours soft warning',r5.includes('required audit time is')&&r5.includes('These are soft warnings. Continue?')],
 ['r5 multi-slot UI',r5.includes('id="addSlot"')&&r5.includes('id="slotList"')&&r5.includes('draftBlocks=[]')],
 ['r5 multi-slot canonical payload',r5.includes('blocks:draftBlocks.slice()')],
 ['r5 duplicate-slot guard',r5.includes('This slot is already added.')],
 ['r5 draft-overlap guard',r5.includes('This slot overlaps another slot in the draft.')&&r5.includes('function overlaps(')],
 ['r5 external-conflict hard guard',r5.includes('overlaps existing committed/provisional occupancy and cannot be added.')&&r5.includes('function externalConflicts(')],
 ['r5 no arbitrary five-block ceiling',!r5.includes('PLANNING_TOO_MANY_BLOCKS')],
 ['r5 aggregate planned-hours guard',r5.includes("draftBlocks.reduce((n,b)=>n+blockHours(b),0)")],
 ['r5 embedded regex escapes preserved',r5.includes("match(/^(\\\\d{2}):(\\\\d{2})$/)")],
 ['r5 embedded warning newlines escaped',r5.includes("warnings.join('\\\\n')+'\\\\n\\\\nThese are soft warnings. Continue?'")],
 ['r4 required-hours projection',r4.includes("requiredHours:Number(String(g(['Total audit time in hours'")],
 ['r4 no five-candidate truncation',!r4.includes('.slice(0,5);')],
 ['r4 qualification remains scope-based',r4.includes('required.every(sc=>')],
 ['r4 focused read bounded batch',r4.includes("sheetsBatchGet(['Audit planning!A1:AX768','Auditors!A1:AZ256','Auditor Availability!A:P','Concept Reservations!A1:P256','Config_Scopes!A1:Z128','Companies!A1:AZ768'])")],
 ['r4 availability read not row-truncated',r4.includes("'Auditor Availability!A:P'")&&!r4.includes("'Auditor Availability!A1:P768'")],
 ['r4 canonical availability identity aliases',r4.includes('function availabilityProjection(values,candidates')&&r4.includes("ci=col(h,['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name','Auditor'])")&&r4.includes('const rawIdentity=ci>=0?val(row,ci)')],
 ['r4 company planning context',r4.includes('function companyPlanningContext(')&&r4.includes('audit.preferredAuditMonths=companyCtx.preferredAuditMonths')&&r4.includes('audit.locations=companyCtx.locations')],
 ['r5 canonical locations UI',r5.includes('for(const x of a.locations||[])')&&r5.includes('id="location"')],
 ['r5 preferred months UI',r5.includes("a.preferredAuditMonths?'Preferred: '")],
 ['r5 required-hours drives default end',r5.includes("Math.round(Number(a.requiredHours)*60)")&&r5.includes("q('#start').addEventListener('change'")],
 ['r4 default weekend marker not occupancy',r4.includes("if(z.auditRef||z.start||z.end)slots.push(z)")&&!r4.includes("if(z.start||z.end||z.auditRef||z.status)slots.push(z)")]
,
 ['r5 quarter-hour time navigation',r5.includes('step="900" list="quarterHours"')&&r5.includes('function snapQuarter(v)')],
 ['r56 implicit availability is green',r5.includes("state:'YES',available:'YES'")&&r5.includes("hasOccupancy?'partial':'yes'")],
 ['r56 1.0 full-day criterion',r5.includes("blockedOp>=8*60||blockedBar>=8*60")&&r5.includes("auditFullDay")&&r5.includes("'FULLY OCCUPIED'")],
 ['r57 canonical availability visual states',r4.includes("visualState=hasAudit?'OCCUPIED':state==='NO'?(hasSoft?'SOFT_UNAVAILABLE':'HARD_BLOCKED'):'AVAILABLE'")],
 ['r57 soft warning not audit occupancy',r5.includes("auditSlots=slotsArr.filter(s=>s.kind==='audit'||s.auditRef)")&&r5.includes("softDay?'SOFT WARNING':'YES'")],
 ['r57 auditor default blocked weekday is soft',r5.includes("blockedDays.includes(wd)")&&r5.includes("defaultSoft")],
 ['r58 company context parity',r4.includes("contactName:''")&&r4.includes("preferredTimeWindow:''")&&r4.includes('audit.companyContext=companyCtx')&&r5.includes('id="companyContext"')],
 ['r58 effective planning window starts no earlier than today',r5.includes('effectiveFrom=a.planningWindowFrom&&a.planningWindowFrom>today?a.planningWindowFrom:today')&&r5.includes("txt('#window',[effectiveFrom,a.planningWindowTo]")],
 ['r58 inactive locations excluded',r4.includes("o.active===false||String(o.active).toLowerCase()==='false'")],
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log((ok?'PASS ':'FAIL ')+name);
if(failed.length){console.error('Contract failures: '+failed.map(([n])=>n).join(', '));process.exit(1);}
console.log('Focused Planning 2.0 contract GREEN: '+checks.length+'/'+checks.length);
