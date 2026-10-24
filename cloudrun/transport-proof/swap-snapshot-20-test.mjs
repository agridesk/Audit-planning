import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const headers=['Audit ID','Status','Assigned to','Date - Planned','Planning JSON'];
const rows=[headers,['A','Accepted','one@example.com','2026-10-21','{}'],['B','Accepted','two@example.com','2026-10-22','{}']];
const sh={
 getLastColumn:()=>5,
 getRange:(r,c,h,w)=>({
  getValues:()=>rows.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),
  setValues:values=>{values.forEach((v,i)=>rows[r-1+i]=v.slice());}
 })
};
const ctx={Error,String,Array,JSON,isNaN,Date,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sh}),flush:()=>{}},
 PRT_readCanonicalRow_:id=>({rowNumber:id==='A'?2:3,row:rows[id==='A'?1:2].slice(),headers}),
 PRT_result_:(id,h,row)=>({revision:'revision-'+id}),
 PRT_snapshotFromRow_:(h,row)=>({status:row[1],auditId:row[0]}),
 PRT_tokenFromSnapshot_:s=>'revision-'+s.auditId
};
runInNewContext(readFileSync(new URL('Swap20CanonicalSnapshot.js',root),'utf8'),ctx);
const before=ctx.Swap20_captureCanonicalBeforeImages_({auditA:'A',auditB:'B',originalRevisions:{A:'revision-A',B:'revision-B'}});
assert.equal(before.rows.length,2);
assert.equal(ctx.Swap20_verifyCanonicalBeforeImages_(before),true);
// The lookup may return an obsolete cached row: only physical sheet values
// are valid durable before-images, and revision mismatch must fail closed.
const originalLookup=ctx.PRT_readCanonicalRow_;
rows[1][3]='2026-10-23';
ctx.PRT_readCanonicalRow_=id=>({rowNumber:id==='A'?2:3,row:id==='A'?['A','Accepted','one@example.com','2026-10-21','{}']:rows[2].slice(),headers});
const fresh=ctx.Swap20_captureCanonicalBeforeImages_({auditA:'A',auditB:'B',originalRevisions:{A:'revision-A',B:'revision-B'}});
assert.equal(fresh.rows[0].values[3],'2026-10-23','snapshot must read live sheet instead of cached lookup');
ctx.PRT_readCanonicalRow_=originalLookup;
rows[1][3]='2026-10-21';
before.rollbackExpectedBlocksA=[{date:'2026-11-01'}];
before.rollbackExpectedBlocksB=[];
rows[1][3]='2026-11-01';
rows[1][4]=JSON.stringify({blocks:before.rollbackExpectedBlocksA});
ctx.Swap20_restoreCanonicalBeforeImages_(before);
assert.equal(rows[1][3],'2026-10-21');
const nativeDate=new Date('2026-10-22T00:00:00.000Z');
rows[2][3]=nativeDate;
const typed=ctx.Swap20_captureCanonicalBeforeImages_({auditA:'A',auditB:'B',originalRevisions:{A:'revision-A',B:'revision-B'}});
assert.equal(typed.rows[1].values[3].toISOString(),nativeDate.toISOString());
rows[2][3]='2026-11-03';
typed.rollbackExpectedBlocksA=[];
typed.rollbackExpectedBlocksB=[{date:'2026-11-03'}];
ctx.Swap20_restoreCanonicalBeforeImages_(typed);
assert.equal(rows[2][3].toISOString(),nativeDate.toISOString());
rows[2][0]='WRONG';
assert.throws(()=>ctx.Swap20_restoreCanonicalBeforeImages_(before),/identity mismatch/);
console.log('Swap canonical snapshot and rollback tests passed');
