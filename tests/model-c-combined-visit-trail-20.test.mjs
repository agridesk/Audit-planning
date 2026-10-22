import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../ModelCCombinedVisitTrail20.js',import.meta.url),'utf8');
function sheet(){const rows=[Array.from({length:13},()=> '')];return{rows,getLastRow:()=>rows.length,
 appendRow:x=>rows.push(x.slice()),
 getRange:(row,col,n,m)=>({createTextFinder:hash=>({matchEntireCell:()=>({findNext:()=>rows.slice(row-1,row-1+n).find(x=>x[col-1]===hash)||null})})})};}
const sh=sheet(),ss={getSpreadsheetTimeZone:()=> 'Europe/Amsterdam',getSheetByName:n=>n==='Notification Queue'?sh:null};
const context=vm.createContext({Date,JSON,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 Utilities:{DigestAlgorithm:{MD5:'MD5'},computeDigest:(algo,input)=>Array.from(createHash('md5').update(input).digest()).map(x=>x>127?x-256:x),
 formatDate:()=> '2026-10-22 19:00'}});
vm.runInContext(code,context);
const payload={targetAuditId:'A1',sourceAuditIds:['A2'],obligationIds:['O1','O2'],actorEmail:'manager@example.test',company:'Test'};
const first=context.ModelCCombinedVisitTrail20_emit(payload);assert.equal(first.added,2);assert.equal(first.alreadyPresent,0);
const second=context.ModelCCombinedVisitTrail20_emit(payload);assert.equal(second.added,0);assert.equal(second.alreadyPresent,2);
assert.equal(sh.rows.length,3);
assert.equal(sh.rows[1][1],'AUDIT_TRAIL');assert.equal(sh.rows[2][2],'VISIT_SOURCE_PROJECTION_RETIRED');
assert.notEqual(sh.rows[1][10],sh.rows[2][10]);
console.log('MODEL_C_COMBINED_VISIT_TRAIL: PASS');
