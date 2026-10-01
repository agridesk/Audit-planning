import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const checks=[
['targeted reread',manager.includes('rereadAudit(auditId,sourceRow)')],
['micro patch',manager.includes('patchRowInPlace(auditId,x.patch,perf)')],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['signed relay endpoint',manager.includes('/api/v1/manager/action-relay-url')],
['no ready handshake',!manager.includes('ACTION_RELAY_READY_TIMEOUT')],
['canonical poll timeout',manager.includes('ACTION_RELAY_NO_CANONICAL_CHANGE')],
['cancel target',manager.includes('PENDING_PLANNING')],
['reject target',manager.includes('REJECTED')],
['no slow fallback',!manager.includes('runActionViaBridge')],
['r10 relay url',r10.includes("u.pathname==='/api/v1/manager/action-relay-url'")],
['r10 audit reread',r10.includes("u.pathname==='/api/v1/manager/audit'")],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
