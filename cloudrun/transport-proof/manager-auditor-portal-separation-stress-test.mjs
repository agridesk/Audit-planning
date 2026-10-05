import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');

const A='a@example.com',B='b@example.com';
const statuses=['Pending Planning','Pending Approval','Approved','Accepted','Completed','Rejected'];

function cap(x){return v211ActorCapabilities(x);}
function expectFalseAll(c,keys){for(const k of keys)assert.equal(c.capabilities[k],false,k+' should be false');}

let cases=0;

// Manager lifecycle matrix.
for(const status of statuses){
  const c=cap({actorRole:'Manager',actorEmail:'m@example.com',status});
  assert.equal(c.visible,true); cases++;
  assert.equal(c.capabilities.canPlan,status==='Pending Planning'); cases++;
  assert.equal(c.capabilities.canApprove,status==='Pending Approval'); cases++;
  assert.equal(c.capabilities.canAcceptOnBehalf,status==='Approved'); cases++;
  assert.equal(c.capabilities.canComplete,status==='Accepted'); cases++;
  assert.equal(c.capabilities.canCancel,['Pending Approval','Approved','Accepted'].includes(status)); cases++;
  assert.equal(c.capabilities.canExport,true); cases++;
}

// Auditor must never see or act on another auditor's assignment.
for(const status of statuses){
  const c=cap({actorRole:'Auditor',actorEmail:A,status,assignedToEmail:B,preassignedToEmail:B,allowSelfPlanning:true,hardEligible:true});
  assert.equal(c.visible,false); cases++;
  expectFalseAll(c,['canPlan','canApprove','canAccept','canAcceptOnBehalf','canCancel','canReAdjust','canComplete','canChangePreassignment','canChangeSelfPlanning','canExport']); cases+=10;
}

// Own preassignment: visible only while Pending Planning. Plan additionally requires Self planning = Yes + hard eligibility.
for(const allowSelfPlanning of [false,true]){
  for(const hardEligible of [false,true]){
    for(const status of statuses){
      const c=cap({actorRole:'Auditor',actorEmail:A,status,preassignedToEmail:A,allowSelfPlanning,hardEligible});
      assert.equal(c.visible,status==='Pending Planning'); cases++;
      assert.equal(c.capabilities.canPlan,status==='Pending Planning'&&allowSelfPlanning&&hardEligible); cases++;
      assert.equal(c.preassignmentConflict,status==='Pending Planning'&&allowSelfPlanning&&!hardEligible); cases++;
    }
  }
}

// Own assigned lifecycle.
for(const status of statuses){
  const c=cap({actorRole:'Auditor',actorEmail:A,status,assignedToEmail:A,allowSelfPlanning:true,hardEligible:true});
  assert.equal(c.visible,true); cases++;
  assert.equal(c.capabilities.canAccept,status==='Approved'); cases++;
  assert.equal(c.capabilities.canCancel,status==='Pending Approval'); cases++;
  assert.equal(c.capabilities.canComplete,status==='Accepted'); cases++;
}

// Self-planning pool only when no assignment and hard eligible.
for(const hardEligible of [false,true]){
  const c=cap({actorRole:'Auditor',actorEmail:A,status:'Pending Planning',allowSelfPlanning:true,hardEligible});
  assert.equal(c.visible,hardEligible); cases++;
  assert.equal(c.selfPlanningPool,hardEligible); cases++;
  assert.equal(c.capabilities.canPlan,hardEligible); cases++;
}

// Unknown role fails closed.
for(const role of ['', 'Viewer', 'Admin', 'managerx', 'AUDITORX']){
  const c=cap({actorRole:role,actorEmail:A,status:'Pending Planning',preassignedToEmail:A,hardEligible:true});
  assert.equal(c.visible,false); cases++;
  expectFalseAll(c,['canPlan','canApprove','canAccept','canAcceptOnBehalf','canCancel','canReAdjust','canComplete','canChangePreassignment','canChangeSelfPlanning','canExport']); cases+=10;
}

// Server-side route separation / anti-horizontal-escalation invariants.
const routeChecks=[
  "if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'})",
  "role==='auditor'?await auditorOpenRead(clean(s.email).toLowerCase()):await managerOpenRead(clean(s.email).toLowerCase())",
  "role==='auditor'?await auditorArchivedRead(clean(s.email).toLowerCase()):await managerArchivedRead(clean(s.email).toLowerCase())",
  "if(actorRole==='AUDITOR'&&auditorEmail!==actorEmail)throw new Error('AUDITOR_CANNOT_PLAN_FOR_OTHER_AUDITOR')",
  "if(clean(sess.role).toLowerCase()==='auditor'&&auditorEmail!==clean(sess.email).toLowerCase())return send(res,403,{ok:false,error:'AUDITOR_CANNOT_CHECK_OTHER_AUDITOR'})",
  "if(!actor.visible)throw new Error('AUDITOR_AUDIT_ACCESS_FORBIDDEN')",
  "if(statusKey==='PENDING_PLANNING'&&!actor.capabilities.canPlan)throw new Error('AUDITOR_PLANNING_NOT_ELIGIBLE'"
];
for(const needle of routeChecks){assert.ok(r4.includes(needle),needle);cases++;}

// Shared UI must hide Manager-only controls for Auditor and refresh cross-actor changes.
const uiChecks=[
  'if(String(actorRole).toLowerCase()==="auditor")raw=raw.filter(function(x){return x==="PLAN"})',
  'if(batch)batch.style.display=isAud?"none":batch.style.display',
  'if(concept)concept.style.display=isAud?"none":concept.style.display',
  'if(workspace)workspace.style.display=isAud?"none":""',
  'window.addEventListener("focus",function(){passiveRefreshOpen()})',
  'document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")passiveRefreshOpen()})'
];
for(const needle of uiChecks){assert.ok(ui.includes(needle),needle);cases++;}

console.log(JSON.stringify({ok:true,build:'2026-10-04_MANAGER_AUDITOR_PORTAL_SEPARATION_STRESS_R2',tests:cases,writesPerformed:false}));
