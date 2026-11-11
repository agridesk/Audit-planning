import assert from 'node:assert/strict';
import {deriveVisitSplitIdentity20 as derive} from './visit-composition-identity-20.mjs';
const input={sourceAuditId:'AUDIT_2026_A',obligationId:'OBL_123',sourceRevision:'a'.repeat(24)};
const first=derive(input),second=derive({...input});
assert.equal(first.auditId,second.auditId);
assert.equal(first.sourceAuditId,input.sourceAuditId);
assert.equal(first.identityIssuedBy,'CANONICAL');
assert.equal(first.identityIssueRevision,input.sourceRevision);
assert.equal(first.requiresFirestoreCreateCAS,true);
assert.equal(first.writeEnabled,false);
assert.notEqual(first.auditId,derive({...input,obligationId:'OBL_456'}).auditId);
assert.notEqual(first.auditId,derive({...input,sourceRevision:'b'.repeat(24)}).auditId);
assert.equal(first.auditId.length<=180,true);
for(const update of [
 {sourceAuditId:''},{sourceAuditId:'bad/audit'},{sourceAuditId:'..'},
 {sourceAuditId:'x'.repeat(141)},{obligationId:''},{obligationId:'bad/obligation'},
 {obligationId:'x'.repeat(181)},{sourceRevision:'bad'}
]){
 assert.throws(()=>derive({...input,...update}),/COMPOSITION_IDENTITY_SOURCE_INVALID/);
}
console.log('VISIT_COMPOSITION_CANONICAL_IDENTITY_20_PASS: deterministic new IDs, revision isolation, identity safety; no issuance');
