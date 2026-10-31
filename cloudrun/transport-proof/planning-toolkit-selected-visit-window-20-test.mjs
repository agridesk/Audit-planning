import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./server-r5.js',import.meta.url),'utf8');
const begin=source.indexOf('function selectedVisitWindow()'),end=source.indexOf('function renderAvailability()',begin);
assert.ok(begin>0&&end>begin,'Toolkit visit window helper required');
const code=source.slice(begin,end).replace(/\\\\/g,'\\');
const members=[
 {auditId:'AUD-2026',isPrimary:true,planningWindowFrom:'2026-11-01',planningWindowTo:'2026-12-31'},
 {auditId:'AUD-2027',planningWindowFrom:'2027-01-01',planningWindowTo:'2027-04-30'},
 {auditId:'AUD-OVERLAP',planningWindowFrom:'2026-12-01',planningWindowTo:'2027-03-01'}
];
const context={model:{data:{audit:{...members[0],companyPlanningSet:members}}},visitAuditIds:new Set(['AUD-2026'])};
runInNewContext(code,context);
assert.equal(context.selectedVisitWindow().from,'2026-11-01');
assert.equal(context.selectedVisitWindow().to,'2026-12-31');
assert.equal(context.selectedVisitWindow().valid,true);
context.visitAuditIds.add('AUD-2027');
assert.equal(context.selectedVisitWindow().valid,false,'Non-overlapping 2026/2027 audit windows cannot be combined');
context.visitAuditIds.delete('AUD-2027');
context.visitAuditIds.add('AUD-OVERLAP');
assert.equal(context.selectedVisitWindow().from,'2026-12-01');
assert.equal(context.selectedVisitWindow().to,'2026-12-31');
context.model.data.audit.companyPlanningSet[2].planningWindowTo='';
assert.equal(context.selectedVisitWindow().valid,false,'Missing canonical window is not silently ignored');
context.model.data.audit.companyPlanningSet=[{...members[0],planningWindowFrom:'',planningWindowTo:''}];
context.model.data.audit.planningWindowFrom='';context.model.data.audit.planningWindowTo='';
context.model.data.period={from:'2026-11-01',to:'2027-01-31'};
context.visitAuditIds=new Set(['AUD-2026']);
assert.equal(context.selectedVisitWindow().valid,true,'Standalone non-recurring audit retains bounded operational horizon');
assert.equal(context.selectedVisitWindow().to,'2027-01-31');
context.model.data.audit.companyPlanningSet.push({...members[1],planningWindowFrom:'',planningWindowTo:''});
context.visitAuditIds.add('AUD-2027');
assert.equal(context.selectedVisitWindow().valid,false,'Combined visit never inherits operational horizon when canonical window is missing');
assert.ok(source.includes('selectedWindow=selectedVisitWindow(),allowedFrom='),'Calendar derives selected intersection');
assert.ok(source.includes('windowValid=selectedWindow.valid&&draftBlocks.every'),'Save validation checks selected intersection');
assert.ok(source.includes("renderPlanningConstraints();const visitWindow=selectedVisitWindow()"),'Changing membership refreshes window warning and calendar');
assert.ok(source.includes("renderAvailability();validate()}));renderVisitComposition()"),'Changing combined membership refreshes calendar');
console.log('Toolkit selected 2026/2027 visit windows: standalone, disjoint, overlap and missing-window checks passed');
