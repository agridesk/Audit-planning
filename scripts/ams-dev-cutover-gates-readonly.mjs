import {spawnSync} from 'node:child_process';
const project='audit-management-system-dev',region='europe-west1',service='ams-fase12-dev';
const tool=process.platform==='win32'?'gcloud.cmd':'gcloud';
const args=['run','services','describe',service,'--project',project,'--region',region,'--format=json'];
const proc=spawnSync(tool,args,{encoding:'utf8',timeout:30000,windowsHide:true,shell:process.platform==='win32'});
if(proc.error||proc.status!==0){
 console.error('DEV_RUNTIME_READ_FAIL',String(proc.error?.message||proc.stderr||proc.status).slice(0,250));process.exit(1);
}
let config;try{config=JSON.parse(proc.stdout);}catch{console.error('DEV_RUNTIME_JSON_INVALID');process.exit(1);}
if(config.metadata?.name!==service){
 console.error('DEV_SERVICE_IDENTITY_MISMATCH');process.exit(1);
}
const env=config.spec?.template?.spec?.containers?.[0]?.env||[];
const selected=['AMS_RUNTIME_ENV','AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED','AMS_DEV_ATOMIC_PREFLIGHT_ENABLED',
'AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED','AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED',
'AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED','AMS_DEV_ATOMIC_BACKFILL_PARITY_VERIFIED',
'AMS_DEV_ATOMIC_LIVE_WRITER_ROUTE_PARITY_VERIFIED','AMS_DEV_MAINTENANCE_MODE',
'AMS_DEV_NORMAL_GRID_ENABLED','AMS_DEV_PREFLIGHT_READONLY_BROWSER_ENABLED',
'AMS_GAS_LIFECYCLE_WRITER_RETIRED_VERIFIED','AMS_MANAGER_LIFECYCLE_OWNER_SHARED_VERIFIED'];
const values=Object.fromEntries(selected.map(k=>[k,'NOT_SET']));
for(const k of selected){
 const entries=env.filter(x=>x.name===k);
 if(entries.length!==1)continue;
 const v=entries[0];
 values[k]=v.value===undefined?'SECRET_OR_REFERENCE':/^(true|false|DEV|PROD)$/i.test(v.value)?String(v.value):'UNEXPECTED_VALUE';
}
const traffic=(config.status?.traffic||[]).map(x=>({revision:x.revisionName,percent:x.percent,tag:x.tag||null}));
console.log(JSON.stringify({service,project,region,readyRevision:config.status?.latestReadyRevisionName,traffic,flags:values},null,2));
if(config.status?.latestReadyRevisionName!==traffic.find(x=>x.percent===100)?.revision){console.error('DEV_TRAFFIC_NOT_SINGLE_REVISION');process.exit(2);}
// DEV-only, read-only Firestore inventory. Never print tokens or document payloads.
const auth=spawnSync(tool,['auth','print-access-token'],{encoding:'utf8',timeout:30000,windowsHide:true,shell:process.platform==='win32'});
const token=String(auth.stdout||'').trim();
if(auth.error||auth.status!==0||!token){
 console.error('DEV_FIRESTORE_AUTH_READ_FAIL');process.exit(3);
}
const database='(default)',collections=['ams_planning_20_dev_audits','ams_planning_20_dev_claims','ams_planning_20_dev_outbox'];
const inventory={};
for(const collection of collections){
 let pageToken='',count=0,pages=0;
 do{
  if(pages>=30){console.error('DEV_FIRESTORE_PAGINATION_LIMIT');process.exit(4);}
  const url=new URL('https://firestore.googleapis.com/v1/projects/'+project+'/databases/'+database+'/documents/'+collection);
  url.searchParams.set('pageSize','200');
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  let response;
  try{response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});}
  catch{console.error('DEV_FIRESTORE_READ_FAILED '+collection);process.exit(4);}
  if(!response.ok){console.error('DEV_FIRESTORE_HTTP_'+response.status+' '+collection);process.exit(4);}
  const body=await response.json();
  if(!Array.isArray(body.documents||[])||body.documents?.length>200){console.error('DEV_FIRESTORE_PAGE_INVALID');process.exit(4);}
  count+=(body.documents||[]).length;pages++;
  const next=String(body.nextPageToken||'');
  if(next&&(!body.documents?.length||next===pageToken)){console.error('DEV_FIRESTORE_PAGINATION_INVALID');process.exit(4);}
  pageToken=next;
 }while(pageToken);
 inventory[collection]={count,pages};
}
console.log(JSON.stringify({firestore:inventory},null,2));
console.log('DEV_CUTOVER_READONLY_PASS');
