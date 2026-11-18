import assert from 'node:assert/strict';
import {resolveSwapExpectedAvailabilityDocuments} from './swap-expected-availability-count-20.mjs';
import {requireSwapIndexCoverage} from './swap-index-coverage-gate-20.mjs';

assert.equal(resolveSwapExpectedAvailabilityDocuments({}),27);
assert.equal(resolveSwapExpectedAvailabilityDocuments({AMS_SWAP20_EXPECTED_AVAILABILITY_DOCUMENTS:'34'}),34);
for(const bad of ['0','1','-3','3.5','abc','10000','34 '])
 assert.throws(()=>resolveSwapExpectedAvailabilityDocuments({AMS_SWAP20_EXPECTED_AVAILABILITY_DOCUMENTS:bad}),/EXPECTED_AVAILABILITY_DOCUMENTS_INVALID/);
const index={complete:true,documentCount:34};
assert.equal(requireSwapIndexCoverage(index,34),index);
assert.throws(()=>requireSwapIndexCoverage(index,27),/SWAP_INDEX_COVERAGE_UNVERIFIED/);
console.log('swap expected availability count tests passed');
