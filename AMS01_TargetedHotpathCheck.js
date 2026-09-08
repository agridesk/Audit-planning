/**
 * FILE: AMS01_TargetedHotpathCheck.js
 * BUILD: AMS01_TARGETED_HOTPATH_CHECK_20260908_R1
 * READ-ONLY: manager enrichment + notification build/render only.
 * Does not queue notifications and does not perform lifecycle actions.
 */
var AMS01_TARGETED_HOTPATH_CHECK_BUILD='AMS01_TARGETED_HOTPATH_CHECK_20260908_R1';

function AMS01_RunTargetedHotpathCheck(){
  var out={build:AMS01_TARGETED_HOTPATH_CHECK_BUILD,generatedAt:new Date().toISOString(),probes:[]};
  function probe_(label,fn){
    var t0=Date.now(),rec={label:label,ok:false,wallMs:0};
    try{rec.result=fn()||{};rec.ok=rec.result.success!==false&&rec.result.ok!==false;}catch(e){rec.error=String(e&&e.message?e.message:e);}
    rec.wallMs=Date.now()-t0;out.probes.push(rec);return rec;
  }

  var manager=probe_('Manager overview enrichment',function(){
    var r=getManagerV5OpenEnriched();
    return {success:!!(r&&r.success!==false),rows:r&&r.rows?r.rows.length:0,companyIndexBuild:(typeof AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD!=='undefined'?AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD:'')};
  });

  var notification=probe_('PLAN notification build and render',function(){
    var data={
      eventType:'AUDIT_PLANNED_BY_MANAGER',
      auditId:'AUD_CultiusItxartSCP_HQ_1777531729225_18',
      company:'Cultius Itxart SCP',
      auditorEmail:'david@agriqa.es',
      auditorName:'David Pastor',
      actor:'AMS01 targeted check',
      actorRole:'MANAGER',
      recipientRole:'auditor',
      scopes:['MPS-GAP','GRASP'],
      blocks:[{date:'2026-09-15',start:'09:00',end:'17:00'}],
      plannedDates:['2026-09-15'],
      plannedHours:8,
      planningWindowFrom:'2026-09-01',
      planningWindowTo:'2026-09-30'
    };
    var t1=Date.now();
    var q=NB_buildPayloadForQueue_('AUDIT_PLANNED_BY_MANAGER',data);
    var payloadMs=Date.now()-t1;
    var t2=Date.now();
    var rendered=NB_buildNotification_('AUDIT_PLANNED_BY_MANAGER',q);
    var renderMs=Date.now()-t2;
    return {success:!!rendered,payloadMs:payloadMs,renderMs:renderMs,totalMs:payloadMs+renderMs,notificationBuild:q&&q.__ams01NotificationBuild?q.__ams01NotificationBuild:'',subjectLength:rendered&&rendered.subject?String(rendered.subject).length:0,bodyLength:rendered&&rendered.body?String(rendered.body).length:0,htmlLength:rendered&&rendered.htmlBody?String(rendered.htmlBody).length:0};
  });

  out.summary={managerEnrichmentMs:manager.wallMs,planNotificationMs:notification.result?notification.result.totalMs:null,payloadMs:notification.result?notification.result.payloadMs:null,renderMs:notification.result?notification.result.renderMs:null};
  Logger.log('[AMS01_TARGETED_HOTPATH] '+JSON.stringify(out));
  return out;
}
