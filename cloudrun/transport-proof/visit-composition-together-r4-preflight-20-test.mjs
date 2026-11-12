import assert from 'node:assert/strict';
import {validateTogetherCompositionPreflight20 as validate} from './visit-composition-together-r4-preflight-20.mjs';
const obligations=[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State','Planning_Window_From','Planning_Window_To'],
 ['o1','company-1','GAP',8,'OPEN','2027-01-01','2027-12-31'],
 ['o2','company-1','GRASP',3,'LINKED_TO_VISIT','01-01-2027','31-12-2027']];
const links=[['Audit_ID','Obligation_ID','Link_State'],
 ['audit-1','o1','ACTIVE'],['audit-1','o2','ACTIVE']];
const blocks=[
 {date:'2027-03-12',start:'08:00',end:'14:00'},
 {date:'2027-03-13',start:'08:00',end:'13:00'}
];
const allocations=[
 {blockId:'2027-03-12|08:00|14:00',obligationId:'o1',minutes:360},
 {blockId:'2027-03-13|08:00|13:00',obligationId:'o1',minutes:120},
 {blockId:'2027-03-13|08:00|13:00',obligationId:'o2',minutes:180}
];
const base={auditId:'audit-1',companyUid:'company-1',obligations,links,blocks,allocations,formalTargetMinutes:660};
const result=validate(base);
assert.equal(result.scopeAllocations.length,3);
assert.equal(result.scopeAllocation.obligations.length,2);
assert.equal(result.requiredMinutes,660);
assert.equal(result.canCommitOnlyViaAtomicOwner,true);
assert.throws(()=>validate({...base,links:[...links,['another','o1','ACTIVE']]}),/LINKED_ELSEWHERE/);
assert.throws(()=>validate({...base,links:[...links,['audit-1','o1','ACTIVE']]}),/ACTIVE_OBLIGATIONS_INVALID/);
assert.throws(()=>validate({...base,formalTargetMinutes:600}),/FORMAL_HOURS_SOURCE_MISMATCH/);
assert.throws(()=>validate({...base,allocations:allocations.slice(0,2)}),/SCOPE_MINUTES_INCOMPLETE/);
assert.throws(()=>validate({...base,allocations:[...allocations,{...allocations[0]}]}),/SCOPE_ALLOCATION_INVALID/);
assert.throws(()=>validate({...base,blocks:[{date:'2028-03-12',start:'08:00',end:'14:00'},blocks[1]]}),/SCOPE_WINDOW_BLOCKED/);
assert.throws(()=>validate({...base,obligations:[obligations[0],[...obligations[1].slice(0,3),0,...obligations[1].slice(4)],obligations[2]]}),/HOURS_OR_IDENTITY_INVALID/);
const scopeCatalog=[{scopeCode:'GAP',active:true,maxOffsiteHours:1},{scopeCode:'GRASP',active:true,maxOffsiteHours:1}];
const offsiteBlocks=[
 {date:'2027-03-12',start:'08:00',end:'09:00',executionType:'OFFSITE',execLoc:''},
 {date:'2027-03-12',start:'09:00',end:'14:00',executionType:'ONSITE',execLoc:'HQ'},
 {date:'2027-03-13',start:'08:00',end:'13:00',executionType:'ONSITE',execLoc:'HQ'}
];
const offsiteAllocations=[
 {blockId:'2027-03-12|08:00|09:00',obligationId:'o1',minutes:60},
 {blockId:'2027-03-12|09:00|14:00',obligationId:'o1',minutes:300},
 {blockId:'2027-03-13|08:00|13:00',obligationId:'o1',minutes:120},
 {blockId:'2027-03-13|08:00|13:00',obligationId:'o2',minutes:180}
];
const legitimate=validate({...base,scopeCatalog,blocks:offsiteBlocks,allocations:offsiteAllocations});
assert.equal(legitimate.offsiteMinutesByObligation.o1,60);
assert.throws(()=>validate({...base,blocks:offsiteBlocks,allocations:offsiteAllocations}),
 /OFFSITE_SCOPE_POLICY_MISSING/);
assert.throws(()=>validate({...base,scopeCatalog:scopeCatalog.map(x=>({...x,maxOffsiteHours:0})),blocks:offsiteBlocks,allocations:offsiteAllocations}),
 /OFFSITE_SCOPE_MAX_EXCEEDED/);

// Regression #87: a legacy parent row may report 3h while Model C links
// require GAP 6h + GRASP 3h; canonical obligations, never the parent,
// determine the combined formal target.
const nineHourObligations=obligations.map((row,i)=>i===1?[...row.slice(0,3),6,...row.slice(4)]:row);
const nineHourBlocks=[{date:'2027-03-12',start:'09:00',end:'18:00'}];
const nineHourAllocations=[
 {blockId:'2027-03-12|09:00|18:00',obligationId:'o1',minutes:360},
 {blockId:'2027-03-12|09:00|18:00',obligationId:'o2',minutes:180}
];
assert.equal(validate({...base,obligations:nineHourObligations,blocks:nineHourBlocks,
 allocations:nineHourAllocations,formalTargetMinutes:540}).requiredMinutes,540);
assert.throws(()=>validate({...base,obligations:nineHourObligations,blocks:nineHourBlocks,
 allocations:nineHourAllocations,formalTargetMinutes:180}),/FORMAL_HOURS_SOURCE_MISMATCH/);
const {readFileSync}=await import('node:fs');
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
assert.ok(r4.includes("formalTargetMinutes=compositionMode==='TOGETHER'?totalMinutes:Math.round(formalTarget*60)"),
 'Together parent-row 3h must not block canonical 9h preflight');
assert.ok(r4.includes('formalHours=together?together.requiredMinutes/60:'),
 'Together must persist verified 9h, not stale legacy 3h');
assert.ok(r4.includes('offsitePolicy=together?offsitePolicyForScopes(catalog,together.scopeAllocation.obligations.map(x=>x.scopeCode))'),
 'Together off-site policy must be derived from canonical linked scopes');
assert.ok(r4.includes('scopes:together?together.scopeAllocation.obligations.map(x=>x.scopeCode):Array.isArray(audit.scopes)'),
 'Together notification payload must include every linked Model C scope');

assert.ok(r4.includes('scopeCodes:together?together.scopeAllocation.obligations.map(x=>x.scopeCode):audit.scopes||[]'),
 'Together must qualify auditor for all canonical linked scopes, not legacy scopes');
const preflightIndex=r4.indexOf("const together=compositionMode==='TOGETHER'?validateTogetherCompositionPreflight20({");
const qualificationIndex=r4.indexOf('const assignmentHard=v211AssignmentHardCheck(');
assert.ok(preflightIndex>0&&qualificationIndex>preflightIndex,
 'Canonical obligation validation must precede auditor qualification');

console.log('VISIT_COMPOSITION_TOGETHER_R4_PREFLIGHT_20_PASS: canonical obligations, scope hours, windows and per-block allocation');
