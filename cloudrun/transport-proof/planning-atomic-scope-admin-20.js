/** Serialized DEV cutover for Scope Management's existing canonical Sheets writer.
 * The R4 domain handlers retain business validation; this service protects
 * their writes with the same global fence and independently verifies effects.
 * Never retry a response-unknown mutation. Never release an uncertain write.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const atomicScopeAdminRoutes20=Object.freeze([
 '/api/v1/manager/scopes/scheme-version',
 '/api/v1/manager/scopes/policy',
 '/api/v1/manager/scopes/create',
 '/api/v1/manager/scopes/hours-version'
]);
const routeType=path=>path.split('/').at(-1);
const bool=x=>{const s=str(x).toUpperCase();return ['TRUE','YES','1','X'].includes(s)?true:
 ['FALSE','NO','0',''].includes(s)?false:null;};
function table(rows,tab){
 if(!Array.isArray(rows)||!Array.isArray(rows[0])||!rows.length||
    rows.length>=(tab==='ScopeVersions'?1000:128))throw Error('ATOMIC_SCOPE_SOURCE_TRUNCATED_'+tab);
 const headers=rows[0].map(str);
 return {rows,headers,column:name=>headers.indexOf(name)};
}
function findScope(t,code,{missing=false}={}){
 const id=t.column('ScopeCode');
 if(id<0)throw Error('ATOMIC_SCOPE_CODE_SCHEMA_MISSING');
 const matches=t.rows.slice(1).filter(row=>str(row[id])===code);
 if(missing){if(matches.length)throw Error('ATOMIC_SCOPE_ALREADY_EXISTS');return null;}
 if(matches.length!==1)throw Error('ATOMIC_SCOPE_NOT_UNIQUE');
 return matches[0];
}
function scopeValue(t,row,field){
 const i=t.column(field);
 if(i<0)throw Error('ATOMIC_SCOPE_FIELD_SCHEMA_MISSING_'+field);
 return str(row[i]);
}
function versionRecords(t,code){
 const ci=t.column('ScopeCode'),vi=t.column('VersionId'),si=t.column('Status'),
  hi=t.column('Hours_to_plan'),ei=t.column('Effective_To');
 if([ci,vi,si,hi,ei].some(x=>x<0))throw Error('ATOMIC_SCOPE_VERSION_SCHEMA_MISSING');
 return t.rows.slice(1).filter(r=>str(r[ci])===code).map(r=>({
  id:str(r[vi]),status:str(r[si]).toUpperCase(),hours:Number(str(r[hi]).replace(',','.')),
  effectiveTo:str(r[ei])
 }));
}
function comparable(field,a,b){
 if(['Active','Archived','Rotation_Applies','Rotation_Plus_One_Permitted','Recurring'].includes(field)){
  const x=bool(a),y=bool(b);
  if(x===null||y===null)throw Error('ATOMIC_SCOPE_BOOLEAN_INVALID_'+field);
  return x===y;
 }
 // Sheets may render numeric policy values without a redundant trailing zero.
 if(['Max number audits','Min_Interval_Months','Max_Offsite_Hours','Rotation_Normal_Maximum','Extension','Planning from','Planning to','Default_hours'].includes(field)&&str(a)!==''&&str(b)!==''){
  const x=Number(a),y=Number(b);
  return Number.isFinite(x)&&Number.isFinite(y)&&x===y;
 }
 return str(a)===str(b);
}
function preflight(type,body,tables){
 const code=str(body?.scopeCode),config=table(tables.Config_Scopes,'Config_Scopes');
 if(!code||code.length>80)throw Error('ATOMIC_SCOPE_CODE_INVALID');
 if(type==='create'){
  findScope(config,code,{missing:true});
  return {type,code};
 }
 const scope=findScope(config,code);
 if(type==='scheme-version'){
  const vi=21,header=config.headers[vi]||'';
  if(!['','Official_Scheme_Version'].includes(header))throw Error('ATOMIC_SCOPE_VERSION_COLUMN_CONFLICT');
  const current=str(scope[vi]);
  if(current!==str(body.expected))throw Error('ATOMIC_SCOPE_SCHEME_STALE_EXPECTED');
  return {type,code,current};
 }
 if(type==='policy'){
  const field=str(body.field),before=scopeValue(config,scope,field);
  if(!comparable(field,before,body.expected))throw Error('ATOMIC_SCOPE_POLICY_STALE_EXPECTED');
  return {type,code,field,before};
 }
 if(type==='hours-version'){
  const versions=versionRecords(table(tables.ScopeVersions,'ScopeVersions'),code);
  const current=versions.filter(x=>x.status==='CURRENT');
  if(current.length>1)throw Error('ATOMIC_SCOPE_DUPLICATE_CURRENT_VERSION');
  const wanted=str(body.expectedVersion);
  if(wanted==='UNINITIALIZED'){
   if(current.length||versions.length||scopeValue(config,scope,'Default_hours')!=='')
    throw Error('ATOMIC_SCOPE_ALREADY_INITIALIZED');
  }else if(current.length!==1||current[0].id!==wanted)
   throw Error('ATOMIC_SCOPE_HOURS_STALE_EXPECTED');
  return {type,code,current:current[0]||null};
 }
 throw Error('ATOMIC_SCOPE_ROUTE_UNSUPPORTED');
}
function verify(type,body,before,after,outcome){
 const config=table(after.Config_Scopes,'Config_Scopes'),code=before.code;
 const scope=findScope(config,code);
 if(type==='create'){
  if(!outcome?.slotKey||scopeValue(config,scope,'SlotKey')!==str(outcome.slotKey)||
   scopeValue(config,scope,'DisplayName')!==str(body.displayName)||
   scopeValue(config,scope,'Certification_Body_ID')!==str(body.certificationBodyId)||
   bool(scopeValue(config,scope,'Active'))!==false)
   throw Error('ATOMIC_SCOPE_CREATE_READBACK_MISMATCH');
  return;
 }
 if(type==='scheme-version'){
  if(config.headers[21]!=='Official_Scheme_Version'||str(scope[21])!==str(body.version).toUpperCase())
   throw Error('ATOMIC_SCOPE_SCHEME_VERSION_READBACK_MISMATCH');
  return;
 }
 if(type==='policy'){
  const field=before.field;
  if(!comparable(field,scopeValue(config,scope,field),body.value))
   throw Error('ATOMIC_SCOPE_POLICY_READBACK_MISMATCH');
  if(field==='Rotation_Normal_Maximum'&&!comparable('Max number audits',scopeValue(config,scope,'Max number audits'),body.value))
   throw Error('ATOMIC_SCOPE_ROTATION_MIRROR_READBACK_MISMATCH');
  return;
 }
 if(type==='hours-version'){
  const requested=Number(str(body.hours).replace(',','.'));
  if(!Number.isFinite(requested)||!comparable('Default_hours',scopeValue(config,scope,'Default_hours'),requested))
   throw Error('ATOMIC_SCOPE_HOURS_CATALOG_READBACK_MISMATCH');
  const versions=versionRecords(table(after.ScopeVersions,'ScopeVersions'),code),
   current=versions.filter(x=>x.status==='CURRENT');
  if(current.length!==1||current[0].id!==str(outcome?.versionId)||current[0].hours!==requested)
   throw Error('ATOMIC_SCOPE_HOURS_VERSION_READBACK_MISMATCH');
  if(before.current&&before.current.id!==current[0].id){
   const historical=versions.filter(x=>x.id===before.current.id);
   if(historical.length!==1||historical[0].status!=='HISTORICAL'||!historical[0].effectiveTo)
    throw Error('ATOMIC_SCOPE_HOURS_ARCHIVE_READBACK_MISMATCH');
  }
  return;
 }
 throw Error('ATOMIC_SCOPE_ROUTE_UNSUPPORTED');
}
export function createAtomicScopeAdminService20({gate,readRows,forward}={}){
 if(!gate||!['acquire','release','uncertain'].every(k=>typeof gate[k]==='function')||
  typeof readRows!=='function'||typeof forward!=='function')throw Error('ATOMIC_SCOPE_DEPENDENCIES_INVALID');
 async function commit({actor,path,body,cookie,origin}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||!atomicScopeAdminRoutes20.includes(path)||
   !body||typeof body!=='object'||Array.isArray(body)||!str(cookie)||!str(origin))
   throw Error('ATOMIC_SCOPE_MANAGER_INPUT_INVALID');
  const type=routeType(path),tabs=type==='hours-version'?['Config_Scopes','ScopeVersions']:['Config_Scopes'];
  let lock=null,attempted=false,verified=false;
  const op=digest({actorId:actor.auditorId,path,body});
  const read=async()=>Object.fromEntries(await Promise.all(tabs.map(async tab=>[tab,await readRows(tab)])));
  try{
   lock=await gate.acquire({operationId:op,actorId:str(actor.auditorId),kind:'ATOMIC_SCOPE_ADMIN_SERIALIZED'});
   const beforeRows=await read(),base=preflight(type,body,beforeRows);
   attempted=true;
   const result=await forward({path,body,cookie,origin});
   const afterRows=await read();
   if(result?.status===200&&result.payload?.ok===true)
    verify(type,body,base,afterRows,result.payload);
   else if(![400,401,403,409].includes(result?.status)||digest(beforeRows)!==digest(afterRows))
    throw Error('ATOMIC_SCOPE_WRITE_UNCONFIRMED');
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'SCOPE_ADMIN_CANONICAL_READBACK'});
   lock=null;
   return result;
  }finally{
   if(lock){
    if(!attempted||verified)await gate.release({token:lock.token,verified:true,proof:attempted?'SCOPE_ADMIN_CANONICAL_READBACK':'SCOPE_ADMIN_NO_WRITE_ATTEMPT'});
    else await gate.uncertain({token:lock.token,reason:'SCOPE_ADMIN_WRITE_UNCONFIRMED'});
   }
  }
 }
 return Object.freeze({commit});
}
