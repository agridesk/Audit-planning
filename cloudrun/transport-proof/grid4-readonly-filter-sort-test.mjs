import assert from 'node:assert/strict';
import {grid4FilterSort} from './grid4-readonly-filter-sort.mjs';
const data=[
 {auditId:'A',company:'Azalea',status:'Approved',scopes:['ABC','GAP'],hours:8,date:'2027-01-02'},
 {auditId:'B',company:'Begonia',status:'Pending',scopes:['ABC'],hours:12,date:'2026-12-03'},
 {auditId:'C',company:'Camellia',status:'Approved',scopes:['GAP'],hours:2,date:'2026-11-04'},
 {auditId:'D',company:'Dahlia',status:'Approved',scopes:[],hours:null,date:''}
];
const ids=x=>x.map(r=>r.auditId).join(',');
assert.equal(ids(grid4FilterSort(data)), 'A,B,C,D');
assert.equal(ids(grid4FilterSort(data,{filters:[{key:'status',values:['Approved']},{key:'scopes',values:['ABC','GAP']}]})), 'A,C');
assert.equal(ids(grid4FilterSort(data,{filters:[{key:'status',values:['Approved','Pending']},{key:'scopes',values:['ABC']}]})), 'A,B');
assert.equal(ids(grid4FilterSort(data,{sorts:[{key:'hours',type:'number',direction:'asc'}]})), 'C,A,B,D');
assert.equal(ids(grid4FilterSort(data,{sorts:[{key:'date',type:'date',direction:'desc'}]})), 'A,B,C,D');
assert.equal(ids(grid4FilterSort(data,{search:'begonia',searchValue:r=>r.company})), 'B');
assert.deepEqual(data.map(x=>x.auditId),['A','B','C','D']);
console.log('Grid4 pure filter/sort: 7 tests passed');
