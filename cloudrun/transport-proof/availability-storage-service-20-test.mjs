import assert from 'node:assert/strict';
import {createAvailabilityService} from './availability-storage-service-20.js';
const store=new Map();
const adapter={async read(id){return structuredClone(store.get(id)??null)},async compareAndSwap(id,expected,next){const old=store.get(id);if((old?.version??0)!==expected)return false;store.set(id,structuredClone(next));return true;}};
const service=createAvailabilityService(adapter),manager={id:'manager1',role:'Manager'},auditor={id:'aud1',role:'Auditor'};
let n=0;async function test(label,fn){await fn();console.log('PASS',++n,label);}
async function fails(fn,code){await assert.rejects(fn,e=>e.message===code);}
await test('initial snapshot',async()=>assert.equal((await service.read(auditor,'aud1')).version,0));
await test('auditor cannot read colleague',async()=>fails(()=>service.read(auditor,'aud2'),'NOT_AUTHORIZED'));
await test('manager blocks entire year',async()=>{const r=await service.mutate({actor:manager,auditorId:'aud1',expectedVersion:0,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true}});assert.equal(r.version,1);assert.ok(r.recordId);});
const baseline=(await service.read(manager,'aud1')).baselineExceptions[0].id;
await test('manager releases two weeks',async()=>{const r=await service.mutate({actor:manager,auditorId:'aud1',expectedVersion:1,mutation:{action:'RELEASE_BASELINE',targetExceptionId:baseline,fromDate:'2027-01-11',toDate:'2027-01-24',wholeDay:true}});assert.equal(r.version,2);});
await test('stale writer rejected',async()=>fails(()=>service.mutate({actor:auditor,auditorId:'aud1',expectedVersion:1,mutation:{action:'CONFIRM_AVAILABILITY',fromDate:'2027-01-01',toDate:'2027-01-31',wholeDay:true}}),'VERSION_CONFLICT'));
await test('manager sees released and blocked days',async()=>{const x=await service.period({actor:manager,auditorId:'aud1',fromDate:'2027-01-10',toDate:'2027-01-12'});assert.equal(x.days[0].segments[0].state,'HARD');assert.equal(x.days[1].segments[0].state,'FREE');});
await test('not confirmed distinct from free',async()=>{const x=await service.managerOverview({actor:manager,auditorIds:['aud1'],fromDate:'2027-01-11',toDate:'2027-01-12'});assert.equal(x.auditors[0].confirmation.status,'NOT_CONFIRMED');});
await test('auditor confirms period',async()=>{await service.mutate({actor:auditor,auditorId:'aud1',expectedVersion:2,now:'2027-01-01T10:00:00Z',mutation:{action:'CONFIRM_AVAILABILITY',fromDate:'2027-01-01',toDate:'2027-01-31',wholeDay:true}});const x=await service.managerOverview({actor:manager,auditorIds:['aud1'],fromDate:'2027-01-11',toDate:'2027-01-12'});assert.equal(x.auditors[0].confirmation.status,'CONFIRMED');});
await test('later manager edit requires review',async()=>{await service.mutate({actor:manager,auditorId:'aud1',expectedVersion:3,now:'2027-01-01T12:00:00Z',mutation:{action:'RELEASE_BASELINE',targetExceptionId:baseline,fromDate:'2027-01-26',toDate:'2027-01-27',wholeDay:true}});const x=await service.managerOverview({actor:manager,auditorIds:['aud1'],fromDate:'2027-01-26',toDate:'2027-01-27'});assert.equal(x.auditors[0].confirmation.status,'REVIEW_NEEDED');});
await test('weekend SOFT to FREE to HARD to FREE persists across recurring edits',async()=>{const a={id:'aud3',role:'Auditor'},id='aud3',d='2026-10-17';const read=()=>service.read(a,id);const change=async mutation=>service.mutate({actor:a,auditorId:id,expectedVersion:(await read()).version,mutation});const state=async()=>{const p=await service.period({actor:a,auditorId:id,fromDate:d,toDate:d});return p.days[0].segments[0].state};assert.equal(await state(),'SOFT');await change({action:'SET_FREE_OVERRIDE',fromDate:d,toDate:d,wholeDay:true});assert.equal(await state(),'FREE');await change({action:'SET_RECURRING',recurring:[{weekday:5,start:'00:00',end:'24:00'}]});assert.equal(await state(),'FREE');await change({action:'BLOCK_PERIOD',fromDate:d,toDate:d,wholeDay:true});assert.equal(await state(),'HARD');const b=(await read()).baselineExceptions[0];await change({action:'RELEASE_BASELINE',targetExceptionId:b.id,fromDate:d,toDate:d,wholeDay:true});assert.equal(await state(),'FREE');});
await test('HARD exception edit is one atomic CAS and preserves ID',async()=>{
 const id='aud-edit',actor={id,role:'auditor'};
 const first=await service.mutate({actor,auditorId:id,expectedVersion:0,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-05-01',toDate:'2027-05-08',wholeDay:true}});
 const before=await service.read(actor,id),original=before.baselineExceptions[0];
 assert.equal(original.id,first.recordId);
 const edited=await service.mutate({actor,auditorId:id,expectedVersion:1,mutation:{action:'EDIT_HARD_BLOCK',targetExceptionId:original.id,fromDate:'2027-05-02',toDate:'2027-05-06',wholeDay:false,start:'08:00',end:'12:00'}});
 const after=await service.read(actor,id);
 assert.equal(edited.version,2);
 assert.equal(after.baselineExceptions.length,1);
 assert.equal(after.baselineExceptions[0].id,original.id);
 assert.equal(after.baselineExceptions[0].start,'08:00');
 assert.equal(after.baselineExceptions[0].fromDate,'2027-05-02');
});
await test('release and removal return persisted record identifiers',async()=>{
 const id='aud-release-id',actor={id,role:'auditor'};
 const first=await service.mutate({actor,auditorId:id,expectedVersion:0,mutation:{action:'BLOCK_PERIOD',date:'2027-06-01',wholeDay:true}});
 const release=await service.mutate({actor,auditorId:id,expectedVersion:1,mutation:{action:'RELEASE_BASELINE',targetExceptionId:first.recordId,date:'2027-06-01',start:'09:00',end:'10:00'}});
 const remove=await service.mutate({actor,auditorId:id,expectedVersion:2,mutation:{action:'REMOVE_HARD_BLOCK',targetExceptionId:first.recordId,date:'2027-06-01',start:'10:00',end:'11:00'}});
 const doc=await service.read(actor,id);
 assert.equal(doc.baselineReleases.length,2);
 assert.equal(release.recordId,doc.baselineReleases[0].id);
 assert.equal(remove.recordId,doc.baselineReleases[1].id);
 assert.equal(doc.baselineReleases[1].start,'10:00');
});
await test('malformed persisted availability cannot silently resolve as FREE',async()=>{
 store.set('aud-corrupt',{auditorId:'aud-corrupt',version:3,blocks:[],recurring:[],overrides:[],metadata:{}});
 const actor={id:'aud-corrupt',role:'auditor'};
 await fails(()=>service.read(actor,'aud-corrupt'),'CANONICAL_AVAILABILITY_DOCUMENT_INVALID');
 await fails(()=>service.period({actor,auditorId:'aud-corrupt',fromDate:'2027-01-01',toDate:'2027-01-01'}),'CANONICAL_AVAILABILITY_DOCUMENT_INVALID');
 store.delete('aud-corrupt');
});
console.log(n,'storage service checks passed');