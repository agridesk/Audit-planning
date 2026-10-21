import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../Swap20AvailabilitySnapshot.js',import.meta.url),'utf8');
function fixture(changed){
 const rows=[['Date','Audit'],['2026-10-21','B'],['2026-10-22','C'],['2026-10-23','D']];
 const before={sheetName:'Auditor Availability',height:3,width:2,values:[['Date','Audit'],['2026-10-21','A'],['2026-10-22','C']]};
 const plan={sheetName:'Auditor Availability',originalHeight:3,width:2,values:[['Date','Audit'],['2026-10-21','B'],['2026-10-22','C'],['2026-10-23','D']]};
 const calls=[];
 const sh={getLastColumn:()=>2,getLastRow:()=>rows.length,getRange:(r,c,h,w)=>({
  getValues:()=>rows.slice(r-1,r-1+h).map(x=>x.slice()),
  setValues:v=>{calls.push(r);v.forEach((x,i)=>rows[r-1+i]=x.slice());}
 }),deleteRows:(start,count)=>{rows.splice(start-1,count);calls.push('delete');}};
 const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sh}),flush:()=>{}},JSON,Error,String,Array,Object};
 runInNewContext(source,ctx);
 if(changed)rows[1][1]='UNRELATED';
 return {ctx,rows,before,plan,calls};
}
const good=fixture(false);
assert.equal(good.ctx.Swap20_restoreAvailabilityBeforeImages_(good.before,good.plan).success,true);
assert.deepEqual(good.rows,good.before.values);
assert.deepEqual(good.calls,[2,'delete']);
const conflict=fixture(true);
assert.throws(()=>conflict.ctx.Swap20_restoreAvailabilityBeforeImages_(conflict.before,conflict.plan),/changed externally/);
assert.deepEqual(conflict.calls,[]);
const absent=fixture(false);
assert.throws(()=>absent.ctx.Swap20_restoreAvailabilityBeforeImages_(absent.before),/Verified rollback plan required/);
console.log('Swap availability guarded rollback tests passed');
