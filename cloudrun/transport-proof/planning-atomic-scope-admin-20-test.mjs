import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicScopeAdminService20,atomicScopeAdminRoutes20} from './planning-atomic-scope-admin-20.js';
const h=Array(26).fill('');
Object.assign(h,{0:'SlotKey',1:'ScopeCode',2:'DisplayName',3:'Active',4:'Certification_Body_ID',
 5:'Rotation_Normal_Maximum',6:'Max number audits',7:'Default_hours',8:'Recurring',21:'Official_Scheme_Version'});
const r=Array(26).fill('');
Object.assign(r,{0:'SCOPE_01',1:'AAA',2:'First',3:'TRUE',4:'ECAS',5:'3',6:'3',7:'4',8:'YES',21:'V4'});
const vh=['ScopeCode','VersionId','Hours_to_plan','Status','Effective_From',
 'Effective_To','Created_At','Created_By','Change_Reason'];
const inputs={
 'scheme-version':{scopeCode:'AAA',expected:'V4',version:'V5',reason:'Upgrade',impactConfirmed:true},
 policy:{scopeCode:'AAA',field:'Rotation_Normal_Maximum',expected:'3',value:'4',
  reason:'Upgrade',impactConfirmed:true},
 create:{scopeCode:'bbb',displayName:'Second',certificationBodyId:'ecas',
  reason:'Create',confirmation:'CREATE_INACTIVE_SCOPE'},
 'hours-version':{scopeCode:'AAA',expectedVersion:'V1',hours:'5',
  reason:'Upgrade',impactConfirmed:true}
};
for(const kind of ['scheme-version','policy','create','hours-version']){
 for(const mode of ['success','reject','partial','transport']){
  let catalog=[h.slice(),r.slice()],versions=[vh.slice(),['AAA','V1','4','CURRENT','date','','date','m','reason']];
  const events=[],gate={
   acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),
   uncertain:async()=>events.push('uncertain')
  };
  const bridge=createAtomicScopeAdminService20({
   gate,
   readRows:async tab=>{events.push('read-'+tab);
    return (tab==='Config_Scopes'?catalog:versions).map(row=>row.slice())},
   forward:async()=>{
    events.push('forward');
    if(mode==='transport')throw Error('TRANSPORT_UNKNOWN');
    if(mode==='success'||mode==='partial'){
     if(kind==='scheme-version')catalog[1][21]='V5';
     if(kind==='policy'){catalog[1][5]='4';catalog[1][6]='4';}
     if(kind==='create'){const next=Array(26).fill('');
      Object.assign(next,{0:'SCOPE_02',1:'BBB',2:'Second',3:'FALSE',4:'ECAS'});catalog.push(next);}
     if(kind==='hours-version'){
      catalog[1][7]='5';versions[1][3]='HISTORICAL';versions[1][5]='today';
      versions.push(['AAA','V2','5','CURRENT','today','','today','m','reason']);
     }
     if(mode==='partial')return {status:409,payload:{ok:false,error:'PARTIAL_WRITE'}};
     return {status:200,payload:{ok:true,slotKey:'SCOPE_02',versionId:'V2'}};
    }
    return {status:409,payload:{ok:false,error:'VALIDATION_REJECTED'}};
   }
  });
  const request={actor:{role:'manager',auditorId:'manager-1'},path:'/api/v1/manager/scopes/'+kind,
   body:inputs[kind],cookie:'sid=abc',origin:'https://dev.example'};
  if(mode==='transport'||mode==='partial')
   await assert.rejects(bridge.commit(request),mode==='partial'?/WRITE_UNCONFIRMED/:/TRANSPORT_UNKNOWN/);
  else assert.equal((await bridge.commit(request)).status,mode==='success'?200:409);
  const prefix=['lock',...kind==='hours-version'?['read-Config_Scopes','read-ScopeVersions']:['read-Config_Scopes'],'forward'];
  assert.deepEqual(events,mode==='transport'?[...prefix,'uncertain']:
   [...prefix,...kind==='hours-version'?['read-Config_Scopes','read-ScopeVersions']:['read-Config_Scopes'],
    mode==='partial'?'uncertain':'release']);
 }
}
assert.equal(atomicScopeAdminRoutes20.length,4);
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(r15,/planningAtomicScopeAdmin&&atomicScopeAdminRoutes20\.includes\(u\.pathname\)/);
assert.match(r15,/planningAtomicScopeAdmin\.commit\(\{actor,path:u\.pathname,body/);
console.log('Atomic Scope Management: 16 readback/CAS/uncertain scenarios and entrypoint PASS');
