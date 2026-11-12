import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicNotificationScalarService20} from './planning-atomic-notification-scalar-20.js';

for(const kind of ['rule','devMode']){
 for(const mode of ['success','reject','partial','transport','stale']){
  const key=kind==='rule'?'COMING_UP_DAYS':'DEV_NOTIFICATION_MODE';
  const tab=kind==='rule'?'Notification_Rules':'System_Config';
  const original=kind==='rule'?'4':'OFF',next=kind==='rule'?'7':'DRY_RUN';
  let current=original;
  const events=[];
  const gate={
   acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),
   uncertain:async()=>events.push('uncertain')
  };
  const bridge=createAtomicNotificationScalarService20({
   gate,
   readRows:async sheet=>{
    assert.equal(sheet,tab);events.push('read');
    return kind==='rule'?[['Rule_Key','Value'],[key,current]]:
      [['SETTING_KEY','DEV'],[key,current]];
   },
   forward:async({operation})=>{
    assert.equal(operation,kind==='rule'?'updateRule':'updateDevMode');
    events.push('forward');
    if(mode==='transport')throw Error('UPSTREAM_TRANSPORT_UNKNOWN');
    if(mode==='success'){current=next;return {ok:true};}
    if(mode==='partial'){current='PARTIAL';return {ok:false};}
    return {ok:false};
   }
  });
  const request={actor:{role:'manager',auditorId:'manager-1'},kind,key,value:next,
   expected:mode==='stale'?'STALE':original};
  if(['stale','partial','transport'].includes(mode)){
   await assert.rejects(bridge.commit(request),mode==='stale'?/STALE_EXPECTED/:
    mode==='partial'?/REJECTED_WRITE_UNCERTAIN/:/UPSTREAM_TRANSPORT_UNKNOWN/);
  }else{
   const result=await bridge.commit(request);
   assert.equal(result.ok,mode==='success');
  }
  assert.deepEqual(events,mode==='stale'?['lock','read','release']:
   mode==='transport'?['lock','read','forward','uncertain']:
   mode==='partial'?['lock','read','forward','read','uncertain']:
   ['lock','read','forward','read','release']);
 }
}
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(r15,/createAtomicNotificationScalarService20/);
assert.match(r15,/planningAtomicNotificationScalar\.commit\(\{actor,kind:'rule'/);
assert.match(r15,/planningAtomicNotificationScalar\.commit\(\{actor,kind:'devMode'/);
assert.match(r15,/planningAtomicNotificationScalar=planningAtomicEnabled/);
console.log('Atomic notification scalar routes: 10 behavior scenarios and R15 wiring PASS');
