import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const checks=[
['direct endpoint used for cancel/reject',manager.includes("fetch('/api/v1/manager/action-direct'")&&r10.includes("u.pathname==='/api/v1/manager/action-direct'")],
['direct path is cancel/reject only',manager.includes('var direct=(action==="cancel"||action==="reject")')&&r10.includes("!['cancel','reject'].includes(action)")],
['comment required',r10.includes("if(!reason)throw new Error('ACTION_REASON_REQUIRED')")],
['cancel transition guarded',r10.includes("auditTransitionAllowed(statusKey,'cancel')")],
['reject transition guarded',r10.includes("auditTransitionAllowed(statusKey,'reject')")],
['cancel clears committed planning',r10.includes("['Hours planned','Planned hours','Hours Planned']")&&r10.includes("['Planning JSON','PlanningJSON','Planning']")],
['cancel preserves required hours',!r10.includes("set(['Total audit time in hours']")],
['cancel writes manager comment metadata',r10.includes("set(['Manager comment (last)'],reason)")&&r10.includes("set(['Last manager decision'],'CANCEL')")],
['availability released direct',r10.includes('async function releaseAvailabilityDirect')&&r10.includes('await releaseAvailabilityDirect(auditId)')],
['reject archives before source deletion',r10.indexOf("await appendRow('Rejected audits',newRow)")<r10.indexOf("await deleteSheetRows('Audit planning',[rowNo])")],
['reject idempotency guard',r10.includes('archiveAlreadyPresent:already')&&r10.includes('if(!already)')],
['reject verifies source disappearance',r10.includes("verify.error!=='AUDIT_NOT_FOUND'")],
['cancel returns targeted patch',r10.includes("return{success:true,action:'cancel',auditId,patch")],
['micro patch',manager.includes('patchRowInPlace(auditId,patch,perf)')],
['reject removes same row',manager.includes('removeRejectedRowInPlace(auditId,perf)')],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['direct timing visible',manager.includes('direct-sheets-api')],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
