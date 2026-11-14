import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const start=source.indexOf('function effectiveMinPlanningDate20()');
const end=source.indexOf('function renderAvailability()',start);
assert.ok(start>0&&end>start,'Per-scope minimum interval resolver required');
const ctx={
 composition20:{mode:'TOGETHER',selectedScope:'OB-GAP',scopes:[
  {obligationId:'OB-GAP',scopeCode:'MPS-GAP'},
  {obligationId:'OB-GRASP',scopeCode:'GRASP'}
 ]},
 model:{data:{audit:{
  minPlanningDate:'2027-05-03',
  minIntervalByScope:[
   {scopeCode:'MPS-GAP',minPlanningDate:'2027-05-03'},
   {scopeCode:'GRASP',minPlanningDate:'2027-01-15'}
  ]
 }}}
};
runInNewContext(source.slice(start,end)+';this.resolveMinimum=effectiveMinPlanningDate20;',ctx);
assert.equal(ctx.resolveMinimum(),'2027-05-03','Together must apply maximum of all required scope minimum intervals');
ctx.composition20.mode='SEPARATELY';
assert.equal(ctx.resolveMinimum(),'2027-05-03','Separate MPS-GAP inherits only its own interval');
ctx.composition20.selectedScope='OB-GRASP';
assert.equal(ctx.resolveMinimum(),'2027-01-15','Separate GRASP must not inherit the other scope maximum');
ctx.model.data.audit.minIntervalByScope=[{scopeCode:'MPS-GAP',minPlanningDate:'2027-05-03'}];
assert.equal(ctx.resolveMinimum(),'','Selected scope without a minimum interval must not inherit unrelated scope restriction');
ctx.model.data.audit.minIntervalByScope=undefined;
assert.equal(ctx.resolveMinimum(),'2027-05-03','Missing per-scope evidence must retain the conservative audit-level interval');
ctx.model.data.audit.minIntervalByScope=[];
assert.equal(ctx.resolveMinimum(),'2027-05-03','Empty evidence must not bypass a known audit-level interval');
ctx.composition20.mode='TOGETHER';
assert.equal(ctx.resolveMinimum(),'2027-05-03','Together continues enforcing the aggregate maximum');
for(const part of [
 'minExecutionDate=effectiveMinPlanningDate20(),email=',
 'minExecutionDate=effectiveMinPlanningDate20();if(!selectedWindow.valid)',
 'minExecutionDate=effectiveMinPlanningDate20();if(!existing',
 'minExecutionDate=effectiveMinPlanningDate20(),minIntervalValid='
])assert.ok(source.includes(part),'All calendar, warning and save gates use effective interval: '+part);
console.log('Planning per-scope minimum interval: Together strict; Separately independent; calendar and save parity PASS');
