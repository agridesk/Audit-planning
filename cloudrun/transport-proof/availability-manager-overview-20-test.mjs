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
assert.equal(data.auditors[0].stateMinutes.FREE,14*1440);
assert.equal(data.auditors[1].confirmation.status,'REVIEW_NEEDED');
assert.equal(data.auditors[1].days[1].segments[0].state,'HARD');
assert.equal(data.auditors[1].stateMinutes.FREE,13*1440);
assert.equal(buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'a',metadata:{confirmation:{confirmedAt:'2026-12-01',fromDate:'2027-01-01',throughDate:'2027-01-15'}}}]}).auditors[0].confirmation.status,'OUTSIDE_CONFIRMATION');
assert.throws(()=>buildManagerAvailabilityOverview({...range,auditors:[{auditorId:'a'},{auditorId:'a'}]}),/DUPLICATE/);
assert.throws(()=>buildManagerAvailabilityOverview({fromDate:'2027-01-01',toDate:'2027-12-31'}),/BOUNDS/);
console.log('Manager Availability Overview: 7 checks passed');