import assert from 'node:assert/strict';
import {managerCanonicalWriteBridge20 as invoke} from './manager-canonical-write-bridge-20.mjs';
const base={enabled:true,mode:'DEV',gasWriteUrl:'https://example.test/exec',bridgeKey:'test-bridge-key',auditId:'A-001',action:'approve',actorEmail:'manager@example.test',options:{}};
const calls=[];
const accept=async(url,opts)=>{calls.push({url:String(url),options:JSON.parse(opts.body)});return{ok:true,status:200,text:async()=>JSON.stringify({success:true,newStatus:'Accepted'})}};
assert.equal(await invoke({...base,enabled:false,fetchImpl:()=>{throw Error('MUST_NOT_CALL')}}),null);
const result=await invoke({...base,fetchImpl:accept});assert.equal(result.canonicalBridge,true);assert.equal(result.owner,'GAS_STATUS_MACHINE');assert.equal(calls.length,1);assert.equal(calls[0].options.managerAction,'approve');assert.ok(calls[0].url.includes('action=externalmanageraction'));
for(const action of ['cancel','reject']){await invoke({...base,action,options:{reason:'Test reason'},fetchImpl:accept});assert.equal(calls.at(-1).options.managerAction,action)}
await assert.rejects(invoke({...base,mode:'PROD',fetchImpl:accept}),/DEV_ONLY/);
await assert.rejects(invoke({...base,action:'complete',fetchImpl:accept}),/ACTION_NOT_MIGRATED/);
await assert.rejects(invoke({...base,gasWriteUrl:'http://example.test/exec',fetchImpl:accept}),/HTTPS_REQUIRED/);
await assert.rejects(invoke({...base,fetchImpl:async()=>({ok:false,status:409,text:async()=>JSON.stringify({success:false,error:'STATUS_TRANSITION_BLOCKED'})})}),/BRIDGE_REJECTED_STATUS_TRANSITION_BLOCKED/);
await assert.rejects(invoke({...base,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({success:false,error:'REJECTED'})})}),/BRIDGE_REJECTED_REJECTED/);
await assert.rejects(invoke({...base,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({unexpected:true})})}),/BRIDGE_UNCONFIRMED/);
await assert.rejects(invoke({...base,fetchImpl:async()=>({ok:true,status:200,text:async()=>'<html>error</html>'})}),/BRIDGE_NON_JSON/);
console.log('Manager canonical GAS write bridge: PASS 11/11 scenarios');
