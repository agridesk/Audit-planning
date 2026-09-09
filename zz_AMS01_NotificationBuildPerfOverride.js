/**
 * FILE: zz_AMS01_NotificationBuildPerfOverride.js
 * BUILD: AMS01_NOTIFICATION_BUILD_PERF_ZZ_20260909_R2_SINGLE_NORMALIZE
 *
 * RCA correction for V1.0 Save performance.
 * Canonical queue path normalized operational notification context twice:
 * once for queue payload and again for renderer dispatch. Operational
 * normalization can load audit/company/validation context and is expensive.
 *
 * This late-load override preserves canonical event config, normalized fields,
 * renderer selection, hash/duplicate semantics and the 13-column queue schema,
 * but performs exactly one normalization pass per queue operation.
 */
var AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD='AMS01_NOTIFICATION_BUILD_PERF_ZZ_20260909_R2_SINGLE_NORMALIZE';

function AMS01_NB_payloadFromNormalized_(n,cfg,data){
  n=n||{};cfg=cfg||{};data=data||{};
  return {
    eventType:n.eventType,eventFamily:n.eventFamily,rendererProfile:n.rendererProfile,deliveryProfile:n.deliveryProfile,
    company:n.company,companyUid:n.companyUid,auditId:n.auditId,auditNumber:n.auditNumber,mpsNumber:n.mpsNumber,
    actor:n.actor,actorRole:n.actorRole,recipientRole:n.recipientRole,recipientGroup:n.recipientGroup,
    comment:n.comment,reason:n.reason||n.comment,resultStatus:n.resultStatus,displayStatus:n.displayStatus,
    plannedDates:n.plannedDates,plannedHours:n.plannedHours,blocks:n.blocks,locations:n.locations,scopes:n.scopes,
    auditorEmail:n.auditorEmail,auditorName:n.auditorName,contactName:n.contactName,contactEmail:n.contactEmail,
    contactPhone:n.contactPhone,country:n.country,region:n.region,language:n.language,planningJson:n.planningJson,
    planningWindowFrom:n.planningWindowFrom,planningWindowTo:n.planningWindowTo,companyComments:n.companyComments,
    locationComments:n.locationComments,validation:n.validation,checks:n.checks,cta:n.cta,calendarLinks:n.calendarLinks,
    icsAttachments:NB_copyIcsAttachments_(data.icsAttachments),
    config:{
      active:!!cfg.active,sendEmail:!!cfg.sendEmail,logOnly:!!cfg.logOnly,consolidate:!!cfg.consolidate,
      bufferMinutes:Number(cfg.bufferMinutes||0),digestGroup:NB_clean_(cfg.digestGroup),templateFamily:NB_clean_(cfg.templateFamily),
      templateKeyDefault:NB_clean_(cfg.templateKeyDefault),fromEmail:NB_clean_(cfg.fromEmail||NB_DEFAULT_FROM_EMAIL),
      fromName:NB_clean_(cfg.fromName||NB_DEFAULT_FROM_NAME),replyTo:NB_clean_(cfg.replyTo||''),
      includeComment:!!cfg.includeComment,requireReason:!!cfg.requireReason
    }
  };
}

function AMS01_NB_renderNormalized_(n){
  n=n||{};
  var profile=String(n.rendererProfile||'').trim().toUpperCase();
  var rendered;
  if(profile==='RICH_OPERATIONAL'){NB_requireRenderer_('NB_renderRichOperational_',profile);rendered=NB_renderRichOperational_(n);}
  else if(profile==='APPROVAL_OPERATIONAL'){NB_requireRenderer_('NB_renderApprovalOperational_',profile);rendered=NB_renderApprovalOperational_(n);}
  else if(profile==='MANAGER_APPROVAL_OPERATIONAL'){NB_requireRenderer_('NB_renderManagerApprovalOperational_',profile);rendered=NB_renderManagerApprovalOperational_(n);}
  else if(profile==='EXTERNAL_OPERATIONAL'){NB_requireRenderer_('NB_renderExternalOperationalSingle_',profile);rendered=NB_renderExternalOperationalSingle_(n);}
  else if(profile==='WEEKLY'){NB_requireRenderer_('NB_renderWeekly_',profile);rendered=NB_renderWeekly_(n);}
  else if(profile==='COMPACT_LIFECYCLE'){NB_requireRenderer_('NB_renderCompactLifecycle_',profile);rendered=NB_renderCompactLifecycle_(n);}
  else throw new Error('AMS01_NB_renderNormalized_: unknown renderer profile: '+profile);
  rendered=rendered||{};
  return {subject:rendered.subject||'',body:rendered.body||'',htmlBody:rendered.htmlBody||'',rendererProfile:profile,eventFamily:n.eventFamily};
}

function NB_queueNotification_(recipientEmail,eventType,data){
  var t0=Date.now(),timing={build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD};
  data=data||{};
  var eventCode=NB_eventCode_(eventType||data.eventType||data.type);
  var t=Date.now(),cfg=NB_getEventConfig_(eventCode);timing.configMs=Date.now()-t;
  if(!cfg.active){timing.totalMs=Date.now()-t0;return {success:true,skipped:true,reason:'EVENT_DISABLED',eventType:eventCode,__ams01BuildTiming:timing};}

  t=Date.now();
  var normalized=NB_normalizePayload_(eventCode,data,cfg);
  NB_assertRequiredReason_(eventCode,cfg,normalized);
  timing.normalizeMs=Date.now()-t;

  t=Date.now();
  var payload=AMS01_NB_payloadFromNormalized_(normalized,cfg,data);
  timing.payloadMapMs=Date.now()-t;

  t=Date.now();
  var built=NB_isDeferredExternalQueueEvent_(eventCode,cfg,payload)
    ? NB_buildDeferredExternalQueuePreview_(eventCode,payload)
    : AMS01_NB_renderNormalized_(normalized);
  timing.renderMs=Date.now()-t;

  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=NB_getQueueSheet_(ss,true);
  var now=new Date();
  var tz=NB_getTz_(ss);
  var hash=NB_hashQueueRow_(recipientEmail,eventCode,payload,built);

  t=Date.now();
  var duplicate=NB_recentQueueDuplicate_(sh,hash,eventCode,recipientEmail,payload.auditId);
  timing.duplicateMs=Date.now()-t;
  if(duplicate.found){
    timing.totalMs=Date.now()-t0;
    return {success:true,skipped:true,reason:'DUPLICATE_QUEUE_ROW',eventType:eventCode,recipient:NB_clean_(recipientEmail),auditId:NB_clean_(payload.auditId),duplicateRow:duplicate.row,duplicateStatus:duplicate.status,duplicateMatch:duplicate.match,__ams01BuildTiming:timing};
  }

  var effectiveRecipient=cfg.sendEmail&&!cfg.logOnly?NB_clean_(recipientEmail):'';
  var initialStatus=cfg.sendEmail&&!cfg.logOnly?'PENDING':'AUDIT_TRAIL';
  t=Date.now();
  sh.appendRow([
    Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm'),initialStatus,eventCode,effectiveRecipient,
    NB_clean_(payload.auditId),NB_clean_(payload.company),built.subject,built.body,0,'',hash,'',JSON.stringify({payload:payload})
  ]);
  timing.writeMs=Date.now()-t;
  timing.totalMs=Date.now()-t0;

  return {success:true,recipient:effectiveRecipient,eventType:eventCode,eventFamily:payload.eventFamily,rendererProfile:payload.rendererProfile,queueSheet:sh.getName(),status:initialStatus,__ams01BuildTiming:timing};
}

function AMS01_NotificationBuildPerfStatus(){
  return {success:true,active:true,build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD,normalizationPassesPerQueue:1,queueSchemaColumns:13};
}
