import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const relayOwner=fs.readFileSync(new URL('../../zz_ExternalManagerActionRelay.js',import.meta.url),'utf8');
const relayHtml=fs.readFileSync(new URL('../../ManagerActionRelay.html',import.meta.url),'utf8');
const checks=[
['signed relay endpoint used',manager.includes("fetch('/api/v1/manager/action-relay-url'")],
['warm iframe preloaded',manager.includes('function initRelay()')&&manager.includes("document.createElement('iframe')")&&manager.includes('initRelay().catch(function(){})')],
['google script relay messaging used',manager.includes("m.type==='AMS_MANAGER_ACTION_RELAY_READY'")&&manager.includes("m.type!=='AMS_MANAGER_ACTION_RESULT'")&&manager.includes('contentWindow.postMessage')],
['no direct action fallback from browser',!manager.includes("fetch('/api/v1/manager/action',{method:'POST'")],
['targeted canonical reread after action',manager.includes('rereadAudit(auditId,row&&row.sourceRow)')],
['micro patch',manager.includes('patchRowInPlace(auditId,patch,perf)')],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['comment sent',manager.includes('options={reason:reason,comment:reason}')],
['canonical EntryV5 owns relay route',entry.includes("rawAction === 'externalmanageractionrelay'")&&entry.includes('ExternalManagerActionRelay_render_(relayVerified)')],
['relay helper does not override doGet',!relayOwner.includes('doGet = function')&&!relayOwner.includes('doGet=function')],
['relay html uses google.script.run',relayHtml.includes('google.script.run')&&relayHtml.includes('.managerV5Action(auditId, action, options)')],
['server signed relay endpoint',r10.includes("u.pathname==='/api/v1/manager/action-relay-url'")],
['server signs relay assertion',r10.includes("createHmac('sha256'")&&r10.includes('MANAGER_ACTION_RELAY')],
['bridge secret remains server side',r10.includes('WRITE_KEY')&&!manager.includes('WRITE_KEY')],
['warm relay timing visible',manager.includes('warm-google-script-run')],
['r10 audit reread retained',r10.includes("u.pathname==='/api/v1/manager/audit'")],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
