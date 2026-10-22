import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../ModelCRejectedLinkIntegrity.js',import.meta.url),'utf8');
function sheet(rows){return {getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,getRange:(r,c,n,m)=>({getDisplayValues:()=>rows.slice(0,n).map(x=>Array.from({length:m},(_,i)=>x[i]||''))})};}
const tables={
 'Audit_Visit_Obligations':[['Audit_ID','Obligation_ID','Link_State'],['A1','O1','ACTIVE'],['A2','O2','ACTIVE'],['A3','O3','INACTIVE']],
 'Audit_Obligations':[['Obligation_ID'],['O1'],['O2'],['O3']],
 'Audit planning':[['Audit ID'],['A1']],
 'Rejected audits':[['Audit ID'],['A2']]
};
function run(t){const spreadsheet={getSheetByName:k=>t[k]?sheet(t[k]):null};const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet}});vm.runInContext(code,ctx);return ctx.RUN_MODEL_C_REJECTED_LINK_INTEGRITY_20();}
const x=run(tables);assert.equal(x.ok,false);assert.equal(x.activeRejectedAuditLinks,1);assert.equal(x.linksActive,2);assert.equal(x.linksInactive,1);
const good=structuredClone(tables);good['Audit_Visit_Obligations'][2][2]='INACTIVE';assert.equal(run(good).ok,true);
const duplicate=structuredClone(tables);duplicate['Audit_Visit_Obligations'].push(['A1','O1','ACTIVE']);assert.equal(run(duplicate).activeDuplicateObligationLinks,1);
const unknown=structuredClone(tables);unknown['Audit_Visit_Obligations'][2][0]='A9';assert.equal(run(unknown).activeUnknownAuditLinks,1);
console.log('MODEL_C_REJECTED_LINK_INTEGRITY: PASS');
