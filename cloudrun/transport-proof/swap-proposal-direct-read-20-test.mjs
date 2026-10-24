import assert from 'node:assert/strict';
import {createSwapProposalIndex} from './swap-proposal-index-20.mjs';
const proposal={operationId:'op_12345678',auditA:'A',auditB:'B',status:'CONFIRMED',requiredAuditorUids:[],acknowledgedAuditorUids:[],blocksA:[],blocksB:[]};
const payload=value=>({fields:{payload:{stringValue:JSON.stringify(value)}}});
let metaVersion='v1',clock=1100,metaStatus='READY',metaReads=0;
const fetchImpl=async url=>{
 const name=decodeURIComponent(new URL(url).pathname);
 if(name.endsWith('/_META')){metaReads++;return {ok:true,status:200,json:async()=>({...payload({status:metaStatus,verifiedAtMs:1000}),updateTime:metaVersion})};}
 if(name.endsWith('/op_12345678'))return {ok:true,status:200,json:async()=>payload(proposal)};
 return {ok:false,status:404};
};
const index=createSwapProposalIndex({project:'ams-test-dev',getToken:async()=>'token',fetchImpl,now:()=>clock});
assert.deepEqual(await index.readProposal('op_12345678'),proposal);
assert.equal(metaReads,2);
metaStatus='DIRTY';
assert.equal(await index.readProposal('op_12345678'),null,'locked index must not serve direct reads');
metaStatus='READY';clock=500000;
assert.equal(await index.readProposal('op_12345678'),null,'stale index must not serve direct reads');
clock=1100;metaVersion='v2';
assert.deepEqual(await index.readProposal('op_12345678'),proposal);
await assert.rejects(index.readProposal('invalid'),/SWAP_INDEX_OPERATION_INVALID/);
console.log('SWAP direct proposal read safety checks passed');
