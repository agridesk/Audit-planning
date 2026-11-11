import assert from 'node:assert/strict';
import {validateCompositionClientProposal20 as check} from './visit-composition-client-proposal-20.mjs';
const rev='a'.repeat(24);
const together={auditId:'A-1',companyUid:'C-1',sourceRevision:rev,mode:'TOGETHER',
 blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}],
 allocations:[{blockIndex:0,obligationId:'O-1',start:'08:00',end:'16:00'}]};
const separate={auditId:'A-1',companyUid:'C-1',sourceRevision:rev,mode:'SEPARATELY',
 visits:[{obligationId:'O-1',auditorUid:'A-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]}]};
assert.equal(check(together).authoritative,false);
assert.equal(check(separate).writeEnabled,false);
assert.equal(check({...separate,visits:undefined}).valid,true);
assert.equal(check({...together,requestNonce:'safe-nonce_99'}).valid,true);
const reject=(body,code)=>assert.throws(()=>check(body),e=>e?.code===code,code);
for(const prop of ['proof','authorityPreflight','entities','expectedRevision','projectionWrites',
 'projectionPreconditions','appendIntents','writerVerified','canonicalSnapshot','sourceEvidence',
 'appendRowNumbers','planningAppendRowNumbers','identityIssuedBy','sourceRows']){
 reject({...together,[prop]:true},'COMPOSITION_CLIENT_AUTHORITY_FIELDS_FORBIDDEN');
}
reject({...separate,visits:[{...separate.visits[0],auditId:'CLIENT_TARGET'}]},'COMPOSITION_CLIENT_VISIT_AUTHORITY_FORBIDDEN');
reject({...separate,visits:[{...separate.visits[0],identityIssueRevision:rev}]},'COMPOSITION_CLIENT_VISIT_AUTHORITY_FORBIDDEN');
reject({...together,blocks:[{...together.blocks[0],sourceRevision:rev}]},'COMPOSITION_CLIENT_BLOCK_FIELDS_INVALID');
reject({...together,allocations:[{...together.allocations[0],projectionRange:'Companies!A1'}]},'COMPOSITION_CLIENT_ALLOCATION_FIELDS_INVALID');
reject({...separate,blocks:[]},'COMPOSITION_CLIENT_MODE_FIELDS_INVALID');
reject({...together,visits:separate.visits},'COMPOSITION_CLIENT_MODE_FIELDS_INVALID');
reject({...together,sourceRevision:'INVALID'},'COMPOSITION_CLIENT_IDENTITY_INVALID');
reject({...together,requestNonce:'../bad'},'COMPOSITION_CLIENT_NONCE_INVALID');
console.log('VISIT_COMPOSITION_CLIENT_PROPOSAL_20_PASS: no client proof, link identity or Sheets writes; both modes');
