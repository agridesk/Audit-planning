import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../NotificationEcasResendDeliveryReconciler20.js',import.meta.url),'utf8');
const uuid='11111111-2222-3333-4444-555555555555';
let lastEvent='queued',calls=0;
const queue=[['Header'],['now','SENT','ECAS_AUDIT_APPROVAL_DIGEST','ecas@example.com','A',
 '', '', '', 1,'RESEND_ACCEPTED_ID:'+uuid,'hash','2026-10-22',
 JSON.stringify({payload:{auditId:'A',blocks:[{date:'2026-10-23',start:'09:00',end:'11:00'}]}})]];
const evidence=[['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']];
const range=(matrix,from,count)=>({getValues:()=>matrix.slice(from-1,from-1+count)});
const q={getLastRow:()=>queue.length,getRange:(r,c,h)=>range(queue,r,h)};
const ledger={getLastRow:()=>evidence.length,getRange:(r,c,h)=>range(evidence,r,h),appendRow:x=>evidence.push(x)};
const props={AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:'dev'};
const ctx={String,Number,Array,Object,JSON,Date,Error,encodeURIComponent,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||''})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>q})},
 NotificationConfig_GetQueueSheetName:()=> 'Notification Queue',
 ECAS20_receiptSheet_:()=>ledger,
 NMG_getResendApiKey_:()=> 'key',
 ECAS20_receiptDigest_:()=> 'digest',
 UrlFetchApp:{fetch:(url,opts)=>{calls++;assert.ok(url.endsWith(uuid));assert.equal(opts.method,'get');
 return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({id:uuid,to:['ecas@example.com'],last_event:lastEvent,created_at:'2026-10-22T12:00:00Z'})};}}
};
runInNewContext(source,ctx);
assert.equal(ctx.RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022().confirmed,0);
assert.equal(evidence.length,1);
lastEvent='delivered';
assert.equal(ctx.RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022().confirmed,1);
assert.equal(evidence.length,2);
assert.equal(ctx.RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022().confirmed,0);
assert.equal(evidence.length,2);
props.AMS_ENV='PROD';
assert.throws(()=>ctx.RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022(),/DEV only/);
assert.equal(calls,2);
console.log('ECAS Resend delivery verification passed');
