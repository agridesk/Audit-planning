import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const files=['ModelCCombinedVisitPlanner20.js','AMS45CombinedVisitCandidatePreflight.js'];
const data={
 'Audit planning':[['Audit ID','Status','Company_UID'],['A1','Pending Planning','C1'],['A2','Pending Planning','C1']],
 'Audit_Visit_Obligations':[['Audit_ID','Obligation_ID','Link_State'],['A1','O1','ACTIVE'],['A2','O2','ACTIVE']],
 'Audit_Obligations':[['Obligation_ID','Obligation_State','Company_UID','ScopeCode'],['O1','OPEN','C1','ABC'],['O2','OPEN','C1','GAP']],
 'Auditor Availability':[['Audit_ID_1','Audit_ID_2'],['','']]
};
const ss={getSheetByName:n=>data[n]?{getLastRow:()=>data[n].length,getLastColumn:()=>data[n][0].length,getRange:()=>({getDisplayValues:()=>data[n].map(r=>r.slice())})}:null};
const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>ss},V5_ENTRY_isDevEnv_:()=>true});
for(const name of files)vm.runInContext(readFileSync(new URL('../'+name,import.meta.url),'utf8'),ctx);
let r=ctx.RUN_AMS45_COMBINED_CANDIDATE_PREFLIGHT();
assert.equal(r.eligibleGroups,1);assert.equal(r.candidates[0].obligationCount,2);assert.equal(r.writesPerformed,false);
data['Auditor Availability'][1][1]='A2';
r=ctx.RUN_AMS45_COMBINED_CANDIDATE_PREFLIGHT();
assert.equal(r.eligibleGroups,0);assert.match(r.candidates[0].reasons[0],/AVAILABILITY_OCCUPIED/);
ctx.V5_ENTRY_isDevEnv_=()=>false;
assert.throws(()=>ctx.RUN_AMS45_COMBINED_CANDIDATE_PREFLIGHT(),/DEV_ONLY/);
console.log('AMS45_COMBINED_CANDIDATE_PREFLIGHT: PASS');
