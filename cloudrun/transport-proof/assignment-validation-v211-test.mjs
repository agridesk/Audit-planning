import assert from 'node:assert/strict';
import {
  v211AuditorQualified,
  v211CompanyAuditorExclusions,
  v211MinimumIntervalConstraint,
  v211AssignmentHardCheck
} from './assignment-validation-v211.js';

const catalog=[
  {slotKey:'SCOPE_01',scopeCode:'MPS-ABC',displayName:'MPS-ABC',minIntervalMonths:6},
  {slotKey:'SCOPE_02',scopeCode:'MPS-GAP',displayName:'MPS-GAP',minIntervalMonths:7},
  {slotKey:'SCOPE_03',scopeCode:'GRASP',displayName:'GRASP',minIntervalMonths:3}
];

const auditors=[
  ['Name','E-mail','Active','Role','MPS-ABC','MPS-GAP','GRASP'],
  ['David','david@example.com','YES','Auditor','x','x',''],
  ['Other','other@example.com','YES','Auditor','x','','x']
];

assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC','MPS-GAP'],'david@example.com'),true);
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC','MPS-GAP'],'other@example.com'),false);

const companies=[
  ['Company_UID','Company','Auditor_Exclusions'],
  ['C1','Grower A',JSON.stringify([
    {auditorEmail:'blocked@example.com',active:true,reason:'conflict'},
    {auditorEmail:'inactive@example.com',active:false}
  ])]
];
const excluded=v211CompanyAuditorExclusions(companies,'C1','Grower A');
assert.equal(excluded.has('blocked@example.com'),true);
assert.equal(excluded.has('inactive@example.com'),false);

const log=[
  ['Company_UID','Company','Status','Date completed','MPS-ABC','MPS-GAP','GRASP'],
  ['C1','Grower A','Completed','2026-01-31','x','',''],
  ['C1','Grower A','Completed','2026-03-15','','x',''],
  ['C1','Grower A','Completed','2026-07-01','','','x']
];

const min=v211MinimumIntervalConstraint({
  logValues:log,catalog,scopeCodes:['MPS-ABC','MPS-GAP'],companyUid:'C1',companyName:'Grower A'
});
assert.equal(min.byScope.find(x=>x.scopeCode==='MPS-ABC').minPlanningDate,'2026-07-31');
assert.equal(min.byScope.find(x=>x.scopeCode==='MPS-GAP').minPlanningDate,'2026-10-15');
assert.equal(min.minPlanningDate,'2026-10-15');

const hard=v211AssignmentHardCheck({
  auditorEmail:'david@example.com',
  auditorValues:auditors,
  catalog,
  scopeCodes:['MPS-ABC','MPS-GAP'],
  companyValues:companies,
  companyUid:'C1',
  companyName:'Grower A',
  logValues:log,
  requestedDates:['2026-10-14']
});
assert.equal(hard.ok,false);
assert.deepEqual(hard.reasons,['MIN_INTERVAL_HARD_BLOCK_2026-10-15']);

const excludedHard=v211AssignmentHardCheck({
  auditorEmail:'blocked@example.com',
  auditorValues:auditors,
  catalog,
  scopeCodes:['MPS-ABC'],
  companyValues:companies,
  companyUid:'C1',
  companyName:'Grower A',
  logValues:log,
  requestedDates:['2026-08-01']
});
assert.equal(excludedHard.reasons.includes('AUDITOR_EXCLUDED_FOR_COMPANY'),true);

console.log(JSON.stringify({ok:true,build:'2026-10-04_ASSIGNMENT_VALIDATION_V211_TEST_R1',tests:9}));
