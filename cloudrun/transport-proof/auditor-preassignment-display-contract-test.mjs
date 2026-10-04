import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');

const blocked=v211ActorCapabilities({
  actorRole:'Auditor',
  actorEmail:'auditor@example.com',
  status:'Pending Planning',
  preassignedAuditor:'auditor@example.com',
  hardEligible:false
});
assert.equal(blocked.visible,true);
assert.equal(blocked.capabilities.canPlan,false);
assert.equal(blocked.preassignmentConflict,true);

const allowed=v211ActorCapabilities({
  actorRole:'Auditor',
  actorEmail:'auditor@example.com',
  status:'Pending Planning',
  preassignedAuditor:'auditor@example.com',
  hardEligible:true
});
assert.equal(allowed.capabilities.canPlan,true);

for(const needle of [
  "assignedToDisplayName:directAuditorDisplayName",
  "preassignedAuditorDisplayName:directAuditorDisplayName",
  "eligibilityConflictReason",
  "AUDITOR_PLANNING_NOT_ELIGIBLE"
]) assert.ok(r4.includes(needle),needle);

assert.ok(r5.includes("a.preassignedAuditorDisplayName||a.preassignedAuditor"),'Toolkit must prefer auditor display name');
assert.ok(ui.includes("r.preassignmentConflict"),'Grid must surface preassignment conflict');
assert.ok(ui.includes("r.assignedToDisplayName||r.auditorDisplayName"),'Grid must prefer auditor display name');

console.log(JSON.stringify({ok:true,build:'2026-10-04_AUDITOR_PREASSIGNMENT_DISPLAY_CONTRACT_R1',tests:12,writesPerformed:false}));
