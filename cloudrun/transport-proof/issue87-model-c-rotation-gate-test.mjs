import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {enforceDirectPlanningRotation20}=require('./rotation-direct-plan-gate-20.cjs');
const config=[['SlotKey','ScopeCode'],['SCOPE_01','GAP'],['SCOPE_02','GRASP']];
const planning=[['Audit ID','Company_UID','SCOPE_01','SCOPE_02'],['audit-1','company-1','X','']];
const auditors=[['Auditor_UID'],['uid-1']];
const args={auditId:'audit-1',auditorUid:'uid-1',planningValues:planning,
 auditorValues:auditors,scopeValues:config,logValues:[['Audit ID']],
 approvedExceptions:[],canonicalScopeKeys:['GAP','GRASP']};
await assert.rejects(enforceDirectPlanningRotation20({...args,canonicalScopeKeys:['GAP','GAP']}),
 /ROTATION_MODEL_C_SCOPE_OVERRIDE_INVALID/);
await assert.rejects(enforceDirectPlanningRotation20({...args,canonicalScopeKeys:['GAP','UNKNOWN']}),
 /ROTATION_MODEL_C_SCOPE_OVERRIDE_UNKNOWN/);
await assert.rejects(enforceDirectPlanningRotation20({...args,canonicalScopeKeys:[]}),
 /ROTATION_MODEL_C_SCOPE_OVERRIDE_INVALID/);
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
assert.ok(r4.includes("canonicalScopeKeys:together?together.scopeAllocation.obligations.map(x=>x.scopeCode):null"),
 'Together rotation gate uses fully validated obligation scope codes');
assert.ok(r4.includes("const rotationCheck=await directRotationRead(auditId,auditorEmail,together?together.scopeAllocation.obligations.map(x=>x.scopeCode):null)"),
 'Together legacy rotation check also uses Model C scope codes');
console.log('Issue #87 Model C rotation scope override: invalid sources denied; server wire verified');
