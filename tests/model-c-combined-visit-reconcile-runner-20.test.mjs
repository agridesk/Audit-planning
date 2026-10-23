import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const classifier=readFileSync(new URL('../ModelCCombinedVisitReconcile20.js',import.meta.url),'utf8');
const runner=readFileSync(new URL('../ModelCCombinedVisitReconcileRunner20.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../EntryV5.js',import.meta.url),'utf8');
const data={
 'Audit planning':[['Audit ID','Status','Planning JSON'],['A1','Approved',JSON.stringify({sourceAuditIds:['A2'],obligationIds:['O1','O2']})]],
 'Audit_Visit_Obligations':[['Audit_ID','Obligation_ID','Link_State'],['A1','O1','ACTIVE'],['A1','O2','ACTIVE'],['A2','O2','INACTIVE']],
 'Concept Reservations':[['Audit ID','State'],['A2','RELEASED']]
};
const ss={getSheetByName:n=>data[n]?{getDataRange:()=>({getValues:()=>data[n].map(r=>r.slice())})}:null};
const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>ss}});
vm.runInContext(classifier,ctx);vm.runInContext(runner,ctx);
let result=ctx.ModelCCombinedVisitReconcile20_run({runtimeEnv:'DEV',targetAuditId:'A1',sourceAuditIds:['A2']});
assert.equal(result.consistent,true);assert.equal(result.writesPerformed,false);
assert.throws(()=>ctx.ModelCCombinedVisitReconcile20_run({runtimeEnv:'PROD',targetAuditId:'A1',sourceAuditIds:['A2']}),/DEV_ONLY/);
data['Concept Reservations'][1][1]='ACTIVE';
result=ctx.ModelCCombinedVisitReconcile20_run({runtimeEnv:'DEV',targetAuditId:'A1',sourceAuditIds:['A2']});
assert.equal(result.reconcileRequired,true);
assert.match(result.issues.join(','),/SOURCE_RESERVATION_ACTIVE/);
assert.ok(entry.includes("rawAction==='externalcanonicalcombinedreconcile20'"));
assert.ok(entry.includes("ModelCCombinedVisitReconcile20_run(recheck20)"));
data['Concept Reservations'][1][1]='RELEASED';
data['Audit_Visit_Obligations'].push(['A99','O2','ACTIVE']);
result=ctx.ModelCCombinedVisitReconcile20_run({runtimeEnv:'DEV',targetAuditId:'A1',sourceAuditIds:['A2']});
assert.equal(result.reconcileRequired,true);
assert.match(result.issues.join(','),/DUPLICATE_ACTIVE_OBLIGATION_LINK/);
console.log('MODEL_C_COMBINED_RECONCILE_RUNNER: PASS');
