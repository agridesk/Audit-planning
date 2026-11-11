import assert from 'node:assert/strict';
import {previewVisitComposition20 as preview} from './visit-composition-preview-20.mjs';
const base=()=>({auditId:'AUD-123',companyUid:'COMP-1',obligations:[
 {obligationId:'OB-1',scopeCode:'MPS-GAP',formalHours:8,auditId:'AUD-123',companyUid:'COMP-1',linkState:'ACTIVE',obligationState:'OPEN'},
 {obligationId:'OB-2',scopeCode:'GRASP',formalHours:3,auditId:'AUD-123',companyUid:'COMP-1',linkState:'ACTIVE',obligationState:'LINKED_TO_VISIT'}
]});
const invalid=(alter,code)=>{const b=base();alter(b);assert.throws(()=>preview(b),e=>e.code===code,code);};
invalid(b=>{},'COMPOSITION_EXPLICIT_CHOICE_REQUIRED');
const together=preview({...base(),mode:'TOGETHER'});
assert.equal(together.totalRequiredMinutes,660);
assert.equal(together.obligationCount,2);
assert.equal(together.requiresExplicitPerBlockAllocation,true);
assert.equal(together.requiresCanonicalVisitSplit,false);
assert.equal(together.canCommit,false);
const separate=preview({...base(),mode:'SEPARATELY'});
assert.equal(separate.requiresCanonicalVisitSplit,true);
assert.equal(separate.requiresExplicitPerBlockAllocation,false);
assert.equal(separate.canCommit,false);
invalid(b=>{b.auditId='';b.mode='TOGETHER'},'COMPOSITION_SOURCE_IDENTITY_REQUIRED');
invalid(b=>{b.obligations=[];b.mode='TOGETHER'},'COMPOSITION_MODEL_C_OBLIGATIONS_MISSING');
invalid(b=>{b.obligations[1].obligationId='OB-1';b.mode='TOGETHER'},'COMPOSITION_DUPLICATE_OBLIGATION_LINK');
invalid(b=>{b.obligations[1].companyUid='OTHER';b.mode='TOGETHER'},'COMPOSITION_COMPANY_UID_MISMATCH');
invalid(b=>{b.obligations[1].auditId='OTHER';b.mode='TOGETHER'},'COMPOSITION_LINK_OWNERSHIP_MISMATCH');
invalid(b=>{b.obligations[1].linkState='INACTIVE';b.mode='TOGETHER'},'COMPOSITION_LINK_NOT_ACTIVE');
invalid(b=>{b.obligations[1].obligationState='COMPLETED';b.mode='TOGETHER'},'COMPOSITION_TERMINAL_OBLIGATION');
invalid(b=>{b.obligations[1].formalHours=0;b.mode='TOGETHER'},'COMPOSITION_REQUIRED_HOURS_INVALID');
invalid(b=>{b.obligations[1].formalHours=1/7;b.mode='TOGETHER'},'COMPOSITION_REQUIRED_HOURS_NOT_MINUTE_ALIGNED');
invalid(b=>{b.mode='LATER'},'COMPOSITION_UNSUPPORTED_MODE');
const single=base();single.obligations.pop();
assert.equal(preview(single).mode,'SINGLE');
assert.equal(preview(single).compositionRequired,false);
assert.throws(()=>preview({...single,mode:'SEPARATELY'}),e=>e.code==='COMPOSITION_SINGLE_OBLIGATION_CANNOT_SPLIT');
console.log('VISIT_COMPOSITION_PREVIEW_20_PASS: explicit modes, identity and Model C fail-closed conditions; read-only');
