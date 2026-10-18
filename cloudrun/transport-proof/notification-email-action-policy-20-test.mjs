import assert from 'node:assert/strict';
import {createActionToken,hashActionToken,verifyActionToken,authorizeAction,validateActionInput,auditorEmailActionAllowed,issueAuditorEmailAction} from './notification-email-action-policy-20.mjs';
const token=createActionToken(), record={auditorUid:'aud-123',auditId:'audit-1',action:'ACCEPT',tokenHash:hashActionToken(token),status:'Approved',origin:'MANAGER',environment:'DEV',revision:7,createdAt:Date.now(),expiresAt:Date.now()+60000};
const base={record,token,auditorUid:'aud-123',auditId:'audit-1',action:'ACCEPT',status:'Approved',revision:7,authenticatedActorUid:'aud-123',authenticatedRole:'AUDITOR',actorAuthorized:true,environment:'DEV'};
assert.equal(verifyActionToken(record.tokenHash,token),true);
assert.equal(verifyActionToken(record.tokenHash,createActionToken()),false);
assert.equal(authorizeAction(base),'DEVICE_VERIFICATION_REQUIRED');
assert.equal(authorizeAction({...base,deviceTrusted:true}),'OK');
assert.equal(authorizeAction({...base,deviceVerified:true}),'OK');
assert.equal(authorizeAction({...base,auditorUid:'other',deviceTrusted:true}),'SCOPE_MISMATCH');
assert.equal(authorizeAction({...base,revision:8,deviceTrusted:true}),'STALE_AUDIT');
assert.equal(authorizeAction({...base,record:{...record,usedAt:Date.now()},deviceTrusted:true}),'TOKEN_CONSUMED');
assert.equal(authorizeAction({...base,now:record.expiresAt,deviceTrusted:true}),'TOKEN_EXPIRED');
assert.equal(validateActionInput('CANCEL',{comment:''}),'CANCEL_REASON_REQUIRED');
assert.equal(validateActionInput('CANCEL',{comment:'Reason'}),'OK');
assert.equal(validateActionInput('COMPLETE',{realizedHours:1.2}),'INVALID_HOURS');
assert.equal(validateActionInput('COMPLETE',{realizedHours:1.25}),'OK');
console.log('notification-email-action-policy-20: PASS');

assert.equal(auditorEmailActionAllowed('ACCEPT','Approved','MANAGER'),true);
assert.equal(auditorEmailActionAllowed('ACCEPT','Pending Approval','AUDITOR'),false);
assert.equal(auditorEmailActionAllowed('CANCEL','Pending Approval','AUDITOR'),true);
assert.equal(auditorEmailActionAllowed('CANCEL','Accepted','AUDITOR'),false);
assert.equal(auditorEmailActionAllowed('COMPLETE','Accepted','MANAGER'),true);
assert.equal(auditorEmailActionAllowed('COMPLETE','Completed','MANAGER'),false);

assert.equal(authorizeAction({...base,record:{...record,origin:'AUDITOR'},deviceTrusted:true}),'ACTION_NOT_ALLOWED');
assert.equal(authorizeAction({...base,record:{...record,origin:undefined},deviceTrusted:true}),'ACTION_NOT_ALLOWED');
assert.equal(authorizeAction({...base,record:{...record,status:'Accepted'},status:'Accepted',deviceTrusted:true}),'ACTION_NOT_ALLOWED');

assert.equal(authorizeAction({...base,authenticatedActorUid:'' ,deviceTrusted:true}),'AUTHENTICATION_REQUIRED');
assert.equal(authorizeAction({...base,authenticatedRole:'MANAGER',deviceTrusted:true}),'AUTHENTICATION_REQUIRED');
assert.equal(authorizeAction({...base,actorAuthorized:false,deviceTrusted:true}),'AUTHENTICATION_REQUIRED');

assert.equal(authorizeAction({...base,environment:'PROD',deviceTrusted:true}),'ENVIRONMENT_MISMATCH');
assert.equal(authorizeAction({...base,environment:'',deviceTrusted:true}),'ENVIRONMENT_MISMATCH');

const minted=issueAuditorEmailAction({environment:'DEV',auditorUid:'aud-123',auditId:'audit-1',action:'ACCEPT',status:'Approved',origin:'MANAGER',revision:'r2',now:1000});
assert.equal(minted.token.length,43);
assert.equal(minted.record.expiresAt,3601000);
assert.equal(verifyActionToken(minted.record.tokenHash,minted.token),true);
assert.equal('token' in minted.record,false);
assert.throws(()=>issueAuditorEmailAction({environment:'STAGING',auditorUid:'a',auditId:'b',action:'ACCEPT',status:'Approved',origin:'MANAGER',revision:'r'}),/INVALID_ENVIRONMENT/);
assert.throws(()=>issueAuditorEmailAction({environment:'DEV',auditorUid:'a',auditId:'b',action:'ACCEPT',status:'Pending Approval',origin:'AUDITOR',revision:'r'}),/ACTION_NOT_ALLOWED/);
