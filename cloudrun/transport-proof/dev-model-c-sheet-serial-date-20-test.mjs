import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const server=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const a=server.indexOf('function normalizeDevModelCDateCells20(');
const b=server.indexOf('async function readIsolatedDevModelCExt20()',a);
assert(a>=0&&b>a,'DEV Model C Sheets date normalizer exists');
const sandbox={Date,Error,Number,Array};
vm.createContext(sandbox);
vm.runInContext(server.slice(a,b),sandbox);
const f=sandbox.normalizeDevModelCDateCells20;
assert.equal(typeof f,'function');
const data=[
 {values:[['Obligation_ID','Base_Expiry_Date','Formal_Hours','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To'],
          ['OB1',46262,8,46262,46139,46231],
          ['OB2','2027-02-15',6,'2027-02-15','2026-11-15','2027-02-15']]},
 {values:[['Audit_ID','Obligation_ID','Link_State'],['A1','OB1','ACTIVE']]},
 {values:[['Audit ID','Extended Expiration Date','Total audit time in hours','Planning window from','Planning window to'],
          ['A1',46262,8,46139,46231]]}
];
const clone=JSON.parse(JSON.stringify(data));
const result=f(data);
const iso=n=>new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10);
assert.equal(result.obligations[1][1],iso(46262));
assert.equal(result.obligations[1][3],iso(46262));
assert.equal(result.obligations[1][4],iso(46139));
assert.equal(result.obligations[2][1],'2027-02-15');
assert.equal(result.obligations[1][2],8,'Formal hours must never be converted');
assert.equal(result.planning[1][1],iso(46262));
assert.equal(result.planning[1][2],8,'Planning hours must remain numeric');
assert.equal(result.planning[1][3],iso(46139));
assert.equal(result.planning[1][4],iso(46231));
assert.deepEqual(data,clone,'Source reads must remain immutable');
assert.throws(()=>f([{values:[['Base_Expiry_Date'],[46262.5]]},null,{values:[['Audit ID']]}]),/EXT_DEV_DATE_SERIAL_INVALID/);
assert(server.includes('obligationRows:dates.obligations')&&server.includes('const planningRows=isolatedExtAtomicPreflight20()?await readCanonicalPlanningRowsForAtomic20():dates.planning')&&server.includes('return {obligationRows:dates.obligations,linkRows:r[1]?.values||[],planningRows,scopeRows:r[3]?.values||[]}')&&server.includes('inspectDevScopeExtension20({...source,companyUid})')&&server.includes('inspectDevScopeExtension20({...await readIsolatedDevModelCExt20(),companyUid})'),'Both normalized datasets must reach the Model C inspector and post-write readback; atomic preflight must use canonical planning rows');
console.log('DEV Model C numeric Sheets serial date conversion and immutable readback PASS');
