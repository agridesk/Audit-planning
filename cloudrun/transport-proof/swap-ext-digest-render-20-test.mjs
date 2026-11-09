import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../../NotificationRenderer_PlanningToClientDigest.js',import.meta.url),'utf8');
const builder=readFileSync(new URL('../../NotificationBuilder.js',import.meta.url),'utf8');
const begin=builder.indexOf('function NB_renderDigestEmail_(');
const end=builder.indexOf('function NB_buildPayloadForQueue_(',begin);
assert(begin>=0&&end>begin);
const op='SWAP20_notification_digest_test_20261109';
let journalStage='COMMITTED';
const context={
 NB_clean_:v=>String(v??'').trim(),
 NB_mpsNumber_:v=>String(v.mpsNumber||''),
 NB_scopeDisplayList_:v=>v,
 NB_html_:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),
 NB_getTz_:()=> 'Europe/Amsterdam',
 Utilities:{formatDate:()=> '09-11-2026 20:00'},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>{
  if(name==='AMS_Swap_20_Journal')return{
   getLastRow:()=>4,
   getRange:()=>({getValues:()=>[
    ['Operation_ID','Sequence','Stage'],
    [op,1,'PREPARED'],[op,2,'WRITING'],[op,3,journalStage]
   ]})};
  if(name==='Config_Scopes')return{
   getDataRange:()=>({getValues:()=>[
    ['SlotKey','ScopeCode','DisplayName','Certification_Body_ID'],
    ['SCOPE_01','MPS-ABC','MPS-ABC','ECAS']
   ]})};
  return null;
 }})},
 NB_getEventConfig_:()=>({digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL'}),
 NB_eventCode_:v=>String(v||''),
 NB_mergeObjects_:(a,b)=>({...a,...b}),
 NB_extractPayload_:item=>item.payload||{},
 NB_normalizePayload_:(code,p)=>({...p,eventType:code,eventCode:code,scopes:p.scopes||[],swapItems:p.swapItems||[]}),
 NB_resolveRendererProfile_:()=> 'EXTERNAL_OPERATIONAL',
 NB_isExternalDigestProfile_:()=>true,
 NB_requireRenderer_:()=>{}
};
vm.createContext(context);
vm.runInContext(src,context);
vm.runInContext(builder.slice(begin,end),context);
const audit=id=>({
 eventType:'ECAS_AUDIT_CHANGED_DIGEST',auditId:'AUD_'+id,
 company:'Company '+id,mpsNumber:'913496',auditorEmail:id+'@example.invalid',
 scopes:['MPS-ABC'],plannedHours:4,ecasComment:'Planning changed',
 previousBlocks:[{date:'2026-11-10',start:'09:00',end:'13:00'}],
 blocks:[{date:'2026-11-11',start:'09:00',end:'13:00'}]
});
const swap={eventCode:'ECAS_AUDIT_CHANGED_DIGEST',auditId:'SWAP_'+op,
 payload:{operationId:op,swapItems:[audit('A'),audit('B')]}};
const extension={eventCode:'CB_EXTENSION_APPLIED',payload:{
 certificationBodyId:'ECAS',rendererProfile:'ECAS_AUDIT_APPROVAL_DIGEST',
 templateKey:'ECAS_AUDIT_APPROVAL_DIGEST',
 extensionDetails:{MPS_NUMBER:'913496',COMPANY_NAME:'Company A',
 SCOPE_NAME:'MPS-ABC',PREVIOUS_EXPIRY:'2026-11-30',
 EFFECTIVE_EXPIRY:'2027-03-31'}}};
const mail=context.NB_renderDigestEmail_('ecas@example.invalid',[swap,extension]);
assert(mail.htmlBody.includes('SWAP – Gewijzigde auditplanning'));
assert(mail.htmlBody.includes('Verlengingen'));
assert.equal((mail.htmlBody.match(/<td /g)||[]).length,18,'Two SWAP rows + one extension row');
assert.equal((mail.htmlBody.match(/Hallo,/g)||[]).length,1);
assert.equal((mail.htmlBody.match(/Bedankt,/g)||[]).length,1);
assert.equal((mail.htmlBody.match(/<table /g)||[]).length,2);
assert(mail.body.includes('Vorige planning | Nieuwe planning'));
assert(mail.body.includes('Nieuwe vervaldatum'));
journalStage='WRITING';
assert.throws(()=>context.NB_renderDigestEmail_('ecas@example.invalid',[swap,extension]),/ECAS_SWAP_NOT_COMMITTED/);
journalStage='COMMITTED';
const foreign=JSON.parse(JSON.stringify(swap));foreign.payload.swapItems[1].scopes=['NON_ECAS'];
assert.throws(()=>context.NB_renderDigestEmail_('ecas@example.invalid',[foreign,extension]),/ECAS_SWAP_SCOPE_CB_MISMATCH/);
console.log('ECAS SWAP + EXT/Undo real renderer integration PASS');
