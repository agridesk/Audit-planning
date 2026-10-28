import assert from 'node:assert/strict';
import {buildManagerAvailabilityOverview} from './availability-manager-overview-20.js';
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
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'a',metadata:{confirmation:{confirmedAt:'2026-12-01',fromDate:'2027-01-01',throughDate:'2027-01-15'}}}]}).auditors[0].confirmation.status,'OUTSIDE_CONFIRMATION');
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
console.log('Manager Availability Overview: 14 checks passed');