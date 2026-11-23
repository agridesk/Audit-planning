import assert from 'node:assert/strict';
import {buildPlanningValuesFromAudits20,comparePlanningGridSources20,deriveTotalAuditHours20,listAllPlanningAudits20,scopeDefaultHours20} from './planning-firestore-grid-projection-20.js';

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
// Firestore-first audits without a Sheets row follow legacy rows, ordered by Audit ID.
assert.deepEqual(buildPlanningValuesFromAudits20([audit('Q',undefined,['Q']),audit('P',undefined,['P']),audit('A',2,['A'])]).slice(1),[['A'],['P'],['Q']]);
assert.equal(comparePlanningGridSources20([headers,['A','Co A','Pending Planning']],[audit('A',undefined,['A','Co A','Pending Planning'])]).ready,true);
const hoursDrift=comparePlanningGridSources20([['Audit ID','SCOPE_01','Total audit time in hours'],['A','x','3']],
 [{auditId:'A',revision:0,snapshot:{auditId:'A',sourceRow:2,headers:['Audit ID','SCOPE_01','Total audit time in hours'],row:['A','x','3']}}],
 {scopeDefaults:scopeDefaultHours20([['SlotKey','Default_hours'],['SCOPE_01','4']])});
assert.deepEqual(hoursDrift.hoursDiagnostics,{SHEET_HOURS_NOT_RECOMPUTED:1});
assert.deepEqual(comparePlanningGridSources20([headers],[...records,{auditId:'M',revision:0,lastOperationId:'o',snapshot:{auditId:'M',status:'Approved'}}]).shapeDiagnostics,{'auditId|status#op#rev0':1});

// Parity: identical sources are ready; every drift class is reported by row number only.
const sheet=[headers,['A','Co A','Pending Planning'],['B','Co B','Accepted','{}']];
const same=comparePlanningGridSources20(sheet,records);
assert.equal(same.ready,true);assert.equal(same.matched,2);assert.deepEqual(same.problems,[]);
const drift=comparePlanningGridSources20([headers,['A','Co A','Approved'],['B','Co B','Accepted','{}'],['N','Co N','Pending Planning']],[...records,audit('Z',9,['Z','Co Z','Approved'])]);
assert.equal(drift.ready,false);
assert.deepEqual(drift.reasons,{ROW_CONTENT_MISMATCH:1,FIRESTORE_AUDIT_MISSING:1,FIRESTORE_AUDIT_NOT_IN_SHEET:1});
assert.deepEqual(drift.mismatchColumns,{Status:1});
assert.deepEqual(drift.missingStatuses,{'Pending Planning':1});
assert.ok(drift.problems.every(p=>Object.keys(p).sort().join()==='reason,sourceRow'));
assert.ok(!JSON.stringify(drift).includes('Co '),'parity report must not contain business data');

// Pagination is bounded and fails closed when truncated.
const pages={'':{audits:[records[0]],nextPageToken:'p2'},p2:{audits:[records[1]],nextPageToken:null}};
const calls=[];
const store={async listAudits({pageSize,pageToken}){calls.push([pageSize,pageToken]);return pages[pageToken];}};
assert.equal((await listAllPlanningAudits20(store)).length,2);
assert.deepEqual(calls,[[200,''],[200,'p2']]);
await assert.rejects(()=>listAllPlanningAudits20({async listAudits(){return {audits:[],nextPageToken:'again'};}},{maxPages:3}),/GRID_FIRESTORE_SCAN_TRUNCATED/);

// Derived "Total audit time in hours" follows GAS AuditTimeV5: overrides win, else Config_Scopes defaults.
const scopeHead=['Audit ID','SCOPE_01','SCOPE_02','Duration SCOPE_02','Total audit time in hours'];
const defaults=scopeDefaultHours20([['SlotKey','Default_hours'],['SCOPE_01','4'],['SCOPE_02','2,5']]);
assert.equal(defaults.get('SCOPE_02'),2.5);
const defaultsDot=scopeDefaultHours20([['SlotKey','Default_hours'],['SCOPE_01','4'],['SCOPE_02','2.5']]);
assert.deepEqual(deriveTotalAuditHours20(scopeHead,['A','x','x','','1'],defaultsDot),['A','x','x','',6.5]);
assert.deepEqual(deriveTotalAuditHours20(scopeHead,['A','x','X','3','1'],defaultsDot),['A','x','X','3',7]);
assert.throws(()=>scopeDefaultHours20([['Other']]),/GRID_CONFIG_SCOPES_SCHEMA_INVALID/);
const stale=[{auditId:'A',revision:0,snapshot:{auditId:'A',sourceRow:2,headers:scopeHead,row:['A','x','','','4']}}];
const changedSheet=[scopeHead,['A','x','','','5,5']];
assert.deepEqual(comparePlanningGridSources20(changedSheet,stale).mismatchColumns,{'Total audit time in hours':1});
const rederived=comparePlanningGridSources20(changedSheet,stale,{scopeDefaults:scopeDefaultHours20([['SlotKey','Default_hours'],['SCOPE_01','5.5']])});
assert.equal(rederived.ready,true);
assert.deepEqual(buildPlanningValuesFromAudits20(stale,{scopeDefaults:defaultsDot})[1],['A','x','','',4]);
console.log('planning-firestore-grid-projection-20-test: ok');
