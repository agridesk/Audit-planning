import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicAuditorGovernanceService20,atomicAuditorGovernanceRoutes20}
 from './planning-atomic-auditor-governance-20.js';

for(const kind of ['qualification','withdraw','withdrawCancel','create']){
 for(const mode of ['success','reject','partial','transport']){
  const email=kind==='create'?'b@example.com':'a@example.com';
  const existing=kind==='withdrawCancel'?[{scopeCode:'S1',effectiveDate:'2026-11-30'}]:[];
  let auditors=[['E-mail','Name','Active','Role','Auditor_UID','Qualification_Withdrawals_JSON','S1'],
   ['a@example.com','A','Yes','Auditor','uid-a',JSON.stringify(existing),'x']];
  let scopes=[['ScopeCode','DisplayName','SlotKey'],['S1','SCOPE 1','SCOPE_01']];
  let versions=[['Email_Normalized','Auditor_UID','State'],['a@example.com','uid-a','ACTIVE']];
  const suffix={qualification:'qualification/save',withdraw:'qualification/withdraw',
   withdrawCancel:'qualification/withdraw/cancel',create:'create'}[kind];
  const body=kind==='create'?{email,name:'B',role:'Auditor'}:
   kind==='qualification'?{email,scopeCode:'S1',expected:true,qualified:false}:
   kind==='withdraw'?{email,scopeCode:'S1',effectiveDate:'2026-11-30',
    grandfatheredAuditIds:[]}:{email,scopeCode:'S1',expectedEffectiveDate:'2026-11-30'};
  const events=[],gate={
   acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),
   uncertain:async()=>events.push('uncertain')
  };
  const bridge=createAtomicAuditorGovernanceService20({
   gate,
   readRows:async tab=>{
    events.push('read-'+tab);
    return (tab==='Auditors'?auditors:
     tab==='Config_Scopes'?scopes:versions).map(row=>row.slice());
   },
   forward:async()=>{
    events.push('forward');
    if(mode==='transport')throw Error('TRANSPORT_UNKNOWN');
    if(['success','partial'].includes(mode)){
     if(kind==='qualification')auditors[1][6]='';
     if(kind==='withdraw')
      auditors[1][5]=JSON.stringify([{scopeCode:'S1',effectiveDate:'2026-11-30',
       trailId:'T',grandfatheredAuditIds:[]}]);
     if(kind==='withdrawCancel')auditors[1][5]='[]';
     if(kind==='create'){
      auditors.push(['b@example.com','B','No','Auditor','uid-b','[]','']);
      versions.push(['b@example.com','uid-b','ACTIVE']);
     }
     if(mode==='partial')return {status:409,payload:{ok:false,error:'PARTIAL'}};
     return {status:200,payload:{ok:true,active:false,trailId:'T'}};
    }
    return {status:409,payload:{ok:false,error:'VALIDATION_REJECTED'}};
   }
  });
  const request={actor:{role:'manager',auditorId:'manager-1'},
   path:'/api/v1/manager/auditor-management/'+suffix,body,
   cookie:'sid=abc',origin:'https://dev.example'};
  if(mode==='transport'||mode==='partial')
   await assert.rejects(bridge.commit(request),mode==='partial'?/WRITE_UNCONFIRMED/:/TRANSPORT_UNKNOWN/);
  else assert.equal((await bridge.commit(request)).status,mode==='success'?200:409);
  const tabs=kind==='qualification'?['Auditors','Config_Scopes']:
   kind==='create'?['Auditors','Auditor_Identity_Versions']:['Auditors'];
  const reads=tabs.map(t=>'read-'+t);
  assert.deepEqual(events,mode==='transport'?['lock',...reads,'forward','uncertain']:
   ['lock',...reads,'forward',...reads,mode==='partial'?'uncertain':'release']);
 }
}
assert.equal(atomicAuditorGovernanceRoutes20.length,4);
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(r15,/planningAtomicAuditorGovernance&&atomicAuditorGovernanceRoutes20\.includes\(u\.pathname\)/);
assert.match(r15,/planningAtomicAuditorGovernance\.commit\(\{actor,path:u\.pathname,body/);
console.log('Atomic Auditor Governance: 16 dynamic CAS, parity and fail-uncertain scenarios PASS');
