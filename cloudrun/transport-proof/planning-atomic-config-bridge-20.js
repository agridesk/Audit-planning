/** DEV atomic planning cutover: serialized, independently verified configuration writes.
 * These three metadata routes do not mutate canonical Audit planning,
 * Audit_Obligations or planning occupancy claims. Their Sheets tab remains
 * the configuration SSOT; all mutations take the SAME distributed gate as
 * Firestore planning commands and must be read back before unlocking.
 * Never replay a response-unknown command.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const atomicConfigurationRoutes20=Object.freeze([
 '/api/v1/manager/company-management/save',
 '/api/v1/auditor/company-management/save',
 '/api/v1/manager/auditor-management/profile/save',
 '/api/v1/manager/scopes/cosmetic',
 '/api/v1/manager/auditor-management/role/save',
 '/api/v1/manager/auditor-management/active/save'
]);
function input(path,body){
 if(!atomicConfigurationRoutes20.includes(path)||!body||typeof body!=='object'||Array.isArray(body))
  throw Error('ATOMIC_CONFIG_ROUTE_UNSUPPORTED');
 const auditorRole=path.endsWith('/auditor-management/role/save'),
  auditorActive=path.endsWith('/auditor-management/active/save');
 const changes=auditorRole?{Role:{value:body.role,expected:body.expected}}:
  auditorActive?{Active:{value:body.active?'Yes':'No',expected:body.expected?'Yes':'No'}}:
  path.endsWith('/scopes/cosmetic')?{[body.field]:{value:body.value,expected:body.expected}}:body.changes;
 if(auditorActive&&(typeof body.active!=='boolean'||typeof body.expected!=='boolean'))
  throw Error('ATOMIC_CONFIG_ACTIVE_BOOLEAN_REQUIRED');
 if(auditorRole&&(!['Auditor','Manager'].includes(body.role)||!['Auditor','Manager'].includes(body.expected)))
  throw Error('ATOMIC_CONFIG_ROLE_INVALID');
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||
    Object.values(changes).some(x=>!x||typeof x.value!=='string'||typeof x.expected!=='string'))
  throw Error('ATOMIC_CONFIG_CHANGES_INVALID');
 const tab=path.includes('company-management')?'Companies':path.includes('auditor-management')?'Auditors':'Config_Scopes';
 const keyColumn=tab==='Companies'?'Company_UID':tab==='Auditors'?'E-mail':'ScopeCode';
 const key=tab==='Companies'?str(body.companyUid):tab==='Auditors'?str(body.email).toLowerCase():str(body.scopeCode);
 const allowed=tab==='Companies'?new Set(['Contactperson ','Contactperson e-mail','Contactperson phone','Number','Group','Region','Country','Time zone',' Language communication','Manager_Email','Comments','Audit planning limitations - days','Audit planning limitations - hours','Preferred_Audit_Months','Locations_JSON','Auditor_Exclusions','Auditor comments']):tab==='Auditors'?new Set(['Area','Default time zone','Blocked weekdays','Default departure from','Mobile telephone','Role','Active']):new Set(['DisplayName','Color','TextColor','SortOrder']);
 if(path==='/api/v1/auditor/company-management/save'){
  const auditorFields=new Set(['Contactperson ','Contactperson e-mail',
   'Contactperson phone','Auditor comments','Preferred_Audit_Months',
   'Audit planning limitations - days','Audit planning limitations - hours']);
  if(Object.keys(changes).some(field=>!auditorFields.has(field)))
   throw Error('ATOMIC_CONFIG_AUDITOR_FIELD_FORBIDDEN');
 }
 if(tab==='Auditors'&&Object.keys(changes).some(field=>['Role','Active'].includes(field))&&
    !((auditorRole&&Object.keys(changes).length===1&&Object.hasOwn(changes,'Role'))||
      (auditorActive&&Object.keys(changes).length===1&&Object.hasOwn(changes,'Active'))))
  throw Error('ATOMIC_CONFIG_PRIVILEGED_AUDITOR_FIELD_FORBIDDEN');
 if(!key||Object.keys(changes).some(field=>!allowed.has(field)))throw Error('ATOMIC_CONFIG_FIELD_UNSUPPORTED');
 return {tab,keyColumn,key,changes};
}
function sameValue(field,current,expected){
 if(field!=='Active')return str(current)===str(expected);
 const parse=value=>{
  const normalized=str(value).toUpperCase();
  if(['YES','TRUE','1','X'].includes(normalized))return true;
  if(['NO','FALSE','0',''].includes(normalized))return false;
  throw Error('ATOMIC_CONFIG_ACTIVE_VALUE_INVALID');
 };
 return parse(current)===parse(expected);
}
function snapshot(rows,spec){
 if(!Array.isArray(rows)||!Array.isArray(rows[0])||!rows.length||rows.length>2500)
  throw Error('ATOMIC_CONFIG_SOURCE_INVALID');
 const header=rows[0],keyIndex=header.indexOf(spec.keyColumn),fieldIndices=Object.fromEntries(
  Object.keys(spec.changes).map(field=>[field,header.indexOf(field)]));
 if(keyIndex<0||Object.values(fieldIndices).some(i=>i<0))throw Error('ATOMIC_CONFIG_SCHEMA_CHANGED');
 const matches=rows.slice(1).filter(row=>
  (spec.tab==='Auditors'?str(row[keyIndex]).toLowerCase():str(row[keyIndex]))===spec.key);
 if(matches.length!==1)throw Error('ATOMIC_CONFIG_IDENTITY_NOT_UNIQUE');
 const row=matches[0];
 const selected=Object.fromEntries(Object.entries(fieldIndices).map(([field,i])=>[field,str(row[i])]));
 // A rejected write is safe to unlock only if the complete row is unchanged,
 // including coupled metadata and side-effects outside the requested fields.
 return {...selected,__canonicalRowFingerprint:sha(row)};
}
export function createAtomicConfigurationBridge20({gate,readRows,forward}={}){
 if(!gate||typeof gate.acquire!=='function'||typeof gate.release!=='function'||
    typeof gate.uncertain!=='function'||typeof readRows!=='function'||typeof forward!=='function')
  throw Error('ATOMIC_CONFIG_BRIDGE_INVALID');
 async function commit({actor,path,body,cookie,origin}={}){
  if(actor?.role!==(path==='/api/v1/auditor/company-management/save'?'auditor':'manager')||!str(actor.auditorId)||!str(cookie)||!str(origin))
   throw Error('ATOMIC_CONFIG_MANAGER_REQUIRED');
  const spec=input(path,body);
  const actorId=str(actor.auditorId),operationId=sha({actorId,path,body});
  let lock=null,forwarded=false,verified=false;
  try{
   lock=await gate.acquire({operationId,actorId,kind:'ATOMIC_CONFIG_SERIALIZED'});
   // Pre-flight identity and field schema. The R4 route performs its own
   // independent business validation and per-field expected-value CAS.
   const before=snapshot(await readRows(spec.tab),spec);
   // Do not forward a stale mutation: the locked canonical snapshot must
   // agree with every expected field before the legacy writer is entered.
   for(const [field,change] of Object.entries(spec.changes))
    if(!sameValue(field,before[field],change.expected))throw Error('ATOMIC_CONFIG_STALE_EXPECTED_'+field);
   forwarded=true;
   const outcome=await forward({path,body,cookie,origin});
   // A rejection is safe to unlock only if an independent canonical read
   // proves the selected fields unchanged; status codes alone are not proof.
   if([400,401,403,409].includes(outcome?.status)&&outcome.payload?.ok===false){
    const afterRejection=snapshot(await readRows(spec.tab),spec);
    const unchanged=afterRejection.__canonicalRowFingerprint===before.__canonicalRowFingerprint;
    if(unchanged){
     await gate.release({token:lock.token,verified:true,proof:'CONFIG_REJECTED_ROW_UNCHANGED'});
     lock=null;
     return {status:outcome.status,payload:outcome.payload};
    }
   }
   if(outcome?.status!==200||outcome.payload?.ok!==true)
    throw Error('ATOMIC_CONFIG_INNER_WRITE_UNCONFIRMED');
   const values=snapshot(await readRows(spec.tab),spec);
   for(const [field,change]of Object.entries(spec.changes))
    if(!sameValue(field,values[field],change.value))
     throw Error('ATOMIC_CONFIG_READBACK_MISMATCH_'+field);
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'CONFIG_SHEETS_READBACK_VERIFIED'});
   lock=null;
   return {status:200,payload:outcome.payload};
  }finally{
   if(lock){
    if(!forwarded)await gate.release({token:lock.token,verified:true,proof:'CONFIG_NO_WRITE_ATTEMPT'});
    else if(verified)await gate.release({token:lock.token,verified:true,proof:'CONFIG_SHEETS_READBACK_VERIFIED'});
    else await gate.uncertain({token:lock.token,reason:'CONFIG_LEGACY_WRITE_OUTCOME_UNKNOWN'});
   }
  }
 }
 return Object.freeze({commit});
}
