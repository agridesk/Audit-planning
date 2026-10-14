import assert from 'node:assert/strict';
import {prepareAvailabilityMutation as prepare} from './availability-mutations-20.js';
const base={actor:{id:'manager1',role:'Manager'},targetAuditorId:'auditor1',expectedVersion:2,now:'2026-10-14T10:00:00Z',snapshot:{version:2,baselineExceptions:[],blocks:[]}};
let n=0;
function ok(args,expected){const r=prepare({...base,...args});assert.equal(r.action,expected);assert.equal(r.nextVersion,3);n++;}
function fail(args,msg){assert.throws(()=>prepare({...base,...args}),{message:msg});n++;}
const block={action:'BLOCK_PERIOD',id:'b1',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true};
ok({mutation:block},'BLOCK_PERIOD');
fail({actor:{id:'auditor2',role:'Auditor'},mutation:block},'NOT_AUTHORIZED');
ok({actor:{id:'auditor1',role:'Auditor'},mutation:block},'BLOCK_PERIOD');
fail({expectedVersion:1,mutation:block},'VERSION_CONFLICT');
fail({mutation:{...block,fromDate:'2027-02-30'}},'INVALID_DATE');
fail({mutation:{...block,id:''}},'DUPLICATE_OR_MISSING_ID');
fail({snapshot:{...base.snapshot,blocks:[{state:'COMMITTED',date:'2027-01-11',wholeDay:true}]},mutation:block},'COMMITTED_CONFLICT');
const snap={...base.snapshot,baselineExceptions:[block]};
ok({snapshot:snap,mutation:{action:'RELEASE_BASELINE',id:'r1',targetExceptionId:'b1',fromDate:'2027-01-11',toDate:'2027-01-24',wholeDay:true}},'RELEASE_BASELINE');
fail({snapshot:snap,mutation:{action:'RELEASE_BASELINE',id:'r1',targetExceptionId:'b2',date:'2027-01-11',wholeDay:true}},'BASELINE_NOT_FOUND');
fail({snapshot:snap,mutation:{action:'RELEASE_BASELINE',id:'r1',targetExceptionId:'b1',date:'2028-01-11',wholeDay:true}},'RELEASE_OUTSIDE_BASELINE');
fail({mutation:{action:'CONFIRM_AVAILABILITY',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true}},'AUDITOR_CONFIRMATION_REQUIRED');
ok({actor:{id:'auditor1',role:'Auditor'},mutation:{action:'CONFIRM_AVAILABILITY',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true}},'CONFIRM_AVAILABILITY');
fail({mutation:{action:'DELETE_ALL'}},'UNSUPPORTED_ACTION');
console.log(`${n} mutation policy checks passed`);