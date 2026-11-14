import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const source=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const start=source.indexOf("  // Post-backfill verification is a pure read");
const end=source.indexOf("  // Manager-only, genuinely read-only backfill preflight.",start);
assert.ok(start>=0&&end>start,'Read-only cutover evidence route required');
const body=source.slice(start,end);
assert.match(body,/req.method==='GET'/);
assert.match(body,/u.pathname==='\/api\/v1\/planning\/atomic-cutover-evidence-readonly'/);
assert.match(body,/actor\?\.role!=='manager'/);
assert.match(body,/!planningAtomicPrepEnabled\|\|planningAtomicEnabled\|\|!planningCutoverDataAudit/);
assert.match(body,/planningCutoverDataAudit\.verify\(\{maxPages:50\}\)/);
assert.doesNotMatch(body,/\.seed\(|\.commit\(|\.apply\(|\.write\(/);
new Script('async function handler(req,res,u,session,runtime,planningAtomicPrepEnabled,planningAtomicEnabled,planningCutoverDataAudit){'+body+'}',{filename:'atomic-cutover-evidence-get.js'});
const handler=new Function('return async function handler(req,res,u,session,runtime,planningAtomicPrepEnabled,planningAtomicEnabled,planningCutoverDataAudit){'+body+'}')();
async function run({role='manager',dev=true,prep=true,atomic=false}={}){
 const responses=[],invocations=[];
 const res={writeHead:(status,headers)=>responses.push({status,headers}),end:payload=>responses.push({payload})};
 const audit={verify:async options=>{invocations.push(options);return {ready:false,audits:{expected:111,verified:0}}}};
 await handler({method:'GET'},res,{pathname:'/api/v1/planning/atomic-cutover-evidence-readonly'},
  async()=>role?{role}:null,{isDev:dev},prep,atomic,audit);
 return {responses,invocations};
}
let result=await run();
assert.equal(result.responses[0].status,200);
assert.deepEqual(result.invocations,[{maxPages:50}]);
assert.equal(JSON.parse(result.responses[1].payload).success,true);
for(const flags of [{role:'auditor'},{role:null},{dev:false},{prep:false},{atomic:true}]){
 result=await run(flags);
 assert.equal(result.invocations.length,0,'Blocked GET must not scan');
 assert.notEqual(result.responses[0].status,200);
}
console.log('Read-only cutover parity evidence: manager-authenticated, bounded, no write paths PASS');
