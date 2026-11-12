/** Atomic DEV cutover: three existing Company Scope writers.
 * Writes still use R4 domain services; this adapter serializes all three
 * under the global planning gate and independently verifies their two tables.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const atomicCompanyScopeRoutes20=Object.freeze([
 '/api/v1/manager/company-management/scopes/hours',
 '/api/v1/manager/company-management/scopes/assign',
 '/api/v1/manager/company-management/scopes/save'
]);
const yes=x=>['YES','TRUE','1','X'].includes(str(x).toUpperCase());
function dataTable(rows,tab){
 if(!Array.isArray(rows)||!Array.isArray(rows[0])||!rows.length||rows.length>=3000)
  throw Error('ATOMIC_COMPANY_SCOPE_SOURCE_TRUNCATED_'+tab);
 const h=rows[0].map(str),index=k=>h.indexOf(k);
 return {rows,index};
}
function relations(t,uid,code){
 const ui=t.index('Company_UID'),ci=t.index('ScopeCode');
 if(ui<0||ci<0)throw Error('ATOMIC_COMPANY_SCOPE_SCHEMA_MISSING');
 return t.rows.slice(1).filter(row=>str(row[ui])===uid&&str(row[ci])===code);
}
function activeOverrides(t,uid,code){
 const active=t.index('Status');
 if(active<0)throw Error('ATOMIC_COMPANY_HOURS_STATUS_MISSING');
 return relations(t,uid,code).filter(row=>str(row[active]).toUpperCase()==='ACTIVE');
}
function currentOverride(relation,hours,uid,code){
 const h=hours.index('Hours'),lh=relation.table.index('Company_Formal_Hours_Override');
 if(h<0||lh<0)throw Error('ATOMIC_COMPANY_HOURS_SCHEMA_MISSING');
 const active=activeOverrides(hours,uid,code);
 if(active.length>1)throw Error('ATOMIC_COMPANY_HOURS_MULTIPLE_ACTIVE');
 return {active,raw:active.length?str(active[0][h]):str(relation.row[lh])};
}
function normalizedHours(x){
 const v=str(x);
 if(!v)return '';
 const n=Number(v.replace(',','.'));
 if(!Number.isFinite(n)||n<0||n>1000)throw Error('ATOMIC_COMPANY_HOURS_VALUE_INVALID');
 return String(n);
}
function preflight(type,body,sources){
 const uid=str(body?.companyUid),code=str(body?.scopeCode);
 if(!uid||!code||uid.length>180||code.length>100)throw Error('ATOMIC_COMPANY_SCOPE_ID_INVALID');
 const cs=dataTable(sources.Company_Scopes,'Company_Scopes');
 if(type==='assign'){
  if(relations(cs,uid,code).length)throw Error('ATOMIC_COMPANY_SCOPE_ALREADY_EXISTS');
  return {uid,code,type};
 }
 if(type==='save'){
  if(!Array.isArray(body?.changes)||!body.changes.length||body.changes.length>20)
   throw Error('ATOMIC_COMPANY_SCOPE_CHANGES_INVALID');
  const seen=new Set(),checks=[];
  for(const item of body.changes){
   const sc=str(item?.scopeCode),target=str(item?.active).toUpperCase(),
    expected=str(item?.expected).toUpperCase();
   if(!sc||seen.has(sc)||!['YES','NO'].includes(target)||!['YES','NO'].includes(expected))
    throw Error('ATOMIC_COMPANY_SCOPE_CHANGE_INVALID');
   seen.add(sc);
   const found=relations(cs,uid,sc);
   if(found.length!==1)throw Error('ATOMIC_COMPANY_SCOPE_RELATION_NOT_UNIQUE');
   const current=yes(found[0][cs.index('Active')])?'YES':'NO';
   if(current!==expected)throw Error('ATOMIC_COMPANY_SCOPE_STALE_EXPECTED');
   checks.push({scopeCode:sc,target});
  }
  return {uid,code,type,checks};
 }
 if(type==='hours'){
  if(!Object.hasOwn(body,'expected'))throw Error('ATOMIC_COMPANY_HOURS_EXPECTED_REQUIRED');
  const found=relations(cs,uid,code);
  if(found.length!==1)throw Error('ATOMIC_COMPANY_SCOPE_RELATION_NOT_UNIQUE');
  const hours=dataTable(sources.Company_Scope_Hours,'Company_Scope_Hours'),
   current=currentOverride({table:cs,row:found[0]},hours,uid,code),
   expected=normalizedHours(body.expected),value=normalizedHours(body.hours);
  if(normalizedHours(current.raw)!==expected)throw Error('ATOMIC_COMPANY_HOURS_STALE_EXPECTED');
  return {uid,code,type,previousActive:current.active.map(row=>str(row[hours.index('OverrideId')])),value};
 }
 throw Error('ATOMIC_COMPANY_SCOPE_TYPE_UNSUPPORTED');
}
function verify(base,body,sources,outcome){
 const cs=dataTable(sources.Company_Scopes,'Company_Scopes'),{uid,code,type}=base;
 if(type==='assign'){
  const found=relations(cs,uid,code);
  if(found.length!==1||!yes(found[0][cs.index('Active')])||
   !/^CS_[A-Za-z0-9]+$/.test(str(found[0][cs.index('Company_Scope_ID')]))||
   !str(found[0][cs.index('Certification_Body_ID')])||outcome?.created!==true)
   throw Error('ATOMIC_COMPANY_SCOPE_ASSIGN_READBACK_MISMATCH');
  return;
 }
 if(type==='save'){
  for(const item of base.checks){
   const found=relations(cs,uid,item.scopeCode);
   if(found.length!==1||(yes(found[0][cs.index('Active')])?'YES':'NO')!==item.target)
    throw Error('ATOMIC_COMPANY_SCOPE_SAVE_READBACK_MISMATCH');
  }
  return;
 }
 if(type==='hours'){
  const found=relations(cs,uid,code);
  if(found.length!==1)throw Error('ATOMIC_COMPANY_SCOPE_RELATION_NOT_UNIQUE');
  const hours=dataTable(sources.Company_Scope_Hours,'Company_Scope_Hours'),
   current=currentOverride({table:cs,row:found[0]},hours,uid,code);
  if(normalizedHours(current.raw)!==base.value)throw Error('ATOMIC_COMPANY_HOURS_READBACK_MISMATCH');
  if(base.value&&!current.active.length)throw Error('ATOMIC_COMPANY_HOURS_ACTIVE_RECORD_MISSING');
  if(!base.value&&current.active.length)throw Error('ATOMIC_COMPANY_HOURS_ACTIVE_RECORD_REMAINS');
  for(const id of base.previousActive){
   const matches=relations(hours,uid,code).filter(row=>str(row[hours.index('OverrideId')])===id);
   if(matches.length!==1)throw Error('ATOMIC_COMPANY_HOURS_OLD_ID_MISSING');
   if(base.value!==normalizedHours(body.expected)&&
      (str(matches[0][hours.index('Status')]).toUpperCase()!=='ENDED'||
       !str(matches[0][hours.index('EffectiveTo')])))
    throw Error('ATOMIC_COMPANY_HOURS_OLD_NOT_ENDED');
  }
 }
}
export function createAtomicCompanyScopesService20({gate,readRows,forward}={}){
 if(!gate||!['acquire','release','uncertain'].every(k=>typeof gate[k]==='function')||
  typeof readRows!=='function'||typeof forward!=='function')
  throw Error('ATOMIC_COMPANY_SCOPES_DEPENDENCIES_INVALID');
 async function commit({actor,path,body,cookie,origin}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||!atomicCompanyScopeRoutes20.includes(path)||
   !body||typeof body!=='object'||Array.isArray(body)||!str(cookie)||!str(origin))
   throw Error('ATOMIC_COMPANY_SCOPES_MANAGER_INPUT_INVALID');
  const type=path.split('/').at(-1),tabs=type==='hours'?['Company_Scopes','Company_Scope_Hours']:['Company_Scopes'];
  const read=async()=>Object.fromEntries(await Promise.all(tabs.map(async tab=>[tab,await readRows(tab)])));
  let lock=null,attempted=false,verified=false;
  try{
   const operationId=hash({actorId:actor.auditorId,path,body});
   lock=await gate.acquire({operationId,actorId:str(actor.auditorId),kind:'ATOMIC_COMPANY_SCOPES'});
   const before=await read(),base=preflight(type,body,before);
   attempted=true;
   const result=await forward({path,body,cookie,origin});
   const after=await read();
   if(result?.status===200&&result.payload?.ok===true)
    verify(base,body,after,result.payload);
   else if(![400,401,403,404,409].includes(result?.status)||hash(before)!==hash(after))
    throw Error('ATOMIC_COMPANY_SCOPES_WRITE_UNCONFIRMED');
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'COMPANY_SCOPES_CANONICAL_READBACK'});
   lock=null;
   return result;
  }finally{
   if(lock){
    if(!attempted||verified)
     await gate.release({token:lock.token,verified:true,proof:attempted?'COMPANY_SCOPES_CANONICAL_READBACK':'COMPANY_SCOPES_NO_WRITE'});
    else await gate.uncertain({token:lock.token,reason:'COMPANY_SCOPES_WRITE_UNCONFIRMED'});
   }
  }
 }
 return Object.freeze({commit});
}
