import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');

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
  "row.canExtend=row.statusKey==='PENDING_PLANNING'&&months>0&&extensionLinked.has(row.auditId)"
]){assert.ok(r4.includes(needle),needle);tests++;}

assert.ok(ui.includes('var months=Number(r.extensionMonths||r.extMonths||0),applied=!!(r.extensionApplied||r.extApplied),pending=r.statusKey==="PENDING_PLANNING",can=!!r.canExtend'), 'Extension UI must trust canonical capability only');tests++;
assert.ok(ui.includes('displayName+" · "+actorRole'), 'Portal identity must prefer display name');tests++;
assert.ok(ui.includes('Planning window expired · ended '),'Expired planning window must be user-facing');tests++;
assert.ok(ui.includes('No valid execution date in this planning window · minimum interval'),'Minimum interval conflict must be user-facing');tests++;

for(const forbidden of ["'FULLY UNAVAILABLE'","'PARTLY OCCUPIED'","'SOFT WARNING'","'YES')+'</div>'"]){
  assert.equal(r5.includes(forbidden),false,'Legacy calendar label remains: '+forbidden);tests++;
}
for(const required of ["'Unavailable'","'Partly unavailable'","'Auditor less available'","'Company less available'","'Auditor + company less available'","s.start+'–'+s.end","'Earliest execution date: '+a.minPlanningDate+' (minimum interval)'","'Planning window expired: '+a.planningWindowTo"]){
  assert.ok(r5.includes(required),'Missing calendar UX token: '+required);tests++;
}

console.log(JSON.stringify({ok:true,build:'2026-10-05_PORTAL_REVIEW_HARDENING_CONTRACT_R2',tests,writesPerformed:false}));
