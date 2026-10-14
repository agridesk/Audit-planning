'use strict';
const assert=require('node:assert/strict');
const {buildRotationOverview20}=require('./rotation-overview-readmodel-20');
const result=buildRotationOverview20({
 auditors:[{uid:'A',name:'Auditor A'}],companies:[{uid:'C',name:'Company C'}],
 scopePoliciesByCompany:{C:[{scopeKey:'S1',normalMaximum:2,extensionPermitted:true},{scopeKey:'S2',normalMaximum:1,extensionPermitted:false}]},
 completedAudits:[{companyUid:'C',scopeKey:'S1',auditorUid:'A',status:'Completed',completedAt:'2025-01-01',auditId:'OLD1'},{companyUid:'C',scopeKey:'S1',auditorUid:'A',status:'Completed',completedAt:'2026-01-01',auditId:'OLD2'}],
 upcomingByCompany:{C:[{auditId:'NEXT',auditorUid:'A',scopeKeys:['S1','S2'],phase:'PREASSIGN',date:'2027-02-01'}]}
});
assert.equal(result.readOnly,true);
assert.equal(result.sections.length,1);
assert.equal(result.sections[0].rows.length,2);
assert.equal(result.sections[0].rows[0].performed,2);
assert.equal(result.sections[0].rows[0].status,'PLUS_ONE_POSSIBLE');
assert.equal(result.sections[0].rows[0].decision,'WARN');
assert.equal(result.sections[0].rows[1].status,'LAST_AVAILABLE');
assert.equal(result.sections[0].rows[1].upcoming[0].auditId,'NEXT');
assert.throws(()=>buildRotationOverview20({}),/INCOMPLETE/);
console.log('9 overview read-model checks passed');
