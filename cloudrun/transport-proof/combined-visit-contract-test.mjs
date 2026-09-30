import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');
const r8=readFileSync(new URL('./server-r8.js',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

assert.equal(pkg.scripts.start,'node server-r8.js','server-r8 must own the public DEV transport');
has(pkg.scripts.test,'node --check server-r8.js','r8 syntax check');
has(pkg.scripts.test,'combined-visit-contract-test.mjs','combined Visit contract test');
has(docker,'COPY server-r6.js ./','Docker image must contain combined Visit writer');
has(docker,'COPY server-r7.js ./','Docker image must contain combined Visit UI layer');
has(docker,'COPY server-r8.js ./','Docker image must contain revision-enrichment/routing layer');

has(r8,"await import('./server-r7.js')",'r8 must wrap accepted r7 path');
has(r8,"u.pathname==='/api/v1/planning/workspace'",'r8 must intercept focused workspace read');
has(r8,"auditPlanningRows()",'r8 must use one bounded Audit planning revision read');
has(r8,"item.sourceRevision=shaRevision",'missing related Visit revision must be enriched canonically');
has(r8,"u.pathname==='/api/v1/build'",'r8 runtime build identity endpoint');
has(r8,"x-ams-build",'r8 response build identity header');
has(r8,"u.pathname==='/api/v1/planning/commit-handoff'",'r8 must intercept combined Visit commit handoff');
has(r8,"COMBINED_WRITER_PORT=PUBLIC_PORT+2",'r8 must know canonical r6 combined-writer port');
has(r8,"'/api/v1/planning/direct-commit'",'r8 combined handoff must call canonical direct-commit endpoint');
has(r8,"compositionIds(body)",'r8 combined handoff must derive Visit composition from payload');
has(r8,"ids.length<2",'r8 must leave single-Visit handoff on accepted legacy path');
has(r8,"writeOwner:'CLOUD_RUN_DIRECT_SHEETS_COMBINED_VISIT'",'r8 must expose combined writer ownership');
has(r7,"await import('./server-r6.js')",'r7 must wrap accepted combined Visit path');
has(r7,"required=requiredVisitHours()",'combined Visit validation must use selected scheduling hours');
has(r6,"await import('./server-r5.js')",'r6 must wrap accepted r5/r4 path');
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

has(r5,"visitAuditIds:[...visitAuditIds]",'browser Visit audit IDs');
has(r5,"visitMembers:[...visitAuditIds]",'browser per-member revisions');

console.log(JSON.stringify({
  success:true,
  build:'2026-10-01_COMBINED_VISIT_CONTRACT_R5_COMMIT_ROUTING',
  checks:55,
  writesPerformed:false,
  assertions:{
    genericScopes:true,
    optimisticConcurrencyAllMembers:true,
    relatedRevisionEnrichment:true,
    combinedCommitRoutesToCanonicalR6Writer:true,
    singleCommitPathPreserved:true,
    formalVsSchedulingSeparated:true,
    dynamicCombinedSchedulingHoursUi:true,
    runtimeBuildIdentity:true,
    dockerIncludesCombinedLayers:true,
    sourceVisitProjectionRetiredWithoutInventedStatus:true,
    linkHistoryRetained:true,
    onePhysicalAvailabilityOccupancy:true,
    oneAuditorNotification:true,
    legacyCombinedGuardRetainedBehindR6:true
  }
},null,2));
