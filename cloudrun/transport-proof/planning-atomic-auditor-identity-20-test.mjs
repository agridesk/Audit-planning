import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicAuditorIdentityService20,atomicAuditorIdentityRoute20}
 from './planning-atomic-auditor-identity-20.js';
for(const kind of ['email','name']){
 for(const mode of ['success','reject','partial','transport','stale']){
  const isEmail=kind==='email',events=[];
  let auditors=[['E-mail','Name','Auditor_UID'],['old@example.com','Old','uid']];
  let versions=[['Email_Normalized','Auditor_UID','State','Valid_To_UTC'],
   ['old@example.com','uid','ACTIVE','']];
  let planning=[['Assigned to','Auditor_UID'],['old@example.com','uid']];
  let tokens=[['Email','Role','Revoked'],['old@example.com','auditor','FALSE']];
  const gate={acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),uncertain:async()=>events.push('uncertain')};
  const service=createAtomicAuditorIdentityService20({gate,
   readRows:async tab=>{events.push('read-'+tab);
    const rows=tab==='Auditors'?auditors:tab==='Auditor_Identity_Versions'?versions:
     tab==='Audit planning'?planning:tokens;
    return rows.map(r=>r.slice());
   },
   forward:async()=>{
    events.push('forward');if(mode==='transport')throw Error('TRANSPORT_UNKNOWN');
    if(['success','partial'].includes(mode)){
     if(isEmail){
      auditors[1][0]='new@example.com';versions[1][2]='EXPIRED';versions[1][3]='2026-11-12';
      versions.push(['new@example.com','uid','ACTIVE','']);
      planning[1][0]='new@example.com';tokens[1][2]='TRUE';
     }else auditors[1][1]='New';
     if(mode==='partial')return {status:409,payload:{ok:false,error:'PARTIAL'}};
     return {status:200,payload:{ok:true,updatedAssignments:1,revokedTokens:1}};
    }
    return {status:409,payload:{ok:false,error:'REJECTED'}};
   }
  });
  const req={actor:{role:'manager',auditorId:'manager-1'},path:atomicAuditorIdentityRoute20,
   body:{email:'old@example.com',name:mode==='stale'?'STALE':'Old',
    newEmail:isEmail?'new@example.com':'old@example.com',newName:isEmail?'Old':'New'},
   cookie:'sid=abc',origin:'https://dev.example'};
  if(mode==='transport'||mode==='partial'||mode==='stale')
   await assert.rejects(service.commit(req),mode==='stale'?/STALE_EXPECTED/:
    mode==='partial'?/WRITE_UNCONFIRMED/:/TRANSPORT_UNKNOWN/);
  else assert.equal((await service.commit(req)).status,mode==='success'?200:409);
  const read=['read-Auditors','read-Auditor_Identity_Versions','read-Audit planning','read-Auditor_Tokens'];
  assert.equal(events[0],'lock');
  assert.equal(events.at(-1),['partial','transport'].includes(mode)?'uncertain':'release');
  assert.equal(events.includes('forward'),mode!=='stale');
  if(mode==='success'||mode==='reject'||mode==='partial'){
   for(const tab of read)assert.equal(events.filter(x=>x===tab).length,2);
  }
 }
}
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(r15,/planningAtomicAuditorIdentity&&u\.pathname===atomicAuditorIdentityRoute20/);
assert.match(r15,/planningAtomicAuditorIdentity\.commit\(\{actor,path:u\.pathname,body/);
assert.match(r15,/Auditor_Identity_Versions:2000,'Audit planning':2500,Auditor_Tokens:1024/);
console.log('Atomic Auditor Identity: 10 dynamic scenarios and R15 routing PASS');
