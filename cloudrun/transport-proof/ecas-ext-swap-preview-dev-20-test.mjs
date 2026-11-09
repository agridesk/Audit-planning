import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const preview=readFileSync(new URL('../../NotificationEcasExtSwapDevPreview20.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../../NotificationRenderer_PlanningToClientDigest.js',import.meta.url),'utf8');
const smoke=readFileSync(new URL('../../NotificationSmokeTools.js',import.meta.url),'utf8');
assert(smoke.includes('return RUN_ECAS_EXT_SWAP_PREVIEW_DEV_20261109();'),'RUN_NF_EXT must preview EXT, not send ordinary audit digest');
const liveId='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
let environment='DEV',sheetId=liveId,mode='TEST_TO_SELF',testAddress='info@agridesk.com',outbound=0;
const ctx={
 SYS_getEnv_:()=>environment,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=>sheetId})},
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='V5_SSOT_SPREADSHEET_ID'?liveId:''})},
 NB_html_:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),
 NB_scopeDisplayList_:v=>v,
 NB_mpsNumber_:v=>v.mpsNumber,
 NB_externalAuditorText_:v=>v.auditorName,
 NB_externalScheduleRows_:v=>(v.blocks||[]).map(b=>({date:b.date,time:b.start+' – '+b.end})),
 NB_externalTh_:t=>'<th>'+t+'</th>',
 NB_externalTd_:t=>'<td style="">'+t+'</td>',
  NB_externalTdHtml_:(v)=>'<td>'+v+'</td>',
  NB_scopeBadgesHtml_:(arr)=>arr.map(v=>'<span style="background:#ddeeff">'+v+'</span>').join(''),
 NB_externalShellStart_:()=>'<html><body>',
 NB_externalShellEnd_:()=>'</body></html>',
 SYS_getResolvedNotificationMode_:()=>mode,
 SYS_getConfig_:()=>({DEV_TEST_EMAIL:testAddress}),
 SYS_resolveNotificationRecipients_:()=>({send:true,mode:'TEST_TO_SELF',recipient:testAddress}),
 NotificationDeliveryGuard_assertOutboundAllowed:()=>{},
 NotificationMailGateway_SendEmail:()=>{outbound++;return{ok:true,id:'synthetic-provider-id'}}
};
vm.createContext(ctx);
vm.runInContext(renderer,ctx);
vm.runInContext(preview,ctx);
const render=ctx.RUN_ECAS_EXT_SWAP_PREVIEW_DEV_20261109();
assert.equal(render.ok,true);
assert.equal(render.synthetic,true);
assert.equal(render.queueMutated,false);
assert.equal((render.htmlBody.match(/<table /g)||[]).length,2);
assert.equal((render.htmlBody.match(/<td /g)||[]).length,24);
assert.equal((render.htmlBody.match(/Hallo,/g)||[]).length,1);
assert.equal((render.htmlBody.match(/Bedankt,/g)||[]).length,1);
assert(render.htmlBody.includes('SWAP – Gewijzigde auditplanning'));
assert(render.htmlBody.includes('Verlenging toegepast'));
assert(render.htmlBody.includes('Verlenging ingetrokken'));
assert.equal((render.htmlBody.match(/background:#ddeeff/g)||[]).length,4,'Scope badges appear for all SWAP and extension rows');
assert.equal(outbound,0,'Preview must never send mail');
environment='PROD';
assert.throws(()=>ctx.RUN_ECAS_EXT_SWAP_PREVIEW_DEV_20261109(),/DEV_ONLY/);
assert.throws(()=>ctx.RUN_ECAS_EXT_SWAP_TEST_MAIL_DEV_20261109(),/DEV_ONLY/);
environment='DEV';sheetId='WRONG_WORKBOOK';
assert.throws(()=>ctx.RUN_ECAS_EXT_SWAP_TEST_MAIL_DEV_20261109(),/SSOT_MISMATCH/);
sheetId=liveId;mode='DRY_RUN';
assert.throws(()=>ctx.RUN_ECAS_EXT_SWAP_TEST_MAIL_DEV_20261109(),/TEST_TO_SELF_REQUIRED/);
mode='TEST_TO_SELF';testAddress='ecas@example.invalid';
assert.throws(()=>ctx.RUN_ECAS_EXT_SWAP_TEST_MAIL_DEV_20261109(),/TEST_RECIPIENT_UNEXPECTED/);
assert.equal(outbound,0);
testAddress='info@agridesk.com';
const sent=ctx.RUN_ECAS_EXT_SWAP_TEST_MAIL_DEV_20261109();
assert.equal(sent.recipient,'info@agridesk.com');
assert.equal(sent.actualEcasDelivery,false);
assert.equal(sent.queueMutated,false);
assert.equal(outbound,1);
console.log('ECAS synthetic EXT/Undo + SWAP DEV mail safety PASS');
