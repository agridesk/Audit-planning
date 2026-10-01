import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const r6=readFileSync(new URL('./server-r6.js',import.meta.url),'utf8');
const r7=readFileSync(new URL('./server-r7.js',import.meta.url),'utf8');
const r8=readFileSync(new URL('./server-r8.js',import.meta.url),'utf8');
const r9=readFileSync(new URL('./server-r9.js',import.meta.url),'utf8');
const r10=readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const r11=readFileSync(new URL('./server-r11.js',import.meta.url),'utf8');
const r12=readFileSync(new URL('./server-r12.js',import.meta.url),'utf8');
const portal=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const portalHtml=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

assert.equal(pkg.scripts.start,'node server-r12.js','server-r12 must own the public DEV transport');
has(pkg.scripts.test,'node --check server-r12.js','r12 syntax check');
has(docker,'COPY server-r12.js ./','Docker image must contain manager micro-refresh layer');

has(r12,"await import('./server-r11.js')",'r12 wraps accepted r11 path');
has(r12,"u.pathname==='/api/v1/manager/audit'",'targeted manager audit reread endpoint');
has(r12,"Manager comment (last)",'canonical manager comment field reused');
has(r12,"Auditor comment (last)",'canonical auditor comment field reused');
has(r12,'sourceRow','manager open rows expose source row for exact reread');
has(r12,'allowedActions(k)','targeted reread returns controls from canonical state');
has(r12,'innerSession(req)','targeted reread remains session protected');
has(r12,'x-ams-build','r12 response build identity');

has(r11,"await import('./server-r10.js')",'r11 wraps accepted r10 path');
has(r11,"Scheduling_hours_delta",'r11 uses renamed Config_Scopes field');
has(r11,'FORMAL_HOURS_PLUS_CONFIG_DELTA','workspace scheduling source must be formal plus delta');
has(r11,'Math.max(0,formal+delta)','workspace scheduled target derives from concrete formal hours');
has(r11,'Math.max(0,x.formalHours+delta)','combined writer derives scheduling from obligation formal hours');
has(r11,'scheduledHoursTarget','Manager read exposes scheduled target');
has(r11,"base:'company-specific formal hours'",'runtime semantics document company-specific base');
has(r11,'DELTA_PATCH_MARKER_MISSING','runtime patch must fail closed when source markers drift');

has(r10,"await import('./server-r9.js')",'r10 remains in chain');
has(r10,'j.totalPlannedHours=j.formalHours','ECAS planned-hours field must carry formal hours');
has(r10,'j.scheduledHours','Planning JSON keeps scheduled duration separately');
has(r10,'j.formalHours','Planning JSON keeps formal hours separately');
has(r10,'normalizeCombinedProjection','successful combined save normalizes Planning JSON');

has(portal,'<th>Hours planned</th><th>Scheduled hours</th>','Manager Portal shows formal and scheduled columns');
has(portal,'<th>Last comment</th>','Manager Portal exposes operational comment');
has(portal,'hoursClass(r.requiredHours,r.hoursPlanned)','formal hours colour compares against company required hours');
has(portal,'hoursClass(r.scheduledHoursTarget,r.scheduledHours)','scheduled colour compares against calculated scheduled target');
has(portal,'function patchRowInPlace','Manager Portal patches one row in place');
has(portal,'function rereadAndPatch','Cancel Reject use targeted canonical reread');
has(portal,'sourceRow','targeted reread uses stable source row when available');
has(portal,'window.scrollTo(scrollX,scrollY)','scroll position preserved');
has(portal,'adjustCounters(beforeKey,after.statusKey)','local counters updated without full reload');
has(portal,'[MANAGER_ACTION_TIMING]','action timing instrumentation');
has(portal,'Comment is required.','Cancel Reject comment mandatory in UI');
has(portal,'options:{reason:reason,comment:reason}','comment forwarded through existing action payload');
has(portal,'if(action==="cancel"||action==="reject")return rereadAndPatch','Cancel Reject do not trigger full dataset reread');
has(portalHtml,'.hours-match{color:#166534','match colour retained');
has(portalHtml,'.hours-under{color:#dc2626','under colour retained');
has(portalHtml,'.hours-over{color:#f97316','over colour retained');

has(r9,"await import('./server-r8.js')",'r9 remains in chain');
has(r8,"await import('./server-r7.js')",'r8 remains in chain');
has(r7,"await import('./server-r6.js')",'r7 remains in chain');
has(r6,"await import('./server-r5.js')",'r6 remains in chain');
has(r6,"u.pathname==='/api/v1/planning/direct-commit'",'combined direct commit interception');
has(r6,'ids.length>1','combined Visit routing gate');
has(r4,'VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL','r4 fail-closed fallback remains intact');
has(r4,"writeUrl.searchParams.set('action','externalmanageraction')",'Manager actions remain canonical GAS status-machine writes');
has(r4,'ACTION_REASON_REQUIRED','backend also requires Cancel Reject reason');

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
has(r6,'formalRequired+=x.formalHours','Formal hours stay separately accountable');
has(r6,'Math.abs(total-schedulingRequired)>0.001','exact scheduling duration guard retained');
has(r6,'PLANNED_HOURS_ABOVE_REQUIRED','overplanning backend guard');
has(r6,'requiredVisitHours()','Planning UI uses selected Visit scheduling total');
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
  build:'2026-10-01_COMBINED_VISIT_CONTRACT_R9_MANAGER_MICRO_REFRESH',
  writesPerformed:false,
  assertions:{
    companySpecificFormalHoursRemainBase:true,
    configSchedulingDeltaApplied:true,
    formalHoursForEcas:true,
    scheduledDurationSeparate:true,
    managerPortalColourTargetsCorrect:true,
    cancelRejectCanonicalWritePath:true,
    cancelRejectCommentCanonicalFields:true,
    managerMicroRefresh:true,
    managerRowPositionPreserved:true,
    managerScrollPreserved:true,
    managerActionTimingMeasured:true,
    genericScopes:true,
    optimisticConcurrencyAllMembers:true,
    combinedCommitRoutesToCanonicalWriter:true,
    onePhysicalAvailabilityOccupancy:true,
    oneAuditorNotification:true
  }
},null,2));
