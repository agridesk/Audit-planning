/***********************************************************************
 * FILE: AMS01_PlanningProfilesReadPerfTests.js
 * BUILD: 2026-09-10_AMS01_2_PROFILES_READ_ISOLATION_R3_FIXED_BLOCK
 * Read-only benchmark. No business-data writes.
 ***********************************************************************/
var AMS01_PROFILES_READ_TEST_BUILD='2026-09-10_AMS01_2_PROFILES_READ_ISOLATION_R3_FIXED_BLOCK';
function AMS01_PPR_measure_(label,fn){var t=Date.now(),v=fn(),ms=Date.now()-t;return{label:label,ms:ms,value:v};}
function AMS01_PPR_sheet_(name){var sh=SpreadsheetApp.getActive().getSheetByName(name);if(!sh)throw new Error('Missing sheet: '+name);return sh;}
function AMS01_PPR_read_(sh,row,col,numRows,numCols){return sh.getRange(row,col,numRows,numCols).getValues();}
function AMS01_PPR_shape_(values){return{rows:values.length,cols:values.length&&values[0]?values[0].length:0};}
function AMS01_PPR_nonEmptyRows_(values){var n=0;for(var r=0;r<(values||[]).length;r++){var row=values[r]||[],any=false;for(var c=0;c<row.length;c++){if(String(row[c]==null?'':row[c]).trim()!==''){any=true;break;}}if(any)n=r+1;}return n;}
function RUN_AMS01_2_PLANNING_PROFILES_READ_PERF(){var companies=AMS01_PPR_sheet_('Companies'),auditors=AMS01_PPR_sheet_('Auditors'),tests=[];
tests.push(AMS01_PPR_measure_('companies_getLastRow',function(){return companies.getLastRow();}));tests.push(AMS01_PPR_measure_('companies_getLastColumn',function(){return companies.getLastColumn();}));
var cr=Math.max(0,companies.getLastRow()-1),cc=companies.getLastColumn();
tests.push(AMS01_PPR_measure_('companies_fixed_256x32_first',function(){var v=AMS01_PPR_read_(companies,1,1,256,32);return{shape:AMS01_PPR_shape_(v),nonEmptyRows:AMS01_PPR_nonEmptyRows_(v)};}));tests.push(AMS01_PPR_measure_('companies_fixed_256x32_second',function(){var v=AMS01_PPR_read_(companies,1,1,256,32);return{shape:AMS01_PPR_shape_(v),nonEmptyRows:AMS01_PPR_nonEmptyRows_(v)};}));
tests.push(AMS01_PPR_measure_('companies_dataRange',function(){return AMS01_PPR_shape_(companies.getDataRange().getValues());}));
tests.push(AMS01_PPR_measure_('auditors_getLastRow',function(){return auditors.getLastRow();}));tests.push(AMS01_PPR_measure_('auditors_getLastColumn',function(){return auditors.getLastColumn();}));
var ar=Math.max(0,auditors.getLastRow()-1),ac=auditors.getLastColumn();
tests.push(AMS01_PPR_measure_('auditors_fixed_32x32_first',function(){var v=AMS01_PPR_read_(auditors,1,1,32,32);return{shape:AMS01_PPR_shape_(v),nonEmptyRows:AMS01_PPR_nonEmptyRows_(v)};}));tests.push(AMS01_PPR_measure_('auditors_fixed_32x32_second',function(){var v=AMS01_PPR_read_(auditors,1,1,32,32);return{shape:AMS01_PPR_shape_(v),nonEmptyRows:AMS01_PPR_nonEmptyRows_(v)};}));
tests.push(AMS01_PPR_measure_('auditors_dataRange',function(){return AMS01_PPR_shape_(auditors.getDataRange().getValues());}));
var t=Date.now(),profiles=PlanningProfilesService_get({includeCompanies:true,includeAuditors:true,precomputedEvidence:{activeScopeNames:(typeof PCRM_activeScopeNames_==='function'?PCRM_activeScopeNames_():[])}}),serviceMs=Date.now()-t;var out={ok:!!(profiles&&profiles.success),build:AMS01_PROFILES_READ_TEST_BUILD,rows:{companies:cr,auditors:ar},columns:{companies:cc,auditors:ac},tests:tests,serviceWallMs:serviceMs,servicePerformance:profiles?profiles.devPerformance||null:null,businessDataWrites:false};Logger.log(JSON.stringify(out,null,2));return out;}
