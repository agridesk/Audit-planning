import assert from 'node:assert/strict';
import {v211ActorCapabilities,v211AuditVisibleToActor} from './actor-capabilities-v211.js';

function caps(input){return v211ActorCapabilities(input).capabilities;}

assert.equal(v211AuditVisibleToActor({actorRole:'Manager',status:'Pending Planning'}),true);
assert.equal(v211AuditVisibleToActor({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',preassignedAuditor:'a@example.com'}),true);
assert.equal(v211AuditVisibleToActor({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',allowSelfPlanning:true,hardEligible:true}),true);
assert.equal(v211AuditVisibleToActor({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',allowSelfPlanning:true,hardEligible:false}),false);

assert.equal(caps({actorRole:'Manager',status:'Pending Planning'}).canPlan,true);
assert.equal(caps({actorRole:'Manager',status:'Pending Approval'}).canApprove,true);
assert.equal(caps({actorRole:'Manager',status:'Approved'}).canAcceptOnBehalf,true);
assert.equal(caps({actorRole:'Manager',status:'Accepted'}).canComplete,true);

assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',preassignedAuditor:'a@example.com',allowSelfPlanning:true,hardEligible:true}).canPlan,true);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',preassignedAuditor:'a@example.com',allowSelfPlanning:false,hardEligible:true}).canPlan,false);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',preassignedAuditor:'a@example.com',hardEligible:false}).canPlan,false);
assert.equal(v211ActorCapabilities({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',preassignedAuditor:'a@example.com',allowSelfPlanning:true,hardEligible:false}).preassignmentConflict,true);
assert.equal(v211AuditVisibleToActor({actorRole:'Auditor',actorEmail:'a@example.com',status:'Accepted',preassignedAuditor:'a@example.com'}),false);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Planning',allowSelfPlanning:true,hardEligible:true}).canPlan,true);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Approved',assignedTo:'a@example.com'}).canAccept,true);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Pending Approval',assignedTo:'a@example.com'}).canCancel,true);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Accepted',assignedTo:'a@example.com'}).canComplete,true);
assert.equal(caps({actorRole:'Auditor',actorEmail:'a@example.com',status:'Approved',assignedTo:'b@example.com'}).canAccept,false);

console.log(JSON.stringify({ok:true,build:'2026-10-04_ACTOR_CAPABILITIES_V211_TEST_R3',tests:18,writesPerformed:false}));
