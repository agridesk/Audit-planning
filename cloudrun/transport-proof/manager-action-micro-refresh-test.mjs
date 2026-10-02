import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const relayOwner=fs.readFileSync(new URL('../../zz_ExternalManagerActionRelay.js',import.meta.url),'utf8');
const relayHtml=fs.readFileSync(new URL('../../ManagerActionRelay.html',import.meta.url),'utf8');
const checks=[
['signed relay endpoint used',manager.includes("fetch('/api/v1/manager/action-relay-url'")],
['relay request is POST and action-bound',manager.includes("method:'POST'")&&r10.includes("u.searchParams.set('auditId',auditId)")&&r10.includes("u.searchParams.set('managerAction',managerAction)")],
['hidden iframe fires GAS relay',manager.includes("document.createElement('iframe')")&&manager.includes('startActionRelay(auditId,action,options)')],
['canonical polling confirms cancel/approve',manager.includes('function pollActionCanonical')&&manager.includes("x.statusKey===expected")],
['reject confirmed by canonical disappearance',manager.includes("action==='reject'&&r.status===404")&&manager.includes("x.error==='AUDIT_NOT_FOUND'")],
['no READY handshake',!manager.includes('ACTION_RELAY_READY_TIMEOUT')&&!manager.includes('AMS_MANAGER_ACTION_RELAY_READY')],
['no cross-frame postMessage',!manager.includes('contentWindow.postMessage')],
['no direct action fallback from browser',!manager.includes("fetch('/api/v1/manager/action',{method:'POST'")],
['micro patch',manager.includes('patchRowInPlace(auditId,patch,perf)')],
['reject removes same row',manager.includes('removeRejectedRowInPlace(auditId,perf)')],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['comment sent',manager.includes('options={reason:reason,comment:reason}')],
['canonical EntryV5 owns relay route',entry.includes("rawAction === 'externalmanageractionrelay'")&&entry.includes('ExternalManagerActionRelay_render_(relayVerified)')],
['relay helper does not override doGet',!relayOwner.includes('doGet = function')&&!relayOwner.includes('doGet=function')],
['relay signature binds action data',relayOwner.includes("'MANAGER_ACTION_RELAY_EXECUTE'")&&relayOwner.includes('auditId, managerAction, reason')],
['relay html self-executes google.script.run',relayHtml.includes('google.script.run')&&relayHtml.includes('.managerV5Action(auditId,action,options)')],
['server signs relay assertion',r10.includes("createHmac('sha256'")&&r10.includes('MANAGER_ACTION_RELAY_EXECUTE')],
['bridge secret remains server side',r10.includes('WRITE_KEY')&&!manager.includes('WRITE_KEY')],
['fire-confirm timing visible',manager.includes('signed-gas-fire-and-confirm')],
['r10 audit reread retained',r10.includes("u.pathname==='/api/v1/manager/audit'")],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
