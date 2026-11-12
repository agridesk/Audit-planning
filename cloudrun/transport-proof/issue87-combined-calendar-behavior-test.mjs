import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const match=source.match(/function toggleCalendarDay\(date,visualState\)\{[\s\S]*?(?=function renderVisitComposition\()/);
assert.ok(match,'Issue #87 calendar click handler exists');
const fields={'#date':{value:''},'#start':{value:''},'#end':{value:''},'#location':{value:'HQ'},'#comment':{value:''}};
let notices=[];
const ctx={
 draftBlocks:[],composition20:{mode:'TOGETHER'},actorRole:'manager',
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
assert.ok(source.includes('blocks:draftBlocks.map(({_autoCombined20,...x})=>({...x}))'),
 'UI-only auto-allocation marker must not be sent to canonical writer');
console.log('Issue #87 combined calendar: 9h in one click, 8+1 across two clicks: PASS');
