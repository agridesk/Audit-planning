import assert from 'node:assert/strict';
import {requireSwapIndexCoverage} from './swap-index-coverage-gate-20.mjs';
assert.equal(requireSwapIndexCoverage({complete:true,documentCount:2},2).complete,true);
assert.throws(()=>requireSwapIndexCoverage({complete:true,documentCount:1},2));
assert.throws(()=>requireSwapIndexCoverage({complete:false,documentCount:2},2));
