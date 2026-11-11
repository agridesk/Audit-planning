import assert from 'node:assert/strict';
import { validateVisitScopeAllocation20 as validate } from './visit-scope-allocation-20.mjs';

const obligations = [
  { obligationId: 'OB-GAP', scopeCode: 'MPS-GAP', requiredMinutes: 480 },
  { obligationId: 'OB-GRASP', scopeCode: 'GRASP', requiredMinutes: 180 }
];
const blocks = [
  { date: '2026-11-18', start: '08:00', end: '16:00' },
  { date: '2026-11-19', start: '09:00', end: '12:00' }
];
const allocations = [
  { blockIndex: 0, obligationId: 'OB-GAP', start: '08:00', end: '16:00' },
  { blockIndex: 1, obligationId: 'OB-GRASP', start: '09:00', end: '12:00' }
];
const input = () => ({
  obligations: obligations.map(x => ({ ...x })),
  blocks: blocks.map(x => ({ ...x })),
  allocations: allocations.map(x => ({ ...x }))
});
const expectCode = (edit, code) => {
  const args = input();
  edit(args);
  assert.throws(() => validate(args), e => e?.code === code, code);
};
const result = validate(input());
assert.equal(result.valid, true);
assert.equal(result.totalMinutes, 660);
assert.equal(result.totalHours, 11);
assert.equal(result.obligations[0].remainingMinutes, 0);
assert.equal(result.obligations[1].remainingMinutes, 0);
assert.equal(result.allocations.length, 2);
expectCode(x => { x.allocations = []; }, 'SCOPE_ALLOCATION_EXPLICIT_REQUIRED');
expectCode(x => { x.obligations = [x.obligations[0]]; }, 'SCOPE_ALLOCATION_MULTI_OBLIGATION_REQUIRED');
expectCode(x => { x.obligations[1].obligationId = 'OB-GAP'; }, 'SCOPE_ALLOCATION_DUPLICATE_OBLIGATION');
expectCode(x => { x.obligations[0].requiredMinutes = 481; }, 'SCOPE_ALLOCATION_REQUIRED_HOURS_MISMATCH');
expectCode(x => { x.obligations[1].scopeCode = ''; }, 'SCOPE_ALLOCATION_INVALID_OBLIGATION');
expectCode(x => { x.allocations[0].obligationId = 'OB-NOT-FOUND'; }, 'SCOPE_ALLOCATION_UNKNOWN_OBLIGATION');
expectCode(x => { x.allocations[0].blockIndex = 2; }, 'SCOPE_ALLOCATION_UNKNOWN_BLOCK');
expectCode(x => { x.allocations[0].start = '07:45'; }, 'SCOPE_ALLOCATION_OUTSIDE_BLOCK');
expectCode(x => { x.allocations[0].start = '08:15'; }, 'SCOPE_ALLOCATION_GAP');
expectCode(x => { x.allocations[0].end = '15:45'; }, 'SCOPE_ALLOCATION_GAP');
expectCode(x => {
  x.allocations = [
    { blockIndex: 0, obligationId: 'OB-GAP', start: '08:00', end: '12:00' },
    { blockIndex: 0, obligationId: 'OB-GAP', start: '11:00', end: '16:00' },
    ...x.allocations.slice(1)
  ];
}, 'SCOPE_ALLOCATION_OVERLAP');
expectCode(x => { x.blocks[0].end = '08:00'; }, 'SCOPE_ALLOCATION_INVALID_BLOCK');
expectCode(x => { x.blocks[0].date = 'tomorrow'; }, 'SCOPE_ALLOCATION_INVALID_DATE');
expectCode(x => { x.allocations[1].start = '09:70'; }, 'SCOPE_ALLOCATION_INVALID_TIME');
expectCode(x => {
  x.blocks.push({ date: '2026-11-18', start: '15:45', end: '16:30' });
}, 'SCOPE_ALLOCATION_BLOCKS_OVERLAP');
const split = input();
split.blocks = [{ date: '2026-11-18', start: '08:00', end: '19:00' }];
split.allocations = [
  { blockIndex: 0, obligationId: 'OB-GAP', start: '08:00', end: '16:00' },
  { blockIndex: 0, obligationId: 'OB-GRASP', start: '16:00', end: '19:00' }
];
assert.equal(validate(split).totalMinutes, 660);
const fifteen = input();
fifteen.obligations[0].requiredMinutes = 465;
fifteen.blocks[0].end = '15:45';
fifteen.allocations[0].end = '15:45';
assert.equal(validate(fifteen).totalMinutes, 645);
console.log('VISIT_SCOPE_ALLOCATION_20_PASS 18 positive/negative scenarios; NO mutation/cutover');
