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
const ctx={
 process:{env:{AMS_RUNTIME_ENV:'DEV',AMS_DEV_MAINTENANCE_MODE:'true'}},JSON,
 runtime:{isDev:true},
 extReadOnlyPreview20:env=>env.AMS_RUNTIME_ENV==='DEV'&&env.K_SERVICE==='ams-fase12-dev'&&env.AMS_DEV_MAINTENANCE_MODE==='true'&&env.AMS_DEV_EXT_READONLY_PREVIEW==='true',
 extPreviewRequestAllowed20:({method,path})=>method==='GET'&&path==='/health'
};
vm.runInNewContext("async function gate(req,res){ const u={pathname:String(req.url||'/').split('?')[0]};"+guard+"return 'NEXT';}",ctx);
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
// A copied IAP preview may serve only explicitly allowlisted reads. Mutations stay blocked.
ctx.process.env.AMS_RUNTIME_ENV='DEV';
ctx.process.env.AMS_DEV_MAINTENANCE_MODE='true';
ctx.process.env.K_SERVICE='ams-fase12-dev';
ctx.process.env.AMS_DEV_EXT_READONLY_PREVIEW='true';
{
 const res={writeHead(){throw Error('allowed read unexpectedly blocked')},end(){throw Error('allowed read unexpectedly ended')}};
 assert.equal(await ctx.gate({method:'GET',url:'/health'},res),'NEXT');
}
for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
 const writes=[];const res={writeHead:code=>writes.push(code),end:body=>writes.push(JSON.parse(body).code)};
 assert.equal(await ctx.gate({method,url:'/api/v1/manager/extension-obligation-command'},res),undefined);
 assert.deepEqual(writes,[423,'AMS_EXT_PREVIEW_READ_ONLY']);
}
ctx.process.env.K_SERVICE='ams-transport-proof';
{
 const writes=[];const res={writeHead:code=>writes.push(code),end:body=>writes.push(JSON.parse(body).code)};
 assert.equal(await ctx.gate({method:'GET',url:'/health'},res),undefined);
 assert.deepEqual(writes,[503,'AMS_DEV_MAINTENANCE']);
}
console.log('PASS fail-closed DEV maintenance: canonical freeze, isolated read-only preview, no PROD impact');
