import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const rows=[['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']];
const sheet={
 getLastRow:()=>rows.length,
 getRange:(r,c,h,w)=>({
  getValues:()=>rows.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),
  setValues:values=>{values.forEach((v,i)=>rows[r-1+i]=v.slice());}
 })
};
const props={V5_SSOT_SPREADSHEET_ID:'dev-id',AMS_ENV:'DEV'};
const ctx={Error,String,Number,JSON,Date,Array,SpreadsheetApp:{openById:id=>({getSheetByName:()=>sheet}) ,flush:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},SWAP20_STORE_PREFIX_:'AMS_SWAP20_PROPOSAL_',Swap20Store_key_:id=>'AMS_SWAP20_PROPOSAL_'+id};
runInNewContext(readFileSync(new URL('Swap20DurableJournal.js',root),'utf8'),ctx);
assert.equal(ctx.Swap20Journal_appendLocked_('swap-journal-1',0,'PREPARED',{auditA:'A'}).sequence,1);
assert.equal(ctx.Swap20Journal_appendLocked_('swap-journal-1',1,'WRITING',{auditB:'B'}).sequence,2);
assert.equal(ctx.Swap20Journal_history_('swap-journal-1').length,2);
assert.throws(()=>ctx.Swap20Journal_appendLocked_('swap-journal-1',1,'COMMITTED',{}),/concurrent modification/);
assert.equal(ctx.Swap20Journal_appendLocked_('swap-journal-1',2,'COMMITTED',{}).sequence,3);
assert.throws(()=>ctx.Swap20Journal_appendLocked_('swap-journal-1',3,'WRITING',{}),/terminal|Illegal swap journal transition/);
console.log('Swap durable journal tests passed');
