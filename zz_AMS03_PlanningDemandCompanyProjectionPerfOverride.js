/***********************************************************************
 * zz_AMS03_PlanningDemandCompanyProjectionPerfOverride.js
 * BUILD: 2026-09-23_AMS03_PLANNING_DEMAND_COMPANY_PROJECTION_CACHE_R1
 *
 * Planning 2.0 performance override.
 * Reuses the existing canonical Companies read cache instead of performing
 * a second direct Companies range read inside Planning Demand.
 *
 * Governance:
 * - read-only
 * - no new SSoT
 * - Companies remains canonical owner
 * - existing cache invalidation remains authoritative
 ***********************************************************************/
var AMS03_PLANNING_DEMAND_COMPANY_PROJECTION_CACHE_BUILD='2026-09-23_AMS03_PLANNING_DEMAND_COMPANY_PROJECTION_CACHE_R1';

function PDS_companyProjection_(ss,cs,cc,cu){
  var needed={};
  for(var i=0;i<(cs||[]).length;i++){
    var row=cs[i].row||[];
    var company=cc>=0?PDS_clean_(row[cc]):'';
    var uid=cu>=0?PDS_clean_(row[cu]):'';
    needed[PDS_companyLookupKey_(uid,company)]=true;
    if(company)needed['NAME::'+PDS_norm_(company).replace(/\s+/g,' ')]=true;
  }

  var pack=null;
  if(typeof __mp_getSheetDataPersistCached_==='function'){
    pack=__mp_getSheetDataPersistCached_(ss,'Companies',300);
  }else if(typeof __mp_getSheetDataCached_==='function'){
    pack=__mp_getSheetDataCached_(ss,'Companies');
  }

  var sh=pack&&pack.sh?pack.sh:ss.getSheetByName('Companies');
  if(!sh)return{byKey:{},rowsRead:0,colsRead:0,preferredMonthsColumnFound:false,cacheTier:'MISS'};

  var values=pack&&Array.isArray(pack.data)?pack.data:null;
  if(!values){
    var lr=sh.getLastRow(),lc=sh.getLastColumn();
    values=lr>0&&lc>0?sh.getRange(1,1,lr,lc).getValues():[];
  }
  if(!values||values.length<2)return{byKey:{},rowsRead:0,colsRead:values&&values.length?(values[0]||[]).length:0,preferredMonthsColumnFound:false,cacheTier:pack?'CACHE':'DIRECT'};

  var h=values[0]||[];
  var iu=PDS_findCol_(h,['Company_UID','Company UID','CompanyUID','UID']);
  var inm=PDS_findCol_(h,['Company','Company name','Name','Bedrijf']);
  var ic=PDS_findCol_(h,['Country']);
  var ir=PDS_findCol_(h,['Region']);
  var ip=PDS_findCol_(h,['Preferred audit months','Preferred Audit Months','Preferred_audit_months','PreferredAuditMonths']);
  if(inm<0)return{byKey:{},rowsRead:Math.max(0,values.length-1),colsRead:h.length,preferredMonthsColumnFound:ip>=0,cacheTier:pack?'CACHE':'DIRECT'};

  var byKey={};
  for(var r=1;r<values.length;r++){
    var a=values[r]||[];
    var uid=iu>=0?PDS_clean_(a[iu]):'';
    var name=PDS_clean_(a[inm]);
    if(!name&&!uid)continue;
    var uk=uid?'UID::'+uid:'';
    var nk=name?'NAME::'+PDS_norm_(name).replace(/\s+/g,' '):'';
    if(!(uk&&needed[uk])&&!(nk&&needed[nk]))continue;
    var core={
      companyUid:uid,
      companyName:name,
      country:ic>=0?PDS_clean_(a[ic]):'',
      region:ir>=0?PDS_clean_(a[ir]):'',
      preferredAuditMonths:ip>=0?PDS_preferredMonths_(a[ip]):[]
    };
    if(uk)byKey[uk]=core;
    if(nk)byKey[nk]=core;
  }

  return{
    byKey:byKey,
    rowsRead:Math.max(0,values.length-1),
    colsRead:h.length,
    preferredMonthsColumnFound:ip>=0,
    cacheTier:pack?'CACHE':'DIRECT',
    build:AMS03_PLANNING_DEMAND_COMPANY_PROJECTION_CACHE_BUILD
  };
}

function AMS03_PlanningDemandCompanyProjectionPerfOverride_contract(){
  return{
    build:AMS03_PLANNING_DEMAND_COMPANY_PROJECTION_CACHE_BUILD,
    canonicalOwner:'Companies',
    readOnly:true,
    newSsot:false,
    cacheOwner:'existing AuditPlanningPerfCache',
    invalidationOwner:'existing Companies cache invalidation'
  };
}
