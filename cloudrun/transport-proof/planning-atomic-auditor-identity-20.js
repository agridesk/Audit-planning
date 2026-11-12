/** Atomic DEV Auditor identity edit bridge.
 * A change of email crosses Auditors, UID versions, Audit planning and tokens.
 * The existing R4 Firestore identity lock and domain validator remain mandatory.
 * This outer planning fence only releases after independent multi-table proof.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const atomicAuditorIdentityRoute20='/api/v1/manager/auditor-management/identity/save';
function table(rows,tab){
 const limit={Auditors:1000,Auditor_Identity_Versions:2000,
  'Audit planning':2500,Auditor_Tokens:1024}[tab];
 if(!limit||!Array.isArray(rows)||!Array.isArray(rows[0])||!rows.length||rows.length>=limit)
  throw Error('ATOMIC_AUDITOR_IDENTITY_SOURCE_TRUNCATED_'+tab);
 const h=rows[0].map(str),col=k=>h.indexOf(k);
 return {rows,h,col};
}
function oneAuditor(t,email){
 const ec=t.col('E-mail')>=0?t.col('E-mail'):t.col('Email');
 if(ec<0)throw Error('ATOMIC_AUDITOR_IDENTITY_EMAIL_SCHEMA_MISSING');
 const found=t.rows.slice(1).filter(row=>str(row[ec]).toLowerCase()===email);
 if(found.length!==1)throw Error('ATOMIC_AUDITOR_IDENTITY_NOT_UNIQUE');
 return found[0];
}
function baseState(body,data){
 const email=str(body?.email).toLowerCase(),name=str(body?.name),
  newEmail=str(body?.newEmail).toLowerCase(),newName=str(body?.newName);
 if(!email||!name||!newEmail||!newName||name.length>160||newName.length>160)
  throw Error('ATOMIC_AUDITOR_IDENTITY_INPUT_INVALID');
 const aud=table(data.Auditors,'Auditors'),row=oneAuditor(aud,email),
  nc=aud.col('Name'),uc=aud.col('Auditor_UID')>=0?aud.col('Auditor_UID'):aud.col('Auditor UID');
 if(nc<0||uc<0||str(row[nc])!==name)throw Error('ATOMIC_AUDITOR_IDENTITY_STALE_EXPECTED');
 const uid=str(row[uc]);if(!uid)throw Error('ATOMIC_AUDITOR_UID_MISSING');
 if(newEmail!==email&&newName!==name)throw Error('ATOMIC_AUDITOR_EMAIL_AND_NAME_CHANGE_SEPARATELY');
 if(aud.rows.slice(1).some(r=>r!==row&&(str(r[nc]).toLowerCase()===newName.toLowerCase()||
  str(r[aud.col('E-mail')>=0?aud.col('E-mail'):aud.col('Email')]).toLowerCase()===newEmail)))
  throw Error('ATOMIC_AUDITOR_IDENTITY_TARGET_ALREADY_USED');
 if(newEmail===email)return {email,name,newEmail,newName,uid,emailChanged:false};
 const versions=table(data.Auditor_Identity_Versions,'Auditor_Identity_Versions'),
  vi=versions.col('Email_Normalized'),ui=versions.col('Auditor_UID'),state=versions.col('State');
 if([vi,ui,state].some(i=>i<0))throw Error('ATOMIC_AUDITOR_VERSION_SCHEMA_MISSING');
 const active=versions.rows.slice(1).filter(r=>str(r[ui])===uid&&str(r[vi]).toLowerCase()===email&&str(r[state]).toUpperCase()==='ACTIVE');
 if(active.length!==1||versions.rows.slice(1).some(r=>str(r[vi]).toLowerCase()===newEmail&&str(r[state]).toUpperCase()!=='CANCELLED'))
  throw Error('ATOMIC_AUDITOR_VERSION_STALE_OR_RESERVED');
 const planning=table(data['Audit planning'],'Audit planning'),
  assigned=planning.col('Assigned to'),puid=planning.col('Auditor_UID')>=0?planning.col('Auditor_UID'):planning.col('Auditor UID');
 if(assigned<0||puid<0)throw Error('ATOMIC_AUDITOR_PLANNING_SCHEMA_MISSING');
 const affected=planning.rows.slice(1).filter(r=>str(r[puid])===uid&&str(r[assigned]).toLowerCase()===email).length;
 if(planning.rows.slice(1).some(r=>str(r[assigned]).toLowerCase()===email&&str(r[puid])!==uid))
  throw Error('ATOMIC_AUDITOR_PLANNING_UID_CONFLICT');
 const tokens=table(data.Auditor_Tokens,'Auditor_Tokens'),
  te=tokens.col('Email'),role=tokens.col('Role'),revoked=tokens.col('Revoked');
 if([te,role,revoked].some(i=>i<0))throw Error('ATOMIC_AUDITOR_TOKENS_SCHEMA_MISSING');
 const oldTokens=tokens.rows.slice(1).filter(r=>str(r[te]).toLowerCase()===email&&str(r[role]).toLowerCase()==='auditor').length;
 return {email,name,newEmail,newName,uid,emailChanged:true,affected,oldTokens};
}
function verify(base,data,outcome){
 const aud=table(data.Auditors,'Auditors'),row=oneAuditor(aud,base.newEmail),
  nc=aud.col('Name'),uc=aud.col('Auditor_UID')>=0?aud.col('Auditor_UID'):aud.col('Auditor UID');
 if(uc<0||str(row[uc])!==base.uid||str(row[nc])!==base.newName)
  throw Error('ATOMIC_AUDITOR_IDENTITY_PROFILE_READBACK_MISMATCH');
 if(!base.emailChanged)return;
 const versions=table(data.Auditor_Identity_Versions,'Auditor_Identity_Versions'),
  vi=versions.col('Email_Normalized'),ui=versions.col('Auditor_UID'),
  state=versions.col('State'),to=versions.col('Valid_To_UTC');
 if([vi,ui,state,to].some(i=>i<0))throw Error('ATOMIC_AUDITOR_VERSION_SCHEMA_MISSING');
 const old=versions.rows.slice(1).filter(r=>str(r[ui])===base.uid&&str(r[vi]).toLowerCase()===base.email),
  current=versions.rows.slice(1).filter(r=>str(r[ui])===base.uid&&str(r[vi]).toLowerCase()===base.newEmail&&str(r[state]).toUpperCase()==='ACTIVE');
 if(current.length!==1||old.filter(r=>str(r[state]).toUpperCase()==='EXPIRED'&&str(r[to])).length!==1||
  versions.rows.slice(1).filter(r=>str(r[ui])===base.uid&&str(r[state]).toUpperCase()==='ACTIVE').length!==1)
  throw Error('ATOMIC_AUDITOR_IDENTITY_VERSION_READBACK_MISMATCH');
 const planning=table(data['Audit planning'],'Audit planning'),
  assigned=planning.col('Assigned to'),pu=planning.col('Auditor_UID')>=0?planning.col('Auditor_UID'):planning.col('Auditor UID');
 if(assigned<0||pu<0||planning.rows.slice(1).some(r=>str(r[pu])===base.uid&&str(r[assigned]).toLowerCase()!==base.newEmail)||
  planning.rows.slice(1).some(r=>str(r[assigned]).toLowerCase()===base.email))
  throw Error('ATOMIC_AUDITOR_IDENTITY_PLANNING_READBACK_MISMATCH');
 const tokens=table(data.Auditor_Tokens,'Auditor_Tokens'),
  te=tokens.col('Email'),role=tokens.col('Role'),revoked=tokens.col('Revoked');
 if([te,role,revoked].some(i=>i<0))throw Error('ATOMIC_AUDITOR_TOKENS_SCHEMA_MISSING');
 const previous=tokens.rows.slice(1).filter(r=>str(r[te]).toLowerCase()===base.email&&str(r[role]).toLowerCase()==='auditor');
 if(previous.length!==base.oldTokens||previous.some(r=>!['TRUE','YES','1'].includes(str(r[revoked]).toUpperCase())))
  throw Error('ATOMIC_AUDITOR_IDENTITY_TOKEN_READBACK_MISMATCH');
 if(Number(outcome?.updatedAssignments)!==base.affected||Number(outcome?.revokedTokens)!==base.oldTokens)
  throw Error('ATOMIC_AUDITOR_IDENTITY_ACK_COUNT_MISMATCH');
}
export function createAtomicAuditorIdentityService20({gate,readRows,forward}={}){
 if(!gate||!['acquire','release','uncertain'].every(k=>typeof gate[k]==='function')||
  typeof readRows!=='function'||typeof forward!=='function')
  throw Error('ATOMIC_AUDITOR_IDENTITY_DEPENDENCIES_INVALID');
 async function commit({actor,path,body,cookie,origin}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||path!==atomicAuditorIdentityRoute20||
   !body||typeof body!=='object'||Array.isArray(body)||!str(cookie)||!str(origin))
   throw Error('ATOMIC_AUDITOR_IDENTITY_INPUT_INVALID');
  const tabs=['Auditors','Auditor_Identity_Versions','Audit planning','Auditor_Tokens'];
  const read=async()=>Object.fromEntries(await Promise.all(tabs.map(async tab=>[tab,await readRows(tab)])));
  let lock=null,attempted=false,verified=false;
  try{
   lock=await gate.acquire({operationId:hash({actorId:actor.auditorId,path,body}),
    actorId:str(actor.auditorId),kind:'ATOMIC_AUDITOR_IDENTITY'});
   const before=await read(),base=baseState(body,before);
   attempted=true;
   const outcome=await forward({path,body,cookie,origin});
   const after=await read();
   if(outcome?.status===200&&outcome.payload?.ok===true)
    verify(base,after,outcome.payload);
   else if(![400,401,403,409].includes(outcome?.status)||hash(before)!==hash(after))
    throw Error('ATOMIC_AUDITOR_IDENTITY_WRITE_UNCONFIRMED');
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'AUDITOR_IDENTITY_MULTI_SOURCE_READBACK'});
   lock=null;
   return outcome;
  }finally{
   if(lock){
    if(!attempted||verified)
     await gate.release({token:lock.token,verified:true,proof:attempted?'AUDITOR_IDENTITY_MULTI_SOURCE_READBACK':'AUDITOR_IDENTITY_NO_WRITE'});
    else await gate.uncertain({token:lock.token,reason:'AUDITOR_IDENTITY_WRITE_UNCONFIRMED'});
   }
  }
 }
 return Object.freeze({commit});
}
