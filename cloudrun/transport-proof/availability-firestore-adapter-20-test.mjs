import assert from 'node:assert/strict';
import {createFirestoreAvailabilityAdapter} from './availability-firestore-adapter-20.js';
let stored=null, stamp=0, requests=[];
const response=(status,body={})=>({status,ok:status>=200&&status<300,json:async()=>body});
async function mockFetch(url,init={}){
 const u=new URL(url);requests.push({method:init.method||'GET',url:u.toString()});
 if((init.method||'GET')==='GET')return stored?response(200,{fields:{payload:{mapValue:{fields:{auditorId:{stringValue:stored.auditorId},version:{integerValue:String(stored.version)}}}}},updateTime:'t'+stamp}):response(404);
 const expected=u.searchParams.get('currentDocument.updateTime');const create=u.searchParams.get('currentDocument.exists')==='false';
 if(stored?(expected!=='t'+stamp):!create)return response(412);
 const raw=JSON.parse(init.body).fields.payload.mapValue.fields;
 stored={auditorId:raw.auditorId.stringValue,version:Number(raw.version.integerValue)};stamp++;
 return response(200,{updateTime:'t'+stamp});
}
const a=createFirestoreAvailabilityAdapter({projectId:'audit-management-system-dev',getToken:async()=>'token',fetchImpl:mockFetch});
assert.equal(await a.read('aud-1'),null);
assert.equal(await a.compareAndSwap('aud-1',0,{auditorId:'aud-1',version:1}),true);
assert.deepEqual(await a.read('aud-1'),{auditorId:'aud-1',version:1});
assert.equal(await a.compareAndSwap('aud-1',0,{auditorId:'aud-1',version:1}),false);
assert.equal(await a.compareAndSwap('aud-1',1,{auditorId:'aud-1',version:2}),true);
assert.equal((await a.read('aud-1')).version,2);
const b=createFirestoreAvailabilityAdapter({projectId:'audit-management-system-dev',getToken:async()=>'token',fetchImpl:mockFetch});
assert.equal(await b.compareAndSwap('aud-1',1,{auditorId:'aud-1',version:2}),false);
assert.equal(await b.compareAndSwap('aud-1',2,{auditorId:'aud-1',version:3}),true);
assert.equal((await a.read('aud-1')).version,3);
assert.ok(requests.some(r=>r.url.includes('currentDocument.updateTime=t2')));
assert.ok(requests.some(r=>r.url.includes('currentDocument.exists=false')));
await assert.rejects(()=>a.compareAndSwap('bad/id',0,{auditorId:'bad/id',version:1}),/INVALID_CAS_REQUEST/);
await assert.rejects(()=>a.compareAndSwap('aud-1',Number.MAX_SAFE_INTEGER,{auditorId:'aud-1',version:Number.MAX_SAFE_INTEGER+1}),/INVALID_CAS_REQUEST/);
console.log('12 Firestore adapter checks passed');