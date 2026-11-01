/** DEV Model C extension command boundary.
 * Adapter runAtomic({obligationId, expectedRevision, idempotencyKey, action, actorId,
 * auditId, scopeCode, execute}): transactionally loads current obligation and journal,
 * invokes execute({obligation, priorTransaction}), and commits obligation + immutable
 * event + projection outbox in ONE authoritative datastore transaction.
 * No Sheets writes are permitted inside this boundary.
 * Until a proven adapter exists the command remains unavailable (fail closed).
 */
import {createHash} from 'node:crypto';
import {planScopeExtension20} from './model-c-scope-extension-plan-20.mjs';
const str=v=>String(v??'').trim();
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function createScopeExtensionCommand20({store,policyResolver,contextResolver}={}){
 if(typeof store?.runAtomic!=='function'||typeof policyResolver!=='function'||typeof contextResolver!=='function')throw Error('EXT_ATOMIC_ADAPTER_REQUIRED');
 return async function execute({actor,body}={}){
  if(str(actor?.role).toLowerCase()!=='manager'||!str(actor?.uid))throw Error('EXT_MANAGER_REQUIRED');
  if(!body||!['apply','undo'].includes(body.command)||!str(body.obligationId)||!str(body.auditId)||!str(body.companyUid)||!str(body.requestId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw Error('EXT_COMMAND_INVALID');
  if(body.command==='undo'&&!str(body.extensionTransactionId))throw Error('EXT_UNDO_TRANSACTION_REQUIRED');
  if(body.command==='apply'&&body.extensionTransactionId)throw Error('EXT_UNEXPECTED_TRANSACTION');
  if(['effectiveExpiry','baseExpiry','windowFrom','windowTo','extensionMonths','policyByScope','before','after'].some(x=>Object.hasOwn(body,x)))throw Error('EXT_CLIENT_CALCULATED_FIELDS_FORBIDDEN');
  const ctx=await contextResolver({auditId:body.auditId,companyUid:body.companyUid,obligationId:body.obligationId});
  if(!ctx||ctx.companyUid!==body.companyUid||ctx.auditId!==body.auditId||ctx.lifecycleStatus!=='PENDING_PLANNING'||!Array.isArray(ctx.obligations)||!ctx.obligations.length||ctx.obligations.length>1000)throw Error('EXT_CONTEXT_NOT_ELIGIBLE');
  const selected=ctx.obligations.filter(o=>o.obligationId===body.obligationId);
  if(selected.length!==1||selected[0].linkState!=='ACTIVE'||selected[0].triggerSource==='ECAS'||selected[0].companyUid!==body.companyUid)throw Error('EXT_OBLIGATION_NOT_ELIGIBLE');
  const policy=body.command==='apply'?await policyResolver({scopeCode:selected[0].scopeCode,companyUid:body.companyUid,obligationId:body.obligationId}):null;
  const requestDigest=digest({action:body.command,auditId:body.auditId,companyUid:body.companyUid,obligationId:body.obligationId,extensionTransactionId:body.extensionTransactionId||'',expectedRevision:body.expectedRevision,actorUid:actor.uid});
  return store.runAtomic({
   obligationId:body.obligationId,auditId:body.auditId,scopeCode:selected[0].scopeCode,
   expectedRevision:body.expectedRevision,idempotencyKey:body.requestId,requestDigest,
   action:body.command,actorId:actor.uid,
   execute:({obligation,priorTransaction})=>{
    if(!obligation||obligation.obligationId!==body.obligationId||obligation.companyUid!==body.companyUid||obligation.auditId!==body.auditId||obligation.scopeCode!==selected[0].scopeCode||!Number.isSafeInteger(obligation.revision)||obligation.revision!==body.expectedRevision)throw Error('EXT_STALE_OR_MISMATCHED_OBLIGATION');
    if(body.command==='undo'&&priorTransaction?.transactionId!==body.extensionTransactionId)throw Error('EXT_UNDO_TRANSACTION_CONFLICT');
    const snapshot=ctx.obligations.map(o=>o.obligationId===body.obligationId?{...o,...obligation}:o);
    const plan=planScopeExtension20({auditId:body.auditId,lifecycleStatus:ctx.lifecycleStatus,command:body.command,targets:[body.obligationId],obligations:snapshot,policyByScope:policy?{[selected[0].scopeCode]:policy}:{},actorUid:actor.uid,transactionId:body.requestId,priorTransaction});
    const change=plan.changes[0];
    return {obligationId:body.obligationId,expectedRevision:body.expectedRevision,nextRevision:body.expectedRevision+1,after:change.after,before:change.before,transaction:{transactionId:body.requestId,requestDigest,action:body.command,auditId:body.auditId,companyUid:body.companyUid,scopeCode:selected[0].scopeCode,obligationId:body.obligationId,actorUid:actor.uid,before:change.before,after:change.after,priorTransactionId:body.extensionTransactionId||null},outbox:{type:'SCOPE_EXTENSION_PROJECTION',obligationId:body.obligationId,auditId:body.auditId,revision:body.expectedRevision+1,aggregate:plan.aggregate}};
   }
  });
 };
}
