import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../../NotificationRenderer_WeeklyDigest.js',import.meta.url),'utf8');
const start=source.indexOf('function nrm2_queueWeeklyMail_(');
const end=source.indexOf('function RUN_NF_WEEKLY_QUEUE_SMOKE(',start);
assert.ok(start>=0&&end>start,'Weekly queue writer found');
let locks=0;
const rows=[];
const queue={appendRow:row=>rows.push(row),getLastRow:()=>rows.length+1};
const spreadsheet={getSheetByName:()=>queue};
const ctx={
 NotificationConfig_GetQueueSheetName:()=> 'Notification Queue',
 Utilities:{
  DigestAlgorithm:{SHA_256:'SHA_256'},
  computeDigest:(algorithm,s)=>[...createHash('sha256').update(s).digest()],
  base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')
 },
 LockService:{getScriptLock:()=>({
  tryLock:()=>{locks++;return true},
  releaseLock:()=>{locks--}
 })},
 NB_recentQueueDuplicate_:(sh,hash)=>{const i=rows.findIndex(r=>r[10]===hash);return i>=0?{found:true,row:i+2}:{found:false}},
 Date,JSON,String,Error
};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
const mail={eventKey:'WEEKLY_MANAGER_DIGEST',recipient:'manager@example.org',digestGroup:'MANAGER_WEEKLY',subject:'Weekly summary',body:'Summary',htmlBody:'<p>Summary</p>'};
const first=ctx.nrm2_queueWeeklyMail_(spreadsheet,mail);
const replay=ctx.nrm2_queueWeeklyMail_(spreadsheet,mail);
const changedContent=ctx.nrm2_queueWeeklyMail_(spreadsheet,{...mail,subject:'Changed summary',htmlBody:'<p>Changed</p>'});
const separateRecipient=ctx.nrm2_queueWeeklyMail_(spreadsheet,{...mail,recipient:'other@example.org'});
const separateEvent=ctx.nrm2_queueWeeklyMail_(spreadsheet,{...mail,eventKey:'WEEKLY_AUDITOR_DIGEST'});
assert.equal(first.status,'PENDING');
assert.equal(replay.status,'DUPLICATE_SUPPRESSED');
assert.equal(changedContent.status,'DUPLICATE_SUPPRESSED','Same weekly schedule cannot resend edited content');
assert.equal(separateRecipient.status,'PENDING');
assert.equal(separateEvent.status,'PENDING');
assert.equal(rows.length,3,'Only distinct weekly event/recipient pairs can be queued');
assert.notEqual(rows[0][10],rows[1][10],'Distinct recipient must have distinct hash');
assert.equal(locks,0);
assert.ok(source.includes('plannedInfo.firstDate && plannedInfo.firstDate < today'), 'Auditor weekly overdue check must use real first planned date');
assert.ok(!source.includes('plannedInfo.firstPlannedDate < today'), 'Invalid overdue property must not return');
assert.match(source,/function RUN_INSTALL_WEEKLY_DIGEST_TRIGGERS_DEV_20261021\(/);
assert.match(source,/ScriptApp\.WeekDay\.TUESDAY/);
assert.match(source,/\.atHour\(6\)/);
assert.match(source,/\.inTimezone\('Europe\/Amsterdam'\)/);
assert.match(source,/ScriptApp\.deleteTrigger\(existing\[i\]\)/);
// Weekly auditor lookup: UID is canonical, name is for display, email only transports.
assert.match(source,/var recipientUid=recipientInfo\.uid/);
assert.match(source,/var recipientName = recipientInfo\.name/);
assert.match(source,/assignedUid === recipientUid/);
assert.match(source,/preassignedUid === recipientUid/);
assert.doesNotMatch(source,/assigned\.toLowerCase\(\) === recipient\.toLowerCase\(\)/);
assert.match(source,/WEEKLY_AUDITOR_UID_DIRECTORY_INCOMPLETE/);
assert.match(source,/WEEKLY_DUPLICATE_AUDITOR_UID/);
assert.match(source,/auditorUid: recipientUid/);
const directoryStart=source.indexOf('function nra2_getAuditorRecipients_(');
const directoryEnd=source.indexOf('function nra2_resolveWeeklyAuditUid_(',directoryStart);
assert.ok(directoryStart>=0 && directoryEnd>directoryStart);
const resolverStart=directoryEnd;
const resolverEnd=source.indexOf('function nra2_loadScopeConfig_(',resolverStart);
assert.ok(resolverEnd>resolverStart);
const ctxUid={};vm.createContext(ctxUid);
vm.runInContext(source.slice(resolverStart,resolverEnd),ctxUid);
const known={'david@agriqa.es':{uid:'uid-david'}};
assert.equal(ctxUid.nra2_resolveWeeklyAuditUid_('DAVID@agriqa.es',known),'uid-david');
assert.equal(ctxUid.nra2_resolveWeeklyAuditUid_('uid-david',known),'uid-david');
assert.equal(ctxUid.nra2_resolveWeeklyAuditUid_('unknown@example.org',known),'');
// Manager digest must display full names; never publish auditor email as an identifier.
assert.match(source,/assigned: nrm2_weeklyAuditorDisplay_\(/);
assert.match(source,/upStatus === 'PENDING APPROVAL' \? nrm2_weeklyAuditorDisplay_\(/);
assert.match(source,/preassigned: nrm2_weeklyAuditorDisplay_\(/);
const managerNameBegin=source.indexOf('function nrm2_weeklyAuditorDisplay_(');
const managerNameEnd=source.indexOf('function nrm2_buildMail_(',managerNameBegin);
assert.ok(managerNameBegin>=0&&managerNameEnd>managerNameBegin);
const displayFn=new Function(source.slice(managerNameBegin,managerNameEnd)+';return nrm2_weeklyAuditorDisplay_;')();
assert.equal(displayFn('david@agriqa.es',{'david@agriqa.es':'David Pastor'}),'David Pastor');
assert.equal(displayFn('UID-1',{'uid-1':'Paco Pelota'}),'Paco Pelota');
assert.equal(displayFn('unmapped@example.org',{}),'Unresolved auditor');
assert.match(source,/function RUN_PREVIEW_WEEKLY_MANAGER_DEV_20261021\(/);
assert.match(source,/if\(options\.previewOnly===true\) return \{ok:true,previewOnly:true,queued:false/);
assert.match(source,/PREVIEW_RECIPIENT_NOT_WHITELISTED/);
assert.match(source,/DEV_TEST_TO_SELF_REQUIRED/);
// Only Accepted audits are confirmed upcoming or pending completion.
// Approved/Pending Approval belong to acceptance/approval queues, never completion.
const managerRunner=source.slice(source.indexOf('function runManagerWeeklyAlert('),source.indexOf('function nrm2_queueWeeklyMail_('));
const auditorRunner=source.slice(source.indexOf('function runAuditorWeeklyAlert(options)'),source.indexOf('// ============================================================\n// MAIL RENDER',source.indexOf('function runAuditorWeeklyAlert(options)')));
assert.match(managerRunner,/upStatus === 'ACCEPTED' &&\s*record\.firstPlannedDate &&\s*record\.firstPlannedDate >= today/);
assert.equal((auditorRunner.match(/assignedUid === recipientUid &&\s*upStatus === 'ACCEPTED' &&\s*record\.firstPlannedDate/g)||[]).length,2);
assert.match(source,/function RUN_PREVIEW_WEEKLY_AUDITORS_DEV_20261021\(/);
assert.match(source,/var report=runAuditorWeeklyAlert\(\{previewOnly:true\}\)/);
assert.match(source,/if\(options\.previewOnly===true\) \{\s*results\.push\(\{auditorUid:recipientUid/);
assert.match(source,/return html\.join\(' &nbsp; '\)/);
assert.match(source,/if \(pendingPlanningTotal > 0\) \{/);
assert.match(source,/if \(blocks\.critical\.length\) \{/);
assert.match(source,/if \(blocks\.urgent\.length\) \{/);
assert.match(source,/if \(blocks\.upcoming\.length\) \{/);
assert.match(source,/function RUN_DIAG_WEEKLY_STATUS_CONSISTENCY_DEV_20261021\(/);
assert.match(source,/DEV_ONLY_WEEKLY_DIAGNOSTICS/);
assert.match(source,/lastAuditorDecision:action/);
assert.match(source,/review, do not auto-complete/);
assert.equal((auditorRunner.match(/recipientUid &&\s*assignedUid === recipientUid &&/g)||[]).length,3);
assert.doesNotMatch(auditorRunner,/assigned &&\s*recipient &&\s*assignedUid === recipientUid/);
assert.match(source,/function nrm2_renderGroupTable_\(title, rows, scopeStyleMap\) \{\s*if \(!rows \|\| !rows\.length\) return '';/);
assert.match(source,/function nrm2_renderSection_\(title, rows, scopeStyleMap, helpText\) \{\s*if \(!rows \|\| !rows\.length\) return '';/);
assert.match(source,/border-bottom:1px solid #e5e7eb;padding:3px 5px/);
assert.match(source,/font-weight:700;font-size:11px;white-space:nowrap/);
const bridgeSource=readFileSync(new URL('../../StatusNotificationBridge.js',import.meta.url),'utf8');
const validatorStart=bridgeSource.indexOf('function StatusNotificationBridge_ValidateEcasChangeCancel_(');
const validatorEnd=bridgeSource.indexOf('\nfunction ',validatorStart+10);
assert.ok(validatorStart>=0 && validatorEnd>validatorStart,'ECAS validator available');
const ecasCheck=new Function(bridgeSource.slice(validatorStart,validatorEnd)+'; return StatusNotificationBridge_ValidateEcasChangeCancel_;')();
const old={auditId:'audit-1',communicatedToEcas:true,plannedDates:['2026-10-20'],version:'1'};
const next={auditId:'audit-1',plannedDates:['2026-10-25'],version:'2'};
assert.equal(ecasCheck('ECAS_AUDIT_CHANGED_DIGEST',old,next,'Updated plan').ok,true);
assert.equal(ecasCheck('ECAS_AUDIT_CANCELLED_DIGEST',old,{auditId:'audit-1',version:'2'},'Cancelled by manager').ok,true);
assert.equal(ecasCheck('ECAS_AUDIT_CHANGED_DIGEST',{...old,communicatedToEcas:false},next,'reason').ok,false);
assert.equal(ecasCheck('ECAS_AUDIT_CHANGED_DIGEST',old,next,'').ok,false);
assert.equal(ecasCheck('ECAS_AUDIT_CHANGED_DIGEST',old,{...next,version:'1'},'reason').ok,false);
assert.equal(ecasCheck('ECAS_AUDIT_CHANGED_DIGEST',old,{auditId:'audit-2',plannedDates:['2026-10-25']},'reason').ok,false);
const prepStart=bridgeSource.indexOf('function StatusNotificationBridge_PrepareEcasChangeCancel_(');
const prepEnd=bridgeSource.indexOf('\nfunction ',prepStart+10);
assert.ok(prepStart>=0&&prepEnd>prepStart,'ECAS payload assembler available');
const prep=new Function('StatusNotificationBridge_ValidateEcasChangeCancel_',bridgeSource.slice(prepStart,prepEnd)+'; return StatusNotificationBridge_PrepareEcasChangeCancel_;')(ecasCheck);
const prior={auditId:'A',communicatedToEcas:true,communicationId:'receipt',version:'1',company:'Example',mpsNumber:'800',auditorName:'Full Name',scopes:['MPS-GAP'],plannedHours:8,blocks:[{date:'2026-10-20'}]};
const changed={auditId:'A',version:'2',blocks:[{date:'2026-10-22'}]};
const resultChange=prep('ECAS_AUDIT_CHANGED_DIGEST',prior,changed,'Moved at request');
assert.equal(resultChange.ok,true);
assert.equal(resultChange.queueAllowed,false);
assert.equal(resultChange.payload.previousBlocks[0].date,'2026-10-20');
assert.equal(resultChange.payload.blocks[0].date,'2026-10-22');
assert.equal(resultChange.payload.ecasComment,'Moved at request');
const resultCancel=prep('ECAS_AUDIT_CANCELLED_DIGEST',prior,{auditId:'A',version:'2'},'Cancelled');
assert.equal(resultCancel.ok,true);
assert.equal(resultCancel.payload.previousBlocks.length,1);
assert.equal(prep('ECAS_AUDIT_CHANGED_DIGEST',{...prior,communicationId:''},changed,'Moved').ok,false);
assert.equal(prep('ECAS_AUDIT_CHANGED_DIGEST',prior,changed,'').ok,false);
assert.match(bridgeSource,/function RUN_DIAG_ECAS_CHANGE_CANCEL_CONTRACT_DEV_20261021\(/);
console.log('notification-weekly-queue-idempotency-20: PASS');
