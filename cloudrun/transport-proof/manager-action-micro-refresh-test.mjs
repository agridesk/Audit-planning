import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const checks=[
['direct manager action endpoint used',manager.includes("fetch('/api/v1/manager/action'")],
['micro patch',manager.includes('patchRowInPlace(auditId,x.patch,perf)')],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['comment sent',manager.includes('options={reason:reason,comment:reason}')],
['no iframe relay',!manager.includes('action-relay-url')&&!manager.includes('iframe')&&!manager.includes('postMessage')],
['timing exposes GAS HTTP',manager.includes('GAS HTTP')&&manager.includes('direct-gas-action')],
['ambiguous GAS response is verified canonically',manager.includes('function recoverCanonicalAction')&&manager.includes("patch.statusKey!==expectedStatus(action)")&&manager.includes('perf.canonicalRecovery=true')],
['recovery never repeats write',manager.includes('return recoverCanonicalAction')&&!manager.includes('retryCanonicalAction')],
['server direct endpoint',r10.includes("u.pathname==='/api/v1/manager/action'")],
['server calls external manager action',r10.includes("callGasBridge(identity,'externalmanageraction'")],
['server injects bridge key only server side',r10.includes("Object.assign({bridgeKey:WRITE_KEY,actorEmail}")&&!manager.includes('WRITE_KEY')],
['server canonical reread after write',r10.includes('const patch=await readAuditPatch(clean(body.auditId),body.sourceRow)')],
['server returns timing',r10.includes('gasHttpMs')&&r10.includes('rereadMs')],
['r10 audit reread retained',r10.includes("u.pathname==='/api/v1/manager/audit'")],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
