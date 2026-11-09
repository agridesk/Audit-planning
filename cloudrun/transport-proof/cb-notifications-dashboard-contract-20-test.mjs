import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const server=read('./server-r15.js'),ui=read('./notification-manager-20.html');
const sender=read('../../NotificationSender.js'),cb=read('../../CB_Extension_Notifications_20.js');
const builder=read('./certification-body-extension-outbox-20.mjs');
const script=ui.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script);
new vm.Script(script);
new vm.Script(cb);new vm.Script(sender);
assert(server.includes('/^CB_EXTENSION_(APPLIED|UNDONE)$/'),'Server must recognize both CB events');
assert(ui.includes('/^CB_EXTENSION_(APPLIED|UNDONE)$/'),'Manager dashboard must enforce event-specific minimum');
assert(server.includes("minutes<10"),'API must reject CB delay under 10 minutes');
assert(ui.includes("minimum=isCb?10:0"),'UI must show CB minimum delay');
assert(server.includes("u.pathname==='/api/v1/notifications-manager-20/cb-settings'"));
assert(server.includes("notificationCbSettingMutation(req,res)"));
assert(server.includes("['Notification_Email','Email_Verified','Notification_Enabled']"));
assert(server.includes("['SUBJECT_TEMPLATE','TEXT_BODY']"));
assert(server.includes("CB_SETTING_STALE_RELOAD_REQUIRED"));
assert(server.includes("emailRequiresReverification"));
assert(server.includes("'Certification_Bodies',200"));
assert(server.includes("'Notification_Templates',200"));
assert(ui.includes("['Email_Verified',cb.emailVerified"));
assert(ui.includes("['Notification_Enabled',cb.notificationsEnabled"));
assert(ui.includes("Save email"));
assert(ui.includes('For ECAS, Extension / Undo uses the existing Dutch ECAS_AUDIT_APPROVAL_DIGEST email layout'));
assert(ui.includes("cb.certificationBodyId==='ECAS'?'ECAS_AUDIT_APPROVAL_DIGEST':'CB_EXTENSION_NOTIFICATION'"),'CB card must display the selected template per CB');
assert(ui.includes('notificationName(e)'),'Extension cards must show readable titles like other notifications');
assert(ui.includes('notificationTemplate(e)'),'Extension cards must show correct ECAS/other CB template context');
assert(ui.includes('ECAS_AUDIT_|CB_EXTENSION_'),'Extensions must be grouped with audit notifications');
assert(!ui.includes('Preview message'),'Existing dashboard must not show email examples');
assert(!ui.includes('Save subject')&&!ui.includes('Save body'),'No separate template editor');
assert(cb.includes("latest.Certification_Body_ID==='ECAS'"),'Only the ECAS CB may select its Dutch digest');
assert(cb.includes("'ECAS_AUDIT_APPROVAL_DIGEST':'CB_EXTENSION_NOTIFICATION'"),'Each CB must use the intended existing template');
assert(cb.includes("'CB_EXTENSION_NOTIFICATION'"),'Other CBs retain their own template');
assert(sender.includes("ep.certificationBodyId==='ECAS'"),'Sender must route by canonical CB identity');
assert(sender.includes('NB_renderEcasExtensionDigest_'),'ECAS extension must reuse the Ecert digest HTML renderer');
const legacyEcas=read('../../NotificationRenderer_PlanningToClientDigest.js');
assert(legacyEcas.includes('function NB_renderEcasExtensionDigest_'),'ECAS extension renderer must exist within the established digest file');
assert(legacyEcas.includes('NB_externalShellStart_()')&&legacyEcas.includes("NB_externalTh_('MPS No.'"),'ECAS extension renderer must use the existing six-column horizontal digest table');
assert(ui.includes("cb.recentErrors"));
assert(ui.includes("cb.nextDue"));
assert(sender.includes("cfg={...cfg,consolidate:false,bufferMinutes:0,digestGroup:'CB_EXTENSION_SINGLE'}"),'Do not wait twice');
assert(sender.includes('CB_Extension_Outbox_PreflightSend_'),'Sender must check current CB recipient');
assert(cb.includes("active.getId()!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'"),'DEV-only GAS fence');
assert(cb.includes("['SENT','TESTED']"),'DEV test messages must count as communicated');
assert(builder.includes('previousWindowFrom')&&builder.includes('newWindowTo'),'Proof must include before/after window');
assert(!builder.includes('planning@ecas.nl'),'No hardcoded CB email');
// Smoke the actual ECAS HTML rendering with the established Ecert helpers.
const start=legacyEcas.indexOf('function NB_renderEcasExtensionDigest_(');
assert(start>=0);
const testContext={
 NB_externalShellStart_:()=>'<div class="ecas-shell">',
 NB_externalShellEnd_:()=>'</div>',
 NB_externalTh_:v=>'<th>'+v+'</th>',
 NB_externalTd_:v=>'<td>'+v+'</td>',
 NB_externalOperationalSubject_:()=> 'Overzicht auditopdrachten Ecert — test'
};
vm.runInNewContext(legacyEcas.slice(start),testContext);
const extensionPayload={certificationBodyId:'ECAS',rendererProfile:'ECAS_AUDIT_APPROVAL_DIGEST',
 templateKey:'ECAS_AUDIT_APPROVAL_DIGEST',extensionDetails:{
 COMPANY_NAME:'Test grower',MPS_NUMBER:'913496',SCOPE_NAME:'ABC',
 PREVIOUS_EXPIRY:'2026-12-31',EFFECTIVE_EXPIRY:'2027-03-31',CHANGED_AT:'2026-11-09'}};
const apply=testContext.NB_renderEcasExtensionDigest_('',{eventCode:'CB_EXTENSION_APPLIED',payload:extensionPayload});
assert(apply.htmlBody.includes('ecas-shell')&&apply.htmlBody.includes('Verlengingen'));
assert(apply.body.includes('Verlenging toegepast'));
assert.equal((apply.htmlBody.match(/<th>/g)||[]).length,6,'Six horizontal headers expected');
assert.equal((apply.htmlBody.match(/<td>/g)||[]).length,6,'One horizontal row and six cells expected');
assert(apply.body.includes('31-12-2026')&&apply.body.includes('31-03-2027'),'Show before and after expiry dates');
assert(!/planningperiode|gewijzigd op|oorspronkelijke vervaldatum|extensions \/ undo/i.test(apply.htmlBody),'Remove extra operational fields');
for(const h of ['MPS No.','Bedrijf','Scope','Vorige vervaldatum','Nieuwe vervaldatum','Wijziging']){
 assert(apply.htmlBody.includes('<th>'+h+'</th>'),'Missing compact header '+h);
}
assert(apply.htmlBody.includes('Verlengingen'),'Use Dutch section title');
const combinedSection=testContext.NB_ecasExtensionsSectionHtml_([
 {eventCode:'CB_EXTENSION_APPLIED',payload:extensionPayload},
 {eventCode:'CB_EXTENSION_UNDONE',payload:extensionPayload}
]);
assert.equal((combinedSection.match(/<th>/g)||[]).length,6,'Combined ECAS section has exactly six headers');
assert.equal((combinedSection.match(/<td>/g)||[]).length,12,'Combined ECAS section has both extension rows');
assert(!combinedSection.includes('Hallo,')&&!combinedSection.includes('Bedankt,'),'Embedded section must have no standalone greeting/footer');
assert(testContext.NB_ecasExtensionsSectionText_([{eventCode:'CB_EXTENSION_APPLIED',payload:extensionPayload}]).includes('31-03-2027'));
assert(sender.includes('Opportunistic inclusion only'),'Only already-due ECAS groups may combine');
assert(sender.includes("CB_Extension_Outbox_RecordDelivery_(group.items.filter"),'Mixed delivery receipt must only record extension rows');
assert(sender.includes('CB_Extension_Outbox_PreflightSend_([ext],group.recipient)'),'Each extension requires individual current-state preflight');


const withMps=testContext.NB_renderEcasExtensionDigest_('',{eventCode:'CB_EXTENSION_APPLIED',payload:{...extensionPayload,extensionDetails:{...extensionPayload.extensionDetails,MPS_NUMBER:'913496'}}});
assert(withMps.htmlBody.includes('MPS No.')&&withMps.body.includes('913496'),'ECAS renderer shows canonical MPS number when present');
const undo=testContext.NB_renderEcasExtensionDigest_('',{eventCode:'CB_EXTENSION_UNDONE',payload:extensionPayload});
assert(undo.body.includes('Verlenging ingetrokken'));
assert(undo.body.includes('31-12-2026')&&undo.body.includes('31-03-2027'),'Undo still shows previous and current dates');
assert.throws(()=>testContext.NB_renderEcasExtensionDigest_('',{eventCode:'CB_EXTENSION_APPLIED',
 payload:{...extensionPayload,extensionDetails:{...extensionPayload.extensionDetails,MPS_NUMBER:''}}}),/MISSING_MPS_NUMBER/);

assert.throws(()=>testContext.NB_renderEcasExtensionDigest_('',{eventCode:'CB_EXTENSION_APPLIED',
 payload:{...extensionPayload,certificationBodyId:'OTHER'}}),/IDENTITY_MISMATCH/);


// Verify the actual NotificationSender dispatch selects the ECAS HTML renderer.
const sendStart=sender.indexOf('function ns_buildDigestEmail_(');
const sendEnd=sender.indexOf('function ns_buildDigestEmailFallback_(',sendStart);
assert(sendStart>=0&&sendEnd>sendStart);
const senderContext={
 NB_renderEcasExtensionDigest_:testContext.NB_renderEcasExtensionDigest_,
 NS_DEFAULT_FROM_EMAIL:'',NS_DEFAULT_FROM_NAME:'AMS',String,Array,Error
};
vm.runInNewContext(sender.slice(sendStart,sendEnd),senderContext);
const ecMail=senderContext.ns_buildDigestEmail_('test@example.invalid',[{
 eventCode:'CB_EXTENSION_APPLIED',subject:'',body:'',
 payload:{...extensionPayload,cbEventId:'CB_EXT_TEST'}
}]);
assert(ecMail.htmlBody.includes('ecas-shell'),'ECAS must send HTML using existing Ecert shell');
assert(ecMail.body.includes('Verlenging toegepast'));
assert.throws(()=>senderContext.ns_buildDigestEmail_('test@example.invalid',[{
 eventCode:'CB_EXTENSION_UNDONE',payload:{...extensionPayload,templateKey:'CB_EXTENSION_NOTIFICATION',cbEventId:'CB_EXT_TEST'}
}]),/ECAS_EXTENSION_TEMPLATE_UNAVAILABLE/);
const generic=senderContext.ns_buildDigestEmail_('other@example.invalid',[{
 eventCode:'CB_EXTENSION_APPLIED',subject:'Other CB subject',body:'Other CB body',
 payload:{certificationBodyId:'CB-OTHER',templateKey:'CB_EXTENSION_NOTIFICATION',cbEventId:'CB_EXT_OTHER'}
}]);
assert.equal(generic.htmlBody,'');
assert.equal(generic.subject,'Other CB subject');


const notificationBuilder=read('../../NotificationBuilder.js');
new vm.Script(notificationBuilder);
const builderCtx={
  NB_getEventConfig_:()=>({digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL'}),
  NB_normalizePayload_:(code,payload)=>({...payload,eventFamily:'EXTERNAL_OPERATIONAL'}),
  NB_resolveRendererProfile_:()=> 'EXTERNAL_OPERATIONAL',
  NB_renderExternalOperationalDigest_:()=>({
    subject:'Combined test',
    body:'Hallo,\n\nAudit rows\n\nBedankt,\n\nRené Rombouts',
    htmlBody:'<div>Hallo, Audit rows<div style="border-top:1px solid #111827;margin:18px 0 14px 0"></div>Bedankt</div>'
  }),
  NB_ecasExtensionsSectionHtml_:testContext.NB_ecasExtensionsSectionHtml_,
  NB_ecasExtensionsSectionText_:testContext.NB_ecasExtensionsSectionText_
};
const digestStart=notificationBuilder.indexOf('function NB_renderDigestEmail_(');
const digestEnd=notificationBuilder.indexOf('function NB_buildPayloadForQueue_(',digestStart);
assert(digestStart>=0&&digestEnd>digestStart,'Digest function source must exist');
vm.runInNewContext(notificationBuilder.slice(digestStart,digestEnd),builderCtx);
const mixedRendered=builderCtx.NB_renderDigestEmail_('ecas@example.invalid',[
 {eventCode:'ECAS_AUDIT_APPROVAL_DIGEST',payload:{company:'Test grower'}},
 {eventCode:'CB_EXTENSION_APPLIED',payload:extensionPayload}
]);
assert.equal((mixedRendered.htmlBody.match(/Verlengingen/g)||[]).length,1);
assert(mixedRendered.htmlBody.indexOf('Verlengingen')<mixedRendered.htmlBody.indexOf('Bedankt'));
assert(mixedRendered.body.includes('31-03-2027'));
assert.equal((mixedRendered.body.match(/Bedankt,/g)||[]).length,1,'One shared sign-off');

console.log('CB EXT/Undo dashboard configuration contract PASS');