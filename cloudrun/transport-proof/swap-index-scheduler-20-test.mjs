import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSwapIndexScheduler} from './swap-index-scheduler-20.mjs';
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
assert.match(docker,/COPY (?:swap\-index\-scheduler\-20\.mjs|swap-\*\.mjs) \.\//);
assert.match(server,/swap20Scheduler\.verify\(req\.headers\.authorization\)/);
const now=Date.now(),audience='https://ams.example.run.app';
const email='swap-scheduler@example.iam.gserviceaccount.com';
const valid={aud:audience,email,email_verified:'true',iss:'https://accounts.google.com',exp:String(Math.floor(now/1000)+200),sub:'service-123'};
let response={...valid},syncs=0,seedRecords=[{operationId:'SWAP20_test0001'}];
const scheduler=createSwapIndexScheduler({index:{meta:async()=>null,bootstrap:async records=>{syncs++;assert.equal(records,seedRecords);return true;}},now:()=>now,
 serviceEmail:email,audience,roster:async()=>[{role:'manager',email:'manager@example.test',auditorId:'manager-uid'}],
 gasCall:async(actor,op,data,action)=>{assert.equal(actor.role,'manager');assert.equal(op,'listIndexSeed');assert.equal(action,'externalswap20');return {ok:true,records:seedRecords};},
 fetchImpl:async url=>{assert.match(url,/oauth2\.googleapis\.com\/tokeninfo/);return {ok:true,json:async()=>response};}
});
assert.equal(await scheduler.verify('Bearer authorized-token'),true);
assert.equal(await scheduler.verify('nonsense'),false);
response={...valid,email:'attacker@example.test'};assert.equal(await scheduler.verify('Bearer authorized-token'),false);
response={...valid,aud:'https://attacker.test'};assert.equal(await scheduler.verify('Bearer authorized-token'),false);
response={...valid,exp:String(Math.floor(now/1000)-1)};assert.equal(await scheduler.verify('Bearer authorized-token'),false);
assert.deepEqual(await scheduler.reconcile(),{ok:true,records:1});
assert.equal(syncs,1);
console.log('SWAP DEV scheduler OIDC isolation and index synchronization: PASS');

const migrationProposals=[
 {operationId:'SWAP20_test0001',auditA:'a1',auditB:'b1',status:'CONFIRMED',
  originalRevisions:{a1:'r1',b1:'r2'},blocksA:[],blocksB:[],
  requiredAuditorUids:['uid_12345678'],acknowledgedAuditorUids:['uid_12345678'],dateChanged:true}
];
let migrationReadCount=0;
const migrationScheduler=createSwapIndexScheduler({
 index:{meta:async()=>null},serviceEmail:email,audience,
 roster:async()=>[{role:'manager',email:'manager@example.test',auditorId:'manager-uid'}],
 gasCall:async()=>({ok:true,records:migrationProposals}),
 readCanonicalProposal:async()=>{migrationReadCount++;return null;},
 readJournalOperationIds:async()=>new Set(['SWAP20_test0001'])
});
const preflight=await migrationScheduler.previewCanonicalMigration();
assert.equal(preflight.ok,true);
assert.equal(preflight.dryRun,true);
assert.equal(preflight.gasProposalCount,1);
assert.equal(preflight.gasJournalledProposalCount,1);
assert.equal(preflight.firestoreMissing,1);
assert.equal(preflight.firestoreMatched,0);
assert.equal(preflight.cutoverAuthorized,false);
assert.equal(migrationReadCount,1);
const missingJournalReader=createSwapIndexScheduler({
 index:{meta:async()=>null},serviceEmail:email,audience,
 roster:async()=>[{role:'manager',email:'manager@example.test',auditorId:'manager-uid'}],
 gasCall:async()=>({ok:true,records:migrationProposals}),
 readCanonicalProposal:async()=>null
});
await assert.rejects(missingJournalReader.previewCanonicalMigration(),/SWAP_MIGRATION_SOURCE_READERS_UNAVAILABLE/);

let stagingWrites=[],sourceReads=0;
const historic={...migrationProposals[0],createdAt:'2026-10-26T16:00:00Z',createdBy:'manager@example.test'};
const eligible={...historic,operationId:'SWAP20_test0002'};
const isolatedStage=createSwapIndexScheduler({
 index:{meta:async()=>null},serviceEmail:email,audience,
 roster:async()=>[{role:'manager',email:'manager@example.test',auditorId:'manager-uid'}],
 gasCall:async()=>{sourceReads++;return {ok:true,records:[historic,eligible]};},
 readCanonicalProposal:async()=>stagingWrites.length?{proposal:{...stagingWrites[0].proposal,migrationState:'STAGED_FROM_GAS',migrationVerified:false}}:null,
 readJournalOperationIds:async()=>new Set([historic.operationId]),
 stageCanonicalProposal:async input=>{stagingWrites.push(input);return {ok:true,staged:true};}
});
const stageResult=await isolatedStage.stageCanonicalProposals();
assert.equal(stageResult.sourceProposals,2);
assert.equal(stageResult.journalExcluded,1);
assert.equal(stageResult.staged,1);
assert.equal(stageResult.directWriteEnabled,false);
assert.equal(stagingWrites[0].proposal.operationId,eligible.operationId);
assert.equal(stagingWrites[0].journalAbsentVerified,true);
assert.equal(sourceReads,2);
const staleStage=createSwapIndexScheduler({
 index:{meta:async()=>null},serviceEmail:email,audience,
 roster:async()=>[{role:'manager',email:'manager@example.test',auditorId:'manager-uid'}],
 gasCall:async()=>({ok:true,records:[eligible]}),
 readCanonicalProposal:async()=>null,
 readJournalOperationIds:(()=>{let count=0;return async()=>++count===1?new Set():new Set([eligible.operationId]);})(),
 stageCanonicalProposal:async()=>{throw Error('MUST_NOT_STAGE_JOURNALLED_PROPOSAL');}
});
const staleResult=await staleStage.stageCanonicalProposals();
assert.equal(staleResult.staged,0);
assert.equal(staleResult.stale,1);
