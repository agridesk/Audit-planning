/** Pure Model C scope extension projection; no writes and no legacy date authority. */
const value=x=>String(x??'').trim();
const date=x=>{const s=value(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return'';const [y,m,d]=s.split('-').map(Number);return m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate()?s:'';};
export function projectScopeExtensions20({auditId,obligations,companyUid}={}){
 if(!value(auditId)||!value(companyUid)||!Array.isArray(obligations)||!obligations.length)throw Error('EXT_PROJECTION_INPUT_INVALID');
 const relevant=obligations.filter(x=>x?.auditId===auditId&&x.linkState==='ACTIVE'&&x.triggerSource!=='ECAS');
 if(!relevant.length)throw Error('EXT_PROJECTION_NO_OBLIGATIONS');
 const ids=new Set(),scopes=[];
 for(const o of relevant){
  if(o.companyUid!==companyUid||!value(o.obligationId)||ids.has(o.obligationId)||!value(o.scopeCode))throw Error('EXT_PROJECTION_LINEAGE_INVALID');
  ids.add(o.obligationId);
  const base=date(o.baseExpiry),effective=date(o.effectiveExpiry),from=date(o.windowFrom),to=date(o.windowTo);
  if(!base||!effective||!from||!to||from>to)throw Error('EXT_PROJECTION_DATES_INVALID');
  scopes.push({obligationId:o.obligationId,scopeCode:o.scopeCode,baseExpiry:base,effectiveExpiry:effective,windowFrom:from,windowTo:to,extensionApplied:o.extensionApplied===true,revision:o.revision,extensionTransactionId:(()=>{try{return JSON.parse(o.extensionMetadata||'null')?.transactionId||'';}catch{throw Error('EXT_PROJECTION_METADATA_INVALID');}})()});
 }
 scopes.sort((a,b)=>a.scopeCode.localeCompare(b.scopeCode)||a.obligationId.localeCompare(b.obligationId));
 const earliestExpiry=scopes.map(x=>x.effectiveExpiry).sort()[0];
 const windowFrom=scopes.map(x=>x.windowFrom).sort().at(-1),windowTo=scopes.map(x=>x.windowTo).sort()[0];
 const jointWindow=windowFrom<=windowTo?{from:windowFrom,to:windowTo}:null;
 return {auditId,companyUid,scopeCount:scopes.length,scopes,aggregate:{earliestExpiry,jointWindow,requiresSeparatePlanning:!jointWindow,extensionAppliedCount:scopes.filter(x=>x.extensionApplied).length,expiryProvenance:'MODEL_C_ACTIVE_OBLIGATIONS'}};
}
