import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
const PROJECT='audit-management-system-dev';
const REGION='europe-west1';
const SERVICE='ams-fase12-dev';
const SHEET='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const PREFIX='ams_planning_20_dev_';
const TOOL=process.platform==='win32'?'gcloud.cmd':'gcloud';
const abort=(why)=>{console.error('DEV_BACKFILL_ENABLE_BLOCKED: '+why);process.exit(1);};
function command(args,timeout=35000){
 const p=spawnSync(TOOL,args,{encoding:'utf8',windowsHide:true,shell:process.platform==='win32',timeout,maxBuffer:1024*1024*5});
 if(p.error||p.status!==0)abort('GCLOUD_FAILED: '+args.slice(0,3).join(' ')+' '+String(p.error?.message||p.stderr||p.status).slice(0,180));
 return String(p.stdout||'').trim();
}
function service(){let v;try{v=JSON.parse(command(['run','services','describe',SERVICE,'--project='+PROJECT,'--region='+REGION,'--format=json']));}catch{abort('SERVICE_READ_INVALID');}if(v.metadata?.name!==SERVICE)abort('WRONG_CLOUD_RUN_SERVICE');return v;}
const envMap=v=>Object.fromEntries((v.spec?.template?.spec?.containers?.[0]?.env||[]).map(e=>[e.name,e.value]));
function assertState(v,after=false){
 const routes=(v.status?.traffic||[]).filter(t=>Number(t.percent)>0);
 if(routes.length!==1||Number(routes[0].percent)!==100||routes[0].revisionName!==v.status.latestReadyRevisionName)abort('DEV_TRAFFIC_NOT_UNIQUE_READY_REVISION');
 const e=envMap(v);
 if(e.AMS_RUNTIME_ENV!=='DEV'||e.AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED!=='true'||e.AMS_DEV_ATOMIC_PREFLIGHT_ENABLED!=='true')abort('DEV_RUNTIME_FREEZE_MISSING');
 if(e.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'||e.AMS_DEV_FIRESTORE_PLANNING_AUTHORITY_ENABLED==='true')abort('CANONICAL_OWNER_ALREADY_ENABLED');
 if(e.AMS_DEV_MAINTENANCE_MODE==='true')abort('ALREADY_IN_MAINTENANCE');
 if(after){
  if(e.AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED!=='true'||e.AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED==='true')abort('BACKFILL_FLAGS_NOT_ACTIVE');
 }else if(e.AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED==='true'||e.AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED==='true')abort('BACKFILL_FLAGS_ALREADY_ENABLED');
 return {revision:routes[0].revisionName,flags:e};
}
async function getJSON(url,token){
 let response;try{response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});}catch{abort('GOOGLE_API_READ_FAILED');}
 if(!response.ok)abort('GOOGLE_API_HTTP_'+response.status);
 try{return await response.json();}catch{abort('GOOGLE_API_JSON_INVALID');}
}
if(!existsSync('.git')||!existsSync('.claspignore'))abort('RUN_FROM_REPOSITORY_ROOT');
const project=command(['config','get-value','project']);
if(project!==PROJECT)abort('ACTIVE_GCLOUD_PROJECT_NOT_DEV');
const before=service(),original=assertState(before);
const token=command(['auth','print-access-token']);
if(!token)abort('GOOGLE_AUTH_MISSING');
const sheetURL='https://sheets.googleapis.com/v4/spreadsheets/'+SHEET+'/values/';
const cfg=await getJSON(sheetURL+encodeURIComponent("'System_Config'!A1:C35"),token);
const rows=cfg.values||[];
const config=Object.fromEntries(rows.slice(1).map(r=>[r[0],r[1]]));
if(rows[0]?.[0]!=='KEY'||rows[0]?.[1]!=='DEV'||rows[0]?.[2]!=='PROD'||config.ENV!=='DEV'||String(config.ALLOW_DEV_WRITES).toUpperCase()!=='FALSE'||config.DEV_WRITE_MODE!=='BLOCK')abort('GAS_WRITE_GUARD_NOT_FROZEN');
const ids=await getJSON(sheetURL+encodeURIComponent("'Audit planning'!AI1:AI442"),token);
if(ids.values?.[0]?.[0]!=='Audit ID')abort('AUDIT_ID_COLUMN_CHANGED');
const seen=(ids.values||[]).slice(1).map(x=>String(x[0]||'').trim()).filter(Boolean);
if(seen.length!==111||new Set(seen).size!==111)abort('SOURCE_AUDIT_COUNT_OR_UNIQUENESS_DRIFT');
const root='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/';
for(const suffix of ['audits','claims','outbox']){
 const result=await getJSON(root+PREFIX+suffix+'?pageSize=1',token);
 if(result.documents?.length||result.nextPageToken)abort('FIRESTORE_TARGET_NOT_EMPTY_'+suffix);
}
const reread=service();if(assertState(reread).revision!==original.revision)abort('CLOUD_RUN_REVISION_CHANGED');
console.log('DEV_BACKFILL_PREFLIGHT_PASS: 111 unique audits, Sheets guard BLOCK, 3 Firestore collections empty, canonical DEV service frozen.');
console.log('PREPARING_BACKFILL_WRITE_GATE_ONLY; EXTERNAL_WRITER_VERIFICATION_REMAINS_REQUIRED');
command(['run','services','update',SERVICE,'--project='+PROJECT,'--region='+REGION,
 '--update-env-vars=AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED=true','--quiet'],180000);
const latest=service();assertState(latest,true);
console.log(JSON.stringify({success:true,service:SERVICE,project:PROJECT,revision:latest.status.latestReadyRevisionName,backfillWrite:true,legacyWriterFreezeFlag:false,atomicPlanningOwnerEnabled:false},null,2));
console.log('DEV_BACKFILL_WRITE_PREPARED_NOT_AUTHORIZED');
