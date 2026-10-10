import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r10=readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');

let tests=0;

const preassignedNoSelf=v211ActorCapabilities({
  actorRole:'Auditor',
  actorEmail:'paco@example.com',
  status:'Pending Planning',
  preassignedToEmail:'paco@example.com',
  allowSelfPlanning:false,
  hardEligible:true
});
assert.equal(preassignedNoSelf.visible,true);tests++;
assert.equal(preassignedNoSelf.capabilities.canPlan,false);tests++;

const preassignedSelf=v211ActorCapabilities({
  actorRole:'Auditor',
  actorEmail:'paco@example.com',
  status:'Pending Planning',
  preassignedToEmail:'paco@example.com',
  allowSelfPlanning:true,
  hardEligible:true
});
assert.equal(preassignedSelf.capabilities.canPlan,true);tests++;

const stalePreassignment=v211ActorCapabilities({
  actorRole:'Auditor',
  actorEmail:'paco@example.com',
  status:'Accepted',
  assignedToEmail:'isalia@example.com',
  preassignedToEmail:'paco@example.com',
  allowSelfPlanning:true,
  hardEligible:true
});
assert.equal(stalePreassignment.visible,false);tests++;

for(const needle of [
  "!audit.allowSelfPlanning||(!owned&&!freeSelfPlan)",
  "actorDisplayName:directAuditorDisplayName(aud,actorEmail)",
  "extensionLinkedAuditIds",
  "out.fastFirstPaint=true"
]){assert.ok(r4.includes(needle),needle);tests++;}
assert.ok(r10.includes("r.canExtend=r.statusKey==='PENDING_PLANNING'&&extMonths>0&&extensionLinked.has(clean(r.auditId))"),'Extension capability must be resolved in async enrichment');tests++;

assert.ok(ui.includes('var months=Number(r.extensionMonths||r.extMonths||0),applied=!!(r.extensionApplied||r.extApplied),pending=r.statusKey==="PENDING_PLANNING",can=!!r.canExtend'), 'Extension UI must trust canonical capability only');tests++;
assert.ok(ui.includes('displayName+" · "+actorRole'), 'Portal identity must prefer display name');tests++;
assert.ok(ui.includes('Planning window expired · ended '),'Expired planning window must be user-facing');tests++;
assert.ok(ui.includes('No valid execution date in this planning window · minimum interval'),'Minimum interval conflict must be user-facing');tests++;
assert.ok(ui.includes('region-head')&&ui.includes('region-cell'),'Open grid must expose responsive Region column hooks');tests++;
assert.ok(ui.includes('expiry-head')&&ui.includes('expiry-cell'),'Open grid must expose responsive Expiry column hooks');tests++;
assert.ok(ui.includes('required-head')&&ui.includes('required-cell'),'Open grid must expose responsive required-hours hooks');tests++;
assert.ok(html.includes('@media (max-width:1500px)')&&html.includes('@media (max-width:1200px)'),'Audit Grid must define laptop responsive breakpoints');tests++;
assert.ok(html.includes('.region-head,.region-cell,.self-head,.self-cell{display:none}'),'Medium laptop view must compact lower-priority columns while retaining Map');tests++;
assert.ok(html.includes('.locations-head,.locations-cell,.expiry-head,.expiry-cell,.required-head,.required-cell{display:none}'),'Small laptop view must further compact lower-priority columns');tests++;
assert.ok(ui.includes('document.body.classList.toggle("actor-auditor",isAud)'),'Shared grid must expose actor-specific responsive mode');tests++;
assert.ok(ui.includes('auditor-head')&&ui.includes('auditor-cell'),'Auditor column must have role-specific hooks');tests++;
assert.ok(html.includes('body.actor-auditor .auditor-head,body.actor-auditor .auditor-cell{display:none}'),'Auditor Grid must hide redundant Auditor column');tests++;
assert.ok(!html.includes('.region-head,.region-cell,.map-head,.map-cell,.self-head,.self-cell{display:none}'),'Auditor Grid must retain the Map column at laptop breakpoint');tests++;
assert.ok(!html.includes('.region-head,.region-cell,.map-head,.map-cell,.self-head,.self-cell{display:none}'),'Laptop breakpoint must not hide Google Maps pin');tests++;
assert.ok(html.includes('body.actor-auditor .locations-head,body.actor-auditor .locations-cell')&&html.includes('body.actor-auditor .required-head,body.actor-auditor .required-cell{display:none}'),'Auditor Grid must hide secondary columns earlier on laptop');tests++;
assert.ok(html.includes('body.actor-auditor table{min-width:0;width:100%;table-layout:fixed}')&&html.includes('body.actor-auditor .table-wrap{overflow-x:hidden}'),'Auditor Grid must fit the laptop viewport without horizontal scrolling');tests++;
assert.ok(html.includes('.table-wrap{overflow-x:auto;overflow-y:visible')&&html.includes('max-height:none'),'Grid must use page vertical scrolling instead of a nested vertical table scrollbar');tests++;

for(const forbidden of ["'FULLY UNAVAILABLE'","'PARTLY OCCUPIED'","'SOFT WARNING'","'YES')+'</div>'"]){
  assert.equal(r5.includes(forbidden),false,'Legacy calendar label remains: '+forbidden);tests++;
}
for(const required of ["'Unavailable'","'Partly unavailable'","'Auditor less available'","'Company less available'","'Auditor + company less available'","s.start+'–'+s.end","'Earliest execution date: '+a.minPlanningDate+' (minimum interval)'","'Planning window expired: '+a.planningWindowTo"]){
  assert.ok(r5.includes(required),'Missing calendar UX token: '+required);tests++;
}

console.log(JSON.stringify({ok:true,build:'2026-10-10_PORTAL_REVIEW_HARDENING_CONTRACT_R5',tests,writesPerformed:false}));
