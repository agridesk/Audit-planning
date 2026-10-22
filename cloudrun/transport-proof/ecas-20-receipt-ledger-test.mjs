import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
const legacy=readFileSync(new URL('../../ECAS20ReceiptLedger.js',import.meta.url),'utf8');
const guarded=readFileSync(new URL('../../NotificationEcasReceiptWriter20.js',import.meta.url),'utf8');
assert.doesNotMatch(legacy,/function ECAS20_recordConfirmedDelivery_\(/);
assert.match(guarded,/function ECAS20_recordConfirmedDelivery_\(/);
let writes=0;
const context={String,Array,JSON,Object,Date,Error,
 Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},
 computeDigest:(_kind,raw)=>[...createHash('sha256').update(raw).digest()]},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'DEV'})},
 SpreadsheetApp:{openById:()=>{writes++;throw Error('Unexpected receipt write')}}
};
runInNewContext(legacy,context);
runInNewContext(guarded,context);
const blocks=[{date:'2026-10-21',start:'09:00',end:'17:00'}];
assert.equal(context.ECAS20_PlanningDigest_(blocks),context.ECAS20_receiptDigest_(blocks));
const entry={rowIndex:22,eventCode:'ECAS_AUDIT_APPROVAL_DIGEST',payload:{auditId:'A',blocks}};
assert.equal(context.ECAS20_recordConfirmedDelivery_([entry],'2026-10-21','SENT').recorded,0);
assert.equal(context.ECAS20_recordConfirmedDelivery_([entry],'2026-10-21','SENT_DEV_REDIRECT').recorded,0);
assert.equal(context.ECAS20_recordLegacyProviderAcceptance_([entry],'2026-10-21','SENT').recorded,0);
assert.equal(writes,0);
console.log('ECAS receipt ledger prevents unverified provider-acceptance evidence');
