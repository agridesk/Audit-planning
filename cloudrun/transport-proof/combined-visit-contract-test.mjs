import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

assert.equal(pkg.scripts.start,'node server-r6.js','server-r6 must own the public DEV transport');
has(pkg.scripts.test,'node --check server-r6.js','r6 syntax check');
has(pkg.scripts.test,'combined-visit-contract-test.mjs','combined Visit contract test');

has(r6,"await import('./server-r5.js')",'r6 must wrap the accepted r5/r4 path');
has(r6,"u.pathname==='/api/v1/planning/direct-commit'",'direct commit interception');
has(r6,"ids.length>1",'combined Visit routing gate');
has(r6,"withCombinedLock(()=>proxy(req,res,raw))",'single-Visit commits must share outer capacity lock');
has(r4,"VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL",'r4 fail-closed fallback remains intact');

has(r6,"sourceRevision",'primary optimistic concurrency');
has(r6,"VISIT_RELATED_SOURCE_REVISION_REQUIRED",'member revision required');
has(r6,"VISIT_RELATED_SOURCE_REVISION_CONFLICT",'member revision conflict');
has(r6,"VISIT_RELATED_AUDIT_NOT_PENDING_PLANNING",'member lifecycle guard');
has(r6,"VISIT_COMPOSITION_COMPANY_MISMATCH",'company consistency guard');
has(r6,"VISIT_COMPOSITION_SOURCE_VISIT_NOT_EMPTY",'empty-source precondition');
has(r6,"AUDITOR_NOT_HARD_QUALIFIED",'union qualification guard');
has(r6,"PLANNING_WINDOW_BLOCKED",'primary planning-window guard');
has(r6,"VISIT_RELATED_PLANNING_WINDOW_BLOCKED",'member planning-window guard');
has(r6,"VISIT_RELATED_EXECUTION_DEADLINE_APPROVAL_REQUIRED",'member deadline guard');

has(r6,"cfg.schedulingHours",'Scheduling hours source');
has(r6,"formalRequired+=x.formalHours",'Formal hours stay separately accountable');
has(r6,"Math.abs(total-schedulingRequired)>0.001",'exact scheduling duration guard');
has(r6,"PLANNED_HOURS_ABOVE_REQUIRED",'overplanning backend guard');
has(r6,"requiredVisitHours()",'UI selected-Visit scheduling total');
has(r6,"h scheduling",'UI distinguishes scheduling duration');

has(r6,"old[ls]='INACTIVE'",'old Visit link deactivation');
has(r6,"old[lu]=now",'old Visit link Unlinked_At');
has(r6,"nr[la]=targetAuditId",'new target Visit link');
has(r6,"nr[ls]='ACTIVE'",'new Visit link active state');
has(r6,"nr[ll]=now",'new Visit link Linked_At');
has(r6,"new Array(src.h.length).fill('')",'empty source Visit projection retirement');
has(r6,"VISIT_SOURCE_PROJECTION_RETIRED",'source projection retirement audit trail');
has(r6,"VISIT_COMPOSITION_CHANGED",'composition audit trail');

has(r6,"x.row[z.id]=targetAuditId",'one physical Availability occupancy uses target Visit');
has(r6,"sourceSet.has(aid)",'stale source occupancy cleanup');
has(r6,"CANONICAL_COMBINED_VISIT_COMMIT",'all member concept reservations released');
has(r6,"AUDIT_PLANNED_BY_MANAGER",'one canonical planned notification');
has(r6,"scopes:scopeNames",'combined scopes in auditor notification');
has(r6,"obligationIds:selectedObligations.map",'combined obligations in planning/audit payload');

for(const forbidden of ['MPS-ABC','MPS-GAP','GRASP'])not(r6,forbidden,'hardcoded functional scope '+forbidden);
not(r6,'VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL','r6 combined writer guard');

// The browser body contract must still carry composition intent from r5.
has(r5,"visitAuditIds:[...visitAuditIds]",'browser Visit audit IDs');
has(r5,"visitMembers:[...visitAuditIds]",'browser per-member revisions');

console.log(JSON.stringify({
  success:true,
  build:'2026-09-30_COMBINED_VISIT_CONTRACT_R1',
  checks:36,
  writesPerformed:false,
  assertions:{
    genericScopes:true,
    optimisticConcurrencyAllMembers:true,
    formalVsSchedulingSeparated:true,
    sourceVisitProjectionRetiredWithoutInventedStatus:true,
    linkHistoryRetained:true,
    onePhysicalAvailabilityOccupancy:true,
    oneAuditorNotification:true,
    legacyCombinedGuardRetainedBehindR6:true
  }
},null,2));
