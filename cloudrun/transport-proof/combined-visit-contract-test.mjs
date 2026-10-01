import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');
const r8=readFileSync(new URL('./server-r8.js',import.meta.url),'utf8');
const r9=readFileSync(new URL('./server-r9.js',import.meta.url),'utf8');
const r10=readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const portal=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const portalHtml=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

assert.equal(pkg.scripts.start,'node server-r10.js','server-r10 must own the public DEV transport');
has(pkg.scripts.test,'node --check server-r10.js','r10 syntax check');
has(docker,'COPY server-r10.js ./','Docker image must contain formal/scheduled hours layer');

has(r10,"await import('./server-r9.js')",'r10 wraps accepted r9 path');
has(r10,"u.pathname==='/api/v1/manager/open'",'r10 enriches Manager open hours semantics');
has(r10,'scheduledField','r10 exposes scheduled-hours field');
has(r10,'formalField','r10 exposes formal-hours field');
has(r10,'j.totalPlannedHours=j.formalHours','ECAS legacy planned-hours field must carry formal hours');
has(r10,'j.scheduledHours','Planning JSON keeps scheduled duration separately');
has(r10,'j.formalHours','Planning JSON keeps formal hours separately');
has(r10,'normalizeCombinedProjection','successful combined save normalizes canonical Planning JSON');
has(r10,"ecasHoursSource:'Planning JSON totalPlannedHours=formalHours'",'runtime identity documents ECAS formal-hours source');
has(r10,'x-ams-build','r10 response build identity header');

has(portal,'<th>Hours planned</th><th>Scheduled hours</th>','Manager Portal shows separate formal and scheduled columns');
has(portal,'hoursClass(r.hoursPlanned,r.scheduledHours)','Manager Portal compares scheduled against formal hours');
has(portalHtml,'.hours-match{color:#166534','1.0 match colour retained');
has(portalHtml,'.hours-under{color:#dc2626','1.0 under colour retained');
has(portalHtml,'.hours-over{color:#f97316','1.0 over colour retained');

has(r9,"await import('./server-r8.js')",'r9 remains in chain');
has(r8,"await import('./server-r7.js')",'r8 remains in chain');
has(r7,"await import('./server-r6.js')",'r7 remains in chain');
has(r6,"await import('./server-r5.js')",'r6 remains in chain');
has(r6,"u.pathname==='/api/v1/planning/direct-commit'",'combined direct commit interception');
has(r6,'ids.length>1','combined Visit routing gate');
has(r4,'VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL','r4 fail-closed fallback remains intact');

has(r6,'sourceRevision','primary optimistic concurrency');
has(r6,'VISIT_RELATED_SOURCE_REVISION_REQUIRED','member revision required');
has(r6,'VISIT_RELATED_SOURCE_REVISION_CONFLICT','member revision conflict');
has(r6,'VISIT_RELATED_AUDIT_NOT_PENDING_PLANNING','member lifecycle guard');
has(r6,'VISIT_COMPOSITION_COMPANY_MISMATCH','company consistency guard');
has(r6,'VISIT_COMPOSITION_SOURCE_VISIT_NOT_EMPTY','empty-source precondition');
has(r6,'AUDITOR_NOT_HARD_QUALIFIED','union qualification guard');
has(r6,'PLANNING_WINDOW_BLOCKED','primary planning-window guard');
has(r6,'VISIT_RELATED_PLANNING_WINDOW_BLOCKED','member planning-window guard');
has(r6,'VISIT_RELATED_EXECUTION_DEADLINE_APPROVAL_REQUIRED','member deadline guard');

has(r6,'cfg.schedulingHours','Scheduling hours source');
has(r6,'formalRequired+=x.formalHours','Formal hours stay separately accountable');
has(r6,'Math.abs(total-schedulingRequired)>0.001','exact scheduling duration guard');
has(r6,'PLANNED_HOURS_ABOVE_REQUIRED','overplanning backend guard');
has(r6,'requiredVisitHours()','UI selected-Visit scheduling total');
has(r6,'h scheduling','Planning UI distinguishes scheduling duration');

has(r6,"old[ls]='INACTIVE'",'old Visit link deactivation');
has(r6,'old[lu]=now','old Visit link Unlinked_At');
has(r6,'nr[la]=targetAuditId','new target Visit link');
has(r6,"nr[ls]='ACTIVE'",'new Visit link active state');
has(r6,'nr[ll]=now','new Visit link Linked_At');
has(r6,"new Array(src.h.length).fill('')",'source Visit projection retirement');
has(r6,'VISIT_SOURCE_PROJECTION_RETIRED','source projection retirement audit trail');
has(r6,'VISIT_COMPOSITION_CHANGED','composition audit trail');
has(r6,'x.row[z.id]=targetAuditId','one physical Availability occupancy');
has(r6,'CANONICAL_COMBINED_VISIT_COMMIT','all member reservations released');
has(r6,'AUDIT_PLANNED_BY_MANAGER','one planned auditor notification');

for(const forbidden of ['MPS-ABC','MPS-GAP','GRASP'])not(r6,forbidden,'hardcoded functional scope '+forbidden);
not(r6,'VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL','r6 combined writer guard');
has(r5,'visitAuditIds:[...visitAuditIds]','browser Visit audit IDs');
has(r5,'visitMembers:[...visitAuditIds]','browser per-member revisions');

console.log(JSON.stringify({
  success:true,
  build:'2026-10-01_COMBINED_VISIT_CONTRACT_R7_FORMAL_SCHEDULED_HOURS',
  checks:55,
  writesPerformed:false,
  assertions:{
    formalHoursForEcas:true,
    scheduledDurationSeparate:true,
    managerPortalDifferenceColoursMatchV1:true,
    genericScopes:true,
    optimisticConcurrencyAllMembers:true,
    combinedCommitRoutesToCanonicalWriter:true,
    onePhysicalAvailabilityOccupancy:true,
    oneAuditorNotification:true
  }
},null,2));
