/***********************************************************************
 * ConceptPlanningDateSlotAdvisoryTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_DATE_SLOT_ADVISORY_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/
var CONCEPT_DATE_SLOT_TEST_BUILD='2026-09-09_ROADMAP_2_4_CONCEPT_DATE_SLOT_ADVISORY_TESTS_R1';
function CDSAT_assert_(name,condition,detail,out){var ok=!!condition;out.push({name:name,ok:ok,detail:ok?'':String(detail||'failed')});}
function RUN_CONCEPT_DATE_SLOT_ADVISORY_REGRESSION(){
  var results=[];
  var days=CDSA_days_('2026-09-01','2026-09-05',62);
  CDSAT_assert_('dateRangeInclusive',days.length===5&&days[0]==='2026-09-01'&&days[4]==='2026-09-05','inclusive range',results);
  CDSAT_assert_('dateRangeBounded',CDSA_days_('2026-01-01','2026-12-31',3).length===3,'bounded days',results);
  CDSAT_assert_('weekdayDetection',CDSA_weekday_('2026-09-07')==='MONDAY','weekday',results);
  CDSAT_assert_('blockedWeekdaySignal',CDSA_candidateSignal_({email:'a@example.com',blockedWeekdays:['MONDAY']},'2026-09-07',{})==='BLOCKED_WEEKDAY','blocked weekday',results);
  CDSAT_assert_('absenceMeansUnknown',CDSA_candidateSignal_({email:'a@example.com'},'2026-09-08',{})==='UNKNOWN','unknown absence',results);
  CDSAT_assert_('availabilityYes',CDSA_candidateSignal_({email:'a@example.com'},'2026-09-08',{'a@example.com':{'2026-09-08':'YES'}})==='AVAILABLE','yes',results);
  CDSAT_assert_('availabilityNo',CDSA_candidateSignal_({email:'a@example.com'},'2026-09-08',{'a@example.com':{'2026-09-08':'NO'}})==='UNAVAILABLE','no',results);

  var conceptRows=[
    {auditId:'A1',advisoryState:'READY',planningWindowFrom:'2026-09-02',planningWindowTo:'2026-09-04',candidateAuditors:[{name:'Alpha',email:'a@example.com',blockedWeekdays:[]},{name:'Beta',email:'b@example.com',blockedWeekdays:['THURSDAY']}]},
    {auditId:'A2',advisoryState:'REFRESH_REQUIRED',requiresCanonicalRefresh:true,planningWindowFrom:'2026-09-01',planningWindowTo:'2026-09-30',candidateAuditors:[]},
    {auditId:'A3',advisoryState:'READY',planningWindowFrom:'2026-10-01',planningWindowTo:'2026-10-10',candidateAuditors:[{name:'Alpha',email:'a@example.com',blockedWeekdays:[]}]}
  ];
  var overlay={byAuditorEmail:{
    'a@example.com':[{date:'2026-09-02',state:'YES'},{date:'2026-09-03',state:'NO'}],
    'b@example.com':[{date:'2026-09-02',state:'NO'},{date:'2026-09-03',state:'YES'}]
  }};
  var t0=Date.now();
  var smoke=ConceptPlanningDateSlotAdvisory_get({conceptRows:conceptRows,availabilityOverlay:overlay,from:'2026-09-01',to:'2026-09-05',maxDays:10,maxSlotsPerAudit:10});
  var smokeMs=Date.now()-t0;
  CDSAT_assert_('serviceSuccess',smoke&&smoke.success===true,'service success',results);
  CDSAT_assert_('readOnly',smoke&&smoke.meta&&smoke.meta.writes===false,'read only',results);
  CDSAT_assert_('zeroSheetReads',smoke&&smoke.meta&&smoke.meta.sheetReads===0,'no Sheet reads',results);
  CDSAT_assert_('zeroServiceReads',smoke&&smoke.meta&&smoke.meta.serviceReads===0,'no service reads',results);
  CDSAT_assert_('reuseConceptPlanning',smoke&&smoke.meta&&smoke.meta.reusesLoadedConceptPlanning===true,'reuse concept',results);
  CDSAT_assert_('reuseAvailabilityOverlay',smoke&&smoke.meta&&smoke.meta.reusesLoadedAvailabilityOverlay===true,'reuse overlay',results);
  CDSAT_assert_('commitRevalidation',smoke&&smoke.meta&&smoke.meta.commitRevalidationRequired===true,'commit revalidate',results);
  CDSAT_assert_('absenceStillUnknown',smoke&&smoke.meta&&smoke.meta.absenceMeansUnknown===true,'unknown policy',results);
  CDSAT_assert_('threeAuditsReturned',smoke&&smoke.rows&&smoke.rows.length===3,'three audits',results);
  CDSAT_assert_('refreshAuditHasNoSlots',smoke.rows[1].advisoryState==='REFRESH_REQUIRED'&&smoke.rows[1].slotCount===0,'refresh guard',results);
  CDSAT_assert_('outsideWindowHasNoSlots',smoke.rows[2].advisoryState==='NO_DATE_SLOTS'&&smoke.rows[2].slotCount===0,'outside visible window',results);
  CDSAT_assert_('windowRespected',smoke.rows[0].slots.length===3&&smoke.rows[0].slots[0].date==='2026-09-02'&&smoke.rows[0].slots[2].date==='2026-09-04','window slots',results);
  CDSAT_assert_('availablePreferredSignal',smoke.rows[0].slots[0].signal==='AVAILABLE','available signal',results);
  CDSAT_assert_('unknownAllowed',smoke.rows[0].slots[2].signal==='UNKNOWN','unknown allowed',results);
  CDSAT_assert_('totalsBalance',smoke&&smoke.totals&&smoke.totals.audits===3&&smoke.totals.refreshRequired===1&&smoke.totals.readyAudits===1,'totals',results);
  CDSAT_assert_('boundedSlotCount',smoke.rows[0].slotCount<=10,'bounded slots',results);

  var passed=results.filter(function(x){return x.ok;}).length;
  var out={ok:passed===results.length,build:CONCEPT_DATE_SLOT_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,smokeServerMs:smokeMs,devPerformance:smoke?smoke.devPerformance||null:null,results:results};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
