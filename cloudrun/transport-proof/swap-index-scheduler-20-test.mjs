import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSwapIndexScheduler} from './swap-index-scheduler-20.mjs';
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
assert.match(docker,/COPY (?:swap\-index\-scheduler\-20\.mjs|swap-\*\.mjs) \.\//);
assert.match(server,/swap20Scheduler\.verify\(req\.headers\.authorization\)/);
const now=Date.now(),audience='https://ams.example.run.app';
const email='swap-scheduler@example.iam.gserviceaccount.com';
const valid={aud:audience,email,email_verified:'true',iss:'https://accounts.google.com',exp:String(Math.floor(now/1000)+200),sub:'service-123'};
let response={...valid},syncs=0,seedRecords=[{operationId:'SWAP20_test0001'}];
const scheduler=createSwapIndexScheduler({index:{meta:async()=>null,bootstrap:async records=>{syncs++;assert.equal(records,seedRecords);return true;}},now:()=>now,
 serviceEmail:email,audience,roster:async()=>[{role:'manager',email:'manager@example.test',auditorId:'manager-uid'}],
 gasCall:async(actor,op,data,action)=>{assert.equal(actor.role,'manager');assert.equal(op,'listIndexSeed');assert.equal(action,'externalswap20');return {ok:true,records:seedRecords};},
 fetchImpl:async url=>{assert.match(url,/oauth2\.googleapis\.com\/tokeninfo/);return {ok:true,json:async()=>response};}
});
assert.equal(await scheduler.verify('Bearer authorized-token'),true);
assert.equal(await scheduler.verify('nonsense'),false);
response={...valid,email:'attacker@example.test'};assert.equal(await scheduler.verify('Bearer authorized-token'),false);
response={...valid,aud:'https://attacker.test'};assert.equal(await scheduler.verify('Bearer authorized-token'),false);
response={...valid,exp:String(Math.floor(now/1000)-1)};assert.equal(await scheduler.verify('Bearer authorized-token'),false);
assert.deepEqual(await scheduler.reconcile(),{ok:true,records:1});
assert.equal(syncs,1);
console.log('SWAP DEV scheduler OIDC isolation and index synchronization: PASS');
