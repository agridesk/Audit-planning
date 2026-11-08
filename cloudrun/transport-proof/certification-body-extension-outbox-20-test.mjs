import assert from 'node:assert/strict';
import {prepareCbExtensionEvent20 as prepare,reduceCbExtensionOutbox20 as reduce,CB_EXTENSION_OUTBOX_HEADERS_20 as headers} from './certification-body-extension-outbox-20.mjs';
const scopes=[['ScopeCode','Certification_Body_ID','Active'],['GAP-ECAS','ECAS','TRUE'],['GAP-OTHER','OTHER','TRUE']];
const bodies=[['Certification_Body_ID','Display_Name','Active','Notification_Email','Email_Verified','Notification_Enabled'],
 ['ECAS','ECAS','TRUE','planning@ecas.nl','TRUE','FALSE'],['OTHER','Other body','TRUE','valid@other.example','TRUE','TRUE']];
const obligations=[['Obligation_ID','Company_UID','ScopeCode','Certification_Body_ID','Base_Expiry_Date'],
 ['O1','COMPANY','GAP-ECAS','ECAS','2026-12-01'],
 ['O2','COMPANY','GAP-OTHER','OTHER','2026-12-01']];
const common={obligationRows:obligations,scopeRows:scopes,certificationBodies:bodies,auditId:'AUD',companyUid:'COMPANY',company:'Test Company'};
const apply=prepare({...common,obligationId:'O1',operationId:'op1',command:'apply',expected:{extensionApplied:true,effectiveExpiry:'2027-03-01'},createdAt:'2026-11-08T10:00:00Z'});
const undo=prepare({...common,obligationId:'O1',operationId:'op2',command:'undo',expected:{extensionApplied:false,effectiveExpiry:'2026-12-01'},createdAt:'2026-11-08T10:03:00Z'});
assert.equal(apply.status,'BUFFERED');
assert.equal(apply.certificationBodyId,'ECAS');
assert.equal(apply.notificationReady,false);
assert.equal(apply.notBefore,'2026-11-08T10:10:00.000Z');
assert.equal(apply.values[12],'');
const queue=[headers,apply.values,undo.values];
assert.deepEqual(reduce({outboxRows:queue,obligationId:'O1',currentExtensionApplied:false,now:'2026-11-08T10:15:00Z'}),{
 action:'SUPPRESS',eventIds:[apply.eventId,undo.eventId],reason:'NO_NET_STATE_CHANGE',deliveredState:'NOT_APPLIED',currentState:'NOT_APPLIED'
});
assert.equal(reduce({outboxRows:[headers,apply.values],obligationId:'O1',currentExtensionApplied:true,now:'2026-11-08T10:09:59Z'}).action,'WAIT');
assert.equal(reduce({outboxRows:[headers,apply.values],obligationId:'O1',currentExtensionApplied:true,now:'2026-11-08T10:10:00Z'}).eventType,'CB_EXTENSION_APPLIED');
const sentApply=apply.values.slice();sentApply[11]='SENT';sentApply[13]='2026-11-08T10:20:00.000Z';
const undoAfterSent=prepare({...common,obligationId:'O1',operationId:'op_after',command:'undo',expected:{extensionApplied:false,effectiveExpiry:'2026-12-01'},createdAt:'2026-11-08T10:21:00Z'});
assert.equal(reduce({outboxRows:[headers,sentApply,undoAfterSent.values],obligationId:'O1',currentExtensionApplied:false,now:'2026-11-08T10:31:00Z'}).eventType,'CB_EXTENSION_UNDONE');
assert.equal(reduce({outboxRows:[headers,sentApply,undoAfterSent.values],obligationId:'O1',currentExtensionApplied:false,now:'2026-11-08T10:30:00Z'}).action,'WAIT');
const other=prepare({...common,obligationId:'O2',operationId:'op3',command:'apply',expected:{extensionApplied:true,effectiveExpiry:'2027-03-01'},createdAt:'2026-11-08T10:00:00Z'});
assert.equal(other.certificationBodyId,'OTHER');
assert.equal(other.notificationReady,true);
assert.throws(()=>prepare({...common,obligationRows:[obligations[0],[...obligations[1].slice(0,3),'OTHER','2026-12-01']],obligationId:'O1',operationId:'op4',command:'apply',expected:{extensionApplied:true}}),/CB_OBLIGATION_SCOPE_MISMATCH/);
assert.throws(()=>reduce({outboxRows:[headers,apply.values,other.values.map((x,i)=>i===3?'O1':x)],obligationId:'O1',currentExtensionApplied:true,now:'2026-11-08T10:30:00Z'}),/CB_OUTBOX_SCOPE_OR_BODY_CHANGED/);
const tooSoon=apply.values.slice();tooSoon[10]='2026-11-08T10:05:00Z';
assert.throws(()=>reduce({outboxRows:[headers,tooSoon],obligationId:'O1',currentExtensionApplied:true,now:'2026-11-08T10:30:00Z'}),/CB_OUTBOX_UNDER_MINIMUM_BUFFER/);
console.log('certification-body-extension-outbox-20 PASS');
