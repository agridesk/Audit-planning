import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareCompositionManagerNotifications20 as build} from './visit-composition-manager-notifications-20.mjs';
const obligations=[
 {auditId:'A-1',companyUid:'C-1',obligationId:'O1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A-1',companyUid:'C-1',obligationId:'O2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
];
const blocks=[{date:'2026-11-18',start:'08:00',end:'16:00'},{date:'2026-11-19',start:'09:00',end:'12:00'}];
const cmd=(mode)=>prepareVisitCompositionCommand20({
 auditId:'A-1',companyUid:'C-1',sourceRevision:'a'.repeat(24),obligations,mode,
 ...(mode==='TOGETHER'?{
  blocks,allocations:[
   {blockIndex:0,obligationId:'O1',start:'08:00',end:'16:00'},
   {blockIndex:1,obligationId:'O2',start:'09:00',end:'12:00'}
  ]
 }:{visits:[
  {auditId:'A-1',obligationId:'O1',blocks:[blocks[0]]},
  {auditId:'A-2',obligationId:'O2',identityIssuedBy:'CANONICAL',
   identityIssueRevision:'b'.repeat(24),blocks:[blocks[1]]}
 ]})
});
const cfg=()=>[['EVENT_KEY','ACTIVE','SEND_EMAIL','TEMPLATE_FAMILY','TEMPLATE_KEY_DEFAULT'],
 ['AUDIT_PLANNED_BY_MANAGER','YES','YES','RICH_OPERATIONAL','AUDIT_PLANNED_BY_MANAGER']];
const details=(auditId,obligationId,hours,block)=>({
 auditId,obligationId,auditorEmail:'auditor@example.com',auditorName:'Auditor One',
 planningJson:JSON.stringify({blocks:block,formalHours:hours,totalPlannedHours:hours,
 offsiteHours:0,maxOffsiteHours:0,auditorEmail:'auditor@example.com',auditorName:'Auditor One'})
});
const input=(mode)=>({
 command:cmd(mode),company:'Company One',actorEmail:'manager@example.com',
 notificationConfigRows:cfg(),now:'2026-11-11T17:10:00',
 visits:mode==='TOGETHER'?[details('A-1',null,11,blocks)]:[
 details('A-1','O1',8,[blocks[0]]),details('A-2','O2',3,[blocks[1]])]
});
const together=build(input('TOGETHER'));
assert.equal(together.queueRows.length,2);
assert.equal(together.queueRows[0][1],'AUDIT_TRAIL');
assert.equal(together.queueRows[0][2],'LIFECYCLE_STATUS_CHANGED');
assert.equal(JSON.parse(together.queueRows[0][12]).payload.afterStatus,'Approved');
assert.equal(together.queueRows[1][2],'AUDIT_PLANNED_BY_MANAGER');
assert.equal(together.queueRows[1][3],'auditor@example.com');
assert.equal(together.queueRows[1][4],'A-1');
assert.equal(together.queueRows[1][10].length,32);
assert.deepEqual(JSON.parse(together.queueRows[1][12]).payload.scopes,['GAP','GRASP']);
const split=build(input('SEPARATELY'));
assert.equal(split.queueRows.length,4);
assert.deepEqual(split.queueRows.map(x=>x[4]),['A-1','A-1','A-2','A-2']);
assert.deepEqual([split.queueRows[1],split.queueRows[3]].map(x=>JSON.parse(x[12]).payload.plannedHours),[8,3]);
assert.equal(split.appendIntents[0].range,'Notification Queue!A:M');
assert.equal(split.canCommit,false);
const err=(change,code)=>{const x=input('SEPARATELY');change(x);assert.throws(()=>build(x),e=>e?.code===code,code)};
err(x=>{x.notificationConfigRows[1][1]='NO'},'COMPOSITION_NOTIFICATIONS_EVENT_NOT_CANONICAL_ACTIVE');
err(x=>{x.notificationConfigRows[1][2]='NO'},'COMPOSITION_NOTIFICATIONS_EVENT_NOT_CANONICAL_ACTIVE');
err(x=>{x.notificationConfigRows[1][0]='COMPOSE_VISIT'},'COMPOSITION_NOTIFICATIONS_EVENT_NOT_CANONICAL_ACTIVE');
err(x=>{x.visits[1].auditId='WRONG'},'COMPOSITION_NOTIFICATIONS_VISIT_IDS_MISMATCH');
err(x=>{x.visits[1].auditorEmail='invalid'},'COMPOSITION_NOTIFICATIONS_AUDITOR_MISSING');
err(x=>{x.visits[1].planningJson='garbled'},'COMPOSITION_NOTIFICATIONS_PLAN_JSON_INVALID');
err(x=>{const p=JSON.parse(x.visits[1].planningJson);p.formalHours=4;x.visits[1].planningJson=JSON.stringify(p)},'COMPOSITION_NOTIFICATIONS_SCOPE_HOURS_MISMATCH');
console.log('VISIT_COMPOSITION_MANAGER_NOTIFICATIONS_20_PASS: canonical event, each Visit recipient, digest identity, active config, no writes');
