import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSessionRevocationStore} from './auth-session-revocation-20.js';
const server4=fs.readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const server5=fs.readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const docker=fs.readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
const table=new Map();let calls=0;
const mockFetch=async(url,init={})=>{
  calls++;assert.match(url,/ams_auth_revocations_dev/);assert.equal(init.headers.authorization,'Bearer dev-token');
  const id=url.split('/').at(-1).split('?')[0];
  if(init.method==='POST'){const key=new URL(url).searchParams.get('documentId');if(table.has(key))return {status:409,ok:false};table.set(key,JSON.parse(init.body));return {status:200,ok:true};}
  return table.has(id)?{status:200,ok:true}:{status:404,ok:false};
};
assert.throws(()=>createSessionRevocationStore({projectId:'prod',getAccessToken:async()=>''}),/DEV_CONFIGURATION/);
const store=createSessionRevocationStore({projectId:'audit-management-system-dev',getAccessToken:async()=>'dev-token',fetchImpl:mockFetch});
assert.equal(await store.isRevoked('test-session-token'),false);
assert.deepEqual(await store.revoke('test-session-token',Math.floor(Date.now()/1000)+7200),{ok:true,alreadyRevoked:false});
assert.equal(await store.isRevoked('test-session-token'),true);
assert.equal(await store.isRevoked('another-session'),false);
assert.deepEqual(await store.revoke('test-session-token',Math.floor(Date.now()/1000)+7200),{ok:true,alreadyRevoked:true});
assert.ok(calls>=5);
assert.match(server4,/if\(await store\.isRevoked\(cookieMap\(req\)\[SESSION_COOKIE\]\)\)return null/);
assert.match(server5,/await cloudRevocationStore\(\)\.revoke\(token,exp\)/);
assert.match(server5,/AUTH_REVOCATION_UNAVAILABLE/);
assert.match(server5,/AUTH_REVOCATION_NOT_ENABLED/);
assert.match(docker,/COPY auth-session-revocation-20\.js/);
console.log('PASS persistent Cloud Run logout revocation and fail-closed contracts');
