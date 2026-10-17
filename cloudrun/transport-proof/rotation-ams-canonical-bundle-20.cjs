'use strict';
const {scopeSlotsFromConfig20}=require('./rotation-config-scope-slots-20.cjs');
const {loadRotationPolicies20}=require('./rotation-config-policy-loader-20.cjs');
const {strictAmsCompletedHistory20}=require('./rotation-ams-strict-source-20.cjs');
function loadAmsRotationBundle20({scopeRows,completedRows,resolveAuditorUid}={}){
 const scopeByColumn=scopeSlotsFromConfig20(scopeRows);
 const policies=loadRotationPolicies20(scopeRows);
 if(policies.length>Object.keys(scopeByColumn).length)throw Error('ROTATION_BUNDLE_POLICY_COVERAGE_INCOMPLETE');
 const headers=scopeRows[0].map(x=>String(x??'').trim().toLowerCase().replace(/[\s_-]/g,''));
 const slotIndex=headers.indexOf('slotkey'),activeIndex=headers.indexOf('active'),archivedIndex=headers.indexOf('archived');
 const configured=new Set(policies.map(p=>p.slotKey));
 for(const row of scopeRows.slice(1)){
  const slot=String(row[slotIndex]??'').trim();
  if(!Object.prototype.hasOwnProperty.call(scopeByColumn,slot)||configured.has(slot))continue;
  const active=activeIndex<0?true:['true','yes'].includes(String(row[activeIndex]??'').trim().toLowerCase());
  const archived=archivedIndex<0?false:['true','yes'].includes(String(row[archivedIndex]??'').trim().toLowerCase());
  if(active&&!archived)throw Error('ROTATION_BUNDLE_ACTIVE_POLICY_MISSING:'+slot);
 }
 for(const policy of policies){if(scopeByColumn[policy.slotKey]!==policy.scopeKey)throw Error('ROTATION_BUNDLE_SCOPE_POLICY_MISMATCH');}
 const completedAudits=strictAmsCompletedHistory20(completedRows,{scopeByColumn,resolveAuditorUid});
 return {scopePolicies:policies.map(({scopeKey,normalMaximum,rotationApplies,extensionPermitted})=>({scopeKey,normalMaximum,rotationApplies,extensionPermitted})),completedAudits};
}
module.exports={loadAmsRotationBundle20};
