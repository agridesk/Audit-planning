import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../Swap20CanonicalSnapshot.js',import.meta.url),'utf8');
const start=source.indexOf('function Swap20_restoreCanonicalBeforeImages_(');
assert.ok(start>=0);
const restoreSource=source.slice(start);
const headers=['Audit ID','Planning JSON','Assigned to','Date - Planned'];
const oldA=JSON.stringify({blocks:[{date:'2026-10-20'}]});
const oldB=JSON.stringify({blocks:[{date:'2026-10-21'}]});
const newA=JSON.stringify({blocks:[{date:'2026-10-22'}]});
const newB=JSON.stringify({blocks:[{date:'2026-10-23'}]});
let rows=[headers.slice(),['A',newA,'auditor-a','2026-10-22'],['B',oldB,'auditor-b','2026-10-21']];
let writes=0;
const sheet={getLastColumn:()=>4,getRange:(r,c,h,w)=>({
 getValues:()=>rows.slice(r-1,r-1+h).map(v=>v.slice(c-1,c-1+w)),
 setValues:v=>{writes++;rows[r-1]=v[0].slice();}
})};
const ctx={String,JSON,Error,Array,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
 Swap20_verifyCanonicalBeforeImages_:()=>true};
runInNewContext(restoreSource,ctx);
const snapshot={sheetName:'Audit planning',headers,rows:[
 {rowNumber:2,auditId:'A',values:['A',oldA,'auditor-a','2026-10-20']},
 {rowNumber:3,auditId:'B',values:['B',oldB,'auditor-b','2026-10-21']}
 ],rollbackExpectedBlocksA:[{date:'2026-10-22'}],rollbackExpectedBlocksB:[{date:'2026-10-23'}]};
assert.equal(ctx.Swap20_restoreCanonicalBeforeImages_(snapshot).success,true);
assert.equal(rows[1][1],oldA);
assert.equal(writes,2);
rows[1]=['A',JSON.stringify({blocks:[{date:'2026-12-01'}]}),'auditor-a','2026-12-01'];
assert.throws(()=>ctx.Swap20_restoreCanonicalBeforeImages_(snapshot),/changed externally/);
assert.equal(writes,2);
console.log('SWAP canonical guarded rollback tests passed');
