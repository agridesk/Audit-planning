import assert from 'node:assert/strict';
import {buildEcasLifecycleOutbox20 as build} from './ecas-lifecycle-outbox-20.mjs';
const base={transitionId:'T1',committedTransition:{committed:true,auditId:'A',action:'CANCEL'},auditId:'A',action:'CANCEL',reason:'Client cancellation'};
assert.throws(()=>build({...base,committedTransition:{committed:false}}),/ECAS_TRANSITION_NOT_COMMITTED/);
assert.equal(build(base).required,false);
const previousCommunication={verified:true,receipt:'R1',recipientEmail:'test@example.invalid',schedule:{auditId:'A',date:'2026-11-05',auditorUid:'U1',company:'Farm',mpsNumber:'123',scopes:['ABC'],hours:8,blocks:[{date:'2026-11-05',start:'08:00',end:'16:00'}]}};
const first=build({...base,previousCommunication}),second=build({...base,previousCommunication});assert.equal(first.required,true);assert.equal(first.queueWrites[0].idempotencyKey,second.queueWrites[0].idempotencyKey);assert.equal(first.queueWrites[0].deliveryEnabled,false);assert.equal(first.queueWrites[0].payload.ecasComment,'Client cancellation');assert.equal(first.queueWrites[0].payload.eventKey,'ECAS_AUDIT_CANCELLED_DIGEST');
const rejected=build({...base,action:'REJECT',committedTransition:{committed:true,auditId:'A',action:'REJECT'},previousCommunication});assert.equal(rejected.queueWrites[0].payload.ecasComment,'Client cancellation');assert.equal(rejected.queueWrites[0].payload.eventKey,'ECAS_AUDIT_REJECTED_DIGEST');
console.log('ECAS lifecycle outbox intent OK');
