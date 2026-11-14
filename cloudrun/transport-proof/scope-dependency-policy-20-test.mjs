import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requiredTogetherScopePairs20,assertScopeSplitAllowed20} from './scope-dependency-policy-20.mjs';

const headers=['Dependency_ID','Parent_ScopeCode','Child_ScopeCode','Relationship_Type',
 'Must_Audit_Together','Share_Expiry','Active'];
// Exact canonical DEV dependency record, read 2026-11-14.
const rows=[headers,['DEP_MPSGAP_GRASP','MPS-GAP','GRASP','ADD_ON','YES','YES','YES']];
const actual=requiredTogetherScopePairs20({dependencies:rows,scopeCodes:['GRASP','MPS-GAP']});
assert.deepEqual(actual,[{dependencyId:'DEP_MPSGAP_GRASP',parentScopeCode:'MPS-GAP',
 childScopeCode:'GRASP',relationshipType:'ADD_ON',shareExpiry:true,mustAuditTogether:true}]);
assert.throws(()=>assertScopeSplitAllowed20({dependencies:rows,scopeCodes:['MPS-GAP','GRASP']}),/COMPOSITION_SPLIT_MUST_AUDIT_TOGETHER:MPS-GAP\+GRASP/);
for(const codes of [['MPS-GAP'],['GRASP'],['MPS-ABC','MPS-GAP']])
 assert.equal(assertScopeSplitAllowed20({dependencies:rows,scopeCodes:codes}),true);
for(const flag of ['NO','FALSE','0']){
 const changed=[headers,['DEP_MPSGAP_GRASP','MPS-GAP','GRASP','ADD_ON',flag,'YES','YES']];
 assert.equal(requiredTogetherScopePairs20({dependencies:changed,scopeCodes:['MPS-GAP','GRASP']}).length,0);
}
assert.equal(requiredTogetherScopePairs20({dependencies:[headers,
 ['DEP_MPSGAP_GRASP','MPS-GAP','GRASP','ADD_ON','YES','YES','NO']],
 scopeCodes:['MPS-GAP','GRASP']}).length,0);
assert.throws(()=>requiredTogetherScopePairs20({dependencies:[],scopeCodes:['MPS-GAP','GRASP']}),/SOURCE_UNAVAILABLE/);
assert.throws(()=>requiredTogetherScopePairs20({dependencies:[['Wrong']],scopeCodes:['MPS-GAP','GRASP']}),/SCHEMA_INCOMPLETE/);
assert.throws(()=>requiredTogetherScopePairs20({dependencies:[headers,['BROKEN','MPS-GAP','GRASP','ADD_ON','MAYBE','YES','YES']],scopeCodes:['MPS-GAP','GRASP']}),/ROW_INVALID/);
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(r15,/result\.requiredTogetherPairs=requiredTogetherScopePairs20\(/);
assert.match(r15,/assertScopeSplitAllowed20\(\{dependencies:tables\['Config_Scope_Dependencies'\],scopeCodes:selectedCodes\}\)/);
assert.match(r15,/\['Config_Scope_Dependencies','G',1000\]/);
const r5=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
assert.match(r5,/composition20\.requiredTogetherPairs\?\.length\?' disabled title=/);
assert.match(r5,/composition20\.requiredTogetherPairs\?\.length>0\|\|mode==='TOGETHER'/);
assert.match(r5,/if\(!Array\.isArray\(preview\.requiredTogetherPairs\)/);
const editor=readFileSync(new URL('./visit-composition-manager-page-20.mjs',import.meta.url),'utf8');
assert.match(editor,/el\('modeSeparate'\)\.disabled=!!source\.requiredTogetherPairs\?\.length/);
console.log('Scope dependency policy: canonical GAP/GRASP mandatory Together, UI and atomic preflight gates PASS');
