/** Atomic cutover adapter for existing single-cell notification administration.
 * Does not change the GAS business validator or Sheets ownership.
 * The global planning fence stays UNCERTAIN after any ambiguous write.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const contract=Object.freeze({
 rule:{tab:'Notification_Rules',keyColumn:'RULE_KEY',valueColumn:'VALUE',operation:'updateRule'},
 devMode:{tab:'System_Config',keyColumn:'SETTING_KEY',valueColumn:'DEV',operation:'updateDevMode'}
});
const normalize=x=>str(x).toUpperCase().replace(/[^A-Z0-9]/g,'');
function sourceSnapshot(rows,definition,key){
 if(!Array.isArray(rows)||!rows.length||rows.length>=500||!Array.isArray(rows[0]))
  throw Error('ATOMIC_NOTIFICATION_SOURCE_UNBOUNDED');
 const headers=rows[0].map(normalize),keyIndex=headers.indexOf(normalize(definition.keyColumn)),
  valueIndex=headers.indexOf(normalize(definition.valueColumn));
 if(keyIndex<0||valueIndex<0)throw Error('ATOMIC_NOTIFICATION_SCHEMA_MISSING');
 const matches=rows.slice(1).filter(row=>normalize(row[keyIndex])===normalize(key));
 if(matches.length!==1)throw Error('ATOMIC_NOTIFICATION_KEY_NOT_UNIQUE');
 return {value:str(matches[0][valueIndex]),fingerprint:hash(matches[0])};
}
export function createAtomicNotificationScalarService20({gate,readRows,forward}={}){
 if(!gate||!['acquire','release','uncertain'].every(k=>typeof gate[k]==='function')||
  typeof readRows!=='function'||typeof forward!=='function')
  throw Error('ATOMIC_NOTIFICATION_SCALAR_DEPENDENCIES_INVALID');
 async function commit({actor,kind,key,value,expected}={}){
  const definition=contract[kind];
  if(actor?.role!=='manager'||!str(actor.auditorId)||!definition||!str(key)||
   typeof value!=='string'||typeof expected!=='string')throw Error('ATOMIC_NOTIFICATION_SCALAR_INPUT_INVALID');
  let lock=null,attempted=false,verified=false;
  const operationId=hash({actorId:actor.auditorId,kind,key,value,expected});
  try{
   lock=await gate.acquire({operationId,actorId:str(actor.auditorId),kind:'ATOMIC_NOTIFICATION_SCALAR'});
   const before=sourceSnapshot(await readRows(definition.tab),definition,key);
   if(before.value!==expected)throw Error('ATOMIC_NOTIFICATION_SCALAR_STALE_EXPECTED');
   attempted=true;
   const data=await forward({kind,key,value,expected,operation:definition.operation});
   const after=sourceSnapshot(await readRows(definition.tab),definition,key);
   if(data?.ok===true){
    if(after.value!==value)throw Error('ATOMIC_NOTIFICATION_SCALAR_READBACK_MISMATCH');
   }else if(after.fingerprint!==before.fingerprint)
    throw Error('ATOMIC_NOTIFICATION_SCALAR_REJECTED_WRITE_UNCERTAIN');
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'NOTIFICATION_SCALAR_CANONICAL_READBACK'});
   lock=null;
   return data;
  }finally{
   if(lock){
    if(!attempted||verified)await gate.release({token:lock.token,verified:true,proof:attempted?'NOTIFICATION_SCALAR_CANONICAL_READBACK':'NOTIFICATION_SCALAR_NO_WRITE'});
    else await gate.uncertain({token:lock.token,reason:'NOTIFICATION_SCALAR_WRITE_UNCONFIRMED'});
   }
  }
 }
 return Object.freeze({commit});
}
