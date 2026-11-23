import assert from 'node:assert/strict';
import {callerOf20,createAuditPlanningWriteGuard20,guardedTabsTouched20} from './audit-planning-write-guard-20.js';

const titles=new Map([[0,'Audit planning'],[11,'Auditors']]);
const touched=(path,body)=>guardedTabsTouched20({path,body,sheetTitles:titles});
assert.deepEqual(touched('/values:batchUpdate',{data:[{range:'Audit planning!A5:BW5'},{range:'Auditors!A2'}]}),['Audit planning']);
assert.deepEqual(touched('/values:batchUpdate',{data:[{range:'Auditors!A2'}]}),[]);
assert.deepEqual(touched("/values/'Audit%20planning'!A1:append",{}),['Audit planning']);
assert.deepEqual(touched('/values:batchClear',{ranges:["'Audit planning'!C3"]}),['Audit planning']);
assert.deepEqual(touched('/values:batchUpdateByDataFilter',{}),['DATA_FILTER']);
assert.deepEqual(touched(':batchUpdate',{requests:[{deleteDimension:{range:{sheetId:0,dimension:'ROWS',startIndex:4,endIndex:5}}}]}),['Audit planning']);
assert.deepEqual(touched(':batchUpdate',{requests:[{appendCells:{rows:[],fields:'*'}}]}),['Audit planning']);
assert.deepEqual(touched(':batchUpdate',{requests:[{updateCells:{start:{sheetId:11},rows:[],fields:'*'}}]}),[]);
assert.equal(callerOf20('Error\n    at guardedFetch (/app/audit-planning-write-guard-20.js:9:1)\n    at sheetsDeleteRow (/app/server-r4.js:581:9)\n    at async directComplete (/app/server-r4.js:1852:3)'),'server-r4.js:581<server-r4.js:1852');

const sid='SID',calls=[];
const fake=async(input,init={})=>{
 calls.push({url:String(input),method:init.method||'GET'});
 if(String(input).includes('?fields='))return new Response(JSON.stringify({sheets:[{properties:{sheetId:0,title:'Audit planning'}}]}),{status:200});
 return new Response('{}',{status:200});
};
const url=p=>'https://sheets.googleapis.com/v4/spreadsheets/'+sid+p;
const post=body=>({method:'POST',headers:{authorization:'Bearer t'},body:JSON.stringify(body)});
const logs=[];
const observe=createAuditPlanningWriteGuard20({spreadsheetId:sid,fetchImpl:fake,mode:'observe',log:x=>logs.push(x)});
assert.equal((await observe.fetch(url('/values:batchUpdate'),post({data:[{range:'Audit planning!A2'}]}))).status,200);
assert.equal(logs.at(-1).event,'AUDIT_PLANNING_UNFENCED_WRITE');
assert.match(logs.at(-1).caller,/audit-planning-write-guard-20-test\.mjs:\d+/);
await observe.fetch(url('/values:batchUpdate'),post({data:[{range:'Auditors!A2'}]}));
await observe.fetch(url('/values:batchGet?ranges=Audit%20planning'));
await observe.trustedFetch(url('/values:batchUpdate'),post({data:[{range:'Audit planning!A2'}]}));
await observe.fetch('https://firestore.googleapis.com/v1/x',post({}));
const s=observe.stats();
assert.equal(s.observed,1);assert.equal(s.trusted,1);assert.equal(s.refused,0);assert.equal(logs.length,1);

calls.length=0;
const enforce=createAuditPlanningWriteGuard20({spreadsheetId:sid,fetchImpl:fake,mode:'enforce'});
const refused=await enforce.fetch(url(':batchUpdate'),post({requests:[{deleteDimension:{range:{sheetId:0,dimension:'ROWS',startIndex:4,endIndex:5}}}]}));
assert.equal(refused.status,409);
assert.equal((await refused.json()).error.message,'AUDIT_PLANNING_WRITE_NOT_FIRESTORE_FIRST');
assert.ok(!calls.some(c=>c.method==='POST'),'refused write must not reach Sheets');
assert.equal((await enforce.fetch(url('/values:batchUpdate'),{method:'POST',body:'{bad'})).status,409);
assert.equal((await enforce.trustedFetch(url('/values:batchUpdate'),post({data:[{range:'Audit planning!A2'}]}))).status,200);
assert.equal(enforce.stats().refused,1);assert.equal(enforce.stats().unresolved,1);
assert.throws(()=>createAuditPlanningWriteGuard20({spreadsheetId:sid,fetchImpl:fake,mode:'on'}),/CONFIG_INVALID/);
console.log('audit-planning-write-guard-20 tests passed');
