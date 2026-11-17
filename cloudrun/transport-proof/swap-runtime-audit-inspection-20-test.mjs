import assert from 'node:assert/strict';
import {validateSwapRuntimeAuditIds} from './swap-dev-backfill-cli-20.mjs';

const ids=[
 'AUD_FernandezMoreno-Mate_HQ_1777531729292_30',
 'AUD_CULTIUSMOMPSL_1789994541934_D0H9',
 'AUD_HORTICULTURAVINY_1789994546083_KCHG'
];
assert.deepEqual(validateSwapRuntimeAuditIds(ids),ids);
assert.throws(()=>validateSwapRuntimeAuditIds([]),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
assert.throws(()=>validateSwapRuntimeAuditIds([...ids,...ids,...ids,...ids]),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
assert.throws(()=>validateSwapRuntimeAuditIds([ids[0],ids[0]]),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
assert.throws(()=>validateSwapRuntimeAuditIds(['AUD_BAD/ID']),{message:'SWAP_RUNTIME_AUDIT_IDS_INVALID'});
console.log('SWAP runtime audit inspection ID validation passed');
