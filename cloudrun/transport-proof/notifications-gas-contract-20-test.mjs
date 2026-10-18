import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
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
assert.match(approvalMail,/NB_portalBaseUrl20_\('MANAGER'\)/);
assert.match(approvalMail,/NB_htmlAttr_\(reviewUrl\)/);
assert.match(approvalMail,/planning\?auditId=/);
assert.doesNotMatch(approvalMail,/managerPortalUrl\s*\+\s*['"](?:\?|&).*approve/i);

assert.ok(sender.includes("mode:'DEV_UNRECOGNIZED_MODE'"), 'Unknown DEV delivery mode must fail closed');
assert.ok(sender.includes("error:'DEV_NOTIFICATION_MODE must be DRY_RUN or TEST_TO_SELF'"), 'DEV mode contract must be explicit');
assert.ok(gateway.includes('function RUN_NOTIFICATION_SETTINGS_RETIREMENT_DIAGNOSTICS()'), 'Retirement must be gated by diagnostic');
assert.ok(gateway.includes('retirementReady: false'), 'Legacy retirement diagnostic must not authorize sheet deletion');
assert.ok(gateway.includes('RUN_NOTIFICATION_CONSOLIDATION_AUDIT()'), 'Retirement diagnostic must delegate to canonical audit');

const notificationConfig=read('NotificationConfig.js');
assert.ok(notificationConfig.includes('if (devSettings) return defaultValue;'), 'DEV must not fall back to Notification_Settings for missing keys');
assert.ok(notificationConfig.includes('nc_clone_(devSettings || nc_loadSettingsMap_())'), 'DEV settings listing must use System_Config');
const consolidationAudit=read('NotificationConsolidationDiagnostics.js');
for (const key of ['DEFAULT_FROM_EMAIL','DEFAULT_FROM_NAME','DEFAULT_REPLY_TO','DEFAULT_BUFFER_MINUTES','RUNNER_ENABLED','RUNNER_FREQUENCY_MINUTES','QUEUE_RETENTION_DAYS','MAIL_PROVIDER','TEST_MODE','TEST_RECIPIENT']) assert.ok(consolidationAudit.includes("'"+key+"'"), 'Canonical migration diagnostic missing '+key);

const rulesBackend=read('NotificationManagement20.js');
const ruleEntry=read('EntryV5.js');
const portal=read('cloudrun/transport-proof/notification-manager-20.html');
const transport=read('cloudrun/transport-proof/server-r15.js');
for(const [name,source,needle] of [
 ['GAS rule writer',rulesBackend,'function NotificationManagement20_UpdateRule('],
 ['DEV guard',rulesBackend,"throw new Error('DEV_ONLY')"],
 ['Technical rule excluded',rulesBackend,"throw new Error('RULE_NOT_EDITABLE')"],
 ['Optimistic concurrency',rulesBackend,"throw new Error('RULE_CHANGED_RELOAD_REQUIRED')"],
 ['Threshold ordering',rulesBackend,"throw new Error('THRESHOLD_ORDER_INVALID')"],
 ['Audit logging',rulesBackend,'AMS_NOTIFICATION_RULES_20'],
 ['Cache invalidation',rulesBackend,'NotificationConfig_ClearCache()'],
 ['GAS bridge',ruleEntry,"b.operation==='updateRule'"],
 ['Cloud Run mutation',transport,'async function notificationRuleMutation('],
 ['Cloud Run endpoint',transport,"u.pathname==='/api/v1/notifications-manager-20/rules'"],
 ['Overview rules',transport,'result.editableRules='],
 ['Portal tab',portal,'data-tab="rules"'],
 ['Portal rule editor',portal,'function renderRules()'],
 ['Portal save',portal,"'/api/v1/notifications-manager-20/rules'"]
])assert.ok(source.includes(needle),name+' missing');
for(const forbidden of ['QUEUE_SHEET_NAME','MANAGER_COMPLETE_LOG_ONLY','COMMENT_ALLOWED_AUDIT_CANCELLED_BY_MANAGER','COMMENT_ALLOWED_AUDIT_DENIED_BY_MANAGER','COMMENT_ALLOWED_AUDIT_REJECTED_BY_MANAGER','COMMENT_ALLOWED_AUDIT_DENIED_BY_AUDITOR']){
 const whitelist=rulesBackend.slice(rulesBackend.indexOf('function NotificationManagement20_UpdateRule('),rulesBackend.indexOf("if(days.indexOf(key)<0",rulesBackend.indexOf('function NotificationManagement20_UpdateRule(')));
 assert.ok(!whitelist.includes("'"+forbidden+"'"),'Unsafe editable rule: '+forbidden);
}

const statusBridge=read('StatusNotificationBridge.js');
const auditorBackend=read('AuditorV5Backend.js');
assert.ok(statusBridge.includes("action === ACTION.DENY && actor === ROLE.AUDITOR && afterStatus === STATUS.PENDING_PLANNING) return 'AUDIT_CANCELLED_BY_AUDITOR'"),'Legacy auditor DENY must route to Cancelled notification');
assert.match(auditorBackend,/auditorV5_notifyManager_\(\s*'AUDIT_CANCELLED_BY_AUDITOR'\s*,/,'Legacy auditor deny path must use Cancelled notification');
assert.ok(!transport.includes("'COMMENT_ALLOWED_AUDIT_DENIED_BY_AUDITOR'"),'Legacy denied rule must not be editable in portal');

const consolidation=read('NotificationConsolidationDiagnostics.js');
for(const expected of ['function RUN_NOTIFICATION_CONSOLIDATION_AUDIT()','DEV_ONLY','LAST_RUN_AT','LAST_SUCCESS_AT','LAST_ERROR','LAST_RUN_RESULT_JSON','LAST_RUN_NOTE','legacySheetRetirementReady:false','usageVerified:false','No deletion or destructive migration authorized.'])assert.ok(consolidation.includes(expected),'Consolidation diagnostic missing '+expected);
assert.ok(!consolidation.includes('deleteSheet('),'Consolidation audit must never delete a sheet');
assert.ok(!consolidation.includes('setValue('),'Consolidation audit must be read-only');

const managerOverviewServer=read('cloudrun/transport-proof/server-r15.js');
const overviewHandler=managerOverviewServer.slice(managerOverviewServer.indexOf('async function notificationsManagerOverview('),managerOverviewServer.indexOf('async function notificationGasCall('));
assert.ok(overviewHandler.includes("['System_Config',500]"),'Overview must read canonical System_Config');
assert.ok(!overviewHandler.includes("['Notification_Settings',500]"),'DEV overview must not read legacy settings tab');
assert.ok(!overviewHandler.includes('data.Notification_Settings'),'DEV overview must not derive settings from legacy tab');
assert.ok(overviewHandler.includes('const settingMap=systemMap;'),'DEV overview must use canonical settings');

const notificationConfigSource=read('NotificationConfig.js');
assert.match(notificationConfigSource,/function nc_loadSettingsMap_\(\) \{[\s\S]*?var devSettings = nc_getDevSystemConfigSettings_\(\);[\s\S]*?if \(devSettings\) return nc_clone_\(devSettings\);/,'Direct legacy reader must return canonical DEV System_Config before legacy cache/sheet access');

const retirementGateway=read('NotificationMailGateway.js');
const retirementDiagnostic=retirementGateway.slice(retirementGateway.indexOf('function RUN_NOTIFICATION_SETTINGS_RETIREMENT_DIAGNOSTICS()'),retirementGateway.indexOf('function NMG_getSenderIdentity_()'));
assert.match(retirementDiagnostic,/RUN_NOTIFICATION_CONSOLIDATION_AUDIT\(\)/,'Legacy diagnostic must delegate to canonical audit');
assert.match(retirementDiagnostic,/retirementReady: false/,'Legacy diagnostic must never falsely authorize deletion');
assert.ok(!retirementDiagnostic.includes('nc_loadSettingsMap_'),'Legacy diagnostic must not compare canonical settings with themselves');

assert.match(consolidationAudit,/DEV_SPREADSHEET_ID_MISMATCH/,'Consolidation audit must reject non-DEV workbook');
assert.match(consolidationAudit,/ss\.getId\(\)!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'/,'Consolidation audit must be pinned to DEV spreadsheet ID');

const triggerInventory=consolidationAudit.slice(consolidationAudit.indexOf('function RUN_NOTIFICATION_TRIGGER_INVENTORY()'));
assert.match(triggerInventory,/DEV_SPREADSHEET_ID_MISMATCH/,'Trigger inventory must reject non-DEV workbook');
assert.match(triggerInventory,/ScriptApp\.getProjectTriggers\(\)/,'Trigger inventory must inspect installed triggers');
assert.match(triggerInventory,/CURRENT_EXECUTING_ACCOUNT_ONLY/,'Trigger inventory must disclose account visibility limit');
assert.match(triggerInventory,/lastRunVerified:false/,'Trigger presence must not be confused with runner execution');
assert.ok(!/ScriptApp\.deleteTrigger\(|ScriptApp\.newTrigger\(|\.setValue\(|MailApp\.|GmailApp\./.test(triggerInventory),'Trigger inventory must be read-only');

const fullAudit=consolidationAudit.slice(consolidationAudit.indexOf('function RUN_NOTIFICATION_CONSOLIDATION_FULL_AUDIT()'));
for(const expected of ['RUN_NOTIFICATION_CONSOLIDATION_AUDIT()','RUN_NOTIFICATION_TRIGGER_INVENTORY()',"sheetSummary('Notification Queue')","sheetSummary('Notification log')","sheetSummary('Notification_Change_Log')","sheetSummary('Notification_Templates')",'legacySheetRetirementReady:false','runtimeIndependenceVerified:false','lastRunVerified:false','statusSampleTruncated']) {
  assert.ok(fullAudit.includes(expected),'Full notification audit missing '+expected);
}
assert.ok(!/\.setValue\(|\.setValues\(|\.deleteSheet\(|\.insertSheet\(|ScriptApp\.newTrigger\(|ScriptApp\.deleteTrigger\(|MailApp\.|GmailApp\.|UrlFetchApp\.fetch\(/.test(fullAudit),'Full notification audit must be read-only');

const freshnessAudit=consolidationAudit.slice(consolidationAudit.indexOf('function RUN_NOTIFICATION_OPERATIONS_EVIDENCE(knownTriggers)'));
for(const expected of ['DEV_SPREADSHEET_ID_MISMATCH',"inspect('Notification Queue'","inspect('Notification log'","inspect('Notification_Change_Log'",'EVIDENCE_ONLY_NOT_EXECUTION_PROOF','noSheetDeletionAuthorized:true'])assert.ok(freshnessAudit.includes(expected),'Freshness evidence missing '+expected);
assert.ok(fullAudit.includes('freshness:RUN_NOTIFICATION_OPERATIONS_EVIDENCE(triggers)'),'Full audit must include freshness evidence');
assert.ok(!/\.setValue\(|\.setValues\(|\.deleteSheet\(|ScriptApp\.newTrigger\(|ScriptApp\.deleteTrigger\(|MailApp\.|GmailApp\.|UrlFetchApp\.fetch\(/.test(freshnessAudit),'Freshness evidence must be read-only');

assert.ok(fullAudit.includes('freshness:RUN_NOTIFICATION_OPERATIONS_EVIDENCE(triggers)'),'Full audit must reuse its scheduler inventory');
assert.match(freshnessAudit,/knownTriggers\|\|RUN_NOTIFICATION_TRIGGER_INVENTORY\(\)/,'Freshness audit must support standalone invocation');
const gasRoot=new URL('../../',import.meta.url);
const gasFiles=readdirSync(gasRoot).filter(name=>name.endsWith('.js'));
const legacyReferences=[];
const templateReferences=[];
for(const name of gasFiles){
  const source=read(name);
  if(source.includes('Notification_Settings'))legacyReferences.push(name);
  if(source.includes('Notification_Templates'))templateReferences.push(name);
}
assert.ok(gasFiles.length>100,'Notification reference inventory unexpectedly incomplete');
assert.ok(templateReferences.includes('NotificationConsolidationDiagnostics.js'),'Template inventory must include diagnostic owner');
console.log('Notification source inventory: GAS files='+gasFiles.length+' legacy-settings refs='+legacyReferences.length+' template refs='+templateReferences.length);
console.log('Notification template references: '+templateReferences.join(', '));
console.log('Notification legacy-settings references: '+legacyReferences.join(', '));

// Auditor email navigation must never reuse legacy direct accept/deny links.
const auditorMail=read('NotificationRenderer_ManagerToAuditorPlanning.js');
assert.match(auditorMail,/\/?auditId=/);
assert.doesNotMatch(auditorMail,/match\[1\] \+ '\/planning\?auditId='/);
assert.doesNotMatch(auditorMail,/cta\.acceptUrl\s*\|\|/);
assert.match(auditorMail,/NB_portalBaseUrl20_\('AUDITOR'\)/);

// Active self-planning Manager renderer must not produce a broken # link.
const selfPlanManagerMail=read('NotificationRenderer_AuditorToManagerApproval.js');
assert.match(selfPlanManagerMail,/planning\?auditId=/);
assert.doesNotMatch(selfPlanManagerMail,/if \(!url\) url = '#'/);
assert.doesNotMatch(selfPlanManagerMail,/cta\.approvalUrl\s*\|\|/);

// DEV/PROD portal base must resolve through canonical System_Config, not hardcoded service hosts.
const notificationBuilder=read('NotificationBuilder.js');
assert.match(notificationBuilder,/function NB_portalBaseUrl20_\(/);
assert.match(notificationBuilder,/SYS_getConfig_\(\)/);
assert.doesNotMatch(notificationBuilder,/ams-transport-proof-510075419067/);
for (const renderer of [approvalMail,auditorMail,selfPlanManagerMail]) assert.match(renderer,/NB_portalBaseUrl20_\(/);

// Prevent redirect/phishing by payload-injected portal destinations.
assert.doesNotMatch(auditorMail,/if \(!url\) url = NB_clean_\(cta\.portalUrl/);
assert.doesNotMatch(selfPlanManagerMail,/if \(!url\) url = NB_clean_\(cta\.portalUrl/);

const sharedGrid=read('cloudrun/transport-proof/manager-portal.js');
assert.match(sharedGrid,/function focusEmailAudit20\(/);
assert.match(sharedGrid,/new URLSearchParams\(window\.location\.search\)/);
assert.match(sharedGrid,/focusEmailAudit20\(\);return loadOpenEnrichment/);

// Email never promises inline acceptance or carries a non-functional fake button.
assert.match(auditorMail,/ACCEPT audit/);
assert.match(auditorMail,/emailAction=ACCEPT/);
assert.doesNotMatch(auditorMail,/origin\[0\] \+ '\/email-action\?/);
assert.match(auditorMail,/This email does not confirm, cancel or change the audit/);
assert.doesNotMatch(auditorMail,/Go to portal to accept or deny the audit\.'\) \+ '<\/div>'/);

// Primary email link must be visible before the details and remain navigation-only.
const auditorHeroStart=auditorMail.indexOf('Your manager has scheduled the audit below');
const auditorHeroCta=auditorMail.indexOf("margin:12px 0 16px");
const auditorDetailStart=auditorMail.indexOf('Audit overview');
assert.ok(auditorHeroStart>=0 && auditorHeroCta>auditorHeroStart && auditorHeroCta<auditorDetailStart);

// Synthetic template test mails cannot contain a live ACCEPT action.
assert.match(testMail,/templatePreviewOnly:true/);
assert.match(notificationBuilder,/templatePreviewOnly:data\.templatePreviewOnly===true/);
assert.match(auditorMail,/n\.templatePreviewOnly === true/);
assert.match(auditorMail,/Template preview only/);
