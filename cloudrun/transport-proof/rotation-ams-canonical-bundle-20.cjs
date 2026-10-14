'use strict';
const {scopeSlotsFromConfig20}=require('./rotation-config-scope-slots-20.cjs');
const {loadRotationPolicies20}=require('./rotation-config-policy-loader-20.cjs');
const {strictAmsCompletedHistory20}=require('./rotation-ams-strict-source-20.cjs');
function loadAmsRotationBundle20({scopeRows,completedRows,resolveAuditorUid}={}){
 const scopeByColumn=scopeSlotsFromConfig20(scopeRows);
 const policies=loadRotationPolicies20(scopeRows);
 for(const policy of policies){if(scopeByColumn[policy.slotKey]!==policy.scopeKey)throw Error('ROTATION_BUNDLE_SCOPE_POLICY_MISMATCH');}
 const completedAudits=strictAmsCompletedHistory20(completedRows,{scopeByColumn,resolveAuditorUid});
 return {scopePolicies:policies.map(({scopeKey,normalMaximum,rotationApplies,extensionPermitted})=>({scopeKey,normalMaximum,rotationApplies,extensionPermitted})),completedAudits};
}
module.exports={loadAmsRotationBundle20};
