import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolveAmsRuntimeConfig} from './runtime-environment-20.mjs';
const runtime=resolveAmsRuntimeConfig({DEV_SSOT_SPREADSHEET_ID:'test-sheet'},'audit-management-system-dev');
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
assert.equal([...r15.matchAll(/await auditorLifecyclePreflight\(\{cookie:actor.cookie,body,action\}\)/g)].length,2);
assert.match(r15,/origin!=='https:\/\/'\+host/);
assert.match(r4,/origin\.host===String\(req\.headers\.host\|\|''\)/);
const seen=[];
const http={request(options,receive){
 const request=new EventEmitter();
 request.setTimeout=()=>{};
 request.end=payload=>{
  seen.push({path:options.path,host:options.headers.host,origin:options.headers.origin,
   cookie:options.headers.cookie,body:JSON.parse(payload)});
  assert.equal(options.hostname,'127.0.0.1');
  assert.equal(options.port,8089);
  assert.equal(options.headers['content-length'],Buffer.byteLength(payload));
  const response=Object.assign(new EventEmitter(),{statusCode:200});
  receive(response);
  response.emit('data',Buffer.from(JSON.stringify({success:true,authorityPreflight:true})));
  response.emit('end');
 };
 return request;
}};
const ctx=vm.createContext({http,runtime,URL,Response,Buffer,port:8080});
 const start=r15.indexOf('async function auditorLifecyclePreflight(');
 const end=r15.indexOf('const planningAtomicLifecycle=',start);
 assert.ok(start>=0&&end>start);
 vm.runInContext(r15.slice(start,end),ctx);
 for(const action of ['ACCEPT','CANCEL','COMPLETE']){
  const response=await ctx.auditorLifecyclePreflight({cookie:'session=test',body:{auditId:'A1',authorityPreflight:true},action});
  assert.equal((await response.json()).authorityPreflight,true);
  assert.deepEqual(seen.at(-1),{path:'/api/v1/auditor/action',host:new URL(runtime.origin).host,
   origin:runtime.origin,cookie:'session=test',body:{auditId:'A1',authorityPreflight:true,action}});
 }
console.log('Auditor atomic lifecycle preserves matching Origin and Host at the HTTP receiver');
