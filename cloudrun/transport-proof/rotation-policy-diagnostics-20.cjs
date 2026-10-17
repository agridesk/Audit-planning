'use strict';
const {scopeSlotsFromConfig20}=require('./rotation-config-scope-slots-20.cjs');
const {loadRotationPolicies20}=require('./rotation-config-policy-loader-20.cjs');
function diagnoseRotationConfig20(values){
 const findings=[];
 if(!Array.isArray(values)||!Array.isArray(values[0]))return {ready:false,findings:['CONFIG_SCOPES_MISSING']};
 const normalized=values[0].map(x=>String(x??'').trim().toLowerCase().replace(/[\s_-]/g,''));
 for(const key of ['slotkey','scopecode','rotationapplies','rotationnormalmaximum','rotationplusonepermitted']){
  const n=normalized.filter(x=>x===key).length;
  if(n!==1)findings.push((n===0?'MISSING_HEADER:':'DUPLICATE_HEADER:')+key);
 }
 if(findings.length)return {ready:false,findings};
 let slots,policies;
 try{slots=scopeSlotsFromConfig20(values)}catch(e){findings.push(e.message)}
 try{policies=loadRotationPolicies20(values)}catch(e){findings.push(e.message)}
 if(slots&&policies){
  const expected=new Set(Object.keys(slots));
  const actual=new Set(policies.map(x=>x.slotKey));
  for(const slot of expected)if(!actual.has(slot))findings.push('MISSING_POLICY:'+slot);
  for(const slot of actual)if(!expected.has(slot))findings.push('ORPHAN_POLICY:'+slot);
  for(const p of policies)if(slots[p.slotKey]!==p.scopeKey)findings.push('POLICY_SCOPE_MISMATCH:'+p.slotKey);
 }
 return {ready:findings.length===0,findings,scopeCount:slots?Object.keys(slots).length:0,policyCount:policies?policies.length:0,rotationApplicableCount:policies?policies.filter(p=>p.rotationApplies).length:0,plusOnePermittedCount:policies?policies.filter(p=>p.extensionPermitted).length:0};
}
module.exports={diagnoseRotationConfig20};
