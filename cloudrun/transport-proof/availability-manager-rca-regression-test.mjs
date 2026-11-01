import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPlanningOverlayService} from './availability-planning-overlay-service-20.js';
const html=readFileSync(new URL('./availability-manager-calendar-20.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source);
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',style:{},listeners:{},addEventListener(event,fn){(this.listeners[event]??=[]).push(fn)},querySelectorAll:()=>[]});return elements.get(id)};
const ctx=vm.createContext({document:{getElementById:el},Set,Map,Date,console});
vm.runInContext(source.slice(0,source.indexOf("$('load').addEventListener('click',load)"))+'\n'+source.match(/function syncFilterDate[\s\S]*?\n}/)[0],ctx);
const days=['2026-11-04','2026-11-05','2026-11-06'].map(date=>({date,segments:[{state:'FREE',start:'08:00',end:'18:00'}]}));
const data={fromDate:'2026-11-04',toDate:'2026-11-06',auditors:[{auditorId:'a',displayName:'Auditor A',days}],incompleteAuditDiagnostics:[],outsidePeriodAuditDiagnostics:[],uncertainAuditorIds:[]};
ctx.data=data;el('availabilityFilter').value='available';el('filterDate').value='2026-10-31';el('searchTerm').value='';
vm.runInContext('renderOverview(data)',ctx);
assert.equal(el('filterDate').value,'2026-11-04');assert.equal(el('filterDate').min,'2026-11-04');assert.equal(el('filterDate').max,'2026-11-06');
assert.match(el('comparison').innerHTML,/1 of 1 auditors/);
el('filterDate').value='2026-11-05';vm.runInContext('renderOverview(data)',ctx);assert.equal(el('filterDate').value,'2026-11-05');
const previousDay=data.auditors[0].days[1].segments;data.auditors[0].days[1].segments=[{state:'FREE',start:'08:00',end:'09:00'},{state:'COMMITTED',start:'09:00',end:'14:00'},{state:'FREE',start:'14:00',end:'18:00'}];vm.runInContext('renderOverview(data)',ctx);assert.match(el('comparison').innerHTML,/No auditors match these filters on 2026-11-05/);data.auditors[0].days[1].segments=previousDay;

el('filterDate').value='2027-01-01';vm.runInContext('renderOverview(data)',ctx);assert.equal(el('filterDate').value,'2026-11-04');
data.uncertainAuditorIds=['a'];data.outsidePeriodAuditDiagnostics=[{company:'Old <Company>',plannedDate:'2026-03-31',auditId:'NEVER_RENDER_UID'}];
vm.runInContext('renderOverview(data)',ctx);
assert.match(el('comparison').innerHTML,/No auditors match these filters on 2026-11-04/);assert.doesNotMatch(el('comparison').innerHTML,/<tr><th>2026-/);
assert.match(el('review').innerHTML,/outside this period/);assert.match(el('review').innerHTML,/Old &lt;Company&gt;/);assert.doesNotMatch(el('review').innerHTML,/NEVER_RENDER_UID/);
el('availabilityFilter').value='all';vm.runInContext('renderOverview(data)',ctx);assert.match(el('comparison').innerHTML,/Availability uncertain/);assert.doesNotMatch(el('comparison').innerHTML,/Free 10/);
data.outsidePeriodAuditDiagnostics=[];data.uncertainAuditorIds=[];vm.runInContext('renderOverview(data)',ctx);assert.equal(el('review').innerHTML,'');
// Re-render uses the loaded data, including diagnostics, rather than edited range inputs.
assert.match(source,/if\(S.overview\)renderOverview\(S.overview\)/);
// Out-of-order requests must not restore the previous period or old warnings.
const pending=[];ctx.fetch=()=>new Promise(resolve=>pending.push(resolve));
el('from').value='2026-11-04';el('through').value='2026-11-06';
const first=vm.runInContext('load()',ctx);
el('from').value='2026-11-05';const second=vm.runInContext('load()',ctx);
const newer={...data,fromDate:'2026-11-05'};
pending[1]({ok:true,json:async()=>newer});await second;
pending[0]({ok:true,json:async()=>({...data,incompleteAuditDiagnostics:[{company:'Stale warning'}]})});await first;
assert.equal(vm.runInContext('S.overview.fromDate',ctx),'2026-11-05');assert.doesNotMatch(el('review').innerHTML,/Stale warning/);
const actor={id:'manager:a',role:'manager'},auditors=[{auditorId:'a',email:'a@example.com'},{auditorId:'b',email:'b@example.com'}];
const header=['Audit ID','Status','Assigned to','Planning JSON','Auditor_UID','Date - Planned','Company','Last manager decision'];
const rows=[header,
 ['transfer','Pending Approval','','','','','Transfer company','TRANSFER'],
 ['old','Accepted','a@example.com','','a','2026-03-31','Historical company',''],
 ['current','Accepted','b@example.com','','b','2026-11-05','Current company',''],
 ['other','Pending Approval','','','','','Unassigned company','']];
const service={read:async(_,auditorId)=>({auditorId,version:1,blocks:[],metadata:{}}),mutate:async()=>({success:true})};
const overlay=createPlanningOverlayService({service,readPlanningRows:async()=>rows,listCanonicalAuditors:async()=>auditors});
const query={actor,auditorIds:['a','b'],fromDate:'2026-11-04',toDate:'2026-11-06'};
let result=await overlay.managerOverview(query);
assert.deepEqual(result.incompleteAuditDiagnostics.map(x=>x.company),['Current company']);
assert.deepEqual(result.outsidePeriodAuditDiagnostics.map(x=>x.company),['Historical company']);
assert.deepEqual(result.uncertainAuditorIds,['b'],'historical dated planning does not taint the current read filter');
assert.deepEqual(result.uncertainAuditorIds.sort(),['b']);assert.equal(result.unknownReservationOwner,false);
assert(!JSON.stringify(result.incompleteAuditDiagnostics).includes('Transfer company'));
result=await overlay.period({actor:{id:'a',role:'auditor'},auditorId:'a',fromDate:query.fromDate,toDate:query.toDate});
assert.equal(result.incompleteAuditDiagnostics.length,0);assert.equal(result.outsidePeriodAuditDiagnostics.length,1);assert(!JSON.stringify(result).includes('Current company'));
result=await overlay.managerOverview({...query,auditorIds:['a']});assert.equal(result.incompleteAuditDiagnostics.length,0);assert.equal(result.outsidePeriodAuditDiagnostics.length,1);
// Preserve write safety even for a dated legacy plan outside the visible range.
await assert.rejects(()=>overlay.mutate({actor,auditorId:'a',expectedVersion:1,mutation:{action:'BLOCK_PERIOD',date:'2026-11-05',wholeDay:true}}),/INCOMPLETE_RESERVATION_UNCERTAIN/);
const transferOnly=createPlanningOverlayService({service,readPlanningRows:async()=>[header,rows[1]],listCanonicalAuditors:async()=>auditors});
result=await transferOnly.managerOverview(query);assert.equal(result.incompleteAuditDiagnostics.length,0);assert.equal(result.outsidePeriodAuditDiagnostics.length,0);assert.deepEqual(result.uncertainAuditorIds,[]);
await transferOnly.mutate({actor,auditorId:'a',expectedVersion:1,mutation:{action:'BLOCK_PERIOD',date:'2026-11-05',wholeDay:true}});
console.log('PASS Manager Availability RCA: date bounds, zero results, safe labels, diagnostic persistence, historical separation, transfer handling, ownership isolation and unchanged write guards');
