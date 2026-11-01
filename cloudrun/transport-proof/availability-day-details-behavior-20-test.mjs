import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./availability-my-calendar-20.html',import.meta.url),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert(a>=0&&b>a);return html.slice(a,b);}
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const clock=t=>t==='24:00'?1440:Number(t.slice(0,2))*60+Number(t.slice(3));
const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const S={auditDetails:{
 a:{auditId:'INTERNAL-A',date:'2026-11-02',company:'Grower A & Sons',scopes:'GAP',location:'Site A',start:'09:00',end:'12:00',state:'COMMITTED'},
 b:{auditId:'INTERNAL-B',date:'2026-11-02',company:'Grower B',scopes:'GRASP',location:'Site B',start:'14:00',end:'17:00',state:'COMMITTED'}
},metadata:{recurring:[{weekday:0,start:'08:00',end:'18:00'}],baselineExceptions:[]}};
const timeline=new Function('S','esc','clock','fmt',section('function humanState(', 'function clock(')+';return timeline;')(S,esc,clock,fmt);
const segments=[{start:'00:00',end:'09:00',state:'FREE'},{start:'09:00',end:'12:00',state:'COMMITTED'},{start:'12:00',end:'14:00',state:'FREE'},{start:'14:00',end:'17:00',state:'COMMITTED'},{start:'17:00',end:'24:00',state:'FREE'}];
const bar=timeline(segments,'2026-11-02');
for(const text of ['Grower A &amp; Sons · 09:00–12:00','Grower B · 14:00–17:00','No restriction'])assert(bar.includes(text),text);
for(const text of ['00:00','24:00','Available','INTERNAL-'])assert(!bar.includes(text),text);
const node={innerHTML:''};
const showDay=new Function('S','$','esc',section('function showDay(', 'async function selectDay(')+';return showDay;')(S,()=>node,esc);
showDay({date:'2026-11-02',segments});
for(const text of ['Grower A &amp; Sons','Grower B','GAP','GRASP','Site A','Site B','09:00–12:00','14:00–17:00'])assert(node.innerHTML.includes(text),text);
assert.equal((node.innerHTML.match(/Normally unavailable \(weekly\)/g)||[]).length,1);
for(const text of ['INTERNAL-A','INTERNAL-B','Audit ID:','00:00','24:00'])assert(!node.innerHTML.includes(text),text);
S.metadata.baselineExceptions=[{fromDate:'2026-11-02',toDate:'2026-11-02',wholeDay:true}];
showDay({date:'2026-11-02',segments});
assert(node.innerHTML.includes('Unavailable (HARD)'));
assert(!node.innerHTML.includes('Normally unavailable (weekly)'));
assert.equal(S.metadata.recurring.length,1,'Presentation must preserve stored weekly preference');
assert.equal(S.metadata.baselineExceptions.length,1);
console.log('PASS Availability day details, two audit hovers, source preferences and work window behavior');
