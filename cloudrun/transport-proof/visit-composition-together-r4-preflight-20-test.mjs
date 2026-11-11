import assert from 'node:assert/strict';
import {validateTogetherCompositionPreflight20 as validate} from './visit-composition-together-r4-preflight-20.mjs';
const obligations=[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State','Planning_Window_From','Planning_Window_To'],
 ['o1','company-1','GAP',8,'OPEN','2027-01-01','2027-12-31'],
 ['o2','company-1','GRASP',3,'LINKED_TO_VISIT','01-01-2027','31-12-2027']];
const links=[['Audit_ID','Obligation_ID','Link_State'],
 ['audit-1','o1','ACTIVE'],['audit-1','o2','ACTIVE']];
const blocks=[
 {date:'2027-03-12',start:'08:00',end:'14:00'},
 {date:'2027-03-13',start:'08:00',end:'13:00'}
];
const allocations=[
 {blockId:'2027-03-12|08:00|14:00',obligationId:'o1',minutes:360},
 {blockId:'2027-03-13|08:00|13:00',obligationId:'o1',minutes:120},
 {blockId:'2027-03-13|08:00|13:00',obligationId:'o2',minutes:180}
];
const base={auditId:'audit-1',companyUid:'company-1',obligations,links,blocks,allocations,formalTargetMinutes:660};
const result=validate(base);
assert.equal(result.scopeAllocations.length,3);
assert.equal(result.scopeAllocation.obligations.length,2);
assert.equal(result.requiredMinutes,660);
assert.equal(result.canCommitOnlyViaAtomicOwner,true);
assert.throws(()=>validate({...base,links:[...links,['another','o1','ACTIVE']]}),/LINKED_ELSEWHERE/);
assert.throws(()=>validate({...base,links:[...links,['audit-1','o1','ACTIVE']]}),/ACTIVE_OBLIGATIONS_INVALID/);
assert.throws(()=>validate({...base,formalTargetMinutes:600}),/FORMAL_HOURS_SOURCE_MISMATCH/);
assert.throws(()=>validate({...base,allocations:allocations.slice(0,2)}),/SCOPE_MINUTES_INCOMPLETE/);
assert.throws(()=>validate({...base,allocations:[...allocations,{...allocations[0]}]}),/SCOPE_ALLOCATION_INVALID/);
assert.throws(()=>validate({...base,blocks:[{date:'2028-03-12',start:'08:00',end:'14:00'},blocks[1]]}),/SCOPE_WINDOW_BLOCKED/);
assert.throws(()=>validate({...base,obligations:[obligations[0],[...obligations[1].slice(0,3),0,...obligations[1].slice(4)],obligations[2]]}),/HOURS_OR_IDENTITY_INVALID/);
console.log('VISIT_COMPOSITION_TOGETHER_R4_PREFLIGHT_20_PASS: canonical obligations, scope hours, windows and per-block allocation');
