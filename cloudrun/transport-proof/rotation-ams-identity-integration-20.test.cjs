'use strict';
const assert=require('node:assert/strict');
const {completedLogRowsFromAms20}=require('./rotation-ams-log-20.cjs');
const {makeHistoricalAuditorUidResolver}=require('./rotation-auditor-identity-20.cjs');
const {consecutiveCompleted}=require('./rotation-history-20.cjs');
const resolveAuditorUid=makeHistoricalAuditorUidResolver([
 {alias:'Auditor X',auditorUid:'U1',validFrom:'2020-01-01',validUntil:'2025-01-01'},
 {alias:'Auditor X',auditorUid:'U2',validFrom:'2025-01-01'},
 {alias:'Auditor Y',auditorUid:'U1',validFrom:'2020-01-01'}
]);
const h=['Company','Auditor','Status','SCOPE_01','Audit ID','Company_UID','Date completed'];
const rows=[h,
 ['Acme','Auditor X','Completed','YES','A1','C1','2024-01-01'],
 ['Acme','Auditor Y','Completed','YES','A2','C1','2025-02-01'],
 ['Acme','Auditor X','Completed','YES','A3','C1','2026-02-01']];
const data=completedLogRowsFromAms20(rows,{resolveAuditorUid,scopeByColumn:{SCOPE_01:'S1'}});
assert.equal(data.length,3);
assert.equal(data[0].auditorUid,'U1');
assert.equal(data[2].auditorUid,'U2');
assert.equal(consecutiveCompleted(data,'C1','S1','U2').count,1);
assert.equal(consecutiveCompleted(data,'C1','S1','U1').count,0);
assert.throws(()=>completedLogRowsFromAms20([h,['Acme','Unknown','Completed','YES','A4','C1','2026-02-01']],{resolveAuditorUid,scopeByColumn:{SCOPE_01:'S1'}}),/UNRESOLVED/);
console.log('AMS identity integration: 5 assertions passed');
