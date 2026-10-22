import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSwapFirestoreReadmodel} from './swap-firestore-readmodel-20.mjs';
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
assert.match(docker,/COPY swap-firestore-readmodel-20\.mjs/);
assert.match(server,/AMS_SWAP20_FIRESTORE_MIRROR_ENABLED==='true'/);
assert.match(server,/notificationGasCall\(actor,'listPending'/);
assert.match(server,/swap20InvalidateMirror/);
let time=100000, stored=new Map(),calls=[];
const fetchImpl=async(url,opts)=>{
 calls.push({url,method:opts.method});
 if(opts.method==='GET'){
  if(!stored.has(url))return {status:404,ok:false};
  return {ok:true,json:async()=>stored.get(url)};
 }
 if(opts.method==='PATCH'){
  stored.set(url,JSON.parse(opts.body));
  return {ok:true,status:200};
 }
 if(opts.method==='DELETE'){
  stored.delete(url);return {ok:true,status:200};
 }
 throw Error('unexpected');
};
const mirror=createSwapFirestoreReadmodel({project:'audit-management-system-dev',getToken:async()=> 'unit-test',fetchImpl,now:()=>time});
const manager={role:'manager',email:'manager@example.test'},auditor={role:'auditor',email:'auditor@example.test'};
const list={ok:true,readOnly:true,attentionCount:1,items:[{operationId:'operation-1',status:'CONFIRMED'}]};
const generation=await mirror.bumpEpoch();
assert.equal(await mirror.read(manager,generation),null);
await mirror.save(manager,list,generation);
assert.equal((await mirror.read(manager,generation)).items[0].status,'CONFIRMED');
assert.equal(await mirror.read(auditor,generation),null,'roles must not share mirrors');
time+=30001;
assert.equal(await mirror.read(manager,generation),null,'expired mirrors must fail closed');
time-=30001;
await mirror.invalidate(manager);
assert.equal(await mirror.read(manager,generation),null);
assert.ok(calls.some(x=>x.method==='DELETE'));
await assert.rejects(mirror.save(manager,{ok:true,items:[]},generation),/SWAP_MIRROR_INVALID/);
console.log('SWAP DEV Firestore opt-in read-model isolation and expiry: PASS');
