import assert from 'node:assert/strict';
import {validateScopeVisitAllocation20 as validate} from './model-c-scope-allocation-20.mjs';
const base={auditId:'A',composition:'TOGETHER',obligations:[{auditId:'A',obligationId:'O1',scopeCode:'GAP',linkState:'ACTIVE',requiredMinutes:480},{auditId:'A',obligationId:'O2',scopeCode:'GRASP',linkState:'ACTIVE',requiredMinutes:180}],blocks:[{blockId:'B',date:'2026-11-05',start:'08:00',end:'18:00'}]};
const good=validate({...base,allocations:[{blockId:'B',obligationId:'O1',minutes:420},{blockId:'B',obligationId:'O2',minutes:180}]});
assert.deepEqual(good.scopes.map(x=>x.remainingMinutes),[60,0]);assert.equal(good.validForCommit,false);
assert.throws(()=>validate({...base,allocations:[{blockId:'B',obligationId:'O1',minutes:480},{blockId:'B',obligationId:'O2',minutes:180}]}),/SCOPE_DOUBLE_COUNTED_BLOCK/);
const separate=validate({...base,composition:'SEPARATE',allocations:[]});assert.equal(separate.requiresIdentityMaterialization,true);
console.log('Model C allocation validation OK');
