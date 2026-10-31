import { readFileSync } from 'node:fs';

const gasSave = readFileSync(new URL('../../ManagerPlanningBackend_CORE_SPLIT.js', import.meta.url), 'utf8');
const gasEligibility = readFileSync(new URL('../../Toolkit_Eligibility.js', import.meta.url), 'utf8');
const gasAnnualCycle = readFileSync(new URL('../../AnnualCycleEngineV5.js', import.meta.url), 'utf8');
const saveGuard = gasSave.slice(gasSave.indexOf('function saveManagerPlanning('), gasSave.indexOf('function __mp_getAuditPlanningPack_('));
const directGuard = gasEligibility.slice(gasEligibility.indexOf('function _mp_assertAuditorQualifiedForPlanning_('), gasEligibility.indexOf('/* =====================================================================', gasEligibility.indexOf('function _mp_assertAuditorQualifiedForPlanning_(')));
assert.match(saveGuard, /_mp_assertAuditorQualifiedForPlanning_\s*\(/, 'Planning save must invoke canonical direct qualification');
assert.doesNotMatch(saveGuard, /_mp_fastOpenQualifiedCacheGet_\s*\(/, 'Planning save must not authorize via dropdown cache');
assert.match(directGuard, /shAud\.getDataRange\(\)\.getValues\(\)/, 'Canonical save-time guard must read live Auditor rows');
assert.match(directGuard, /Qualification_Withdrawals_JSON/, 'Legacy GAS direct eligibility enforces qualification withdrawals');
assert.match(directGuard, /withdrawalIndex < 0\) return \{success:false/, 'GAS fails closed if withdrawal policy column is missing');
assert.match(directGuard, /Array\.isArray\(entry\.grandfatheredAuditIds\)/, 'GAS validates existing-audit preservation metadata');
assert.match(directGuard, /isFinite\(Date\.parse/, 'GAS validates future-dated withdrawal dates');
assert.match(directGuard, /datePlanned/, 'Legacy GAS must reject planned assignments beyond cutoff');
assert.match(directGuard, /checkedDates\.some/, 'Legacy GAS validates requested block dates against withdrawal cutoff');
assert.match(saveGuard, /payload\.blocks\.map\(function\(b\)\{return b\.date;\}\)/, 'Canonical planning save supplies all requested block dates to qualification guard');
assert.doesNotMatch(directGuard, /__mp_getSheetDataPersistCached_\s*\(/, 'Canonical save-time guard must not use persisted Auditors cache');
assert.match(directGuard, /key\s*\?\s*\(em\s*===\s*key\)\s*:\s*\(keyName\s*&&\s*nm\s*===\s*keyName\)/, 'BUG-003: supplied email must take precedence; same-name different-email must not authorize');
assert.doesNotMatch(directGuard, /\(key\s*&&\s*em\s*===\s*key\)\s*\|\|\s*\(keyName\s*&&\s*nm\s*===\s*keyName\)/, 'BUG-003: OR name fallback is forbidden when email is supplied');
assert.match(gasAnnualCycle, /carryIsEmail\s*\?\s*carryPreassigned\s*:\s*''\s*,\s*carryIsEmail\s*\?\s*''\s*:\s*carryPreassigned/, 'BUG-003: successor must pass display-name preassignments as names, not email identifiers');
assert.match(directGuard, /if\s*\(!key\s*&&\s*audRow\)\s*return\s*\{\s*success:false/, 'BUG-003: duplicate name-only identity must fail closed');
assert.match(gasAnnualCycle, /AC_recalculateHoursForRecurringScopes_\(headers, newRow, recurringScopeSlots\);[\s\S]*?var carryPreassigned/, 'BUG-003: successor scope recalculation must precede preassignment validation');

import assert from 'node:assert/strict';
import {
  v211AuditorQualified,
  v211QualificationWithdrawalConstraint,
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

// Scope 09–20 canonical relation validation does not need physical qualification columns.
const auditor20=[['Name','E-mail','Active','Role','Auditor_UID'],['New Auditor','new@example.com','YES','Auditor','UID-20']];
const catalog20=[...catalog,{slotKey:'SCOPE_09',scopeCode:'NEW-09',displayName:'New 09'},{slotKey:'SCOPE_20',scopeCode:'NEW-20',displayName:'New 20'}];
const relations20=[['Auditor_UID','ScopeCode','Qualified'],['UID-20','NEW-09','YES'],['UID-20','NEW-20','TRUE']];
assert.equal(v211AuditorQualified(auditor20,catalog20,['NEW-09','NEW-20'],'new@example.com',[],relations20),true);
assert.equal(v211AuditorQualified(auditor20,catalog20,['SCOPE_09','New 20'],'new@example.com',[],relations20),true);
assert.equal(v211AuditorQualified(auditor20,catalog20,['NEW-09'],'new@example.com'),false,'Legacy path must not synthesize qualification');
assert.equal(v211AuditorQualified(auditor20,catalog20,['NEW-09'],'new@example.com',[],[['Auditor_UID','ScopeCode','Qualified']]),false,'No implicit qualification');
assert.equal(v211AuditorQualified(auditor20,catalog20,['NEW-09'],'new@example.com',[],[...relations20,relations20[1]]),false,'No fallback after duplicate canonical relation');

assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC','MPS-GAP'],'other@example.com'),false);
assert.equal(v211AuditorQualified(auditors,catalog,['MPS-ABC'],' '),false);
assert.equal(v211AuditorQualified(auditors,catalog,[],'david@example.com'),false, 'Missing required scopes must fail closed');
assert.equal(v211AuditorQualified(auditors,catalog,null,'david@example.com'),false, 'Unresolved scope requirements must fail closed');
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
assert.equal(v211CompanyAuditorExclusions(companies.concat(companies.slice(1)),'C1','Grower A').size,0);
assert.equal(v211CompanyAuditorExclusions(companies,'C2','Grower A').size,0);
assert.equal(v211CompanyAuditorExclusions(companies.concat([['C2','Grower A','other@example.com']]),'','Grower A').size,0);

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
const caseInsensitiveUidLog=[
  log[0],[' c1 ','Grower A','Completed','2026-08-01','x','','']
];
assert.equal(v211MinimumIntervalConstraint({
  logValues:caseInsensitiveUidLog,catalog,scopeCodes:['MPS-ABC'],companyUid:'C1',companyName:'Grower A'
}).minPlanningDate,'2027-02-01');

const sameNameDifferentUid=[
  ...log,
  ['C2','Grower A','Completed','2026-09-01','x','','']
];
assert.equal(v211MinimumIntervalConstraint({
  logValues:sameNameDifferentUid,catalog,scopeCodes:['MPS-ABC'],companyUid:'C1',companyName:'Grower A'
}).minPlanningDate,'2026-07-31');
assert.equal(v211MinimumIntervalConstraint({
  logValues:sameNameDifferentUid,catalog,scopeCodes:['MPS-ABC'],companyUid:'C2',companyName:'Grower A'
}).minPlanningDate,'2027-03-01');
assert.equal(v211MinimumIntervalConstraint({
  logValues:log,catalog,scopeCodes:['MPS-ABC'],companyUid:'UNKNOWN',companyName:''
}).minPlanningDate,'');


const legacyCollisionLog=[
  ...log,
  ['', 'Grower A','Completed','2026-08-01','x','',''],
  ['C2','Grower A','Completed','2026-09-01','x','','']
];
assert.equal(v211MinimumIntervalConstraint({
  logValues:[...log,['','Grower A','Completed','2026-08-01','x','',''],['C2','Grower A','Pending planning','2026-09-01','x','','']],
  catalog,scopeCodes:['MPS-ABC'],companyUid:'C1',companyName:'Grower A'
}).ambiguousLegacyCompany,undefined);
const legacyCollision=v211AssignmentHardCheck({
  auditorEmail:'david@example.com',auditorValues:auditors,catalog,scopeCodes:['MPS-ABC'],
  companyValues:companies,companyUid:'C1',companyName:'Grower A',
  logValues:legacyCollisionLog,requestedDates:['2027-06-01']
});
assert.equal(legacyCollision.ok,false);
assert.equal(legacyCollision.reasons.includes('MIN_INTERVAL_LEGACY_COMPANY_AMBIGUOUS'),true);
assert.equal(v211MinimumIntervalConstraint({
  logValues:[...log,['','Grower A','Completed','2026-08-01','x','','']],
  catalog,scopeCodes:['MPS-ABC'],companyUid:'C1',companyName:'Grower A'
}).ambiguousLegacyCompany,undefined);

// Complete -> historical minimum interval: only realized history affects successor planning.
const completedSuccessorLog=[
  ['Company_UID','Company','Status','Date completed','MPS-ABC','MPS-GAP','GRASP'],
  ['C1','Grower A','Completed','2026-10-10','x','',''],
  ['C1','Grower A','Pending planning','2026-12-01','x','',''],
  ['C2','Grower A','Completed','2026-12-01','x','','']
];
assert.equal(v211MinimumIntervalConstraint({
  logValues:completedSuccessorLog,catalog,scopeCodes:['MPS-ABC'],companyUid:'C1',companyName:'Grower A'
}).minPlanningDate,'2027-04-10');
const successorTooEarly=v211AssignmentHardCheck({
  auditorEmail:'david@example.com',auditorValues:auditors,catalog,scopeCodes:['MPS-ABC'],
  companyValues:companies,companyUid:'C1',companyName:'Grower A',
  logValues:completedSuccessorLog,requestedDates:['2027-04-09']
});
assert.equal(successorTooEarly.reasons.includes('MIN_INTERVAL_HARD_BLOCK_2027-04-10'),true);
const successorOnBoundary=v211AssignmentHardCheck({
  auditorEmail:'david@example.com',auditorValues:auditors,catalog,scopeCodes:['MPS-ABC'],
  companyValues:companies,companyUid:'C1',companyName:'Grower A',
  logValues:completedSuccessorLog,requestedDates:['2027-04-10']
});
assert.equal(successorOnBoundary.ok,true);

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

const ambiguousCompanyHard=v211AssignmentHardCheck({
  auditorEmail:'david@example.com',auditorValues:auditors,catalog,scopeCodes:['MPS-ABC'],
  companyValues:companies.concat(companies.slice(1)),companyUid:'C1',companyName:'Grower A',
  logValues:[],requestedDates:['2026-10-14']
});
assert.equal(ambiguousCompanyHard.ok,false);
assert.equal(ambiguousCompanyHard.reasons.includes('COMPANY_IDENTITY_AMBIGUOUS'),true);
const missingCompanyHard=v211AssignmentHardCheck({
  auditorEmail:'david@example.com',auditorValues:auditors,catalog,scopeCodes:['MPS-ABC'],
  companyValues:companies,companyUid:'UNKNOWN',companyName:'Grower A',
  logValues:[],requestedDates:['2026-10-14']
});
assert.equal(missingCompanyHard.reasons.includes('COMPANY_IDENTITY_AMBIGUOUS'),true);

assert.deepEqual(v211RotationHardCheck(null).reasons,['PLANNING_ROTATION_CHECK_FAILED']);
assert.deepEqual(v211RotationHardCheck({success:true,auditor:{hardBlockQualification:true}}).reasons,['AUDITOR_NOT_HARD_QUALIFIED']);
assert.deepEqual(v211RotationHardCheck({success:true,auditor:{softBlockRotation:true}}).reasons,['PLANNING_ROTATION_LIMIT_HARD_BLOCK']);
assert.equal(v211RotationHardCheck({success:true,auditor:{}}).ok,true);

const withdrawalCatalog=[{slotKey:'SCOPE_01',scopeCode:'MPS-ABC',displayName:'MPS-ABC'}];
const withdrawalAuditors=[['Name','E-mail','Active','Role','MPS-ABC','Qualification_Withdrawals_JSON'],['Leen','leen@agriqa.es','Yes','Auditor','x',JSON.stringify([{scopeCode:'MPS-ABC',effectiveDate:'2026-10-15',grandfatheredAuditIds:['A-1','A-2']}])]];
const effectiveGuard=(requestedDates,nowDate)=>v211QualificationWithdrawalConstraint({auditorValues:withdrawalAuditors,catalog:withdrawalCatalog,scopeCodes:['SCOPE_01'],auditorEmail:'leen@agriqa.es',requestedDates,nowDate});
assert.equal(effectiveGuard(['2026-10-14'],'2026-10-12').ok,true);
assert.equal(v211AuditorQualified(withdrawalAuditors,withdrawalCatalog,['MPS-ABC'],'leen@agriqa.es',['2026-10-14']),true,'Future withdrawal preserves eligibility before effective date');
assert.equal(v211AuditorQualified(withdrawalAuditors,withdrawalCatalog,['MPS-ABC'],'leen@agriqa.es',['2026-10-16']),false,'Future withdrawal blocks assignment dated after effective date');
assert.equal(effectiveGuard(['2026-10-16'],'2026-10-12').ok,false);
assert.equal(effectiveGuard([],'2026-10-15').ok,false);
assert.equal(v211QualificationWithdrawalConstraint({auditorValues:withdrawalAuditors,catalog:withdrawalCatalog,scopeCodes:['MPS-GAP'],auditorEmail:'leen@agriqa.es',nowDate:'2026-10-16'}).ok,true);
const badWithdrawalAuditors=withdrawalAuditors.map(x=>[...x]);badWithdrawalAuditors[1][5]='not-json';
assert.equal(v211QualificationWithdrawalConstraint({auditorValues:badWithdrawalAuditors,catalog:withdrawalCatalog,scopeCodes:['MPS-ABC'],auditorEmail:'leen@agriqa.es',nowDate:'2026-10-16'}).ok,false);
for(const malformed of [
 {scopeCode:'MPS-ABC',effectiveDate:'2026-02-30',grandfatheredAuditIds:['A-1']},
 {scopeCode:'MPS-ABC',effectiveDate:'2026-10-15'},
 {scopeCode:'MPS-ABC',effectiveDate:'2026-10-15',grandfatheredAuditIds:['A-1','A-1']},
 {scopeCode:'MPS-ABC',effectiveDate:'2026-10-15',grandfatheredAuditIds:[null]}
]){
 const rows=withdrawalAuditors.map(row=>[...row]);rows[1][5]=JSON.stringify([malformed]);
 const check=v211QualificationWithdrawalConstraint({auditorValues:rows,catalog:withdrawalCatalog,scopeCodes:['MPS-ABC'],auditorEmail:'leen@agriqa.es',nowDate:'2026-10-01'});
 assert.equal(check.ok,false,'Malformed future withdrawal policy must fail closed');
 assert.ok(check.reasons.includes('QUALIFICATION_WITHDRAWAL_SCHEMA_INVALID'));
}


console.log(JSON.stringify({ok:true,build:'2026-10-04_ASSIGNMENT_VALIDATION_V211_TEST_R2',tests:13}));

const uidAuditors=[['Auditor_UID',...auditors[0]],['uid-david',...auditors[1]],['uid-other',...auditors[2]]];
assert.equal(v211AuditorQualified(uidAuditors,catalog,['MPS-ABC'],'uid-david'),true,'UID qualification');
assert.equal(v211AuditorQualified(uidAuditors,catalog,['MPS-GAP'],'uid-other'),false,'UID qualification rejects missing scope');
assert.equal(v211QualificationWithdrawalConstraint({auditorValues:uidAuditors,catalog,scopeCodes:['MPS-ABC'],auditorEmail:'uid-david',requestedDates:['2026-10-14']}).ok,true,'UID withdrawal');
assert.equal(v211AuditorQualified([...uidAuditors,['uid-david',...auditors[2]]],catalog,['MPS-ABC'],'uid-david'),false,'Duplicate UID fails closed');

const uidExclusionCompanies=[['Company_UID','Company','Auditor_Exclusions'],['C1','Grower A',JSON.stringify([{auditorEmail:'david@example.com',active:true}])]];
const uidExclusion=v211AssignmentHardCheck({auditorEmail:'uid-david',auditorValues:uidAuditors,catalog,scopeCodes:['MPS-ABC'],companyValues:uidExclusionCompanies,companyUid:'C1',companyName:'Grower A',requestedDates:['2026-10-14']});
assert.ok(uidExclusion.reasons.includes('AUDITOR_EXCLUDED_FOR_COMPANY'),'Legacy email exclusion must still block UID assignment');
