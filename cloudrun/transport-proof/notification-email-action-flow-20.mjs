// AMS Notifications 2.0: internal mail actions use the existing Authentication 2.0 session.
// No email action credentials, token storage, device trust shortcut or legacy login.
import {validateActionInput,auditorEmailActionAllowed} from './notification-email-action-policy-20.mjs';

const VALID_ROLES=new Set(['AUDITOR','MANAGER']);
const VALID_ACTIONS=new Set(['ACCEPT','APPROVE','CANCEL','COMPLETE']);
const validRevision=r=>(typeof r==='string'&&r.length>0&&r.length<=256)||(Number.isSafeInteger(r)&&r>=0);
export async function processEmailAction20({method,auditId,action,environment,input={},services}) {
 const verb=String(method||'').toUpperCase(),requested=String(action||'').toUpperCase();
 if(!['GET','POST'].includes(verb))return {ok:false,error:'METHOD_NOT_ALLOWED'};
 if(!auditId||typeof auditId!=='string'||auditId.length>256||!VALID_ACTIONS.has(requested))return {ok:false,error:'INVALID_ACTION'};
 if(!services||typeof services.currentSession!=='function'||typeof services.currentAudit!=='function'||typeof services.actorCapability!=='function'||typeof services.runtimeEnvironment!=='function')throw Error('EMAIL_ACTION_SERVICES_MISSING');
 const actor=await services.currentSession();
 if(!actor||!actor.auditorId||!VALID_ROLES.has(String(actor.role||'').toUpperCase()))return {ok:false,error:'AUTHENTICATION_REQUIRED'};
 const env=String(environment||'').toUpperCase();
 if(!['DEV','PROD'].includes(env)||String(await services.runtimeEnvironment()).toUpperCase()!==env)return {ok:false,error:'ENVIRONMENT_MISMATCH'};
 const audit=await services.currentAudit(auditId);
 if(!audit||audit.auditId!==auditId||!validRevision(audit.revision))return {ok:false,error:'AUDIT_UNAVAILABLE'};
 const role=String(actor.role).toUpperCase();
 if(role==='AUDITOR'&&(!audit.auditorUid||actor.auditorId!==audit.auditorUid))return {ok:false,error:'FORBIDDEN'};
 const permitted=await services.actorCapability(actor,audit,requested);
 if(permitted!==true)return {ok:false,error:'FORBIDDEN'};
 if(role==='AUDITOR'&&!auditorEmailActionAllowed(requested,audit.status,audit.origin))return {ok:false,error:'ACTION_NOT_ALLOWED'};
 if(verb==='GET')return {ok:true,readOnly:true,requiresConfirmation:true,auditId,action:requested,status:audit.status,revision:audit.revision};
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,error:'INVALID_INPUT'};
 if(input.confirmed!==true)return {ok:false,error:'CONFIRMATION_REQUIRED'};
 if(requested!=='APPROVE'){
  const validity=validateActionInput(requested,input);
  if(validity!=='OK')return {ok:false,error:validity};
 }
 if(typeof services.executeCanonical!=='function')throw Error('CANONICAL_WRITER_REQUIRED');
 // Writer MUST revalidate session/capability/status/revision and serialize the mutation.
 return services.executeCanonical({actor,auditId,action:requested,expectedRevision:audit.revision,input});
}
