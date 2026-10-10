import { readFileSync } from 'node:fs';

const gasSave = readFileSync(new URL('../../ManagerPlanningBackend_CORE_SPLIT.js', import.meta.url), 'utf8');
const gasEligibility = readFileSync(new URL('../../Toolkit_Eligibility.js', import.meta.url), 'utf8');
const gasAnnualCycle = readFileSync(new URL('../../AnnualCycleEngineV5.js', import.meta.url), 'utf8');
const saveGuard = gasSave.slice(gasSave.indexOf('function saveManagerPlanning('), gasSave.indexOf('function __mp_getAuditPlanningPack_('));
const directGuard = gasEligibility.slice(gasEligibility.indexOf('function _mp_assertAuditorQualifiedForPlanning_('), gasEligibility.indexOf('/* =====================================================================', gasEligibility.indexOf('function _mp_assertAuditorQualifiedForPlanning_(')));
assert.match(saveGuard, /_mp_assertAuditorQualifiedForPlanning_\s*\(/, 'Planning save must invoke canonical direct qualification');
assert.doesNotMatch(saveGuard, /_mp_fastOpenQualifiedCacheGet_\s*\(/, 'Planning save must not authorize via dropdown cache');
assert.match(directGuard, /shAud\.getDataRange\(\)\.getValues\(\)/, 'Canonical save-time guard must read live Auditor rows');
assert.doesNotMatch(directGuard, /__mp_getSheetDataPersistCached_\s*\(/, 'Canonical save-time guard must not use persisted Auditors cache');
assert.match(directGuard, /key\s*\?\s*\(em\s*===\s*key\)\s*:\s*\(keyName\s*&&\s*nm\s*===\s*keyName\)/, 'BUG-003: supplied email must take precedence; same-name different-email must not authorize');
assert.doesNotMatch(directGuard, /\(key\s*&&\s*em\s*===\s*key\)\s*\|\|\s*\(keyName\s*&&\s*nm\s*===\s*keyName\)/, 'BUG-003: OR name fallback is forbidden when email is supplied');
assert.match(gasAnnualCycle, /carryIsEmail\s*\?\s*carryPreassigned\s*:\s*''\s*,\s*carryIsEmail\s*\?\s*''\s*:\s*carryPreassigned/, 'BUG-003: successor must pass display-name preassignments as names, not email identifiers');
assert.match(directGuard, /if\s*\(!key\s*&&\s*audRow\)\s*return\s*\{\s*success:false/, 'BUG-003: duplicate name-only identity must fail closed');
assert.match(gasAnnualCycle, /AC_recalculateHoursForRecurringScopes_\(headers, newRow, recurringScopeSlots\);[\s\S]*?var carryPreassigned/, 'BUG-003: successor scope recalculation must precede preassignment validation');

import assert from 'node:assert/strict';
import {
  v211AuditorQualified,
  v211ResolveAuditorEmail,
  v211CompanyAuditorExclusions,
  v211MinimumIntervalConstraint,
  v211AssignmentHardCheck,
  v211RotationHardCheck
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

assert.equal(v211ResolveAuditorEmail(auditors,'David'),'david@example.com');
assert.equal(v211ResolveAuditorEmail(auditors,'DAVID@EXAMPLE.COM'),'david@example.com');
assert.equal(v211ResolveAuditorEmail(auditors,'Unknown'),'');
assert.equal(v211ResolveAuditorEmail([...auditors,['David','duplicate@example.com','YES','Auditor','x','x','x']],'David'),'');
assert.equal(v211ResolveAuditorEmail([['Name','Active'],['David','YES']],'David'),'');
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC','MPS-GAP'],v211ResolveAuditorEmail(auditors,'David')),true);
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC','MPS-GAP'],'david@example.com'),true);
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC','MPS-GAP'],'other@example.com'),false);
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC'],' '),false);
assert.equal(v211AuditorQualified([...auditors,['Duplicate','david@example.com','YES','Auditor','x','x','x']],catalog,['MPS-ABC'],'david@example.com'),false);
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC'],'unknown@example.com'),false);

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

assert.deepEqual(v211RotationHardCheck(null).reasons,['PLANNING_ROTATION_CHECK_FAILED']);
assert.deepEqual(v211RotationHardCheck({success:true,auditor:{hardBlockQualification:true}}).reasons,['AUDITOR_NOT_HARD_QUALIFIED']);
assert.deepEqual(v211RotationHardCheck({success:true,auditor:{softBlockRotation:true}}).reasons,['PLANNING_ROTATION_LIMIT_HARD_BLOCK']);
assert.equal(v211RotationHardCheck({success:true,auditor:{}}).ok,true);

console.log(JSON.stringify({ok:true,build:'2026-10-04_ASSIGNMENT_VALIDATION_V211_TEST_R2',tests:13}));
