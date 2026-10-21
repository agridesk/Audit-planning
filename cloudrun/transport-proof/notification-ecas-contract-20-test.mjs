import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../StatusNotificationBridge.js',import.meta.url),'utf8');
function isolate(name,dependency=''){
  const begin=source.indexOf('function '+name+'(');
  assert.ok(begin>=0,name+' missing');
  const end=source.indexOf('\nfunction ',begin+10);
  assert.ok(end>begin,name+' boundary missing');
  return source.slice(begin,end);
}
const valid=new Function(isolate('StatusNotificationBridge_ValidateEcasChangeCancel_')+';return StatusNotificationBridge_ValidateEcasChangeCancel_;')();
const prepare=new Function('StatusNotificationBridge_ValidateEcasChangeCancel_',isolate('StatusNotificationBridge_PrepareEcasChangeCancel_')+';return StatusNotificationBridge_PrepareEcasChangeCancel_;')(valid);
const before={auditId:'ID-1',version:'1',communicatedToEcas:true,communicationId:'sent-1',company:'Grower',mpsNumber:'804000',auditorName:'Full Name',auditorUid:'UID-1',scopes:['MPS-GAP'],plannedHours:8,blocks:[{date:'2026-10-20',start:'09:00',end:'17:00'}]};
const after={auditId:'ID-1',version:'2',blocks:[{date:'2026-10-22',start:'09:00',end:'17:00'}]};
const changed=prepare('ECAS_AUDIT_CHANGED_DIGEST',before,after,'Date adjusted');
assert.equal(changed.ok,true);
assert.equal(changed.queueAllowed,false);
assert.equal(changed.payload.originalEcasCommunicationId,'sent-1');
assert.equal(changed.payload.auditorUid,'UID-1');
assert.equal(changed.payload.previousBlocks[0].date,'2026-10-20');
assert.equal(changed.payload.blocks[0].date,'2026-10-22');
assert.equal(changed.payload.ecasComment,'Date adjusted');
const cancelled=prepare('ECAS_AUDIT_CANCELLED_DIGEST',before,{auditId:'ID-1',version:'2'},'Withdrawn');
assert.equal(cancelled.ok,true);
assert.equal(cancelled.queueAllowed,false);
assert.equal(cancelled.payload.previousBlocks[0].date,'2026-10-20');
for(const [label,prior,current,reason] of [
  ['no receipt',{...before,communicationId:''},after,'Date adjusted'],
  ['not communicated',{...before,communicatedToEcas:false},after,'Date adjusted'],
  ['no previous planning',{...before,blocks:[]},after,'Date adjusted'],
  ['no reason',before,after,''],
  ['wrong audit',before,{...after,auditId:'ID-2'},'Date adjusted'],
  ['same version',before,{...after,version:'1'},'Date adjusted'],
  ['no auditor',{...before,auditorName:''},after,'Date adjusted'],
  ['no scopes',{...before,scopes:[]},after,'Date adjusted'],
  ['no hours',{...before,plannedHours:undefined},after,'Date adjusted']
]){
 const outcome=prepare('ECAS_AUDIT_CHANGED_DIGEST',prior,current,reason);
 assert.equal(outcome.ok,false,label);
 assert.equal(outcome.payload,null,label);
}
assert.match(source,/ECAS source integration and live configuration activation remain gated/);
console.log('ECAS change/cancel payload contract tests passed');
