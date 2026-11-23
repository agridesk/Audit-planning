import assert from 'node:assert/strict';
import {buildAnnualAvailabilityStateTotals20,buildManagerAvailabilityOverview} from './availability-manager-overview-20.js';
const range={fromDate:'2027-01-11',toDate:'2027-01-24'};
const baseline={id:'year',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true};
const release={id:'released',targetExceptionId:'year',fromDate:'2027-01-11',toDate:'2027-01-24',wholeDay:true};
const data=buildManagerAvailabilityOverview({...range,auditors:[
 {auditorId:'david',displayName:'David',availability:{},metadata:{}},
 {auditorId:'auditor-b',availability:{baselineExceptions:[baseline],baselineReleases:[release],blocks:[{id:'other',date:'2027-01-12',wholeDay:true,state:'HARD'}]},metadata:{confirmation:{confirmedAt:'2026-12-15T10:00:00Z',fromDate:'2027-01-01',throughDate:'2027-03-31',availabilityVersion:1},availabilityVersion:2,historyComplete:true,changes:[{at:'2026-12-16T10:00:00Z',fromDate:'2027-01-12',toDate:'2027-01-12',substantive:true}]}}
]});
assert.equal(data.auditors[0].confirmation.status,'NOT_CONFIRMED');
assert.equal(data.auditors[0].stateMinutes.FREE,10*1440);
assert.equal(data.auditors[0].stateMinutes.SOFT,4*1440);
assert.equal(data.auditors[1].confirmation.status,'REVIEW_NEEDED');
assert.equal(data.auditors[1].days[1].segments[0].state,'HARD');
assert.equal(data.auditors[1].stateMinutes.FREE,9*1440);
assert.equal(data.auditors[1].stateMinutes.SOFT,4*1440);
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'a',metadata:{confirmation:{confirmedAt:'2026-12-01T00:00:00Z',fromDate:'2027-01-01',throughDate:'2027-01-15'}}}]}).auditors[0].confirmation.status,'OUTSIDE_CONFIRMATION');
assert.throws(()=>buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'a'},{auditorId:'a'}]}),/DUPLICATE/);
assert.throws(()=>buildManagerAvailabilityOverview({fromDate:'2027-01-01',toDate:'2027-12-31'}),/BOUNDS/);
const confirmed={confirmedAt:'2026-12-15T10:00:00Z',fromDate:'2027-01-01',throughDate:'2027-03-31',availabilityVersion:1};
const overviewWithChange=change=>buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'recurring',availability:{},metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2,changes:[change]}}]}).auditors[0].confirmation.status;
assert.equal(overviewWithChange({at:'2026-12-16T10:00:00Z',action:'SET_RECURRING',fromDate:null,toDate:null,substantive:true}),'REVIEW_NEEDED');
assert.equal(overviewWithChange({at:'2026-12-16T10:00:00Z',action:'BLOCK_PERIOD',fromDate:null,toDate:null,substantive:true}),'REVIEW_NEEDED');
assert.equal(overviewWithChange({at:'2026-12-16T10:00:00Z',action:'BLOCK_PERIOD',fromDate:'2027-02-01',toDate:'2027-02-02',substantive:true}),'CONFIRMED');
assert.equal(overviewWithChange({at:'2026-12-14T10:00:00Z',action:'SET_RECURRING',fromDate:null,toDate:null,substantive:true}),'CONFIRMED');
assert.equal(overviewWithChange({action:'BLOCK_PERIOD',fromDate:'2027-01-12',toDate:'2027-01-12',substantive:true}),'REVIEW_NEEDED');
assert.equal(overviewWithChange({at:'not-a-date',action:'BLOCK_PERIOD',fromDate:'2027-01-12',toDate:'2027-01-12',substantive:true}),'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'invalid-confirmation',metadata:{confirmation:{...confirmed,confirmedAt:'invalid'}}}]}).auditors[0].confirmation.status,'NOT_CONFIRMED');
assert.equal(overviewWithChange({at:'2026-12-15T11:00:00+01:00',action:'SET_RECURRING',substantive:true}),'CONFIRMED');
assert.equal(overviewWithChange({at:'2026-12-15T12:00:00+01:00',action:'SET_RECURRING',substantive:true}),'REVIEW_NEEDED');
assert.throws(()=>buildManagerAvailabilityOverview({fromDate:'not-a-date',toDate:'2027-01-24'}),/INVALID_DATE/);
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'history-missing',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'history-empty',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2,changes:[]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'invalid-range',metadata:{confirmation:{...confirmed,fromDate:'2027-02-30'}}}]}).auditors[0].confirmation.status,'NOT_CONFIRMED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'reversed-range',metadata:{confirmation:{...confirmed,fromDate:'2027-04-01'}}}]}).auditors[0].confirmation.status,'NOT_CONFIRMED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'missing-version',metadata:{confirmation:confirmed,historyComplete:true,changes:[]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'future-version',metadata:{confirmation:{...confirmed,availabilityVersion:3},historyComplete:true,availabilityVersion:2,changes:[]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'negative-version',metadata:{confirmation:{...confirmed,availabilityVersion:-1},historyComplete:true,availabilityVersion:2,changes:[]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'malformed-history',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:1,changes:[null]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'missing-substantive',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:1,changes:[{at:'2026-12-16T10:00:00Z',action:'BLOCK_PERIOD'}]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'missing-timestamp',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:1,changes:[{action:'BLOCK_PERIOD',substantive:false}]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'last-change-no-history',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:1,changes:[],lastAvailabilityChangeAt:'2026-12-16T10:00:00Z'}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'last-change-outside-period',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2,changes:[{at:'2026-12-16T10:00:00Z',action:'BLOCK_PERIOD',fromDate:'2027-02-01',toDate:'2027-02-02',substantive:true}],lastAvailabilityChangeAt:'2026-12-16T10:00:00Z'}}]}).auditors[0].confirmation.status,'CONFIRMED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'incomplete-substantive',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2,changes:[{at:'2026-12-16T10:00:00Z',action:'BLOCK_PERIOD',substantive:true}]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'invalid-old-history',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2,changes:[{at:'2026-12-01T10:00:00Z',action:'BLOCK_PERIOD',substantive:true,fromDate:'2027-02-30',toDate:'2027-03-01'}]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({fromDate:'2027-01-11',toDate:'2027-01-11',auditors:[{auditorId:'range-protected',availability:{fromDate:'2027-01-01',toDate:'2027-12-31',blocks:[]}}]}).auditors[0].days.length,1);
assert.throws(()=>buildManagerAvailabilityOverview({...range,auditors:[null]}),/DUPLICATE_OR_MISSING_AUDITOR_ID|INVALID_AUDITOR_RECORD/);
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'ambiguous-confirmation',metadata:{confirmation:{confirmedAt:'2026-12-01',fromDate:'2027-01-01',throughDate:'2027-12-31',availabilityVersion:1},availabilityVersion:1,historyComplete:true,changes:[]}}]}).auditors[0].confirmation.status,'NOT_CONFIRMED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'ambiguous-history-time',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:2,changes:[{at:'2026-12-16',action:'BLOCK_PERIOD',substantive:true,fromDate:'2027-02-01',toDate:'2027-02-02'}]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'ambiguous-last-change-time',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:1,changes:[],lastAvailabilityChangeAt:'2026-12-16'}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'last-change-history-mismatch',metadata:{confirmation:confirmed,historyComplete:true,availabilityVersion:3,lastAvailabilityChangeAt:'2026-12-17T10:00:00Z',changes:[{at:'2026-12-16T10:00:00Z',action:'BLOCK_PERIOD',substantive:true,fromDate:'2027-02-01',toDate:'2027-02-02'}]}}]}).auditors[0].confirmation.status,'REVIEW_NEEDED');
assert.throws(()=>buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'malformed-source',availability:'not-a-document'}]}),/INVALID_AVAILABILITY_SOURCE/);
const annualDoc={auditorId:'UID-1',version:4,blocks:[],recurring:[],
 baselineExceptions:[{id:'one',date:'2028-01-03',start:'08:00',end:'12:00'}],
 baselineReleases:[{targetExceptionId:'one',date:'2028-01-03',start:'10:00',end:'12:00'}],
 overrides:[{date:'2028-01-01',start:'08:00',end:'10:00'}],metadata:{}};
const annualInput={year:2028,planningComplete:true,auditors:[{auditorId:'UID-1',availability:annualDoc}],
 planningSlots:[
  {auditorId:'UID-1',auditId:'AUD-1',date:'2028-01-03',start:'09:00',end:'10:00',state:'COMMITTED'},
  {auditorId:'UID-1',auditId:'AUD-2',date:'2028-01-03',start:'11:00',end:'12:00',state:'PROVISIONAL'}
 ]};
const originalAnnual=structuredClone(annualInput);
const annual=buildAnnualAvailabilityStateTotals20(annualInput);
assert.deepEqual(annualInput,originalAnnual);
assert.equal(annual.readOnly,true);assert.equal(annual.writesPerformed,false);
assert.deepEqual(annual.auditors[0].stateMinutes,{FREE:155940,SOFT:63480,PROVISIONAL:60,HARD:60,COMMITTED:60});
assert.equal(Object.values(annual.auditors[0].stateMinutes).reduce((a,b)=>a+b,0),366*600);
assert.equal(annual.auditors[0].confirmation.status,'NOT_CONFIRMED');
assert.throws(()=>buildAnnualAvailabilityStateTotals20({...annualInput,planningComplete:false}),/SOURCE_INCOMPLETE/);
assert.throws(()=>buildAnnualAvailabilityStateTotals20({...annualInput,auditors:[{auditorId:'UID-1',availability:{...annualDoc,blocks:undefined}}]}),/SOURCE_INVALID/);
assert.throws(()=>buildAnnualAvailabilityStateTotals20({...annualInput,planningSlots:[{...annualInput.planningSlots[0],auditorId:'UNKNOWN'}]}),/OWNER_UNRESOLVED/);
assert.throws(()=>buildAnnualAvailabilityStateTotals20({...annualInput,planningSlots:[annualInput.planningSlots[0],annualInput.planningSlots[0]]}),/COMMITTED_SOURCE_DUPLICATE/);
assert.throws(()=>buildAnnualAvailabilityStateTotals20({...annualInput,auditors:[annualInput.auditors[0],annualInput.auditors[0]]}),/DUPLICATE/);
const normalYear={...annualInput,year:2027,planningSlots:[],auditors:[{auditorId:'UID-1',
 availability:{...annualDoc,blocks:[{id:'boundary',fromDate:'2027-04-03',toDate:'2027-04-05',wholeDay:true,state:'HARD'}],
 baselineExceptions:[],baselineReleases:[],overrides:[]}}]};
const normalTotals=buildAnnualAvailabilityStateTotals20(normalYear).auditors[0].stateMinutes;
assert.equal(normalTotals.HARD,3*600);
assert.equal(Object.values(normalTotals).reduce((a,b)=>a+b,0),365*600);
assert.throws(()=>buildAnnualAvailabilityStateTotals20({...annualInput,planningSlots:[{...annualInput.planningSlots[0],start:'25:00'}]}),/COMMITTED_SOURCE_INVALID/);
console.log('Manager Availability Overview and annual state totals passed');