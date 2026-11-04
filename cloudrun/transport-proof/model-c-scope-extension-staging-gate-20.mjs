/** Review-only partition of a Model C migration plan.
 * Quarantined audit IDs remain recorded as blockers, never silently discarded.
 * No writes, no global cutover approval.
 */
const str=x=>String(x??'').trim();
export function stageScopeExtensionMigration20({plan,quarantineAuditIds=[]}={}){
 if(!plan||plan.readOnly!==true||plan.seedPermitted!==false||!Array.isArray(plan.fatal)||!Array.isArray(plan.documents)||!Array.isArray(plan.auditContexts)||!Array.isArray(quarantineAuditIds))throw Error('EXT_STAGE_INPUT_INVALID');
 const excluded=new Set();
 for(const item of quarantineAuditIds){if(!str(item)||excluded.has(item))throw Error('EXT_STAGE_QUARANTINE_INVALID');excluded.add(item)}
 const failuresByAudit=new Map(),globalFailures=[];
 for(const f of plan.fatal){if(!str(f.auditId)){globalFailures.push(f);continue}let group=failuresByAudit.get(f.auditId)||[];group.push(f);failuresByAudit.set(f.auditId,group)}
 for(const id of excluded)if(!failuresByAudit.has(id))throw Error('EXT_STAGE_QUARANTINE_WITHOUT_MATCHING_FAILURE');
 const outstanding=plan.fatal.filter(x=>!excluded.has(x.auditId));
 const contexts=plan.auditContexts.filter(x=>!excluded.has(x.auditId));
 const docs=plan.documents.filter(x=>!excluded.has(x.auditId));
 const byId=new Map();
 for(const d of docs){if(!str(d.obligationId)||byId.has(d.obligationId))throw Error('EXT_STAGE_DUPLICATE_DOCUMENT');byId.set(d.obligationId,d)}
 const seenAudits=new Set(),referenced=new Set();
 for(const ctx of contexts){
  if(seenAudits.has(ctx.auditId))throw Error('EXT_STAGE_DUPLICATE_AUDIT_CONTEXT');
  seenAudits.add(ctx.auditId);
  if(!str(ctx.auditId)||excluded.has(ctx.auditId)||ctx.writerFenceVerified!==false||!Array.isArray(ctx.obligationIds)||ctx.obligationIds.length<1||ctx.obligationIds.length>100)throw Error('EXT_STAGE_CONTEXT_INVALID');
  if(ctx.obligationIds.some(id=>!byId.has(id)||byId.get(id).auditId!==ctx.auditId||byId.get(id).companyUid!==ctx.companyUid))throw Error('EXT_STAGE_CONTEXT_LINEAGE_MISMATCH');
  for(const id of ctx.obligationIds){if(referenced.has(id))throw Error('EXT_STAGE_DUPLICATE_CONTEXT_OBLIGATION');referenced.add(id)}
 }
 if(contexts.reduce((sum,c)=>sum+c.obligationIds.length,0)!==docs.length)throw Error('EXT_STAGE_ORPHAN_DOCUMENT');
 return{readOnly:true,seedPermitted:false,cutoverApproved:false,eligibleForControlledStaging:outstanding.length===0,quarantinedAudits:[...excluded].map(auditId=>({auditId,reasons:failuresByAudit.get(auditId).map(x=>x.code),automaticRepairAllowed:false})),unresolvedFailures:outstanding,globalFailures,counts:{contexts:contexts.length,obligations:docs.length,quarantinedAudits:excluded.size,unresolvedFailures:outstanding.length},auditContexts:contexts,documents:docs};
}
