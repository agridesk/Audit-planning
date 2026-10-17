/**
 * AMS Notifications 2.0 — canonical DEV-only template test sender.
 * No queue mutation. No original recipient, cc or bcc is accepted.
 * Install with the existing GAS notification modules.
 */
function NotificationTestMail20_Preview(eventKey) {
  var key=String(eventKey||'').trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9_]{1,100}$/.test(key))throw new Error('INVALID_EVENT_KEY');
  if(typeof SYS_getEnv_!=='function'||SYS_getEnv_()!=='DEV')throw new Error('DEV_ONLY');
  var all=NotificationConfig_GetAllEvents();
  if(!Object.prototype.hasOwnProperty.call(all,key))throw new Error('UNKNOWN_NOTIFICATION_EVENT');
  // Deterministic, fully populated synthetic audit. Never use live customer records.
  var fixture={
    eventType:key,type:key,company:'DEV TEST COMPANY',auditId:'TEST_NOTIFICATION_20',
    mpsNumber:'MPS-TEST-2026-001',auditNumber:'MPS-TEST-2026-001',
    auditorName:'DEV Example Auditor',auditorEmail:'auditor@example.invalid',
    contactName:'DEV Example Contact',contactEmail:'contact@example.invalid',contactPhone:'+31 000 000 0000',
    scopes:['MPS-ABC','MPS-GAP'],plannedHours:6,
    blocks:[{date:'2026-11-03',start:'09:00',end:'15:00',hours:6,execLoc:'DEV Test Location'}],
    actor:'AMS DEV',actorRole:'manager',recipientRole:'auditor',
    comment:'Synthetic DEV template test — not a real audit',resultStatus:'TEST'
  };
  var rendered=NB_buildNotification_(key,fixture);
  if(!rendered||!String(rendered.subject||'').trim()||!String(rendered.body||'').trim())throw new Error('TEMPLATE_RENDER_FAILED');
  return {eventKey:key,subject:String(rendered.subject),body:String(rendered.body),htmlBody:String(rendered.htmlBody||'')};
}
function NotificationTestMail20_Send(eventKey) {
  if(typeof SYS_getEnv_!=='function'||SYS_getEnv_()!=='DEV')throw new Error('DEV_ONLY');
  var cfg=SYS_getConfig_();
  var mode=SYS_getResolvedNotificationMode_();
  if(mode!=='TEST_TO_SELF')throw new Error('DEV_TEST_TO_SELF_REQUIRED');
  // DEV TEST_TO_SELF is an explicit redirect-only mode. SEND_NOTIFICATIONS is a\n  // general delivery enablement flag, not permission to send to real recipients.\n  // The canonical recipient resolver and outbound guard enforce the test address.
  var to=String(cfg.DEV_TEST_EMAIL||'').trim();
  if(!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to))throw new Error('DEV_TEST_EMAIL_INVALID');
  var mail=NotificationTestMail20_Preview(eventKey);
  var delivery=SYS_resolveNotificationRecipients_(['original-recipient@example.invalid']);
  if(!delivery||delivery.mode!=='TEST_TO_SELF'||!delivery.send||String(delivery.recipient||'').trim().toLowerCase()!==to.toLowerCase())throw new Error('DEV_DELIVERY_GUARD_REJECTED');
  if(typeof NotificationDeliveryGuard_assertOutboundAllowed==='function'){
    NotificationDeliveryGuard_assertOutboundAllowed({mode:'TEST_TO_SELF',to:to,redirectedTo:to,eventKey:mail.eventKey});
  }else throw new Error('DELIVERY_GUARD_MISSING');
  var subject='[DEV TEST] '+mail.subject;
  var options=mail.htmlBody?{htmlBody:mail.htmlBody}:{};
  var result=NotificationMailGateway_SendEmail(to,subject,mail.body,options,{purpose:'DEV_TEMPLATE_TEST',eventKey:mail.eventKey});
  return {ok:!!(result&&result.ok),eventKey:mail.eventKey,providerId:String(result&&result.id||'')};
}
