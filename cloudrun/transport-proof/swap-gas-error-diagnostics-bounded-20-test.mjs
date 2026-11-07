import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../../Swap20Bridge20.js',import.meta.url),'utf8');
assert(!src.includes("setProperty('AMS_SWAP20_LAST_COMMIT_ERROR_"),'unbounded Script Properties error journal must be retired');
const start=src.indexOf('function Swap20Bridge20_recordCommitError_(');
const end=src.indexOf('function Swap20Bridge20_actor_(',start);
assert(start>=0&&end>start);
const writes=[],recorded=[];
const context=vm.createContext({
 Date,
 PropertiesService:{getScriptProperties:()=>({setProperty:(...args)=>writes.push(args)})},
 console:{error:x=>recorded.push(x)},Logger:{log:x=>recorded.push(x)}
});
vm.runInContext(src.slice(start,end),context);
for(let i=0;i<200;i++)context.Swap20Bridge20_recordCommitError_('TEST_OP_'+i,'commit','EXPECTED_FAILURE');
assert.equal(writes.length,0,'diagnostics must not create Script Properties');
assert.equal(recorded.length,400,'each error should have durable execution logs');
assert(recorded[0].includes('TEST_OP_0')&&recorded.at(-1).includes('TEST_OP_199'));
const entry=context.Swap20Bridge20_recordCommitError_('X'.repeat(1000),'managerIdentity','E'.repeat(1000));
assert.equal(entry.operationId.length,100);
assert.equal(entry.error.length,600);
console.log('PASS SWAP error reporting bounded: zero Script Properties writes over 200 failures, execution logs preserved');
