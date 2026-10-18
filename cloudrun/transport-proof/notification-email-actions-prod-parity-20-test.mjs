import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authorizeAction,createActionToken,hashActionToken} from './notification-email-action-policy-20.mjs';

const source=name=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const config=source('NotificationConfig.js');
const sender=source('NotificationSender.js');
const gateway=source('NotificationMailGateway.js');
const approval=source('NotificationRenderer_ApprovalOperational.js');
const policy=source('cloudrun/transport-proof/notification-email-action-policy-20.mjs');
const handoff=source('docs/AMS_NOTIFICATIONS_2_0_README_2026-10-18.txt');

assert.match(config,/Notification_Config/);
assert.match(config,/Notification_Rules/);
assert.match(config,/System_Config/);
assert.match(config,/Notification_Settings/); // PROD compatibility only; never delete prematurely
assert.match(sender,/DEV_NOTIFICATION_MODE/);
assert.match(sender,/SENT_DEV_REDIRECT/);
assert.match(gateway,/Resend/i);
assert.match(approval,/MANAGER_PORTAL_URL/);
assert.match(approval,/^https:/m); // configured absolute HTTPS; no hardcoded DEV host
assert.doesNotMatch(approval,/ams-transport-proof-510075419067|audit-management-system-dev/);
assert.doesNotMatch(policy,/1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs|1J4ykUsgDQc1gNeZJjyOJmQ-rsYnf8ujdwg9uTACmCNw/);
assert.match(handoff,/PROD legacy/i);
assert.match(handoff,/DO NOT DELETE OR EDIT/);

const token=createActionToken();
const record={auditorUid:'uid-a',auditId:'audit-a',action:'ACCEPT',tokenHash:hashActionToken(token),status:'Approved',origin:'MANAGER',revision:1,expiresAt:Date.now()+60000};
const context={record,token,auditorUid:'uid-a',auditId:'audit-a',action:'ACCEPT',status:'Approved',revision:1,deviceTrusted:true};
assert.equal(authorizeAction(context),'OK');
assert.equal(authorizeAction({...context,auditorUid:'uid-b'}),'SCOPE_MISMATCH');
assert.equal(authorizeAction({...context,record:{...record,origin:'AUDITOR'}}),'ACTION_NOT_ALLOWED');
assert.equal(authorizeAction({...context,record:{...record,usedAt:Date.now()}}),'TOKEN_CONSUMED');
assert.equal(authorizeAction({...context,revision:2}),'STALE_AUDIT');
console.log('notification-email-actions-prod-parity-20: PASS');
