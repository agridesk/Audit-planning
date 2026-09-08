/**
 * FILE: zz_AMS01_NotificationBuildPerfOverride.js
 * BUILD: AMS01_NOTIFICATION_BUILD_PERF_ZZ_20260908_R1
 * DEV-only late-load performance override.
 *
 * Goals:
 * - keep Notification Queue and canonical payload semantics unchanged;
 * - avoid repeated Companies full-sheet reads within one notification build;
 * - cache audit briefing within the same execution;
 * - mark a queue payload as already briefed so the immediate renderer does not
 *   load the same audit briefing a second time.
 *
 * No delivery/status/planning truth changes.
 */
var AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD='AMS01_NOTIFICATION_BUILD_PERF_ZZ_20260908_R1';
var AMS01_NB_COMPANIES_EXEC_PACK=null;
var AMS01_NB_BRIEFING_EXEC_CACHE={};
var AMS01_NB_SCOPE_HEADER_EXEC_CACHE=null;

(function(){
  if(typeof NB_buildPayloadForQueue_!=='function'||typeof NB_loadAuditBriefing_!=='function') return;

  var canonicalBuildPayload_=NB_buildPayloadForQueue_;
  var canonicalLoadBriefing_=NB_loadAuditBriefing_;
  var canonicalLoadScopeHeaderMap_=(typeof NB_loadScopeHeaderMap_==='function')?NB_loadScopeHeaderMap_:null;

  function clean_(v){return String(v==null?'':v).trim();}
  function norm_(v){return clean_(v).toLowerCase();}
  function findCol_(hdr,names){
    var map={};
    for(var i=0;i<(hdr||[]).length;i++) map[norm_(hdr[i]).replace(/[^a-z0-9]+/g,'')]=i;
    for(var j=0;j<names.length;j++){
      var k=norm_(names[j]).replace(/[^a-z0-9]+/g,'');
      if(map[k]!==undefined) return map[k];
    }
    return -1;
  }
  function companiesPack_(ss){
    if(AMS01_NB_COMPANIES_EXEC_PACK) return AMS01_NB_COMPANIES_EXEC_PACK;
    ss=ss||SpreadsheetApp.getActiveSpreadsheet();
    var t0=Date.now();
    var sh=ss.getSheetByName('Companies');
    if(!sh) return null;
    var lr=sh.getLastRow(),lc=sh.getLastColumn();
    if(lr<1||lc<1) return null;
    var data=sh.getRange(1,1,lr,lc).getValues();
    var hdr=data[0]||[];
    var cUid=findCol_(hdr,['Company_UID','Company UID','CompanyUid']);
    var cName=findCol_(hdr,['Company','Company name','Name']);
    var byUid={},byName={};
    for(var r=1;r<data.length;r++){
      var row=data[r]||[];
      var uid=cUid>=0?norm_(row[cUid]):'';
      var nm=cName>=0?norm_(row[cName]):'';
      if(uid&&!byUid[uid]) byUid[uid]=row;
      if(nm&&!byName[nm]) byName[nm]=row;
    }
    AMS01_NB_COMPANIES_EXEC_PACK={hdr:hdr,data:data,byUid:byUid,byName:byName,readMs:Date.now()-t0};
    try{Logger.log('[AMS01_NB_COMPANIES_PACK] '+JSON.stringify({build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD,rows:Math.max(0,data.length-1),columns:lc,readMs:Date.now()-t0}));}catch(eLog){}
    return AMS01_NB_COMPANIES_EXEC_PACK;
  }
  function companyRow_(ss,uid,name){
    var p=companiesPack_(ss); if(!p) return null;
    return (uid&&p.byUid[norm_(uid)]) || (name&&p.byName[norm_(name)]) || null;
  }

  if(typeof NB_loadCompanyNumberForBriefing_==='function'){
    NB_loadCompanyNumberForBriefing_=function(ss,companyUid,companyName){
      try{
        var p=companiesPack_(ss),row=companyRow_(ss,companyUid,companyName); if(!p||!row) return '';
        var c=findCol_(p.hdr,['Number','MPS Number','MPS-number','MPS no','MPS No.']);
        return c>=0?clean_(row[c]):'';
      }catch(e){return '';}
    };
  }

  if(typeof NB_loadCompanyLocationsForBriefing_==='function'){
    NB_loadCompanyLocationsForBriefing_=function(ss,companyUid,companyName){
      var out=[];
      try{
        var p=companiesPack_(ss),row=companyRow_(ss,companyUid,companyName); if(!p||!row) return out;
        var cJson=findCol_(p.hdr,['Locations_JSON','Locations JSON','LocationsJson']);
        var cGps=findCol_(p.hdr,['GPS-data','GPS data','GPS']);
        var cComments=findCol_(p.hdr,['Comments','Comment']);
        var cCountry=findCol_(p.hdr,['Country']);
        out=NB_parseLocationsJson_(cJson>=0?clean_(row[cJson]):'');
        if(!out.length){
          var gps=cGps>=0?clean_(row[cGps]):'';
          var comments=cComments>=0?clean_(row[cComments]):'';
          if(gps||comments) out.push({active:true,code:'HQ',name:'HQ',gps:gps,comment:comments,country:cCountry>=0?clean_(row[cCountry]):''});
        }
      }catch(e){}
      return out;
    };
  }

  if(typeof NB_loadCompanyConstraintMeta_==='function'){
    NB_loadCompanyConstraintMeta_=function(ss,companyUid,companyName){
      var out={found:false};
      try{
        var p=companiesPack_(ss),row=companyRow_(ss,companyUid,companyName); if(!p||!row) return out;
        out.found=true;
        function v(names){var c=findCol_(p.hdr,names);return c>=0?clean_(row[c]):'';}
        out.preferredDays=v(['Preferred audit weekdays','Preferred weekdays','Preferred days','Audit weekdays','Preferred audit days']);
        out.avoidDays=v(['Avoid weekdays','Blocked weekdays','Company blocked weekdays','Not on weekdays','No audit weekdays']);
        out.timeFrom=v(['Preferred start time','Audit time from','Preferred time from','Time from']);
        out.timeTo=v(['Preferred end time','Audit time to','Preferred time to','Time to']);
      }catch(e){}
      return out;
    };
  }

  if(canonicalLoadScopeHeaderMap_){
    NB_loadScopeHeaderMap_=function(){
      if(AMS01_NB_SCOPE_HEADER_EXEC_CACHE) return AMS01_NB_SCOPE_HEADER_EXEC_CACHE;
      AMS01_NB_SCOPE_HEADER_EXEC_CACHE=canonicalLoadScopeHeaderMap_()||{};
      return AMS01_NB_SCOPE_HEADER_EXEC_CACHE;
    };
  }

  NB_loadAuditBriefing_=function(auditId,payload){
    var key=clean_(auditId||(payload&&payload.auditId));
    if(key&&AMS01_NB_BRIEFING_EXEC_CACHE[key]) return AMS01_NB_BRIEFING_EXEC_CACHE[key];
    var t0=Date.now();
    var out=canonicalLoadBriefing_(auditId,payload)||{};
    if(key) AMS01_NB_BRIEFING_EXEC_CACHE[key]=out;
    try{Logger.log('[AMS01_NB_BRIEFING] '+JSON.stringify({build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD,auditId:key,ms:Date.now()-t0,cached:false}));}catch(eLog){}
    return out;
  };

  NB_buildPayloadForQueue_=function(eventType,data){
    var out=canonicalBuildPayload_(eventType,data)||{};
    // The returned payload already contains the canonical normalized briefing
    // fields and validation result. Prevent NB_buildNotification_ from loading
    // the same audit briefing again in the same queue operation.
    out.skipAuditBriefing=true;
    out.__ams01NotificationBuild=AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD;
    return out;
  };
})();

function AMS01_NotificationBuildPerfStatus(){
  return {success:true,active:true,build:AMS01_NOTIFICATION_BUILD_PERF_ZZ_BUILD};
}
