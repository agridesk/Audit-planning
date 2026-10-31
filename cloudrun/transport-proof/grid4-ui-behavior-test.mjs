import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const begin=source.indexOf('var grid4State='),end=source.indexOf('function renderHead(){',begin);
assert.ok(begin>=0&&end>begin,'Grid 4 UI code section present');
const snippet=source.slice(begin,end);
const code=new Function('locationText','gpsValue','effectiveExpiry','eligibilityConflictText',
  'var currentView="open";'+snippet+';return {apply:grid4Apply,state:grid4State,view:v=>currentView=v};');
const grid=code(r=>r.location||'',r=>r.gps||'',r=>r.expirationDate||'',r=>r.latestComment||'');
const sample=[
 {auditId:'A',company:'Alpha',scopesText:'ABC, GAP',requiredHours:8,planningWindowFrom:'2026-11-01'},
 {auditId:'B',company:'Beta',scopesText:'GAP',requiredHours:12,planningWindowFrom:'2027-01-01'},
 {auditId:'C',company:'Gamma',scopesText:'ABC',requiredHours:3,planningWindowFrom:'2026-12-01'},
 {auditId:'D',company:'Delta',scopesText:'',requiredHours:'',planningWindowFrom:''}
];
const ids=rows=>rows.map(r=>r.auditId).join(',');
assert.equal(ids(grid.apply(sample)),'A,B,C,D');
grid.state.open.filters.scopesText='ABC';
assert.equal(ids(grid.apply(sample)),'A,C');
grid.state.open.sorts=[{key:'requiredHours',dir:'desc'}];
assert.equal(ids(grid.apply(sample)),'A,C');
grid.state.open.filters={requiredHours:'>=8'};
assert.equal(ids(grid.apply(sample)),'B,A');
grid.state.open.filters={planningWindowFrom:'2026-12-01'};
assert.equal(ids(grid.apply(sample)),'C');
grid.state.open.filters={};
grid.state.open.sorts=[{key:'requiredHours',dir:'asc'}];
assert.equal(ids(grid.apply(sample)),'C,A,B,D');
assert.deepEqual(sample.map(r=>r.auditId),['A','B','C','D']);
console.log('Grid 4 UI behavior regression: 7 checks passed');
