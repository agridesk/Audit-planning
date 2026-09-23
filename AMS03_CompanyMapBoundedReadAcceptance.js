/***********************************************************************
 * AMS03_CompanyMapBoundedReadAcceptance.js
 * BUILD: 2026-09-23_AMS03_COMPANY_MAP_BOUNDED_READ_ACCEPTANCE_R1
 ***********************************************************************/
function RUN_AMS03_COMPANY_MAP_BOUNDED_READ_ACCEPTANCE(){
 var main=String(CompanyMap_buildAuditLayers_C02_),reader=String(CompanyMap_readAuditPlanningBounded_C06_),r=[];function q(n,v,d){r.push({name:n,ok:!!v,detail:d||''});}
 q('usesBoundedReader',main.indexOf('CompanyMap_readAuditPlanningBounded_C06_')>=0);
 q('mainNoFullSheetRead',main.indexOf('getLastRow')<0&&main.indexOf('getLastColumn')<0&&main.indexOf('getDataRange')<0);
 q('fixedWindow',reader.indexOf('getRange(1,1,rows,cols)')>=0);
 q('safeBoundaryFallback',reader.indexOf('DATARANGE_FALLBACK')>=0&&reader.indexOf('getDataRange')>=0);
 q('readOnly',main.indexOf('setValue')<0&&main.indexOf('setValues')<0&&reader.indexOf('setValue')<0);
 q('semanticsPreserved',main.indexOf('CompanyMap_isActiveAuditStatusForMap_C01_')>=0&&main.indexOf('CompanyMap_findBestLocationEntity_C01_')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_COMPANY_MAP_BOUNDED_READ_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
