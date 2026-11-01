import assert from 'node:assert/strict';
import {diagnoseRotationUid20} from './rotation-uid-reconciliation-20.mjs';
const auditors=[['Auditor_UID','Email'],['U1','new@example.invalid']];
const completed=[['Auditor_UID','Auditor','Completed Date'],['U1','old@example.invalid','2025-01-01'],['','old@example.invalid','2024-01-01'],['U2','other@example.invalid','2023-01-01']];
const r=diagnoseRotationUid20(auditors,completed);
assert.equal(r.missingUidCount,1);assert.equal(r.unknownUidCount,1);
assert.equal(r.missing[0].sourceRow,3);assert.equal(r.unknown[0].sourceRow,4);
assert.equal(r.canRepairAutomatically,false);
console.log('Rotation UID reconciliation diagnostic OK');
