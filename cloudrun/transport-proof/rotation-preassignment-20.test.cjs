'use strict';
const assert=require('node:assert/strict');
const {preassignmentRotationDecision:d}=require('./rotation-preassignment-20.cjs');
const base={identityResolved:true,policyResolved:true,rotationApplies:true,consecutiveCompleted:3,normalMaximum:3,extensionPermitted:true,extensionUsedInSeries:false,managerApproved:false,assignmentBound:false,justification:''};
function test(phase,changes,expected){assert.equal(d([{...base,...changes}],phase).decision,expected);}
test('DRAFT',{},'WARN');
test('PREASSIGN',{},'WARN');
test('COMMIT',{},'BLOCK');
test('COMMIT',{managerApproved:true,assignmentBound:true,justification:'Approved for this visit'},'ALLOW');
test('PREASSIGN',{extensionUsedInSeries:true},'BLOCK');
test('DRAFT',{consecutiveCompleted:4},'BLOCK');
test('PREASSIGN',{policyResolved:false},'BLOCK');
test('COMMIT',{consecutiveCompleted:2},'ALLOW');
assert.equal(d([{...base,consecutiveCompleted:2},{...base,consecutiveCompleted:4}],'PREASSIGN').decision,'BLOCK');
assert.equal(d([{...base,consecutiveCompleted:2},{...base,consecutiveCompleted:3}],'PREASSIGN').decision,'WARN');
assert.equal(d([],'COMMIT').decision,'BLOCK');
assert.equal(d([base],'UNKNOWN').decision,'BLOCK');
console.log('Rotation preassignment 2.0: 12 checks passed');
