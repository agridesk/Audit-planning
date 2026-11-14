import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const match=source.match(/function toggleCalendarDay\(date,visualState\)\{[\s\S]*?(?=function renderVisitComposition\()/);
assert.ok(match,'Issue #87 calendar click handler exists');
const fields={'#date':{value:''},'#start':{value:''},'#end':{value:''},'#location':{value:'HQ'},'#comment':{value:''}};
let notices=[];
const ctx={
 draftBlocks:[],composition20:{mode:'TOGETHER'},actorRole:'manager',model:{data:{audit:{minPlanningDate:''}}},
 q:key=>{assert.ok(fields[key],key);return fields[key]},
 hhmm:time=>{const [h,m]=String(time||'').split(':').map(Number);return h*60+m},
 blockHours:b=>(Number(b.end.slice(0,2))*60+Number(b.end.slice(3))-
  Number(b.start.slice(0,2))*60-Number(b.start.slice(3)))/60,
 planningTarget:()=>9,
 plannedHours:()=>ctx.draftBlocks.reduce((sum,b)=>sum+ctx.blockHours(b),0),
 externalConflicts:()=>[],provisionalConflicts:()=>[],
 setStatus:(text)=>notices.push(text),renderDraft:()=>{},validate:()=>{},renderAvailability:()=>{}
};
runInNewContext(match[0]+';this.clickDay=toggleCalendarDay;',ctx);
ctx.clickDay('2026-12-01','yes');
assert.equal(ctx.draftBlocks.length,1);
assert.equal(ctx.plannedHours(),9,'one click plans combined 6 + 3 hours');
assert.equal(ctx.draftBlocks[0].start,'09:00');
assert.equal(ctx.draftBlocks[0].end,'18:00');
ctx.clickDay('2026-12-02','yes');
assert.equal(ctx.draftBlocks.length,2,'second click creates second day');
assert.deepEqual(Array.from(ctx.draftBlocks,x=>ctx.blockHours(x)),[8,1],
 'nine hours automatically redistribute across two days');
assert.equal(ctx.plannedHours(),9);
assert.equal(ctx.draftBlocks.some(x=>x._autoCombined20),false,
 'temporary auto-allocation marker is cleared');
ctx.clickDay('2026-12-03','yes');
assert.equal(ctx.draftBlocks.length,2,'third day does not overplan full hours');
assert.ok(notices.some(s=>s.includes('Required hours are already fully planned')));
ctx.model.data.audit.minPlanningDate='2027-05-03';
const before=ctx.draftBlocks.length;
ctx.clickDay('2027-05-02','yes');
assert.equal(ctx.draftBlocks.length,before,'Earliest execution date must block earlier calendar picks');
assert.ok(notices.some(s=>s.includes('Minimum audit interval: planning cannot start before 2027-05-03')));
assert.ok(source.includes("No planning days available: the planning window ended on "), 'Expired windows must show an explicit calendar explanation');
assert.ok(source.includes("beforeMinimum?'no':visualState"),'Calendar must render early dates as blocked');
assert.ok(source.includes('No selectable dates: the earliest permitted execution date ')&&source.includes('a.minPlanningDate>selectedWindow.to'),'Infeasible window must be explained before showing selectable dates');
assert.ok(source.includes('blocks:draftBlocks.map(({_autoCombined20,...x})=>({...x}))'),
 'UI-only auto-allocation marker must not be sent to canonical writer');

assert.ok(source.includes("const visitWindow=selectedVisitWindow();if(!visitWindow.valid){visitAuditIds.delete(auditId);el.checked=false"),
 'incompatible second audit must be rolled back before rerendering the calendar');
assert.ok(source.includes("Cannot combine these audits: the planning windows do not overlap, or one audit lacks a valid planning window."),
 'incompatible combined visits must explain the missing calendar instead of silently clearing it');
assert.ok(source.includes("const effectiveWindow=selectedVisitWindow();q('#date').min=effectiveWindow.valid?effectiveWindow.from:''"),
 'calendar must restore the original valid primary planning window after an invalid combination');
assert.ok(source.includes("earlyWarning=r.isPrimary?'':!canonical?")&&source.includes('Cannot combine: planning windows do not overlap. Plan separately.')&&source.includes('Cannot combine: canonical planning window missing; deadline alone is insufficient. Plan separately.'),'second audit must warn before selection');
assert.ok(source.includes("earlyWarning?'<input type=")&&source.includes('disabled title='),'incompatible second audit choice must be disabled');
console.log('Issue #87 combined calendar: 9h in one click, 8+1 across two clicks: PASS');
