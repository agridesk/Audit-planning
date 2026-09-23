/***********************************************************************
 * PlanningDemandServiceTests.js
 * BUILD: 2026-09-23_AMS01_2_PLANNING_DEMAND_TESTS_R4_BOUNDED_READ
 * Non-destructive regression + real-data DEV smoke/performance isolation.
 ***********************************************************************/

var PLANNING_DEMAND_TEST_BUILD = '2026-09-23_AMS01_2_PLANNING_DEMAND_TESTS_R4_BOUNDED_READ';

function PDS_TEST_assert_(cond, name, detail, results) { results.push({name:name,ok:!!cond,detail:cond?'':String(detail||'')}); }
function PDS_TEST_findSmokePeriod_(){var ss=SpreadsheetApp.getActive(),sh=ss.getSheetByName('Audit planning');if(!sh)throw new Error("Missing sheet 'Audit planning'");var values=sh.getDataRange().getValues();if(!values||values.length<2)throw new Error('Audit planning is empty');var hdr=values[0]||[],cStatus=PDS_findCol_(hdr,['Status']),cFrom=PDS_findCol_(hdr,['Planning window from','Plan van','Planning from','Planning start','Plan start']),cTo=PDS_findCol_(hdr,['Planning window to','Plan tot','Planning to','Planning end','Plan end']);if(cStatus<0||cFrom<0||cTo<0)throw new Error('Planning Demand smoke: required window/status columns missing');var tz=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();for(var r=1;r<values.length;r++){var st=PDS_clean_(values[r][cStatus]);if(!PDS_statusIncluded_(st))continue;var from=PDS_isoDate_(values[r][cFrom],tz),to=PDS_isoDate_(values[r][cTo],tz);if(from&&to&&to>=from)return{from:from,to:to}}throw new Error('Planning Demand smoke: no active audit with valid planning window found')}

function RUN_PLANNING_DEMAND_REGRESSION(){
 var results=[],p={from:'2026-01-01',to:'2026-01-31'};
 PDS_TEST_assert_(PDS_windowOverlaps_('2025-12-01','2026-01-01',p)===true,'overlapBoundaryStart','',results);
 PDS_TEST_assert_(PDS_windowOverlaps_('2026-01-31','2026-02-15',p)===true,'overlapBoundaryEnd','',results);
 PDS_TEST_assert_(PDS_windowOverlaps_('2025-10-01','2025-12-31',p)===false,'noOverlapBefore','',results);
 PDS_TEST_assert_(PDS_windowOverlaps_('2026-02-01','2026-03-01',p)===false,'noOverlapAfter','',results);
 PDS_TEST_assert_(PDS_statusIncluded_('Pending Planning')===true,'pendingPlanningIncluded','',results);
 PDS_TEST_assert_(PDS_statusIncluded_('Completed')===false,'completedExcluded','',results);
 PDS_TEST_assert_(PDS_urgency_('2025-12-31',p)==='OVERDUE','urgencyOverdue','',results);
 PDS_TEST_assert_(PDS_urgency_('2026-01-20',p)==='DUE_IN_PERIOD','urgencyDue','',results);
 PDS_TEST_assert_(PDS_urgency_('2026-02-20',p)==='OPEN_IN_PERIOD','urgencyOpen','',results);
 PDS_TEST_assert_(PDS_needsCompanyProjection_({},-1,-1)===false,'defaultSkipsCompanyProjection','default must stay hot',results);
 PDS_TEST_assert_(PDS_needsCompanyProjection_({includeCompanyMeta:true},-1,-1)===true,'explicitMetaLoadsCompanyProjection','explicit metadata',results);
 PDS_TEST_assert_(PDS_needsCompanyProjection_({country:'NL'},-1,-1)===true,'countryFilterLoadsCompanyProjection','filter needs canonical metadata',results);
 PDS_TEST_assert_(PDS_needsCompanyProjection_({region:'X'},-1,-1)===true,'regionFilterLoadsCompanyProjection','filter needs canonical metadata',results);
 var smokePeriod=PDS_TEST_findSmokePeriod_(),t0=Date.now(),smoke=PlanningDemandService_get({from:smokePeriod.from,to:smokePeriod.to,limit:50}),wallServerMs=Date.now()-t0;
 PDS_TEST_assert_(smoke&&smoke.success===true,'realDataSmokeSuccess',smoke&&smoke.message,results);
 PDS_TEST_assert_(smoke&&Array.isArray(smoke.rows),'realDataRowsArray','',results);
 PDS_TEST_assert_(smoke&&smoke.totals&&typeof smoke.totals.audits==='number','realDataTotals','',results);
 PDS_TEST_assert_(smoke&&smoke.meta&&smoke.meta.writes===false,'readOnlyContract','',results);
 PDS_TEST_assert_(smoke&&smoke.meta&&smoke.meta.companyProjectionUsed===false,'defaultSmokeSkipsCompanies','default path must not read Companies',results);
 PDS_TEST_assert_(smoke&&smoke.meta&&smoke.meta.companyMetaRequested===false,'defaultMetaNotRequested','',results);
 PDS_TEST_assert_(smoke&&smoke.meta&&smoke.meta.perfProbe&&typeof smoke.meta.perfProbe.scopeExtractMs==='number','perfProbeContract','',results);
 PDS_TEST_assert_(smoke&&smoke.meta&&smoke.meta.auditPlanningRead&&smoke.meta.auditPlanningRead.strategy==='FIXED_WINDOW','boundedAuditPlanningRead','Expected FIXED_WINDOW on current DEV dataset',results);
 PDS_TEST_assert_(smoke&&smoke.meta&&smoke.meta.auditPlanningRead&&smoke.meta.auditPlanningRead.fallback===false,'boundedAuditPlanningNoFallback','Current DEV dataset should fit guarded window',results);
 var failed=results.filter(function(x){return!x.ok}),out={ok:failed.length===0,build:PLANNING_DEMAND_TEST_BUILD,total:results.length,passed:results.length-failed.length,failed:failed.length,smokePeriod:smokePeriod,smokeReturned:smoke&&smoke.rows?smoke.rows.length:0,smokeCandidates:smoke&&smoke.meta?smoke.meta.periodCandidates:null,smokeServerMs:wallServerMs,companyProjectionUsed:smoke&&smoke.meta?smoke.meta.companyProjectionUsed:null,devPerformance:smoke?smoke.devPerformance||null:null,perfProbe:smoke&&smoke.meta?smoke.meta.perfProbe||null:null,results:results};Logger.log(JSON.stringify(out,null,2));return out;
}

function RUN_AMS01_2_PLANNING_DEMAND_PERF(){
 var period=PDS_TEST_findSmokePeriod_();
 function run_(label,includeCompanyMeta){var started=Date.now(),result=PlanningDemandService_get({from:period.from,to:period.to,limit:500,includeCompanyMeta:includeCompanyMeta});return{label:label,wallServerMs:Date.now()-started,returned:result&&result.rows?result.rows.length:0,candidates:result&&result.meta?result.meta.periodCandidates:null,companyProjectionUsed:result&&result.meta?result.meta.companyProjectionUsed:null,devPerformance:result?result.devPerformance||null:null,perfProbe:result&&result.meta?result.meta.perfProbe||null:null}}
 var defaultHotPath=run_('DEFAULT_HOT_PATH',undefined),explicitNoCompanyProjection=run_('EXPLICIT_NO_COMPANY_PROJECTION',false),withCompanyProjection=run_('WITH_COMPANY_PROJECTION',true),out={ok:defaultHotPath.companyProjectionUsed===false&&explicitNoCompanyProjection.companyProjectionUsed===false&&withCompanyProjection.companyProjectionUsed===true,build:PLANNING_DEMAND_TEST_BUILD,serviceBuild:PLANNING_DEMAND_BUILD,period:period,defaultHotPath:defaultHotPath,explicitNoCompanyProjection:explicitNoCompanyProjection,withCompanyProjection:withCompanyProjection,companyProjectionDeltaMs:withCompanyProjection.wallServerMs-defaultHotPath.wallServerMs};Logger.log(JSON.stringify(out,null,2));return out;
}