import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=(file)=>readFileSync(new URL(file,import.meta.url),'utf8');
const r4=src('./server-r4.js'),r5=src('./server-r5.js'),r6=src('./server-r6.js');
const preview=src('./visit-composition-preview-20.mjs');
const allocation=src('./visit-scope-allocation-20.mjs');
assert.match(r4,/import \{previewVisitComposition20\} from '\.\/visit-composition-preview-20\.mjs'/);
assert.match(r4,/audit\.companyPlanningSet=companyPlanningSet/);
assert.match(r4,/linked=companyPlanningSet\.find\(item=>item\.isPrimary\)\?\.obligations\|\|\[\]/);
assert.match(r4,/visitComposition20=\{/);
assert.match(r4,/mode:'TOGETHER'/);
assert.match(r4,/mode:'SEPARATELY'/);
assert.match(r4,/available:false,error:/);
assert.match(r5,/id="modelCComposition20"/);
assert.match(r5,/function renderModelCComposition20\(\)/);
assert.match(r5,/model=x;renderModelCComposition20\(\);/);
assert.match(r5,/Current Save uses aggregate Visit hours, not validated per-scope allocation/);
assert.doesNotMatch(r5,/body=\{[^\n]*scopeAllocations:/);
for (const writer of [r4, r6]) {
  assert.match(writer,/body\?\.scopeAllocations!==undefined\|\|body\?\.compositionMode!==undefined/);
  assert.match(writer,/MODEL_C_SCOPE_COMPOSITION_CANONICAL_WRITER_REQUIRED/);
}
assert.match(preview,/canCommit:false/);
assert.match(allocation,/SCOPE_ALLOCATION_OVERLAP/);
console.log('ISSUE87_WORKSPACE_READONLY_CONTRACT_PASS: canonical preview, UI disclosure, fail-closed legacy writes');
