import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20IntegrationAcceptance.js',import.meta.url),'utf8');
const canonical='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const props={AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:canonical};
let writes=0;
const ctx={String,JSON,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]||''})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=>canonical,getSheetByName:name=>({
  getLastRow:()=>name==='Auditor Availability'?1008:1})})},
 Swap20Journal_encodePayload_:()=>'',Swap20Journal_decodePayload_:()=>({}),
 Swap20_verifyCommittedReconciliationLocked_:()=>true,
 Swap20_stageNotificationAfterCommitLocked_:()=>true,
 Swap20_buildCombinedEcasChange_:(_,a,b)=>({ok:true,queueAllowed:false,payload:{combined:true,auditChanges:[a,b]}}),
 Swap20_verifyCombinedEcasProofs_:()=>true,ECAS20_VerifyPersistedCommunication_:()=>false,
 RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021:()=>({ok:true}),
 Logger:{log:()=>{}}
};
runInNewContext(src,ctx);
const x=ctx.RUN_ACCEPTANCE_SWAP_NOTIFICATIONS_DEV_20261021();
assert.equal(x.ok,true);
assert.equal(x.readOnly,true);
assert.equal(x.endToEndProven,false);
assert.equal(x.prodReady,false);
assert.equal(x.checks.length,12);
assert.equal(writes,0);
props.ECAS20_CHANGE_CANCEL_ENABLED='YES';
assert.equal(ctx.RUN_ACCEPTANCE_SWAP_NOTIFICATIONS_DEV_20261021().ok,false);
props.ECAS20_CHANGE_CANCEL_ENABLED='NO';props.AMS_ENV='PROD';
assert.throws(()=>ctx.RUN_ACCEPTANCE_SWAP_NOTIFICATIONS_DEV_20261021(),/DEV_ONLY/);
console.log('SWAP Notifications single-pass DEV acceptance guard tests passed');
