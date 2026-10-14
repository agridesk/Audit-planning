'use strict';
// Diagnostic only. Column names must be explicitly supplied by canonical governance.
// Never interpret certificate Extension or Max number audits as rotation limits.
const normalize=x=>String(x||'').trim().toLowerCase().replace(/[\s_-]/g,'');
function inspectRotationPolicySource20(configRows,policyColumnNames){
 if(!Array.isArray(configRows)||!Array.isArray(configRows[0]))throw Error('ROTATION_CONFIG_SCOPES_MISSING');
 const headers=configRows[0].map(normalize);
 const required=['SlotKey','ScopeCode',...(policyColumnNames||[])];
 if(!Array.isArray(policyColumnNames)||policyColumnNames.length!==3||policyColumnNames.some(x=>!x||!String(x).trim()))throw Error('ROTATION_POLICY_COLUMN_CONTRACT_MISSING');
 const requiredKeys=required.map(normalize);
 if(new Set(requiredKeys).size!==requiredKeys.length)throw Error('ROTATION_POLICY_COLUMN_CONTRACT_DUPLICATE');
 const missing=required.filter((name,i)=>headers.filter(h=>h===requiredKeys[i]).length!==1);
 if(missing.length)return {ready:false,reason:'ROTATION_POLICY_COLUMNS_MISSING',missing};
 const ix=requiredKeys.map(k=>headers.indexOf(k));
 const rows=configRows.slice(1).filter(row=>/^SCOPE_0[1-8]$/.test(String(row[ix[0]]||'').trim()));
 if(rows.length!==8||new Set(rows.map(row=>String(row[ix[0]]).trim())).size!==8)return {ready:false,reason:'ROTATION_POLICY_SCOPE_ROWS_INCOMPLETE'};
 for(const row of rows){
  const max=String(row[ix[2]]||'').trim();
  const applies=String(row[ix[3]]||'').trim().toLowerCase();
  const extension=String(row[ix[4]]||'').trim().toLowerCase();
  if(!['true','false','yes','no'].includes(applies)||!['true','false','yes','no'].includes(extension)||((applies==='true'||applies==='yes')&&!/^[1-9]\d*$/.test(max)))return {ready:false,reason:'ROTATION_POLICY_VALUES_INCOMPLETE'};
 }
 return {ready:true,reason:null};
}
module.exports={inspectRotationPolicySource20};
