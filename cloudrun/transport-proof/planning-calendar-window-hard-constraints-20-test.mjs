import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const start=source.indexOf('function renderAvailability()');
const end=source.indexOf('function addDaysIso(',start);
assert.ok(start>0&&end>start,'Planning calendar renderer required');
const compiled=source.slice(start,end);
function renderCase({from,to,valid=true,today='2026-11-14',minPlanningDate=''}) {
 const elements={
  '#availability':{innerHTML:''},
  '#weekdays':{innerHTML:''},
  '#windowLabel':{textContent:''},
  '#prevWindow':{disabled:false},
  '#nextWindow':{disabled:false},
  '#auditor':{value:'auditor@example.test',selectedIndex:0,options:[{dataset:{blocked:''}}]}
 };
 const context={
  q:key=>{assert.ok(elements[key],'Missing calendar test element '+key);return elements[key];},
  txt:(key,v)=>{elements[key].textContent=String(v);},
  model:{data:{audit:{minPlanningDate},overlays:{availability:{byAuditorEmail:{}},reservations:{byAuditorEmail:{}}}}},
  calendarAnchor:'',CALENDAR_WINDOW_DAYS:70,
  localToday:()=>today,
  selectedVisitWindow:()=>({from,to,valid}),
  addDaysIso:(date,days)=>{const x=new Date(date+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)},
  escHtml:x=>String(x)
 };
 runInNewContext(compiled+';this.testRenderAvailability=renderAvailability;',context);
 context.testRenderAvailability();
 return elements;
}
const expired=renderCase({from:'2026-07-13',to:'2026-11-13'});
assert.match(expired['#availability'].innerHTML,/No planning days available: the planning window ended on 2026-11-13/);
assert.equal(expired['#nextWindow'].disabled,true);
const infeasible=renderCase({from:'2027-01-11',to:'2027-04-11',minPlanningDate:'2027-05-03'});
assert.match(infeasible['#availability'].innerHTML,/No selectable dates: the earliest permitted execution date 2027-05-03 is later than the planning window end 2027-04-11/);
assert.equal(infeasible['#prevWindow'].disabled,true);
assert.equal(infeasible['#nextWindow'].disabled,true);
const disjoint=renderCase({from:'',to:'',valid:false});
assert.match(disjoint['#availability'].innerHTML,/No planning days available: the selected scopes or audits have no valid overlapping planning window/);
assert.match(disjoint['#windowLabel'].textContent,/No valid shared planning window/);
console.log('Planning calendar hard constraints: expired window, interval beyond window, disjoint windows PASS');
