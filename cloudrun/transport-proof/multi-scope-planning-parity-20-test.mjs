import assert from 'node:assert/strict';
import {multiScopePlanningParity20} from './multi-scope-planning-parity-20.mjs';
const scopes=[{obligationId:'ABC',scopeCode:'MPS-ABC',requiredHours:5},
 {obligationId:'GAP',scopeCode:'MPS-GAP',requiredHours:6},
 {obligationId:'GRASP',scopeCode:'GRASP',requiredHours:3}];
const blocks=[{date:'2027-02-12',start:'08:00',end:'16:00',execLoc:'HQ'},
 {date:'2027-02-13',start:'08:00',end:'14:00',execLoc:'NURSERY_2'}];
const happy=multiScopePlanningParity20({scopes,blocks});
assert.equal(happy.ok,true);
assert.equal(happy.totalRequiredMinutes,840);
assert.equal(happy.totalPlannedMinutes,840);
assert.deepEqual(happy.scopes.map(x=>x.plannedMinutes),[300,360,180]);
assert.deepEqual(happy.blocks.map(x=>x.remainingMinutes),[0,0]);
assert.equal(happy.allocations.reduce((sum,x)=>sum+x.minutes,0),840);
const incomplete=multiScopePlanningParity20({scopes,blocks:blocks.slice(0,1)});
assert.equal(incomplete.ok,false);
assert.equal(incomplete.reason,'COMPOSITION_DRAFT_HOURS_REMAINING');
const doubled=multiScopePlanningParity20({scopes,blocks,allocations:[
 {blockId:'2027-02-12|08:00|16:00',obligationId:'ABC',minutes:480},
 {blockId:'2027-02-12|08:00|16:00',obligationId:'GAP',minutes:360}]});
assert.equal(doubled.ok,false);
assert.equal(doubled.reason,'COMPOSITION_DRAFT_ALLOCATION_EXCEEDS_CAPACITY');
const invalid=multiScopePlanningParity20({scopes,blocks:[{date:'2027-02-12',start:'08:10',end:'16:00'}]});
assert.equal(invalid.ok,false);
assert.equal(invalid.reason,'COMPOSITION_DRAFT_BLOCK_INVALID');
const duplicate=multiScopePlanningParity20({scopes,blocks:[blocks[0],blocks[0]]});
assert.equal(duplicate.reason,'COMPOSITION_DRAFT_BLOCK_INVALID');
const manual=multiScopePlanningParity20({scopes,blocks,allocations:[
 {blockId:'2027-02-12|08:00|16:00',obligationId:'ABC',minutes:300},
 {blockId:'2027-02-12|08:00|16:00',obligationId:'GAP',minutes:180},
 {blockId:'2027-02-13|08:00|14:00',obligationId:'GAP',minutes:180},
 {blockId:'2027-02-13|08:00|14:00',obligationId:'GRASP',minutes:180}]});
assert.equal(manual.ok,true);
console.log('MULTI_SCOPE_PLANNING_PARITY_20_PASS: 14-hour auto/manual allocations and invalid block/overlap guards');
