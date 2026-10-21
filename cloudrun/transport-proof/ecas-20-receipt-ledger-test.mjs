import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
const src=readFileSync(new URL('../../ECAS20ReceiptLedger.js',import.meta.url),'utf8');
const DEV='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const h=['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At'],rows=[h];
const sheet={
 getLastRow:()=>rows.length,
 getRange:(r,c,ht,w)=>({
  getValues:()=>rows.slice(r-1,r-1+ht).map(row=>row.slice(c-1,c-1+w)),
  setValues:values=>values.forEach((v,i)=>rows[r-1+i]=v.slice()),
 })
};
const props={AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:DEV};
const ctx={String,Array,JSON,Object,Date,Error,
 Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
 computeDigest:(_kind,text)=>[...createHash('sha256').update(text).digest()]},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})}};
runInNewContext(src,ctx);
const row={rowIndex:22,eventCode:'ECAS_AUDIT_APPROVAL_DIGEST',payload:{auditId:'A',blocks:[{date:'2026-10-21',start:'09:00',end:'17:00'}]}};
assert.equal(ctx.ECAS20_recordConfirmedDelivery_([row],'2026-10-21','SENT_DEV_REDIRECT').recorded,0);
assert.equal(rows.length,1);
assert.equal(ctx.ECAS20_recordConfirmedDelivery_([row],'2026-10-21','SENT').recorded,1);
assert.equal(rows.length,2);
assert.equal(rows[1][1],'NQ_22_A');
assert.equal(rows[1][2].length,64);
assert.equal(ctx.ECAS20_recordConfirmedDelivery_([row],'2026-10-21','SENT').recorded,0);
assert.equal(rows.length,2);
console.log('ECAS receipt ledger real-send-only, digest and idempotence tests passed');
