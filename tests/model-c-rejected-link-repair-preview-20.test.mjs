import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ModelCRejectedLinkIntegrity.js',import.meta.url),'utf8');
const tables={
 'Audit planning':[['Audit ID'],['CURRENT']],
 'Rejected audits':[['Audit ID'],['REJECTED_A']],
 'Audit_Obligations':[['Obligation_ID'],['OB1']],
 'Audit_Visit_Obligations':[['Audit_ID','Obligation_ID','Link_State'],['REJECTED_A','OB1','ACTIVE']]
};
const ss={getSheetByName:n=>tables[n]?{getLastRow:()=>tables[n].length,getLastColumn:()=>tables[n][0].length,getRange:()=>({getDisplayValues:()=>tables[n]})}:null};
const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>ss},V5_ENTRY_isDevEnv_:()=>true});
vm.runInContext(source,ctx);
let result=ctx.RUN_MODEL_C_REJECTED_LINK_REPAIR_PREVIEW_20();
assert.equal(result.success,true);assert.equal(result.readOnly,true);
assert.equal(result.writesPerformed,false);assert.equal(result.candidates.length,1);
assert.equal(result.candidates[0].rowNumber,2);assert.equal(result.eligibleForReviewedRepair,true);
tables['Audit_Visit_Obligations'].push(['CURRENT','OB1','ACTIVE']);
result=ctx.RUN_MODEL_C_REJECTED_LINK_REPAIR_PREVIEW_20();
assert.equal(result.eligibleForReviewedRepair,false);
assert.match(result.conflicts[0],/MULTIPLE_ACTIVE_OWNERS/);
ctx.V5_ENTRY_isDevEnv_=()=>false;
assert.throws(()=>ctx.RUN_MODEL_C_REJECTED_LINK_REPAIR_PREVIEW_20(),/DEV_ONLY/);
console.log('MODEL_C_REJECTED_LINK_REPAIR_PREVIEW: PASS');
