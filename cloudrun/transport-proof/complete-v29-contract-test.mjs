import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url));
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');

const server=read('./server-r10.js');
const baseServer=read('./server-r4.js');
const portal=read('./manager-portal.js');
const relay=read('../../ManagerActionRelay.html');
const manager=read('../../AuditManagerActions.js');
const completion=read('../../CompletionService.js');
const modelC=read('../../ModelCAnnualCycleRuntime.js');
const log=read('../../LogRealizedAuditService.js');
const auditor=read('../../AuditorV5Backend.js');
const auditorPortal=read('../../AuditorPortalV5.html');

assert.match(server,/k==='ACCEPTED'\?\['COMPLETE','CANCEL','REJECT'\]/,'Accepted Manager enrichment rows must expose Complete');
assert.match(baseServer,/statusKey==='ACCEPTED'\?\['COMPLETE','CANCEL','REJECT'\]/,'Accepted Manager base rows must expose Complete');
assert.match(portal,/raw\.indexOf\("COMPLETE"\)>=0/,'Manager UI must render Complete from canonical allowedActions');
assert.match(portal,/Number\(row\.hoursPlanned\)/,'Complete default must use primary Hours planned');
assert.doesNotMatch(portal,/scheduled "\+esc\(text\(r\.scheduledHours\)\)/,'Manager Grid must not render secondary scheduled x h line');
assert.match(portal,/quarterHourValue/,'Manager Complete must validate quarter-hour increments');
assert.match(portal,/runActionViaWarmWorker\(id,"edit_realized_hours"/,'Realized-hours correction must use canonical warm worker');
assert.match(relay,/approve\|cancel\|reject\|complete\|edit_realized_hours/,'Warm relay must allow Complete and realized-hours correction');
assert.match(manager,/complete:\s*'COMPLETE'/,'Manager adapter must delegate Complete to StatusMachine');
assert.match(manager,/CompletionService_OverrideCompletedHours/,'Manager correction must delegate to controlled realized-hours writer');
assert.match(completion,/Hours dedicated must be in steps of 0\.25/,'Canonical CompletionService must validate quarter-hour increments');
assert.match(completion,/COMPLETION_MANAGER_CONCURRENCY_OVERRIDE/,'Manager concurrency precedence must be audit-trailed');
assert.match(completion,/alreadyCompleted:true/,'Canonical CompletionService must reconcile idempotent retry after completion');
assert.doesNotMatch(completion,/v5_syncAuditArtifactsSafe_\(\{ fullRebuild:true \}\)/,'Complete hot path must not synchronously full-rebuild artifacts');
assert.match(modelC,/MODEL_C_FINALIZATION_FAILED/,'Model C completion finalization must fail closed instead of warning-only');
assert.doesNotMatch(modelC,/ModelCScopeOwner_snapshotSheet_\(ap\)/,'Complete successor hot path must not snapshot full Audit planning');
assert.doesNotMatch(modelC,/ModelCScopeOwner_writeObjects_\(obSheet/,'Complete successor hot path must not rewrite all obligations');
assert.doesNotMatch(modelC,/ModelCScopeOwner_writeObjects_\(lkSheet/,'Complete successor hot path must not rewrite all visit links');
assert.match(modelC,/ModelCAnnualCycle_appendObjects_/,'Complete successor hot path must batch-append only new Model C rows');
assert.match(modelC,/perf\.totalMs/,'Complete Model C hot path must expose timings');
assert.match(read('../../AuditPlanningModelCAnnualCyclePlan.js'),/def\.defaultHours/,'Recurring successor formal hours must fall back to Config_Scopes default hours');
assert.match(log,/oldHoursDedicated/,'Realized-hours correction must retain old value for audit trail');
assert.match(log,/newHoursDedicated/,'Realized-hours correction must retain new value for audit trail');
assert.match(auditor,/Missing authenticated auditor email/,'Auditor Complete actor must come from authenticated identity');
assert.doesNotMatch(auditor,/var relComplete = releaseAvailability_\(\{ pastOnly:true \}\)/,'Auditor Complete must not release Availability twice');
assert.match(auditorPortal,/ph\.toFixed\(2\)/,'Auditor Complete dialog must format primary planned hours to two decimals');
assert.match(auditorPortal,/tr\.remove\(\)/,'Auditor Complete micro-refresh must remove only the completed row');
assert.doesNotMatch(auditorPortal,/CURRENT_ROWS\.splice\(idx, 1\);\s*renderGrid\(CURRENT_ROWS/,'Auditor Complete must not rerender the full active grid');

console.log('Complete V2.9 contract test passed');
