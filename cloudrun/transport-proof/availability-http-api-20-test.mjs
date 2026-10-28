import assert from 'node:assert/strict';
import {createAvailabilityHttpRouter} from './availability-http-api-20.js';
let calls=[];
const service={period:async x=>(calls.push(['period',x]),{version:0,days:[]}),mutate:async x=>(calls.push(['mutate',x]),{version:1}),managerOverview:async x=>(calls.push(['overview',x]),{auditors:[]})};
const directory=[{auditorId:'a',displayName:'Alice'},{auditorId:'b',displayName:'Bob'}];
let identity={role:'Manager',id:'m'};
const router=createAvailabilityHttpRouter({service,resolveIdentity:async()=>identity,listAuditors:async()=>directory});
async function request(path,method='GET',body=null,headers={}){let status=0,data=null;const req={url:path,method,headers,async *[Symbol.asyncIterator](){if(body!==null)yield JSON.stringify(body);}};const res={writeHead:(s)=>{status=s;},end:(s)=>{data=JSON.parse(s);}};const handled=await router(req,res);return{handled,status,data};}
const q='/api/v1/availability/calendar?auditorId=a&fromDate=2027-01-11&toDate=2027-01-24';
assert.equal((await request('/health')).handled,false);
assert.equal((await request(q)).status,200);
assert.equal(calls.at(-1)[1].actor.id,'m');
assert.equal((await request(q.replace('auditorId=a','auditorId=x'))).status,403);
assert.equal((await request(q.replace('2027-01-11','2027-02-30'))).status,422);
assert.equal((await request(q,'POST')).status,405);
identity=null;assert.equal((await request(q)).status,401);
identity={role:'Auditor',id:'a'};
assert.equal((await request(q)).status,200);
// Regression: self-access must not depend on roster directory membership.
const noRosterRouter=createAvailabilityHttpRouter({service,resolveIdentity:async()=>({role:'auditor',auditorId:'a'}),listAuditors:async()=>{throw Error('DIRECTORY_MUST_NOT_BE_READ_FOR_SELF');}});
const selfReq={url:q,method:'GET',headers:{}};
let selfStatus=0;
await noRosterRouter(selfReq,{writeHead:s=>{selfStatus=s;},end:()=>{}});
assert.equal(selfStatus,200);
assert.equal((await request(q.replace('auditorId=a','auditorId=b'))).status,403);
assert.equal((await request('/api/v1/availability/manager-overview?fromDate=2027-01-11&toDate=2027-01-24')).status,403);
identity={role:'Manager',id:'m'};
assert.equal((await request('/api/v1/availability/manager-overview?fromDate=2027-01-11&toDate=2027-01-24')).status,200);
assert.deepEqual(calls.at(-1)[1].auditorIds,['a','b']);
assert.equal((await request('/api/v1/availability/manager-overview?fromDate=2027-01-11&toDate=2027-01-24&auditorId=x')).status,403);
const mutation={auditorId:'b',expectedVersion:0,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true}};
assert.equal((await request('/api/v1/availability/mutate','POST',mutation,{'content-type':'application/json'})).status,200);
assert.equal(calls.at(-1)[1].actor.id,'m');
assert.equal((await request('/api/v1/availability/mutate','POST',mutation)).status,422);
assert.equal((await request('/api/v1/availability/mutate','POST',{...mutation,expectedVersion:'0'},{'content-type':'application/json'})).status,422);
identity={role:'Auditor',id:'a'};
assert.equal((await request('/api/v1/availability/mutate','POST',mutation,{'content-type':'application/json'})).status,403);
for(const invalidDirectory of [[{auditorId:'a'},{auditorId:'a'}],[null],[{auditorId:''}]]){
 const badRouter=createAvailabilityHttpRouter({service,resolveIdentity:async()=>({role:'manager',id:'m'}),listAuditors:async()=>invalidDirectory});
 let status=0;
 await badRouter({url:q,method:'GET',headers:{}},{writeHead:s=>{status=s;},end:()=>{}});
 assert.equal(status,422,'Malformed canonical directory must fail closed');
}
console.log('18 HTTP API contract assertions passed');