import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const relayOwner=fs.readFileSync(new URL('../../zz_ExternalManagerActionRelay.js',import.meta.url),'utf8');
const relayHtml=fs.readFileSync(new URL('../../ManagerActionRelay.html',import.meta.url),'utf8');
const checks=[
['warm relay endpoint is GET',r10.includes("req.method==='GET'&&u.pathname==='/api/v1/manager/action-relay-url'")],
['server signs nonce bootstrap',r10.includes("'MANAGER_ACTION_WARM_WORKER'")&&r10.includes("crypto.randomBytes(24)")&&r10.includes("u.searchParams.set('nonce',nonce)")],
['portal preloads persistent worker',manager.includes('function initRelay()')&&manager.includes("document.createElement('iframe')")&&manager.includes("initRelay().catch(function(e)")],
['nested GAS worker posts to top',relayHtml.includes('window.top.postMessage')],
['top captures nested event source',manager.includes('relay.source=ev.source')&&manager.includes('relay.origin=ev.origin')],
['actions sent back to captured worker',manager.includes('relay.source.postMessage')&&manager.includes('relay.origin')],
['nonce checked both directions',manager.includes("String(msg.nonce||'')!==String(relay.nonce||'')")&&relayHtml.includes("String(m.nonce||'') !== nonce")],
['worker uses google.script.run',relayHtml.includes('google.script.run')&&relayHtml.includes('.managerV5Action(auditId,action,options)')],
['no direct sheets cancel/reject',!manager.includes("fetch('/api/v1/manager/action-direct'")&&!r10.includes("u.pathname==='/api/v1/manager/action-direct'")],
['no action canonical polling',!manager.includes('pollActionCanonical')],
['v1 local cancel patch',manager.includes("after.status='Pending Planning'")&&manager.includes("after.hoursPlanned=''")&&manager.includes("after.assignedTo=''")],
['reject local row removal',manager.includes("if(action==='reject'){removeRejectedRowInPlace")],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['comment sent',manager.includes('options={reason:reason,comment:reason,rowIndex:row&&row.sourceRow}')],
['EntryV5 owns route',entry.includes("rawAction === 'externalmanageractionrelay'")&&entry.includes('ExternalManagerActionRelay_render_(relayVerified)')],
['relay helper signed nonce contract',relayOwner.includes("'MANAGER_ACTION_WARM_WORKER'")&&relayOwner.includes('nonce:nonce')],
['v1 warm timing marker',manager.includes('v1-warm-google-script-run')],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
