/**
 * Synthetic, DEV-only ECAS EXT/Undo + SWAP notification visual acceptance.
 * This is NOT a SWAP operation, not an ECAS delivery receipt and not a queue test.
 * Never reads an audit, CB recipient, SWAP journal or outstanding notification intent.
 */
function ECAS20_devCombinedPreviewGuard_(){
  if(typeof SYS_getEnv_!=='function'||SYS_getEnv_()!=='DEV')
    throw Error('ECAS_NOTIFICATION_PREVIEW_DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var id='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
  if(!ss||ss.getId()!==id)throw Error('ECAS_NOTIFICATION_PREVIEW_SSOT_MISMATCH');
  if(String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==id)
    throw Error('ECAS_NOTIFICATION_PREVIEW_SCRIPT_SSOT_MISMATCH');
  return ss;
}
function RUN_ECAS_EXT_SWAP_PREVIEW_DEV_20261109(){
  ECAS20_devCombinedPreviewGuard_();
  var sw=[
    {eventType:'ECAS_AUDIT_CHANGED_DIGEST',company:'DEV Synthetic Company A',mpsNumber:'MPS-DEV-001',
     auditorName:'DEV Example Auditor',scopes:['DEV SCOPE'],ecasComment:'Auditdatum gewijzigd op verzoek van opdrachtgever',
     previousBlocks:[{date:'2026-11-16',start:'09:00',end:'13:00'}],
     blocks:[{date:'2026-11-17',start:'09:00',end:'13:00'}]},
    {eventType:'ECAS_AUDIT_CHANGED_DIGEST',company:'DEV Synthetic Company B',mpsNumber:'MPS-DEV-002',
     auditorName:'DEV Example Auditor',scopes:['DEV SCOPE'],ecasComment:'Auditdatum gewijzigd op verzoek van opdrachtgever',
     previousBlocks:[{date:'2026-11-17',start:'09:00',end:'13:00'}],
     blocks:[{date:'2026-11-16',start:'09:00',end:'13:00'}]}
  ];
  var extension={
    eventCode:'CB_EXTENSION_APPLIED',
    payload:{certificationBodyId:'ECAS',rendererProfile:'ECAS_AUDIT_APPROVAL_DIGEST',
      templateKey:'ECAS_AUDIT_APPROVAL_DIGEST',extensionDetails:{
        MPS_NUMBER:'MPS-DEV-003',COMPANY_NAME:'DEV Synthetic Company C',
        SCOPE_NAME:'DEV SCOPE',PREVIOUS_EXPIRY:'2026-12-31',EFFECTIVE_EXPIRY:'2027-03-31'}}
  };
  var undo={
    eventCode:'CB_EXTENSION_UNDONE',
    payload:{certificationBodyId:'ECAS',rendererProfile:'ECAS_AUDIT_APPROVAL_DIGEST',
      templateKey:'ECAS_AUDIT_APPROVAL_DIGEST',extensionDetails:{
        MPS_NUMBER:'MPS-DEV-004',COMPANY_NAME:'DEV Synthetic Company D',
        SCOPE_NAME:'DEV SCOPE',PREVIOUS_EXPIRY:'2027-03-31',EFFECTIVE_EXPIRY:'2026-12-31'}}
  };
  var extensions=[extension,undo];
  var swapsHtml=NB_renderEcasSwapsSectionHtml_(sw);
  var extensionsHtml=NB_ecasExtensionsSectionHtml_(extensions);
  var intro='Hierbij een overzicht van auditopdrachten en wijzigingen, inclusief verlengingen, voor verwerking in Ecert.';
  var html=NB_externalShellStart_()+
    '<div style="font-size:13px;line-height:1.45;color:#111827;margin:0 0 14px 0">Hallo,<br><br>'+
    intro+'</div><div style="border-top:1px solid #111827;margin:12px 0 14px 0"></div>'+
    swapsHtml+extensionsHtml+
    '<div style="border-top:1px solid #111827;margin:18px 0 14px 0"></div>'+
    '<div style="font-size:13px;line-height:1.5;color:#111827">Bedankt,<br><br>René Rombouts</div>'+
    NB_externalShellEnd_();
  var body=['Hallo,','',intro,'',
    NB_renderEcasSwapsSectionText_(sw),'',
    NB_ecasExtensionsSectionText_(extensions),'','Bedankt,','','René Rombouts'].join('\n');
  if((html.match(/<table /g)||[]).length!==2||
     (html.match(/<td /g)||[]).length!==26||
     (html.match(/Hallo,/g)||[]).length!==1||
     (html.match(/Bedankt,/g)||[]).length!==1)
    throw Error('ECAS_NOTIFICATION_PREVIEW_LAYOUT_CONTRACT_FAILED');
  return{ok:true,readOnly:true,synthetic:true,queueMutated:false,
    subject:'[DEV TEST] ECAS auditwijzigingen, verlengingen en intrekkingen',
    body:body,htmlBody:html,swapRows:2,extensionRows:2};
}
function RUN_ECAS_EXT_SWAP_TEST_MAIL_DEV_20261109(){
  ECAS20_devCombinedPreviewGuard_();
  if(typeof SYS_getResolvedNotificationMode_!=='function'
     ||SYS_getResolvedNotificationMode_()!=='TEST_TO_SELF')
    throw Error('ECAS_NOTIFICATION_TEST_TO_SELF_REQUIRED');
  var cfg=SYS_getConfig_();
  var recipient=String(cfg.DEV_TEST_EMAIL||'').trim().toLowerCase();
  if(recipient!=='info@agridesk.com')
    throw Error('ECAS_NOTIFICATION_TEST_RECIPIENT_UNEXPECTED');
  var redirect=SYS_resolveNotificationRecipients_(['ecas-notification-test@example.invalid']);
  if(!redirect||!redirect.send||redirect.mode!=='TEST_TO_SELF'||
     String(redirect.recipient||'').trim().toLowerCase()!==recipient)
    throw Error('ECAS_NOTIFICATION_TEST_REDIRECT_BLOCKED');
  if(typeof NotificationDeliveryGuard_assertOutboundAllowed!=='function')
    throw Error('ECAS_NOTIFICATION_OUTBOUND_GUARD_MISSING');
  NotificationDeliveryGuard_assertOutboundAllowed({
    mode:'TEST_TO_SELF',to:recipient,redirectedTo:recipient,
    eventKey:'ECAS_AUDIT_APPROVAL_DIGEST'
  });
  var mail=RUN_ECAS_EXT_SWAP_PREVIEW_DEV_20261109();
  var response=NotificationMailGateway_SendEmail(recipient,mail.subject,mail.body,
    {htmlBody:mail.htmlBody},{purpose:'DEV_SYNTHETIC_ECAS_EXT_SWAP_RENDER_TEST',
      eventKey:'ECAS_AUDIT_APPROVAL_DIGEST'});
  if(!response||response.ok!==true)throw Error('ECAS_NOTIFICATION_TEST_GATEWAY_FAILED');
  return{ok:true,synthetic:true,recipient:recipient,providerAccepted:true,
    providerId:String(response.id||''),queueMutated:false,actualEcasDelivery:false};
}
