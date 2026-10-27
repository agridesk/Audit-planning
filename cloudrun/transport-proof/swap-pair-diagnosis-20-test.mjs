import assert from 'node:assert/strict';
import {createSwapFirestoreDevTransport} from './swap-firestore-dev-transport-20.mjs';
const project='audit-management-system-dev';
const root='projects/'+project+'/databases/(default)/documents/';
const ids=['AUD_TEST_A','AUD_TEST_B'];
const found=(name,payload)=>({found:{name,updateTime:'2026-10-27T12:00:00Z',fields:{payload:{stringValue:JSON.stringify(payload)}}}});
const fetchImpl=async(_url,options)=>{
 const request=JSON.parse(options.body);
 const records=request.documents.map(name=>{
  if(name.endsWith('/AUD_TEST_B')&&name.includes('_audits/'))return {missing:name};
  if(name.includes('_availability/'))return found(name,{auditId:name.split('/').pop(),reservations:[]});
  return found(name,{auditId:name.split('/').pop(),status:'Accepted',plannedBlocks:[]});
 });
 return {ok:true,text:async()=>JSON.stringify(records)};
};
const transport=createSwapFirestoreDevTransport({project,getToken:async()=> 'test-token',fetchImpl,enabled:true,canonicalCutoverVerified:true});
const result=await transport.diagnosePair({actor:{role:'manager',email:'manager@example.test'},auditA:ids[0],auditB:ids[1]});
assert.equal(result.ok,true);
assert.deepEqual(result.audits,{state:'MISSING',auditIds:[ids[1]]});
assert.deepEqual(result.availability,{state:'PRESENT'});
const denied=await transport.diagnosePair({actor:{role:'manager',email:'manager@example.test'},auditA:'invalid/id',auditB:ids[1]});
assert.equal(denied.ok,false);
assert.equal(denied.code,'SWAP_DIAGNOSTIC_PAIR_INVALID');
await assert.rejects(()=>transport.diagnosePair({actor:{role:'auditor',email:'auditor@example.test'},auditA:ids[0],auditB:ids[1]}),/SWAP_DIRECT_MANAGER_UNAUTHORIZED/);
const disabled=createSwapFirestoreDevTransport({project,getToken:async()=> 'test-token',fetchImpl,enabled:false,canonicalCutoverVerified:true});
const closed=await disabled.diagnosePair({actor:{role:'manager',email:'manager@example.test'},auditA:ids[0],auditB:ids[1]});
assert.equal(closed.ok,false);
console.log('SWAP_PAIR_DIAGNOSIS_DEV_PASS');
