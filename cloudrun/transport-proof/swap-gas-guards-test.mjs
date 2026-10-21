import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const props=new Map();
const mock={
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 Set,JSON,Error,Date,String,Array
};
for(const file of ['Swap20ProposalValidation.js','Swap20ProposalTransitionGuard.js','Swap20ProposalStore.js']){
 runInNewContext(readFileSync(new URL(file,root),'utf8'),mock,{filename:file});
}
const proposal={operationId:'swap-test-1',auditA:'A',auditB:'B',status:'AWAITING_ACKNOWLEDGEMENT',originalRevisions:{A:'1',B:'2'},requiredAuditorUids:['uid-one','uid-two'],acknowledgedAuditorUids:[]};
assert.equal(mock.Swap20Store_create_(proposal).success,true);
assert.throws(()=>mock.Swap20Store_create_(proposal),/already exists/);
const first={...proposal,acknowledgedAuditorUids:['uid-one']};
assert.equal(mock.Swap20Store_transition_(proposal.operationId,proposal.status,first).success,true);
assert.throws(()=>mock.Swap20Store_transition_(proposal.operationId,'CONFIRMED',first),/status conflict/);
assert.throws(()=>mock.Swap20Store_transition_(proposal.operationId,proposal.status,{...first,status:'CONFIRMED'}),/Acknowledgement incomplete/);
assert.throws(()=>mock.Swap20Store_transition_(proposal.operationId,proposal.status,{...first,originalRevisions:{A:'bad',B:'2'}}),/Revisions changed/);
const complete={...first,acknowledgedAuditorUids:['uid-one','uid-two'],status:'CONFIRMED'};
assert.equal(mock.Swap20Store_transition_(proposal.operationId,proposal.status,complete).status,'CONFIRMED');
assert.throws(()=>mock.Swap20Store_transition_(proposal.operationId,'CONFIRMED',{...complete,status:'APPLIED'}),/Canonical commit proof required/);
console.log('Swap GAS guards tests passed');
