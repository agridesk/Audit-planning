/**
 * FILE: zz_AMS01_PlanQueueFirstPerfOverride.js
 * BUILD: AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_20260908_R1
 * DEV-only performance override.
 *
 * AUDIT_PLANNED_BY_MANAGER is queued with a lightweight, lossless core payload.
 * Expensive briefing/rotation/qualification/rich rendering is deferred to
 * NotificationSender -> NB_renderDigestEmail_, which already owns final mail
 * rendering from the queued payload.
 *
 * Queue remains SSoT. No lifecycle/planning/status/availability decision moves.
 */
var AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_BUILD='AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_20260908_R1';
var AMS01_PLAN_QUEUE_FIRST_NEXT_PREVIEW=false;

(function(){
  if(typeof NB_buildPayloadForQueue_!=='function'||typeof NB_buildNotification_!=='function') return;

  var canonicalBuildPayload_=NB_buildPayloadForQueue_;
  var canonicalBuildNotification_=NB_buildNotification_;

  function clean_(v){return String(v==null?'':v).trim();}
  function copyArray_(v){return Array.isArray(v)?v.slice():[];}
  function eventCode_(v){
    try{return typeof NB_eventCode_==='function'?NB_eventCode_(v):clean_(v).toUpperCase();}
    catch(e){return clean_(v).toUpperCase();}
  }

  function buildPlanCorePayload_(eventCode,data){
    data=data||{};
    var cfg=(typeof NB_getEventConfig_==='function')?(NB_getEventConfig_(eventCode)||{}):{};
    var family=(typeof NB_resolveEventFamily_==='function')?NB_resolveEventFamily_(eventCode,cfg):'RICH_OPERATIONAL';
    var profile=(typeof NB_resolveRendererProfile_==='function')?NB_resolveRendererProfile_(eventCode,cfg,{eventFamily:family}):'RICH_OPERATIONAL';
    var delivery=(typeof NB_resolveDeliveryProfile_==='function')?NB_resolveDeliveryProfile_(eventCode,cfg):'';
    var resultStatus=clean_(data.resultStatus||'Approved');
    var recipientRole=clean_(data.recipientRole);
    var displayStatus=(typeof NB_displayResultStatus_==='function')?NB_displayResultStatus_(eventCode,resultStatus,recipientRole):resultStatus;

    return {
      eventType:eventCode,
      eventFamily:family,
      rendererProfile:profile,
      deliveryProfile:delivery,
      company:clean_(data.company),
      companyUid:clean_(data.companyUid||data.companyUID),
      auditId:clean_(data.auditId),
      auditNumber:clean_(data.auditNumber||data.mpsNumber||data.number),
      mpsNumber:clean_(data.mpsNumber||data.auditNumber||data.number),
      actor:clean_(data.actor||data.actorEmail||data.actorName),
      actorRole:clean_(data.actorRole),
      recipientRole:recipientRole,
      recipientGroup:clean_(data.recipientGroup||cfg.recipientTarget||cfg.recipientMode),
      comment:clean_(data.comment),
      reason:clean_(data.reason||data.comment),
      resultStatus:resultStatus,
      displayStatus:displayStatus,
      plannedDates:copyArray_(data.plannedDates),
      plannedHours:data.plannedHours!=null?data.plannedHours:'',
      blocks:copyArray_(data.blocks),
      locations:copyArray_(data.locations),
      scopes:copyArray_(data.scopes),
      auditorEmail:clean_(data.auditorEmail),
      auditorName:clean_(data.auditorName),
      contactName:clean_(data.contactName),
      contactEmail:clean_(data.contactEmail),
      contactPhone:clean_(data.contactPhone),
      country:clean_(data.country),
      region:clean_(data.region),
      language:clean_(data.language),
      planningJson:clean_(data.planningJson),
      planningWindowFrom:clean_(data.planningWindowFrom||data.planFrom||data.windowFrom),
      planningWindowTo:clean_(data.planningWindowTo||data.planTo||data.windowTo),
      companyComments:clean_(data.companyComments||data.comments),
      locationComments:clean_(data.locationComments),
      cta:data.cta||null,
      calendarLinks:copyArray_(data.calendarLinks),
      icsAttachments:(typeof NB_copyIcsAttachments_==='function')?NB_copyIcsAttachments_(data.icsAttachments):[],
      config:{
        active:!!cfg.active,
        sendEmail:!!cfg.sendEmail,
        logOnly:!!cfg.logOnly,
        consolidate:!!cfg.consolidate,
        bufferMinutes:Number(cfg.bufferMinutes||0),
        digestGroup:clean_(cfg.digestGroup),
        templateFamily:clean_(cfg.templateFamily),
        templateKeyDefault:clean_(cfg.templateKeyDefault),
        fromEmail:clean_(cfg.fromEmail||''),
        fromName:clean_(cfg.fromName||''),
        replyTo:clean_(cfg.replyTo||''),
        includeComment:!!cfg.includeComment,
        requireReason:!!cfg.requireReason
      },
      __ams01QueueFirst:true,
      __ams01QueueFirstBuild:AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_BUILD
    };
  }

  NB_buildPayloadForQueue_=function(eventType,data){
    var code=eventCode_(eventType||(data&&data.eventType)||(data&&data.type));
    if(code!=='AUDIT_PLANNED_BY_MANAGER') return canonicalBuildPayload_(eventType,data);

    var t0=Date.now();
    var out=buildPlanCorePayload_(code,data||{});
    AMS01_PLAN_QUEUE_FIRST_NEXT_PREVIEW=true;
    try{Logger.log('[AMS01_PLAN_QUEUE_FIRST] '+JSON.stringify({build:AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_BUILD,auditId:out.auditId,payloadMs:Date.now()-t0,blocks:out.blocks.length,scopes:out.scopes.length}));}catch(eLog){}
    return out;
  };

  NB_buildNotification_=function(eventType,data){
    var code=eventCode_(eventType||(data&&data.eventType)||(data&&data.type));
    if(code==='AUDIT_PLANNED_BY_MANAGER'&&AMS01_PLAN_QUEUE_FIRST_NEXT_PREVIEW===true){
      AMS01_PLAN_QUEUE_FIRST_NEXT_PREVIEW=false;
      data=data||{};
      var subject=(typeof NB_subjectForEvent_==='function')?NB_subjectForEvent_(code,clean_(data.company),clean_(data.auditId)):'Audit planned by manager';
      var lines=['Audit planned by manager'];
      if(data.company) lines.push('Company: '+clean_(data.company));
      if(data.auditId) lines.push('Audit ID: '+clean_(data.auditId));
      if(data.auditorEmail) lines.push('Auditor: '+clean_(data.auditorEmail));
      if(data.plannedDates&&data.plannedDates.length) lines.push('Planned: '+data.plannedDates.join(', '));
      return {
        subject:subject,
        body:lines.join('\n'),
        htmlBody:'',
        rendererProfile:clean_(data.rendererProfile||'RICH_OPERATIONAL'),
        eventFamily:clean_(data.eventFamily||'RICH_OPERATIONAL'),
        deferredQueuePreview:true,
        __ams01QueueFirstBuild:AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_BUILD
      };
    }
    return canonicalBuildNotification_(eventType,data);
  };
})();

function AMS01_PlanQueueFirstPerfStatus(){
  return {success:true,active:true,build:AMS01_PLAN_QUEUE_FIRST_PERF_ZZ_BUILD};
}
