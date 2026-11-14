import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const start=r15.indexOf("  // Manager-only, genuinely read-only backfill preflight.");
const end=r15.indexOf("  if(req.method==='POST'&&u.pathname==='/api/v1/planning/atomic-backfill')",start);
assert.ok(start>=0&&end>start,'GET backfill dry-run handler must precede POST mutation route');
const route=r15.slice(start,end);
assert.match(route,/req.method==='GET'/);
assert.match(route,/u.pathname==='\/api\/v1\/planning\/atomic-backfill-dry-run'/);
assert.match(route,/actor\?\.role!=='manager'/);
assert.match(route,/!planningAtomicPrepEnabled\|\|planningAtomicEnabled\|\|!planningAtomicBackfill/);
assert.match(route,/planningAtomicBackfill\.run\(\{dryRun:true,startRow,limit\}\)/);
assert.doesNotMatch(route,/\.seed\(|\.commit\(|\.apply\(|dryRun:false/);
assert.match(route,/limit<1\|\|limit>200/);
assert.match(route,/startRow<2\|\|startRow>2000/);
assert.match(route,/\^\\d\{1,3\}\$/);
assert.match(route,/\^\\d\{1,4\}\$/);
new Script("async function routeCheck(req,res,u,session,runtime,planningAtomicPrepEnabled,planningAtomicEnabled,planningAtomicBackfill){"+route+"}",{filename:'atomic-backfill-dry-run-get.js'});
const run=async({actorRole='manager',isDev=true,prep=true,atomic=false,limit='200',startRow='2'}={})=>{
 const responses=[],calls=[];
 const res={writeHead:(status,headers)=>responses.push({status,headers}),end:payload=>responses.push({body:payload})};
 const ctx={method:'GET'},url={pathname:'/api/v1/planning/atomic-backfill-dry-run',searchParams:new URLSearchParams({limit,startRow})};
 const runner={run:args=>{calls.push(args);return Promise.resolve({dryRun:true,batch:24,audits:24})}};
 const fn=new Function('return async function routeCheck(req,res,u,session,runtime,planningAtomicPrepEnabled,planningAtomicEnabled,planningAtomicBackfill){'+route+'}')();
 await fn(ctx,res,url,async()=>actorRole?{role:actorRole}:null,{isDev},prep,atomic,runner);
 return {responses,calls};
};
let result=await run();
assert.equal(result.responses[0].status,200);
assert.deepEqual(result.calls,[{dryRun:true,startRow:2,limit:200}]);
assert.equal(JSON.parse(result.responses[1].body).success,true);
for(const flags of [{prep:false},{atomic:true},{actorRole:'auditor'},{actorRole:null},{isDev:false},{limit:'0'},{startRow:'1'},{limit:'abc'}]){
 result=await run(flags);
 assert.equal(result.calls.length,0,'Unpermitted GET must never invoke backfill');
 assert.notEqual(result.responses[0].status,200);
}
console.log('Atomic backfill GET dry-run: manager-only, bounded, no mutation, fail-closed PASS');
