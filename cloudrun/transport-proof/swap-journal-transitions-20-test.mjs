import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20DurableJournal.js',import.meta.url),'utf8');
function setup(){
 const rows=[['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']];
 const sh={getLastRow:()=>rows.length,getRange:(r,c,h,w)=>({getValues:()=>rows.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),setValues:v=>{v.forEach((row,i)=>rows[r-1+i]=row);}})};
 const ctx={
 Swap20_assertGasWriteAuthority_:()=>{},PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='V5_SSOT_SPREADSHEET_ID'?'test':'DEV'})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sh}),flush:()=>{}},Swap20Store_key_:id=>'AMS_SWAP20_PROPOSAL_'+id,SWAP20_STORE_PREFIX_:'AMS_SWAP20_PROPOSAL_',JSON,String,Number,Date,Error,Object};
 runInNewContext(src,ctx);return {ctx,rows};
}
const id='swap-12345678';
const happy=setup();
for(const stage of ['PREPARED','WRITING','COMMITTED'])happy.ctx.Swap20Journal_appendLocked_(id,happy.ctx.Swap20Journal_history_(id).length,stage,{});
assert.equal(happy.ctx.Swap20Journal_history_(id).at(-1).stage,'COMMITTED');
assert.throws(()=>happy.ctx.Swap20Journal_appendLocked_(id,3,'ROLLING_BACK',{}),/terminal/);
const rollback=setup();
for(const stage of ['PREPARED','WRITING','ROLLING_BACK','ROLLED_BACK'])rollback.ctx.Swap20Journal_appendLocked_(id,rollback.ctx.Swap20Journal_history_(id).length,stage,{});
assert.throws(()=>rollback.ctx.Swap20Journal_appendLocked_(id,4,'COMMITTED',{}),/terminal/);
const prewrite=setup();prewrite.ctx.Swap20Journal_appendLocked_(id,0,'PREPARED',{});prewrite.ctx.Swap20Journal_appendLocked_(id,1,'CONFLICT',{});
assert.throws(()=>prewrite.ctx.Swap20Journal_appendLocked_(id,2,'WRITING',{}),/terminal/);
const invalid=setup();assert.throws(()=>invalid.ctx.Swap20Journal_appendLocked_(id,0,'COMMITTED',{}),/Illegal swap journal transition/);
const skipped=setup();skipped.ctx.Swap20Journal_appendLocked_(id,0,'PREPARED',{});assert.throws(()=>skipped.ctx.Swap20Journal_appendLocked_(id,1,'COMMITTED',{}),/Illegal swap journal transition/);
console.log('Swap journal transition regression tests passed');
