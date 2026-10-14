'use strict';
const {canonicalRotationContexts}=require('./rotation-source-adapter-20');
// Adapter for actual Log realized audits sheet rows; missing canonical fields fail closed.
// No fallback to company display names, auditor names or calendar-year grouping.
function completedLogRows20(values,scopeAliases){
 if(!Array.isArray(values)||!values.length||!scopeAliases||typeof scopeAliases!=='object')throw Error('ROTATION_LOG_SOURCE_MISSING');
 const h=values[0].map(x=>String(x||'').trim().toLowerCase().replace(/[\s_-]/g,''));
 const ix=(...names)=>h.findIndex(x=>names.includes(x));
 const ci=ix('companyuid'),ai=ix('auditoruid'),di=ix('auditid'),dt=ix('completeddate','completiondate','auditdate','date'),st=ix('status'),sc=ix('scope','scopecode','scopes');
 if([ci,ai,di,dt,st,sc].some(i=>i<0))throw Error('ROTATION_LOG_CANONICAL_COLUMNS_MISSING');
 const result=[];
 for(const row of values.slice(1)){
  const status=String(row[st]||'').trim().toLowerCase();
  if(status!=='completed')continue;
  const companyUid=String(row[ci]||'').trim(),auditorUid=String(row[ai]||'').trim(),auditId=String(row[di]||'').trim(),completedAt=String(row[dt]||'').trim();
  if(!companyUid||!auditorUid||!auditId||!completedAt)throw Error('ROTATION_LOG_COMPLETED_IDENTITY_MISSING');
  const raw=String(row[sc]||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!raw.length)throw Error('ROTATION_LOG_COMPLETED_SCOPE_MISSING');
  for(const key of raw){
   const scopeKey=scopeAliases[key];
   if(!scopeKey)throw Error('ROTATION_LOG_SCOPE_ALIAS_UNRESOLVED');
   result.push({companyUid,auditorUid,auditId,completedAt,status:'Completed',scopeKey});
  }
 }
 return result;
}
module.exports={completedLogRows20};
