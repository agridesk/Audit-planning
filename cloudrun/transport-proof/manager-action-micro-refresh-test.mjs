import fs from 'node:fs';
const manager=fs.readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const r10=fs.readFileSync(new URL('./server-r10.js',import.meta.url),'utf8');
const r4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const entry=fs.readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const relayOwner=fs.readFileSync(new URL('../../zz_ExternalManagerActionRelay.js',import.meta.url),'utf8');
const relayHtml=fs.readFileSync(new URL('../../ManagerActionRelay.html',import.meta.url),'utf8');
const statusMachine=fs.readFileSync(new URL('../../CoreStatusMachine.js',import.meta.url),'utf8');
const lifecycle=fs.readFileSync(new URL('../../AuditLifecycleService.js',import.meta.url),'utf8');
const checks=[
['warm relay endpoint is GET',r10.includes("req.method==='GET'&&u.pathname==='/api/v1/manager/action-relay-url'")],
['server signs nonce bootstrap',r10.includes("'MANAGER_ACTION_WARM_WORKER'")&&r10.includes("crypto.randomBytes(24)")&&r10.includes("u.searchParams.set('nonce',nonce)")],
['portal preloads persistent worker',manager.includes('function initRelay()')&&manager.includes("document.createElement('iframe')")&&manager.includes("initRelay().catch(function(e)")],
['worker server-warms before READY',relayHtml.indexOf('.ManagerActionWorker_warm()')>=0&&relayHtml.indexOf('bindAndReady(warm)')>=0&&relayHtml.indexOf('.ManagerActionWorker_warm()')<relayHtml.indexOf("reply({type:'AMS_MANAGER_ACTION_RELAY_READY',success:true")],
['server warmup primes GAS owners',relayOwner.includes('function ManagerActionWorker_warm()')&&relayOwner.includes('__mp_getAuditPlanningPack_')&&relayOwner.includes('AvailabilityService.healthcheck')],
['cold bootstrap timeout moved off action path',manager.includes('},45000);')&&manager.includes("ACTION_RELAY_READY_TIMEOUT")],
['nested GAS worker posts to top',relayHtml.includes('window.top.postMessage')],
['top captures nested event source',manager.includes('relay.source=ev.source')&&manager.includes('relay.origin=ev.origin')],
['actions sent back to captured worker',manager.includes('relay.source.postMessage')&&manager.includes('relay.origin')],
['nonce checked both directions',manager.includes("String(msg.nonce||'')!==String(relay.nonce||'')")&&relayHtml.includes("String(m.nonce||'') !== nonce")],
['worker uses google.script.run',relayHtml.includes('google.script.run')&&relayHtml.includes('.managerV5Action(auditId,action,options)')],
['Approve Accept Cancel and Reject use direct Cloud Run canonical writers',manager.includes("(action==='approve'||action==='accept'||action==='cancel'||action==='reject')?runActionViaCloudRun")&&r4.includes("if(managerAction==='approve')return directManagerApprove(identity,body)")&&r4.includes("if(managerAction==='accept')return directManagerAcceptOnBehalf(identity,body)")&&r4.includes("if(managerAction==='cancel')return directManagerCancel(identity,body)")&&r4.includes("if(managerAction==='reject')return directManagerReject(identity,body)")&&r4.includes("owner:'CLOUD_RUN_DIRECT_MANAGER_APPROVE'")&&r4.includes("owner:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF'")&&r4.includes("owner:'CLOUD_RUN_DIRECT_MANAGER_CANCEL'")&&r4.includes("owner:'CLOUD_RUN_DIRECT_MANAGER_REJECT'")],
['Approve route explicit through r10',r10.includes("managerAction==='approve'")&&r10.includes("/api/v1/manager/approve-direct")],
['Accept route explicit through r10',r10.includes("managerAction==='accept'")&&r10.includes("/api/v1/manager/accept-direct")],
['Approve follows roadmap self-plan flow',r4.includes("roadmapRule:'AUDITOR_SELF_PLAN_MANAGER_APPROVE_DIRECT_ACCEPTED'")&&r4.includes("set(['Status'],'Accepted')")&&r4.includes("set(['Date - Approved','Date approved','Date Approved'],now.slice(0,10))")&&r4.includes("set(['Date accepted','Date - Accepted','Date Accepted'],now.slice(0,10))")&&r4.includes("'AUDIT_APPROVED'")&&r4.includes("'ECAS_AUDIT_APPROVAL_DIGEST'")],
['Manager Accept on behalf is explicitly logged',r4.includes("async function directManagerAcceptOnBehalf")&&r4.includes("onBehalf:true")&&r4.includes("confirmationSource:'EXTERNAL_CONFIRMATION'")&&r4.includes("representedAuditor")&&r4.includes("ACCEPT_ON_BEHALF_CONFIRMATION_CHANNEL_REQUIRED")],
['Manager Approved rows expose Accept',r4.includes("statusKey==='APPROVED'?['ACCEPT','CANCEL','REJECT']")&&manager.includes('raw.indexOf("ACCEPT")>=0')],
['Manager Accept on behalf queues accepted plus ECAS',r4.includes("'AUDIT_ACCEPTED'")&&r4.includes("'ECAS_AUDIT_APPROVAL_DIGEST'")&&r4.includes("CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF")],
['Reject updates Model C scope ownership',r4.includes("rr[ost]='REJECTED'")&&r4.includes("rr[csactive]='NO'")&&r4.includes("MODEL_C_NO_ACTIVE_OBLIGATIONS_FOR_REJECT")],
['Reject archives before deleting projection row',r4.indexOf("await sheetsValuesAppend('Rejected audits!A:'")<r4.indexOf("await sheetsDeleteRow('Audit planning',found.sourceRow)")],
['Reject route explicit through r10',r10.includes("managerAction==='reject'")&&r10.includes("/api/v1/manager/reject-direct")],
['no obsolete action-direct endpoint',!manager.includes("fetch('/api/v1/manager/action-direct'")&&!r10.includes("u.pathname==='/api/v1/manager/action-direct'")],
['no action canonical polling',!manager.includes('pollActionCanonical')],
['v1 local cancel patch',manager.includes("after.status='Pending Planning'")&&manager.includes("after.hoursPlanned=''")&&manager.includes("after.assignedTo=''")],
['reject local row removal',manager.includes("if(action==='reject'){removeRejectedRowInPlace")],
['scroll preserved',manager.includes('window.scrollTo(scrollX,scrollY)')],
['per audit lock',manager.includes('var busyAudits=new Set()')],
['comment source row revision and on-behalf evidence sent',manager.includes('options={reason:reason,comment:reason,confirmationChannel:confirmationChannel,confirmationNote:reason,rowIndex:row&&row.sourceRow,expectedRevision:row&&row.sourceRevision}')],
['source row consumed by StatusMachine',statusMachine.includes('Status_loadAudit_(auditId, payload && payload.rowIndex)')],
['source row is audit-id verified',statusMachine.includes("String(__hintRow[__hintAi] || '').trim() === auditId")],
['cold index is fallback only',statusMachine.includes("if (!__indexed && typeof __mp_getAuditPlanningRow_ === 'function')")],
['protected snapshot reuses loaded row',lifecycle.includes('(ctx.row && ctx.row.length)')],
['protected restore uses one bounded read',lifecycle.includes('maxCol - minCol + 1')&&!lifecycle.includes('snapshot.sheet.getRange(snapshot.rowIndex, f.col).getValue()')],
['EntryV5 owns route',entry.includes("rawAction === 'externalmanageractionrelay'")&&entry.includes('ExternalManagerActionRelay_render_(relayVerified)')],
['relay helper signed nonce contract',relayOwner.includes("'MANAGER_ACTION_WARM_WORKER'")&&relayOwner.includes('nonce:nonce')],
['transport trace propagated',manager.includes('clientSentAt')&&manager.includes('browserToWorkerMs')&&manager.includes('workerRpcWallMs')&&relayHtml.includes('workerReceivedAt')&&relayHtml.includes('rpcStartedAt')&&relayHtml.includes('rpcEndedAt')],
['status phases instrumented',statusMachine.includes('__statusPerf.writeGuardMs')&&statusMachine.includes('__statusPerf.loadAuditMs')&&statusMachine.includes('__statusPerf.coreMs')&&statusMachine.includes('__statusPerf.notificationOnlyMs')],
['cancel subphases instrumented',statusMachine.includes('__perf.availabilityMs')&&statusMachine.includes('__perf.resetPlanningMs')&&statusMachine.includes('__perf.statusWriteMs')&&statusMachine.includes('__perf.lifecycleMs')&&statusMachine.includes('__perf.cacheInvalidationMs')],
['trace visible in UI',manager.includes('coreDetail=')&&manager.includes(' · trace ')],
['trace timing marker',manager.includes(' · trace ')&&manager.includes('b→w ')&&manager.includes('preRPC ')&&manager.includes('w→b ')],
['r10 stable chain',r10.includes("await import('./server-r9.js')")]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);
if(failed.length)process.exit(1);
console.log('manager-action-micro-refresh-test passed');
