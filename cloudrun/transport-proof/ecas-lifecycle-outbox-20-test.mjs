import assert from 'node:assert/strict';
import {buildEcasLifecycleOutbox20 as build} from './ecas-lifecycle-outbox-20.mjs';
const base={transitionId:'T1',committedTransition:{committed:true,auditId:'A',action:'CANCEL'},auditId:'A',action:'CANCEL',reason:'Client cancellation'};
assert.throws(()=>build({...base,committedTransition:{committed:false}}),/ECAS_TRANSITION_NOT_COMMITTED/);
assert.equal(build(base).required,false);
const previousCommunication={verified:true,receipt:'R1',recipientEmail:'test@example.invalid',schedule:{auditId:'A',date:'2026-11-05',auditorUid:'U1',company:'Farm',mpsNumber:'123',scopes:['ABC'],hours:8}};
const first=build({...base,previousCommunication}),second=build({...base,previousCommunication});assert.equal(first.required,true);assert.equal(first.queueWrites[0].idempotencyKey,second.queueWrites[0].idempotencyKey);assert.equal(first.queueWrites[0].deliveryEnabled,false);
console.log('ECAS lifecycle outbox intent OK');
