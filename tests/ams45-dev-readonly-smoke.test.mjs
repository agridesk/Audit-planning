import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../AMS45DevReadOnlySmoke.js',import.meta.url),'utf8');
const tabs=new Set(['Audit planning','Audit_Obligations','Audit_Visit_Obligations','Auditor Availability','Concept Reservations','Rejected audits','Config_Scopes']);
function run(dev){
 const ctx=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=> 'DEV_SHEET',getSheetByName:n=>tabs.has(n)?{}:null})},
 V5_ENTRY_isDevEnv_:()=>dev,
 Status_applyAction:()=>{},PlanningCanonicalCommitService_commit:()=>{},
 PlanningCanonicalAvailabilityAdapter_reserve:()=>{},PlanningCanonicalAvailabilityAdapter_release:()=>{},
 ModelCCombinedVisitCanonicalCommit20_execute:()=>{},ModelCCombinedVisitReconcile20_run:()=>{},
 ModelCCombinedVisitReconcile20_classify:()=>{},ModelCRejectLinkWriter_close_:()=>{},
 RUN_MODEL_C_REJECTED_LINK_INTEGRITY_20:()=>({ok:false,activeRejectedAuditLinks:2}),
 StatusNotificationBridge_Dispatch_:()=>{}});
 vm.runInContext(src,ctx);return ctx.RUN_AMS45_DEV_READONLY_SMOKE();
}
const result=run(true);assert.equal(result.success,false);assert.equal(result.readOnly,true);
assert.equal(result.writesPerformed,false);assert.equal(result.modelCIntegrity.activeRejectedAuditLinks,2);
assert.equal(result.integrationBlockers[0],'MODEL_C_ACTIVE_LINK_INTEGRITY_FAILED');
assert.equal(result.integrationStatus,'READ_ONLY_PREFLIGHT_ONLY_NO_LIFECYCLE_WRITE_TESTED');
assert.throws(()=>run(false),/DEV_ONLY/);
console.log('AMS45_DEV_READONLY_SMOKE: PASS');
