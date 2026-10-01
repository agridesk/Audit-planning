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
const relay=readFileSync(new URL('../../ManagerActionRelay.html',import.meta.url),'utf8');
const relayServer=readFileSync(new URL('../../zz_ExternalManagerActionRelay.js',import.meta.url),'utf8');
const resetHours=readFileSync(new URL('../../zzzz_StatusResetPlanningHours.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));

function has(text,needle,label){assert.ok(text.includes(needle),label+' missing');}
function not(text,needle,label){assert.ok(!text.includes(needle),label+' unexpectedly present');}

assert.equal(pkg.scripts.start,'node server-r10.js','R10 must own public DEV runtime during proxy-chain recovery');
has(r10,"u.pathname==='/api/v1/manager/action-relay-url'",'signed Manager relay URL');
has(r10,"u.pathname==='/api/v1/manager/audit'",'targeted Manager reread');
has(r10,"sheetValues('Audit planning!A1:AX1')",'targeted reread header read');
has(r10,"sheetValues('Audit planning!A'+rowNo+':AX'+rowNo)",'targeted reread exact-row read');
has(r10,"if(k==='PENDING_PLANNING'){planningJson='';scheduled=null;formal=null;assigned='';}",'Pending Planning clears committed hours in projection');
has(portal,'runActionViaRelay','Manager 2.0 direct relay path');
has(portal,'direct-1.0-path','timing identifies 1.0-equivalent action transport');
not(portal,'runActionViaBridge','slow HTTP bridge fallback forbidden');
not(portal,'bridge-fallback','silent slow fallback forbidden');
has(portal,'},20000)','relay bootstrap tolerates Apps Script cold start');
has(portal,'relay.initPromise=null;throw e','failed relay bootstrap can be retried');
has(relay,'<?!= JSON.stringify(__parentOrigin) ?>','relay parent origin injected as raw JS literal');
has(relay,'.managerV5Action(auditId, action, options)','relay calls canonical 1.0 action adapter');
has(relay,'attempts < 50','relay waits briefly for google.script.run bootstrap');
has(relayServer,'ExternalManagerActionRelay_errorHtml_','signed relay failures render observable error page');
has(relayServer,"type:'AMS_MANAGER_ACTION_RELAY_READY'",'relay verification failure posts explicit READY failure');
has(resetHours,"['Hours planned', 'Planned hours', 'Hours Planned']",'Cancel reopen clears Hours planned canonically');
has(resetHours,'Total audit time in hours','formal required hours explicitly preserved');

has(r11,"Scheduling_hours_delta",'scheduling delta hardening retained');
has(r11,'FORMAL_HOURS_PLUS_CONFIG_DELTA','formal plus delta semantics retained');
has(r10,'j.totalPlannedHours=j.formalHours','formal Hours planned projection retained');
has(r10,'j.scheduledHours','physical scheduled duration retained separately');

has(r6,"u.pathname==='/api/v1/planning/direct-commit'",'combined Visit direct commit interception');
has(r6,'ids.length>1','combined Visit routing gate');
has(r6,'sourceRevision','optimistic concurrency');
has(r6,'VISIT_RELATED_SOURCE_REVISION_REQUIRED','related member revision required');
has(r6,'VISIT_RELATED_SOURCE_REVISION_CONFLICT','related member revision conflict');
has(r6,'VISIT_RELATED_AUDIT_NOT_PENDING_PLANNING','related lifecycle guard');
has(r6,'VISIT_COMPOSITION_COMPANY_MISMATCH','company consistency guard');
has(r6,'AUDITOR_NOT_HARD_QUALIFIED','qualification guard');
has(r6,'VISIT_RELATED_PLANNING_WINDOW_BLOCKED','related planning window guard');
has(r6,'formalRequired+=x.formalHours','formal hours remain separately accountable');
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
  build:'2026-10-01_COMBINED_VISIT_CONTRACT_R10_MANAGER_RELAY_R5_OBSERVABLE',
  writesPerformed:false,
  assertions:{
    publicRuntimeR10:true,
    managerActionUsesDirectGasRelay:true,
    relayColdStartRecovery:true,
    relayFailureObservable:true,
    slowBridgeFallbackForbidden:true,
    cancelClearsFormalCommittedHours:true,
    pendingPlanningClearsScheduledHours:true,
    targetedManagerReread:true,
    schedulingDeltaSemanticsRetainedNonPublic:true,
    combinedVisitGuardsRetained:true
  }
},null,2));
