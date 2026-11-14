import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const project='audit-management-system-dev',region='europe-west1',service='ams-fase12-dev';
const sheet='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const prefix='projects/'+project+'/databases/(default)/documents/';
const tool=process.platform==='win32'?'gcloud.cmd':'gcloud';
function fail(message){throw new Error('DEV_ATOMIC_CUTOVER_BLOCKED: '+message);}
function cmd(exe,args,{cwd,timeout=45000}={}){
 const win=process.platform==='win32',entry=win&&exe==='gcloud'?'gcloud.cmd':exe;
 const p=spawnSync(entry,args,{encoding:'utf8',cwd,windowsHide:true,shell:win&&exe==='gcloud',timeout,maxBuffer:5*1024*1024});
 if(p.error||p.status!==0){const safe=String(p.stderr||p.error?.message||'exit '+p.status).slice(0,240);fail(exe+'_'+args.slice(0,2).join('_')+'_FAILED '+safe);}
 return String(p.stdout||'').trim();
}
function runService(){let x;try{x=JSON.parse(cmd('gcloud',['run','services','describe',service,'--project='+project,'--region='+region,'--format=json']));}catch(e){fail('SERVICE_DESCRIBE_INVALID '+String(e.message).slice(0,100));}
 if(x.metadata?.name!==service||x.status?.traffic?.filter(t=>Number(t.percent)>0).length!==1||Number(x.status.traffic[0].percent)!==100||x.status.traffic[0].revisionName!==x.status.latestReadyRevisionName)fail('CANONICAL_DEV_TRAFFIC_INVALID');return x;}
function vars(s){return Object.fromEntries((s.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));}
async function get(url,token){let r;try{r=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});}catch{fail('SOURCE_OR_FIRESTORE_READ_NETWORK_FAILED');}
 if(!r.ok)fail('SOURCE_OR_FIRESTORE_HTTP_'+r.status);return r.json();}
async function documents(collection,token){
 const all=[],seen=new Set();let next='',pages=0;
 do{if(++pages>12)fail('FIRESTORE_PAGINATION_LIMIT');
  const u=new URL('https://firestore.googleapis.com/v1/'+prefix+collection);u.searchParams.set('pageSize','200');if(next)u.searchParams.set('pageToken',next);
  const page=await get(u.toString(),token);
  for(const d of page.documents||[]){if(seen.has(d.name))fail('DUPLICATE_FIRESTORE_RESOURCE');seen.add(d.name);all.push(d);}
  next=String(page.nextPageToken||'');
 }while(next);return all;
}
if(process.argv.length!==3||process.argv[2]!=='--activate-dev-atomic-owner')fail('EXPLICIT_DEV_CUTOVER_OPTION_REQUIRED');
if(!existsSync('.git')||!existsSync('cloudrun/transport-proof/server-r15.js'))fail('RUN_FROM_DEV_REPO_ROOT');
if(cmd('git',['branch','--show-current'])!=='dev')fail('GIT_BRANCH_NOT_DEV');
if(cmd('git',['status','--porcelain','--untracked-files=no']))fail('TRACKED_WORKTREE_DIRTY');
if(cmd('gcloud',['config','get-value','project'])!==project)fail('ACTIVE_GCP_PROJECT_NOT_DEV');
const initial=runService(),before=vars(initial);
for(const [key,value] of Object.entries({
 AMS_RUNTIME_ENV:'DEV',AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED:'true',
 AMS_DEV_ATOMIC_PREFLIGHT_ENABLED:'true',AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED:'true',
 AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED:'true',
 AMS_GAS_LIFECYCLE_WRITER_RETIRED_VERIFIED:'true',
 AMS_MANAGER_LIFECYCLE_OWNER_SHARED_VERIFIED:'true'
}))if(before[key]!==value)fail('RUNTIME_PREREQUISITE_'+key);
if(before.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'||before.AMS_DEV_FIRESTORE_PLANNING_AUTHORITY_ENABLED==='true')fail('ATOMIC_OWNER_ALREADY_ACTIVE');
if(before.AMS_DEV_MAINTENANCE_MODE==='true')fail('DEV_IN_MAINTENANCE');
const token=cmd('gcloud',['auth','print-access-token']);if(!token)fail('GCLOUD_ACCESS_TOKEN_MISSING');
const sheets='https://sheets.googleapis.com/v4/spreadsheets/'+sheet+'/values/';
const [cfg,ids]=await Promise.all([
 get(sheets+encodeURIComponent("'System_Config'!A1:C40"),token),
 get(sheets+encodeURIComponent("'Audit planning'!AI1:AI442"),token)
]);
if(cfg.values?.[0]?.join('|')?.startsWith('KEY|DEV|PROD')!==true)fail('SHEET_CONFIG_HEADER_CHANGED');
const conf=Object.fromEntries((cfg.values||[]).slice(1).map(x=>[x[0],x[1]]));
if(conf.ENV!=='DEV'||String(conf.ALLOW_DEV_WRITES).toUpperCase()!=='FALSE'||conf.DEV_WRITE_MODE!=='BLOCK')fail('GAS_SHEETS_FREEZE_NOT_ACTIVE');
if(ids.values?.[0]?.[0]!=='Audit ID')fail('SOURCE_AUDIT_ID_HEADER_CHANGED');
const auditIds=(ids.values||[]).slice(1).map(x=>String(x[0]||'').trim()).filter(Boolean);
if(auditIds.length!==111||new Set(auditIds).size!==111)fail('SOURCE_AUDIT_IDENTITY_INVALID');
const [audits,claims,outbox]=await Promise.all([
 documents('ams_planning_20_dev_audits',token),
 documents('ams_planning_20_dev_claims',token),
 documents('ams_planning_20_dev_outbox',token)
]);
if(audits.length!==111||claims.length!==696||outbox.length!==0)fail('FIRESTORE_COUNTS_INVALID');
const fsIds=new Set(audits.map(d=>d.name.slice((prefix+'ams_planning_20_dev_audits/').length)));
if(fsIds.size!==111||auditIds.some(id=>!fsIds.has(id)))fail('FIRESTORE_AUDIT_IDENTITY_MISMATCH');
console.log('CUTOVER_SOURCE_PASS: 111 exact audit IDs; 696 claims; 0 outbox; GAS DEV guard BLOCK.');
const checks=[
 'dev-cutover-freeze-20-test.mjs',
 'planning-atomic-cutover-guard-20-test.mjs',
 'planning-atomic-firestore-store-20-test.mjs',
 'planning-multi-cutover-integration-20-test.mjs',
 'planning-multi-e2e-simulator-20-test.mjs',
 'planning-atomic-command-service-20-test.mjs',
 'planning-atomic-self-planning-service-20-test.mjs',
 'planning-cutover-compatibility-20-test.mjs'
];
for(const script of checks){cmd('node',[script],{cwd:'cloudrun/transport-proof',timeout:120000});console.log('CUTOVER_TEST_PASS '+script);}
cmd('node',['--check','server-r15.js'],{cwd:'cloudrun/transport-proof'});
console.log('CUTOVER_TESTS_PASS; DEPLOYING_DEV_SAFETY_FIX');
cmd('gcloud',['run','deploy',service,'--source','.','--project='+project,'--region='+region,'--quiet'],{cwd:'cloudrun/transport-proof',timeout:900000});
const staged=runService(),stagedVars=vars(staged);
if(stagedVars.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'||stagedVars.AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED!=='true')fail('DEV_STAGING_STATE_UNSAFE');
console.log('DEV_CODE_DEPLOYED_FROZEN '+staged.status.latestReadyRevisionName);
const countsAgain=await Promise.all([
 documents('ams_planning_20_dev_audits',token),
 documents('ams_planning_20_dev_claims',token),
 documents('ams_planning_20_dev_outbox',token)
]);
if(countsAgain[0].length!==111||countsAgain[1].length!==696||countsAgain[2].length!==0)fail('FIRESTORE_DRIFT_BEFORE_ACTIVATION');
console.log('ACTIVATING_ATOMIC_OWNER_DEV_ONLY');
cmd('gcloud',['run','services','update',service,'--project='+project,'--region='+region,
 '--update-env-vars=AMS_DEV_ATOMIC_BACKFILL_PARITY_VERIFIED=true,AMS_DEV_ATOMIC_LIVE_WRITER_ROUTE_PARITY_VERIFIED=true,AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED=true,AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED=false','--quiet'],{timeout:900000});
const active=runService(),after=vars(active);
for(const [key,value] of Object.entries({
 AMS_RUNTIME_ENV:'DEV',AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED:'true',
 AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED:'true',
 AMS_DEV_ATOMIC_BACKFILL_PARITY_VERIFIED:'true',
 AMS_DEV_ATOMIC_LIVE_WRITER_ROUTE_PARITY_VERIFIED:'true',
 AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED:'true',AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED:'false'
}))if(after[key]!==value)fail('POST_CUTOVER_RUNTIME_INVALID_'+key);
console.log(JSON.stringify({result:'DEV_ATOMIC_CUTOVER_RUNTIME_PASS',
 project,service,revision:active.status.latestReadyRevisionName,
 audits:111,claims:696,outbox:0,atomicOwnerEnabled:true,
 legacyHttpFreezeRetained:true,backfillWriteDisabled:true,
 businessE2EStillRequired:true},null,2));
