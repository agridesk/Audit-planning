/** Atomic DEV cutover bridge for Auditor management's governed writers.
 * Keeps existing R4 business decisions, but serializes four entry points
 * with the planning fence and independent canonical readback.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const flag=x=>['X','YES','TRUE','1'].includes(str(x).toUpperCase());
export const atomicAuditorGovernanceRoutes20=Object.freeze([
 '/api/v1/manager/auditor-management/qualification/withdraw',
 '/api/v1/manager/auditor-management/qualification/withdraw/cancel',
 '/api/v1/manager/auditor-management/qualification/save',
 '/api/v1/manager/auditor-management/create'
]);
function typeOf(path){
 if(path.endsWith('/withdraw/cancel'))return 'withdrawCancel';
 if(path.endsWith('/withdraw'))return 'withdraw';
 if(path.endsWith('/qualification/save'))return 'qualification';
 if(path.endsWith('/create'))return 'create';
 throw Error('ATOMIC_AUDITOR_ROUTE_UNSUPPORTED');
}
function table(rows,tab){
 const limit=tab==='Auditors'?1000:tab==='Config_Scopes'?200:2000;
 if(!Array.isArray(rows)||!Array.isArray(rows[0])||!rows.length||rows.length>=limit)
  throw Error('ATOMIC_AUDITOR_SOURCE_TRUNCATED_'+tab);
 const h=rows[0].map(str),col=x=>h.indexOf(x);
 return {rows,h,col};
}
function auditorByEmail(t,email,{missing=false}={}){
 const e=t.col('E-mail')>=0?t.col('E-mail'):t.col('Email');
 if(e<0)throw Error('ATOMIC_AUDITOR_EMAIL_SCHEMA_MISSING');
 const found=t.rows.slice(1).filter(r=>str(r[e]).toLowerCase()===email);
 if(missing){if(found.length)throw Error('ATOMIC_AUDITOR_EMAIL_ALREADY_EXISTS');return null;}
 if(found.length!==1)throw Error('ATOMIC_AUDITOR_IDENTITY_NOT_UNIQUE');
 return found[0];
}
function policies(t,row){
 const i=t.col('Qualification_Withdrawals_JSON');
 if(i<0)throw Error('ATOMIC_AUDITOR_WITHDRAWAL_SCHEMA_MISSING');
 let value;try{value=JSON.parse(str(row[i])||'[]');}catch{throw Error('ATOMIC_AUDITOR_WITHDRAWAL_JSON_CORRUPT');}
 if(!Array.isArray(value))throw Error('ATOMIC_AUDITOR_WITHDRAWAL_JSON_INVALID');
 return value;
}
function qualificationIndex(aud,config,code){
 const ci=config.col('ScopeCode'),di=config.col('DisplayName'),si=config.col('SlotKey');
 if([ci,di,si].some(i=>i<0))throw Error('ATOMIC_AUDITOR_SCOPE_SCHEMA_MISSING');
 const scopes=config.rows.slice(1).filter(r=>str(r[ci])===code);
 if(scopes.length!==1)throw Error('ATOMIC_AUDITOR_SCOPE_NOT_UNIQUE');
 for(const label of [code,str(scopes[0][di]),str(scopes[0][si])]){
  if(label&&aud.col(label)>=0)return aud.col(label);
 }
 throw Error('ATOMIC_AUDITOR_QUALIFICATION_COLUMN_MISSING');
}
function preflight(kind,body,data){
 const email=str(body?.email).toLowerCase();
 if(!email||email.length>254)throw Error('ATOMIC_AUDITOR_EMAIL_INVALID');
 const aud=table(data.Auditors,'Auditors');
 if(kind==='create'){
  auditorByEmail(aud,email,{missing:true});
  const name=str(body?.name).toLowerCase(),ni=aud.col('Name');
  if(ni<0||!name||aud.rows.slice(1).some(r=>str(r[ni]).toLowerCase()===name))
   throw Error('ATOMIC_AUDITOR_NAME_CONFLICT');
  const versions=table(data.Auditor_Identity_Versions,'Auditor_Identity_Versions'),
   vi=versions.col('Email_Normalized');
  if(vi<0||versions.rows.slice(1).some(r=>str(r[vi]).toLowerCase()===email))
   throw Error('ATOMIC_AUDITOR_ALIAS_CONFLICT');
  return {kind,email,name};
 }
 const row=auditorByEmail(aud,email);
 if(kind==='qualification'){
  if(typeof body.qualified!=='boolean'||typeof body.expected!=='boolean')
   throw Error('ATOMIC_AUDITOR_QUALIFICATION_INPUT_INVALID');
  const code=str(body.scopeCode),index=qualificationIndex(aud,table(data.Config_Scopes,'Config_Scopes'),code);
  if(flag(row[index])!==body.expected)throw Error('ATOMIC_AUDITOR_QUALIFICATION_STALE_EXPECTED');
  return {kind,email,code,index,qualified:body.qualified};
 }
 const code=str(body?.scopeCode),existing=policies(aud,row),
  matching=existing.filter(p=>str(p?.scopeCode)===code);
 if(!code||code.length>100||matching.length>1)throw Error('ATOMIC_AUDITOR_WITHDRAWAL_INPUT_INVALID');
 if(kind==='withdraw'){
  if(matching.length)throw Error('ATOMIC_AUDITOR_WITHDRAWAL_ALREADY_EXISTS');
  if(!Array.isArray(body.grandfatheredAuditIds)||!str(body.effectiveDate))
   throw Error('ATOMIC_AUDITOR_WITHDRAWAL_INPUT_INVALID');
  return {kind,email,code};
 }
 if(matching.length!==1||str(matching[0].effectiveDate)!==str(body.expectedEffectiveDate))
  throw Error('ATOMIC_AUDITOR_WITHDRAWAL_STALE_EXPECTED');
 return {kind,email,code,remaining:existing.filter(p=>str(p?.scopeCode)!==code)};
}
function verify(base,body,data,outcome){
 const aud=table(data.Auditors,'Auditors'),row=auditorByEmail(aud,base.email);
 if(base.kind==='create'){
  const uidCol=aud.col('Auditor_UID')>=0?aud.col('Auditor_UID'):aud.col('Auditor UID'),
   uid=uidCol>=0?str(row[uidCol]):'';
  if(!uid||str(row[aud.col('Name')]).toLowerCase()!==base.name||
   flag(row[aud.col('Active')])!==false||str(row[aud.col('Role')])!=='Auditor')
   throw Error('ATOMIC_AUDITOR_CREATE_READBACK_MISMATCH');
  const versions=table(data.Auditor_Identity_Versions,'Auditor_Identity_Versions'),
   ei=versions.col('Email_Normalized'),ui=versions.col('Auditor_UID'),si=versions.col('State');
  if([ei,ui,si].some(i=>i<0))throw Error('ATOMIC_AUDITOR_VERSION_SCHEMA_MISSING');
  const found=versions.rows.slice(1).filter(r=>str(r[ei]).toLowerCase()===base.email);
  if(found.length!==1||str(found[0][ui])!==uid||str(found[0][si]).toUpperCase()!=='ACTIVE'||
   outcome?.active!==false)throw Error('ATOMIC_AUDITOR_VERSION_READBACK_MISMATCH');
  return;
 }
 if(base.kind==='qualification'){
  if(flag(row[base.index])!==base.qualified)
   throw Error('ATOMIC_AUDITOR_QUALIFICATION_READBACK_MISMATCH');
  return;
 }
 const after=policies(aud,row),found=after.filter(p=>str(p?.scopeCode)===base.code);
 if(base.kind==='withdraw'){
  if(found.length!==1||str(found[0].effectiveDate)!==str(body.effectiveDate)||
   str(found[0].trailId)!==str(outcome?.trailId)||
   !Array.isArray(found[0].grandfatheredAuditIds)||
   JSON.stringify([...found[0].grandfatheredAuditIds].sort())!==
   JSON.stringify([...body.grandfatheredAuditIds].sort()))
   throw Error('ATOMIC_AUDITOR_WITHDRAWAL_READBACK_MISMATCH');
 }else if(found.length||JSON.stringify(after)!==JSON.stringify(base.remaining))
  throw Error('ATOMIC_AUDITOR_WITHDRAWAL_CANCEL_READBACK_MISMATCH');
}
export function createAtomicAuditorGovernanceService20({gate,readRows,forward}={}){
 if(!gate||!['acquire','release','uncertain'].every(k=>typeof gate[k]==='function')||
  typeof readRows!=='function'||typeof forward!=='function')
  throw Error('ATOMIC_AUDITOR_GOVERNANCE_DEPENDENCIES_INVALID');
 async function commit({actor,path,body,cookie,origin}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||!atomicAuditorGovernanceRoutes20.includes(path)||
   !body||typeof body!=='object'||Array.isArray(body)||!str(cookie)||!str(origin))
   throw Error('ATOMIC_AUDITOR_GOVERNANCE_INPUT_INVALID');
  const kind=typeOf(path),tabs=['Auditors'];
  if(kind==='qualification')tabs.push('Config_Scopes');
  if(kind==='create')tabs.push('Auditor_Identity_Versions');
  const read=async()=>Object.fromEntries(await Promise.all(tabs.map(async tab=>[tab,await readRows(tab)])));
  let lock=null,attempted=false,verified=false;
  try{
   lock=await gate.acquire({operationId:hash({actorId:actor.auditorId,path,body}),
    actorId:str(actor.auditorId),kind:'ATOMIC_AUDITOR_GOVERNANCE'});
   const before=await read(),base=preflight(kind,body,before);
   attempted=true;
   const outcome=await forward({path,body,cookie,origin});
   const after=await read();
   if(outcome?.status===200&&outcome.payload?.ok===true)
    verify(base,body,after,outcome.payload);
   else if(![400,401,403,409].includes(outcome?.status)||hash(before)!==hash(after))
    throw Error('ATOMIC_AUDITOR_GOVERNANCE_WRITE_UNCONFIRMED');
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'AUDITOR_GOVERNANCE_CANONICAL_READBACK'});
   lock=null;
   return outcome;
  }finally{
   if(lock){
    if(!attempted||verified)
     await gate.release({token:lock.token,verified:true,proof:attempted?'AUDITOR_GOVERNANCE_CANONICAL_READBACK':'AUDITOR_GOVERNANCE_NO_WRITE'});
    else await gate.uncertain({token:lock.token,reason:'AUDITOR_GOVERNANCE_WRITE_UNCONFIRMED'});
   }
  }
 }
 return Object.freeze({commit});
}
