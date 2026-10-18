// AMS Notifications 2.0 email-action flow: backend-only, injection-safe.
// No routing, persistence or canonical lifecycle writes here.
// The provided executeAtomically adapter MUST enforce atomic token consumption + canonical write.
import {hashActionToken,authorizeAction,validateActionInput} from './notification-email-action-policy-20.mjs';

const DENIED=Object.freeze({ok:false,error:'ACTION_UNAVAILABLE'});
export async function processEmailAction20({method,token,environment,input={},services}) {
  const verb=String(method||'').toUpperCase();
  if(!['GET','POST'].includes(verb)) return {ok:false,error:'METHOD_NOT_ALLOWED'};
  if(!services || typeof services.currentSession!=='function' ||
    typeof services.findByTokenHash!=='function' ||
    typeof services.currentAudit!=='function' ||
    typeof services.actorCapability!=='function') throw Error('EMAIL_ACTION_SERVICES_MISSING');
  let digest;
  try{digest=hashActionToken(token);}catch{return DENIED;}
  // Token records are never searched by raw token, recipient email or caller-supplied UID.
  const actor=await services.currentSession();
  // Logged-in user identity comes exclusively from server session, never query/body.
  if(!actor || !actor.uid || String(actor.role).toUpperCase()!=='AUDITOR')return {ok:false,error:'AUTHENTICATION_REQUIRED'};
  const record=await services.findByTokenHash(digest);
  if(!record)return DENIED;
  // Validate stored record shape before reaching the audit source.
  if (!record.auditId || !record.auditorUid || !record.action || !record.environment) return DENIED;
  const audit=await services.currentAudit(record.auditId);
  if(!audit || audit.auditId!==record.auditId || !audit.auditorUid || !((typeof audit.revision==='string' && audit.revision.length>0 && audit.revision.length<=256) || (Number.isSafeInteger(audit.revision) && audit.revision>=0)))return DENIED;
  // Lookup and capability queries are read-only even on GET; never expose details to unauthorized users.
  if (typeof services.assertReadOnly==='function') await services.assertReadOnly();
  const capability=await services.actorCapability(actor,audit,record.action);
  const result=authorizeAction({
    record,token,environment,
    auditorUid:audit.auditorUid,
    auditId:audit.auditId,
    action:record.action,
    status:audit.status,
    revision:audit.revision,
    authenticatedActorUid:actor.uid,
    authenticatedRole:actor.role,
    actorAuthorized:capability===true,
    deviceTrusted:actor.deviceTrusted===true,
    deviceVerified:actor.deviceVerified===true
  });
  if(result!=='OK')return {ok:false,error:result};
  if(verb==='GET'){
    // GET must not consume token or trigger any persistence.
    return {ok:true,readOnly:true,requiresConfirmation:true,
      auditId:audit.auditId,action:record.action,status:audit.status,revision:audit.revision};
  }
  if(input.confirmed!==true)return {ok:false,error:'CONFIRMATION_REQUIRED'};
  if (!input || typeof input!=='object' || Array.isArray(input)) return {ok:false,error:'INVALID_INPUT'};
  const invalid=validateActionInput(record.action,input);
  if(invalid!=='OK')return {ok:false,error:invalid};
  if(typeof services.executeAtomically!=='function')throw Error('ATOMIC_CANONICAL_WRITER_REQUIRED');
  // Adapter must recheck actor, action capability, revision and token freshness under one
  // serialization/transaction boundary; consume the token only upon successful write.
  // Idempotency key must be stable for identical token retries; adapters must not derive it from caller input.
  return await services.executeAtomically({tokenHash:digest,record,actor,
    auditId:audit.auditId,action:record.action,expectedRevision:audit.revision,input});
}
