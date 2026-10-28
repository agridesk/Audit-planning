import assert from 'node:assert/strict';
import {createPlanningOverlayService} from './availability-planning-overlay-service-20.js';
const actor={id:'manager:a',role:'manager'};
const base=id=>({auditorId:id,version:3,blocks:[],baselineExceptions:[],baselineReleases:[],recurring:[],overrides:[],metadata:{changes:[],historyComplete:true}});
let reads=0;
const service={read:async(a,id)=>base(id),mutate:async()=>({success:true})};
const rows=[['Audit ID','Status','Assigned to','Planning JSON'],['A1','ACCEPTED','a@example.com',JSON.stringify([{date:'2027-01-12',start:'09:00',end:'12:00'}])],['A2','PENDING_APPROVAL','b@example.com',JSON.stringify([{date:'2027-01-13',start:'10:00',end:'11:00'}])]];
const auditors=[{auditorId:'a',email:'a@example.com'},{auditorId:'b',email:'b@example.com'}];
const overlay=createPlanningOverlayService({service,readPlanningRows:async()=>{reads++;return rows;},listCanonicalAuditors:async()=>auditors});
const p=await overlay.period({actor,auditorId:'a',fromDate:'2027-01-11',toDate:'2027-01-14'});
assert.equal(p.version,3);
assert(p.days.find(d=>d.date==='2027-01-12').segments.some(s=>s.state==='COMMITTED'));
assert.equal(Object.values(p.auditDetails)[0].auditId,'A1');
assert.equal(Object.values(p.auditDetails)[0].date,'2027-01-12');
assert.equal(Object.values(p.auditDetails)[0].state,'COMMITTED');
assert(!p.days.find(d=>d.date==='2027-01-13').segments.some(s=>s.state==='PROVISIONAL'));
const m=await overlay.managerOverview({actor,auditorIds:['a','b'],fromDate:'2027-01-11',toDate:'2027-01-14'});
assert.equal(m.auditors.length,2);
assert(m.auditors[0].stateMinutes.COMMITTED===180);
assert(m.auditors[1].stateMinutes.PROVISIONAL===60);
assert.equal(reads,2);
await assert.rejects(()=>overlay.managerOverview({actor:{id:'a',role:'auditor'},auditorIds:['a'],fromDate:'2027-01-11',toDate:'2027-01-14'}),/NOT_AUTHORIZED/);
const rangeGuard=createPlanningOverlayService({service,readPlanningRows:async()=>{throw Error('RANGE_MUST_FAIL_BEFORE_READ');},listCanonicalAuditors:async()=>auditors});
await assert.rejects(()=>rangeGuard.period({actor,auditorId:'a',fromDate:'2027-02-30',toDate:'2027-03-01'}),/INVALID_DATE/);
await assert.rejects(()=>rangeGuard.managerOverview({actor,auditorIds:['a'],fromDate:'2027-01-01',toDate:'2027-06-01'}),/QUERY_RANGE_OUT_OF_BOUNDS/);
const broken=createPlanningOverlayService({service,readPlanningRows:async()=>null,listCanonicalAuditors:async()=>auditors});
await assert.rejects(()=>broken.period({actor,auditorId:'a',fromDate:'2027-01-11',toDate:'2027-01-14'}),/CANONICAL_PLANNING_UNAVAILABLE/);
const deniedOverlay=createPlanningOverlayService({service,readPlanningRows:async()=>{throw Error('PLANNING_READ_SHOULD_NOT_RUN');},listCanonicalAuditors:async()=>auditors});
await assert.rejects(()=>deniedOverlay.mutate({actor:{id:'b',role:'auditor'},auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',date:'2027-01-12',wholeDay:true}}),/NOT_AUTHORIZED/);
await assert.rejects(()=>deniedOverlay.mutate({actor,auditorId:'a',expectedVersion:Number.MAX_SAFE_INTEGER,mutation:{action:'BLOCK_PERIOD',date:'2027-01-12',wholeDay:true}}),/VERSION_CONFLICT/);
await assert.rejects(()=>deniedOverlay.mutate({actor,auditorId:'a',expectedVersion:3,mutation:[]}),/INVALID_MUTATION/);
let lastMutation=null;
const guarded=createPlanningOverlayService({service:{read:async(a,id)=>base(id),mutate:async args=>(lastMutation=args,{success:true})},readPlanningRows:async()=>rows,listCanonicalAuditors:async()=>auditors});
await assert.rejects(()=>guarded.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-12',toDate:'2027-01-12',wholeDay:true}}),/COMMITTED_CONFLICT/);
await assert.rejects(()=>guarded.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'EDIT_HARD_BLOCK',targetExceptionId:'old-hard',fromDate:'2027-01-12',toDate:'2027-01-12',wholeDay:true}}),/COMMITTED_CONFLICT/);
assert.equal(lastMutation,null,'Conflicting HARD writes must never reach storage');
await assert.rejects(()=>guarded.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'SET_FREE_OVERRIDE',fromDate:'2027-01-12',toDate:'2027-01-12',wholeDay:true}}),/AUDIT_CONFLICT/);
await assert.rejects(()=>guarded.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-02-30',toDate:'2027-03-01',wholeDay:true}}),/INVALID_DATE_RANGE/);
await assert.rejects(()=>guarded.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-02-03',toDate:'2027-02-02',wholeDay:true}}),/INVALID_DATE_RANGE/);
const safeHard=await guarded.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-12',toDate:'2027-01-12',start:'12:00',end:'13:00'}});
assert.equal(lastMutation.mutation.action,'BLOCK_PERIOD','Nonoverlapping HARD block may be persisted');
assert.equal(safeHard.protectedAudits.length,0);
lastMutation=null;
const doubleRows=[
 ['Audit ID','Status','Assigned to','Planning JSON','Company','Scopes','Execution location'],
 ['A-MORNING','ACCEPTED','a@example.com',JSON.stringify([{date:'2027-01-12',start:'08:00',end:'12:00'}]),'Company Morning','Scope M','Site M'],
 ['A-AFTERNOON','PENDING_APPROVAL','a@example.com',JSON.stringify([{date:'2027-01-12',start:'13:00',end:'17:00'}]),'Company Afternoon','Scope A','Site A'],
 ['B-OTHER','APPROVED','b@example.com',JSON.stringify([{date:'2027-01-12',start:'10:00',end:'15:00'}]),'Other Company','Other Scope','Other Site']
];
const doubleOverlay=createPlanningOverlayService({service,readPlanningRows:async()=>doubleRows,listCanonicalAuditors:async()=>auditors});
let doubleMutation=null;
const doubleGuard=createPlanningOverlayService({service:{read:async(a,id)=>base(id),mutate:async args=>(doubleMutation=args,{success:true})},readPlanningRows:async()=>doubleRows,listCanonicalAuditors:async()=>auditors});
await assert.rejects(()=>doubleGuard.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',date:'2027-01-12',start:'09:00',end:'10:00'}}),/COMMITTED_CONFLICT/);
assert.equal(doubleMutation,null);
const provisionalResult=await doubleGuard.mutate({actor,auditorId:'a',expectedVersion:3,mutation:{action:'BLOCK_PERIOD',date:'2027-01-12',start:'13:00',end:'14:00'}});
assert.equal(doubleMutation.mutation.action,'BLOCK_PERIOD','Provisional conflict remains separately reported');
assert.equal(provisionalResult.provisionalConflicts.length,1);
assert.equal(provisionalResult.provisionalConflicts[0].auditId,'A-AFTERNOON');
const doubleA=await doubleOverlay.period({actor,auditorId:'a',fromDate:'2027-01-12',toDate:'2027-01-12'});
const aDetails=Object.values(doubleA.auditDetails);
assert.equal(aDetails.length,2,'Both audits must be present for the same auditor and date');
assert.deepEqual(aDetails.map(x=>[x.auditId,x.start,x.end,x.state]).sort((x,y)=>x[0].localeCompare(y[0])),[
 ['A-AFTERNOON','13:00','17:00','PROVISIONAL'],
 ['A-MORNING','08:00','12:00','COMMITTED']
]);
assert(aDetails.every(x=>x.company!=='Other Company'),'Other auditor data cannot leak');
assert.equal(doubleA.days[0].segments.filter(x=>x.state==='COMMITTED').reduce((m,x)=>m+(Number(x.end.slice(0,2))*60+Number(x.end.slice(3)))-(Number(x.start.slice(0,2))*60+Number(x.start.slice(3))),0),240);
const doubleB=await doubleOverlay.period({actor,auditorId:'b',fromDate:'2027-01-12',toDate:'2027-01-12'});
assert.equal(Object.values(doubleB.auditDetails).length,1,'Other auditor sees only their audit');
assert.equal(Object.values(doubleB.auditDetails)[0].auditId,'B-OTHER');
const doubleManager=await doubleOverlay.managerOverview({actor,auditorIds:['a','b'],fromDate:'2027-01-12',toDate:'2027-01-12'});
assert.deepEqual((doubleManager.auditDetailsByAuditor.a||[]).map(x=>[x.auditId,x.scopes,x.location]).sort((x,y)=>x[0].localeCompare(y[0])),[['A-AFTERNOON','Scope A','Site A'],['A-MORNING','Scope M','Site M']],'Manager must receive exact scopes and locations for both same-day audits');
assert.equal(doubleManager.auditDetailsByAuditor.b[0].auditId,'B-OTHER','Manager must keep identities separate');
assert.deepEqual(doubleManager.auditors.find(x=>x.auditorId==='a').days,doubleA.days,'Manager and auditor must resolve identical calendar state');
const overlappingRows=[
 ['Audit ID','Status','Assigned to','Planning JSON','Company','Scopes'],
 ['C1','ACCEPTED','a@example.com',JSON.stringify([{date:'2027-01-12',start:'09:00',end:'12:00'}]),'Company 1','Scope 1'],
 ['P1','PENDING_APPROVAL','a@example.com',JSON.stringify([{date:'2027-01-12',start:'10:00',end:'11:00'}]),'Company 2','Scope 2']
];
const overlapOverlay=createPlanningOverlayService({service,readPlanningRows:async()=>overlappingRows,listCanonicalAuditors:async()=>auditors});
const overlap=await overlapOverlay.period({actor,auditorId:'a',fromDate:'2027-01-12',toDate:'2027-01-12'});
assert.equal(Object.values(overlap.auditDetails).length,2,'Overlapping provisional and committed audits both retained as details');
assert(overlap.days[0].segments.some(x=>x.state==='COMMITTED'),'Committed remains precedence owner for occupied overlap');
const adversarialService={read:async(a,id)=>({...base(id),fromDate:'2027-01-01',toDate:'2027-12-31'}),mutate:async()=>({success:true})};
const boundedOverlay=createPlanningOverlayService({service:adversarialService,readPlanningRows:async()=>rows,listCanonicalAuditors:async()=>auditors});
const boundedPeriod=await boundedOverlay.period({actor,auditorId:'a',fromDate:'2027-01-12',toDate:'2027-01-12'});
assert.equal(boundedPeriod.days.length,1,'Stored availability cannot expand requested period');
assert.equal(boundedPeriod.days[0].date,'2027-01-12');
console.log('PASS: planning overlay period, manager overview, authorization, fail closed');