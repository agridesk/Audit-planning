/**
 * FILE: CompaniesIndexBatchPlanningLocationMetadata.gs
 * BUILD: 2026-09-17_COMPANIES_INDEX_BATCH_LOCATION_METADATA_R1
 *
 * Compatibility wrapper for Batch Planning location metadata.
 * Keeps CompaniesIndexService V4 AMS01 hot-path architecture untouched.
 * Reads canonical Companies.Locations_JSON only when Batch Planning explicitly needs
 * separatePlanningStop/defaultPlanningHours metadata.
 */
var COMPANIES_INDEX_BATCH_LOCATION_METADATA_BUILD='2026-09-17_COMPANIES_INDEX_BATCH_LOCATION_METADATA_R1';
function CompaniesIndexBatchPlanning_GetLocations(companyUid,companyName){
 var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Companies');if(!sh)return{ok:false,error:'COMPANIES_SHEET_NOT_FOUND',locations:[]};
 var vals=sh.getDataRange().getValues();if(!vals.length)return{ok:false,error:'COMPANY_NOT_FOUND',locations:[]};
 var idx=CompaniesIndex_headerMap_(vals[0]),uidNeed=CompaniesIndex_clean_(companyUid),nameNeed=CompaniesIndex_nameKey_(companyName);
 for(var r=1;r<vals.length;r++){var row=vals[r]||[],uid=CompaniesIndex_clean_(CompaniesIndex_val_(row,idx,['Company_UID','Company UID','CompanyUID','COMPANY_UID','UID'])),name=CompaniesIndex_clean_(CompaniesIndex_val_(row,idx,['Company','Company name','Name','Bedrijf','COMPANY']));if((uidNeed&&uid===uidNeed)||(!uidNeed&&nameNeed&&CompaniesIndex_nameKey_(name)===nameNeed)){var raw=CompaniesIndex_clean_(CompaniesIndex_val_(row,idx,['Locations_JSON','Locations JSON','LocationsJSON'])),legacyLocation=CompaniesIndex_clean_(CompaniesIndex_val_(row,idx,['Location','HQ Location','HQ'])),legacyGps=CompaniesIndex_clean_(CompaniesIndex_val_(row,idx,['GPS-data','GPS data','GPS','GPS HQ']));return{ok:true,owner:'Companies.Locations_JSON',companyUid:uid,companyName:name,locations:CompaniesIndexBatchPlanning_parse_(raw,legacyLocation,legacyGps)};}}
 return{ok:false,error:'COMPANY_NOT_FOUND',locations:[]};
}
function CompaniesIndexBatchPlanning_parse_(raw,legacyLocation,legacyGps){
 if(!raw)return(legacyLocation||legacyGps)?[{code:'HQ',label:legacyLocation||'',gps:legacyGps||'',comment:'',separatePlanningStop:false,defaultPlanningHours:null}]:[];
 try{var p=JSON.parse(raw),list=p&&Array.isArray(p.locations)?p.locations:(Array.isArray(p)?p:[]);return list.map(function(loc,i){loc=loc||{};var h=loc.defaultPlanningHours;h=(h==null||h==='')?null:Number(h);if(h!=null&&!isFinite(h))h=null;return{code:CompaniesIndex_clean_(loc.code)||('L'+(i+1)),label:CompaniesIndex_clean_(loc.label||loc.name||loc.location),gps:CompaniesIndex_clean_(loc.gps||loc.GPS||loc.gpsData),comment:CompaniesIndex_clean_(loc.comment||loc.notes),separatePlanningStop:loc.separatePlanningStop===true,defaultPlanningHours:h};}).filter(function(loc){return !!(loc.label||loc.gps||loc.comment);});}catch(e){return(legacyLocation||legacyGps)?[{code:'HQ',label:legacyLocation||'',gps:legacyGps||'',comment:'',separatePlanningStop:false,defaultPlanningHours:null}]:[];}
}
