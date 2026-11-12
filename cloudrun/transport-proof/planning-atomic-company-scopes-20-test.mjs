import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicCompanyScopesService20,atomicCompanyScopeRoutes20} from './planning-atomic-company-scopes-20.js';
const requests={
 assign:{companyUid:'C',scopeCode:'S2'},
 save:{companyUid:'C',changes:[{scopeCode:'S1',active:'NO',expected:'YES'}]},
 hours:{companyUid:'C',scopeCode:'S1',hours:'5',expected:'4'}
};
for(const kind of ['assign','save','hours']){
 for(const mode of ['success','reject','partial','transport']){
  let cs=[['Company_UID','ScopeCode','Company_Scope_ID','Active','Certification_Body_ID','Company_Formal_Hours_Override'],
    ['C','S1','CS_A','YES','ECAS','']];
  let hs=[['OverrideId','Company_UID','ScopeCode','Hours','Status','Revision','EffectiveTo','EffectiveFrom'],
    ['OV_1','C','S1','4','ACTIVE','1','','2026']];
  const events=[],gate={
   acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),
   uncertain:async()=>events.push('uncertain')
  };
  const bridge=createAtomicCompanyScopesService20({
   gate,
   readRows:async tab=>{
    events.push('read-'+tab);
    return (tab==='Company_Scopes'?cs:hs).map(x=>x.slice());
   },
   forward:async()=>{
    events.push('forward');
    if(mode==='transport')throw Error('TRANSPORT_UNKNOWN');
    if(['success','partial'].includes(mode)){
     if(kind==='assign')cs.push(['C','S2','CS_B','YES','ECAS','']);
     if(kind==='save')cs[1][3]='NO';
     if(kind==='hours'){hs[1][4]='ENDED';hs[1][6]='2026-11-12';
      hs.push(['OV_2','C','S1','5','ACTIVE','2','','2026-11-12']);}
     if(mode==='partial')return {status:409,payload:{ok:false,error:'PARTIAL_WRITE'}};
     return {status:200,payload:{ok:true,created:true,updated:1}};
    }
    return {status:409,payload:{ok:false,error:'REJECTED'}};
   }
  });
  const request={actor:{role:'manager',auditorId:'manager-1'},
   path:'/api/v1/manager/company-management/scopes/'+kind,
   body:requests[kind],cookie:'sid=abc',origin:'https://dev.example'};
  if(mode==='transport'||mode==='partial')
   await assert.rejects(bridge.commit(request),mode==='partial'?/WRITE_UNCONFIRMED/:/TRANSPORT_UNKNOWN/);
  else assert.equal((await bridge.commit(request)).status,mode==='success'?200:409);
  const read=kind==='hours'?['read-Company_Scopes','read-Company_Scope_Hours']:['read-Company_Scopes'];
  assert.deepEqual(events,mode==='transport'?['lock',...read,'forward','uncertain']:
   ['lock',...read,'forward',...read,mode==='partial'?'uncertain':'release']);
 }
}
assert.equal(atomicCompanyScopeRoutes20.length,3);
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(r15,/planningAtomicCompanyScopes&&atomicCompanyScopeRoutes20\.includes\(u\.pathname\)/);
assert.match(r15,/planningAtomicCompanyScopes\.commit\(\{actor,path:u\.pathname,body/);
console.log('Atomic Company Scopes: 12 dynamic CAS, readback and uncertain-write scenarios PASS');
