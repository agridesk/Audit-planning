import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../SwapNotificationsFinalPreflight.js',import.meta.url),'utf8');
const props={AMS_ENV:'DEV',AMS_SWAP20_COMMIT_ENABLED:'false',ECAS20_CHANGE_CANCEL_ENABLED:'NO'};
const sheets={
 'Audit planning':[['Audit ID','Planning JSON','Date - Planned','Status','Assigned to','Auditor_UID'],['A','{}','2026-10-20','Accepted','a@example.test','UID']],
 'Auditor Availability':[['Date','Auditor_Email','Audit_ID_1'],['2026-10-20','a@example.test','A']],
 'AMS_Swap_20_Journal':[['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']]
};
const spreadsheet={getSheetByName:name=>{
 const rows=sheets[name];if(!rows)return null;
 return {getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,getRange:(r,c,h,w)=>({getValues:()=>rows.slice(r-1,r-1+h).map(x=>x.slice(c-1,c-1+w))})};
}};
let result;
const ctx={String,JSON,Math,Object,Error,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet},Logger:{log:()=>{}}};
runInNewContext(src,ctx);
result=ctx.RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021();
assert.equal(result.ok,true);
assert.equal(result.readOnly,true);
assert.equal(result.readyForProd,false);
delete sheets.AMS_Swap_20_Journal;
assert.equal(ctx.RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021().findings.includes('JOURNAL_MISSING'),true);
sheets.AMS_Swap_20_Journal=[['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']];
props.AMS_ENV='PROD';
assert.throws(()=>ctx.RUN_SWAP_NOTIFICATIONS_FINAL_PREFLIGHT_DEV_20261021(),/DEV_ONLY/);
console.log('SWAP Notifications readiness preflight tests passed');
