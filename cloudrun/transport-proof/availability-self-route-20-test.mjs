import assert from 'node:assert/strict';
import {createAvailabilityHttpRouter} from './availability-http-api-20.js';
const service={period:async()=>{throw Error('UNEXPECTED_PERIOD')},mutate:async()=>{throw Error('UNEXPECTED_MUTATE')},managerOverview:async()=>{throw Error('UNEXPECTED_OVERVIEW')}};
const router=createAvailabilityHttpRouter({service,resolveIdentity:async()=>({role:'auditor',auditorId:'uid-a'}),listAuditors:async()=>[]});
function response(){return{status:null,headers:null,body:'',writeHead(code,headers){this.status=code;this.headers=headers},end(text){this.body=String(text||'')}}}
let res=response();assert.equal(await router({method:'GET',url:'/api/v1/availability/me'},res),true);assert.equal(res.status,200);assert.deepEqual(JSON.parse(res.body),{success:true,auditorId:'uid-a',role:'auditor'});
const unauth=createAvailabilityHttpRouter({service,resolveIdentity:async()=>null,listAuditors:async()=>[]});
res=response();assert.equal(await unauth({method:'GET',url:'/api/v1/availability/me'},res),true);assert.equal(res.status,401);
res=response();assert.equal(await router({method:'POST',url:'/api/v1/availability/me'},res),true);assert.equal(res.status,405);
console.log('My Availability 2.0 self-route authorization checks passed');
