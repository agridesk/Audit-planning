'use strict';
// Strict Rotation 2.0 policy loader from Config_Scopes; no certificate-column fallback.
const norm=x=>String(x||'').trim().toLowerCase().replace(/[\s_-]/g,'');
function loadRotationPolicies20(values){
 if(!Array.isArray(values)||!Array.isArray(values[0]))throw Error('ROTATION_POLICY_SOURCE_MISSING');
 const h=values[0].map(norm);
 const names=['SlotKey','ScopeCode','Rotation_Normal_Maximum','Rotation_Applies','Rotation_Plus_One_Permitted'];
 const indexes=names.map(x=>h.indexOf(norm(x)));
 if(indexes.some((i,j)=>i<0||h.filter(x=>x===norm(names[j])).length!==1))throw Error('ROTATION_POLICY_HEADERS_MISSING');
 const [slot,code,max,applies,plusOne]=indexes;
 const parseBoolean=v=>{const s=String(v??'').trim().toLowerCase();if(['true','yes'].includes(s))return true;if(['false','no'].includes(s))return false;throw Error('ROTATION_POLICY_BOOLEAN_UNRESOLVED')};
 const policies=[],seen=new Set(),codes=new Set();
 for(const row of values.slice(1)){
  const key=String(row[slot]||'').trim();
  if(!/^SCOPE_0[1-8]$/.test(key))continue;
  const scopeKey=String(row[code]||'').trim();
  if(!scopeKey||seen.has(key)||codes.has(scopeKey))throw Error('ROTATION_POLICY_SCOPE_INVALID');
  seen.add(key);codes.add(scopeKey);
  const rotationApplies=parseBoolean(row[applies]);
  const extensionPermitted=parseBoolean(row[plusOne]);
  const raw=String(row[max]??'').trim();
  if(rotationApplies&&!/^[1-9]\d*$/.test(raw))throw Error('ROTATION_POLICY_MAXIMUM_UNRESOLVED');
  const normalMaximum=rotationApplies?Number(raw):null;
  if(rotationApplies&&!Number.isSafeInteger(normalMaximum))throw Error('ROTATION_POLICY_MAXIMUM_UNRESOLVED');
  if(!rotationApplies&&extensionPermitted)throw Error('ROTATION_POLICY_INCONSISTENT_EXEMPTION');
  policies.push({slotKey:key,scopeKey,rotationApplies,normalMaximum,extensionPermitted});
 }
 if(policies.length!==8)throw Error('ROTATION_POLICY_EIGHT_SCOPES_REQUIRED');
 return policies;
}
module.exports={loadRotationPolicies20};
