import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const start=src.indexOf('var grid4State='),end=src.indexOf('function renderHead(){',start);
assert.ok(start>=0&&end>start,'Grid 4 code exists');
const make=new Function('locationText','gpsValue','effectiveExpiry','eligibilityConflictText',
 'var currentView="open";'+src.slice(start,end)+';return {apply:grid4Apply,state:grid4State};');
const g=make(r=>r.locations||'',r=>r.gps||'',r=>r.expirationDate||'',r=>'');
const data=[
 {company:'Alfa',scopesText:'ABC',planningWindowFrom:'2026-11-01',requiredHours:8},
 {company:'Beta',scopesText:'GAP',planningWindowFrom:'2026-12-01',requiredHours:12},
 {company:'Gamma',scopesText:'ABC+GAP',planningWindowFrom:'2027-01-01',requiredHours:3},
 {company:'Delta',scopesText:'',planningWindowFrom:'',requiredHours:''}
];
const names=rows=>rows.map(x=>x.company).join(',');
g.state.open.filters.scopesText='ABC|GAP';
assert.equal(names(g.apply(data)),'Alfa,Beta,Gamma','OR within one column');
g.state.open.filters={scopesText:'ABC|GAP',planningWindowFrom:'2026-12-01'};
assert.equal(names(g.apply(data)),'Beta','AND between columns');
g.state.open.filters={planningWindowFrom:'2026-12-01'};
assert.equal(names(g.apply(data)),'Beta','exact ISO date');
g.state.open.filters={requiredHours:'>=8'};
assert.equal(names(g.apply(data)),'Alfa,Beta','empty numeric is not zero');
g.state.open.filters={requiredHours:'=0'};
assert.equal(names(g.apply(data)),'','empty numeric cannot match zero');
g.state.open.filters={};
g.state.open.sorts=[{key:'requiredHours',dir:'asc'}];
assert.equal(names(g.apply(data)),'Gamma,Alfa,Beta,Delta','numeric ascending keeps blanks last');
g.state.open.sorts=[{key:'requiredHours',dir:'desc'}];
assert.equal(names(g.apply(data)),'Beta,Alfa,Gamma,Delta','numeric descending keeps blanks last');
assert.equal(data[0].company,'Alfa','source remains unchanged');
console.log('Grid 4 column-filter regression: 8 checks passed');
