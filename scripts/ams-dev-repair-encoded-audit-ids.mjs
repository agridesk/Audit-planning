import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const project='audit-management-system-dev',region='europe-west1',service='ams-fase12-dev';
const sheet='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
const prefix='projects/'+project+'/databases/(default)/documents/';
const auditCollection='ams_planning_20_dev_audits';
const tool=process.platform==='win32'?'gcloud.cmd':'gcloud';
const fail=reason=>{throw Error('DEV_AUDIT_ID_REPAIR_BLOCKED: '+reason)};
function run(args){const x=spawnSync(tool,args,{encoding:'utf8',windowsHide:true,timeout:45000,shell:process.platform==='win32'});if(x.error||x.status!==0)fail('GCLOUD_'+args[0]+'_FAILED');return String(x.stdout||'').trim();}
async function api(url,token,method='GET',data){
 let res;try{res=await fetch(url,{method,headers:{authorization:'Bearer '+token,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)});}
 catch{fail('GOOGLE_API_NETWORK_FAILED');}
 if(!res.ok){const obj=await res.json().catch(()=>({}));fail('GOOGLE_API_'+res.status+'_'+String(obj.error?.status||'UNKNOWN').replace(/[^A-Z_]/g,''));}
 return res.json();
}
if(process.argv.length!==3||process.argv[2]!=='--repair')fail('EXPLICIT_REPAIR_OPTION_REQUIRED');
if(!existsSync('.git'))fail('RUN_FROM_REPOSITORY_ROOT');
if(run(['config','get-value','project'])!==project)fail('ACTIVE_PROJECT_NOT_DEV');
const svc=JSON.parse(run(['run','services','describe',service,'--project='+project,'--region='+region,'--format=json']));
if(svc.metadata?.name!==service||svc.status?.traffic?.length!==1||Number(svc.status.traffic[0].percent)!==100||svc.status.traffic[0].revisionName!==svc.status.latestReadyRevisionName)fail('CANONICAL_DEV_REVISION_INVALID');
const env=Object.fromEntries((svc.spec?.template?.spec?.containers?.[0]?.env||[]).map(x=>[x.name,x.value]));
for(const key of ['AMS_RUNTIME_ENV','AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED','AMS_DEV_ATOMIC_PREFLIGHT_ENABLED','AMS_DEV_ATOMIC_BACKFILL_WRITE_ENABLED','AMS_DEV_LEGACY_WRITERS_FROZEN_VERIFIED']){
 if(env[key]!== (key==='AMS_RUNTIME_ENV'?'DEV':'true'))fail('DEV_FREEZE_FLAG_MISSING_'+key);
}
if(env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true')fail('CANONICAL_OWNER_ALREADY_ACTIVE');
const token=run(['auth','print-access-token']);if(!token)fail('TOKEN_MISSING');
const sheets='https://sheets.googleapis.com/v4/spreadsheets/'+sheet+'/values/';
const config=await api(sheets+encodeURIComponent("'System_Config'!A1:C35"),token);
const headers=config.values?.[0]||[];
if(headers[0]!=='KEY'||headers[1]!=='DEV'||headers[2]!=='PROD')fail('DEV_CONFIG_LAYOUT_CHANGED');
const cfg=Object.fromEntries((config.values||[]).slice(1).map(x=>[x[0],x[1]]));
if(cfg.ENV!=='DEV'||String(cfg.ALLOW_DEV_WRITES).toUpperCase()!=='FALSE'||cfg.DEV_WRITE_MODE!=='BLOCK')fail('DEV_GAS_SHEET_GUARD_NOT_FROZEN');
const idsResult=await api(sheets+encodeURIComponent("'Audit planning'!AI1:AI442"),token);
if(idsResult.values?.[0]?.[0]!=='Audit ID')fail('SOURCE_ID_COLUMN_CHANGED');
const sources=new Map();
(idsResult.values||[]).forEach((row,index)=>{
 if(index===0)return;
 const id=String(row[0]||'').trim();if(!id)return;
 if(sources.has(id))fail('DUPLICATE_SOURCE_ID');
 sources.set(id,index+1);
});
if(sources.size!==111)fail('SOURCE_COUNT_CHANGED');
const root='https://firestore.googleapis.com/v1/'+prefix;
async function list(col){
 let all=[],next='',pages=0;
 do{
  if(++pages>10)fail('COLLECTION_PAGES_EXCESS');
  const url=new URL(root+col);url.searchParams.set('pageSize','200');if(next)url.searchParams.set('pageToken',next);
  const page=await api(url.toString(),token);
  all.push(...(page.documents||[]));
  next=page.nextPageToken||'';
 }while(next);
 return all;
}
const [audits,claims,outbox]=await Promise.all([list(auditCollection),list('ams_planning_20_dev_claims'),list('ams_planning_20_dev_outbox')]);
if(audits.length!==111||claims.length!==696||outbox.length!==0)fail('TARGET_COUNTS_UNEXPECTED_A'+audits.length+'_C'+claims.length+'_O'+outbox.length);
const existing=new Map();
for(const d of audits){
 const name=String(d.name||'');
 if(!name.startsWith(prefix+auditCollection+'/'))fail('FOREIGN_AUDIT_RESOURCE');
 const key=name.slice((prefix+auditCollection+'/').length);
 if(existing.has(key))fail('DUPLICATE_FIRESTORE_ID');
 existing.set(key,d);
}
const missing=[],malformed=[];
for(const [id,row] of sources){
 if(existing.has(id))continue;
 const encoded=encodeURIComponent(id);
 if(encoded===id||!existing.has(encoded))fail('UNRECOGNIZED_MISSING_AUDIT_ROW_'+row);
 const obj=existing.get(encoded);
 const fields=obj.fields?.payload?.mapValue?.fields||{};
 if(fields.auditId?.stringValue!==id||fields.snapshot?.mapValue?.fields?.auditId?.stringValue!==id||Number(fields.snapshot?.mapValue?.fields?.sourceRow?.integerValue)!==row||fields.revision?.integerValue!=='0'||fields.pendingOperationId?.nullValue!==null)fail('MALFORMED_DOCUMENT_CONTENT_ROW_'+row);
 missing.push({id,row,old:obj});
 malformed.push(encoded);
}
if(missing.length!==16||existing.size-missing.length!==95)fail('EXPECTED_95_16_SPLIT_NOT_FOUND');
for(const [key] of existing)if(!sources.has(key)&&!malformed.includes(key))fail('EXTRANEOUS_AUDIT_DOCUMENT');
console.log('DEV_REPAIR_SOURCE_MATCH_PASS: 111 audits, 95 normal IDs, 16 incorrectly URL-encoded IDs, 696 claims, 0 outbox.');
// One all-or-nothing transaction: preserve payload and claim ownership unchanged.
// The source ID and row are verified above. No blind reseeding or claim updates.
const begin=await api(root.slice(0,-1)+':beginTransaction',token,'POST',{options:{readWrite:{}}});
if(!begin.transaction)fail('TRANSACTION_MISSING');
const tx=begin.transaction,updates=[];
async function inTransaction(name){
 const rawDocumentId=name.slice((prefix+auditCollection+'/').length);
 const url=new URL(root+auditCollection+'/'+encodeURIComponent(rawDocumentId));
 url.searchParams.set('transaction',tx);
 let res;try{res=await fetch(url.toString(),{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});}catch{fail('TRANSACTION_READ_NETWORK_FAILED');}
 if(res.status===404)return null;
 if(!res.ok)fail('TRANSACTION_READ_HTTP_'+res.status);
 return res.json();
}
for(const item of missing){
 const correctName=prefix+auditCollection+'/'+item.id;
 const oldName=prefix+auditCollection+'/'+encodeURIComponent(item.id);
 const [correct,old]=await Promise.all([inTransaction(correctName),inTransaction(oldName)]);
 if(correct||!old||old.updateTime!==item.old.updateTime)fail('SOURCE_DRIFT_ROW_'+item.row);
 updates.push({update:{name:correctName,fields:old.fields},currentDocument:{exists:false}});
 updates.push({delete:oldName,currentDocument:{updateTime:old.updateTime}});
}
if(updates.length!==32)fail('WRITESET_NOT_32');
const latest=JSON.parse(run(['run','services','describe',service,'--project='+project,'--region='+region,'--format=json']));
if(latest.status?.latestReadyRevisionName!==svc.status.latestReadyRevisionName)fail('RUNTIME_CHANGED_DURING_READ');
const commit=await api(root.slice(0,-1)+':commit',token,'POST',{transaction:tx,writes:updates});
if(!commit.commitTime||commit.writeResults?.length!==32)fail('COMMIT_RECEIPT_UNKNOWN_VERIFY_TARGET');
const after=await list(auditCollection);
const names=new Set(after.map(d=>d.name.slice((prefix+auditCollection+'/').length)));
if(after.length!==111||[...sources.keys()].some(id=>!names.has(id))||malformed.some(id=>names.has(id)))fail('POST_REPAIR_ID_PARITY_FAILED');
console.log(JSON.stringify({result:'DEV_ENCODED_AUDIT_ID_REPAIR_PASS',audits:111,renamed:16,claimsUntouched:696,outboxUntouched:0,atomicOwnerEnabled:false,service},null,2));
