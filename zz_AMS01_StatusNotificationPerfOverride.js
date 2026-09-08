/**
 * FILE: zz_AMS01_StatusNotificationPerfOverride.js
 * BUILD: AMS01_STATUS_NOTIFICATION_PERF_ZZ_20260908_R3
 * DEV-only late-load override for AMS-01 notification performance validation.
 * R3: reuse execution-local status row and briefing result; no repeated AP row read.
 */
var AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD='AMS01_STATUS_NOTIFICATION_PERF_ZZ_20260908_R3';
var AMS01_COMPANY_NUMBER_CACHE_KEY='AMS01_COMPANY_NUMBER_BY_UID_V2';
var AMS01_COMPANY_NUMBER_EXEC_CACHE=null;
var AMS01_ACCEPT_BRIEFING_EXEC_CACHE={};

function StatusNotificationBridge_QueueWithLock_(recipientEmail,eventCode,queuePayload,auditId){
  var lock=LockService.getScriptLock(),acquired=false,txStarted=Date.now(),txId=Utilities.getUuid();
  var action=queuePayload&&queuePayload.action?String(queuePayload.action):'';
  var actorRole=queuePayload&&queuePayload.actorRole?String(queuePayload.actorRole):'';
  try{
    acquired=lock.tryLock(5000);var waitMs=Date.now()-txStarted;
    if(!acquired){var deferred={success:false,retryable:true,reason:'QUEUE_LOCK_TIMEOUT_RECONCILER_FALLBACK',bufferedBy:'AcceptedNotificationReconciler',recipient:String(recipientEmail||'').trim(),eventType:String(eventCode||'').trim(),auditId:String(auditId||'').trim(),txId:txId,waitMs:waitMs};StatusNotificationBridge_Diag_('QUEUE_LOCK_TIMEOUT_AMS01',auditId||'',action,actorRole,'','',false,'Notification Queue lock not acquired within 5 seconds; reconciler fallback.',deferred);return deferred;}
    var q0=Date.now(),result=NB_queueNotification_(recipientEmail,eventCode,queuePayload);
    try{Logger.log('[AMS01_QUEUE_TX] '+JSON.stringify({build:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,txId:txId,eventCode:eventCode||'',auditId:auditId||'',waitMs:waitMs,queueMs:Date.now()-q0,totalMs:Date.now()-txStarted,success:!!(result&&result.success!==false),skipped:!!(result&&result.skipped===true)}));}catch(eLog){}
    return result;
  }catch(e){var msg=String(e&&e.message?e.message:e),failed={success:false,retryable:true,reason:'QUEUE_WRITE_ERROR',error:msg,recipient:String(recipientEmail||'').trim(),eventType:String(eventCode||'').trim(),auditId:String(auditId||'').trim(),txId:txId};StatusNotificationBridge_Diag_('QUEUE_WRITE_ERROR_AMS01',auditId||'',action,actorRole,'','',false,msg,failed);return failed;}
  finally{if(acquired){try{lock.releaseLock();}catch(eRelease){}}}
}

function StatusNotificationBridge_QueueAcceptedExternalDigest_(recipientEmail,queuePayload){
  var auditId='';
  try{
    if(typeof NB_queueNotification_!=='function')return null;
    recipientEmail=StatusNotificationBridge_GetEcasRecipientEmail_();if(!recipientEmail)return null;
    queuePayload=queuePayload||{};auditId=String(queuePayload.auditId||'').trim();if(!auditId)return null;
    var briefing={auditId:auditId,company:String(queuePayload.company||'').trim(),companyUid:String(queuePayload.companyUid||'').trim(),mpsNumber:StatusNotificationBridge_NormalizeMpsNumber_(queuePayload.mpsNumber||queuePayload.auditNumber||''),scopes:Array.isArray(queuePayload.scopes)?queuePayload.scopes:[],blocks:Array.isArray(queuePayload.blocks)?queuePayload.blocks:[],plannedDates:Array.isArray(queuePayload.plannedDates)?queuePayload.plannedDates:[],plannedHours:queuePayload.plannedHours,planningJson:queuePayload.planningJson||'',auditorEmail:String(queuePayload.auditorEmail||'').trim(),auditorName:String(queuePayload.auditorName||'').trim()};
    var has=!!(queuePayload.skipAuditBriefing===true&&briefing.company&&briefing.auditorEmail&&briefing.blocks.length&&briefing.plannedHours!==''&&briefing.plannedHours!==null&&typeof briefing.plannedHours!=='undefined');
    if(!has)briefing=StatusNotificationBridge_LoadEcasAuditBriefing_(auditId);
    var externalPayload={};Object.keys(queuePayload).forEach(function(k){externalPayload[k]=queuePayload[k];});
    externalPayload.eventType='ECAS_AUDIT_APPROVAL_DIGEST';externalPayload.type='ECAS_AUDIT_APPROVAL_DIGEST';externalPayload.auditId=auditId;externalPayload.company=briefing.company||externalPayload.company||'';externalPayload.mpsNumber=StatusNotificationBridge_NormalizeMpsNumber_(briefing.mpsNumber||externalPayload.mpsNumber||externalPayload.auditNumber||'');externalPayload.auditNumber=externalPayload.mpsNumber;externalPayload.scopes=briefing.scopes||[];externalPayload.blocks=briefing.blocks||[];externalPayload.plannedDates=briefing.plannedDates||[];externalPayload.plannedHours=briefing.plannedHours;externalPayload.planningJson=briefing.planningJson||'';externalPayload.auditorEmail=briefing.auditorEmail||'';externalPayload.auditorName=briefing.auditorName||'';externalPayload.recipientRole='PLANNING';externalPayload.recipientEmail=recipientEmail;externalPayload.resultStatus='Accepted';externalPayload.skipAuditBriefing=true;externalPayload.config={consolidate:true,bufferMinutes:10,digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL'};
    StatusNotificationBridge_AssertEcasBriefingComplete_(externalPayload);
    return StatusNotificationBridge_QueueWithLock_(recipientEmail,'ECAS_AUDIT_APPROVAL_DIGEST',externalPayload,auditId);
  }catch(e){var msg=String(e&&e.message?e.message:e);StatusNotificationBridge_Diag_('ECAS_EXTERNAL_DIGEST_ERROR_AMS01',auditId||'','ACCEPT','AUDITOR','','',false,msg,{error:msg});return null;}
}

function AMS01_normHeader_(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');}
function AMS01_findHeaderIndex_(headers,aliases){
  var wanted={};for(var a=0;a<aliases.length;a++)wanted[AMS01_normHeader_(aliases[a])]=true;
  for(var i=0;i<(headers||[]).length;i++){if(wanted[AMS01_normHeader_(headers[i])])return i;}
  return -1;
}
function AMS01_GetCompanyNumberByUid_(ss,companyUid){
  var uid=String(companyUid||'').trim();if(!uid)return '';
  if(AMS01_COMPANY_NUMBER_EXEC_CACHE&&Object.prototype.hasOwnProperty.call(AMS01_COMPANY_NUMBER_EXEC_CACHE,uid))return AMS01_COMPANY_NUMBER_EXEC_CACHE[uid]||'';
  var map=null;
  try{var raw=CacheService.getScriptCache().get(AMS01_COMPANY_NUMBER_CACHE_KEY);if(raw)map=JSON.parse(raw);}catch(eCache){map=null;}
  if(!map){
    map={};
    try{
      ss=ss||SpreadsheetApp.getActiveSpreadsheet()||SpreadsheetApp.getActive();var sh=ss&&ss.getSheetByName('Companies');if(!sh)return '';
      var lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();if(lastRow<2||lastCol<1)return '';
      var hdr=sh.getRange(1,1,1,lastCol).getDisplayValues()[0]||[];
      var uidCol=AMS01_findHeaderIndex_(hdr,['Company_UID','Company UID','CompanyUID','COMPANY_UID','UID']);
      var numCol=AMS01_findHeaderIndex_(hdr,['Number','Company Number','Client Number','Customer Number']);
      if(uidCol<0||numCol<0){try{Logger.log('[AMS01_COMPANY_NUMBER_INDEX] '+JSON.stringify({build:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,uidCol:uidCol,numCol:numCol,headers:hdr}));}catch(eHdr){}return '';}
      var minCol=Math.min(uidCol,numCol)+1,width=Math.abs(numCol-uidCol)+1;
      var vals=sh.getRange(2,minCol,lastRow-1,width).getDisplayValues(),uidOff=uidCol-(minCol-1),numOff=numCol-(minCol-1);
      for(var i=0;i<vals.length;i++){var u=String(vals[i][uidOff]||'').trim();if(u)map[u]=StatusNotificationBridge_NormalizeMpsNumber_(vals[i][numOff]||'');}
      try{var json=JSON.stringify(map);if(json.length<90000)CacheService.getScriptCache().put(AMS01_COMPANY_NUMBER_CACHE_KEY,json,900);}catch(ePut){}
      try{Logger.log('[AMS01_COMPANY_NUMBER_INDEX] '+JSON.stringify({build:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,uidCol:uidCol,numCol:numCol,rows:lastRow-1,mapSize:Object.keys(map).length}));}catch(eLog){}
    }catch(eBuild){map={};try{Logger.log('[AMS01_COMPANY_NUMBER_INDEX_ERROR] '+String(eBuild&&eBuild.message?eBuild.message:eBuild));}catch(eLog2){}}
  }
  AMS01_COMPANY_NUMBER_EXEC_CACHE=map;return map[uid]||'';
}

function StatusNotificationBridge_LoadEcasAuditBriefing_(auditId){
  auditId=String(auditId||'').trim();
  if(!auditId)return {auditId:'',company:'',companyUid:'',mpsNumber:'',scopes:[],blocks:[],plannedDates:[],plannedHours:'',planningJson:'',auditorEmail:'',auditorName:'',__ams01BriefingBuild:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,__ams01MpsSource:''};
  if(AMS01_ACCEPT_BRIEFING_EXEC_CACHE[auditId]){
    var cached=AMS01_ACCEPT_BRIEFING_EXEC_CACHE[auditId];
    try{Logger.log('[AMS01_ACCEPT_BRIEFING] '+JSON.stringify({build:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,auditId:auditId,row:cached.__rowNumber||0,indexFromCache:true,mpsSource:cached.__ams01MpsSource,scopes:cached.scopes.length,blocks:cached.blocks.length,source:'BRIEFING_EXEC_CACHE'}));}catch(eCacheLog){}
    return cached;
  }
  var out={auditId:auditId,company:'',companyUid:'',mpsNumber:'',scopes:[],blocks:[],plannedDates:[],plannedHours:'',planningJson:'',auditorEmail:'',auditorName:'',__ams01BriefingBuild:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,__ams01MpsSource:'',__rowNumber:0};
  try{
    var ss=SpreadsheetApp.getActiveSpreadsheet()||SpreadsheetApp.getActive();if(!ss)return out;
    var pack=null,source='';
    if(typeof AMS01_STATUS_AUDIT_CONTEXT_CACHE==='object'&&AMS01_STATUS_AUDIT_CONTEXT_CACHE&&AMS01_STATUS_AUDIT_CONTEXT_CACHE[auditId]){pack=AMS01_STATUS_AUDIT_CONTEXT_CACHE[auditId];source='STATUS_EXEC_CONTEXT';}
    if(!pack&&typeof __mp_getAuditPlanningRow_==='function'){pack=__mp_getAuditPlanningRow_(ss,auditId);source='AP_ROW_INDEX';}
    if(!pack||!pack.row||!pack.hdr)return out;
    var hdr=pack.hdr||[],row=pack.row||[],idx=StatusNotificationBridge_HeaderMapLoose_(hdr);out.__rowNumber=pack.rowNumber||0;
    out.company=StatusNotificationBridge_CellLoose_(row,idx,['Company','Company name','Client','Customer','Organisation','Organization']);
    out.companyUid=StatusNotificationBridge_CellLoose_(row,idx,['Company_UID','Company UID','CompanyUID','UID','Company Id','Company ID']);
    out.mpsNumber=AMS01_GetCompanyNumberByUid_(ss,out.companyUid);if(out.mpsNumber)out.__ams01MpsSource='CompactUidNumberIndex';
    if(!out.mpsNumber){out.mpsNumber=StatusNotificationBridge_ExtractMpsNumberFromAuditRow_(hdr,row,idx,row);if(out.mpsNumber)out.__ams01MpsSource='AuditPlanningRow';}
    if(!out.mpsNumber){out.mpsNumber=StatusNotificationBridge_LoadMpsNumberFromCompaniesByUid_(ss,out.companyUid);if(out.mpsNumber)out.__ams01MpsSource='CompaniesFallback';}
    out.planningJson=StatusNotificationBridge_CellLoose_(row,idx,['Planning JSON','PlanningJSON','Planning','Planning json','Planning_Js','Planning js']);out.scopes=StatusNotificationBridge_ExtractScopesFromAuditRow_(hdr,row);
    var parsed=StatusNotificationBridge_ParsePlanningJson_(out.planningJson);out.blocks=parsed.blocks;out.plannedDates=parsed.plannedDates;out.plannedHours=parsed.plannedHours;out.auditorEmail=parsed.auditorEmail;out.auditorName=parsed.auditorName;if(!out.plannedHours&&out.blocks.length)out.plannedHours=StatusNotificationBridge_SumBlockHours_(out.blocks);
    AMS01_ACCEPT_BRIEFING_EXEC_CACHE[auditId]=out;
    try{Logger.log('[AMS01_ACCEPT_BRIEFING] '+JSON.stringify({build:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,auditId:auditId,row:pack.rowNumber||0,indexFromCache:!!pack.indexFromCache,mpsSource:out.__ams01MpsSource,scopes:out.scopes.length,blocks:out.blocks.length,source:source}));}catch(eLog){}
  }catch(e){try{Logger.log('[AMS01_ACCEPT_BRIEFING_ERROR] '+String(e&&e.message?e.message:e));}catch(eLog2){}}
  return out;
}

function AMS01_StatusNotificationPerfZZStatus(){
  var auditId='AUD_ProducciónOrnamental_HQ_1777531729474_68',t0=Date.now(),b=StatusNotificationBridge_LoadEcasAuditBriefing_(auditId);
  return {success:true,active:!!(b&&b.__ams01BriefingBuild===AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD),build:AMS01_STATUS_NOTIFICATION_PERF_ZZ_BUILD,wallMs:Date.now()-t0,mpsSource:b&&b.__ams01MpsSource||'',briefingBuild:b&&b.__ams01BriefingBuild||''};
}
