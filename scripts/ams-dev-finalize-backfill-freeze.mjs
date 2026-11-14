import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const PROJECT='audit-management-system-dev';
const REGION='europe-west1';
const SERVICE='ams-fase12-dev';
const SHEET='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const PREFIX='ams_planning_20_dev_';
const TOOL=process.platform==='win32'?'gcloud.cmd':'gcloud';
const abort=(why)=>{throw new Error('DEV_BACKFILL_ENABLE_BLOCKED: '+why);};
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
  if(e.AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED!=='true'||e.AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED!=='true')abort('BACKFILL_FLAGS_NOT_ACTIVE');
 }else if(e.AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED!=='true'||e.AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED==='true')abort('BACKFILL_GATE_NOT_PREPARED');
 return {revision:routes[0].revisionName,flags:e};
}
async function getJSON(url,token,stage){
 let response;try{response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});}catch{abort('GOOGLE_API_READ_FAILED');}
 if(!response.ok)abort(stage+'_HTTP_'+response.status+(response.status===403&&stage==='SHEETS'?'_GCLOUD_DRIVE_SCOPE_REQUIRED':''));
 try{return await response.json();}catch{abort('GOOGLE_API_JSON_INVALID');}
}
if(!existsSync('.git')||!existsSync('.claspignore'))abort('RUN_FROM_REPOSITORY_ROOT');
if(process.argv.length!==3||process.argv[2]!=='--acknowledge-reviewed-dev-trigger-list')abort('REQUIRES_EXPLICIT_ACKNOWLEDGEMENT_OF_DEV_TRIGGER_EVIDENCE');
const project=command(['config','get-value','project']);
if(project!==PROJECT)abort('ACTIVE_GCLOUD_PROJECT_NOT_DEV');
const before=service(),original=assertState(before);
const token=command(['auth','print-access-token']);
if(!token)abort('GOOGLE_AUTH_MISSING');
const sheetURL='https://sheets.googleapis.com/v4/spreadsheets/'+SHEET+'/values/';
const cfg=await getJSON(sheetURL+encodeURIComponent("'System_Config'!A1:C35"),token,'SHEETS');
const rows=cfg.values||[];
const config=Object.fromEntries(rows.slice(1).map(r=>[r[0],r[1]]));
if(rows[0]?.[0]!=='KEY'||rows[0]?.[1]!=='DEV'||rows[0]?.[2]!=='PROD'||config.ENV!=='DEV'||String(config.ALLOW_DEV_WRITES).toUpperCase()!=='FALSE'||config.DEV_WRITE_MODE!=='BLOCK')abort('GAS_WRITE_GUARD_NOT_FROZEN');
const ids=await getJSON(sheetURL+encodeURIComponent("'Audit planning'!AI1:AI442"),token,'SHEETS');
if(ids.values?.[0]?.[0]!=='Audit ID')abort('AUDIT_ID_COLUMN_CHANGED');
const seen=(ids.values||[]).slice(1).map(x=>String(x[0]||'').trim()).filter(Boolean);
if(seen.length!==111||new Set(seen).size!==111)abort('SOURCE_AUDIT_COUNT_OR_UNIQUENESS_DRIFT');
const root='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/';
for(const suffix of ['audits','claims','outbox']){
 const result=await getJSON(root+PREFIX+suffix+'?pageSize=1',token,'FIRESTORE');
 if(result.documents?.length||result.nextPageToken)abort('FIRESTORE_TARGET_NOT_EMPTY_'+suffix);
}
const reread=service();if(assertState(reread).revision!==original.revision)abort('CLOUD_RUN_REVISION_CHANGED');
console.log('DEV_BACKFILL_PREFLIGHT_PASS: 111 unique audits, Sheets guard BLOCK, 3 Firestore collections empty, canonical DEV service frozen.');
console.log('DEV_WRITER_FREEZE_BASIS: Cloud Run HTTP freeze, GAS System_Config BLOCK, operator-reviewed DEV trigger list (9 non-planning handlers).');
console.log('DEV_BACKFILL_GUARD: every write batch revalidates the full source manifest and fails closed on drift.');
command(['run','services','update',SERVICE,'--project='+PROJECT,'--region='+REGION,
 '--update-env-vars=AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED=true','--quiet'],180000);
const latest=service();assertState(latest,true);
console.log(JSON.stringify({success:true,service:SERVICE,project:PROJECT,revision:latest.status.latestReadyRevisionName,backfillWrite:true,legacyWriterFreezeFlag:true,atomicPlanningOwnerEnabled:false},null,2));
console.log('DEV_BACKFILL_OPERATOR_GATE_READY');
