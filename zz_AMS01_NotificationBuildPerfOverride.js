/**
 * FILE: zz_AMS01_NotificationBuildPerfOverride.js
 * BUILD: AMS01_NOTIFICATION_BUILD_PERF_ZZ_20260909_R3_PLAN_CONTEXT_SINGLE_NORMALIZE
 *
 * RCA correction for V1.0 Save performance.
 * - PLAN reuses the already-current execution context/briefing assembled by
 *   StatusNotificationBridge instead of rereading audit context in Builder.
 * - Queue notification normalization runs exactly once; renderer consumes the
 *   normalized object directly instead of normalizing it a second time.
 *
 * Canonical event config, renderer choice, queue, hash/duplicate semantics and
 * 13-column queue schema remain unchanged.
 */
var AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD='AMS01_NOTIFICATION_BUILD_PERF_ZZ_20260909_R3_PLAN_CONTEXT_SINGLE_NORMALIZE';

function AMS01_NB_enrichPlanContext_(data){
  data=data||{};
  if(String(data.action||'').trim().toUpperCase()!=='PLAN') return data;
  var auditId=String(data.auditId||'').trim();
  if(!auditId||typeof StatusNotificationBridge_LoadEcasAuditBriefing_!=='function') return data;
  try{
    var b=StatusNotificationBridge_LoadEcasAuditBriefing_(auditId)||{};
    if(!b.company) return data;
    var out={};Object.keys(data).forEach(function(k){out[k]=data[k];});
    if(!out.company)out.company=b.company||'';
    if(!out.companyUid)out.companyUid=b.companyUid||'';
    if(!out.mpsNumber)out.mpsNumber=b.mpsNumber||'';
    if(!out.auditNumber)out.auditNumber=out.mpsNumber||b.mpsNumber||'';
    if(!Array.isArray(out.scopes)||!out.scopes.length)out.scopes=b.scopes||[];
    if(!Array.isArray(out.blocks)||!out.blocks.length)out.blocks=b.blocks||[];
    if(!Array.isArray(out.plannedDates)||!out.plannedDates.length)out.plannedDates=b.plannedDates||[];
    if(out.plannedHours==null||out.plannedHours==='')out.plannedHours=b.plannedHours;
    if(!out.planningJson)out.planningJson=b.planningJson||'';
    if(!out.auditorEmail)out.auditorEmail=b.auditorEmail||'';
    if(!out.auditorName)out.auditorName=b.auditorName||'';
    out.skipAuditBriefing=true;
    out.__ams01PlanContextReused=true;
    return out;
  }catch(e){return data;}
}

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
  n=n||{};var profile=String(n.rendererProfile||'').trim().toUpperCase(),rendered;
  if(profile==='RICH_OPERATIONAL'){NB_requireRenderer_('NB_renderRichOperational_',profile);rendered=NB_renderRichOperational_(n);}
  else if(profile==='APPROVAL_OPERATIONAL'){NB_requireRenderer_('NB_renderApprovalOperational_',profile);rendered=NB_renderApprovalOperational_(n);}
  else if(profile==='MANAGER_APPROVAL_OPERATIONAL'){NB_requireRenderer_('NB_renderManagerApprovalOperational_',profile);rendered=NB_renderManagerApprovalOperational_(n);}
  else if(profile==='EXTERNAL_OPERATIONAL'){NB_requireRenderer_('NB_renderExternalOperationalSingle_',profile);rendered=NB_renderExternalOperationalSingle_(n);}
  else if(profile==='WEEKLY'){NB_requireRenderer_('NB_renderWeekly_',profile);rendered=NB_renderWeekly_(n);}
  else if(profile==='COMPACT_LIFECYCLE'){NB_requireRenderer_('NB_renderCompactLifecycle_',profile);rendered=NB_renderCompactLifecycle_(n);}
  else throw new Error('AMS01_NB_renderNormalized_: unknown renderer profile: '+profile);
  rendered=rendered||{};return {subject:rendered.subject||'',body:rendered.body||'',htmlBody:rendered.htmlBody||'',rendererProfile:profile,eventFamily:n.eventFamily};
}

function NB_queueNotification_(recipientEmail,eventType,data){
  var t0=Date.now(),timing={build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD};
  data=AMS01_NB_enrichPlanContext_(data||{});
  timing.planContextReused=!!data.__ams01PlanContextReused;
  var eventCode=NB_eventCode_(eventType||data.eventType||data.type);
  var t=Date.now(),cfg=NB_getEventConfig_(eventCode);timing.configMs=Date.now()-t;
  if(!cfg.active){timing.totalMs=Date.now()-t0;return {success:true,skipped:true,reason:'EVENT_DISABLED',eventType:eventCode,__ams01BuildTiming:timing};}

  t=Date.now();var normalized=NB_normalizePayload_(eventCode,data,cfg);NB_assertRequiredReason_(eventCode,cfg,normalized);timing.normalizeMs=Date.now()-t;
  t=Date.now();var payload=AMS01_NB_payloadFromNormalized_(normalized,cfg,data);timing.payloadMapMs=Date.now()-t;
  t=Date.now();var built=NB_isDeferredExternalQueueEvent_(eventCode,cfg,payload)?NB_buildDeferredExternalQueuePreview_(eventCode,payload):AMS01_NB_renderNormalized_(normalized);timing.renderMs=Date.now()-t;

  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=NB_getQueueSheet_(ss,true),now=new Date(),tz=NB_getTz_(ss),hash=NB_hashQueueRow_(recipientEmail,eventCode,payload,built);
  t=Date.now();var duplicate=NB_recentQueueDuplicate_(sh,hash,eventCode,recipientEmail,payload.auditId);timing.duplicateMs=Date.now()-t;
  if(duplicate.found){timing.totalMs=Date.now()-t0;return {success:true,skipped:true,reason:'DUPLICATE_QUEUE_ROW',eventType:eventCode,recipient:NB_clean_(recipientEmail),auditId:NB_clean_(payload.auditId),duplicateRow:duplicate.row,duplicateStatus:duplicate.status,duplicateMatch:duplicate.match,__ams01BuildTiming:timing};}

  var effectiveRecipient=cfg.sendEmail&&!cfg.logOnly?NB_clean_(recipientEmail):'',initialStatus=cfg.sendEmail&&!cfg.logOnly?'PENDING':'AUDIT_TRAIL';
  t=Date.now();sh.appendRow([Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm'),initialStatus,eventCode,effectiveRecipient,NB_clean_(payload.auditId),NB_clean_(payload.company),built.subject,built.body,0,'',hash,'',JSON.stringify({payload:payload})]);timing.writeMs=Date.now()-t;timing.totalMs=Date.now()-t0;
  return {success:true,recipient:effectiveRecipient,eventType:eventCode,eventFamily:payload.eventFamily,rendererProfile:payload.rendererProfile,queueSheet:sh.getName(),status:initialStatus,__ams01BuildTiming:timing};
}

function AMS01_NotificationBuildPerfStatus(){return {success:true,active:true,build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD,normalizationPassesPerQueue:1,planContextReuse:true,queueSchemaColumns:13};}
