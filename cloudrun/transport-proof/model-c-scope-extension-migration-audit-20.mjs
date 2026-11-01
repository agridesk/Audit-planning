/** Read-only legacy extension provenance classifier. Never writes or reconstructs missing originals. */
const str=x=>String(x??'').trim();
const isDate=x=>{const v=str(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);return y>0&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate();};
export function inspectLegacyScopeExtensions20({obligations}={}){
 if(!Array.isArray(obligations))throw Error('EXT_MIGRATION_INPUT_INVALID');
 const seen=new Set(),report=[];
 for(const item of obligations){
  const obligationId=str(item?.obligationId),companyUid=str(item?.companyUid),scopeCode=str(item?.scopeCode);
  if(!obligationId||seen.has(obligationId)||!companyUid||!scopeCode)throw Error('EXT_MIGRATION_LINEAGE_INVALID');
  seen.add(obligationId);
  const base=isDate(item.baseExpiry),effective=isDate(item.effectiveExpiry),from=isDate(item.windowFrom),to=isDate(item.windowTo);
  let status='READY_UNEXTENDED',reason='NO_EXTENSION';
  if(!base||!effective||!from||!to||str(item.windowFrom)>str(item.windowTo)){status='MIGRATION_REVIEW_REQUIRED';reason='INVALID_OR_MISSING_SCOPE_DATES';}
  else if(item.extensionApplied===true){
   let metadata=null;
   try{metadata=JSON.parse(str(item.extensionMetadata)||'null');}catch{}
   const prior=metadata?.prior;
   if(!str(metadata?.transactionId)||!prior||!isDate(prior.effectiveExpiry)||!isDate(prior.baseExpiry)||!isDate(prior.windowFrom)||!isDate(prior.windowTo)||!str(metadata.actorUid)){
    status='MIGRATION_REVIEW_REQUIRED';reason='NO_VERIFIABLE_PER_OBLIGATION_BEFORE';
   }else{
    status='REQUIRES_TRANSACTION_RECONCILIATION';reason='BEFORE_PRESENT_BUT_JOURNAL_UNVERIFIED';
   }
  }else if(str(item.extensionMetadata)){
   status='MIGRATION_REVIEW_REQUIRED';reason='INACTIVE_WITH_EXTENSION_METADATA';
  }
  if(str(item.triggerSource).toUpperCase()==='ECAS'){status='EXTERNAL_SOURCE_READ_ONLY';reason='ECAS_OWNED';}
  report.push({obligationId,companyUid,scopeCode,status,reason,automaticUndoAllowed:false});
 }
 const summary=report.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
 return{total:report.length,summary,records:report,readOnly:true,automaticUndoEnabled:false};
}
