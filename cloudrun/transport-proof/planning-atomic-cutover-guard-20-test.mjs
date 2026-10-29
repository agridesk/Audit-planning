import assert from 'node:assert/strict';
import {enforcePlanningAtomicCutover20,validatePlanningAtomicRuntime20} from './planning-atomic-cutover-guard-20.js';
const blocked=[
 '/api/v1/manager/extension-direct',
 '/api/v1/manager/scopes/scheme-version',
 '/api/v1/manager/auditor-identity/firestore-write-probe',
 '/api/v1/internal/auditor/complete-direct',
 '/api/v1/manager/company-management/scopes/hours',
 '/api/v1/manager/company-management/scopes/assign',
 '/api/v1/manager/company-management/scopes/save',
 '/api/v1/manager/company-management/save',
 '/api/v1/auditor/company-management/save',
 '/api/v1/manager/company-scope-hours/backfill',
 '/api/v1/manager/auditor-management/qualification/save',
 '/api/v1/manager/auditor-management/active/save',
 '/api/v1/manager/scopes/create',
 '/api/v1/manager/scopes/policy',
 '/api/v1/internal/dev-auditor-uid'
];
for(const path of blocked){
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path}),/PLANNING_ATOMIC_WRITER_NOT_MIGRATED/);
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:false,method:'POST',path}));
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:true,method:'GET',path}));
}
for(const path of ['/api/v1/planning/direct-commit','/api/v1/manager/approve-direct','/api/v1/manager/cancel-direct','/api/v1/auditor/action','/api/v1/manager/auditor-management/audit/transfer','/api/v1/planning/atomic-recover']){
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path}));
}
assert.equal(validatePlanningAtomicRuntime20({enabled:false}),true);
const validated={enabled:true,legacyWriterRetired:true,managerOwnerShared:true,backfillParityVerified:true,otherAuthorityEnabled:false};
assert.equal(validatePlanningAtomicRuntime20(validated),true);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,legacyWriterRetired:false}),/PLANNING_ATOMIC_LEGACY_WRITER_NOT_RETIRED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,backfillParityVerified:false}),/PLANNING_ATOMIC_BACKFILL_PARITY_REQUIRED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,otherAuthorityEnabled:true}),/PLANNING_ATOMIC_DUAL_AUTHORITY_ENABLED/);
console.log('Atomic cutover write surface: migration fence and unaffected PROD paths OK');
