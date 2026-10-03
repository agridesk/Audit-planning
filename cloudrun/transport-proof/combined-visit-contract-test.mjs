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
const resetHours=readFileSync(new URL('../../zzzz_StatusResetPlanningHours.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

assert.equal(pkg.scripts.start,'node server-r10.js','R10 must own public DEV runtime during proxy-chain recovery');
has(r10,"u.pathname==='/api/v1/manager/action-relay-url'",'warm Manager GAS worker bootstrap endpoint');
has(r10,"u.pathname==='/api/v1/manager/audit'",'targeted Manager reread');
has(r10,"sheetValues('Audit planning!A1:AX1')",'targeted reread header read');
has(r10,"sheetValues('Audit planning!A'+rowNo+':AX'+rowNo)",'targeted reread exact-row read');
has(r10,"if(k==='PENDING_PLANNING'){planningJson='';formal=null;assigned='';display='';}",'Pending Planning clears committed formal hours in projection');
has(portal,"fetch('/api/v1/manager/action-relay-url'",'Manager 2.0 warm GAS worker bootstrap');
has(portal,' · trace ','timing identifies instrumented warm GAS transport');
has(portal,'patchActionLikeV1(auditId,action,reason,wr,perf)','Manager 1.0-style local action patch');
not(portal,'pollActionCanonical','no synchronous canonical reread/poll after action');
not(r10,"u.pathname==='/api/v1/manager/action-direct'",'direct Sheets action path removed');
has(resetHours,"['Hours planned', 'Planned hours', 'Hours Planned']",'Cancel reopen clears Hours planned canonically');
has(resetHours,'Total audit time in hours','formal required hours explicitly preserved');
has(resetHours,'getRangeList(a1).clearContent()','Cancel reset uses one batched clear');

not(r11,'Scheduling_hours_delta','R11 does not reinterpret scheduling delta');
not(r11,'FORMAL_HOURS_PLUS_CONFIG_DELTA','R11 contains no delta-based planning semantics');
not(r10,'j.totalPlannedHours=j.formalHours','R10 no longer rewrites combined Planning JSON hours');
not(r10,'j.scheduledHours','R10 does not reintroduce scheduledHours');

has(r6,"u.pathname==='/api/v1/planning/direct-commit'",'combined Visit direct commit interception');
has(r6,'ids.length>1','combined Visit routing gate');
has(r6,'sourceRevision','optimistic concurrency');
has(r6,'VISIT_RELATED_SOURCE_REVISION_REQUIRED','related member revision required');
has(r6,'VISIT_RELATED_SOURCE_REVISION_CONFLICT','related member revision conflict');
has(r6,'VISIT_RELATED_AUDIT_NOT_PENDING_PLANNING','related lifecycle guard');
has(r6,'VISIT_COMPOSITION_COMPANY_MISMATCH','company consistency guard');
has(r6,'AUDITOR_NOT_HARD_QUALIFIED','qualification guard');
has(r6,'VISIT_RELATED_PLANNING_WINDOW_BLOCKED','related planning window guard');
has(r6,'formalRequired+=Number(a?.formalHours||0)','combined target sums formal hours');
not(r6,'Scheduling_hours_delta','combined visit no longer reads scheduling delta');
has(r6,'Max_Offsite_Hours','combined visit reads max off-site policy schema');
has(r6,'OFFSITE_MULTI_SCOPE_ALLOCATION_REQUIRED','combined visit fails closed for off-site until obligation allocation is explicit');
has(r6,"setTarget(['Hours planned','Planned hours','Hours Planned'],Math.round(formalRequired*100)/100)",'combined visit persists Hours planned from formal hours');
has(r6,'x.row[z.id]=targetAuditId','one physical Availability occupancy');
has(r6,'AUDIT_PLANNED_BY_MANAGER','one planned-auditor notification path retained');

has(r5,'visitAuditIds:[...visitAuditIds]','browser sends Visit audit IDs');
has(r5,'visitMembers:[...visitAuditIds]','browser sends related revisions');
has(r7,"await import('./server-r6.js')",'R7 chain');
has(r8,"await import('./server-r7.js')",'R8 chain');
has(r9,"await import('./server-r8.js')",'R9 chain');
has(r10,"await import('./server-r9.js')",'R10 public chain ends at R9');
has(r11,"await import('./server-r10.js')",'R11 retained as non-public candidate');
has(r12,"await import('./server-r11.js')",'R12 retained as non-public candidate');
has(r4,'VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL','lower-layer fail-closed combined guard retained');

console.log(JSON.stringify({
  success:true,
  build:'2026-10-03_COMBINED_VISIT_CONTRACT_R11_OFFSITE_POLICY',
  writesPerformed:false,
  assertions:{
    publicRuntimeR10:true,
    managerActionsUseWarmGasWorker:true,
    managerActionMirrorsV1:true,
    synchronousActionRereadRemoved:true,
    cancelClearsFormalCommittedHours:true,
pendingPlanningClearsCommittedHours:true
    targetedManagerReread:true,
schedulingDeltaPlanningSemanticsRemoved:true
    combinedVisitGuardsRetained:true
  }
},null,2));
