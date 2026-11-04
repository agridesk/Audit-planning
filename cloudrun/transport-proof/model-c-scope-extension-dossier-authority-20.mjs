/** Fail-closed operational scope dossier. Firestore is the sole mutation authority.
 * A Sheets row never grants Apply or Undo rights by itself.
 */
const str=x=>String(x??'').trim();
const status=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const positiveInt=x=>Number.isSafeInteger(x)&&x>=0;
export function reconcileScopeExtensionDossierAuthority20({companyUid,records,activeLinks,contexts,cutoverVerified=false}={}){
 if(!str(companyUid)||!Array.isArray(records)||!Array.isArray(activeLinks)||!Array.isArray(contexts))throw Error('EXT_DOSSIER_AUTHORITY_INPUT_INVALID');
 const byAudit=new Map();
 for(const link of activeLinks){
  if(!str(link.auditId)||!str(link.obligationId))throw Error('EXT_DOSSIER_ACTIVE_LINK_INVALID');
  const list=byAudit.get(link.auditId)||[];
  if(list.includes(link.obligationId))throw Error('EXT_DOSSIER_ACTIVE_LINK_DUPLICATE');
  list.push(link.obligationId);byAudit.set(link.auditId,list);
 }
 const authority=new Map();
 for(const ctx of contexts){
  if(!str(ctx.auditId)||authority.has(ctx.auditId)||!Array.isArray(ctx.obligations))throw Error('EXT_DOSSIER_CONTEXT_AMBIGUOUS');
  authority.set(ctx.auditId,ctx);
 }
 const out=records.map(row=>{
  const inactive={...row,canMutate:false,canApply:false,canUndo:false,revision:null,extensionTransactionId:null,authority:'READ_ONLY'};
  if(cutoverVerified!==true||!Array.isArray(row.auditIds)||row.auditIds.length!==1)return inactive;
  const auditId=row.auditIds[0],ctx=authority.get(auditId);
  if(!ctx||ctx.companyUid!==companyUid||ctx.lifecycleStatus!=='PENDING_PLANNING')return inactive;
  const sheetSet=byAudit.get(auditId)||[],obligations=ctx.obligations;
  if(!sheetSet.length||sheetSet.length!==obligations.length||new Set(sheetSet).size!==sheetSet.length||obligations.some(o=>!sheetSet.includes(o.obligationId)||o.auditId!==auditId||o.companyUid!==companyUid||o.linkState!=='ACTIVE'||str(o.pendingProjectionId)))return inactive;
  if(!row.auditStatuses?.some(x=>x.auditId===auditId&&status(x.status)==='PENDING_PLANNING'))return inactive;
  const selected=obligations.filter(o=>o.obligationId===row.obligationId);
  if(selected.length!==1)return inactive;
  const ob=selected[0];
  if(ob.scopeCode!==row.scopeCode||!positiveInt(ob.revision)||ob.triggerSource==='ECAS'||ob.expiryManaged===false)return inactive;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(str(ob.effectiveExpiry))||!/^\d{4}-\d{2}-\d{2}$/.test(str(ob.windowFrom))||!/^\d{4}-\d{2}-\d{2}$/.test(str(ob.windowTo)))return inactive;
  const applied=ob.extensionApplied===true;
  let transactionId='';
  try{transactionId=str(JSON.parse(str(ob.extensionMetadata)||'null')?.transactionId)}catch{return inactive}
  const canApply=!applied&&!!ctx.policyByScope?.[ob.scopeCode];
  const canUndo=applied&&!ob.legacyUndoQuarantined&&!!transactionId;
  const usable=canApply||canUndo;
  return{...row,canMutate:usable,canApply,canUndo,revision:ob.revision,auditId,extensionTransactionId:canUndo?transactionId:null,effectiveExpiry:ob.effectiveExpiry,windowFrom:ob.windowFrom,windowTo:ob.windowTo,extensionApplied:applied,authority:usable?'FIRESTORE':'READ_ONLY'};
 });
 return{records:out,canMutate:out.some(x=>x.canMutate),mode:out.some(x=>x.canMutate)?'FIRESTORE_VERIFIED':'READ_ONLY'};
}
