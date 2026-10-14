'use strict';
// Maps the actual Log realized audits layout to canonical Completed history.
// All identities and scope-column mappings must come from trusted server sources.
function completedLogRowsFromAms20(values,{resolveAuditorUid,scopeByColumn}={}){
 if(!Array.isArray(values)||!values.length||typeof resolveAuditorUid!=='function'||!scopeByColumn||typeof scopeByColumn!=='object')throw Error('ROTATION_AMS_SOURCE_MISSING');
 const h=values[0].map(v=>String(v||'').trim().toLowerCase().replace(/[\s_-]/g,''));
 const index=(name)=>h.indexOf(name);
 const company=index('companyuid'),auditor=index('auditor'),status=index('status'),date=index('datecompleted'),audit=index('auditid');
 if([company,auditor,status,date,audit].some(i=>i<0))throw Error('ROTATION_AMS_REQUIRED_COLUMN_MISSING');
 const scopeColumns=Object.keys(scopeByColumn);
 if(!scopeColumns.length)throw Error('ROTATION_AMS_SCOPE_MAPPING_MISSING');
 const scopeIndexes=scopeColumns.map(name=>({i:index(name.toLowerCase().replace(/[\s_-]/g,'')),scopeKey:scopeByColumn[name]}));
 if(scopeIndexes.some(x=>x.i<0||!x.scopeKey))throw Error('ROTATION_AMS_SCOPE_MAPPING_INVALID');
 const result=[],auditOwner=new Map();
 for(const row of values.slice(1)){
  if(String(row[status]||'').trim().toLowerCase()!=='completed')continue;
  const companyUid=String(row[company]||'').trim(),auditId=String(row[audit]||'').trim(),completedAt=String(row[date]||'').trim(),rawAuditor=String(row[auditor]||'').trim();
  if(!companyUid||!auditId||!completedAt||!rawAuditor||!Number.isFinite(Date.parse(completedAt)))throw Error('ROTATION_AMS_COMPLETED_ROW_INCOMPLETE');
  const auditorUid=resolveAuditorUid(rawAuditor,completedAt);
  if(typeof auditorUid!=='string'||!auditorUid.trim())throw Error('ROTATION_AMS_AUDITOR_UID_UNRESOLVED');
  const fingerprint=companyUid+'|'+auditorUid;
  if(auditOwner.has(auditId))throw Error('ROTATION_AMS_DUPLICATE_AUDIT_ID');
  auditOwner.set(auditId,fingerprint);
  let found=0;
  for(const {i,scopeKey} of scopeIndexes){
   const v=String(row[i]||'').trim().toUpperCase();
   if(!v||v==='NO'||v==='FALSE'||v==='0')continue;
   if(!['YES','TRUE','1','X'].includes(v))throw Error('ROTATION_AMS_SCOPE_INDICATOR_INVALID');
   result.push({companyUid,auditorUid,auditId,completedAt,status:'Completed',scopeKey});
   found++;
  }
  if(!found)throw Error('ROTATION_AMS_COMPLETED_SCOPE_MISSING');
 }
 return result;
}
module.exports={completedLogRowsFromAms20};
