import assert from 'node:assert/strict';
import {buildPlanningValuesFromAudits20,comparePlanningGridSources20,listAllPlanningAudits20} from './planning-firestore-grid-projection-20.js';

const headers=['Audit ID','Company','Status','Planning JSON'];
const audit=(auditId,sourceRow,row,extra={})=>({auditId,revision:0,snapshot:{auditId,sourceRow,headers,row},...extra});
const records=[
 audit('B',3,['B','Co B','Accepted','{}','']),
 audit('A',2,['A','Co A','Pending Planning']),
 audit('X',4,['X','gone','Completed'],{removed:true})
];

// Rows ordered by original sheet row, removed audits excluded, trailing blanks trimmed.
assert.deepEqual(buildPlanningValuesFromAudits20(records),[headers,['A','Co A','Pending Planning'],['B','Co B','Accepted','{}']]);
assert.throws(()=>buildPlanningValuesFromAudits20([audit('A',2,['A']),audit('B',2,['B'])]),/GRID_FIRESTORE_SOURCE_ROW_DUPLICATE/);
assert.throws(()=>buildPlanningValuesFromAudits20([audit('A',2,['A']),{auditId:'B',snapshot:{auditId:'B',sourceRow:3,headers:['Other'],row:['B']}}]),/GRID_FIRESTORE_HEADERS_DIVERGENT/);
assert.throws(()=>buildPlanningValuesFromAudits20([{auditId:'C',snapshot:{auditId:'C',status:'Approved'}}]),/GRID_FIRESTORE_SNAPSHOT_SHAPE_UNSUPPORTED/);
assert.throws(()=>buildPlanningValuesFromAudits20([]),/GRID_FIRESTORE_EMPTY/);

// Parity: identical sources are ready; every drift class is reported by row number only.
const sheet=[headers,['A','Co A','Pending Planning'],['B','Co B','Accepted','{}']];
const same=comparePlanningGridSources20(sheet,records);
assert.equal(same.ready,true);assert.equal(same.matched,2);assert.deepEqual(same.problems,[]);
const drift=comparePlanningGridSources20([headers,['A','Co A','Approved'],['B','Co B','Accepted','{}'],['N','Co N','Pending Planning']],[...records,audit('Z',9,['Z','Co Z','Approved'])]);
assert.equal(drift.ready,false);
assert.deepEqual(drift.reasons,{ROW_CONTENT_MISMATCH:1,FIRESTORE_AUDIT_MISSING:1,FIRESTORE_AUDIT_NOT_IN_SHEET:1});
assert.ok(drift.problems.every(p=>Object.keys(p).sort().join()==='reason,sourceRow'));
assert.ok(!JSON.stringify(drift).includes('Co '),'parity report must not contain business data');

// Pagination is bounded and fails closed when truncated.
const pages={'':{audits:[records[0]],nextPageToken:'p2'},p2:{audits:[records[1]],nextPageToken:null}};
const calls=[];
const store={async listAudits({pageSize,pageToken}){calls.push([pageSize,pageToken]);return pages[pageToken];}};
assert.equal((await listAllPlanningAudits20(store)).length,2);
assert.deepEqual(calls,[[200,''],[200,'p2']]);
await assert.rejects(()=>listAllPlanningAudits20({async listAudits(){return {audits:[],nextPageToken:'again'};}},{maxPages:3}),/GRID_FIRESTORE_SCAN_TRUNCATED/);
console.log('planning-firestore-grid-projection-20-test: ok');
