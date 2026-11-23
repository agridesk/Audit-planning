import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeLifecycleWriteset,normalizeRejectWritesetWithPlanning,mergeLifecycleWritesets} from './planning-lifecycle-writeset-20.js';
const src=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const from=src.indexOf('async function lifecycleAuthorityPreflight20');
const to=src.indexOf('async function canonicalManagerAction',from);
assert.ok(from>=0&&to>from);
const part=src.slice(from,to);
const slash=String.fromCharCode(92);
assert.ok(!part.includes(slash+slash+'d+'),'Double-escaped lifecycle row digits remain');
assert.equal(part.split(slash+'d+').length-1,5,'Expected five corrected lifecycle row captures');
const rx=new RegExp('^Audit planning!([A-Z]+)('+slash+'d+):([A-Z]+)('+slash+'d+)$');
for(const x of ['Audit planning!A2:BY2','Audit planning!A111:BY111'])assert.ok(rx.test(x));
assert.equal(rx.test('Audit planning!Afoo:BYfoo'),false);

let capture,requests=[];
const planning=[['Audit ID','Status','Assigned to','Auditor_UID'],['audit-1','Accepted','auditor','uid']];
const context={
 process:{env:{AMS_RUNTIME_ENV:'DEV',AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED:'true'}},
 lifecyclePreviewContext20:{run(value,fn){capture=value;return fn();}},
 sheetsBatchGet:async ranges=>{
  requests.push(ranges);
  return ranges.map(range=>{
   if(range==='Audit planning!A1:BW2000')return {values:planning};
   if(range==='Audit planning!A2:D2')return {values:[planning[1]]};
   if(range==='Company_Scopes!A3:B3')return {values:[['scope-1','YES']]};
   throw Error('UNEXPECTED_RANGE_'+range);
  });
 },
 normalizeLifecycleWriteset,normalizeRejectWritesetWithPlanning,mergeLifecycleWritesets,
 clean:x=>String(x||'').trim(),
 findAudit:(rows,id)=>rows[1][0]===id?{h:rows[0],row:rows[1],sourceRow:2}:null,
 col:(headers,names)=>headers.findIndex(x=>names.includes(x)),
 val:(row,index)=>row[index]||'',
 a1col:n=>String.fromCharCode(64+n),
 directRowRevision:(_headers,row)=>JSON.stringify(row)
};
const preflight=vm.runInNewContext('('+part.trim()+')',context);
const writer=async()=>{
 capture.writes.push({range:'Company_Scopes!A3:B3',values:[['scope-1','NO']]});
 capture.deletes.push({sheetTitle:'Audit planning',rowNumber:2});
 return {success:true};
};
const result=await preflight({}, {auditId:'audit-1',authorityPreflight:true},'REJECT',writer);
assert.equal(requests.length,1,'planning and BEFORE images use one batch read');
assert.deepEqual(requests[0],['Audit planning!A1:BW2000','Company_Scopes!A3:B3']);
assert.deepEqual(JSON.parse(JSON.stringify(result.projectionWrites)),[
 {range:'Audit planning!A2:D2',values:[['audit-1','Rejected','','']]},
 {range:'Company_Scopes!A3:B3',values:[['scope-1','NO']]}
]);
assert.deepEqual(JSON.parse(JSON.stringify(result.projectionPreconditions)),[
 {range:'Audit planning!A2:D2',before:['audit-1','Accepted','auditor','uid']},
 {range:'Company_Scopes!A3:B3',before:['scope-1','YES']}
]);
assert.equal(result.expectedSourceRevision,JSON.stringify(planning[1]));
await assert.rejects(()=>preflight({}, {auditId:'audit-1',authorityPreflight:true},'REJECT',async()=>{
 capture.writes.push({range:'Company_Scopes!A3:B3',values:[['scope-1','NO']]});
 capture.deletes.push({sheetTitle:'Audit planning',rowNumber:3});
 return {success:true};
}),/LIFECYCLE_PREFLIGHT_DELETE_TARGET_UNSUPPORTED/);
requests=[];
const fallback=await preflight({}, {auditId:'audit-1',authorityPreflight:true},'REJECT',async()=>{
 capture.writes.push({range:'Audit planning!A2:D2',values:[['audit-1','Accepted','changed','uid']]});
 capture.deletes.push({sheetTitle:'Audit planning',rowNumber:2});
 return {success:true};
});
assert.equal(requests.length,1,'overlapping planning writes reuse the same fresh planning snapshot');
assert.deepEqual(JSON.parse(JSON.stringify(fallback.projectionPreconditions[0].before)),planning[1]);
assert.deepEqual(JSON.parse(JSON.stringify(fallback.projectionWrites[0].values)),[['audit-1','Rejected','','']]);
console.log('PLANNING_LIFECYCLE_PREFLIGHT_RANGE_PASS');
