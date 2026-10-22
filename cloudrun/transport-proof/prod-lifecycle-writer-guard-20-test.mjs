import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('./'+n,import.meta.url),'utf8');
const r4=read('server-r4.js'),r6=read('server-r6.js');
const guard="if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');";
for(const signature of [
  'async function directManagerExtension(identity,body){',
  'async function directManagerApprove(identity,body){',
  'async function directManagerAcceptOnBehalf(identity,body){',
  'async function directManagerCancel(identity,body){',
  'async function directManagerReject(identity,body){',
  'async function directComplete(identity,body,actorRole){',
  'function directPlanningCommit(identity,body){'
]){
  assert.ok(r4.includes(signature+'\n  '+guard),'Missing fail-closed PROD guard: '+signature);
}
assert.match(r6,/async function combinedCommit\(identity,body,req\)\{\n\s*if\(process\.env\.AMS_RUNTIME_ENV==='PROD'\)throw new Error\('PROD_COMBINED_VISIT_CANONICAL_WRITER_REQUIRED'\)/);
assert.match(r4,/if\(u\.pathname==='\/api\/v1\/manager\/approve-direct'/);
assert.match(r4,/if\(u\.pathname==='\/api\/v1\/manager\/cancel-direct'/);
assert.match(r4,/if\(u\.pathname==='\/api\/v1\/planning\/direct-commit'/);
assert.match(r6,/u\.pathname==='\/api\/v1\/planning\/direct-commit'/);
assert.match(r6,/await combinedCommit\(identity,body,req\)/);
assert.match(r4,/async function directManagerComplete\(identity,body\)\{return directComplete\(identity,body,'MANAGER'\);\}/);
assert.match(r4,/async function directAuditorComplete\(identity,body\)\{return directComplete\(identity,body,'AUDITOR'\);\}/);
console.log('PROD lifecycle and combined direct writer reachability guards: PASS');
