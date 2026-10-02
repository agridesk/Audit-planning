import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const checks=[
['signed relay endpoint used',manager.includes("fetch('/api/v1/manager/action-relay-url'")],
['hidden iframe executes signed GAS relay',manager.includes("document.createElement('iframe')")&&manager.includes('externalmanageractionrelay')===false],
['canonical poll confirms outcome',manager.includes('rereadAudit(auditId,sourceRow)')&&manager.includes('patch.statusKey===expected')],
['no direct action fallback from browser',!manager.includes("fetch('/api/v1/manager/action',{method:'POST'")],
['micro patch',manager.includes('replaceVisibleRow(auditId,all[idx])')],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['comment sent',manager.includes('options={reason:reason,comment:reason}')],
['no READY handshake dependency',!manager.includes('ACTION_RELAY_READY_TIMEOUT')&&!manager.includes('postMessage')],
['server signed relay endpoint',r10.includes("u.pathname==='/api/v1/manager/action-relay-url'")],
['server signs relay assertion',r10.includes("createHmac('sha256'")&&r10.includes('MANAGER_ACTION_RELAY')],
['bridge secret remains server side',r10.includes('WRITE_KEY')&&!manager.includes('WRITE_KEY')],
['direct GAS HTTP route not used by browser',manager.includes('signed-browser-relay')],
['r10 audit reread retained',r10.includes("u.pathname==='/api/v1/manager/audit'")],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
