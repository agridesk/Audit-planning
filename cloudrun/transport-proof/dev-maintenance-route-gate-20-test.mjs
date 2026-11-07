import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const start=src.indexOf("  // DEV maintenance closes every HTTP entry point");
const stop=src.indexOf("  if(req.method==='POST'&&planningAtomicLifecycle",start);
assert(start>0&&stop>start,'maintenance guard must precede all routes');
const guard=src.slice(start,stop);
assert(guard.includes("process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_DEV_MAINTENANCE_MODE==='true'"));
assert(guard.includes("res.writeHead(503"));
const ctx={process:{env:{AMS_RUNTIME_ENV:'DEV',AMS_DEV_MAINTENANCE_MODE:'true'}},JSON};
vm.runInNewContext("async function gate(req,res){"+guard+"return 'NEXT';}",ctx);
for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){
 const writes=[];const res={writeHead:(code,headers)=>writes.push({code,headers}),end:x=>writes.push({body:x})};
 const result=await ctx.gate({method,url:'/api/v1/availability/migrate-legacy-hard'},res);
 assert.equal(result,undefined);
 assert.equal(writes[0].code,503,method);
 assert.equal(JSON.parse(writes[1].body).code,'AMS_DEV_MAINTENANCE');
}
ctx.process.env.AMS_RUNTIME_ENV='PROD';
assert.equal(await ctx.gate({method:'POST'},{}),'NEXT','PROD must never be affected');
ctx.process.env.AMS_RUNTIME_ENV='DEV';
ctx.process.env.AMS_DEV_MAINTENANCE_MODE='false';
assert.equal(await ctx.gate({method:'POST'},{}),'NEXT','normal DEV remains unaffected');
console.log('PASS fail-closed DEV maintenance: all HTTP methods, no PROD impact');
