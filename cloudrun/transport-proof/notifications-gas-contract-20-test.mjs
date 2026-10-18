import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const writer=read('NotificationManagement20.js');
const testMail=read('NotificationTestMail20.js');
for(const field of ['mpsNumber:', 'auditorName:', 'auditorEmail:', 'contactName:', 'contactEmail:', 'scopes:', 'plannedHours:', 'blocks:']) assert.ok(testMail.includes(field), 'Synthetic fixture missing '+field);
assert.ok(testMail.includes('NB_buildNotification_(key,fixture)'), 'Preview must use canonical renderer');
const config=read('SystemConfig.js');
const entry=read('EntryV5.js');
assert.match(entry,/rawAction==='externalnotification20'/);
assert.match(entry,/V5_ENTRY_externalBridgeBody_\(e\)/);
assert.match(entry,/NotificationManagement20_UpdateEvent\(/);
assert.match(entry,/NotificationTestMail20_Send\(/);
assert.match(entry,/NotificationManagement20_UpdateDevMode\(/);
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.match(writer,/function NotificationManagement20_UpdateEvent\(/);
assert.match(writer,/DEV_ONLY/);
assert.match(writer,/LockService\.getScriptLock/);
assert.match(writer,/CONFIG_CHANGED_RELOAD_REQUIRED/);
assert.match(writer,/Notification_Change_Log/);
assert.match(writer,/ACTOR_IDENTITY_REQUIRED/);
assert.match(writer,/function NotificationManagement20_UpdateDevMode\(/);
assert.match(writer,/DEV_NOTIFICATION_MODE/);
assert.match(writer,/DEV_TEST_EMAIL_REQUIRED/);
assert.ok(!writer.includes('\\\\s@'), 'Email validation must not use double-escaped regex character classes');
assert.ok(writer.includes("actor.indexOf('@')<1"), 'Manager actor email must be validated');
for(const marker of ['INVALID_ACTOR_MISSING','INVALID_ACTOR_LENGTH','INVALID_ACTOR_FORMAT','INVALID_ACTOR_WHITESPACE'])assert.ok(writer.includes(marker),'Missing actor diagnostic: '+marker);
assert.match(testMail,/function NotificationTestMail20_Preview\(/);
assert.match(testMail,/function NotificationTestMail20_Send\(/);
assert.match(testMail,/DEV_TEST_TO_SELF_REQUIRED/);
assert.match(testMail,/NotificationDeliveryGuard_assertOutboundAllowed/);
assert.match(testMail,/SYS_resolveNotificationRecipients_/);
assert.match(config,/function SYS_resolveNotificationRecipients_\(/);
assert.match(config,/function SYS_deliveryResult_\(/);
assert.match(server,/notificationGasCall/);
assert.match(server,/GAS_DEV_DEPLOYMENT_OUTDATED/);
assert.match(server,/notificationDevModeMutation/);
assert.ok(server.includes('notifications-manager-20/dev-mode'));
const html=readFileSync(new URL('./notification-manager-20.html',import.meta.url),'utf8');
assert.match(html,/id="devModeSelect"/);
assert.match(html,/id="saveDevMode"/);
assert.doesNotMatch(server,/NotificationMailGateway_SendEmail/);
console.log('notifications-gas-contract-20: PASS');

const sender=read('NotificationSender.js');
for(const guard of ['function ns_currentEmailPermissions_()', 'function ns_suppressDisabledQueueRows_(', 'var policy = ns_currentEmailPermissions_()', 'var livePolicy = ns_currentEmailPermissions_()', "getSheetByName('Notification_Config')", "setValue('SENT_SUPPRESSED')", 'group.items = allowed', 'group.rows = allowed.map']) {
  assert.ok(sender.includes(guard), 'Dispatch-time notification policy guard missing: '+guard);
}
assert.ok(sender.indexOf('var livePolicy = ns_currentEmailPermissions_()') < sender.indexOf('mail = ns_buildDigestEmail_(group.recipient, group.items)'), 'Filter disabled digest items before rendering');

const gateway=read('NotificationMailGateway.js');
assert.ok(sender.includes("if (env === 'DEV')"), 'DEV test mode must be environment-scoped');
assert.ok(sender.includes("settings.DEV_NOTIFICATION_MODE||'OFF'"), 'DEV mode must be read from System_Config');
assert.ok(sender.includes("settings.DEV_TEST_EMAIL||''"), 'DEV test recipient must come from System_Config');
assert.ok(sender.includes("if (!ns_yesLike_(settings.SEND_NOTIFICATIONS))mode='OFF'"), 'Disabled notification sending must override test mode');
assert.ok(gateway.includes('function NMG_getDevSystemSenderSettings_()'), 'DEV sender identity needs System_Config reader');
for (const field of ['DEFAULT_FROM_EMAIL','DEFAULT_FROM_NAME','DEFAULT_REPLY_TO']) assert.ok(gateway.includes('devSettings.'+field+' ||'), 'System_Config must take priority for '+field);

// Action-from-email phase 1: Manager approval mail is navigation-only.
const approvalMail=read('NotificationRenderer_ApprovalOperational.js');
assert.match(approvalMail,/Review in Manager portal/);
assert.match(approvalMail,/MANAGER_PORTAL_URL/);
assert.match(approvalMail,/NB_htmlAttr_\(managerPortalUrl\)/);
assert.doesNotMatch(approvalMail,/managerPortalUrl\s*\+\s*['"](?:\?|&).*approve/i);

assert.ok(sender.includes("mode:'DEV_UNRECOGNIZED_MODE'"), 'Unknown DEV delivery mode must fail closed');
assert.ok(sender.includes("error:'DEV_NOTIFICATION_MODE must be DRY_RUN or TEST_TO_SELF'"), 'DEV mode contract must be explicit');
assert.ok(gateway.includes('function RUN_NOTIFICATION_SETTINGS_RETIREMENT_DIAGNOSTICS()'), 'Retirement must be gated by diagnostic');
assert.ok(gateway.includes('retirementReady:ready'), 'Retirement diagnostic must report readiness');
