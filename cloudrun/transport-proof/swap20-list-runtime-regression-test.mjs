import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const start=source.indexOf('function swap20ListKey(actor)');
const end=source.indexOf('async function swap20GasOperation(',start);
assert.ok(start>=0&&end>start,'SWAP list implementation must exist');
const implementation=source.slice(start,end);
const events=[];
const context={
 Date,Map,JSON,String,Error,Promise,
 console:{info:(...args)=>events.push(args),warn:(...args)=>events.push(args),error:(...args)=>events.push(args)},
 swap20Lists:new Map(),swap20ListInflight:new Map(),swap20ListGeneration:0,
 swap20Mirror:null,
 swap20Index:{read:async actor=>({ok:true,readOnly:true,items:[],attentionCount:0,role:actor.role})},
 notificationGasCall:async()=>{throw Error('UNEXPECTED_GAS_FALLBACK');}
};
runInNewContext(implementation+';globalResult={swap20ReadList,swap20InvalidateLists};',context);
for(const role of ['manager','auditor']){
 const actor={role,email:role+'@example.test',auditorId:'AUD_1'};
 const cold=await context.globalResult.swap20ReadList(actor);
 assert.equal(cold.ok,true);
 assert.equal(cold.role,role);
 const warm=await context.globalResult.swap20ReadList(actor);
 assert.equal(warm.ok,true);
 assert.equal(warm.role,role);
 assert.ok(events.some(e=>e[0]==='[SWAP20_LIST_PERF]'&&JSON.parse(e[1]).source==='FIRESTORE_INDEX'&&JSON.parse(e[1]).role===role),'cold Firestore result must complete without ReferenceError');
 assert.ok(events.some(e=>e[0]==='[SWAP20_LIST_PERF]'&&JSON.parse(e[1]).source==='CACHE'&&JSON.parse(e[1]).role===role),'warm result must come from cache');
}
assert.equal(context.swap20ListInflight.size,0);
console.log('SWAP20 cold Firestore list -> telemetry -> warm cache (manager/auditor): PASS');
