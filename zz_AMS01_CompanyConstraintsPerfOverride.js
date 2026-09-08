/**
 * FILE: zz_AMS01_CompanyConstraintsPerfOverride.js
 * BUILD: AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_20260908_R1
 * DEV-only late-load performance override.
 * Canonical Companies sheet remains truth. Uses Company_UID targeted lookup first;
 * falls back to the existing canonical implementation when UID lookup is unavailable.
 */
var AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD='AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_20260908_R1';

(function(){
  if(typeof _mp_getCompanyConstraints_!=='function') return;
  var canonical_=_mp_getCompanyConstraints_;

  _mp_getCompanyConstraints_=function(ss,auditCompany,auditLocation,companyUid){
    var t0=Date.now();
    ss=ss||SpreadsheetApp.getActive();
    var uid=String(companyUid||'').trim();
    if(!uid) return canonical_(ss,auditCompany,auditLocation,companyUid);

    try{
      var sh=ss.getSheetByName('Companies');
      if(!sh) return canonical_(ss,auditCompany,auditLocation,companyUid);
      var lastRow=sh.getLastRow();
      if(lastRow<2) return canonical_(ss,auditCompany,auditLocation,companyUid);

      // Current canonical Companies contract is contained within A:W.
      var width=Math.min(sh.getLastColumn(),23);
      var hdr=sh.getRange(1,1,1,width).getValues()[0]||[];
      var uidCol=_mp_findCol_(hdr,['Company_UID','Company UID','UID']);
      if(uidCol<0) return canonical_(ss,auditCompany,auditLocation,companyUid);

      var matches=sh.getRange(2,uidCol+1,lastRow-1,1)
        .createTextFinder(uid).matchEntireCell(true).matchCase(true).findAll()||[];
      if(!matches.length) return canonical_(ss,auditCompany,auditLocation,companyUid);

      var rn=matches[0].getRow();
      var row=sh.getRange(rn,1,1,width).getValues()[0]||[];
      var data=[hdr,row];
      var cols={
        colUid:_mp_findCol_(hdr,['Company_UID','Company UID','UID']),
        colName:_mp_findCol_(hdr,['Company','Company name','Name']),
        colLoc:_mp_findCol_(hdr,['Location','Site','Locatie']),
        colTz:_mp_findCol_(hdr,['Time zone','Timezone','Time_zone']),
        colDays:_mp_findCol_(hdr,['Audit planning limitations days','Planning limitations days','Blocked weekdays']),
        colHours:_mp_findCol_(hdr,['Audit planning limitations hours','Planning limitations hours','Time window']),
        colGps:_mp_findCol_(hdr,['GPS-data','GPS data','GPS']),
        colRegion:_mp_findCol_(hdr,['Region','REGION']),
        colComments:_mp_findCol_(hdr,['Comments','Comment']),
        colLocCount:_mp_findCol_(hdr,['Locations_to_plan','Locations to plan','Locations count','Locations']),
        colLocationsJson:_mp_findCol_(hdr,['Locations_JSON','Locations JSON']),
        colSlotTemplates:_mp_findCol_(hdr,['Slot_Templates','Slot Templates'])
      };
      var bestRow=_mp_chooseBestCompanyRow_(data,cols.colUid,cols.colName,cols.colLoc,cols.colLocationsJson,cols.colSlotTemplates,uid,String(auditCompany||'').trim(),String(auditLocation||'').trim());
      if(!bestRow) return canonical_(ss,auditCompany,auditLocation,companyUid);

      var hqNameLegacy=cols.colLoc>=0?_mp_safeStr_(bestRow[cols.colLoc]):'';
      var hqGpsLegacy=cols.colGps>=0?_mp_safeStr_(bestRow[cols.colGps]):'';
      var rawLocationsJson=cols.colLocationsJson>=0?_mp_safeStr_(bestRow[cols.colLocationsJson]):'';
      var rawSlotTemplates=cols.colSlotTemplates>=0?_mp_safeStr_(bestRow[cols.colSlotTemplates]):'';
      var locations=_mp_parseLocationsJson_(rawLocationsJson,hqNameLegacy||auditLocation||'HQ',hqGpsLegacy);
      if(!locations||!locations.length||(locations.length===1&&!rawLocationsJson&&rawSlotTemplates)) locations=_mp_parseSlotTemplatesLocations_(rawSlotTemplates,hqNameLegacy||auditLocation||'HQ',hqGpsLegacy);
      if(!locations||!locations.length) locations=_mp_parseLocationsJson_('',hqNameLegacy||auditLocation||'HQ',hqGpsLegacy);
      var hqLoc=null;
      for(var li=0;li<locations.length;li++) if(String((locations[li]||{}).code||'')==='HQ'){hqLoc=locations[li];break;}
      var hqName=hqLoc&&_mp_safeStr_(hqLoc.name)?_mp_safeStr_(hqLoc.name):hqNameLegacy;
      var hqGps=hqLoc&&_mp_safeStr_(hqLoc.gps)?_mp_safeStr_(hqLoc.gps):hqGpsLegacy;
      var explicitLocCount=null;
      if(cols.colLocCount>=0){var n=Number(bestRow[cols.colLocCount]);if(isFinite(n)&&n>=1) explicitLocCount=Math.round(n);}
      var finalLocCount=explicitLocCount||(locations&&locations.length?locations.length:1)||1;
      var out={
        matched:true,
        companyUid:uid,
        timeZone:cols.colTz>=0?_mp_safeStr_(bestRow[cols.colTz]):'',
        blockedWeekdays:cols.colDays>=0?_mp_safeStr_(bestRow[cols.colDays]):'',
        comments:cols.colComments>=0?_mp_safeStr_(bestRow[cols.colComments]):'',
        hqName:hqName||'HQ',hqGps:hqGps,
        region:cols.colRegion>=0?_mp_safeStr_(bestRow[cols.colRegion]):'',
        locationsCount:finalLocCount,locations:locations,locationsJson:rawLocationsJson,
        slotTemplates:{locations:(locations||[]).map(function(loc){return {code:loc.code,label:loc.name,gps:loc.gps,comment:loc.comment};}),slots:[]},
        timeWindow:(function(){var raw=cols.colHours>=0?_mp_safeStr_(bestRow[cols.colHours]):'';var p=V5_parseCompanyTimeWindow_(raw);return p?p.normalized:'';})(),
        __ams01CompanyConstraintsBuild:AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD,
        __ams01Source:'TARGETED_COMPANY_UID',
        __ams01Ms:Date.now()-t0
      };
      try{Logger.log('[AMS01_COMPANY_CONSTRAINTS] '+JSON.stringify({build:AMS01_COMPANY_CONSTRAINTS_PERF_ZZ_BUILD,uid:uid,row:rn,width:width,ms:Date.now()-t0}));}catch(eLog){}
      return out;
    }catch(e){
      return canonical_(ss,auditCompany,auditLocation,companyUid);
    }
  };
})();
