/**
 * FILE: zz_AMS01_CompanyConstraintsPerfOverride.js
 * BUILD: AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_20260908_R4_COMPACT_INDEX_FIRST
 * DEV-only late-load performance override.
 *
 * Canonical Companies sheet remains truth.
 * - First tries CompaniesIndexService's compact cached NameCore index.
 * - Falls back to the proven bounded A:W execution index.
 * - No planning/status/save/availability ownership changes.
 */
var AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD='AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_20260908_R4_COMPACT_INDEX_FIRST';
var AMS01_COMPANY_CONSTRAINTS_EXEC_INDEX=null;
var AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS={};

(function(){
  if(typeof _mp_getCompanyConstraints_!=='function') return;
  var canonicalGet_=_mp_getCompanyConstraints_;
  var canonicalCached_=(typeof _mp_companyConstraintsCached_==='function')?_mp_companyConstraintsCached_:null;

  function clean_(v){return String(v==null?'':v).trim();}
  function resultKey_(company,location,uid){return clean_(uid)||('NM::'+clean_(company).toLowerCase()+'|'+clean_(location).toLowerCase());}

  function fromCompactIndex_(auditCompany,auditLocation,companyUid){
    try{
      if(typeof CompaniesIndex_GetCompanyCoreByName!=='function') return null;
      var rec=CompaniesIndex_GetCompanyCoreByName(auditCompany);
      if(!rec) return null;
      var uid=clean_(companyUid);
      if(uid&&clean_(rec.companyUid)!==uid) return null;

      var locSummary=rec.locationsSummary||{};
      var rawLocs=Array.isArray(locSummary.locations)?locSummary.locations:[];
      var locations=[];
      for(var i=0;i<rawLocs.length;i++){
        var l=rawLocs[i]||{};
        locations.push({
          code:clean_(l.code)||('L'+(i+1)),
          name:clean_(l.label||l.name)||clean_(auditLocation)||'Location',
          gps:clean_(l.gps),
          comment:clean_(l.comment)
        });
      }
      if(!locations.length){
        locations=[{code:'HQ',name:clean_(rec.location)||clean_(auditLocation)||'HQ',gps:clean_(rec.gpsData),comment:''}];
      }
      var hq=null;
      for(var j=0;j<locations.length;j++) if(String(locations[j].code||'').toUpperCase()==='HQ'){hq=locations[j];break;}
      if(!hq) hq=locations[0];

      var tw='';
      try{var p=V5_parseCompanyTimeWindow_(clean_(rec.hoursWorking));tw=p?p.normalized:'';}catch(eTw){}
      var out={
        matched:true,
        companyUid:clean_(rec.companyUid)||uid,
        timeZone:clean_(rec.timeZone),
        blockedWeekdays:clean_(rec.nonWorkingDays),
        comments:clean_(rec.comments),
        hqName:clean_(hq&&hq.name)||'HQ',
        hqGps:clean_(hq&&hq.gps),
        region:clean_(rec.region),
        country:clean_(rec.country),
        contactName:clean_(rec.contactName),
        contactEmail:clean_(rec.contactEmail),
        contactPhone:clean_(rec.contactPhone),
        number:clean_(rec.number),
        locationsCount:Number(rec.locationsCount||locations.length||1)||1,
        locations:locations,
        locationOptions:locations,
        locationsJson:'',
        slotTemplates:{locations:locations.map(function(loc){return {code:loc.code,label:loc.name,gps:loc.gps,comment:loc.comment};}),slots:[]},
        timeWindow:tw,
        __ams01CompanyConstraintsBuild:AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD,
        __ams01Source:'COMPANIES_INDEX_NAME_CORE',
        __ams01CompanyIndexReadMs:0,
        __ams01Ms:0
      };
      return out;
    }catch(e){ return null; }
  }

  function buildIndex_(ss){
    if(AMS01_COMPANY_CONSTRAINTS_EXEC_INDEX) return AMS01_COMPANY_CONSTRAINTS_EXEC_INDEX;
    var t0=Date.now();
    var sh=ss.getSheetByName('Companies');
    if(!sh) return null;
    var lastRow=sh.getLastRow();
    var width=Math.min(sh.getLastColumn(),23);
    if(lastRow<1||width<1) return null;
    var data=sh.getRange(1,1,lastRow,width).getValues();
    var hdr=data[0]||[];
    var uidCol=_mp_findCol_(hdr,['Company_UID','Company UID','UID']);
    if(uidCol<0) return null;
    var byUid={};
    for(var r=1;r<data.length;r++){
      var uid=clean_(data[r][uidCol]);
      if(uid&&!byUid[uid]) byUid[uid]={row:data[r],rowNumber:r+1};
    }
    AMS01_COMPANY_CONSTRAINTS_EXEC_INDEX={sh:sh,hdr:hdr,width:width,uidCol:uidCol,byUid:byUid,readMs:Date.now()-t0,rowsRead:Math.max(0,data.length-1)};
    try{Logger.log('[AMS01_COMPANY_INDEX] '+JSON.stringify({build:AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD,rowsRead:Math.max(0,data.length-1),width:width,mapSize:Object.keys(byUid).length,readMs:Date.now()-t0}));}catch(eLog){}
    return AMS01_COMPANY_CONSTRAINTS_EXEC_INDEX;
  }

  _mp_getCompanyConstraints_=function(ss,auditCompany,auditLocation,companyUid){
    var t0=Date.now();
    ss=ss||SpreadsheetApp.getActive();
    var uid=clean_(companyUid);
    var rk=resultKey_(auditCompany,auditLocation,uid);
    if(AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS[rk]) return AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS[rk];

    var compact=fromCompactIndex_(auditCompany,auditLocation,uid);
    if(compact){
      compact.__ams01Ms=Date.now()-t0;
      AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS[rk]=compact;
      return compact;
    }
    if(!uid) return canonicalGet_(ss,auditCompany,auditLocation,companyUid);

    try{
      var ix=buildIndex_(ss);
      if(!ix||!ix.byUid[uid]) return canonicalGet_(ss,auditCompany,auditLocation,companyUid);
      var hdr=ix.hdr||[];
      var rec=ix.byUid[uid];
      var row=rec.row||[];
      var data=[hdr,row];
      var cols={
        colUid:_mp_findCol_(hdr,['Company_UID','Company UID','UID']),colName:_mp_findCol_(hdr,['Company','Company name','Name']),colLoc:_mp_findCol_(hdr,['Location','Site','Locatie']),colTz:_mp_findCol_(hdr,['Time zone','Timezone','Time_zone']),colDays:_mp_findCol_(hdr,['Audit planning limitations days','Planning limitations days','Blocked weekdays']),colHours:_mp_findCol_(hdr,['Audit planning limitations hours','Planning limitations hours','Time window']),colGps:_mp_findCol_(hdr,['GPS-data','GPS data','GPS']),colRegion:_mp_findCol_(hdr,['Region','REGION']),colComments:_mp_findCol_(hdr,['Comments','Comment']),colLocCount:_mp_findCol_(hdr,['Locations_to_plan','Locations to plan','Locations count','Locations']),colLocationsJson:_mp_findCol_(hdr,['Locations_JSON','Locations JSON']),colSlotTemplates:_mp_findCol_(hdr,['Slot_Templates','Slot Templates'])
      };
      var bestRow=_mp_chooseBestCompanyRow_(data,cols.colUid,cols.colName,cols.colLoc,cols.colLocationsJson,cols.colSlotTemplates,uid,clean_(auditCompany),clean_(auditLocation));
      if(!bestRow) return canonicalGet_(ss,auditCompany,auditLocation,companyUid);
      var hqNameLegacy=cols.colLoc>=0?_mp_safeStr_(bestRow[cols.colLoc]):'';
      var hqGpsLegacy=cols.colGps>=0?_mp_safeStr_(bestRow[cols.colGps]):'';
      var rawLocationsJson=cols.colLocationsJson>=0?_mp_safeStr_(bestRow[cols.colLocationsJson]):'';
      var rawSlotTemplates=cols.colSlotTemplates>=0?_mp_safeStr_(bestRow[cols.colSlotTemplates]):'';
      var locations=_mp_parseLocationsJson_(rawLocationsJson,hqNameLegacy||auditLocation||'HQ',hqGpsLegacy);
      if(!locations||!locations.length||(locations.length===1&&!rawLocationsJson&&rawSlotTemplates)) locations=_mp_parseSlotTemplatesLocations_(rawSlotTemplates,hqNameLegacy||auditLocation||'HQ',hqGpsLegacy);
      if(!locations||!locations.length) locations=_mp_parseLocationsJson_('',hqNameLegacy||auditLocation||'HQ',hqGpsLegacy);
      var hqLoc=null;for(var li=0;li<locations.length;li++) if(String((locations[li]||{}).code||'')==='HQ'){hqLoc=locations[li];break;}
      var hqName=hqLoc&&_mp_safeStr_(hqLoc.name)?_mp_safeStr_(hqLoc.name):hqNameLegacy;
      var hqGps=hqLoc&&_mp_safeStr_(hqLoc.gps)?_mp_safeStr_(hqLoc.gps):hqGpsLegacy;
      var explicitLocCount=null;if(cols.colLocCount>=0){var n=Number(bestRow[cols.colLocCount]);if(isFinite(n)&&n>=1) explicitLocCount=Math.round(n);}
      var finalLocCount=explicitLocCount||(locations&&locations.length?locations.length:1)||1;
      var out={matched:true,companyUid:uid,timeZone:cols.colTz>=0?_mp_safeStr_(bestRow[cols.colTz]):'',blockedWeekdays:cols.colDays>=0?_mp_safeStr_(bestRow[cols.colDays]):'',comments:cols.colComments>=0?_mp_safeStr_(bestRow[cols.colComments]):'',hqName:hqName||'HQ',hqGps:hqGps,region:cols.colRegion>=0?_mp_safeStr_(bestRow[cols.colRegion]):'',locationsCount:finalLocCount,locations:locations,locationsJson:rawLocationsJson,slotTemplates:{locations:(locations||[]).map(function(loc){return {code:loc.code,label:loc.name,gps:loc.gps,comment:loc.comment};}),slots:[]},timeWindow:(function(){var raw=cols.colHours>=0?_mp_safeStr_(bestRow[cols.colHours]):'';var p=V5_parseCompanyTimeWindow_(raw);return p?p.normalized:'';})(),__ams01CompanyConstraintsBuild:AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD,__ams01Source:'EXEC_UID_INDEX_FALLBACK',__ams01CompanyIndexReadMs:ix.readMs,__ams01Ms:Date.now()-t0};
      AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS[rk]=out;
      return out;
    }catch(e){ return canonicalGet_(ss,auditCompany,auditLocation,companyUid); }
  };

  if(canonicalCached_){
    _mp_companyConstraintsCached_=function(ss,auditCompany,auditLocation,companyUid){
      var rk=resultKey_(auditCompany,auditLocation,companyUid);
      if(AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS[rk]) return AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS[rk];
      return _mp_getCompanyConstraints_(ss||SpreadsheetApp.getActive(),auditCompany,auditLocation,companyUid);
    };
  }
})();

function AMS01_CompanyConstraintsPerfStatus(){
  return {success:true,active:true,build:AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD,indexBuilt:!!AMS01_COMPANY_CONSTRAINTS_EXEC_INDEX,resultCount:Object.keys(AMS01_COMPANY_CONSTRAINTS_EXEC_RESULTS||{}).length,primarySource:'COMPANIES_INDEX_NAME_CORE'};
}
