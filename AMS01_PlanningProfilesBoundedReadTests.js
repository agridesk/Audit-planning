/***********************************************************************
 * FILE: AMS01_PlanningProfilesBoundedReadTests.js
 * BUILD: 2026-09-10_AMS01_2_PLANNING_PROFILES_BOUNDED_READ_TEST_R1
 *
 * Read-only regression/performance gate for PlanningProfilesService R3.
 ***********************************************************************/
var AMS01_PPS_BOUNDED_TEST_BUILD='2026-09-10_AMS01_2_PLANNING_PROFILES_BOUNDED_READ_TEST_R1';
function RUN_AMS01_2_PLANNING_PROFILES_BOUNDED_READ_REGRESSION(){
  var base=RUN_PLANNING_PROFILES_REGRESSION();
  var ss=SpreadsheetApp.getActive();
  var shC=ss.getSheetByName('Companies'),shA=ss.getSheetByName('Auditors');
  var cSource=shC?shC.getLastColumn():0,aSource=shA?shA.getLastColumn():0;
  var t0=Date.now();
  var result=PlanningProfilesService_get({});
  var wallMs=Date.now()-t0;
  var cm=result&&result.meta?result.meta.companyMeta||{}:{},am=result&&result.meta?result.meta.auditorMeta||{}:{};
  var checks=[
    {name:'baseRegressionGreen',ok:!!(base&&base.ok)},
    {name:'serviceSuccess',ok:!!(result&&result.success)},
    {name:'readOnly',ok:!!(result&&result.meta&&result.meta.writes===false)},
    {name:'companyOwner',ok:!!(result&&result.meta&&result.meta.canonicalOwners.company==='Companies')},
    {name:'auditorOwner',ok:!!(result&&result.meta&&result.meta.canonicalOwners.auditor==='Auditors')},
    {name:'companyBoundedWidth',ok:Number(cm.columnsRead||0)>0&&Number(cm.columnsRead||0)<=cSource},
    {name:'auditorBoundedWidth',ok:Number(am.columnsRead||0)>0&&Number(am.columnsRead||0)<=aSource},
    {name:'companyRowsPreserved',ok:Array.isArray(result.companies)&&result.companies.length>0},
    {name:'auditorRowsPreserved',ok:Array.isArray(result.auditors)&&result.auditors.length>0}
  ];
  var failed=checks.filter(function(x){return !x.ok;});
  var out={ok:failed.length===0,build:AMS01_PPS_BOUNDED_TEST_BUILD,serviceBuild:result?result.build:'',checks:checks,failed:failed,wallServerMs:wallMs,companies:{sourceColumns:cSource,columnsRead:Number(cm.columnsRead||0),sourceRows:Number(cm.sourceRows||0),returned:result&&result.companies?result.companies.length:0},auditors:{sourceColumns:aSource,columnsRead:Number(am.columnsRead||0),sourceRows:Number(am.sourceRows||0),returned:result&&result.auditors?result.auditors.length:0},devPerformance:result?result.devPerformance||null:null,baseRegression:base,businessDataWrites:false};
  Logger.log(JSON.stringify(out,null,2));return out;
}
