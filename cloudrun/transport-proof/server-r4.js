import http from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {normalizeLifecycleWriteset} from './planning-lifecycle-writeset-20.js';
import {buildNewModelCObligationWithHours20} from './model-c-new-obligation-provenance-20.js';
import {withQualificationMigrationFirestoreLock20} from './auditor-scope-qualifications-firestore-lock-20.js';
import {migrateAuditorQualificationsSheets20} from './auditor-scope-qualifications-migration-sheets-20.js';
import {planAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-plan-20.js';
import {compareAuditorQualificationParity20} from './auditor-scope-qualifications-parity-20.js';
import {previewAuditorQualificationMigration20} from './auditor-scope-qualifications-migration-20.js';
const lifecyclePreviewContext20=new AsyncLocalStorage();
import {managerCanonicalWriteBridge20} from './manager-canonical-write-bridge-20.mjs';
import {buildDirectAuditorAcceptSheets20} from './auditor-accept-direct-sheets-20.mjs';
import {boundedSessionExpiry} from './auth-session-policy.mjs';
import {createSessionRevocationStore} from './auth-session-revocation-20.js';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import rotationDirectPlanGate20 from './rotation-direct-plan-gate-20.cjs';
import {createHmac,createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {v211AssignmentHardCheck,v211RotationHardCheck,v211AuditorQualified,v211ResolveAuditorEmail} from './assignment-validation-v211.js';
import {v211ActorCapabilities} from './actor-capabilities-v211.js';
import {activateScopeHoursVersion20} from './scope-hours-version-20.js';
import {updateScopePolicy20} from './scope-policy-20.js';
import {scopeSchemeVersion20} from './scope-scheme-version-20.js';
import {createScope20} from './scope-create-20.js';
import {companyHoursStorage20} from './company-scope-hours-storage-20.js';
import {previewCompanyHoursMigration20} from './company-scope-hours-migration-20.js';
import {backfillCompanyHours20} from './company-scope-hours-backfill-20.js';
import {resolveCompanyScopeHours20} from './company-scope-hours-resolver-20.js';
import {buildCompanyManagementReadModel20} from './company-management-readmodel-20.js';
import {validateAuditorCompanyChanges} from './company-auditor-permissions-20.js';
import {buildAuditorIdentityIndex,resolveAuditorUid,auditAuditorIdentityReadiness,currentAuditorLoginUid,planAuditorEmailTransition} from './auditor-identity-versions.js';
import {previewSheet} from './auditor-uid-backfill-preview.js';
const PORT=Number(process.env.PORT||8080);
const SID=process.env.AMS_SSOT_SPREADSHEET_ID||process.env.DEV_SSOT_SPREADSHEET_ID||'';
const ORIGIN=process.env.AMS_ALLOWED_ORIGIN||process.env.DEV_ALLOWED_ORIGIN||'';
const BUILD='2026-10-04_PLANNING_R62_AUDITOR_SHARED_MODE';
const SESSION_SECRET=process.env.AMS_SESSION_SIGNING_SECRET||'';
const GAS_WRITE_URL=process.env.AMS_GAS_WRITE_URL||process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const SESSION_COOKIE=process.env.AMS_RUNTIME_ENV==='PROD'?'ams_prod_session':'ams_dev_session';
const SESSION_TTL_SECONDS=30*24*60*60;
const MANAGER_PORTAL_HTML=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const MANAGER_PORTAL_JS=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
function send(res,status,body,extra){const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(extra||{})};if(ORIGIN){h['access-control-allow-origin']=ORIGIN;h['access-control-allow-credentials']='true';h.vary='Origin';}res.writeHead(status,h);res.end(JSON.stringify(body));}
let accessTokenCache={token:'',expiresAt:0};
async function accessToken(){
  const now=Date.now();if(accessTokenCache.token&&now<accessTokenCache.expiresAt-60000)return accessTokenCache.token;
  const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});
  if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);
  const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');
  accessTokenCache={token:j.access_token,expiresAt:now+(Number(j.expires_in)||300)*1000};return accessTokenCache.token;
}
async function sheetsBatchGet(ranges,serialDates=false){
  const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchGet');
  for(const range of ranges)u.searchParams.append('ranges',range);
  u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption',serialDates?'SERIAL_NUMBER':'FORMATTED_STRING');
  const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(body));return body.valueRanges||[];
}
async function sheetsValuesBatchUpdate(data){
  const preview=lifecyclePreviewContext20.getStore();
  if(preview){preview.writes.push(...structuredClone(data));return {totalUpdatedCells:0,authorityPreflight:true};}
  const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchUpdate';
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_BATCH_UPDATE_'+r.status+': '+JSON.stringify(body));return body;
}
async function sheetsValuesAppend(range,values){
  const preview=lifecyclePreviewContext20.getStore();
  if(preview){preview.appends.push({range,values:structuredClone(values)});return {updates:{updatedRows:values.length},authorityPreflight:true};}
  const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent(range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({values})}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_APPEND_'+r.status+': '+JSON.stringify(body));return body;
}
async function sheetsAtomicAuditorCreate(auditorRow,versionRow){
  const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
  const metaResponse=await fetch(base+'?fields=sheets.properties',{headers:{authorization:'Bearer '+token}});
  if(!metaResponse.ok)throw Error('AUDITOR_CREATE_SHEET_METADATA_FAILED');
  const meta=await metaResponse.json(),byName=new Map((meta.sheets||[]).map(x=>[x.properties?.title,x.properties?.sheetId]));
  if(!byName.has('Auditors')||!byName.has('Auditor_Identity_Versions'))throw Error('AUDITOR_CREATE_IDENTITY_SHEETS_MISSING');
  const rowData=values=>({values:values.map(value=>({userEnteredValue:{stringValue:clean(value)}}))});
  const requests=[{appendCells:{sheetId:byName.get('Auditors'),rows:[rowData(auditorRow)],fields:'userEnteredValue'}},{appendCells:{sheetId:byName.get('Auditor_Identity_Versions'),rows:[rowData(versionRow)],fields:'userEnteredValue'}}];
  const response=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests})});
  if(!response.ok)throw Error('AUDITOR_CREATE_ATOMIC_APPEND_FAILED_'+response.status);
  return response.json();
}
async function verifiedAuditorLockDevProject(){
  const configured=clean(process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT||'');
  if(configured&&configured!=='audit-management-system-dev')return '';
  // Cloud Run does not guarantee GOOGLE_CLOUD_PROJECT is populated.
  // Verify the actual runtime project using the GCP metadata identity.
  const response=await fetch('http://metadata.google.internal/computeMetadata/v1/project/project-id',{
    headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(3000)
  });
  if(!response.ok)return '';
  const actual=clean(await response.text());
  return actual==='audit-management-system-dev'?actual:'';
}
async function withAuditorIdentityFirestoreLock(work){
  if(process.env.AMS_AUDITOR_IDENTITY_DISTRIBUTED_LOCK_ENABLED!=='true')throw Error('AUDITOR_EMAIL_DISTRIBUTED_LOCK_DISABLED');
  if(process.env.AMS_RUNTIME_ENV!=='DEV')throw Error('AUDITOR_EMAIL_LOCK_DEV_ONLY');
  if(SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('AUDITOR_EMAIL_DEV_SPREADSHEET_MISMATCH');
  const project=await verifiedAuditorLockDevProject();
  if(project!=='audit-management-system-dev')throw Error('AUDITOR_EMAIL_LOCK_PROJECT_NOT_DEV');
  const database=clean(process.env.AMS_AUDITOR_IDENTITY_LOCK_DATABASE||'(default)');
  if(database!=='(default)'&&!/^[A-Za-z0-9_-]+$/.test(database))throw Error('AUDITOR_EMAIL_LOCK_DATABASE_INVALID');
  const token=await accessToken();
  const collection='ams_identity_cutover_locks',document='global_auditor_email';
  const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/'+encodeURIComponent(database)+'/documents/'+collection;
  const url=base+'?documentId='+document;
  // A lock left by a crashed instance must never be cleared automatically:
  // manual reconciliation is required before further identity changes.
  const probe=await fetch(base+'/'+document,{headers:{authorization:'Bearer '+token}});
  if(probe.ok)throw Error('AUDITOR_EMAIL_LOCK_ALREADY_PRESENT_RECONCILIATION_REQUIRED');
  if(probe.status!==404)throw Error('AUDITOR_EMAIL_LOCK_PROBE_FAILED_'+probe.status);
  let create;
  try{create=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({fields:{holder:{stringValue:randomUUID()},createdAt:{timestampValue:new Date().toISOString()}}})});}
  catch(e){throw Error('AUDITOR_EMAIL_LOCK_ACQUIRE_UNCERTAIN_RECONCILIATION_REQUIRED')}
  if(create.status===409)throw Error('AUDITOR_EMAIL_LOCK_BUSY');
  if(!create.ok)throw Error('AUDITOR_EMAIL_LOCK_ACQUIRE_FAILED_'+create.status);
  let acquired;
  try{acquired=await create.json()}catch(e){throw Error('AUDITOR_EMAIL_LOCK_ACQUIRE_RESPONSE_UNCERTAIN_RECONCILIATION_REQUIRED')}
  const updateTime=clean(acquired.updateTime);
  if(!updateTime)throw Error('AUDITOR_EMAIL_LOCK_VERSION_MISSING_RECONCILIATION_REQUIRED');
  if(!clean(acquired.name).endsWith('/documents/'+collection+'/'+document))throw Error('AUDITOR_EMAIL_LOCK_DOCUMENT_MISMATCH_RECONCILIATION_REQUIRED');
  let result,error;
  try{result=await work()}catch(e){error=e}
  // An uncertain write must retain the lock until an operator reconciles Sheets.
  if(error&&/^AUDITOR_EMAIL_(ATOMIC_UPDATE_FAILED|POST_WRITE_)/.test(clean(error.message)))throw Error('AUDITOR_EMAIL_RECONCILIATION_REQUIRED: '+clean(error.message));
  const releaseUrl=base+'/'+document+'?currentDocument.updateTime='+encodeURIComponent(updateTime);
  try{const release=await fetch(releaseUrl,{method:'DELETE',headers:{authorization:'Bearer '+token}});
    if(!release.ok)throw Error('AUDITOR_EMAIL_LOCK_RELEASE_FAILED_'+release.status);
  }catch(e){throw Error('AUDITOR_EMAIL_LOCK_RELEASE_UNCERTAIN: '+clean(e.message)+(error?'; operation: '+clean(error.message):''))}
  if(error)throw error;
  return result;
}
async function auditorEmailLockWriteProbe(){
  if(process.env.AMS_RUNTIME_ENV!=='DEV'||SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return{ok:false,reason:'DEV_ONLY'};
  const project=await verifiedAuditorLockDevProject();
  if(project!=='audit-management-system-dev')return{ok:false,reason:'PROJECT_NOT_VERIFIED'};
  const token=await accessToken();
  const id='probe_'+randomUUID().replace(/-/g,'');
  const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/ams_identity_cutover_probes';
  let created;
  try{
    const response=await fetch(base+'?documentId='+id,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({fields:{purpose:{stringValue:'DEV_READINESS_PROBE'}}})});
    if(!response.ok)return{ok:false,reason:'WRITE_HTTP_'+response.status};
    created=await response.json();
  }catch(e){return{ok:false,reason:'WRITE_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED',documentId:id}}
  const updateTime=clean(created?.updateTime);
  if(!updateTime||!clean(created?.name).endsWith('/ams_identity_cutover_probes/'+id))return{ok:false,reason:'WRITE_RESPONSE_UNVERIFIED_MANUAL_RECONCILIATION_REQUIRED',documentId:id};
  try{
    const response=await fetch(base+'/'+id+'?currentDocument.updateTime='+encodeURIComponent(updateTime),{method:'DELETE',headers:{authorization:'Bearer '+token}});
    if(!response.ok)return{ok:false,reason:'DELETE_HTTP_'+response.status+'_MANUAL_RECONCILIATION_REQUIRED',documentId:id};
    return{ok:true,reason:'FIRESTORE_WRITE_AND_DELETE_VERIFIED'};
  }catch(e){return{ok:false,reason:'DELETE_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED',documentId:id}}
}
async function auditorEmailLockReadiness(){
  if(process.env.AMS_RUNTIME_ENV!=='DEV')return{ready:false,reason:'DEV_ONLY'};
  if(SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return{ready:false,reason:'DEV_SPREADSHEET_MISMATCH'};
  const project=await verifiedAuditorLockDevProject();
  if(project!=='audit-management-system-dev')return{ready:false,reason:'LOCK_PROJECT_NOT_DEV'};
  const database=clean(process.env.AMS_AUDITOR_IDENTITY_LOCK_DATABASE||'(default)');
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/'+encodeURIComponent(database)+'/documents/ams_identity_cutover_locks/global_auditor_email';
  const response=await fetch(url,{headers:{authorization:'Bearer '+await accessToken()}});
  if(response.status===404){
    // A missing document does not prove the database exists or that writes
    // are permitted. Probe the parent collection metadata separately.
    const root='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/'+encodeURIComponent(database);
    const db=await fetch(root,{headers:{authorization:'Bearer '+await accessToken()}});
    if(!db.ok)return{ready:false,reason:'FIRESTORE_DATABASE_ACCESS_'+db.status};
    if(process.env.AMS_AUDITOR_IDENTITY_DISTRIBUTED_LOCK_ENABLED!=='true')return{ready:false,reason:'LOCK_DISABLED_FIRESTORE_READ_OK_WRITE_UNVERIFIED'};
    return{ready:true,reason:'LOCK_DOCUMENT_ABSENT_READ_ACCESS_OK_WRITE_UNVERIFIED'};
  }
  if(response.ok)return{ready:false,reason:'LOCK_HELD_RECONCILIATION_REQUIRED'};
  return{ready:false,reason:'FIRESTORE_LOCK_ACCESS_'+response.status};
}
async function sheetsAtomicAuditorEmailTransition({auditorRow,auditorEmailCol,oldEmail,newEmail,uid,versionRow,versionHeaders,versionCells,at,actor,reason,planningRows=[]}){
  // Keep the write gated until DEV integration verifies multi-instance serialization.
  if(process.env.AMS_AUDITOR_EMAIL_CHANGE_WRITE_ENABLED!=='true')throw Error('AUDITOR_EMAIL_WRITE_DISABLED');
  if(process.env.AMS_AUDITOR_UID_LOGIN_ENABLED!=='true')throw Error('AUDITOR_EMAIL_CHANGE_REQUIRES_UID_LOGIN');
  return withAuditorIdentityFirestoreLock(async()=>{
  const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
  const mr=await fetch(base+'?fields=sheets.properties',{headers:{authorization:'Bearer '+token}});
  if(!mr.ok)throw Error('AUDITOR_EMAIL_SHEET_METADATA_FAILED');
  const meta=await mr.json(),ids=new Map((meta.sheets||[]).map(x=>[x.properties?.title,x.properties?.sheetId]));
  for(const name of ['Auditors','Auditor_Identity_Versions','Auditor_Tokens','Diagnostics_Log','Audit planning'])if(!ids.has(name))throw Error('AUDITOR_EMAIL_SHEET_MISSING_'+name);
  const read=await sheetsBatchGet(['Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000','Auditor_Tokens!A1:Z1024','Audit planning!A1:BW2500'],true);
  const auditors=read[0]?.values||[],ah=auditors[0]||[],ac=col(ah,['E-mail','Email']),uc=col(ah,['Auditor_UID','Auditor UID']);
  if(ac!==auditorEmailCol||uc<0||clean(auditors[auditorRow-1]?.[ac]).toLowerCase()!==oldEmail||val(auditors[auditorRow-1],uc)!==uid)throw Error('AUDITOR_EMAIL_CONCURRENT_PROFILE_CHANGE');
  const vv=read[1]?.values||[],vh=vv[0]||[],ve=col(vh,['Email_Normalized']),vu=col(vh,['Auditor_UID']),vs=col(vh,['State']),vt=col(vh,['Valid_To_UTC']);
  if([ve,vu,vs,vt].some(x=>x<0)||vh.join('|')!==versionHeaders.join('|'))throw Error('AUDITOR_EMAIL_VERSION_SCHEMA_CHANGED');
  if(val(vv[versionRow-1]||[],vu)!==uid||val(vv[versionRow-1]||[],ve).toLowerCase()!==oldEmail||val(vv[versionRow-1]||[],vs).toUpperCase()!=='ACTIVE')throw Error('AUDITOR_EMAIL_CONCURRENT_VERSION_CHANGE');
  if(vv.slice(1).some(x=>val(x,ve).toLowerCase()===newEmail&&val(x,vs).toUpperCase()!=='CANCELLED'))throw Error('AUDITOR_EMAIL_ALIAS_RESERVED');
  if(vv.slice(1).filter(x=>val(x,vu)===uid&&val(x,vs).toUpperCase()==='ACTIVE').length!==1)throw Error('AUDITOR_EMAIL_ACTIVE_VERSION_NOT_UNIQUE');
  if(auditors.slice(1).some((row,i)=>i!==auditorRow-2&&clean(row[ac]).toLowerCase()===newEmail))throw Error('AUDITOR_EMAIL_ALREADY_ASSIGNED');
  const tv=read[2]?.values||[],th=tv[0]||[],te=col(th,['Email']),tr=col(th,['Revoked']),tro=col(th,['Role']);
  if([te,tr,tro].some(x=>x<0))throw Error('AUDITOR_EMAIL_TOKEN_SCHEMA_MISSING');
  const pv=read[3]?.values||[],ph=pv[0]||[],pa=col(ph,['Assigned to']),pu=col(ph,['Auditor_UID','Auditor UID']);
  if(pa<0||pu<0)throw Error('AUDITOR_EMAIL_PLANNING_SCHEMA_MISSING');
  const liveRows=pv.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>val(x.row,pu)===uid&&val(x.row,pa).toLowerCase()===oldEmail);
  if(liveRows.length!==planningRows.length||liveRows.some((x,i)=>x.line!==planningRows[i]))throw Error('AUDITOR_EMAIL_PLANNING_CHANGED');
  if(pv.slice(1).some(row=>val(row,pa).toLowerCase()===oldEmail&&val(row,pu)!==uid))throw Error('AUDITOR_EMAIL_PLANNING_UID_CONFLICT');
  if(pv.slice(1).some(row=>val(row,pu)===uid&&val(row,pa).toLowerCase()!==oldEmail))throw Error('AUDITOR_EMAIL_PLANNING_PROJECTION_CONFLICT');
  if(pv.length>=2500||tv.length>=1024||vv.length>=2000||auditors.length>=1000)throw Error('AUDITOR_EMAIL_READ_RANGE_LIMIT_REACHED');
  const cell=v=>({userEnteredValue:{stringValue:clean(v)}}),range=(name,row,c)=>({sheetId:ids.get(name),startRowIndex:row-1,endRowIndex:row,startColumnIndex:c,endColumnIndex:c+1});
  const update=(name,row,c,value)=>({updateCells:{range:range(name,row,c),rows:[{values:[cell(value)]}],fields:'userEnteredValue'}});
  const append=(name,values)=>({appendCells:{sheetId:ids.get(name),rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
  const newVersion=versionHeaders.map(h=>versionCells[h]||'');
  const detail=JSON.stringify({uid,oldEmail,newEmail,at,actor,reason,revokedTokens:tv.slice(1).filter(x=>val(x,te).toLowerCase()===oldEmail&&val(x,tro).toLowerCase()==='auditor').length});
  const log=phase=>[at,'AUDITOR_MANAGEMENT_2_0','AUDITOR_EMAIL_CHANGE',uid,phase,actor,'','',false,reason,detail];
  const requests=[append('Diagnostics_Log',log('CHANGE_INTENT')),update('Auditors',auditorRow,ac,newEmail),update('Auditor_Identity_Versions',versionRow,vs,'EXPIRED'),update('Auditor_Identity_Versions',versionRow,vt,at),append('Auditor_Identity_Versions',newVersion)];
  for(const rowNumber of planningRows)requests.push(update('Audit planning',rowNumber,pa,newEmail));
  for(let i=1;i<tv.length;i++)if(val(tv[i],te).toLowerCase()===oldEmail&&val(tv[i],tro).toLowerCase()==='auditor')requests.push(update('Auditor_Tokens',i+1,tr,'TRUE'));
  requests.push(append('Diagnostics_Log',log('CHANGE_APPLIED')));
  let response;
  try{response=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests})});}
  catch(e){throw Error('AUDITOR_EMAIL_ATOMIC_UPDATE_FAILED_NETWORK_UNCERTAIN')}
  if(!response.ok)throw Error('AUDITOR_EMAIL_ATOMIC_UPDATE_FAILED_'+response.status);
  // A successful HTTP response does not by itself establish the persisted state.
  // Verification below must complete before the distributed lock is released.
  const verified=await sheetsBatchGet(['Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000','Audit planning!A1:BW2500','Auditor_Tokens!A1:Z1024'],true).catch(()=>{throw Error('AUDITOR_EMAIL_POST_WRITE_READ_FAILED')});
  const va=verified[0]?.values||[],vav=verified[1]?.values||[],vp=verified[2]?.values||[],vtoken=verified[3]?.values||[];
  if(clean(va[auditorRow-1]?.[ac]).toLowerCase()!==newEmail||val(va[auditorRow-1],uc)!==uid)throw Error('AUDITOR_EMAIL_POST_WRITE_AUDITOR_MISMATCH');
  if(val(vav[versionRow-1],vs).toUpperCase()!=='EXPIRED'||!(Math.abs(sheetSerialMs(val(vav[versionRow-1],vt))-Date.parse(at))<=1000))throw Error('AUDITOR_EMAIL_POST_WRITE_OLD_VERSION_MISMATCH');
  const nh=vav[0]||[],nuid=col(nh,['Auditor_UID']),nemail=col(nh,['Email_Normalized']),nstate=col(nh,['State']);
  const versionIdCol=col(nh,['Version_ID']),versionFromCol=col(nh,['Valid_From_UTC']);
  const newVersionMatches=vav.slice(1).filter(x=>val(x,nuid)===uid&&val(x,nemail).toLowerCase()===newEmail&&val(x,nstate).toUpperCase()==='ACTIVE');
  if(versionIdCol<0||versionFromCol<0||newVersionMatches.length!==1||val(newVersionMatches[0],versionIdCol)!==versionCells.Version_ID||!(Math.abs(sheetSerialMs(val(newVersionMatches[0],versionFromCol))-Date.parse(at))<=1000))throw Error('AUDITOR_EMAIL_POST_WRITE_NEW_VERSION_MISMATCH');
  if(planningRows.some(line=>val(vp[line-1],pa).toLowerCase()!==newEmail||val(vp[line-1],pu)!==uid))throw Error('AUDITOR_EMAIL_POST_WRITE_PLANNING_MISMATCH');
  if(vp.slice(1).some(row=>val(row,pu)===uid&&val(row,pa).toLowerCase()!==newEmail))throw Error('AUDITOR_EMAIL_POST_WRITE_PLANNING_MISMATCH');
  if(vp.slice(1).some(row=>val(row,pa).toLowerCase()===oldEmail))throw Error('AUDITOR_EMAIL_POST_WRITE_STALE_EMAIL_PROJECTION');
  const oldTokens=tv.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>val(x.row,te).toLowerCase()===oldEmail&&val(x.row,tro).toLowerCase()==='auditor');
  if(oldTokens.some(x=>val(vtoken[x.line-1],te).toLowerCase()!==oldEmail||val(vtoken[x.line-1],tro).toLowerCase()!=='auditor'||!revoked(val(vtoken[x.line-1],tr))))throw Error('AUDITOR_EMAIL_POST_WRITE_TOKEN_MISMATCH');
  if(vtoken.slice(1).some(x=>val(x,te).toLowerCase()===oldEmail&&val(x,tro).toLowerCase()==='auditor'&&!revoked(val(x,tr))))throw Error('AUDITOR_EMAIL_POST_WRITE_TOKEN_MISMATCH');
  if(vav.slice(1).some(x=>val(x,nuid)===uid&&val(x,nstate).toUpperCase()==='ACTIVE'&&val(x,nemail).toLowerCase()!==newEmail))throw Error('AUDITOR_EMAIL_POST_WRITE_MULTIPLE_ACTIVE_IDENTITIES');
  return{ok:true,revokedTokens:tv.slice(1).filter(x=>val(x,te).toLowerCase()===oldEmail&&val(x,tro).toLowerCase()==='auditor').length,updatedAssignments:planningRows.length};
  });
}
async function sheetsDeleteRow(sheetTitle,rowNumber){
  const preview=lifecyclePreviewContext20.getStore();
  if(preview){preview.deletes.push({sheetTitle,rowNumber});return {authorityPreflight:true};}
  const token=await accessToken(),metaUrl='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'?fields=sheets.properties';
  const mr=await fetch(metaUrl,{headers:{authorization:'Bearer '+token}}),meta=await mr.json();
  if(!mr.ok)throw new Error('SHEETS_META_'+mr.status+': '+JSON.stringify(meta));
  const sh=(meta.sheets||[]).find(x=>x.properties?.title===sheetTitle);if(!sh)throw new Error('SHEET_NOT_FOUND_'+sheetTitle);
  const rn=Number(rowNumber||0);if(rn<2)throw new Error('INVALID_DELETE_ROW');
  const u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+':batchUpdate';
  const body={requests:[{deleteDimension:{range:{sheetId:sh.properties.sheetId,dimension:'ROWS',startIndex:rn-1,endIndex:rn}}}]};
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}),out=await r.json();
  if(!r.ok)throw new Error('SHEETS_DELETE_ROW_'+r.status+': '+JSON.stringify(out));return out;
}
async function sheetsEnsureRows(sheetTitle,requiredRows){
  const preview=lifecyclePreviewContext20.getStore();
  if(preview){preview.ensureRows.push({sheetTitle,requiredRows});return;}
  const token=await accessToken(),metaUrl='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'?fields=sheets.properties';
  const mr=await fetch(metaUrl,{headers:{authorization:'Bearer '+token}}),meta=await mr.json();
  if(!mr.ok)throw new Error('SHEETS_META_'+mr.status+': '+JSON.stringify(meta));
  const sh=(meta.sheets||[]).find(x=>x.properties?.title===sheetTitle);if(!sh)throw new Error('SHEET_NOT_FOUND_'+sheetTitle);
  const current=Number(sh.properties.gridProperties?.rowCount||0);if(requiredRows<=current)return;
  const u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+':batchUpdate';
  const body={requests:[{appendDimension:{sheetId:sh.properties.sheetId,dimension:'ROWS',length:Math.max(requiredRows-current,100)}}]};
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}),out=await r.json();
  if(!r.ok)throw new Error('SHEETS_GRID_EXPAND_'+r.status+': '+JSON.stringify(out));
}
function a1col(n){let s='';for(let x=n;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+((x-1)%26))+s;return s;}
function isoLocalStamp(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace('T',' ');}
function clean(v){return String(v==null?'':v).trim();}
function b64url(v){return Buffer.from(v).toString('base64url');}
function cookieMap(req){const out={};for(const part of clean(req.headers.cookie).split(';')){const p=part.indexOf('=');if(p>0)out[part.slice(0,p).trim()]=part.slice(p+1).trim();}return out;}
function sessionConfigured(){return SESSION_SECRET.length>=32;}
function sign(v){return createHmac('sha256',SESSION_SECRET).update(v).digest('base64url');}
function safeEq(a,b){const x=Buffer.from(clean(a)),y=Buffer.from(clean(b));return x.length===y.length&&timingSafeEqual(x,y);}
function issueSession(identity){if(!sessionConfigured())throw new Error('SESSION_SECRET_NOT_CONFIGURED');const now=Math.floor(Date.now()/1000),payload=b64url(JSON.stringify({v:1,email:clean(identity.email).toLowerCase(),role:clean(identity.role),auditorUid:clean(identity.auditorUid),deviceHash:clean(identity.deviceHash),iat:now,exp:boundedSessionExpiry(now,SESSION_TTL_SECONDS,identity.legacyTokenExpiresAt).expiresAtSeconds}));return payload+'.'+sign(payload);}
function verifySession(raw){if(!sessionConfigured()||!raw)return null;const parts=clean(raw).split('.');if(parts.length!==2||!safeEq(sign(parts[0]),parts[1]))return null;try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')),now=Math.floor(Date.now()/1000);if(p.v!==1||!p.email||!p.role||!p.exp||p.exp<=now)return null;return p;}catch{return null;}}
function sessionFromRequest(req){return verifySession(cookieMap(req)[SESSION_COOKIE]);}
let authRevocationAccess={token:'',expires:0};
async function authRevocationAccessToken(){if(authRevocationAccess.token&&Date.now()<authRevocationAccess.expires-60000)return authRevocationAccess.token;const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});if(!r.ok)throw Error('AUTH_REVOCATION_IAM_'+r.status);const json=await r.json();authRevocationAccess={token:json.access_token||'',expires:Date.now()+(Number(json.expires_in)||300)*1000};return authRevocationAccess.token;}
function authRevocationStore(){const projectId=process.env.AMS_GCP_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||process.env.GCP_PROJECT;if(!projectId)throw Error('AUTH_REVOCATION_PROJECT_REQUIRED');return createSessionRevocationStore({projectId,getAccessToken:authRevocationAccessToken});}
async function sessionFromRequestValidated(req){if(process.env.AMS_AUDITOR_EMAIL_CHANGE_WRITE_ENABLED==='true'&&process.env.AMS_AUDITOR_UID_LOGIN_ENABLED!=='true')throw Error('AUDITOR_EMAIL_CHANGE_REQUIRES_UID_LOGIN');const session=sessionFromRequest(req);if(!session)return null;if(session.deviceHash&&!safeEq(session.deviceHash,createHash('sha256').update(clean(cookieMap(req).ams_auth_device)).digest('hex'))){console.warn('AMS_AUTH_SESSION_REJECT',JSON.stringify({reason:'DEVICE_BINDING',hasDeviceCookie:!!cookieMap(req).ams_auth_device}));return null;}if(process.env.AMS_AUTH_LOGOUT_REVOCATION_ENABLED==='true'){const store=authRevocationStore();if(await store.isRevoked(cookieMap(req)[SESSION_COOKIE]))return null;}if(clean(session.role).toLowerCase()!=='auditor'||process.env.AMS_AUDITOR_UID_LOGIN_ENABLED!=='true')return session;const check=await validateVersionedAuditorLogin(clean(session.email).toLowerCase());if(!check.ok||session.auditorUid!==check.uid){console.warn('AMS_AUTH_SESSION_REJECT',JSON.stringify({reason:'AUDITOR_UID',currentIdentityOk:!!check.ok}));return null;}return session;}
function sessionCookie(token,persistent=true){const session=verifySession(token);if(!session)throw new Error('SESSION_INVALID_OR_EXPIRED');return SESSION_COOKIE+'='+token+(persistent?'; Max-Age='+Math.max(0,session.exp-Math.floor(Date.now()/1000)):'')+'; Path=/; HttpOnly; Secure; SameSite=Lax';}
function html(res,status,body,headers={}){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store',...headers});res.end(body);}
function esc(v){return clean(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));}
function sha256Hex(v){return createHash('sha256').update(clean(v)).digest('hex');}
function revoked(v){return v===true||['YES','TRUE'].includes(clean(v).toUpperCase());}
function sheetSerialMs(v){if(typeof v==='number'&&Number.isFinite(v))return Math.round((v-25569)*86400000);const n=Number(v);if(Number.isFinite(n)&&clean(v)!=='')return Math.round((n-25569)*86400000);const t=Date.parse(clean(v));return Number.isFinite(t)?t:NaN;}
async function validateLegacyIdentity(rawToken,role,deviceId){rawToken=clean(rawToken);role=clean(role);deviceId=clean(deviceId);if(!rawToken)return{ok:false,error:'NO_TOKEN'};if(!deviceId)return{ok:false,error:'MISSING_DEVICE_ID'};if(!role)return{ok:false,error:'MISSING_ROLE'};const tokenHash=sha256Hex(rawToken),deviceHash=sha256Hex(deviceId),vr=await sheetsBatchGet(['Auditor_Tokens!A1:Z1024'],true),rows=vr[0]?.values||[];if(rows.length<2)return{ok:false,error:'TOKEN_NOT_FOUND'};const h=rows[0],ce=col(h,['Email']),cr=col(h,['Role']),ct=col(h,['Token_Hash']),cd=col(h,['Device_Fingerprint','Device_Fingerprin','Device_Fingerprint_Hash']),cx=col(h,['Expires_At']),cv=col(h,['Revoked']);if([ce,cr,ct,cd,cx,cv].some(x=>x<0))throw new Error('AUDITOR_TOKENS_HEADER_MISSING');for(let i=1;i<rows.length;i++){const row=rows[i];if(clean(row[cr]).toLowerCase()!==role.toLowerCase()||clean(row[ct])!==tokenHash)continue;if(revoked(row[cv]))return{ok:false,error:'TOKEN_REVOKED'};const exp=sheetSerialMs(row[cx]);if(!Number.isFinite(exp)||exp<Date.now())return{ok:false,error:'TOKEN_EXPIRED'};const stored=clean(row[cd]);if(!stored||stored!==deviceHash)return{ok:false,error:'DEVICE_MISMATCH'};const email=clean(row[ce]).toLowerCase();if(!email)return{ok:false,error:'TOKEN_EMAIL_EMPTY'};if(role.toLowerCase()==='auditor'){const valid=await validateVersionedAuditorLogin(email);if(!valid.ok)return valid;return{ok:true,email,role,auditorUid:valid.uid||'',legacyTokenExpiresAt:exp};}return{ok:true,email,role,legacyTokenExpiresAt:exp};}return{ok:false,error:'TOKEN_NOT_FOUND'};}
async function auditorUidBackfillPreviewRead(){
 const vr=await sheetsBatchGet(['Auditors!A1:AZ1000'],true);
 return {ok:true,...previewSheet(vr[0]?.values||[])};
}
async function auditorIdentityReadinessRead(){
  const vr=await sheetsBatchGet(['Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000','Log realized audits!A1:AZ2500','Audit planning!A1:BW2500'],true);
  const av=vr[0]?.values||[],h=av[0]||[],u=col(h,['Auditor_UID','Auditor UID']),e=col(h,['Email','E-mail']);
  if(u<0||e<0)throw Error('IDENTITY_READINESS_SCHEMA_MISSING');
  const backfill=previewSheet(av);
  if(backfill.pending.length)return{ok:true,ready:false,code:'AUDITOR_UID_BACKFILL_REQUIRED',backfill:{total:backfill.total,existing:backfill.existing,missing:backfill.pending.length}};
  const auditors=av.slice(1).filter(r=>val(r,e)).map(r=>({uid:val(r,u),email:val(r,e)}));
  const versions=rotationIdentityVersions(vr[1]?.values||[]),readiness=auditAuditorIdentityReadiness(auditors,versions),map=rotationAuditorMap(av,versions),logs=vr[2]?.values||[],lh=logs[0]||[],le=col(lh,['Auditor','Auditor Email','Email']),lu=col(lh,['Auditor_UID','Auditor UID']);
  if(!logs.length||le<0)throw Error('IDENTITY_HISTORICAL_AUDIT_SCHEMA_MISSING');
  let historicalUnresolved=0,historicalConflicts=0,historicalChecked=0;
  for(const row of logs.slice(1)){const raw=val(row,le),uid=val(row,lu);if(!row.some(x=>clean(x)))continue;historicalChecked++;if(!raw&&!uid){historicalUnresolved++;continue;}let resolved='';try{resolved=raw?rotationResolveAuditor(map,raw):'';}catch{historicalUnresolved++;continue;}if(!uid)historicalUnresolved++;else if(!map.byUid.has(uid)||(resolved&&resolved!==uid))historicalConflicts++;}
  const plans=vr[3]?.values||[],ph=plans[0]||[],pe=col(ph,['Assigned to']),pu=col(ph,['Auditor_UID','Auditor UID']);
  if(!plans.length||pe<0||pu<0)throw Error('IDENTITY_PLANNING_SCHEMA_MISSING');
  let planningChecked=0,planningConflicts=0;
  for(const row of plans.slice(1)){const email=val(row,pe),uid=val(row,pu);if(!email&&!uid)continue;planningChecked++;let resolved='';try{resolved=rotationResolveAuditor(map,email);}catch{planningConflicts++;continue;}if(!uid||resolved!==uid)planningConflicts++;}
  return{ok:true,backfill:{total:backfill.total,existing:backfill.existing,missing:0},...readiness,ready:readiness.ready&&!historicalUnresolved&&!historicalConflicts&&!planningConflicts,historical:{checked:historicalChecked,unresolved:historicalUnresolved,conflicts:historicalConflicts},planning:{checked:planningChecked,conflicts:planningConflicts}};
}
async function validateVersionedAuditorLogin(email){
  if(process.env.AMS_AUDITOR_EMAIL_CHANGE_WRITE_ENABLED==='true'&&process.env.AMS_AUDITOR_UID_LOGIN_ENABLED!=='true')throw Error('AUDITOR_EMAIL_CHANGE_REQUIRES_UID_LOGIN');
  if(process.env.AMS_AUDITOR_UID_LOGIN_ENABLED!=='true')return{ok:true};
  const vr=await sheetsBatchGet(['Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000'],true);
  const av=vr[0]?.values||[],h=av[0]||[],uidCol=col(h,['Auditor_UID','Auditor UID']),emailCol=col(h,['Email','E-mail']);
  if(uidCol<0||emailCol<0)throw Error('AUDITOR_UID_LOGIN_SCHEMA_MISSING');
  const auditors=av.slice(1).filter(x=>val(x,emailCol)).map(x=>({uid:val(x,uidCol),email:val(x,emailCol)}));
  const index=buildAuditorIdentityIndex(auditors,rotationIdentityVersions(vr[1]?.values||[])||[]);
  const uid=currentAuditorLoginUid(index,email,new Date().toISOString());
  if(!uid)return{ok:false,error:'AUDITOR_EMAIL_NOT_CURRENT'};
  return{ok:true,uid};
}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};h.forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean(r[i]):'';}
function findAudit(values,id){if(!values.length)return null;const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']);if(ci<0)throw new Error('AUDIT_ID_COLUMN_MISSING');for(let i=1;i<values.length;i++)if(val(values[i],ci)===id)return{h,row:values[i],sourceRow:i+1};return null;}
function yes(v){const s=clean(v).toLowerCase();return s==='x'||s==='yes'||s==='true'||s==='1'||s==='ja';}

function scopeCatalog(values){
  if(!values.length)return[];
  const h=values[0],cs=col(h,['SlotKey','Slot key','Slot']),cc=col(h,['ScopeCode','Scope code','Code']),cn=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),ca=col(h,['Active']),car=col(h,['Archived']),cr=col(h,['Recurring']),coc=col(h,['Obligation cycle','Obligation_cycle','Cycle']),ccb=col(h,['Complete by','Complete_by','Must be completed by']),cfh=col(h,['Formal_hours','Formal hours','Formal Hours','Default_hours','Default hours']),cmoh=col(h,['Max_Offsite_Hours','Max Offsite Hours','Max offsite hours','Maximum offsite hours']),cmi=col(h,['Min_Interval_Months','Min Interval Months','Minimum interval months']),cpf=col(h,['Planning from','Planning_from','PlanningFrom']),cpt=col(h,['Planning to','Planning_to','PlanningTo']),cex=col(h,['Extension','Extension months','Extension_months']);
  return values.slice(1).map(r=>({slotKey:val(r,cs),scopeCode:val(r,cc),displayName:val(r,cn),active:ca<0||yes(r[ca]),archived:car>=0&&yes(r[car]),recurring:cr<0?null:yes(r[cr]),obligationCycle:val(r,coc).toUpperCase(),completeBy:val(r,ccb),formalHours:Number(String(val(r,cfh)||'').replace(',','.'))||0,maxOffsiteHours:Math.max(0,Number(String(val(r,cmoh)||'0').replace(',','.'))||0),minIntervalMonths:Math.max(0,Number(String(val(r,cmi)||'0').replace(',','.'))||0),planningFrom:Number(String(val(r,cpf)||'0').replace(',','.'))||0,planningTo:Number(String(val(r,cpt)||'0').replace(',','.'))||0,extensionMonths:Number(String(val(r,cex)||'0').replace(',','.'))||0})).filter(x=>x.displayName&&x.active&&!x.archived);
}

function scopesForAudit(f,catalog){
  const out=[];
  for(const s of catalog){
    for(const k of [s.slotKey,s.scopeCode,s.displayName]){
      const i=col(f.h,[k]);
      if(i>=0&&yes(f.row[i])){out.push(s.displayName);break;}
    }
  }
  return [...new Set(out)];
}

function offsitePolicyForScopes(catalog,scopes){
  const wanted=new Set((scopes||[]).map(key)),byScope=[];
  for(const s of catalog||[]){
    if(!wanted.has(key(s.displayName))&&!wanted.has(key(s.scopeCode))&&!wanted.has(key(s.slotKey)))continue;
    byScope.push({scopeCode:s.scopeCode||s.displayName||s.slotKey,maxOffsiteHours:Math.max(0,Number(s.maxOffsiteHours||0)||0)});
  }
  const positive=byScope.filter(x=>x.maxOffsiteHours>0);
  return{
    byScope,
    maxOffsiteHours:byScope.length===1?byScope[0].maxOffsiteHours:0,
    requiresScopeAllocation:byScope.length>1&&positive.length>0
  };
}
function maxOffsiteHoursForScopes(catalog,scopes){return offsitePolicyForScopes(catalog,scopes).maxOffsiteHours}
function minimumIntervalConstraint(audit,catalog,logValues){
  const out={minPlanningDate:'',byScope:[]};if(!audit||!Array.isArray(logValues)||logValues.length<2)return out;
  const wanted=(catalog||[]).filter(s=>Number(s.minIntervalMonths||0)>0&&(audit.scopes||[]).some(x=>[s.displayName,s.scopeCode,s.slotKey].some(y=>key(x)===key(y))));
  if(!wanted.length)return out;
  const h=logValues[0],cu=col(h,['Company_UID','Company UID','CompanyUid']),cc=col(h,['Company']),cs=col(h,['Status']),cd=col(h,['Date completed','Completed date','Date planned','Date - Planned','Audit date','Execution date','Date']),csl=col(h,['Scopes list','Scopes','Scope']);
  const uid=clean(audit.companyUid),company=key(audit.company);
  for(const def of wanted){
    const aliases=new Set([def.displayName,def.scopeCode,def.slotKey].map(key).filter(Boolean));let latest='';
    for(const r of logValues.slice(1)){
      const st=val(r,cs).toUpperCase().replace(/[\s-]+/g,'_');if(st&&st!=='COMPLETED'&&st!=='REALIZED')continue;
      const rowUid=val(r,cu),rowCompany=key(val(r,cc));if(uid){if(rowUid!==uid&&rowCompany!==company)continue}else if(rowCompany!==company)continue;
      let rowScopes=scopesForAudit({h,row:r},catalog);if(!rowScopes.length&&csl>=0)rowScopes=val(r,csl).split(/[,;|]/).map(clean).filter(Boolean);
      if(!rowScopes.some(x=>aliases.has(key(x))))continue;
      const d=dateOnly(r[cd]);if(d&&(!latest||d>latest))latest=d;
    }
    if(!latest)continue;const minDate=extAddMonths(latest,Number(def.minIntervalMonths||0));if(!minDate)continue;
    out.byScope.push({scopeCode:def.scopeCode||def.displayName,minIntervalMonths:Number(def.minIntervalMonths||0),lastCompletedDate:latest,minPlanningDate:minDate});
    if(!out.minPlanningDate||minDate>out.minPlanningDate)out.minPlanningDate=minDate;
  }
  return out;
}

function obligationPlanningForAudit(auditId,catalog,obValues,linkValues){
  const out=[];if(!obValues?.length||!linkValues?.length)return out;const cfg=new Map();for(const s of catalog||[])cfg.set(clean(s.scopeCode),s);const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),oc=col(oh,['ScopeCode','Scope Code']),of=col(oh,['Formal_Hours','Formal Hours']),os=col(oh,['Obligation_State','Obligation State']),obById=new Map();for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);for(const lr of linkValues.slice(1)){if(val(lr,la)!==auditId||val(lr,ls).toUpperCase()!=='ACTIVE')continue;const ob=obById.get(val(lr,lo));if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;const code=val(ob,oc),def=cfg.get(code)||{},formal=Number(String(val(ob,of)||def.formalHours||'').replace(',','.'))||0;out.push({obligationId:val(lr,lo),scopeCode:code,formalHours:formal});}return out;
}

function executionConstraint(auditId,catalog,obValues,linkValues){
  const out={cycleKey:'',mustCompleteBy:'',source:'',scopeCodes:[]};if(!obValues?.length||!linkValues?.length)return out;
  const cfg=new Map();for(const s of catalog||[])cfg.set(clean(s.scopeCode),s);
  const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),oc=col(oh,['ScopeCode','Scope Code']),ock=col(oh,['Cycle_Key','Cycle Key']),os=col(oh,['Obligation_State','Obligation State']),obById=new Map();
  for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}
  const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),deadlines=[];
  for(const lr of linkValues.slice(1)){if(val(lr,la)!==auditId||val(lr,ls).toUpperCase()!=='ACTIVE')continue;const ob=obById.get(val(lr,lo));if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;const code=val(ob,oc),def=cfg.get(code),cycle=val(ob,ock);if(!def||def.recurring!==false||def.obligationCycle!=='ANNUAL'||!/^[0-9]{4}$/.test(cycle)||!/^([0-9]{2})-([0-9]{2})$/.test(def.completeBy))continue;const deadline=cycle+'-'+def.completeBy;if(!/^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(deadline))continue;deadlines.push({deadline,cycle,code});}
  if(!deadlines.length)return out;deadlines.sort((a,b)=>a.deadline.localeCompare(b.deadline));out.cycleKey=deadlines[0].cycle;out.mustCompleteBy=deadlines[0].deadline;out.source='CONFIG_SCOPES_NON_RECURRING_CYCLE';out.scopeCodes=[...new Set(deadlines.map(x=>x.code))];return out;
}

function companyAuditorExclusions(values,companyUid,companyName){
  const out=new Set();if(!values.length)return out;
  const h=values[0],cu=col(h,['Company_UID','Company UID','UID']),cn=col(h,['Company']),cx=col(h,['Auditor_Exclusions','Auditor Exclusions','Auditor exclusions']);
  if(cx<0)return out;const uid=key(companyUid),name=key(companyName);let row=null;
  for(const r of values.slice(1)){if(uid&&cu>=0&&key(r[cu])===uid){row=r;break}if(!row&&name&&cn>=0&&key(r[cn])===name)row=r;}
  if(!row)return out;const raw=clean(row[cx]);if(!raw)return out;
  const add=v=>{const s=clean(v).toLowerCase();if(s&&s.includes('@'))out.add(s);};
  try{const j=JSON.parse(raw),arr=Array.isArray(j)?j:(Array.isArray(j?.exclusions)?j.exclusions:Array.isArray(j?.items)?j.items:[]);for(const x of arr){if(typeof x==='string'){add(x);continue}if(!x||typeof x!=='object')continue;if(x.active===false||String(x.active).toLowerCase()==='false')continue;add(x.auditorEmail||x.email||x.auditor||x.userEmail);}}catch{raw.split(/[;,|\n]/).forEach(add)}
  return out;
}
function activeRoleEmails(values,role){if(!values.length)return[];const h=values[0],e=col(h,['E-mail','Email','E-mail address','Mail']),r=col(h,['Role','Function']),a=col(h,['Active','Is active']);const wanted=clean(role).toLowerCase(),out=[];for(const row of values.slice(1)){if(clean(row[r]).toLowerCase()!==wanted)continue;if(a>=0&&!yes(row[a]))continue;const email=val(row,e).toLowerCase();if(email&&!out.includes(email))out.push(email);}return out;}
function canonicalManagerRecipient(values){const emails=activeRoleEmails(values,'Manager');if(emails.length)return emails[0];throw new Error('MANAGER_APPROVAL_RECIPIENT_MISSING');}
function candidates(audValues,catalog,required,pre){
  if(!audValues.length)return[];
  const h=audValues[0],n=col(h,['Name','Auditor','Auditor name']),e=col(h,['E-mail','Email','E-mail address','Mail']),a=col(h,['Active','Is active']),r=col(h,['Role','Function']),bw=col(h,['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
  const aliases=new Map();
  for(const s of catalog){
    const canonical=key(s.displayName||s.scopeCode||s.slotKey);
    for(const k of [s.displayName,s.slotKey,s.scopeCode])if(k)aliases.set(key(k),canonical);
  }
  return audValues.slice(1)
    .filter(row=>yes(row[a])&&clean(row[r]).toLowerCase()==='auditor')
    .filter(row=>required.every(sc=>{
      const canon=aliases.get(key(sc))||key(sc);
      for(let i=0;i<h.length;i++){
        const headerCanon=aliases.get(key(h[i]))||key(h[i]);
        if(headerCanon===canon)return yes(row[i]);
      }
      return false;
    }))
    .map(row=>({email:val(row,e).toLowerCase(),name:val(row,n),blockedWeekdays:val(row,bw),isPreassigned:[val(row,e).toLowerCase(),val(row,n).toLowerCase()].includes(clean(pre).toLowerCase()),rotationState:'DEFERRED',rotationWarning:null,performedCount:null,maxAllowed:null}))
    .filter(x=>x.email)
    .sort((x,y)=>{if(x.isPreassigned!==y.isPreassigned)return x.isPreassigned?-1:1;return clean(x.name||x.email).localeCompare(clean(y.name||y.email));});
}

function auditContext(values,catalog){
  const by={};if(!values.length)return by;
  const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),cc=col(h,['Company']),cs=col(h,['Status']);
  if(ci<0)return by;
  for(const row of values.slice(1)){const id=val(row,ci);if(id)by[id]={company:val(row,cc),status:val(row,cs),scopes:scopesForAudit({h,row},catalog)};}
  return by;
}

function companyPlanningContext(values,companyUid,companyName){
  const out={preferredAuditMonths:'',locations:[],number:'',group:'',region:'',country:'',contactName:'',contactEmail:'',contactPhone:'',timeZone:'',comments:'',auditorComments:'',blockedWeekdays:'',preferredTimeWindow:''};if(!values.length)return out;
  const h=values[0],cu=col(h,['Company_UID','Company UID','UID']),cn=col(h,['Company']),cl=col(h,['Location']),cg=col(h,['GPS-data','GPS data','GPS','gps_data']),cj=col(h,['Locations_JSON','Locations JSON','locations_json']),cp=col(h,['Preferred audit months','Preferred audit period','Preferred_Audit_Months','preferred_audit_months','Preferred audit period/months','Preferred audit periode','Preferred months']),cnum=col(h,['Number','Company number']),cgrp=col(h,['Group']),creg=col(h,['Region']),ccountry=col(h,['Country']),ccn=col(h,['Contactperson','Contact person','Contactperson ']),cce=col(h,['Contactperson e-mail','Contactperson email','Contact email']),ccp=col(h,['Contactperson phone','Contact phone','Telephone']),ctz=col(h,['Time zone','Timezone']),ccom=col(h,['Comments','Company comment','General comments']),cacom=col(h,['Auditor comments','Auditor comment','Comments auditor','Audit comments']),cbd=col(h,['Audit planning limitations - days','Company blocked weekdays']),ctw=col(h,['Audit planning limitations - hours','Company time window']);
  const uid=key(companyUid),name=key(companyName);let best=null,score=-1;
  for(const row of values.slice(1)){const ru=cu>=0?key(row[cu]):'',rn=cn>=0?key(row[cn]):'';let s=-1;if(uid&&ru===uid)s=1000;else if(name&&rn===name)s=600;if(s<0)continue;if(cj>=0&&clean(row[cj]))s+=5;if(cp>=0&&clean(row[cp]))s+=5;if(s>score){score=s;best=row;}}
  if(!best)return out;
  const pick=i=>i>=0?val(best,i):'';out.preferredAuditMonths=pick(cp);out.number=pick(cnum);out.group=pick(cgrp);out.region=pick(creg);out.country=pick(ccountry);out.contactName=pick(ccn);out.contactEmail=pick(cce);out.contactPhone=pick(ccp);out.timeZone=pick(ctz);out.comments=pick(ccom);out.auditorComments=pick(cacom);out.blockedWeekdays=pick(cbd);out.preferredTimeWindow=pick(ctw);
  const fallback=cl>=0?val(best,cl):'HQ',gps=cg>=0?val(best,cg):'',raw=cj>=0?val(best,cj):'';
  function add(o,i){o=o||{};if(o.active===false||String(o.active).toLowerCase()==='false')return;const code=clean(o.code||o.Code||o.locationCode||o.location_code||o.type||o.Type||(i===0?'HQ':String(i+1))),nm=clean(o.location||o.Location||o.name||o.Name||o.label||o.Label||o.address||o.Address||fallback||code),g=clean(o.gps||o.GPS||o.gpsData||o['GPS-data']||o.gps_data||o.coordinates||o.Coordinates||o.latLng||o.latlng||gps),comment=clean(o.comment||o.Comment||o.notes||o.Notes);out.locations.push({code:code||'HQ',name:nm||code||'HQ',gps:g,comment});}
  try{const p=JSON.parse(raw);const arr=Array.isArray(p)?p:(Array.isArray(p?.locations)?p.locations:Array.isArray(p?.Locations)?p.Locations:Array.isArray(p?.items)?p.items:Array.isArray(p?.sites)?p.sites:Array.isArray(p?.points)?p.points:(p&&typeof p==='object'?[p]:[]));arr.forEach(add);}catch{}
  if(!out.locations.length)add({code:'HQ',name:fallback||'HQ',gps},0);return out;
}

function project(f,catalog,audValues){
  const g=n=>val(f.row,col(f.h,n)),pre=g(['Preassigned Auditor','Preassigned auditor']),scopes=scopesForAudit(f,catalog);
  return{
    auditId:g(['Audit ID','Audit_ID','AuditId','Audit Id']),
    company:g(['Company']),
    companyUid:g(['Company_UID','Company UID','CompanyUid']),
    status:g(['Status']),
    planningWindowFrom:g(['Planning window from','Plan van','Planning from']),
    planningWindowTo:g(['Planning window to','Plan tot','Planning to']),
    country:g(['Country']),
    region:g(['Region']),
    assignedTo:g(['Assigned to','Assigned auditor','Auditor']),
    assignedToDisplayName:directAuditorDisplayName(audValues,g(['Assigned to','Assigned auditor','Auditor'])),
    preassignedAuditor:pre,
    preassignedAuditorDisplayName:directAuditorDisplayName(audValues,pre),
    allowSelfPlanning:yes(g(['Allow self planning','Allow Self Planning','Self planning','Self Planning'])),
    managerCommentLast:g(['Manager comment (last)','Manager comment','Last manager comment']),
    auditorCommentLast:g(['Auditor comment (last)','Auditor comment','Last auditor comment']),
    planningJson:g(['Planning JSON','Planning_JSON']),
    sourceRevision:createHash('sha256').update([g(['Audit ID','Audit_ID','AuditId','Audit Id']),g(['Status']),g(['Assigned to','Assigned auditor','Auditor']),g(['Planning JSON','Planning_JSON']),g(['Last decision timestamp']),g(['Status since'])].join('|')).digest('hex').slice(0,24),
    requiredHours:Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.'))||0,
    formalHours:Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.'))||0,
    maxOffsiteHours:maxOffsiteHoursForScopes(catalog,scopes),
    offsitePolicy:offsitePolicyForScopes(catalog,scopes),
    scopes,
    candidateAuditors:candidates(audValues,catalog,scopes,pre),
    sourceRow:f.sourceRow
  };
}

function dateOnly(v){const s=clean(v);const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}

function availabilityProjection(values,candidates,from,to,context){
  const identities=(candidates||[]).map(x=>({email:clean(x.email).toLowerCase(),name:key(x.name)})),set=new Set(identities.map(x=>x.email)),by={};
  if(!values.length)return by;
  const h=values[0],cd=col(h,['Date']),ci=col(h,['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name','Auditor']),ca=col(h,['Available']),s1=col(h,['First_Audit_Start_Time','First Audit Start Time']),e1=col(h,['First_Audit_End_Time','First Audit End Time']),id1=col(h,['Audit_ID_1','Audit ID 1','AuditId1']),s2=col(h,['Second_Audit_Start_Time','Second Audit Start Time']),e2=col(h,['Second_Audit_End_Time','Second Audit End Time']),id2=col(h,['Audit_ID_2','Audit ID 2','AuditId2']),st1=col(h,['Status_1','Status 1','Status','Source']),st2=col(h,['Status_2','Status 2']);
  for(const row of values.slice(1)){
    const rawIdentity=ci>=0?val(row,ci):'';let em=clean(rawIdentity).toLowerCase();
    if(!set.has(em)){const nm=key(rawIdentity),hit=identities.find(x=>x.name===nm);if(hit)em=hit.email;}
    const d=dateOnly(row[cd]);if(!set.has(em)||!d||d<from||d>to)continue;
    const slots=[];
    for(const x of [[s1,e1,id1,st1],[s2,e2,id2,st2]]){const auditRef=val(row,x[2]),rawStatus=val(row,x[3]),ctx=auditRef&&context[auditRef]?context[auditRef]:{},status=ctx.status||rawStatus,statusKey=clean(status).toUpperCase(),soft=!auditRef&&(statusKey==='SYSTEM_DEFAULT'||statusKey==='USER_MANUAL'||statusKey==='CALENDAR'||statusKey==='CALENDER'||statusKey.startsWith('DEFAULT_')||statusKey.startsWith('MANUAL_')),z={start:val(row,x[0]),end:val(row,x[1]),auditId:auditRef,auditRef,status,kind:auditRef?'audit':soft?'soft':'hard',company:ctx.company||'',scopes:Array.isArray(ctx.scopes)?ctx.scopes:[]};if(z.auditRef||z.start||z.end||z.status)slots.push(z);}
    const state=yes(row[ca])?'YES':(clean(row[ca])?'NO':''),hasAudit=slots.some(z=>z.kind==='audit'),hasSoft=slots.some(z=>z.kind==='soft'),visualState=hasAudit?'OCCUPIED':state==='NO'?(hasSoft?'SOFT_UNAVAILABLE':'HARD_BLOCKED'):'AVAILABLE';if(!by[em])by[em]=[];by[em].push({date:d,auditorEmail:em,available:val(row,ca),state,visualState,slots});
  }
  return by;
}

function blocks(raw){if(Array.isArray(raw))return raw;try{const p=JSON.parse(clean(raw));return Array.isArray(p)?p:(Array.isArray(p?.blocks)?p.blocks:[]);}catch{return[];}}
function reservationProjection(values,emails,from,to,auditContext){
  const set=new Set(emails.map(x=>clean(x).toLowerCase())),rows=[],staleRows=[];auditContext=auditContext||{};
  if(!values.length)return{rows,byAuditorEmail:{},byAuditId:{},staleRows:[]};
  const h=values[0],ci=col(h,['Audit ID','Audit_ID']),cr=col(h,['Reservation ID','Reservation_ID']),ce=col(h,['Auditor Email','Auditor_Email']),cn=col(h,['Auditor Name','Auditor_Name']),cb=col(h,['Blocks JSON','Blocks_JSON','Blocks']),cs=col(h,['State']),cv=col(h,['Source Revision','Source_Revision']),cc=col(h,['Created At','Created_At']),cu=col(h,['Updated At','Updated_At']);
  for(const row of values.slice(1)){
    const em=val(row,ce).toLowerCase();
    if(clean(row[cs]).toUpperCase()!=='ACTIVE'||!set.has(em))continue;
    const b=blocks(row[cb]);
    if(!b.some(x=>{const d=dateOnly(x?.date);return d&&d>=from&&d<=to;}))continue;
    const auditId=val(row,ci),canonical=auditContext[auditId]||{},normalized=clean(canonical.status).toUpperCase().replace(/[\s-]+/g,'_'),item={auditId,reservationId:val(row,cr),auditorEmail:em,auditorName:val(row,cn),blocks:b,state:'ACTIVE',company:clean(canonical.company),scopes:Array.isArray(canonical.scopes)?canonical.scopes:[],sourceRevision:val(row,cv),createdAt:val(row,cc),updatedAt:val(row,cu),canonicalStatus:clean(canonical.status),canonicalStatusNormalized:normalized,lifecycleCurrent:normalized==='PENDING_PLANNING'};if(!item.lifecycleCurrent){item.state='STALE';item.lifecycleReason=!auditId||!canonical.status?'CANONICAL_AUDIT_OR_STATUS_MISSING':'CANONICAL_STATUS_'+normalized;staleRows.push(item);continue;}item.lifecycleReason='PENDING_PLANNING';rows.push(item);
  }
  const byAuditorEmail={},byAuditId={};
  for(const x of rows){(byAuditorEmail[x.auditorEmail]??=[]).push(x);if(x.auditId)byAuditId[x.auditId]=x;}
  return{rows,byAuditorEmail,byAuditId,staleRows};
}

function managerCompanyGridMeta(companyValues){
  const out=new Map();
  if(!companyValues?.length)return out;
  const h=companyValues[0];
  const uid=col(h,['Company_UID','Company UID','CompanyUid']);
  const cn=col(h,['Company']);
  const loc=col(h,['Location']);
  const reg=col(h,['Region']);
  const gps=col(h,['GPS-data','GPS data','GPS','GPS HQ','HQ GPS']);
  const json=col(h,['Locations_JSON','Locations JSON','locations_json']);
  const locs=col(h,['Locations_to_plan','Locations to plan','Locs']);
  for(const row of companyValues.slice(1)){
    const company=val(row,cn),companyUid=val(row,uid),companyLocation=val(row,loc),region=val(row,reg);
    let activeLocations=0,hqGps='';
    const rawJson=val(row,json);
    if(rawJson){
      try{
        const parsed=JSON.parse(rawJson);
        const arr=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.locations)?parsed.locations:[]);
        for(const x of arr){
          if(!x||x.active===false||String(x.active).toLowerCase()==='false')continue;
          activeLocations++;
          const code=clean(x.code||x.Code||x.locationCode||x.location_code).toUpperCase();
          const g=clean(x.gps||x.GPS||x.gpsData||x['GPS-data']||x.gps_data||x.coordinates||x.latLng||x.latlng);
          if(!hqGps&&code==='HQ')hqGps=g;
        }
      }catch{}
    }
    if(!(activeLocations>0)){
      const n=Number(val(row,locs));
      activeLocations=Number.isFinite(n)&&n>0?Math.round(n):1;
    }
    if(!hqGps)hqGps=val(row,gps);
    const meta={region,activeLocations,hqGps};
    for(const k of [companyUid,company+'|'+companyLocation,company])if(k&&!out.has(key(k)))out.set(key(k),meta);
  }
  return out;
}

function extensionLinkedAuditIds(obValues,linkValues){
  const out=new Set();if(!obValues?.length||!linkValues?.length)return out;
  const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),os=col(oh,['Obligation_State','Obligation State']),activeOb=new Set();
  for(const r of obValues.slice(1)){const id=val(r,oi),state=val(r,os).toUpperCase();if(id&&!['COMPLETED','CANCELLED','REJECTED'].includes(state))activeOb.add(id);}
  const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);
  for(const r of linkValues.slice(1)){const auditId=val(r,la),obId=val(r,lo);if(auditId&&val(r,ls).toUpperCase()==='ACTIVE'&&activeOb.has(obId))out.add(auditId);}
  return out;
}
function extensionMonthsForScopes(catalog,scopes){
  const wanted=new Set((scopes||[]).map(key)),values=[];
  for(const def of catalog||[])if([def.displayName,def.scopeCode,def.slotKey].some(x=>wanted.has(key(x)))&&Number(def.extensionMonths||0)>0)values.push(Number(def.extensionMonths));
  return values.length?Math.min(...values):0;
}

function managerOpen(apValues,email,scopeValues,companyValues,audValues){
  if(!apValues.length)return{success:true,view:'open',rows:[],managerEmail:email,counts:{total:0,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0}};
  const h=apValues[0],idx=n=>col(h,n),ci=idx(['Audit ID','Audit_ID','AuditId','Audit Id']),cs=idx(['Status']),cc=idx(['Company']),cl=idx(['Location']),ca=idx(['Assigned to','Assigned auditor','Auditor']),cp=idx(['Preassigned Auditor']),cself=idx(['Allow self planning']),ch=idx(['Total audit time in hours']),cph=idx(['Hours planned']),cd=idx(['Date planned','Date - Planned']),cm=idx(['Manager email']),cf=idx(['Planning window from']),ct=idx(['Planning window to']),cu=idx(['Company UID']),ce=idx(['Date - Will Expire','Date will expire','Expiration date']),cee=idx(['Extended Expiration Date']),cex=idx(['Extension Applied']),cpj=idx(['Planning JSON','Planning_JSON']),cldt=idx(['Last decision timestamp']),css=idx(['Status since']),ccomment=idx(['Manager comment (last)']),cdecision=idx(['Last manager decision']);
  const catalog=scopeCatalog(scopeValues||[]),companyIndex=managerCompanyGridMeta(companyValues||[]);
  const allowed=new Set(['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED']),rows=[];
  for(const row of apValues.slice(1)){
    const id=val(row,ci);if(!id)continue;const raw=val(row,cs),statusKey=clean(raw).toUpperCase().replace(/[\s-]+/g,'_');if(!allowed.has(statusKey))continue;
    const rowMgr=val(row,cm).toLowerCase();if(email&&rowMgr&&rowMgr!==email)continue;
    const company=val(row,cc),location=val(row,cl),uid=val(row,cu),companyMeta=companyIndex.get(key(uid))||companyIndex.get(key(company+'|'+location))||companyIndex.get(key(company))||{},region=companyMeta.region||'',from=dateOnly(row[cf]),to=dateOnly(row[ct]),pw=from&&to?from+' → '+to:(from||to||''),required=Number(row[ch]),scopes=scopesForAudit({h,row},catalog),expiry=dateOnly(row[cee])||dateOnly(row[ce]),ext=val(row,cex),activeLocations=Number(companyMeta.activeLocations||1),hqGps=clean(companyMeta.hqGps);
    const actions=statusKey==='PENDING_PLANNING'?['PLAN','REJECT']:statusKey==='PENDING_APPROVAL'?['APPROVE','CANCEL','REJECT']:statusKey==='APPROVED'?['ACCEPT','CANCEL','REJECT']:statusKey==='ACCEPTED'?['COMPLETE','CANCEL','REJECT']:[];rows.push({auditId:id,source:'Audit planning',company,companyLocation:location,location,locs:activeLocations,locationsToPlan:activeLocations,locationCount:activeLocations,gps:hqGps,gpsData:hqGps,region,companyRegion:region,scopes,scopesText:scopes.join(', '),status:raw,statusKey,planningWindow:pw,planningWindowText:pw,planningWindowFrom:from,planningWindowTo:to,planningDisplay:statusKey==='PENDING_PLANNING'?pw:dateOnly(row[cd]),plannedHours:val(row,cph),hoursPlanned:val(row,cph),requiredHours:Number.isFinite(required)?required:0,formalHours:Number.isFinite(required)?required:0,maxOffsiteHours:maxOffsiteHoursForScopes(catalog,scopes),offsitePolicy:offsitePolicyForScopes(catalog,scopes),toBePlanned:Number.isFinite(required)?required:0,auditor:val(row,ca),assignedTo:val(row,ca),assignedToEmail:val(row,ca),assignedToDisplayName:directAuditorDisplayName(audValues,val(row,ca)),preassignedAuditor:val(row,cp),preassignedAuditorDisplayName:directAuditorDisplayName(audValues,val(row,cp)),allowSelfPlanning:yes(val(row,cself)),datePlanned:dateOnly(row[cd]),planningJson:val(row,cpj),expirationDate:expiry,extensionApplied:yes(ext),companyUid:uid,managerEmail:rowMgr,sourceRevision:createHash('sha256').update([id,raw,val(row,ca),val(row,cpj),val(row,cldt),val(row,css)].join('|')).digest('hex').slice(0,24),latestComment:val(row,ccomment),latestCommentActor:'Manager',latestCommentAction:val(row,cdecision),latestCommentTimestamp:val(row,cldt),sourceRow:apValues.indexOf(row)+1,allowedActions:actions,readOnly:false,needsEnrichment:false});
  }
  const order={PENDING_PLANNING:0,PENDING_APPROVAL:1,APPROVED:2,ACCEPTED:3};rows.sort((a,b)=>(order[a.statusKey]-order[b.statusKey])||a.planningWindow.localeCompare(b.planningWindow)||a.company.localeCompare(b.company)||a.auditId.localeCompare(b.auditId));
  const count=k=>rows.filter(x=>x.statusKey===k).length;
  return{success:true,view:'open',fastFirstPaint:false,enrichmentAvailable:true,managerEmail:email,rows,counts:{total:rows.length,pendingPlanning:count('PENDING_PLANNING'),pendingApproval:count('PENDING_APPROVAL'),approved:count('APPROVED'),accepted:count('ACCEPTED')}};
}
async function managerOpenRead(email){const t=Date.now(),actorEmail=clean(email).toLowerCase(),vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Config_Scopes!A1:Z128','Companies!A1:AZ1024','Auditors!A1:Z256']),aud=vr[3]?.values||[],catalog=scopeCatalog(vr[1]?.values||[]);const out=managerOpen(vr[0]?.values||[],actorEmail,vr[1]?.values||[],vr[2]?.values||[],aud);for(const row of out.rows||[]){const months=extensionMonthsForScopes(catalog,row.scopes||[]);row.extensionMonths=months;row.extMonths=months;row.canExtend=null;}out.fastFirstPaint=true;out.actorDisplayName=directAuditorDisplayName(aud,actorEmail);out.build=BUILD;out.serverMs=Date.now()-t;return out;}

function actorAllowedActions(c){
  const out=[];if(c?.canPlan)out.push('PLAN');if(c?.canApprove)out.push('APPROVE');if(c?.canAccept||c?.canAcceptOnBehalf)out.push('ACCEPT');if(c?.canComplete)out.push('COMPLETE');if(c?.canCancel)out.push('CANCEL');return out;
}
async function auditorOpenRead(email){
  const t=Date.now(),actorEmail=clean(email).toLowerCase();
  const versioned=process.env.AMS_AUDITOR_UID_ROTATION_READ_ENABLED==='true',ranges=['Audit planning!A1:BW2000','Config_Scopes!A1:Z128','Companies!A1:AZ1024','Auditors!A1:AZ256','Log realized audits!A1:AZ2048'];
  if(versioned)ranges.push('Auditor_Identity_Versions!A1:P2000');
  const vr=await sheetsBatchGet(ranges);
  const ap=vr[0]?.values||[],scv=vr[1]?.values||[],companies=vr[2]?.values||[],aud=vr[3]?.values||[],log=vr[4]?.values||[],catalog=scopeCatalog(scv),versions=versioned?rotationIdentityVersions(vr[5]?.values||[]):null,identityMap=versioned?rotationAuditorMap(aud,versions):null,actorUid=identityMap?rotationResolveAuditor(identityMap,actorEmail):null;
  const base=managerOpen(ap,'',scv,companies,aud),rows=[];
  for(const row of base.rows||[]){
    const resolveAssignment=raw=>{if(!identityMap)return directResolveAuditorEmail(aud,raw);if(!clean(raw))return'';const uid=rotationResolveAuditor(identityMap,raw);const current=identityMap.byUid.get(uid)?.email;if(!current)throw Error('AUDITOR_ASSIGNMENT_IDENTITY_UNRESOLVED');return current;};
    const assigned=resolveAssignment(row.assignedTo),preassigned=resolveAssignment(row.preassignedAuditor);
    let hardEligible=false,eligibilityConflictReason='';
    const pending=row.statusKey==='PENDING_PLANNING',selfPlanningAllowed=yes(row.allowSelfPlanning),ownAssigned=!!assigned&&assigned===actorEmail,ownPreassigned=!!preassigned&&preassigned===actorEmail,selfPoolCandidate=pending&&selfPlanningAllowed&&!assigned&&!preassigned;
    if(pending&&selfPlanningAllowed&&(ownAssigned||ownPreassigned||selfPoolCandidate)){
      const hard=v211AssignmentHardCheck({auditorEmail:actorEmail,auditorValues:aud,catalog,scopeCodes:row.scopes||[],companyValues:companies,companyUid:row.companyUid,companyName:row.company,logValues:log,requestedDates:[]});
      const minDate=hard.minInterval?.minPlanningDate||'',windowTo=dateOnly(row.planningWindowTo);
      if(!hard.ok)eligibilityConflictReason=(hard.reasons||[]).join('; ')||'AUDITOR_HARD_ELIGIBILITY_BLOCKED';
      else if(minDate&&windowTo&&windowTo<minDate)eligibilityConflictReason='MINIMUM_INTERVAL_OUTSIDE_PLANNING_WINDOW';
      else{
        const rotation=v211RotationHardCheck(rotationReadFromLoaded(row.auditId,actorEmail,ap,aud,scv,log,versions));
        hardEligible=rotation.ok;
        if(!rotation.ok)eligibilityConflictReason=(rotation.reasons||[]).join('; ')||'ROTATION_BLOCKED';
      }
    }
    const actor=v211ActorCapabilities({actorRole:'Auditor',actorEmail,status:row.status,assignedToEmail:assigned,preassignedToEmail:preassigned,allowSelfPlanning:yes(row.allowSelfPlanning),hardEligible});
    if(!actor.visible)continue;
    rows.push({...row,actorMode:'AUDITOR',selfPlanningPool:actor.selfPlanningPool,preassignmentConflict:actor.preassignmentConflict,eligibilityConflictReason:actor.preassignmentConflict?eligibilityConflictReason:'',capabilities:actor.capabilities,allowedActions:actorAllowedActions(actor.capabilities),assignedToEmail:assigned||'',preassignedToEmail:preassigned||''});
  }
  const count=k=>rows.filter(x=>x.statusKey===k).length;
  return{success:true,view:'open',actorRole:'Auditor',actorEmail,actorDisplayName:directAuditorDisplayName(aud,actorEmail),rows,counts:{total:rows.length,pendingPlanning:count('PENDING_PLANNING'),pendingApproval:count('PENDING_APPROVAL'),approved:count('APPROVED'),accepted:count('ACCEPTED')},build:BUILD,serverMs:Date.now()-t};
}


function managerArchived(logValues,email,scopeValues,companyValues,audValues){
  const rows=[];if(!logValues.length)return{success:true,view:'archived',rows};
  const h=logValues[0],ci=col(h,['Audit ID','Audit_ID','AuditId']),cs=col(h,['Status']),cc=col(h,['Company']),cl=col(h,['Location']),ca=col(h,['Auditor','Auditor Email','Email']),cd=col(h,['Date planned']),chp=col(h,['Hours planned']),chd=col(h,['Hours dedicated']),ccd=col(h,['Date completed']),cm=col(h,['Manager email']),cu=col(h,['Company UID']),csl=col(h,['Scopes list','Scopes','Scope']),scopeCat=scopeCatalog(scopeValues||[]),companyIndex=new Map();
  if(companyValues?.length){const hh=companyValues[0],uid=col(hh,['Company_UID','Company UID','CompanyUid']),cn=col(hh,['Company']),loc=col(hh,['Location']),reg=col(hh,['Region']);for(const r of companyValues.slice(1)){const region=val(r,reg);if(!region)continue;for(const k of [val(r,uid),val(r,cn)+'|'+val(r,loc),val(r,cn)])if(k&&!companyIndex.has(key(k)))companyIndex.set(key(k),region);}}
  for(let n=1;n<logValues.length;n++){const r=logValues[n],status=(val(r,cs)||'Completed'),sn=status.toUpperCase().replace(/[\s-]+/g,'_');if(sn!=='COMPLETED')continue;const mgr=val(r,cm).toLowerCase();const company=val(r,cc);if(!company&&!val(r,ci))continue;const location=val(r,cl),uid=val(r,cu);let scopes=scopesForAudit({h,row:r},scopeCat);if(!scopes.length&&csl>=0){scopes=val(r,csl).split(/[,;|]/).map(clean).filter(Boolean);}rows.push({auditId:val(r,ci)||('LOGROW_'+(n+1)),source:'Log realized audits',company,location,region:companyIndex.get(key(uid))||companyIndex.get(key(company+'|'+location))||companyIndex.get(key(company))||'',scopes,scopesText:scopes.join(', '),executedOn:dateOnly(r[cd]),auditor:val(r,ca),auditorDisplayName:directAuditorDisplayName(audValues,val(r,ca)),hoursPlanned:Number(r[chp])||0,hoursDedicated:Number(r[chd])||0,completedDate:dateOnly(r[ccd]),status:'Completed',statusKey:'COMPLETED',managerEmail:mgr,companyUid:uid,readOnly:true});}
  rows.sort((a,b)=>(b.completedDate||b.executedOn||'').localeCompare(a.completedDate||a.executedOn||'')||a.company.localeCompare(b.company)||a.auditId.localeCompare(b.auditId));return{success:true,view:'archived',rows};
}
async function managerArchivedRead(email){const t=Date.now(),vr=await sheetsBatchGet(['Log realized audits!A1:AZ2048','Config_Scopes!A1:Z128','Companies!A1:AZ1024','Auditors!A1:Z256']);const out=managerArchived(vr[0]?.values||[],clean(email).toLowerCase(),vr[1]?.values||[],vr[2]?.values||[],vr[3]?.values||[]);out.build=BUILD;out.serverMs=Date.now()-t;return out;}

async function auditorArchivedRead(email){
  const t=Date.now(),actorEmail=clean(email).toLowerCase(),versioned=process.env.AMS_AUDITOR_UID_ROTATION_READ_ENABLED==='true',ranges=['Log realized audits!A1:AZ2048','Config_Scopes!A1:Z128','Companies!A1:AZ1024','Auditors!A1:AZ256'];
  if(versioned)ranges.push('Auditor_Identity_Versions!A1:P2000');
  const vr=await sheetsBatchGet(ranges),aud=vr[3]?.values||[],out=managerArchived(vr[0]?.values||[],'',vr[1]?.values||[],vr[2]?.values||[],aud);
  const identityMap=versioned?rotationAuditorMap(aud,rotationIdentityVersions(vr[4]?.values||[])):null;
  const actorUid=identityMap?rotationResolveAuditor(identityMap,actorEmail):null;
  out.rows=(out.rows||[]).filter(r=>identityMap?rotationResolveAuditor(identityMap,r.auditor)===actorUid:directResolveAuditorEmail(aud,r.auditor)===actorEmail).map(r=>({...r,actorMode:'AUDITOR'}));
  out.actorRole='Auditor';out.actorEmail=actorEmail;out.build=BUILD;out.serverMs=Date.now()-t;return out;
}

function rotationLooseKey(v){return key(v).replace(/\s+/g,'').replace(/tracecert/g,'tracecert').replace(/tracecert/g,'tracecert').replace(/tracert/g,'tracecert')}
function rotationAliasMeta(scopeValues){
  const meta={byAny:new Map(),byLoose:new Map(),maxByScope:new Map()};if(!scopeValues?.length)return meta;
  const h=scopeValues[0],slot=col(h,['SlotKey','Slot key','Slot']),code=col(h,['ScopeCode','Scope code','Code']),name=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),max=col(h,['Max number audits','Max number audit','Max audits','Max audit','Maximum audits','Max consecutive','MaxConsecutive']);
  const aliasCols=h.map((x,i)=>({i,k:key(x)})).filter(x=>x.k.includes('alias')||x.k.includes('aliases')||x.k.includes('alternative')||x.k.includes('alternatives')||x.k.includes('typo')||x.k.includes('synonym')||x.k.includes('synonyms')).map(x=>x.i);
  for(const r of scopeValues.slice(1)){const canonical=val(r,name)||val(r,code)||val(r,slot);if(!canonical)continue;for(const raw of [canonical,val(r,slot),val(r,code),val(r,name),...aliasCols.flatMap(i=>val(r,i).split(/[;,|]/))]){if(!raw)continue;meta.byAny.set(key(raw),canonical);meta.byLoose.set(rotationLooseKey(raw),canonical)}const mx=max>=0?parseInt(r[max],10):NaN;if(Number.isFinite(mx))meta.maxByScope.set(canonical,mx);}
  return meta;
}
function rotationCanonical(meta,raw){return meta.byAny.get(key(raw))||meta.byLoose.get(rotationLooseKey(raw))||clean(raw)}
function rotationAuditorMap(audValues,identityVersions=null){
  const out={byName:new Map(),byEmail:new Map(),byUid:new Map(),identityIndex:null};
  if(!audValues?.length){if(identityVersions!==null)throw Error('ROTATION_AUDITORS_MISSING');return out;}
  const h=audValues[0],n=col(h,['Name','Auditor','Auditor name']),e=col(h,['E-mail','Email','E-mail address','Mail']),u=col(h,['Auditor_UID','Auditor UID']);
  const auditorRows=[];
  for(const r of audValues.slice(1)){
    const email=val(r,e).toLowerCase(),name=val(r,n).toLowerCase(),uid=val(r,u);
    if(!email)continue;
    const identity={email,name:val(r,n),uid:uid||''};
    if(out.byEmail.has(email))throw Error('ROTATION_DUPLICATE_AUDITOR_EMAIL');
    out.byEmail.set(email,identity);
    if(name){if(out.byName.has(name))out.byName.set(name,null);else out.byName.set(name,identity)}
    if(uid){if(out.byUid.has(uid))throw Error('ROTATION_DUPLICATE_AUDITOR_UID');out.byUid.set(uid,identity)}
    auditorRows.push({uid,email,name:val(r,n)});
  }
  if(identityVersions!==null){
    if(u<0)throw Error('ROTATION_UID_SCHEMA_REQUIRED');
    out.identityIndex=buildAuditorIdentityIndex(auditorRows,identityVersions);
  }
  return out;
}
function rotationResolveAuditor(map,raw){
  const v=clean(raw).toLowerCase();if(!v)return'';
  if(map.identityIndex){
    const uid=resolveAuditorUid(map.identityIndex,v);
    if(uid)return uid;
    if(v.includes('@'))throw Error('ROTATION_UNRESOLVED_HISTORICAL_EMAIL');
    if(map.byUid.has(clean(raw)))return clean(raw);
    throw Error('ROTATION_NONCANONICAL_AUDITOR_REFERENCE');
  }
  const a=map.byEmail.get(v)||map.byName.get(v);
  return a?(a.uid||a.email):v;
}
function rotationIdentityVersions(values){
  if(!values?.length)throw Error('ROTATION_IDENTITY_VERSIONS_MISSING');
  const h=values[0],u=col(h,['Auditor_UID','Auditor UID']),e=col(h,['Email_Normalized','Email','E-mail']),f=col(h,['Valid_From_UTC','Valid from UTC']),t=col(h,['Valid_To_UTC','Valid to UTC']),st=col(h,['State','Status']);
  if([u,e,f,t,st].some(x=>x<0))throw Error('ROTATION_IDENTITY_VERSIONS_SCHEMA_INVALID');
  return values.slice(1).filter(r=>val(r,u)||val(r,e)).map(r=>({uid:val(r,u),email:val(r,e),validFrom:val(r,f),validTo:val(r,t),state:val(r,st)}));
}
function rotationScopeCols(headers,meta){let da=-1,hp=-1;headers.forEach((x,i)=>{const k=key(x);if(k==='date_approved'||k==='date approved')da=i;if(k==='hours_planned'||k==='hours planned')hp=i});const out=[];if(da>=0&&hp>da+1){for(let i=da+1;i<hp;i++){const sc=rotationCanonical(meta,headers[i]);if(sc)out.push({i,scope:sc})}if(out.length)return out}for(let i=0;i<headers.length;i++){const raw=clean(headers[i]);if(/^SCOPE_\d+$/i.test(raw)){const sc=rotationCanonical(meta,raw);if(sc)out.push({i,scope:sc})}}if(out.length)return out;const one=col(headers,['Scope','Scopes','SCOPE','STANDARD','Standards']);return one>=0?[{i:one,single:true}]:[]}
function rotationYear(v){if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.getFullYear();const m=clean(v).match(/^(\d{4})[-\/]/);return m?Number(m[1]):null}
function rotationConsecutive(ownersByYear,auditor,maxYearExclusive){const years=Object.keys(ownersByYear).map(Number).filter(y=>Number.isFinite(y)&&(!maxYearExclusive||y<maxYearExclusive)).sort((a,b)=>b-a);let count=0;for(const y of years){const owners=ownersByYear[y]||{};if(!owners[auditor])break;count++;if(Object.keys(owners).some(x=>x!==auditor))return count}return count}
function rotationReadFromLoaded(auditId,auditorEmail,ap,aud,scv,log,identityVersions=null){
  const t=Date.now(),f=findAudit(ap,auditId);
  if(!f)return{success:false,error:'AUDIT_NOT_FOUND'};
  const meta=rotationAliasMeta(scv),catalog=scopeCatalog(scv),required=[...new Set(scopesForAudit(f,catalog).map(x=>rotationCanonical(meta,x)).filter(Boolean))],uid=val(f.row,col(f.h,['Company_UID','Company UID','CompanyUid'])),company=val(f.row,col(f.h,['Company'])),yearRaw=val(f.row,col(f.h,['Year','YEAR'])),currentYear=parseInt(yearRaw,10)||new Date().getFullYear(),audMap=rotationAuditorMap(aud,identityVersions),target=rotationResolveAuditor(audMap,auditorEmail),targetAud=audMap.byUid.get(target)||audMap.byEmail.get(clean(auditorEmail).toLowerCase())||audMap.byName.get(clean(auditorEmail).toLowerCase())||{email:clean(auditorEmail).toLowerCase(),name:clean(auditorEmail)},ownersByScope={};
  if(log.length){const h=log[0],cu=col(h,['Company_UID','Company UID','CompanyUID','COMPANY_UID']),cc=col(h,['Company','Customer','Bedrijf','COMPANY']),ca=col(h,['Auditor','AUDITOR','Auditor email','AuditorEmail','Auditor_Email','E-mail','Email']),cy=col(h,['Year','YEAR']),cd=col(h,['Date','Audit date','Audit_Date','Completed date','Completion date','Execution date','Executed on']),cs=col(h,['Status','STATUS']),auditorUidCol=col(h,['Auditor_UID','Auditor UID']),scopeCols=rotationScopeCols(h,meta);for(const r of log.slice(1)){const st=val(r,cs).toLowerCase();if(st&&(st.includes('cancel')||st.includes('reject')||st.includes('deny')||(!st.includes('complete')&&!st.includes('realized'))))continue;const ru=val(r,cu),rn=val(r,cc);if(uid){if(ru!==uid&&key(rn)!==key(company))continue}else if(key(rn)!==key(company))continue;const loggedUid=val(r,auditorUidCol),rawOwner=val(r,ca),resolvedOwner=rawOwner?rotationResolveAuditor(audMap,rawOwner):'';if(loggedUid&&!audMap.byUid.has(loggedUid))throw Error('ROTATION_UNKNOWN_AUDITOR_UID');if(loggedUid&&resolvedOwner!==loggedUid&&audMap.identityIndex&&rawOwner)throw Error('ROTATION_AUDITOR_UID_EMAIL_CONFLICT');if(loggedUid&&audMap.byEmail.has(val(r,ca).toLowerCase())&&resolvedOwner!==loggedUid)throw Error('ROTATION_AUDITOR_UID_EMAIL_CONFLICT');if(audMap.identityIndex&&!loggedUid&&!resolvedOwner)throw Error('ROTATION_HISTORICAL_AUDITOR_IDENTITY_MISSING');const owner=loggedUid||resolvedOwner,yr=parseInt(val(r,cy),10)||rotationYear(r[cd]);if(!owner||!yr)continue;let scopes=[];if(scopeCols.length===1&&scopeCols[0].single)scopes=val(r,scopeCols[0].i).split(',').map(x=>rotationCanonical(meta,x)).filter(Boolean);else scopes=scopeCols.filter(x=>yes(r[x.i])).map(x=>x.scope);for(const sc of scopes){if(!required.includes(sc))continue;(ownersByScope[sc]??={});(ownersByScope[sc][yr]??={})[owner]=true}}}
  const rotationByScope={},performedByScope={};let performedCount=0,strictestMax=null,soft=false,near=false;for(const sc of required){const pc=rotationConsecutive(ownersByScope[sc]||{},target,currentYear),mx=meta.maxByScope.has(sc)?meta.maxByScope.get(sc):null,at=mx!=null&&mx>0&&pc>=mx,nr=mx!=null&&mx>0&&pc===mx-1;performedByScope[sc]=pc;performedCount=Math.max(performedCount,pc);if(mx!=null)strictestMax=strictestMax==null?mx:Math.min(strictestMax,mx);soft ||= at;near ||= nr;rotationByScope[sc]={performedCount:pc,maxAllowed:mx,atLimit:at,nearLimit:nr}}
  return{success:true,auditId,auditor:{name:targetAud.name||target,email:targetAud.email||target,softBlockRotation:soft,nearRotationLimit:near,hardBlockQualification:false,ineligible:false,performedByScope,rotationByScope,performedCount,maxAllowed:strictestMax,eligibilityOwner:'CloudRun_DirectRotationRead_V211_HARD'},auditorEligibilityMeta:{requiredScopes:required,currentYear,rotationMode:'V211_HARD_ROTATION_MAX'},__serverMs:Date.now()-t,__rotationReadOwner:'CLOUD_RUN_DIRECT_SHEETS'};
}
async function directRotationRead(auditId,auditorEmail){
  const versioned=process.env.AMS_AUDITOR_UID_ROTATION_READ_ENABLED==='true';
  const ranges=['Audit planning!A1:BW2000','Auditors!A1:AZ256','Config_Scopes!A1:Z128','Log realized audits!A1:AZ2048'];
  if(versioned)ranges.push('Auditor_Identity_Versions!A1:P2000');
  const vr=await sheetsBatchGet(ranges);
  return rotationReadFromLoaded(auditId,auditorEmail,vr[0]?.values||[],vr[1]?.values||[],vr[2]?.values||[],vr[3]?.values||[],versioned?rotationIdentityVersions(vr[4]?.values||[]):null);
}

function extAddMonths(iso,n){const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';let t=Number(m[1])*12+Number(m[2])-1+Number(n||0),y=Math.floor(t/12),mo=t-y*12+1,d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo,0)).getUTCDate());return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function extScopes(found,catalog){return(catalog||[]).filter(s=>[s.slotKey,s.scopeCode,s.displayName].some(a=>{const i=col(found.h,[a]);return i>=0&&yes(found.row[i]);}));}
function extWindow(expiry,scopes){let from='',to='';for(const s of scopes){let x=extAddMonths(expiry,s.planningFrom),y=extAddMonths(expiry,s.planningTo);if(!x||!y)continue;if(x>y)[x,y]=[y,x];if(!from||x>from)from=x;if(!to||y<to)to=y;}if(!from||!to||from>to)throw new Error('EXTENSION_PLANNING_WINDOW_INVALID');return{from,to};}
async function sheetsValuesBatchUpdateRaw(data){const preview=lifecyclePreviewContext20.getStore();if(preview){preview.writes.push(...structuredClone(data));return {totalUpdatedCells:0,authorityPreflight:true};}const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchUpdate',r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data})}),body=await r.json();if(!r.ok)throw new Error('SHEETS_BATCH_UPDATE_RAW_'+r.status);return body;}

async function saveScopeCosmetic20(body){
  const field=clean(body?.field),code=clean(body?.scopeCode),value=clean(body?.value);
  if(!['DisplayName','Color','TextColor','SortOrder'].includes(field)||!code)throw Error('FIELD_NOT_ALLOWED');
  if(field==='DisplayName'&&(!value||value.length>100))throw Error('INVALID_NAME');
  if(['Color','TextColor'].includes(field)&&!/^#[0-9a-fA-F]{6}$/.test(value))throw Error('INVALID_COLOR');
  if(field==='Color'||field==='TextColor'){
    const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
    const lum=h=>{const c=rgb(h);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722};
    const values=await sheetsBatchGet(['Config_Scopes!A1:Z128']),rows=values[0]?.values||[],head=(rows[0]||[]).map(clean),ci=head.indexOf('ScopeCode'),colorI=head.indexOf('Color'),textI=head.indexOf('TextColor');
    const matches=rows.slice(1).filter(r=>clean(r[ci])===code);
    if(matches.length!==1||colorI<0||textI<0)throw Error('COLOR_SCHEMA_INVALID');
    const row=matches[0],background=field==='Color'?value:clean(row[colorI]),foreground=field==='TextColor'?value:clean(row[textI]);
    if(/^#[0-9a-fA-F]{6}$/.test(background)&&/^#[0-9a-fA-F]{6}$/.test(foreground)){
      const l1=lum(background),l2=lum(foreground),ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
      if(ratio<4.5)throw Error('COLOR_CONTRAST_TOO_LOW');
    }
  }
  if(field==='SortOrder'&&(!/^[0-9]{1,4}$/.test(value)||Number(value)>9999))throw Error('INVALID_SORT_ORDER');
  const vr=await sheetsBatchGet(['Config_Scopes!A1:Z128']),rows=vr[0]?.values||[],head=(rows[0]||[]).map(clean),ci=head.indexOf('ScopeCode'),fi=head.indexOf(field);
  if(ci<0||fi<0)throw Error('SCOPE_SCHEMA_MISSING');
  const matches=rows.map((r,i)=>({r,i})).filter(x=>x.i>0&&clean(x.r[ci])===code);
  if(matches.length!==1)throw Error('SCOPE_IDENTITY_AMBIGUOUS');
  const item=matches[0],old=String(item.r[fi]??'');
  if(old!==String(body.expected??''))throw Error('STALE_SCOPE_VALUE');
  if(field==='DisplayName'&&rows.some((r,i)=>i>0&&i!==item.i&&clean(r[fi]).toLowerCase()===value.toLowerCase()))throw Error('DUPLICATE_SCOPE_NAME');
  if(old===value)return{ok:true,unchanged:true};
  const letter=String.fromCharCode(65+fi);
  await sheetsValuesBatchUpdateRaw([{range:'Config_Scopes!'+letter+(item.i+1),values:[[field==='SortOrder'?Number(value):value]]}]);
  return{ok:true,scopeCode:code,field,value,previous:old};
}
async function directManagerExtension(identity,body){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  const newObligationSnapshotEnabled=process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_DEV_MODEL_C_NEW_HOURS_SNAPSHOT_ENABLED==='true';
  const t0=Date.now(),auditId=clean(body?.auditId),command=clean(body?.command).toLowerCase();
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!['apply','undo'].includes(command))throw new Error('EXTENSION_COMMAND_NOT_ALLOWED');
  return withDirectManagerActionLock(auditId,async()=>{
    const tr=Date.now();
    const vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Config_Scopes!A1:Z128','Audit_Obligations!A1:Z1024','Audit_Visit_Obligations!A1:Z1024']);
    const readMs=Date.now()-tr,found=findAudit(vr[0]?.values||[],auditId);
    if(!found)throw new Error('AUDIT_NOT_FOUND');
    if(directStatusKey(val(found.row,col(found.h,['Status'])))!=='PENDING_PLANNING')throw new Error('EXTENSION_ALLOWED_ONLY_PENDING_PLANNING');
    const scopes=extScopes(found,scopeCatalog(vr[1]?.values||[]));
    const exts=scopes.map(s=>Number(s.extensionMonths||0)).filter(n=>n>0),months=exts.length?Math.min(...exts):0;
    if(!months)throw new Error('NO_EXTENSION_CONFIGURED_FOR_ACTIVE_SCOPES');
    const expiryY=val(found.row,col(found.h,['Date - Will Expire','Date – Will Expire','Will Expire']));
    if(!extAddMonths(expiryY,0))throw new Error('MISSING_OR_INVALID_ORIGINAL_EXPIRY');
    const applied=command==='apply',expiryZ=applied?extAddMonths(expiryY,months):expiryY,w=extWindow(expiryZ,scopes),now=isoLocalStamp();
    const ob=vr[2]?.values||[],links=vr[3]?.values||[],oh=ob[0]||[],lh=links[0]||[];
    const oid=col(oh,['Obligation_ID','Obligation ID']),ots=col(oh,['Trigger_Source','Trigger Source']),la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);
    if([oid,ots,la,lo,ls].some(i=>i<0))throw new Error('MODEL_C_EXTENSION_SCHEMA_MISSING');
    const linked=new Set();
    for(const r of links.slice(1))if(val(r,la)===auditId&&val(r,ls).toUpperCase()==='ACTIVE')linked.add(val(r,lo));
    const targets=[];
    for(let i=1;i<ob.length;i++)if(linked.has(val(ob[i],oid))&&val(ob[i],ots).toUpperCase()!=='ECAS')targets.push(i+1);
    if(!targets.length)throw new Error('NO_ACTIVE_CERTIFICATE_OBLIGATION_LINKED');
    const data=[],put=(sheet,h,row,names,v)=>{const i=col(h,names);if(i<0)throw new Error('EXTENSION_COLUMN_MISSING_'+names[0]);data.push({range:sheet+'!'+a1col(i+1)+row,values:[[v]]});};
    const meta=JSON.stringify({months,undo:command==='undo',source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',actorEmail:clean(identity?.email).toLowerCase(),timestamp:now});
    for(const rowNo of targets){
      put('Audit_Obligations',oh,rowNo,['Extension_Applied'],applied?'Yes':'');
      put('Audit_Obligations',oh,rowNo,['Extension_Metadata_JSON'],meta);
      put('Audit_Obligations',oh,rowNo,['Effective_Expiry_Date'],expiryZ);
      put('Audit_Obligations',oh,rowNo,['Planning_Window_From'],w.from);
      put('Audit_Obligations',oh,rowNo,['Planning_Window_To'],w.to);
      put('Audit_Obligations',oh,rowNo,['Updated_At'],now);
    }
    put('Audit planning',found.h,found.sourceRow,['Extension applied'],applied?'Yes':'');
    put('Audit planning',found.h,found.sourceRow,['Extended Expiration Date'],expiryZ);
    put('Audit planning',found.h,found.sourceRow,['Planning window from'],w.from);
    put('Audit planning',found.h,found.sourceRow,['Planning window to'],w.to);
    const tw=Date.now();await sheetsValuesBatchUpdateRaw(data);const writeMs=Date.now()-tw;
    const patch={auditId,expiryY,expiryZ,extensionApplied:applied,extApplied:applied,extensionMonths:months,extMonths:months,canExtend:true,planningWindowFrom:w.from,planningWindowTo:w.to,planningWindow:w.from+' → '+w.to,planningWindowText:w.from+' → '+w.to,planningWindowState:'MODEL_C_OBLIGATION_OWNER_DIRECT'};
    return{success:true,auditId,command,owner:'CLOUD_RUN_DIRECT_MODEL_C_EXTENSION',directCommit:true,obligationsUpdated:targets.length,patch,readMs,writeMs,totalMs:Date.now()-t0};
  });
}

async function lifecycleAuthorityPreflight20(identity,body,action,writer){
 const enabled=process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'&&body?.authorityPreflight===true;
 if(!enabled)return writer();
 const capture={writes:[],appends:[],ensureRows:[],deletes:[]};
 return lifecyclePreviewContext20.run(capture,async()=>{
  const outcome=await writer();
  if(capture.deletes.length&& !['REJECT','COMPLETE'].includes(String(action).toUpperCase()))throw Error('LIFECYCLE_ATOMIC_ROW_DELETION_NOT_MIGRATED');
  if(outcome?.success!==true)throw Error('LIFECYCLE_PREFLIGHT_NOT_SUCCESSFUL');
  if(outcome.idempotent===true)return {...outcome,authorityPreflight:true,projectionWrites:[],projectionPreconditions:[],appendIntents:[],idempotent:true};
  if(!capture.writes.length||capture.writes.length>120)throw Error('LIFECYCLE_PREFLIGHT_WRITES_UNSUPPORTED');

  const planning=(await sheetsBatchGet(['Audit planning!A1:BW2000']))[0]?.values||[];
  if(!planning.length||planning.length>=2000)throw Error('LIFECYCLE_PREFLIGHT_PLANNING_INCOMPLETE');
  const auditId=clean(body?.auditId),found=findAudit(planning,auditId);
  if(!found)throw Error('LIFECYCLE_PREFLIGHT_AUDIT_MISSING');
  const row=found.row.slice();
  if(capture.deletes.length){
   if(capture.deletes.length!==1||capture.deletes[0].sheetTitle!=='Audit planning'||capture.deletes[0].rowNumber!==found.sourceRow)throw Error('LIFECYCLE_PREFLIGHT_DELETE_TARGET_UNSUPPORTED');
   const terminal=String(action).toUpperCase()==='REJECT'?'Rejected':'Completed';
   const tombstone=found.row.slice();
   const statusCol=col(found.h,['Status']),assignedCol=col(found.h,['Assigned to','Assigned auditor','Auditor']),uidCol=col(found.h,['Auditor_UID','Auditor UID']);
   if(statusCol<0||assignedCol<0||uidCol<0)throw Error('LIFECYCLE_PREFLIGHT_TOMBSTONE_SCHEMA_MISSING');
   tombstone[statusCol]=terminal;tombstone[assignedCol]='';tombstone[uidCol]='';
   const width=a1col(found.h.length);
   capture.writes.push({range:'Audit planning!A'+found.sourceRow+':'+width+found.sourceRow,values:[tombstone]});
  }
  const normalized=await normalizeLifecycleWriteset({writes:capture.writes,readBefore:sheetsBatchGet});
  const preconditions=normalized.projectionPreconditions;
  capture.writes=normalized.projectionWrites;
  const colNum=letters=>[...letters].reduce((value,ch)=>value*26+ch.charCodeAt(0)-64,0)-1;
  let updated=false;
  for(const write of capture.writes){
   const match=/^Audit planning!([A-Z]+)(\\d+):([A-Z]+)(\\d+)$/.exec(write.range);
   if(!match)continue;
   if(Number(match[2])!==found.sourceRow||Number(match[4])!==found.sourceRow)continue;
   const from=colNum(match[1]),to=colNum(match[3]);
   if(from<0||to<from||to>=found.h.length||write.values[0].length!==to-from+1)throw Error('LIFECYCLE_PREFLIGHT_PLANNING_RANGE_INVALID');
   for(let j=from;j<=to;j++)row[j]=write.values[0][j-from];
   updated=true;
  }
  if(!updated)throw Error('LIFECYCLE_PREFLIGHT_NO_PLANNING_MUTATION');
  const h=found.h,at=names=>val(row,col(h,names));
  return {success:true,authorityPreflight:true,auditId,action:clean(action).toUpperCase(),
   expectedSourceRevision:directRowRevision(h,found.row),
   canonicalSnapshot:{auditId,sourceRow:found.sourceRow,headers:h,row,
    status:at(['Status']),assignedTo:at(['Assigned to','Assigned auditor','Auditor']),
    sourceRevision:directRowRevision(h,row)},
   projectionWrites:capture.writes,projectionPreconditions:preconditions,appendIntents:capture.appends,
   projectionEnsureRows:capture.ensureRows,
   removedSourceRows:capture.deletes,
   successorSnapshots:capture.writes.filter(w=>/^Audit planning!A(\\d+):/.test(w.range)&&Number(/^Audit planning!A(\\d+):/.exec(w.range)[1])>planning.length).map(w=>{
    const rr=w.values[0],nextId=val(rr,col(found.h,['Audit ID']));
    if(!nextId||nextId===auditId)throw Error('LIFECYCLE_PREFLIGHT_SUCCESSOR_ID_INVALID');
    return {auditId:nextId,sourceRow:Number(/^Audit planning!A(\\d+):/.exec(w.range)[1]),headers:found.h,row:rr,status:val(rr,col(found.h,['Status'])),assignedTo:val(rr,col(found.h,['Assigned to'])),sourceRevision:directRowRevision(found.h,rr)};
   }),
   owner:'CLOUD_RUN_DEV_LIFECYCLE_PREFLIGHT'};
 });
}
async function canonicalManagerAction(identity,body){
  const auditId=clean(body?.auditId),managerAction=clean(body?.action).toLowerCase();
  if(!auditId||!['approve','accept','cancel','reject','complete'].includes(managerAction))throw new Error('INVALID_MANAGER_ACTION_REQUEST');
  const options=body?.options&&typeof body.options==='object'?body.options:{};
  if((managerAction==='cancel'||managerAction==='reject')&&!clean(options.reason||options.comment))throw new Error('ACTION_REASON_REQUIRED');
  const canonicalResult=await managerCanonicalWriteBridge20({enabled:process.env.AMS_AUDITOR_DIRECT_ACCEPT_ENABLED!=='true'&&process.env.AMS_MANAGER_CANONICAL_GAS_WRITE_ENABLED==='true'&&['approve','cancel','reject'].includes(managerAction),mode:process.env.AMS_RUNTIME_ENV||'',gasWriteUrl:GAS_WRITE_URL,bridgeKey:WRITE_KEY,auditId,action:managerAction,actorEmail:clean(identity.email).toLowerCase(),options});
  if(canonicalResult)return canonicalResult;
  if(managerAction==='approve')return directManagerApprove(identity,body);
  if(managerAction==='accept')return directManagerAcceptOnBehalf(identity,body);
  if(managerAction==='cancel')return directManagerCancel(identity,body);
  if(managerAction==='reject')return directManagerReject(identity,body);
  if(managerAction==='complete')return directManagerComplete(identity,body);
  if(process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_AUDITOR_DIRECT_ACCEPT_ENABLED==='true')throw new Error('DIRECT_LIFECYCLE_UNSUPPORTED_MANAGER_ACTION');
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('WRITE_BRIDGE_NOT_CONFIGURED');
  const writeUrl=new URL(GAS_WRITE_URL);writeUrl.searchParams.set('action','externalmanageraction');
  const r=await fetch(writeUrl,{method:'POST',headers:{'content-type':'application/json'},redirect:'follow',body:JSON.stringify({bridgeKey:WRITE_KEY,auditId,managerAction,actorEmail:clean(identity.email).toLowerCase(),options})});
  const raw=await r.text();let out;try{out=JSON.parse(raw)}catch{throw new Error('WRITE_BRIDGE_NON_JSON_'+r.status)}
  if(!r.ok)throw new Error('WRITE_BRIDGE_HTTP_'+r.status);return out;
}

const DIRECT_MANAGER_ACTION_LOCKS=new Map();
async function withDirectManagerActionLock(auditId,fn){
  const key='MANAGER_ACTION|'+clean(auditId),prev=DIRECT_MANAGER_ACTION_LOCKS.get(key)||Promise.resolve();let release;
  const gate=new Promise(r=>release=r),chain=prev.then(()=>gate);DIRECT_MANAGER_ACTION_LOCKS.set(key,chain);await prev;
  try{
    // When direct Auditor Accept is enabled, ALL direct Manager lifecycle paths
    // that already use this mutex must share a cross-instance Firestore fence.
    if(process.env.AMS_RUNTIME_ENV==='DEV' && process.env.AMS_AUDITOR_DIRECT_ACCEPT_ENABLED==='true')
      return await withDevLifecycleFirestoreLock20(auditId,fn);
    return await fn();
  }finally{release();if(DIRECT_MANAGER_ACTION_LOCKS.get(key)===chain)DIRECT_MANAGER_ACTION_LOCKS.delete(key);}
}
async function withDevLifecycleFirestoreLock20(auditId,fn){
  if(!clean(auditId)||typeof fn!=='function')throw Error('LIFECYCLE_LOCK_AUDIT_REQUIRED');
  if(process.env.AMS_RUNTIME_ENV!=='DEV'||SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')
    throw Error('LIFECYCLE_LOCK_DEV_ONLY');
  if(await verifiedAuditorLockDevProject()!=='audit-management-system-dev')
    throw Error('LIFECYCLE_LOCK_PROJECT_MISMATCH');
  const token=await accessToken(),id=createHash('sha256').update(clean(auditId)).digest('hex').slice(0,48);
  const base='https://firestore.googleapis.com/v1/projects/audit-management-system-dev/databases/(default)/documents/ams_lifecycle_direct_locks_20_dev';
  const url=base+'?documentId='+id;
  let created;
  try{
    const response=await fetch(url,{method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({fields:{auditId:{stringValue:clean(auditId)},holder:{stringValue:randomUUID()},createdAt:{timestampValue:new Date().toISOString()}}}),
      signal:AbortSignal.timeout(5000)});
    if(response.status===409)throw Error('LIFECYCLE_LOCK_BUSY');
    if(!response.ok)throw Error('LIFECYCLE_LOCK_CREATE_HTTP_'+response.status);
    created=await response.json();
  }catch(e){
    if(clean(e?.message)==='LIFECYCLE_LOCK_BUSY')throw e;
    throw Error('LIFECYCLE_LOCK_ACQUIRE_UNCONFIRMED_MANUAL_RECONCILIATION_REQUIRED');
  }
  const version=clean(created?.updateTime),doc=clean(created?.name);
  if(!version||!doc.endsWith('/ams_lifecycle_direct_locks_20_dev/'+id))
    throw Error('LIFECYCLE_LOCK_CREATE_UNCONFIRMED_MANUAL_RECONCILIATION_REQUIRED');
  let result,failed;
  try{result=await fn();}catch(e){failed=e;}
  if(failed&&/OUTCOME_UNCONFIRMED|RECONCILIATION_REQUIRED/.test(clean(failed.message)))
    throw Error('LIFECYCLE_LOCK_HELD_FOR_RECONCILIATION: '+clean(failed.message));
  try{
    const releaseResult=await fetch(base+'/'+id+'?currentDocument.updateTime='+encodeURIComponent(version),{
      method:'DELETE',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});
    if(!releaseResult.ok)throw Error('HTTP_'+releaseResult.status);
  }catch(e){throw Error('LIFECYCLE_LOCK_RELEASE_UNCONFIRMED_MANUAL_RECONCILIATION_REQUIRED');}
  if(failed)throw failed;
  return result;
}
function directStatusKey(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function directRowRevision(h,row){
  const g=n=>val(row,col(h,n));
  return createHash('sha256').update([
    g(['Audit ID','Audit_ID','AuditId','Audit Id']),
    g(['Status']),
    g(['Assigned to','Assigned auditor','Auditor']),
    g(['Planning JSON','Planning_JSON']),
    g(['Last decision timestamp']),
    g(['Status since'])
  ].join('|')).digest('hex').slice(0,24);
}
function directResolveAuditorEmail(audValues,assigned){
  const a=clean(assigned).toLowerCase();if(!a)return'';
  if(a.includes('@'))return a;
  if(!audValues?.length)return'';
  const h=audValues[0],ce=col(h,['Email','E-mail','Auditor Email','Auditor email']),cn=col(h,['Name','Auditor','Auditor Name','Display name']);
  if(ce<0)return'';
  for(const r of audValues.slice(1)){
    const email=val(r,ce).toLowerCase(),name=cn>=0?val(r,cn).toLowerCase():'';
    if(email===a||name===a)return email;
  }
  return'';
}
function directAuditorDisplayName(audValues,raw){
  const v=clean(raw);if(!v)return'';
  if(!audValues?.length)return v;
  const h=audValues[0],ce=col(h,['Email','E-mail','Auditor Email','Auditor email']),cn=col(h,['Name','Auditor','Auditor Name','Display name']);
  const target=v.toLowerCase();
  for(const r of audValues.slice(1)){
    const em=ce>=0?val(r,ce).toLowerCase():'',name=cn>=0?val(r,cn):'';
    if(em===target||clean(name).toLowerCase()===target)return name||v;
  }
  return v;
}

function directSoftAvailabilityStatus(v){
  const s=clean(v).toUpperCase();
  return s==='SYSTEM_DEFAULT'||s==='USER_MANUAL'||s==='CALENDAR'||s==='CALENDER'||s.startsWith('DEFAULT_')||s.startsWith('MANUAL_');
}
async function directManagerApprove(identity,body){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Auditors!A1:Z256','Companies!A1:AJ686','Config_Scopes!A1:Z128']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw new Error('CANONICAL_PLANNING_INCOMPLETE');const found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const h=found.h,row=found.row.slice(),beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(beforeKey==='ACCEPTED')return{success:true,idempotent:true,auditId,action:'APPROVE',beforeStatus:'Accepted',newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_APPROVE',readMs,writeMs:0,sideEffectMs:0,totalMs:Date.now()-started};
    if(beforeKey!=='PENDING_APPROVAL')throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');

    const assigned=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])),recipientEmail=directResolveAuditorEmail(vr[1]?.values||[],assigned);
    if(!recipientEmail)throw new Error('APPROVE_AUDITOR_RECIPIENT_REQUIRED');
    const company=val(row,col(h,['Company'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid'])),now=isoLocalStamp(),minuteStamp=now.slice(0,16),actorEmail=clean(identity?.email).toLowerCase();
    const set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    set(['Status'],'Accepted');
    set(['Status since'],now);
    set(['Last manager decision'],'APPROVE');
    set(['Date - Approved','Date approved','Date Approved'],now.slice(0,10));
    set(['Date accepted','Date - Accepted','Date Accepted'],now.slice(0,10));
    set(['Last decision timestamp'],now);
    set(['Manager comment (last)'],clean(options.reason||options.comment));

    const writeStarted=Date.now();await sheetsValuesBatchUpdate([{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}]);const writeMs=Date.now()-writeStarted;

    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,companyUid,actorEmail,actorRole:'MANAGER',beforeStatus,afterStatus:'Accepted',reason:clean(options.reason||options.comment),source:'CLOUD_RUN_DIRECT_MANAGER_APPROVE',timestamp:now,action:'APPROVE',roadmapRule:'AUDITOR_SELF_PLAN_MANAGER_APPROVE_DIRECT_ACCEPTED'};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Accepted').digest('hex');
    const approvePayload={eventType:'AUDIT_APPROVED',eventFamily:'COMPACT_LIFECYCLE',rendererProfile:'COMPACT_LIFECYCLE',deliveryProfile:'BUFFERED_COMPACT',company,companyUid,auditId,actor:actorEmail,actorRole:'MANAGER',recipientRole:'AUDITOR',recipientGroup:'AUDITOR',recipientEmail,resultStatus:'Accepted',displayStatus:'Accepted',comment:'',assignedAuditor:assigned,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'LIFECYCLE_AUDITOR',templateFamily:'COMPACT_LIFECYCLE',templateKeyDefault:'AUDIT_APPROVED',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const bodyText=['Audit approved','Company: '+company,'Audit ID: '+auditId,'Auditor: '+assigned].join('\\n'),notifyHash=createHash('md5').update(recipientEmail+'|AUDIT_APPROVED|'+auditId+'|'+now).digest('hex');
    const companies=vr[2]?.values||[],ch=companies[0]||[],cuid=col(ch,['Company_UID','Company UID','CompanyUid']),cmps=col(ch,['MPS number','MPS Number','MPS nr','MPS-nr','Number']),cfg=scopeCatalog(vr[3]?.values||[]),scopes=scopesForAudit(found,cfg);
    let mpsNumber='';for(const cr of companies.slice(1)){if(cuid>=0&&val(cr,cuid)===companyUid){mpsNumber=val(cr,cmps);break;}}
    const planningRaw=val(found.row,col(h,['Planning JSON','PlanningJSON','Planning']));let planningBlocks=blocks(planningRaw);let parsedPlanning={};try{parsedPlanning=JSON.parse(planningRaw||'{}')||{};}catch{}if(!planningBlocks.length&&Array.isArray(parsedPlanning.days)){planningBlocks=parsedPlanning.days.map(d=>({date:clean(d?.date),start:clean(d?.start),end:clean(d?.end),hours:Number(d?.hours)||0,execLoc:clean(d?.execLoc||d?.location),slotComment:clean(d?.slotComment||d?.comment)}));}let plannedHours=Number(val(found.row,col(h,['Hours planned','Planned hours','Hours Planned']))||0);if(!(plannedHours>0)){plannedHours=Number(parsedPlanning.totalPlannedHours||parsedPlanning.totalHours||0)||planningBlocks.reduce((s,b)=>s+(Number(b&&b.hours)||0),0);}
    const ecasPayload={eventType:'ECAS_AUDIT_APPROVAL_DIGEST',eventFamily:'EXTERNAL_OPERATIONAL',rendererProfile:'EXTERNAL_OPERATIONAL',deliveryProfile:'BUFFERED_EXTERNAL',company,companyUid,mpsNumber,auditNumber:mpsNumber,auditId,actor:actorEmail,actorRole:'MANAGER',auditorEmail:recipientEmail,auditorName:assigned,recipientRole:'PLANNING',recipientGroup:'PLANNING',recipientEmail:actorEmail,resultStatus:'Accepted',displayStatus:'Accepted',scopes,blocks:planningBlocks,plannedHours,planningJson:planningRaw,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL',templateKeyDefault:'ECAS_AUDIT_APPROVAL_DIGEST',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const ecasHash=createHash('md5').update(actorEmail+'|ECAS_AUDIT_APPROVAL_DIGEST|'+auditId+'|'+now).digest('hex');
    const queueRows=[
      [minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})],
      [minuteStamp,'PENDING','AUDIT_APPROVED',recipientEmail,auditId,company,'Audit approved – '+company+' – '+auditId,bodyText,0,'',notifyHash,'',JSON.stringify({payload:approvePayload})],
      [minuteStamp,'PENDING','ECAS_AUDIT_APPROVAL_DIGEST',actorEmail,auditId,company,'ECAS audit approval – '+company+' – '+auditId,bodyText,0,'',ecasHash,'',JSON.stringify({payload:ecasPayload})]
    ];
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;
    return{success:true,auditId,action:'APPROVE',beforeStatus,newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',assignedTo:assigned,sourceRevision:directRowRevision(h,row),directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_APPROVE',readMs,writeMs,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}

let directAcceptSheetIdsCache20=null;
// Disabled by default. This writer must not be enabled until ALL GAS lifecycle
// writers are retired/fenced and the DEV Cloud Run lifecycle owner is exclusive.
async function directAuditorAcceptSheets20(identity,{auditId,expectedRevision}){
  if(process.env.AMS_RUNTIME_ENV!=='DEV' ||
     process.env.AMS_AUDITOR_DIRECT_ACCEPT_ENABLED!=='true' ||
     process.env.AMS_GAS_LIFECYCLE_WRITER_RETIRED_VERIFIED!=='true' ||
     process.env.AMS_MANAGER_LIFECYCLE_OWNER_SHARED_VERIFIED!=='true')
    throw Error('DIRECT_AUDITOR_ACCEPT_EXCLUSIVE_WRITER_CUTOVER_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const started=Date.now();
    const token=await accessToken();
    const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
    const idsFresh=directAcceptSheetIdsCache20 && directAcceptSheetIdsCache20.expires>Date.now();
    const [auditReads,metaResponse]=await Promise.all([
      sheetsBatchGet(['Audit planning!A1:BW','Auditors!A1:Z']),
      idsFresh?Promise.resolve(null):fetch(base+'?fields=sheets.properties',{headers:{authorization:'Bearer '+token}})
    ]);
    if(metaResponse){
      if(!metaResponse.ok)throw Error('DIRECT_ACCEPT_SHEET_METADATA_HTTP_'+metaResponse.status);
      const metadata=await metaResponse.json(),byName=new Map((metadata.sheets||[]).map(sh=>[sh.properties?.title,sh.properties?.sheetId]));
      if(!Number.isInteger(byName.get('Audit planning'))||!Number.isInteger(byName.get('Notification Queue')))
        throw Error('DIRECT_ACCEPT_CANONICAL_SHEETS_MISSING');
      directAcceptSheetIdsCache20={ids:byName,expires:Date.now()+600000};
    }
    const ids=directAcceptSheetIdsCache20.ids;
    // Fail closed if the exclusive-writer attestation changes during the read.
    if(process.env.AMS_RUNTIME_ENV!=='DEV' ||
       process.env.AMS_AUDITOR_DIRECT_ACCEPT_ENABLED!=='true' ||
       process.env.AMS_GAS_LIFECYCLE_WRITER_RETIRED_VERIFIED!=='true' ||
       process.env.AMS_MANAGER_LIFECYCLE_OWNER_SHARED_VERIFIED!=='true')
      throw Error('DIRECT_AUDITOR_ACCEPT_EXCLUSIVE_WRITER_CUTOVER_REQUIRED');
    const prepared=buildDirectAuditorAcceptSheets20({
      actor:{role:'AUDITOR',uid:clean(identity.auditorUid||identity.auditorId),email:clean(identity.email)},
      auditId,expectedRevision,
      values:{audit:auditReads[0]?.values||[],auditors:auditReads[1]?.values||[]},
      sheetIds:{audit:ids.get('Audit planning'),queue:ids.get('Notification Queue')},
      stamp:isoLocalStamp()
    });
    // Atomic status/metadata + audit-trail append within one Sheets API request.
    // No separate notification append and no whole-row replacement.
    const startedWrite=Date.now();
    let response;
    try{response=await fetch(base+':batchUpdate',{method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({requests:prepared.requests}),signal:AbortSignal.timeout(30000)});
    }catch(error){throw Error('DIRECT_ACCEPT_OUTCOME_UNCONFIRMED_DO_NOT_RETRY');}
    if(!response.ok){
      const http=response.status;
      if(http===409||http===412)throw Error('DIRECT_ACCEPT_CONFLICT');
      throw Error('DIRECT_ACCEPT_OUTCOME_UNCONFIRMED_DO_NOT_RETRY');
    }
    return {success:true,auditId,action:'ACCEPT',beforeStatus:'Approved',newStatus:'Accepted',
      afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',directCommit:true,
      owner:'CLOUD_RUN_DIRECT_AUDITOR_ACCEPT_SHEETS',readMs:startedWrite-started,
      writeMs:Date.now()-startedWrite,totalMs:Date.now()-started,
      auditTrailQueued:true,notificationReconcilerRequired:true};
  });
}

async function directManagerAcceptOnBehalf(identity,body){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  const note=clean(options.reason||options.comment),acceptSource='MANAGER_PORTAL';
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Auditors!A1:Z256','Companies!A1:AJ686','Config_Scopes!A1:Z128']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');const found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const h=found.h,row=found.row.slice(),beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(beforeKey==='ACCEPTED')return{success:true,idempotent:true,auditId,action:'ACCEPT',beforeStatus:'Accepted',newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF',readMs,writeMs:0,sideEffectMs:0,totalMs:Date.now()-started};
    if(beforeKey!=='APPROVED')throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    const representedAuditor=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']));
    if(!representedAuditor)throw new Error('ACCEPT_ON_BEHALF_REPRESENTED_AUDITOR_REQUIRED');
    const managerActor=clean(identity?.email).toLowerCase();if(!managerActor)throw new Error('MANAGER_ACTOR_REQUIRED');
    const audValues=vr[1]?.values||[],ah=audValues[0]||[],ae=col(ah,['Email','E-mail','Auditor Email','Auditor email']),ar=col(ah,['Role']),aa=col(ah,['Active','Enabled']);
    let managerRecipient='';for(const rr of audValues.slice(1)){const role=ar>=0?val(rr,ar).toUpperCase():'',active=aa>=0?val(rr,aa).toUpperCase():'YES';if(role==='MANAGER'&&!['NO','FALSE','0','INACTIVE'].includes(active)){managerRecipient=val(rr,ae).toLowerCase();if(managerRecipient)break;}}
    if(!managerRecipient)managerRecipient=managerActor;
    const company=val(row,col(h,['Company'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid'])),now=isoLocalStamp(),minuteStamp=now.slice(0,16);
    const set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    set(['Status'],'Accepted');
    set(['Status since'],now);
    set(['Last manager decision'],'ACCEPT_ON_BEHALF');
    set(['Last decision timestamp'],now);
    set(['Manager comment (last)'],'Accepted by manager on behalf of assigned auditor');
    set(['Date accepted','Date - Accepted','Date Accepted'],now.slice(0,10));
    const writeStarted=Date.now();await sheetsValuesBatchUpdate([{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}]);const writeMs=Date.now()-writeStarted;

    const cfg=scopeCatalog(vr[3]?.values||[]),scopes=scopesForAudit(found,cfg);
    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,companyUid,actorEmail:managerActor,actorRole:'MANAGER',representedAuditor,confirmationSource:acceptSource,confirmationNote:'',confirmedAt:now,beforeStatus,afterStatus:'Accepted',reason:note,source:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF',timestamp:now,action:'ACCEPT',onBehalf:true,scopes};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Accepted|MANAGER_ON_BEHALF').digest('hex');
    const notifyPayload={eventType:'AUDIT_ACCEPTED',eventFamily:'COMPACT_LIFECYCLE',rendererProfile:'COMPACT_LIFECYCLE',deliveryProfile:'BUFFERED_COMPACT',company,companyUid,auditId,actor:managerActor,actorRole:'MANAGER',representedAuditor,onBehalf:true,confirmationSource:acceptSource,recipientRole:'MANAGER',recipientGroup:'MANAGER',recipientEmail:managerRecipient,resultStatus:'Accepted',displayStatus:'Accepted',comment:note,scopes,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'LIFECYCLE_MANAGER',templateFamily:'COMPACT_LIFECYCLE',templateKeyDefault:'AUDIT_ACCEPTED',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const bodyText=['Audit accepted on behalf of auditor','Company: '+company,'Audit ID: '+auditId,'Represented auditor: '+representedAuditor,'Source: Manager Portal'].join('\\n'),notifyHash=createHash('md5').update(managerActor+'|AUDIT_ACCEPTED|'+auditId+'|'+now+'|MANAGER_ON_BEHALF').digest('hex');
    const companies=vr[2]?.values||[],ch=companies[0]||[],cuid=col(ch,['Company_UID','Company UID','CompanyUid']),cmps=col(ch,['MPS number','MPS Number','MPS nr','MPS-nr','Number']);
    let mpsNumber='';for(const cr of companies.slice(1)){if(cuid>=0&&val(cr,cuid)===companyUid){mpsNumber=val(cr,cmps);break;}}
    const planningRaw=val(found.row,col(h,['Planning JSON','PlanningJSON','Planning']));let planningBlocks=blocks(planningRaw);let parsedPlanning={};try{parsedPlanning=JSON.parse(planningRaw||'{}')||{};}catch{}if(!planningBlocks.length&&Array.isArray(parsedPlanning.days)){planningBlocks=parsedPlanning.days.map(d=>({date:clean(d?.date),start:clean(d?.start),end:clean(d?.end),hours:Number(d?.hours)||0,execLoc:clean(d?.execLoc||d?.location),slotComment:clean(d?.slotComment||d?.comment)}));}let plannedHours=Number(val(found.row,col(h,['Hours planned','Planned hours','Hours Planned']))||0);if(!(plannedHours>0)){plannedHours=Number(parsedPlanning.totalPlannedHours||parsedPlanning.totalHours||0)||planningBlocks.reduce((s,b)=>s+(Number(b&&b.hours)||0),0);}const representedAuditorEmail=directResolveAuditorEmail(vr[1]?.values||[],representedAuditor);
    const ecasPayload={eventType:'ECAS_AUDIT_APPROVAL_DIGEST',eventFamily:'EXTERNAL_OPERATIONAL',rendererProfile:'EXTERNAL_OPERATIONAL',deliveryProfile:'BUFFERED_EXTERNAL',company,companyUid,mpsNumber,auditNumber:mpsNumber,auditId,actor:managerActor,actorRole:'MANAGER',representedAuditor,onBehalf:true,confirmationSource:acceptSource,auditorEmail:representedAuditorEmail,auditorName:representedAuditor,recipientRole:'PLANNING',recipientGroup:'PLANNING',recipientEmail:managerRecipient,resultStatus:'Accepted',displayStatus:'Accepted',scopes,blocks:planningBlocks,plannedHours,planningJson:planningRaw,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL',templateKeyDefault:'ECAS_AUDIT_APPROVAL_DIGEST',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const ecasHash=createHash('md5').update(managerRecipient+'|ECAS_AUDIT_APPROVAL_DIGEST|'+auditId+'|'+now+'|MANAGER_ON_BEHALF').digest('hex');
    const queueRows=[
      [minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})],
      [minuteStamp,'PENDING','AUDIT_ACCEPTED',managerRecipient,auditId,company,'Audit accepted on behalf – '+company+' – '+auditId,bodyText,0,'',notifyHash,'',JSON.stringify({payload:notifyPayload})],
      [minuteStamp,'PENDING','ECAS_AUDIT_APPROVAL_DIGEST',managerRecipient,auditId,company,'ECAS audit approval – '+company+' – '+auditId,bodyText,0,'',ecasHash,'',JSON.stringify({payload:ecasPayload})]
    ];
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;
    return{success:true,auditId,action:'ACCEPT',beforeStatus,newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',representedAuditor,managerActor,confirmationSource:acceptSource,confirmedAt:now,sourceRevision:directRowRevision(h,row),directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF',readMs,writeMs,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}


function directIsoDate(v){
  const s=clean(v);if(!s)return'';
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return m[3]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[1])).padStart(2,'0');
  return'';
}
function directDateAddYears(iso,years){
  const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
  const y=Number(m[1])+Number(years||0),mo=Number(m[2]),d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo,0)).getUTCDate());
  return[String(y),String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function directDateAddMonths(iso,months){
  const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
  const total=Number(m[1])*12+(Number(m[2])-1)+Number(months||0),y=Math.floor(total/12),mo=((total%12)+12)%12,d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo+1,0)).getUTCDate());
  return[String(y),String(mo+1).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function directSetByHeader(headers,row,names,value){const i=col(headers,names);if(i>=0)row[i]=value;}
function directAppendObjectRow(headers,obj){return headers.map(h=>obj[h]===undefined?'':obj[h]);}
function directSuccessorGroups(items){
  const sorted=(items||[]).slice().sort((a,b)=>a.from.localeCompare(b.from)||a.scopeCode.localeCompare(b.scopeCode)),groups=[];
  for(const item of sorted){
    let placed=false;
    for(const g of groups){
      const from=item.from>g.from?item.from:g.from,to=item.to<g.to?item.to:g.to;
      if(from<=to){g.items.push(item);g.from=from;g.to=to;placed=true;break;}
    }
    if(!placed)groups.push({items:[item],from:item.from,to:item.to});
  }
  return groups;
}
function directAuditPlanningScopeHours(headers,row,def,scopeCode){
  const ix=col(headers,['Duration '+clean(def?.slotKey),'Duration '+clean(scopeCode)]);
  if(ix<0)return null;
  const raw=clean(row[ix]);
  if(raw==='')return null;
  const n=Number(String(raw).replace(',','.'));
  return Number.isFinite(n)&&n>=0?n:null;
}
function directCompletedLogRow(logHeaders,found,hoursDedicated,actorEmail,now,fallbackPlannedHours){
  const out=new Array(logHeaders.length).fill(''),h=found.h,row=found.row,g=names=>val(row,col(h,names)),set=(names,v)=>directSetByHeader(logHeaders,out,names,v);
  let planned=Number(g(['Hours planned','Planned hours','Hours Planned']))||0;
  if(!(planned>0)){try{const j=JSON.parse(g(['Planning JSON','PlanningJSON','Planning'])||'{}');planned=Number(j.totalPlannedHours||j.formalHours||j.totalHours||0)||0;}catch{}}if(!(planned>0)&&Number(fallbackPlannedHours)>0)planned=Number(fallbackPlannedHours);
  const datePlanned=dateOnly(g(['Date - Planned','Date planned','Date Planned'])),expiry=dateOnly(g(['Date - Will Expire','Will Expire']));
  set(['Company'],g(['Company']));set(['Auditor'],g(['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']));
  set(['Status'],'Completed');set(['Date planned','Date - Planned'],datePlanned);set(['Date approved','Date - Approved'],dateOnly(g(['Date - Approved','Date approved','Date Approved'])));
  for(let n=1;n<=8;n++){const key='SCOPE_'+String(n).padStart(2,'0');if(yes(g([key])))set([key],'x');}
  set(['Hours planned'],planned);set(['Hours dedicated'],hoursDedicated);set(['Hours to be planned'],Number(g(['Total audit time in hours','Total hours','Hours to be planned']))||planned);
  set(['Year'],(datePlanned||expiry||now).slice(0,4));set(['Date accepted','Date - Accepted'],dateOnly(g(['Date accepted','Date - Accepted','Date Accepted'])));
  set(['Audit ID'],g(['Audit ID','Audit_ID','AuditId','Audit Id']));set(['Manager_Email','Manager Email','Manager e-mail'],actorEmail);
  set(['Company_UID','Company UID','CompanyUid'],g(['Company_UID','Company UID','CompanyUid']));set(['Date completed'],now.slice(0,10));
  return out;
}

async function directQueueRealizedHoursCorrection(auditId,company,companyUid,actorEmail,oldHours,newHours){
  const now=isoLocalStamp(),payload={type:'REALIZED_HOURS_CORRECTED',auditId,company,companyUid,actorEmail,actorRole:'MANAGER',oldHours:Number(oldHours),newHours:Number(newHours),timestamp:now,source:'CLOUD_RUN_DIRECT_MANAGER_COMPLETE'};
  const body=JSON.stringify(payload),hash=createHash('md5').update('REALIZED_HOURS_CORRECTED|'+auditId+'|'+oldHours+'|'+newHours+'|'+now).digest('hex');
  await sheetsValuesAppend('Notification Queue!A:M',[[now.slice(0,16),'AUDIT_TRAIL','REALIZED_HOURS_CORRECTED','',auditId,company,'[TRAIL] REALIZED_HOURS_CORRECTED :: '+auditId,body,0,'',hash,'',JSON.stringify({payload})]]);
  return payload;
}
function directExistingSuccessorRows(ap,auditId,actorEmail,cfgValues,companies){
  if(!Array.isArray(ap)||ap.length<2)return[];
  const h=ap[0]||[],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),prefix=clean(auditId)+'_NEXT_';
  if(ci<0||!prefix)return[];
  const out=[];
  for(let i=1;i<ap.length;i++){
    const id=val(ap[i],ci);
    if(!id.startsWith(prefix))continue;
    const mapped=managerOpen([h,ap[i]],actorEmail,cfgValues,companies).rows[0];
    if(mapped){mapped.sourceRow=i+1;out.push(mapped);}
  }
  return out;
}
// directComplete already acquires withDirectManagerActionLock internally.
// Do not nest that same lock: nested acquisition deadlocks the audit.
async function directManagerComplete(identity,body){return directComplete(identity,body,'MANAGER');}
async function directAuditorComplete(identity,body){return directComplete(identity,body,'AUDITOR');}
function directRepairMissingCompleteLinks(auditId,found,cfg,obs,links,companyScopes,companyUid,stamp,{enabled=false,sources=null}={}){
  const h=found.h,row=found.row,oh=obs[0]||[],lh=links[0]||[],csH=companyScopes[0]||[];
  const oi=col(oh,['Obligation_ID','Obligation ID']),ocs=col(oh,['Company_Scope_ID','Company Scope ID']),ocu=col(oh,['Company_UID','Company UID']),osc=col(oh,['ScopeCode','Scope Code']),ock=col(oh,['Cycle_Key','Cycle Key']),ots=col(oh,['Trigger_Source','Trigger Source']),ost=col(oh,['Obligation_State','Obligation State']),obe=col(oh,['Base_Expiry_Date','Base Expiry Date']),oee=col(oh,['Effective_Expiry_Date','Effective Expiry Date']),opf=col(oh,['Planning_Window_From','Planning Window From']),opt=col(oh,['Planning_Window_To','Planning Window To']),ofh=col(oh,['Formal_Hours','Formal Hours']),opa=col(oh,['Preassigned_Auditor_Email']),oas=col(oh,['Allow_Self_Planning']),oup=col(oh,['Updated_At','Updated At']),osrc=col(oh,['Source_Audit_ID']);
  const la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),lli=col(lh,['Linked_At','Linked At']);
  const csId=col(csH,['Company_Scope_ID','Company Scope ID']),csUid=col(csH,['Company_UID','Company UID']),csCode=col(csH,['ScopeCode','Scope Code']),csActive=col(csH,['Active']);
  if([oi,ocs,ocu,osc,ost,la,lo,ls,csId,csUid,csCode].some(x=>x<0))throw new Error('MODEL_C_LEGACY_COMPLETE_REPAIR_SCHEMA_INVALID');
  const activeDefs=(cfg||[]).filter(def=>[def.slotKey,def.scopeCode,def.displayName].some(k=>{const ix=col(h,[k]);return ix>=0&&yes(row[ix]);}));
  if(!activeDefs.length)throw new Error('MODEL_C_LEGACY_COMPLETE_REPAIR_NO_SCOPES');
  const baseExpiry=directIsoDate(val(row,col(h,['Date - Will Expire','Date – Will Expire','Will Expire']))),effectiveExpiry=directIsoDate(val(row,col(h,['Extended Expiration Date'])))||baseExpiry,windowFrom=directIsoDate(val(row,col(h,['Planning window from','Planning Window From']))),windowTo=directIsoDate(val(row,col(h,['Planning window to','Planning Window To']))),plannedDate=directIsoDate(val(row,col(h,['Date - Planned','Date planned','Date Planned']))),preassigned=val(row,col(h,['Preassigned Auditor','Preassigned auditor'])),allowSelfPlanning=val(row,col(h,['Allow self planning','Allow Self Planning','Self planning','Self Planning']));
  const out=[],used=new Set(),companyScopeWrites=[];
  for(const def of activeDefs){
    const code=clean(def.scopeCode||def.displayName||def.slotKey),aliases=new Set([def.scopeCode,def.displayName,def.slotKey].map(key).filter(Boolean));
    let csRow=null,companyScopeId='';
    for(let i=1;i<companyScopes.length;i++){
      const rr=companyScopes[i],active=csActive<0||yes(rr[csActive]);
      if(active&&val(rr,csUid)===companyUid&&aliases.has(key(val(rr,csCode)))){csRow=rr;break;}
    }
    if(csRow)companyScopeId=val(csRow,csId);
    else if(def.recurring===true)throw new Error('MODEL_C_COMPANY_SCOPE_NOT_FOUND_'+code);
    else{
      companyScopeId='CS_'+createHash('sha256').update('LEGACY_COMPLETE|'+companyUid+'|'+code).digest('hex').slice(0,32);
      const nr=new Array(csH.length).fill('');
      directSetByHeader(csH,nr,['Company_Scope_ID','Company Scope ID'],companyScopeId);
      directSetByHeader(csH,nr,['Company_UID','Company UID'],companyUid);
      directSetByHeader(csH,nr,['ScopeCode','Scope Code'],code);
      directSetByHeader(csH,nr,['Active'],'YES');
      directSetByHeader(csH,nr,['Lifecycle_Type','Lifecycle Type'],'NON_RECURRING');
      directSetByHeader(csH,nr,['Source_Audit_ID'],auditId);
      directSetByHeader(csH,nr,['Created_At','Created At'],stamp);
      directSetByHeader(csH,nr,['Updated_At','Updated At'],stamp);
      const rowNo=companyScopes.length+companyScopeWrites.length+1;
      companyScopeWrites.push({range:'Company_Scopes!A'+rowNo+':'+a1col(csH.length)+rowNo,values:[nr]});
    }
    let existing=null;
    for(let i=1;i<obs.length;i++){
      const rr=obs[i],obId=val(rr,oi);
      if(!obId||used.has(obId))continue;
      const sameSource=osrc>=0&&val(rr,osrc)===auditId;
      const sameNatural=val(rr,ocs)===companyScopeId&&aliases.has(key(val(rr,osc)))&&val(rr,ost).toUpperCase()==='OPEN';
      if(sameSource||sameNatural){existing={row:i+1,values:rr.slice(),obId};break;}
    }
    let obId,obRow,obValues;
    if(existing){obId=existing.obId;obRow=existing.row;obValues=existing.values;}
    else{
      obId='OBL_'+createHash('sha256').update('LEGACY_COMPLETE|'+auditId+'|'+companyScopeId+'|'+code).digest('hex').slice(0,32);
      obRow=obs.length+out.filter(x=>x.syntheticOb).length+1;obValues=new Array(oh.length).fill('');
      obValues[oi]=obId;obValues[ocs]=companyScopeId;obValues[ocu]=companyUid;obValues[osc]=code;if(ock>=0)obValues[ock]=baseExpiry||plannedDate.slice(0,4);if(ots>=0)obValues[ots]=def.recurring===true?'CERTIFICATE_LIFECYCLE':'LEGACY_COMPLETION_REPAIR';obValues[ost]='OPEN';if(obe>=0)obValues[obe]=baseExpiry;if(oee>=0)obValues[oee]=effectiveExpiry;if(opf>=0)obValues[opf]=windowFrom;if(opt>=0)obValues[opt]=windowTo;if(ofh>=0){const scopeHours=directAuditPlanningScopeHours(h,row,def,code);obValues[ofh]=scopeHours!==null?scopeHours:Number(def.formalHours||0);}if(opa>=0)obValues[opa]=preassigned;if(oas>=0)obValues[oas]=allowSelfPlanning;if(oup>=0)obValues[oup]=stamp;if(osrc>=0)obValues[osrc]=auditId;
    }
    if(!existing&&enabled){
      const obj=Object.fromEntries(oh.map((header,i)=>[header,obValues[i]??'']));
      const resolved=buildNewModelCObligationWithHours20({
        headers:oh,obligation:obj,companyId:companyUid,scopeCode:code,
        effectiveDate:baseExpiry||plannedDate,companyScopes:sources.companyScopes,
        overrides:sources.overrides,scopeVersions:sources.scopeVersions,now:stamp
      });
      obValues=resolved.row;
    }
    used.add(obId);
    let linkPack=null;
    for(let i=1;i<links.length;i++)if(val(links[i],la)===auditId&&val(links[i],lo)===obId){linkPack={row:i+1,values:links[i].slice()};break;}
    let linkRow,linkValues;
    if(linkPack){linkRow=linkPack.row;linkValues=linkPack.values;}
    else{linkRow=links.length+out.filter(x=>x.syntheticLink).length+1;linkValues=new Array(lh.length).fill('');linkValues[la]=auditId;linkValues[lo]=obId;linkValues[ls]='ACTIVE';if(lli>=0)linkValues[lli]=stamp;}
    out.push({row:linkRow,obId,values:linkValues,obRow,obValues,syntheticOb:!existing,syntheticLink:!linkPack});
  }
  return{activeLinks:out,companyScopeWrites};
}

async function directComplete(identity,body,actorRole){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  actorRole=clean(actorRole).toUpperCase();
  if(actorRole!=='MANAGER'&&actorRole!=='AUDITOR')throw new Error('COMPLETE_ACTOR_ROLE_INVALID');
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},hoursDedicated=Number(options.hoursDedicated),expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!Number.isFinite(hoursDedicated)||hoursDedicated<=0||Math.abs(Math.round(hoursDedicated*4)/4-hoursDedicated)>1e-9)throw new Error('HOURS_DEDICATED_INVALID');
  const owner=actorRole==='MANAGER'?'CLOUD_RUN_DIRECT_MANAGER_COMPLETE':'CLOUD_RUN_DIRECT_AUDITOR_COMPLETE';
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet([
      'Audit planning!A1:BW2000','Log realized audits!A1:AZ2500','Auditor Availability!A:P',
      'Config_Scopes!A1:Z128','Audit_Obligations!A1:Z2500','Audit_Visit_Obligations!A1:H2500',
      'Company_Scopes!A1:Z1500','Companies!A1:AZ1200','Auditors!A1:Z256'
    ]),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');const log=vr[1]?.values||[],av=vr[2]?.values||[],cfgValues=vr[3]?.values||[],obs=vr[4]?.values||[],links=vr[5]?.values||[],companyScopes=vr[6]?.values||[],companies=vr[7]?.values||[],auditors=vr[8]?.values||[];
    // Read authoritative hours sources before any lifecycle mutations; mode off by default.
    let newHoursSources=null;
    if(newObligationSnapshotEnabled){
      const sources=await sheetsBatchGet(['Company_Scope_Hours!A1:Z2000','ScopeVersions!A1:Z256']);
      const toObjects=values=>{
        if(!values?.length||!Array.isArray(values[0]))throw Error('NEW_OBLIGATION_HOURS_SOURCE_SCHEMA_MISSING');
        const [headers,...rows]=values;
        return rows.filter(r=>r.some(v=>clean(v))).map(r=>Object.fromEntries(headers.map((h,i)=>[clean(h),r[i]??''])));
      };
      newHoursSources={companyScopes:toObjects(companyScopes),overrides:toObjects(sources[0]?.values),scopeVersions:toObjects(sources[1]?.values)};
    }
    const found=findAudit(ap,auditId),logH=log[0]||[],logAuditIx=col(logH,['Audit ID','Audit_ID','AuditId']),logHoursIx=col(logH,['Hours dedicated']);
    let existingLogRow=0;
    if(logAuditIx>=0)for(let i=1;i<log.length;i++)if(val(log[i],logAuditIx)===auditId){existingLogRow=i+1;break;}
    if(!found){
      if(!existingLogRow)throw new Error('AUDIT_NOT_FOUND');
      let correctionMs=0,managerOverride=false,managerCorrection=null;
      const existingHours=logHoursIx>=0?Number(log[existingLogRow-1][logHoursIx]):0;
      if(actorRole==='MANAGER'&&logHoursIx>=0&&existingHours!==hoursDedicated){
        const oldHours=existingHours,t=Date.now();await sheetsValuesBatchUpdate([{range:'Log realized audits!'+a1col(logHoursIx+1)+existingLogRow,values:[[hoursDedicated]]}]);correctionMs=Date.now()-t;managerOverride=true;
        const companyIx=col(logH,['Company']),uidIx=col(logH,['Company_UID','Company UID','CompanyUid']);try{managerCorrection=await directQueueRealizedHoursCorrection(auditId,val(log[existingLogRow-1],companyIx),val(log[existingLogRow-1],uidIx),clean(identity?.email).toLowerCase(),oldHours,hoursDedicated);}catch{}
      }
      const effectiveHours=actorRole==='AUDITOR'&&existingHours>0?existingHours:hoursDedicated;
      const retrySuccessorRows=directExistingSuccessorRows(ap,auditId,clean(identity?.email).toLowerCase(),cfgValues,companies);
      return{success:true,idempotent:true,alreadyCompleted:true,managerOverride,managerCorrection,auditId,action:'COMPLETE',hoursDedicated:effectiveHours,directCommit:true,owner,readMs,writeMs:correctionMs,successorRows:retrySuccessorRows,successorAuditIds:retrySuccessorRows.map(r=>r.auditId),totalMs:Date.now()-started};
    }
    const h=found.h,row=found.row,beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(beforeKey!=='ACCEPTED')throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    let existingLogCorrectionMs=0,managerCorrection=null;
    const existingCommittedHours=existingLogRow&&logHoursIx>=0?Number(log[existingLogRow-1][logHoursIx]):0;
    if(actorRole==='MANAGER'&&existingLogRow&&logHoursIx>=0&&existingCommittedHours!==hoursDedicated){
      const oldHours=existingCommittedHours,t=Date.now();await sheetsValuesBatchUpdate([{range:'Log realized audits!'+a1col(logHoursIx+1)+existingLogRow,values:[[hoursDedicated]]}]);existingLogCorrectionMs=Date.now()-t;
      const companyIx=col(logH,['Company']),uidIx=col(logH,['Company_UID','Company UID','CompanyUid']);try{managerCorrection=await directQueueRealizedHoursCorrection(auditId,val(log[existingLogRow-1],companyIx),val(log[existingLogRow-1],uidIx),clean(identity?.email).toLowerCase(),oldHours,hoursDedicated);}catch{}
    }

    const company=val(row,col(h,['Company'])),location=val(row,col(h,['Location'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid'])),actorEmail=clean(identity?.email).toLowerCase(),now=isoLocalStamp(),stamp=new Date().toISOString();
    const assignedTo=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])).toLowerCase();
    if(actorRole==='AUDITOR'&&(!assignedTo||assignedTo!==actorEmail))throw new Error('AUDITOR_NOT_ASSIGNED');
    if(!companyUid)throw new Error('COMPANY_UID_REQUIRED');

    const cfg=scopeCatalog(cfgValues),cfgByCode=new Map(cfg.map(x=>[clean(x.scopeCode),x]));
    const oh=obs[0]||[],oi=col(oh,['Obligation_ID','Obligation ID']),ocs=col(oh,['Company_Scope_ID','Company Scope ID']),ocu=col(oh,['Company_UID','Company UID']),osc=col(oh,['ScopeCode','Scope Code']),ock=col(oh,['Cycle_Key','Cycle Key']),ots=col(oh,['Trigger_Source','Trigger Source']),ost=col(oh,['Obligation_State','Obligation State']),obe=col(oh,['Base_Expiry_Date','Base Expiry Date']),oee=col(oh,['Effective_Expiry_Date','Effective Expiry Date']),opf=col(oh,['Planning_Window_From','Planning Window From']),opt=col(oh,['Planning_Window_To','Planning Window To']),ofh=col(oh,['Formal_Hours','Formal Hours']),opa=col(oh,['Preassigned_Auditor_Email']),oas=col(oh,['Allow_Self_Planning']),oup=col(oh,['Updated_At','Updated At']),ocl=col(oh,['Closed_At','Closed At']),osrc=col(oh,['Source_Audit_ID']);
    const lh=links[0]||[],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),llu=col(lh,['Unlinked_At','Unlinked At']);
    if([oi,ocs,ocu,osc,ost,la,lo,ls].some(x=>x<0))throw new Error('MODEL_C_COMPLETE_SCHEMA_INVALID');
    let activeLinks=[],seenActiveObIds=new Set();for(let i=1;i<links.length;i++)if(val(links[i],la)===auditId&&val(links[i],ls).toUpperCase()==='ACTIVE'){const obId=val(links[i],lo);if(!obId||seenActiveObIds.has(obId))continue;seenActiveObIds.add(obId);activeLinks.push({row:i+1,obId,values:links[i].slice()});}
    if(!activeLinks.length){
      if(existingLogRow){
        const deleteStarted=Date.now();await sheetsDeleteRow('Audit planning',found.sourceRow);const deleteMs=Date.now()-deleteStarted;
        const recoveredSuccessorRows=directExistingSuccessorRows(ap,auditId,clean(identity?.email).toLowerCase(),cfgValues,companies);
        const recoveredHours=actorRole==='AUDITOR'&&existingCommittedHours>0?existingCommittedHours:hoursDedicated;
        return{success:true,idempotent:true,recovered:true,auditId,action:'COMPLETE',hoursDedicated:recoveredHours,directCommit:true,owner,successorRows:recoveredSuccessorRows,successorAuditIds:recoveredSuccessorRows.map(r=>r.auditId),readMs,writeMs:existingLogCorrectionMs,deleteMs,totalMs:Date.now()-started};
      }
      const repair=directRepairMissingCompleteLinks(auditId,found,cfg,obs,links,companyScopes,companyUid,stamp,{enabled:newObligationSnapshotEnabled,sources:newHoursSources});activeLinks=repair.activeLinks||[];var legacyCompanyScopeWrites=repair.companyScopeWrites||[];
    }
    const obById=new Map();for(let i=1;i<obs.length;i++)obById.set(val(obs[i],oi),{row:i+1,values:obs[i].slice()});for(const link of activeLinks)if(link.obValues)obById.set(link.obId,{row:link.obRow,values:link.obValues.slice()});for(const link of activeLinks)if(link.obValues)obById.set(link.obId,{row:link.obRow,values:link.obValues});

    const successorItems=[],obligationWrites=[],linkWrites=[];let completedFormalHours=0;
    for(const link of activeLinks){
      const pack=obById.get(link.obId);if(!pack)throw new Error('MODEL_C_ORPHAN_ACTIVE_LINK');
      const rr=pack.values.slice();while(rr.length<oh.length)rr.push('');
      const code=val(rr,osc),def=cfgByCode.get(code)||null;completedFormalHours+=Number(val(rr,ofh))>0?Number(val(rr,ofh)):Number((cfgByCode.get(code)||{}).formalHours||0);
      if(!def)throw new Error('CONFIG_SCOPES_MISSING_'+code);
      if(val(rr,ocu)!==companyUid)throw new Error('MODEL_C_COMPANY_UID_MISMATCH');
      if(def.recurring===true){
        const base=directIsoDate(val(rr,obe));if(!base)throw new Error('RECURRING_BASE_EXPIRY_MISSING_'+code);
        const next=directDateAddYears(base,1),from=directDateAddMonths(next,Number(def.planningFrom||0)),to=directDateAddMonths(next,Number(def.planningTo||0));
        if(!next||!from||!to)throw new Error('SUCCESSOR_WINDOW_INVALID_'+code);
        const apScopeHours=directAuditPlanningScopeHours(h,row,def,code);
        const successorFormalHours=apScopeHours!==null?apScopeHours:(Number(val(rr,ofh))>=0&&clean(val(rr,ofh))!==''?Number(val(rr,ofh)):Number(def.formalHours||0));
        successorItems.push({scopeCode:code,companyScopeId:val(rr,ocs),cycleKey:next,baseExpiry:next,from,to,formalHours:successorFormalHours,preassigned:val(rr,opa),allowSelfPlanning:val(rr,oas)});
      }
      rr[ost]='COMPLETED';if(oup>=0)rr[oup]=stamp;if(ocl>=0)rr[ocl]=stamp;
      obligationWrites.push({range:'Audit_Obligations!A'+pack.row+':'+a1col(oh.length)+pack.row,values:[rr]});
      const lr=link.values.slice();while(lr.length<lh.length)lr.push('');lr[ls]='INACTIVE';if(llu>=0)lr[llu]=stamp;
      linkWrites.push({range:'Audit_Visit_Obligations!A'+link.row+':'+a1col(lh.length)+link.row,values:[lr]});
    }

    const groups=directSuccessorGroups(successorItems),newPlanningRows=[],newObRows=[],newLinkRows=[],successorIds=[];
    const csH=companyScopes[0]||[],csId=col(csH,['Company_Scope_ID','Company Scope ID']),csBirthday=col(csH,['Certificate_Birthday','Certificate Birthday']),birthdayById=new Map();
    for(let i=1;i<companyScopes.length;i++)birthdayById.set(val(companyScopes[i],csId),directIsoDate(val(companyScopes[i],csBirthday)));
    const apH=ap[0]||[],source=row.slice(),auditIdIx=col(apH,['Audit ID','Audit_ID','AuditId','Audit Id']);
    for(let g=0;g<groups.length;g++){
      const group=groups[g],newId=auditId+'_NEXT_'+String(g+1)+'_'+createHash('md5').update(auditId+'|'+group.items.map(x=>x.scopeCode+'|'+x.cycleKey).join('|')).digest('hex').slice(0,10);
      const requestedPreassigned=clean(group.items.map(x=>clean(x.preassigned).toLowerCase()).find(Boolean)||clean(val(source,col(apH,['Preassigned Auditor','Preassigned auditor']))).toLowerCase());
      const successorScopeCodes=group.items.map(x=>x.scopeCode).filter(Boolean);
      const qualifiedEmail=v211ResolveAuditorEmail(auditors,requestedPreassigned);
      const carryPreassigned=!!qualifiedEmail&&v211AuditorQualified(auditors,cfg,successorScopeCodes,qualifiedEmail);
      const successorPreassigned=carryPreassigned?requestedPreassigned:'';
      const preassignmentRemoved=!!requestedPreassigned&&!carryPreassigned;
      for(const item of group.items){item.preassigned=successorPreassigned;if(preassignmentRemoved)item.allowSelfPlanning='NO';}
      const existingAp=ap.slice(1).some(r=>val(r,auditIdIx)===newId);
      if(!existingAp){
        const nr=source.slice();for(let i=0;i<nr.length;i++)nr[i]=nr[i]??'';
        for(const s of cfg){const ix=col(apH,[s.slotKey,s.scopeCode,s.displayName]);if(ix>=0)nr[ix]='';const durationIx=col(apH,['Duration '+s.slotKey,'Duration '+s.scopeCode]);if(durationIx>=0)nr[durationIx]='';}
        let total=0,expiry='',birthday='';
        for(const item of group.items){
          const def=cfgByCode.get(item.scopeCode)||{},six=col(apH,[def.slotKey,item.scopeCode,def.displayName]);if(six>=0)nr[six]='x';
          const dix=col(apH,['Duration '+def.slotKey,'Duration '+item.scopeCode]);if(dix>=0)nr[dix]=item.formalHours;
          total+=Number(item.formalHours||0);if(!expiry||item.baseExpiry<expiry)expiry=item.baseExpiry;if(!birthday)birthday=birthdayById.get(item.companyScopeId)||'';
        }
        directSetByHeader(apH,nr,['Audit ID'],newId);directSetByHeader(apH,nr,['Status'],'Pending Planning');directSetByHeader(apH,nr,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'],'');
        directSetByHeader(apH,nr,['Date - Planned','Date planned'],'');directSetByHeader(apH,nr,['Date - Approved','Date approved'],'');directSetByHeader(apH,nr,['Date accepted','Date - Accepted'],'');
        directSetByHeader(apH,nr,['Planning JSON','PlanningJSON','Planning'],'');directSetByHeader(apH,nr,['Audit days textual'],'');directSetByHeader(apH,nr,['Hours planned','Planned hours'],'');
        directSetByHeader(apH,nr,['Last manager decision'],'');directSetByHeader(apH,nr,['Last decision timestamp'],'');directSetByHeader(apH,nr,['Status since'],'');directSetByHeader(apH,nr,['Manager comment (last)'],'');directSetByHeader(apH,nr,['Last auditor decision'],'');directSetByHeader(apH,nr,['Last auditor decision timestamp'],'');directSetByHeader(apH,nr,['Auditor comment (last)'],'');
        directSetByHeader(apH,nr,['Total audit time in hours'],total);directSetByHeader(apH,nr,['Date - Will Expire'],expiry);directSetByHeader(apH,nr,['Extended Expiration Date'],expiry);
        directSetByHeader(apH,nr,['Birthdate certificate'],birthday);directSetByHeader(apH,nr,['Planning window from'],group.from);directSetByHeader(apH,nr,['Planning window to'],group.to);
        directSetByHeader(apH,nr,['Scopes_List'],group.items.map(x=>x.scopeCode).join(', '));directSetByHeader(apH,nr,['Extension applied'],'');
        directSetByHeader(apH,nr,['Preassigned Auditor','Preassigned auditor'],successorPreassigned);
        if(preassignmentRemoved){
          directSetByHeader(apH,nr,['Allow self planning','Allow Self Planning','Self planning'],'NO');
          directSetByHeader(apH,nr,['REQUIRES_REPLAN','Requires Replan','Replan Required','Warning Replan','Warning'],'YES');
          directSetByHeader(apH,nr,['REQUIRES_REPLAN_REASON','Requires Replan Reason','Warning Reason','Reason'],'Preassignment removed for successor: auditor is no longer qualified for required scope(s).');
          directSetByHeader(apH,nr,['Manager comment (last)'],'System attention: previous preassignment was not carried to this successor because the auditor is no longer qualified for the required scope(s).');
        }
        newPlanningRows.push(nr);
      }
      successorIds.push(newId);
      for(const item of group.items){
        let existingOb=null;
        for(let oi2=1;oi2<obs.length;oi2++){
          const rr0=obs[oi2];
          if(val(rr0,ocs)===item.companyScopeId&&directIsoDate(val(rr0,ock))===item.cycleKey&&val(rr0,ots)==='CERTIFICATE_LIFECYCLE'){
            existingOb={id:val(rr0,oi),row:oi2+1,values:rr0};break;
          }
        }
        const obId=existingOb?.id||('OBL_'+createHash('sha256').update(newId+'|'+item.companyScopeId+'|'+item.cycleKey).digest('hex').slice(0,32));
        if(!existingOb){
          const obj={};for(const hh of oh)obj[hh]='';
          Object.assign(obj,{Obligation_ID:obId,Company_Scope_ID:item.companyScopeId,Company_UID:companyUid,ScopeCode:item.scopeCode,Cycle_Key:item.cycleKey,Trigger_Source:'CERTIFICATE_LIFECYCLE',Obligation_State:'OPEN',Base_Expiry_Date:item.baseExpiry,Effective_Expiry_Date:item.baseExpiry,Planning_Window_From:item.from,Planning_Window_To:item.to,Formal_Hours:item.formalHours,Preassigned_Auditor_Email:item.preassigned,Allow_Self_Planning:item.allowSelfPlanning,Source_Audit_ID:newId,Created_At:stamp,Updated_At:stamp,Closed_At:''});
          if(newObligationSnapshotEnabled){
            const resolved=buildNewModelCObligationWithHours20({
              headers:oh,obligation:obj,companyId:companyUid,scopeCode:item.scopeCode,effectiveDate:item.cycleKey,
              companyScopes:newHoursSources.companyScopes,overrides:newHoursSources.overrides,scopeVersions:newHoursSources.scopeVersions,now:stamp
            });
            newObRows.push(resolved.row);
          }else newObRows.push(directAppendObjectRow(oh,obj));
        }
        const activeLinkExists=links.slice(1).some(r=>val(r,la)===newId&&val(r,lo)===obId&&val(r,ls).toUpperCase()==='ACTIVE');
        if(!activeLinkExists){
          const linkObj={};for(const hh of lh)linkObj[hh]='';Object.assign(linkObj,{Audit_ID:newId,Obligation_ID:obId,Link_State:'ACTIVE',Linked_At:stamp,Unlinked_At:''});newLinkRows.push(directAppendObjectRow(lh,linkObj));
        }
      }
    }

    const ah=av[0]||[],aid1=col(ah,['Audit_ID_1','Audit ID 1']),aid2=col(ah,['Audit_ID_2','Audit ID 2']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),available=col(ah,['Available']),lu=col(ah,['Last_Updated']),availabilityWrites=[];
    for(let i=1;i<av.length;i++){const rr=(av[i]||[]).slice();while(rr.length<ah.length)rr.push('');let changed=false;if(aid1>=0&&clean(rr[aid1])===auditId){rr[aid1]='';if(s1>=0)rr[s1]='';if(e1>=0)rr[e1]='';if(st1>=0)rr[st1]='';changed=true;}if(aid2>=0&&clean(rr[aid2])===auditId){rr[aid2]='';if(s2>=0)rr[s2]='';if(e2>=0)rr[e2]='';if(st2>=0)rr[st2]='';changed=true;}if(changed){const has1=aid1>=0&&clean(rr[aid1]),has2=aid2>=0&&clean(rr[aid2]),soft=directSoftAvailabilityStatus(st1>=0?rr[st1]:'')||directSoftAvailabilityStatus(st2>=0?rr[st2]:'');if(available>=0)rr[available]=(has1||has2||soft)?'NO':'YES';if(lu>=0)rr[lu]=now.slice(0,16);availabilityWrites.push({range:'Auditor Availability!A'+(i+1)+':'+a1col(ah.length)+(i+1),values:[rr]});}}

    if(!logH.length)throw new Error('LOG_REALIZED_SCHEMA_MISSING');
    const managerEmailForLog=actorRole==='MANAGER'?actorEmail:'planning@agriqa.es';
    const logRow=directCompletedLogRow(logH,found,hoursDedicated,managerEmailForLog,now,completedFormalHours);
    const writeStarted=Date.now(),allWrites=[...(typeof legacyCompanyScopeWrites==='undefined'?[]:legacyCompanyScopeWrites),...obligationWrites,...linkWrites,...availabilityWrites];
    if(!existingLogRow)allWrites.push({range:'Log realized audits!A'+(log.length+1)+':'+a1col(logH.length)+(log.length+1),values:[logRow]});
    for(let i=0;i<newPlanningRows.length;i++)allWrites.push({range:'Audit planning!A'+(ap.length+i+1)+':'+a1col(apH.length)+(ap.length+i+1),values:[newPlanningRows[i]]});
    for(let i=0;i<newObRows.length;i++)allWrites.push({range:'Audit_Obligations!A'+(obs.length+i+1)+':'+a1col(oh.length)+(obs.length+i+1),values:[newObRows[i]]});
    for(let i=0;i<newLinkRows.length;i++)allWrites.push({range:'Audit_Visit_Obligations!A'+(links.length+i+1)+':'+a1col(lh.length)+(links.length+i+1),values:[newLinkRows[i]]});
    if(allWrites.length)await sheetsValuesBatchUpdate(allWrites);
    const writeMs=Date.now()-writeStarted+existingLogCorrectionMs;

    const deleteStarted=Date.now();await sheetsDeleteRow('Audit planning',found.sourceRow);const deleteMs=Date.now()-deleteStarted;

    const minuteStamp=now.slice(0,16),trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,companyUid,actorEmail,actorRole,beforeStatus,afterStatus:'Completed',source:owner,timestamp:now,action:'COMPLETE',hoursDedicated,successorAuditIds:successorIds};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Completed').digest('hex');
    const queueRows=[[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})]];
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;

    const successorRows=newPlanningRows.map((nr,i)=>{const mapped=managerOpen([apH,nr],actorEmail,cfgValues,companies).rows[0];if(mapped)mapped.sourceRow=ap.length+i+1;return mapped;}).filter(Boolean);
    return{success:true,auditId,action:'COMPLETE',beforeStatus,newStatus:'Completed',afterStatus:'COMPLETED',afterStatusDisplay:'Completed',hoursDedicated,directCommit:true,owner,successorAuditIds:successorIds,successorRows,managerCorrection,readMs,writeMs,deleteMs,availabilityRows:availabilityWrites.length,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}

async function directManagerCancel(identity,body,auditorMode=false){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},reason=clean(options.reason||options.comment),expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!reason)throw new Error('ACTION_REASON_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Auditor Availability!A:P','Auditors!A1:Z256']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');const found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const h=found.h,row=found.row.slice(),statusCol=col(h,['Status']),beforeStatus=statusCol>=0?clean(row[statusCol]):'',beforeKey=directStatusKey(beforeStatus);
    if(!(auditorMode?beforeKey==='PENDING_APPROVAL':['PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(beforeKey)))throw new Error('STATUS_TRANSITION_BLOCKED');
    if(auditorMode){
     const owner=clean(val(row,col(h,['Auditor_UID','Auditor UID']))),actorUid=clean(identity?.auditorUid||identity?.auditorId);
     if(!owner||!actorUid||owner!==actorUid)throw Error('AUDITOR_CANCEL_OWNERSHIP_DENIED');
     if(!expectedRevision)throw Error('AUDITOR_CANCEL_EXPECTED_REVISION_REQUIRED');
    }
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    const assignedCol=col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']),assignedBefore=assignedCol>=0?clean(row[assignedCol]):'',recipientEmail=directResolveAuditorEmail(vr[2]?.values||[],assignedBefore);
    const company=val(row,col(h,['Company'])),now=isoLocalStamp(),set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    for(const names of [
      ['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'],
      ['Date - Planned','Date – Planned','Date planned','Date Planned'],
      ['Date - Approved','Date – Approved','Date approved','Date Approved'],
      ['Audit days textual'],
      ['Planning JSON','PlanningJSON','Planning'],
      ['Hours planned','Planned hours','Hours Planned']
    ])set(names,'');
    set(['Status'],'Pending Planning');
    set(['Status since'],now);
    if(auditorMode)set(['Last auditor decision','Auditor decision'],'CANCEL');else set(['Last manager decision'],'CANCEL');
    set(['Last decision timestamp'],now);
    if(auditorMode)set(['Auditor comment (last)'],reason);else set(['Manager comment (last)'],reason);

    const av=vr[1]?.values||[],ah=av[0]||[],ca=col(ah,['Available']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),id1=col(ah,['Audit_ID_1']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),id2=col(ah,['Audit_ID_2']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),lu=col(ah,['Last_Updated']);
    if(id1<0&&id2<0)throw new Error('AVAILABILITY_SCHEMA_INVALID');
    const writes=[{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}];
    let availabilityRows=0;
    for(let i=1;i<av.length;i++){
      const r=(av[i]||[]).slice();while(r.length<ah.length)r.push('');let changed=false;
      if(id1>=0&&clean(r[id1])===auditId){if(s1>=0)r[s1]='';if(e1>=0)r[e1]='';r[id1]='';if(st1>=0)r[st1]='';changed=true;}
      if(id2>=0&&clean(r[id2])===auditId){if(s2>=0)r[s2]='';if(e2>=0)r[e2]='';r[id2]='';if(st2>=0)r[st2]='';changed=true;}
      if(!changed)continue;
      const has1=id1>=0&&clean(r[id1]),has2=id2>=0&&clean(r[id2]),soft=directSoftAvailabilityStatus(st1>=0?r[st1]:'')||directSoftAvailabilityStatus(st2>=0?r[st2]:'');
      if(ca>=0)r[ca]=(has1||has2||soft)?'NO':'YES';if(lu>=0)r[lu]=now.slice(0,16);
      writes.push({range:'Auditor Availability!A'+(i+1)+':'+a1col(ah.length)+(i+1),values:[r]});availabilityRows++;
    }

    const writeStarted=Date.now();await sheetsValuesBatchUpdate(writes);const writeMs=Date.now()-writeStarted;
    const actorEmail=clean(identity?.email).toLowerCase(),minuteStamp=now.slice(0,16),afterStatus='Pending Planning';
    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,actorEmail,actorRole:auditorMode?'AUDITOR':'MANAGER',beforeStatus,afterStatus,reason,source:auditorMode?'CLOUD_RUN_DIRECT_AUDITOR_CANCEL':'CLOUD_RUN_DIRECT_MANAGER_CANCEL',timestamp:now,action:'CANCEL'};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|'+afterStatus).digest('hex');
    const queueRows=[[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})]];
    const notificationEmail=auditorMode?canonicalManagerRecipient(vr[2]?.values||[]):recipientEmail;
    if(auditorMode&&!notificationEmail)throw Error('AUDITOR_CANCEL_MANAGER_RECIPIENT_MISSING');
    if(notificationEmail){
      const cancelPayload={eventType:auditorMode?'AUDIT_CANCELLED_BY_AUDITOR':'AUDIT_CANCELLED_BY_MANAGER',eventFamily:'RICH_OPERATIONAL',rendererProfile:'RICH_OPERATIONAL',deliveryProfile:'IMMEDIATE_RICH',company,auditId,actor:actorEmail,actorRole:auditorMode?'AUDITOR':'MANAGER',recipientRole:auditorMode?'MANAGER':'AUDITOR',recipientGroup:auditorMode?'MANAGER':'AUDITOR',recipientEmail:notificationEmail,resultStatus:afterStatus,displayStatus:afterStatus,comment:reason,assignedAuditor:assignedBefore,config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,digestGroup:'AUDITOR_OPERATIONAL',templateFamily:'RICH_OPERATIONAL',templateKeyDefault:auditorMode?'AUDIT_CANCELLED_BY_AUDITOR':'AUDIT_CANCELLED_BY_MANAGER',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:true,requireReason:true}};
      const bodyText=[auditorMode?'Audit cancelled by auditor':'Audit cancelled by manager','Company: '+company,'Audit ID: '+auditId,'Comment: '+reason].join('\\n'),hash=createHash('md5').update(notificationEmail+'|'+(auditorMode?'AUDIT_CANCELLED_BY_AUDITOR':'AUDIT_CANCELLED_BY_MANAGER')+'|'+auditId+'|'+now).digest('hex');
      queueRows.push([minuteStamp,'PENDING',auditorMode?'AUDIT_CANCELLED_BY_AUDITOR':'AUDIT_CANCELLED_BY_MANAGER',notificationEmail,auditId,company,(auditorMode?'Audit cancelled by auditor – ':'Audit cancelled by manager – ')+company+' – '+auditId,bodyText,0,'',hash,'',JSON.stringify({payload:cancelPayload})]);
    }
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}
    const sideEffectMs=Date.now()-sideStarted;
    return{success:true,auditId,action:'CANCEL',beforeStatus,newStatus:'Pending Planning',afterStatus:'PENDING_PLANNING',afterStatusDisplay:'Pending Planning',assignedTo:'',planningJson:'',hoursPlanned:0,sourceRevision:directRowRevision(h,row),directCommit:true,owner:auditorMode?'CLOUD_RUN_DIRECT_AUDITOR_CANCEL':'CLOUD_RUN_DIRECT_MANAGER_CANCEL',readMs,writeMs,writeCount:writes.length,availabilityRows,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}


async function directManagerReject(identity,body){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},reason=clean(options.reason||options.comment),expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!reason)throw new Error('ACTION_REASON_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now();
    const vr=await sheetsBatchGet([
      'Audit planning!A1:BW2000',
      'Auditor Availability!A:P',
      'Auditors!A1:Z256',
      'Rejected audits!A1:Z2000',
      'Companies!A1:AJ686',
      'Config_Scopes!A1:Z128',
      'Company_Scopes!A1:Z1000',
      'Audit_Obligations!A1:Z2000',
      'Audit_Visit_Obligations!A1:H2000'
    ]);
    const readMs=Date.now()-readStarted,ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');const found=findAudit(ap,auditId);
    const rejected=vr[3]?.values||[],rh=rejected[0]||[],rAuditId=col(rh,['Audit ID']);
    if(!found){
      const already=rAuditId>=0&&rejected.slice(1).some(r=>val(r,rAuditId)===auditId);
      if(already)return{success:true,idempotent:true,auditId,action:'REJECT',newStatus:'Rejected',afterStatus:'REJECTED',afterStatusDisplay:'Rejected',directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_REJECT',readMs,totalMs:Date.now()-started};
      throw new Error('AUDIT_NOT_FOUND');
    }
    const h=found.h,row=found.row.slice(),beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(beforeKey))throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    const company=val(row,col(h,['Company'])),location=val(row,col(h,['Location'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid']));
    if(!companyUid)throw new Error('COMPANY_UID_REQUIRED');
    const assignedBefore=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])),preassigned=val(row,col(h,['Preassigned Auditor','Preassigned auditor']));
    const datePlanned=dateOnly(val(row,col(h,['Date - Planned','Date planned','Date Planned']))),dateApproved=dateOnly(val(row,col(h,['Date - Approved','Date approved','Date Approved'])));
    const actorEmail=clean(identity?.email).toLowerCase(),recipientEmail=directResolveAuditorEmail(vr[2]?.values||[],assignedBefore),now=isoLocalStamp(),minuteStamp=now.slice(0,16);

    const cfg=scopeCatalog(vr[5]?.values||[]),scopes=scopesForAudit(found,cfg),scopeText=scopes.join('; ');

    const links=vr[8]?.values||[],lh=links[0]||[],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);
    const obs=vr[7]?.values||[],oh=obs[0]||[],oi=col(oh,['Obligation_ID','Obligation ID']),ocs=col(oh,['Company_Scope_ID','Company Scope ID']),ocu=col(oh,['Company_UID','Company UID']),osc=col(oh,['ScopeCode','Scope Code']),ost=col(oh,['Obligation_State','Obligation State']),oup=col(oh,['Updated_At','Updated At']),ocl=col(oh,['Closed_At','Closed At']);
    if([la,lo,ls,oi,ocs,ocu,osc,ost].some(x=>x<0))throw new Error('MODEL_C_REJECT_SCHEMA_INVALID');
    const activeObIds=new Set();
    for(let i=1;i<links.length;i++)if(val(links[i],la)===auditId&&val(links[i],ls).toUpperCase()==='ACTIVE')activeObIds.add(val(links[i],lo));
    if(!activeObIds.size)throw new Error('MODEL_C_NO_ACTIVE_OBLIGATIONS_FOR_REJECT');

    const obligationWrites=[],companyScopeIds=new Set(),rejectedScopeCodes=new Set(),terminalStates=new Set(['COMPLETED','CANCELLED','REJECTED']);
    for(let i=1;i<obs.length;i++){
      const obId=val(obs[i],oi);if(!activeObIds.has(obId))continue;
      if(val(obs[i],ocu)!==companyUid)throw new Error('MODEL_C_COMPANY_UID_MISMATCH');
      const rr=obs[i].slice();while(rr.length<oh.length)rr.push('');
      rr[ost]='REJECTED';if(oup>=0)rr[oup]=now;if(ocl>=0)rr[ocl]=now;
      obligationWrites.push({range:'Audit_Obligations!A'+(i+1)+':'+a1col(oh.length)+(i+1),values:[rr]});
      companyScopeIds.add(val(rr,ocs));rejectedScopeCodes.add(val(rr,osc));
    }
    if(!obligationWrites.length)throw new Error('MODEL_C_ACTIVE_OBLIGATIONS_NOT_FOUND');

    const cs=vr[6]?.values||[],csh=cs[0]||[],csid=col(csh,['Company_Scope_ID','Company Scope ID']),csuid=col(csh,['Company_UID','Company UID']),cscode=col(csh,['ScopeCode','Scope Code']),csactive=col(csh,['Active']),csupdated=col(csh,['Updated_At','Updated At']);
    if([csid,csuid,cscode,csactive].some(x=>x<0))throw new Error('MODEL_C_COMPANY_SCOPES_SCHEMA_INVALID');
    const companyScopeWrites=[];
    for(let i=1;i<cs.length;i++){
      if(!companyScopeIds.has(val(cs[i],csid)))continue;
      if(val(cs[i],csuid)!==companyUid)throw new Error('MODEL_C_COMPANY_SCOPE_UID_MISMATCH');
      const rr=cs[i].slice();while(rr.length<csh.length)rr.push('');rr[csactive]='NO';if(csupdated>=0)rr[csupdated]=now;
      companyScopeWrites.push({range:'Company_Scopes!A'+(i+1)+':'+a1col(csh.length)+(i+1),values:[rr]});
    }
    if(companyScopeWrites.length!==companyScopeIds.size)throw new Error('MODEL_C_COMPANY_SCOPE_NOT_FOUND');

    const av=vr[1]?.values||[],ah=av[0]||[],ca=col(ah,['Available']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),id1=col(ah,['Audit_ID_1']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),id2=col(ah,['Audit_ID_2']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),lu=col(ah,['Last_Updated']);
    if(id1<0&&id2<0)throw new Error('AVAILABILITY_SCHEMA_INVALID');
    const availabilityWrites=[];let availabilityRows=0;
    for(let i=1;i<av.length;i++){
      const rr=(av[i]||[]).slice();while(rr.length<ah.length)rr.push('');let changed=false;
      if(id1>=0&&clean(rr[id1])===auditId){if(s1>=0)rr[s1]='';if(e1>=0)rr[e1]='';rr[id1]='';if(st1>=0)rr[st1]='';changed=true;}
      if(id2>=0&&clean(rr[id2])===auditId){if(s2>=0)rr[s2]='';if(e2>=0)rr[e2]='';rr[id2]='';if(st2>=0)rr[st2]='';changed=true;}
      if(!changed)continue;
      const has1=id1>=0&&clean(rr[id1]),has2=id2>=0&&clean(rr[id2]),soft=directSoftAvailabilityStatus(st1>=0?rr[st1]:'')||directSoftAvailabilityStatus(st2>=0?rr[st2]:'');
      if(ca>=0)rr[ca]=(has1||has2||soft)?'NO':'YES';if(lu>=0)rr[lu]=now.slice(0,16);
      availabilityWrites.push({range:'Auditor Availability!A'+(i+1)+':'+a1col(ah.length)+(i+1),values:[rr]});availabilityRows++;
    }

    const companies=vr[4]?.values||[],ch=companies[0]||[],cuid=col(ch,['Company_UID','Company UID','CompanyUID']),cname=col(ch,['Company']),cactive=col(ch,['Active Audits','Active audits','Active audit','ActiveAudit','Active_Audits']);
    let companyWrite=null;
    if(cactive>=0){
      const remainingActive=obs.slice(1).some((r,idx)=>{
        if(val(r,ocu)!==companyUid)return false;
        const obId=val(r,oi),state=activeObIds.has(obId)?'REJECTED':val(r,ost).toUpperCase();
        return !terminalStates.has(state);
      });
      for(let i=1;i<companies.length;i++){
        if((cuid>=0&&val(companies[i],cuid)===companyUid)||(cname>=0&&val(companies[i],cname).toLowerCase()===company.toLowerCase())){
          const rr=companies[i].slice();while(rr.length<ch.length)rr.push('');rr[cactive]=remainingActive?'Yes':'No';
          companyWrite={range:'Companies!A'+(i+1)+':'+a1col(ch.length)+(i+1),values:[rr]};break;
        }
      }
    }

    let archiveAlready=false;
    if(rAuditId>=0)archiveAlready=rejected.slice(1).some(r=>val(r,rAuditId)===auditId);
    const archiveStarted=Date.now();
    if(!archiveAlready){
      if(!rh.length)throw new Error('REJECTED_AUDITS_SCHEMA_MISSING');
      const out=new Array(rh.length).fill(''),setR=(names,value)=>{const i=col(rh,names);if(i>=0)out[i]=value;};
      setR(['Company'],company);setR(['Location'],location);setR(['Scopes'],scopeText);setR(['Preassigned Auditor'],preassigned);setR(['Assigned to'],assignedBefore);
      setR(['Date - Planned'],datePlanned);setR(['Date - Approved'],dateApproved);setR(['Status'],beforeStatus);setR(['Reason / Comment'],reason);setR(['Date - Rejected'],now);
      setR(['Audit ID'],auditId);setR(['Manager_Email','Manager Email'],actorEmail);setR(['Company_UID','Company UID'],companyUid);
      await sheetsValuesAppend('Rejected audits!A:'+a1col(rh.length),[out]);
    }
    const archiveMs=Date.now()-archiveStarted;

    const writeData=[...obligationWrites,...companyScopeWrites,...availabilityWrites];if(companyWrite)writeData.push(companyWrite);
    const writeStarted=Date.now();if(writeData.length)await sheetsValuesBatchUpdate(writeData);const writeMs=Date.now()-writeStarted;

    const deleteStarted=Date.now();await sheetsDeleteRow('Audit planning',found.sourceRow);const deleteMs=Date.now()-deleteStarted;

    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,actorEmail,actorRole:'MANAGER',beforeStatus,afterStatus:'Rejected',reason,source:'CLOUD_RUN_DIRECT_MANAGER_REJECT',timestamp:now,action:'REJECT',scopes:[...rejectedScopeCodes]};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Rejected').digest('hex');
    const queueRows=[[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})]];
    if(recipientEmail){
      const payload={eventType:'AUDIT_REJECTED_BY_MANAGER',eventFamily:'RICH_OPERATIONAL',rendererProfile:'RICH_OPERATIONAL',deliveryProfile:'IMMEDIATE_RICH',company,companyUid,auditId,actor:actorEmail,actorRole:'MANAGER',recipientRole:'AUDITOR',recipientGroup:'AUDITOR',recipientEmail,resultStatus:'Rejected',displayStatus:'Rejected',comment:reason,scopes:[...rejectedScopeCodes],config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,digestGroup:'AUDITOR_OPERATIONAL',templateFamily:'RICH_OPERATIONAL',templateKeyDefault:'AUDIT_REJECTED_BY_MANAGER',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:true,requireReason:true}};
      const bodyText=['Audit rejected by manager','Company: '+company,'Audit ID: '+auditId,'Scopes: '+[...rejectedScopeCodes].join(', '),'Comment: '+reason].join('\\n'),hash=createHash('md5').update(recipientEmail+'|AUDIT_REJECTED_BY_MANAGER|'+auditId+'|'+now).digest('hex');
      queueRows.push([minuteStamp,'PENDING','AUDIT_REJECTED_BY_MANAGER',recipientEmail,auditId,company,'Audit rejected by manager – '+company+' – '+auditId,bodyText,0,'',hash,'',JSON.stringify({payload})]);
    }
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;

    return{success:true,auditId,action:'REJECT',beforeStatus,newStatus:'Rejected',afterStatus:'REJECTED',afterStatusDisplay:'Rejected',reason,directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_REJECT',scopesRejected:[...rejectedScopeCodes],companyScopesDeactivated:companyScopeWrites.length,obligationsRejected:obligationWrites.length,availabilityRows,archiveMs,archiveAlready,writeMs,deleteMs,sideEffectMs,sideEffectQueue,readMs,totalMs:Date.now()-started};
  });
}

const DIRECT_PLAN_LOCKS=new Map();
async function withDirectPlanLock(auditId,fn){
  // PLAN mutates shared auditor/date capacity. Serialize all PLAN commits inside
  // the single-instance DEV service so two different audits cannot both claim
  // the same free Availability slot after concurrent reads.
  const key='__GLOBAL_MANAGER_PLAN__',prev=DIRECT_PLAN_LOCKS.get(key)||Promise.resolve();let release;
  const gate=new Promise(r=>release=r),chain=prev.then(()=>gate);DIRECT_PLAN_LOCKS.set(key,chain);await prev;
  try{return await fn();}finally{release();if(DIRECT_PLAN_LOCKS.get(key)===chain)DIRECT_PLAN_LOCKS.delete(key);}
}
function directPlanNormBlocks(raw){
  const out=[];for(const x of Array.isArray(raw)?raw:[]){const date=dateOnly(x?.date),start=clean(x?.start),end=clean(x?.end),executionType=clean(x?.executionType||x?.workType||'ONSITE').toUpperCase()==='OFFSITE'?'OFFSITE':'ONSITE',execLoc=executionType==='OFFSITE'?'':(clean(x?.execLoc||x?.executionLocation||x?.location||'HQ')||'HQ'),slotComment=clean(x?.slotComment||x?.comment);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))throw new Error('PLANNING_BLOCK_INVALID');
    const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);if(sh<0||sh>23||eh<0||eh>23||![0,15,30,45].includes(sm)||![0,15,30,45].includes(em))throw new Error('PLANNING_BLOCK_QUARTER_HOUR_REQUIRED');const startMin=sh*60+sm,endMin=eh*60+em,hours=(endMin-startMin)/60;if(!(hours>0))throw new Error('PLANNING_BLOCK_INVALID');
    out.push({date,start,end,hours,executionType,execLoc,slotComment});
  }out.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.end.localeCompare(b.end));return out;
}
function overlaps(a,b){return clean(a.start)<clean(b.end)&&clean(b.start)<clean(a.end);}
async function visitCompositionPlan(targetAuditId,memberAuditIds,obValues,linkValues){
  const members=new Set((memberAuditIds||[]).map(clean).filter(Boolean)),out={targetAuditId:clean(targetAuditId),moves:[],sourceAuditIds:[],obligationIds:[]};if(!out.targetAuditId||!members.size)return out;if(!obValues?.length||!linkValues?.length)return out;const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),ou=col(oh,['Company_UID','Company UID']),os=col(oh,['Obligation_State','Obligation State']),obById=new Map();for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),activeByOb=new Map();for(let i=1;i<linkValues.length;i++){const r=linkValues[i],obId=val(r,lo);if(val(r,ls).toUpperCase()!=='ACTIVE'||!obId)continue;if(activeByOb.has(obId))throw new Error('VISIT_OBLIGATION_MULTIPLE_ACTIVE_LINKS');activeByOb.set(obId,{row:r,rowIndex:i+1,auditId:val(r,la),obligationId:obId});}let companyUid='';for(const x of activeByOb.values()){if(!members.has(x.auditId))continue;const ob=obById.get(x.obligationId);if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;const uid=val(ob,ou);if(companyUid&&uid&&uid!==companyUid)throw new Error('VISIT_COMPOSITION_COMPANY_MISMATCH');if(uid)companyUid=uid;out.obligationIds.push(x.obligationId);if(x.auditId!==out.targetAuditId)out.moves.push({sourceAuditId:x.auditId,obligationId:x.obligationId,oldLinkRow:x.rowIndex});}out.sourceAuditIds=[...new Set(out.moves.map(x=>x.sourceAuditId))];for(const sourceAuditId of out.sourceAuditIds){const active=[...activeByOb.values()].filter(x=>x.auditId===sourceAuditId&&!['COMPLETED','CANCELLED','REJECTED'].includes(val(obById.get(x.obligationId)||[],os).toUpperCase())),moving=new Set(out.moves.filter(x=>x.sourceAuditId===sourceAuditId).map(x=>x.obligationId));if(active.some(x=>!moving.has(x.obligationId)))throw new Error('VISIT_COMPOSITION_SOURCE_VISIT_NOT_EMPTY');}if(!out.obligationIds.length)throw new Error('VISIT_COMPOSITION_NO_ACTIVE_OBLIGATIONS');return out;
}

function directPlanningCommit(identity,body){
  if(process.env.AMS_RUNTIME_ENV==='PROD')throw new Error('PROD_LIFECYCLE_CANONICAL_WRITER_REQUIRED');
  const actorRole=clean(identity?.role).toUpperCase(),actorEmail=clean(identity?.email).toLowerCase(),started=Date.now(),auditId=clean(body?.auditId),auditorEmail=clean(body?.auditorEmail).toLowerCase(),auditorName=clean(body?.auditorName),sourceRevision=clean(body?.sourceRevision);
  const authorityPreflight=process.env.AMS_RUNTIME_ENV==='DEV'&&(process.env.AMS_DEV_FIRESTORE_PLANNING_AUTHORITY_ENABLED==='true'||process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true')&&body?.authorityPreflight===true;
  if(actorRole!=='MANAGER'&&actorRole!=='AUDITOR')throw new Error('PLANNING_ACTOR_ROLE_INVALID');
  if(actorRole==='AUDITOR'&&auditorEmail!==actorEmail)throw new Error('AUDITOR_CANNOT_PLAN_FOR_OTHER_AUDITOR');
  if(!auditId||!auditorEmail)throw new Error('PLANNING_REQUIRED_FIELDS_MISSING');
  const requested=directPlanNormBlocks(body?.blocks);if(!requested.length)throw new Error('PLANNING_REQUIRED_FIELDS_MISSING');if(new Set(requested.map(b=>b.date)).size>5)throw new Error('PLANNING_MAX_5_DAYS');for(let i=0;i<requested.length;i++)for(let j=i+1;j<requested.length;j++)if(requested[i].date===requested[j].date&&overlaps(requested[i],requested[j]))throw new Error('PLANNING_BLOCKS_OVERLAP');
  return withDirectPlanLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Auditors!A1:Z256','Auditor Availability!A:P','Concept Reservations!A1:P256','Config_Scopes!A1:Z128','Companies!A1:AJ686','Audit_Obligations!A1:Z1000','Audit_Visit_Obligations!A1:H1000','Log realized audits!A1:AZ2048']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');const found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const catalog=scopeCatalog(vr[4]?.values||[]),audit=project(found,catalog,vr[1]?.values||[]),companyCtx=companyPlanningContext(vr[5]?.values||[],audit.companyUid,audit.company),allowedExecLocs=new Set((companyCtx.locations||[]).map(x=>clean(x.code||x.name)).filter(Boolean));if(requested.some(b=>b.executionType==='ONSITE'&&!allowedExecLocs.has(clean(b.execLoc))))throw new Error('PLANNING_EXECUTION_LOCATION_INVALID');
    const currentStatus=clean(audit.status).toUpperCase().replace(/[\s-]+/g,'_'),currentPlanning=blocks(found.row[col(found.h,['Planning JSON','PlanningJSON','Planning'])]),sameBlocks=currentPlanning.length===requested.length&&currentPlanning.every((b,i)=>dateOnly(b?.date)===requested[i].date&&clean(b?.start)===requested[i].start&&clean(b?.end)===requested[i].end&&clean(b?.executionType||b?.workType||'ONSITE').toUpperCase()===requested[i].executionType&&clean(b?.execLoc||b?.executionLocation||b?.location||'HQ')===clean(requested[i].execLoc||'HQ')&&clean(b?.slotComment||b?.comment)===clean(requested[i].slotComment)),currentAssigned=clean(found.row[col(found.h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])]).toLowerCase();
    if(actorRole==='AUDITOR'){const assignedCanonical=directResolveAuditorEmail(vr[1]?.values||[],audit.assignedTo),preassignedCanonical=directResolveAuditorEmail(vr[1]?.values||[],audit.preassignedAuditor),owned=(assignedCanonical&&assignedCanonical===actorEmail)||(preassignedCanonical&&preassignedCanonical===actorEmail),freeSelfPlan=currentStatus==='PENDING_PLANNING'&&!assignedCanonical&&!preassignedCanonical;if(!audit.allowSelfPlanning||(!owned&&!freeSelfPlan))throw new Error('AUDITOR_SELF_PLANNING_NOT_AUTHORIZED');}
    if(((actorRole==='MANAGER'&&currentStatus==='APPROVED')||(actorRole==='AUDITOR'&&currentStatus==='PENDING_APPROVAL'))&&currentAssigned===auditorEmail&&sameBlocks)return{success:true,idempotent:true,auditId,newStatus:actorRole==='MANAGER'?'Approved':'Pending Approval',assignedTo:auditorEmail,planningJson:clean(found.row[col(found.h,['Planning JSON','PlanningJSON','Planning'])]),totalMs:Date.now()-started,readMs,writeMs:0,sideEffectMs:0,sideEffectQueue:{success:true,skipped:true,reason:'IDEMPOTENT_REPLAY'},owner:actorRole==='MANAGER'?'CLOUD_RUN_DIRECT_SHEETS_MANAGER_PLAN':'CLOUD_RUN_DIRECT_SHEETS_AUDITOR_SELF_PLAN'};
    if(sourceRevision&&sourceRevision!==clean(audit.sourceRevision))throw new Error('PLANNING_SOURCE_REVISION_CONFLICT');
    if(currentStatus!=='PENDING_PLANNING')throw new Error('STATUS_TRANSITION_BLOCKED');
    const assignmentHard=v211AssignmentHardCheck({auditorEmail,auditorValues:vr[1]?.values||[],catalog,scopeCodes:audit.scopes||[],companyValues:vr[5]?.values||[],companyUid:audit.companyUid,companyName:audit.company,logValues:vr[8]?.values||[],requestedDates:requested.map(b=>b.date)});if(!assignmentHard.ok)throw new Error(assignmentHard.reasons[0]);
    if(process.env.AMS_ROTATION_20_DIRECT_WRITER_ENABLED==='true'){
      const rotationAuditors=vr[1]?.values||[],rotationUidCol=col(rotationAuditors[0]||[],['Auditor_UID','Auditor UID']),rotationEmailCol=col(rotationAuditors[0]||[],['Email','E-mail']);
      if(rotationUidCol<0||rotationEmailCol<0)throw Error('ROTATION_DIRECT_AUDITOR_DIRECTORY_SCHEMA_MISSING');
      const rotationCandidates=rotationAuditors.slice(1).filter(row=>val(row,rotationEmailCol).toLowerCase()===auditorEmail);
      if(rotationCandidates.length!==1||!val(rotationCandidates[0],rotationUidCol))throw Error('ROTATION_DIRECT_AUDITOR_UID_UNRESOLVED');
      const rotationAuditorUid=val(rotationCandidates[0],rotationUidCol);
      await rotationDirectPlanGate20.enforceDirectPlanningRotation20({auditId,auditorUid:rotationAuditorUid,planningValues:ap,auditorValues:rotationAuditors,scopeValues:vr[4]?.values||[],logValues:vr[8]?.values||[],approvedExceptions:[]});
    }else{
      const rotationCheck=await directRotationRead(auditId,auditorEmail),rotationHard=v211RotationHardCheck(rotationCheck);if(!rotationHard.ok)throw new Error(rotationHard.reasons[0]);
    }
    const execution=executionConstraint(auditId,catalog,vr[6]?.values||[],vr[7]?.values||[]),from=dateOnly(audit.planningWindowFrom),to=dateOnly(audit.planningWindowTo);
    if(execution.mustCompleteBy&&requested.some(b=>b.date>execution.mustCompleteBy)&&body?.executionExceptionApproved!==true)throw new Error('EXECUTION_DEADLINE_APPROVAL_REQUIRED');
    if(requested.some(b=>(from&&b.date<from)||(to&&b.date>to)))throw new Error('PLANNING_WINDOW_BLOCKED');
    const total=requested.reduce((s,b)=>s+b.hours,0),formalTarget=Math.round(Number(audit.formalHours||audit.requiredHours||0)*100)/100,totalMinutes=requested.reduce((s,b)=>s+Math.round(Number(b.hours||0)*60),0),formalTargetMinutes=Math.round(formalTarget*60),planningDeltaMinutes=totalMinutes-formalTargetMinutes,offsiteHours=Math.round(requested.filter(b=>b.executionType==='OFFSITE').reduce((s,b)=>s+b.hours,0)*100)/100,offsitePolicy=audit.offsitePolicy||offsitePolicyForScopes(catalog,audit.scopes||[]);if(planningDeltaMinutes < -15)throw new Error('PLANNED_HOURS_BELOW_FORMAL_HOURS');if(planningDeltaMinutes > 15)throw new Error('PLANNED_HOURS_ABOVE_FORMAL_HOURS');if(offsiteHours>0&&offsitePolicy.requiresScopeAllocation)throw new Error('OFFSITE_MULTI_SCOPE_ALLOCATION_REQUIRED');if(offsiteHours-Number(offsitePolicy.maxOffsiteHours||0)>1e-9)throw new Error('OFFSITE_HOURS_ABOVE_SCOPE_MAX');const requestedVisitMembers=Array.isArray(body?.visitMembers)?body.visitMembers:[],requestedVisitAuditIds=[...new Set([auditId,...(Array.isArray(body?.visitAuditIds)?body.visitAuditIds:[]),...requestedVisitMembers.map(x=>x?.auditId)].map(clean).filter(Boolean))];if(requestedVisitAuditIds.some(x=>x!==auditId)){const companySet=ap.slice(1).map((row,i)=>({h:ap[0],row,sourceRow:i+2})).map(x=>project(x,catalog,vr[1]?.values||[])).filter(x=>x.companyUid===audit.companyUid),byId=new Map(companySet.map(x=>[x.auditId,x])),memberById=new Map(requestedVisitMembers.map(x=>[clean(x?.auditId),x]));for(const relatedId of requestedVisitAuditIds){if(relatedId===auditId)continue;const related=byId.get(relatedId);if(!related)throw new Error('VISIT_RELATED_AUDIT_NOT_FOUND');const member=memberById.get(relatedId);if(!member||!clean(member.sourceRevision))throw new Error('VISIT_RELATED_SOURCE_REVISION_REQUIRED');if(clean(member.sourceRevision)!==clean(related.sourceRevision))throw new Error('VISIT_RELATED_SOURCE_REVISION_CONFLICT');if(clean(related.status).toUpperCase().replace(/[\s-]+/g,'_')!=='PENDING_PLANNING')throw new Error('VISIT_RELATED_AUDIT_NOT_PENDING_PLANNING');const relatedExecution=executionConstraint(relatedId,catalog,vr[6]?.values||[],vr[7]?.values||[]),relatedFrom=dateOnly(related.planningWindowFrom),relatedTo=dateOnly(related.planningWindowTo);if(requested.some(b=>(relatedFrom&&b.date<relatedFrom)||(relatedTo&&b.date>relatedTo)))throw new Error('VISIT_RELATED_PLANNING_WINDOW_BLOCKED');if(relatedExecution.mustCompleteBy&&requested.some(b=>b.date>relatedExecution.mustCompleteBy)&&body?.executionExceptionApproved!==true)throw new Error('VISIT_RELATED_EXECUTION_DEADLINE_APPROVAL_REQUIRED');}if(requestedVisitAuditIds.length>1){const composition=visitCompositionPlan(auditId,requestedVisitAuditIds,vr[6]?.values||[],vr[7]?.values||[]);throw new Error('VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL');}}

    // Auditor self-planning must not consume another audit's active provisional reservation.
    // Recheck inside the canonical planning lock, using the fresh reservation snapshot.
    if(actorRole==='AUDITOR'){
      const reservationValues=vr[3]?.values||[],reservationHeaders=reservationValues[0]||[];
      const reservationAuditCol=col(reservationHeaders,['Audit ID','Audit_ID']);
      const reservationEmailCol=col(reservationHeaders,['Auditor Email','Auditor_Email']);
      const reservationBlocksCol=col(reservationHeaders,['Blocks JSON','Blocks_JSON','Blocks']);
      const reservationStateCol=col(reservationHeaders,['State']);
      if([reservationAuditCol,reservationEmailCol,reservationBlocksCol,reservationStateCol].some(i=>i<0))throw new Error('PROVISIONAL_RESERVATION_SCHEMA_INVALID');
      const auditStatusCol=col(ap[0]||[],['Status']);
      const auditIdCol=col(ap[0]||[],['Audit ID','Audit_ID','AuditId']);
      for(const reservationRow of reservationValues.slice(1)){
        if(clean(reservationRow[reservationStateCol]).toUpperCase()!=='ACTIVE')continue;
        if(clean(reservationRow[reservationEmailCol]).toLowerCase()!==auditorEmail)continue;
        const reservedAuditId=clean(reservationRow[reservationAuditCol]);
        if(!reservedAuditId||reservedAuditId===auditId)continue;
        const reservedAuditRow=ap.slice(1).find(row=>clean(row[auditIdCol])===reservedAuditId);
        if(!reservedAuditRow||clean(reservedAuditRow[auditStatusCol]).toUpperCase().replace(/[\s-]+/g,'_')!=='PENDING_PLANNING')continue;
        if(blocks(reservationRow[reservationBlocksCol]).some(reserved=>requested.some(b=>dateOnly(reserved.date)===b.date&&overlaps(b,{start:clean(reserved.start),end:clean(reserved.end)}))))throw new Error('PROVISIONAL_RESERVATION_AUDITOR_COLLISION');
      }
    }
    const av=vr[2]?.values||[],initialAvailabilityRowCount=av.length,ah=av[0]||[],cd=col(ah,['Date']),ce=col(ah,['Auditor_Email','Auditor Email','Email','E-mail']),ca=col(ah,['Available']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),id1=col(ah,['Audit_ID_1']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),id2=col(ah,['Audit_ID_2']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),lu=col(ah,['Last_Updated']);
    if([cd,ce,ca,s1,e1,id1,s2,e2,id2,st1,st2].some(x=>x<0))throw new Error('AVAILABILITY_SCHEMA_INVALID');
    const avRows=av.slice(1).map((row,i)=>({row:row.slice(),sheetRow:i+2,date:dateOnly(row[cd]),email:clean(row[ce]).toLowerCase()}));
    const touched=new Map();
    for(const x of avRows){let changed=false;if(clean(x.row[id1])===auditId){x.row[s1]='';x.row[e1]='';x.row[id1]='';x.row[st1]='';changed=true;}if(clean(x.row[id2])===auditId){x.row[s2]='';x.row[e2]='';x.row[id2]='';x.row[st2]='';changed=true;}if(changed){const has1=clean(x.row[id1]),has2=clean(x.row[id2]),soft=directSoftAvailabilityStatus(x.row[st1])||directSoftAvailabilityStatus(x.row[st2]);x.row[ca]=(has1||has2||soft)?'NO':'YES';if(lu>=0)x.row[lu]=isoLocalStamp();touched.set(x.sheetRow,x);}}
    for(const b of requested){
      let x=avRows.find(r=>r.email===auditorEmail&&r.date===b.date);if(!x){const width=ah.length,row=new Array(width).fill('');row[cd]=b.date;row[ce]=auditorEmail;row[ca]='YES';if(lu>=0)row[lu]=isoLocalStamp();x={row,sheetRow:av.length+1,date:b.date,email:auditorEmail,isNew:true};avRows.push(x);av.push(row);}
      const slots=[{s:s1,e:e1,id:id1,st:st1},{s:s2,e:e2,id:id2,st:st2}];
      for(const z of slots){const other=clean(x.row[z.id]);if(other&&other!==auditId&&overlaps(b,{start:clean(x.row[z.s]),end:clean(x.row[z.e])}))throw new Error('AVAILABILITY_COLLISION_'+b.date);}
      const hardSlots=slots.filter(z=>!clean(x.row[z.id])&&clean(x.row[z.st])&&!/^(DEFAULT_|MANUAL_|SYSTEM_DEFAULT|USER_MANUAL|CALENDAR|CALENDER)/i.test(clean(x.row[z.st])));
      const wholeDayHard=!yes(x.row[ca])&&hardSlots.some(z=>!clean(x.row[z.s])&&!clean(x.row[z.e]));
      const timedHard=hardSlots.some(z=>clean(x.row[z.s])&&clean(x.row[z.e])&&overlaps(b,{start:clean(x.row[z.s]),end:clean(x.row[z.e])}));
      if(wholeDayHard||timedHard)throw new Error('AVAILABILITY_HARD_BLOCK_'+b.date);
      let z=slots.find(q=>!clean(x.row[q.id]));if(!z)throw new Error('AVAILABILITY_CAPACITY_'+b.date);
      x.row[z.s]=b.start;x.row[z.e]=b.end;x.row[z.id]=auditId;x.row[z.st]=actorRole==='MANAGER'?'Manager Planned':'Auditor Planned';x.row[ca]='NO';if(lu>=0)x.row[lu]=isoLocalStamp();touched.set(x.sheetRow,x);
    }

    const h=ap[0]||[],row=found.row.slice(),set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    const now=isoLocalStamp(),formalHours=Math.round(Number(audit.formalHours||audit.requiredHours||0)*100)/100,planningJson=JSON.stringify({blocks:requested,formalHours,totalPlannedHours:Math.round(total*100)/100,offsiteHours,maxOffsiteHours:Number(offsitePolicy.maxOffsiteHours||0),auditorEmail,auditorName});
    const afterStatus=actorRole==='MANAGER'?'Approved':'Pending Approval';set(['Assigned to'],auditorEmail);
    const uidColumn=col(h,['Auditor_UID','Auditor UID']);
    if(uidColumn<0)throw Error('PLANNING_AUDITOR_UID_COLUMN_MISSING');{const auditorRows=vr[1]?.values||[],ah=auditorRows[0]||[],ae=col(ah,['E-mail','Email']),au=col(ah,['Auditor_UID','Auditor UID']);if(ae<0||au<0)throw Error('PLANNING_AUDITOR_UID_SCHEMA_MISSING');const matching=auditorRows.slice(1).filter(x=>val(x,ae).toLowerCase()===auditorEmail);if(matching.length!==1||!val(matching[0],au))throw Error('PLANNING_AUDITOR_UID_UNRESOLVED');row[uidColumn]=val(matching[0],au);}
set(['Date - Planned'],requested[0].date);if(actorRole==='MANAGER')set(['Date - Approved'],now.slice(0,10));set(['Status'],afterStatus);set(['Hours planned','Planned hours','Hours Planned'],formalHours);set(['Planning JSON'],planningJson);if(actorRole==='MANAGER')set(['Last manager decision'],'PLAN');else set(['Last auditor decision','Auditor decision'],'PLAN');set(['Last decision timestamp'],now);set(['Status since'],now);
    const maxTouchedAvailabilityRow=Math.max(0,...[...touched.values()].map(x=>x.sheetRow));if(maxTouchedAvailabilityRow&&!authorityPreflight)await sheetsEnsureRows('Auditor Availability',maxTouchedAvailabilityRow);
    const writes=[{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}];
    for(const x of touched.values())writes.push({range:'Auditor Availability!A'+x.sheetRow+':'+a1col(ah.length)+x.sheetRow,values:[x.row]});
    const cr=vr[3]?.values||[],ch=cr[0]||[],ci=col(ch,['Audit ID']),cs=col(ch,['State']),cu=col(ch,['Updated At']),cby=col(ch,['Released By']),cat=col(ch,['Released At']),creason=col(ch,['Release Reason']);
    for(let i=1;i<cr.length;i++){const rr=cr[i].slice();if(clean(rr[ci])!==auditId||clean(rr[cs]).toUpperCase()!=='ACTIVE')continue;rr[cs]='RELEASED';if(cu>=0)rr[cu]=now;if(cby>=0)rr[cby]=clean(identity?.email);if(cat>=0)rr[cat]=now;if(creason>=0)rr[creason]='CANONICAL_COMMIT';writes.push({range:'Concept Reservations!A'+(i+1)+':'+a1col(ch.length)+(i+1),values:[rr]});}
    const minuteStamp=now.slice(0,16),beforeStatus='Pending Planning';
    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,auditNumber:'',company:clean(audit.company),actorEmail,actorRole,beforeStatus,afterStatus,reason:'',hours:null,source:actorRole==='MANAGER'?'CLOUD_RUN_DIRECT_SHEETS_MANAGER_PLAN':'CLOUD_RUN_DIRECT_SHEETS_AUDITOR_SELF_PLAN',timestamp:now,action:'PLAN'};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|'+afterStatus).digest('hex');
    const trailRow=[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,clean(audit.company),'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})];
    const managerRecipient=actorRole==='AUDITOR'?canonicalManagerRecipient(vr[1]?.values||[]):'';
    const plannedEvent=actorRole==='MANAGER'?'AUDIT_PLANNED_BY_MANAGER':'AUDIT_PLANNED_BY_AUDITOR',recipientEmail=actorRole==='MANAGER'?auditorEmail:managerRecipient,recipientRole=actorRole==='MANAGER'?'AUDITOR':'MANAGER',templateFamily=actorRole==='MANAGER'?'RICH_OPERATIONAL':'MANAGER_APPROVAL_OPERATIONAL',displayStatus=actorRole==='MANAGER'?'Pending acceptance':'Pending Approval';
    const plannedPayload={eventType:plannedEvent,eventFamily:templateFamily,rendererProfile:templateFamily,deliveryProfile:actorRole==='MANAGER'?'IMMEDIATE_RICH':'IMMEDIATE_OPERATIONAL',company:clean(audit.company),companyUid:clean(audit.companyUid),auditId,actor:actorEmail,actorRole,recipientRole,recipientGroup:recipientRole,resultStatus:afterStatus,displayStatus,plannedDates:[...new Set(requested.map(x=>x.date))],plannedHours:Math.round(total*100)/100,blocks:requested,scopes:Array.isArray(audit.scopes)?audit.scopes:[],auditorEmail,auditorName,planningJson,config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,digestGroup:templateFamily,templateFamily,templateKeyDefault:plannedEvent,fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:true,requireReason:false}};
    const plannedSubject=(actorRole==='MANAGER'?'Audit planned by manager – ':'Audit planned by auditor – ')+clean(audit.company)+' – '+auditId,plannedBody=[actorRole==='MANAGER'?'Audit planned by manager':'Audit planned by auditor','Company: '+clean(audit.company),'Audit ID: '+auditId,'Auditor: '+auditorName+' <'+auditorEmail+'>','Planning: '+requested.map(x=>x.date+' '+x.start+'-'+x.end).join('; '),'Total hours: '+plannedPayload.plannedHours].join('\\n');
    const plannedHash=createHash('md5').update(recipientEmail+'|'+plannedEvent+'|'+auditId+'|'+planningJson).digest('hex'),plannedRow=[minuteStamp,'PENDING',plannedEvent,recipientEmail,auditId,clean(audit.company),plannedSubject,plannedBody,0,'',plannedHash,'',JSON.stringify({payload:plannedPayload})];
    if(authorityPreflight){
      // Validates the same business rules as the active writer above but
      // returns an immutable, complete set of Sheets projection rows only.
      return {success:true,authorityPreflight:true,auditId,
        expectedSourceRevision:clean(audit.sourceRevision),
        canonicalSnapshot:{auditId,sourceRow:found.sourceRow,headers:h,row,status:afterStatus,
          assignedTo:auditorEmail,blocks:requested,planningJson,sourceRevision:directRowRevision(h,row)},
        projectionWrites:writes,
        projectionPreconditions:writes.map(w=>{
          const match=/^(.+)!A(\\d+):/.exec(w.range);
          if(!match)throw Error('PLANNING_PREFLIGHT_RANGE_INVALID');
          const sources={'Audit planning':ap,'Auditor Availability':vr[2]?.values||[],'Concept Reservations':cr};
          const source=sources[match[1]];
          if(!source)throw Error('PLANNING_PREFLIGHT_TAB_INVALID');
          return {range:w.range,before:match[1]==='Auditor Availability'&&Number(match[2])>initialAvailabilityRowCount?[]:source[Number(match[2])-1]?.slice()||[]};
        }),
        notificationIntents:[trailRow,plannedRow],
        plannedHours:Math.round(total*100)/100,
        owner:'CLOUD_RUN_DEV_AUTHORITY_PREFLIGHT'};
    }
    const writeStarted=Date.now();await sheetsValuesBatchUpdate(writes);const writeMs=Date.now()-writeStarted;
    let sideEffectQueue={success:true};const sideEffectStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',[trailRow,plannedRow]);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)};}
    const sideEffectMs=Date.now()-sideEffectStarted;
    return{success:true,auditId,newStatus:afterStatus,assignedTo:auditorEmail,planningJson,totalMs:Date.now()-started,directCommit:true,readMs,writeMs,writeCount:writes.length,sideEffectMs,sideEffectQueue,owner:actorRole==='MANAGER'?'CLOUD_RUN_DIRECT_SHEETS_MANAGER_PLAN':'CLOUD_RUN_DIRECT_SHEETS_AUDITOR_SELF_PLAN'};
  });
}

async function focused(id,identity){
  const t=Date.now(),s=Date.now();
  const vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Auditors!A1:Z256','Auditor Availability!A:P','Concept Reservations!A1:P256','Config_Scopes!A1:Z128','Companies!A1:AJ686','Audit_Obligations!A1:Z1000','Audit_Visit_Obligations!A1:H1000','Log realized audits!A1:AZ2048']);
  const sheetMs=Date.now()-s,ap=vr[0]?.values||[];if(!ap.length||ap.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');const f=findAudit(ap,id);
  if(!f)return{ok:false,error:'AUDIT_NOT_FOUND',timing:{sheetsApiMs:sheetMs,totalMs:Date.now()-t}};
  const p=Date.now(),catalog=scopeCatalog(vr[4]?.values||[]),context=auditContext(ap,catalog),audit=project(f,catalog,vr[1]?.values||[]),actorRole=clean(identity?.role).toLowerCase(),actorEmail=clean(identity?.email).toLowerCase(),relatedOpenAudits=ap.slice(1).map((row,i)=>({h:ap[0],row,sourceRow:i+2})).filter(x=>val(x.row,col(x.h,['Audit ID']))!==id&&val(x.row,col(x.h,['Company_UID','Company UID','CompanyUid']))&&val(x.row,col(x.h,['Company_UID','Company UID','CompanyUid']))===audit.companyUid&&['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(val(x.row,col(x.h,['Status'])).toUpperCase().replace(/[\s-]+/g,'_'))).map(x=>{const z=project(x,catalog,vr[1]?.values||[]);const sameWindow=!!(dateOnly(audit.planningWindowFrom)&&dateOnly(audit.planningWindowTo)&&dateOnly(z.planningWindowFrom)&&dateOnly(z.planningWindowTo)&&dateOnly(audit.planningWindowFrom)<=dateOnly(z.planningWindowTo)&&dateOnly(z.planningWindowFrom)<=dateOnly(audit.planningWindowTo));const missingWindow=!dateOnly(z.planningWindowFrom)||!dateOnly(z.planningWindowTo),pending=z.status==='Pending Planning',alreadyPlanned=!!(z.assignedTo||z.planningJson);return{auditId:z.auditId,status:z.status,scopes:z.scopes,requiredHours:z.requiredHours,planningWindowFrom:dateOnly(z.planningWindowFrom),planningWindowTo:dateOnly(z.planningWindowTo),assignedTo:z.assignedTo,linkCandidate:pending,sameVisitCandidate:pending&&sameWindow,sameVisitBlockedReason:pending&&missingWindow?'NO_SHARED_CANONICAL_WINDOW':'',missingPlanningWindow:missingWindow,planningRelation:pending?'UNPLANNED_RELATED':alreadyPlanned?'ALREADY_PLANNED_RELATED':'RELATED',attentionRequired:pending};}),companyCtx=companyPlanningContext(vr[5]?.values||[],audit.companyUid,audit.company),auditorExclusions=companyAuditorExclusions(vr[5]?.values||[],audit.companyUid,audit.company);audit.candidateAuditors=(audit.candidateAuditors||[]).filter(x=>!auditorExclusions.has(clean(x.email).toLowerCase()));if(actorRole==='auditor'){const assigned=directResolveAuditorEmail(vr[1]?.values||[],audit.assignedTo),preassigned=directResolveAuditorEmail(vr[1]?.values||[],audit.preassignedAuditor),statusKey=clean(audit.status).toUpperCase().replace(/[\s-]+/g,'_'),ownAssigned=!!assigned&&assigned===actorEmail,ownPreassigned=!!preassigned&&preassigned===actorEmail;let hardEligible=false,eligibilityConflictReason='';if(statusKey==='PENDING_PLANNING'&&audit.allowSelfPlanning&&(ownAssigned||ownPreassigned||(!assigned&&!preassigned))){const hard=v211AssignmentHardCheck({auditorEmail:actorEmail,auditorValues:vr[1]?.values||[],catalog,scopeCodes:audit.scopes||[],companyValues:vr[5]?.values||[],companyUid:audit.companyUid,companyName:audit.company,logValues:vr[8]?.values||[],requestedDates:[]});const windowTo=dateOnly(audit.planningWindowTo),minDate=hard.minInterval&&hard.minInterval.minPlanningDate||'';if(!hard.ok)eligibilityConflictReason=(hard.reasons||[]).join('; ')||'AUDITOR_HARD_ELIGIBILITY_BLOCKED';else if(minDate&&windowTo&&windowTo<minDate)eligibilityConflictReason='MINIMUM_INTERVAL_OUTSIDE_PLANNING_WINDOW';else{const rotation=v211RotationHardCheck(await directRotationRead(id,actorEmail));hardEligible=rotation.ok;if(!rotation.ok)eligibilityConflictReason=(rotation.reasons||[]).join('; ')||'ROTATION_BLOCKED';}}const actor=v211ActorCapabilities({actorRole:'Auditor',actorEmail,status:audit.status,assignedToEmail:assigned,preassignedToEmail:preassigned,allowSelfPlanning:audit.allowSelfPlanning,hardEligible});if(!actor.visible)throw new Error('AUDITOR_AUDIT_ACCESS_FORBIDDEN');if(statusKey==='PENDING_PLANNING'&&!actor.capabilities.canPlan)throw new Error('AUDITOR_PLANNING_NOT_ELIGIBLE'+(eligibilityConflictReason?': '+eligibilityConflictReason:''));audit.candidateAuditors=(audit.candidateAuditors||[]).filter(x=>clean(x.email).toLowerCase()===actorEmail);audit.actorMode='AUDITOR';audit.selfPlanningPool=actor.selfPlanningPool;audit.capabilities=actor.capabilities;}else{audit.actorMode='MANAGER';audit.capabilities=v211ActorCapabilities({actorRole:'Manager',actorEmail,status:audit.status}).capabilities;}const visibleRelatedOpenAudits=actorRole==='auditor'?[]:relatedOpenAudits,companyPlanningSet=[audit,...visibleRelatedOpenAudits].map(z=>{const own=z.auditId===audit.auditId,raw=own?audit:z,exec=executionConstraint(raw.auditId,catalog,vr[6]?.values||[],vr[7]?.values||[]),committed=blocks(raw.planningJson),plannedDates=[...new Set(committed.map(b=>dateOnly(b?.date)).filter(Boolean))].sort();const obligationPlanning=obligationPlanningForAudit(raw.auditId,catalog,vr[6]?.values||[],vr[7]?.values||[]);return{auditId:raw.auditId,scopes:raw.scopes||[],status:raw.status,sourceRevision:raw.sourceRevision||'',requiredHours:Number(raw.requiredHours||0),formalHours:Number(raw.formalHours||raw.requiredHours||0),maxOffsiteHours:Number(raw.maxOffsiteHours||maxOffsiteHoursForScopes(catalog,raw.scopes||[])||0),obligations:obligationPlanning,planningWindowFrom:dateOnly(raw.planningWindowFrom),planningWindowTo:dateOnly(raw.planningWindowTo),mustCompleteBy:exec.mustCompleteBy||'',cycleKey:exec.cycleKey||'',plannedDates,planningState:plannedDates.length?'COMMITTED':raw.status==='Pending Planning'?'UNPLANNED':'LIFECYCLE_PLANNED',isPrimary:own};});audit.companyPlanningSet=companyPlanningSet;audit.preferredAuditMonths=companyCtx.preferredAuditMonths;audit.locations=companyCtx.locations;audit.companyContext=companyCtx;audit.relatedOpenAudits=visibleRelatedOpenAudits;audit.hasRelatedOpenAudits=visibleRelatedOpenAudits.length>0;const execution=executionConstraint(id,catalog,vr[6]?.values||[],vr[7]?.values||[]),minInterval=minimumIntervalConstraint(audit,catalog,vr[8]?.values||[]);audit.minPlanningDate=minInterval.minPlanningDate;audit.minIntervalByScope=minInterval.byScope;audit.cycleKey=execution.cycleKey;audit.mustCompleteBy=execution.mustCompleteBy;audit.executionConstraintSource=execution.source;const emails=audit.candidateAuditors.map(x=>x.email),from=dateOnly(audit.planningWindowFrom)||dateOnly(isoLocalStamp()),deadline=execution.mustCompleteBy,overdue=!!(deadline&&deadline<from),to=dateOnly(audit.planningWindowTo)||(!overdue&&deadline?deadline:dateOnly(new Date(Date.now()+90*86400000).toISOString()));audit.executionDeadlineOverdue=overdue;const availability=availabilityProjection(vr[2]?.values||[],audit.candidateAuditors,from,to,context),reservations=reservationProjection(vr[3]?.values||[],emails,from,to,context);
  return{
    ok:true,
    proof:'AMS_CLOUD_RUN_DIRECT_SHEETS_R8_SESSION_ENFORCED',
    build:BUILD,
    data:{
      period:{from,to},
      audit,
      advisory:{period:{from,to},rows:[{...audit,advisoryState:audit.candidateAuditors.length?'READY':'NO_CANDIDATES',advisoryReason:audit.candidateAuditors.length?'':'NO_HARD_QUALIFIED_AUDITORS',requiresCanonicalRefresh:false,hoursToPlan:null,hoursToPlanState:'DEFERRED'}],candidateAuditorEmails:emails},
      overlays:{period:{from,to},availability:{byAuditorEmail:availability},reservations},
      sourceCounts:{auditPlanning:Math.max(0,ap.length-1),auditors:Math.max(0,(vr[1]?.values||[]).length-1),availability:Math.max(0,(vr[2]?.values||[]).length-1),conceptReservations:Math.max(0,(vr[3]?.values||[]).length-1),configScopes:Math.max(0,(vr[4]?.values||[]).length-1),companies:Math.max(0,(vr[5]?.values||[]).length-1)}
    },
    timing:{sheetsApiMs:sheetMs,projectionMs:Date.now()-p,totalMs:Date.now()-t}
  };
}

http.createServer(async(req,res)=>{if(req.method==='OPTIONS'){if(!ORIGIN)return send(res,403,{ok:false,error:'CORS_DISABLED'});res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','access-control-allow-credentials':'true','vary':'Origin'});return res.end();}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health')return send(res,200,{ok:true,service:'ams-hot-read-proof',build:BUILD,mode:'DIRECT_SHEETS_READ_CANONICAL_GAS_WRITE',ssotConfigured:!!SID,corsConfigured:!!ORIGIN,sessionSecretConfigured:sessionConfigured(),sessionSecretPresent:SESSION_SECRET.length>0,sessionSecretLength:SESSION_SECRET.length,writeUrlConfigured:!!GAS_WRITE_URL,writeBridgeSecretConfigured:WRITE_KEY.length>=32,authState:sessionConfigured()?'SESSION_EXCHANGE_READY':'PENDING_SESSION_SECRET'});
  if(u.pathname==='/planning'&&req.method==='GET'){const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});const id=clean(u.searchParams.get('auditId'));if(!id)return send(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});if(!GAS_WRITE_URL)return send(res,500,{ok:false,error:'GAS_DEV_WRITE_URL_NOT_CONFIGURED'});const target=new URL(GAS_WRITE_URL);target.searchParams.set('action','planningworkspace');target.searchParams.set('role','Manager');target.searchParams.set('auditId',id);res.writeHead(303,{'location':target.toString(),'cache-control':'no-store'});return res.end();}
  if(u.pathname==='/manager-portal.js'&&req.method==='GET'){const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'});return res.end(MANAGER_PORTAL_JS);}
  if(u.pathname==='/'&&req.method==='GET'){const s=await sessionFromRequestValidated(req);if(!s)return html(res,401,'<!doctype html><meta charset="utf-8"><title>AMS DEV</title><h1>AMS DEV</h1><p>Application session required.</p>');if(!['manager','auditor'].includes(clean(s.role).toLowerCase()))return html(res,403,'<!doctype html><meta charset="utf-8"><title>AMS DEV</title><h1>Role not available</h1>');return html(res,200,MANAGER_PORTAL_HTML);}
  if(u.pathname==='/auth/legacy-handoff'&&req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});const form=new URLSearchParams(raw);try{const identity=await validateLegacyIdentity(form.get('token'),form.get('role'),form.get('deviceId'));if(!identity.ok)return send(res,401,identity);const token=issueSession(identity);res.writeHead(303,{'set-cookie':sessionCookie(token),'location':'/','cache-control':'no-store'});return res.end();}catch(e){return send(res,500,{ok:false,error:'IDENTITY_HANDOFF_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/internal/fast-otp-session'&&req.method==='POST'){
    if(process.env.AMS_RUNTIME_ENV!=='DEV'||process.env.AMS_AUTH_FAST_OTP_ENABLED!=='true'||!sessionConfigured())return send(res,404,{ok:false,error:'NOT_FOUND'});
    if(!safeEq(clean(req.headers['x-ams-internal-secret']),SESSION_SECRET))return send(res,403,{ok:false,error:'FORBIDDEN'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>2048)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let data;try{data=JSON.parse(raw);}catch{return send(res,400,{ok:false,error:'BAD_JSON'});}
    const email=clean(data?.email).toLowerCase(),role=clean(data?.role),ttl=data?.remember===true?14*86400:7200,deviceId=clean(data?.deviceId);
    if(!/^[a-f0-9]{64}$/.test(deviceId)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!['Manager','Auditor'].includes(role))return send(res,400,{ok:false,error:'INVALID_IDENTITY'});
    let auditorUid='';
    if(role==='Auditor'){
      const current=await validateVersionedAuditorLogin(email);
      if(!current.ok||!current.uid||current.uid!==clean(data.auditorUid))return send(res,403,{ok:false,error:'AUDITOR_UID_NOT_CURRENT'});
      auditorUid=current.uid;
    }
    const deviceProof=createHash('sha256').update(SESSION_SECRET+':'+deviceId).digest('hex');
    const token=issueSession({email,role,auditorUid,deviceHash:createHash('sha256').update(deviceProof).digest('hex'),legacyTokenExpiresAt:Date.now()+ttl*1000});
    return send(res,200,{ok:true},{'set-cookie':[sessionCookie(token,data.remember===true),'ams_auth_device='+deviceProof+(data.remember===true?'; Max-Age='+ttl:'')+'; Path=/; HttpOnly; Secure; SameSite=Lax']});
  }
  if(u.pathname==='/api/v1/session/exchange'&&req.method==='POST'){if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}');}catch{return send(res,400,{ok:false,error:'BAD_JSON'});}try{const identity=await validateLegacyIdentity(b.token,b.role,b.deviceId);if(!identity.ok)return send(res,401,identity);const token=issueSession(identity);return send(res,200,{ok:true,identity:{email:identity.email,role:identity.role},expiresIn:verifySession(token).exp-Math.floor(Date.now()/1000)},{'set-cookie':sessionCookie(token,b.remember===true)});}catch(e){return send(res,500,{ok:false,error:'IDENTITY_EXCHANGE_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/manager/auditor-identity/backfill-preview'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{return send(res,200,await auditorUidBackfillPreviewRead());}
    catch(e){return send(res,409,{ok:false,error:'UID_BACKFILL_PREVIEW_FAILED',detail:clean(e.message)});}
  }
  if(u.pathname==='/api/v1/manager/auditor-identity/firestore-write-probe'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{const result=await auditorEmailLockWriteProbe();return send(res,result.ok?200:409,result);}
    catch(e){return send(res,503,{ok:false,reason:'FIRESTORE_WRITE_PROBE_UNCONFIRMED',detail:clean(e.message)});}
  }
  if(u.pathname==='/api/v1/manager/auditor-identity/lock-readiness'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const [lock,identity]=await Promise.all([auditorEmailLockReadiness(),auditorIdentityReadinessRead()]);
      return send(res,200,{ok:true,lockReady:lock.ready,identityReady:identity.ready===true,reason:lock.reason,
        uidLoginEnabled:process.env.AMS_AUDITOR_UID_LOGIN_ENABLED==='true',
        emailWriteEnabled:process.env.AMS_AUDITOR_EMAIL_CHANGE_WRITE_ENABLED==='true',
        lockEnabled:process.env.AMS_AUDITOR_IDENTITY_DISTRIBUTED_LOCK_ENABLED==='true',
        environment:clean(process.env.AMS_RUNTIME_ENV)});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_EMAIL_LOCK_READINESS_UNCONFIRMED',detail:clean(e.message)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-identity/readiness'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{return send(res,200,await auditorIdentityReadinessRead());}
    catch(e){return send(res,409,{ok:false,error:'IDENTITY_READINESS_FAILED',detail:clean(e.message)});}
  }
  if(u.pathname==='/api/v1/planning/rotation-direct'&&req.method==='GET'){const sess=await sessionFromRequestValidated(req);if(!sess)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(!['manager','auditor'].includes(clean(sess.role).toLowerCase()))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});const auditId=clean(u.searchParams.get('auditId')),auditorEmail=clean(u.searchParams.get('auditorEmail')).toLowerCase();if(!auditId||!auditorEmail)return send(res,400,{ok:false,error:'ROTATION_REQUIRED_FIELDS_MISSING'});if(clean(sess.role).toLowerCase()==='auditor'&&auditorEmail!==clean(sess.email).toLowerCase())return send(res,403,{ok:false,error:'AUDITOR_CANNOT_CHECK_OTHER_AUDITOR'});try{return send(res,200,await directRotationRead(auditId,auditorEmail));}catch(e){return send(res,500,{ok:false,error:'DIRECT_ROTATION_READ_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/manager/extension-direct'&&req.method==='POST'){
    const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{const out=await directManagerExtension(s,b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_EXTENSION_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/accept-direct'&&req.method==='POST'){
    const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='accept';const out=await lifecycleAuthorityPreflight20(s,b,'ACCEPT',()=>directManagerAcceptOnBehalf(s,b));return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_ACCEPT_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/approve-direct'&&req.method==='POST'){
    const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='approve';const out=await lifecycleAuthorityPreflight20(s,b,'APPROVE',()=>b.authorityPreflight===true&&process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'?directManagerApprove(s,b):canonicalManagerAction(s,b));return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_APPROVE_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/reject-direct'&&req.method==='POST'){
    const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='reject';const out=await lifecycleAuthorityPreflight20(s,b,'REJECT',()=>b.authorityPreflight===true&&process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'?directManagerReject(s,b):canonicalManagerAction(s,b));return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_REJECT_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/internal/auditor/complete-direct'&&req.method==='POST'){
    if(!WRITE_KEY)return send(res,503,{ok:false,error:'WRITE_BRIDGE_NOT_CONFIGURED'});
    const supplied=clean(req.headers['x-ams-bridge-key']);
    if(!supplied||!safeEq(supplied,WRITE_KEY))return send(res,403,{ok:false,error:'BRIDGE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const actorEmail=clean(b.actorEmail).toLowerCase();if(!actorEmail)return send(res,400,{ok:false,error:'AUDITOR_EMAIL_REQUIRED'});
    try{b.action='complete';const out=await directAuditorComplete({email:actorEmail,role:'Auditor'},b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_AUDITOR_COMPLETE_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/complete-direct'&&req.method==='POST'){
    const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='complete';const out=await lifecycleAuthorityPreflight20(s,b,'COMPLETE',()=>directManagerComplete(s,b));return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_COMPLETE_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/cancel-direct'&&req.method==='POST'){
    const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{
      b.action='cancel';
      const out=await lifecycleAuthorityPreflight20(s,b,'CANCEL',()=>b.authorityPreflight===true&&process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'?directManagerCancel(s,b):canonicalManagerAction(s,b));
      return send(res,out&&out.success===false?409:200,out);
    }catch(e){
      return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_CANCEL_BLOCKED',detail:clean(e?.message||e)});
    }
  }
  if(u.pathname==='/api/v1/planning/direct-commit'&&req.method==='POST'){const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(!['manager','auditor'].includes(clean(s.role).toLowerCase()))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>65536)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}try{return send(res,200,await directPlanningCommit(s,b));}catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_PLANNING_COMMIT_BLOCKED',detail:clean(e?.message||e)});}}

  if(u.pathname==='/api/v1/auditor/email-action-read'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{success:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='auditor'||!clean(actor.auditorUid||actor.auditorId))return send(res,403,{success:false,error:'AUDITOR_UID_REQUIRED'});
    const auditId=clean(u.searchParams.get('auditId'));
    if(!/^[\p{L}\p{N}_,.-]{1,120}$/u.test(auditId))return send(res,400,{success:false,error:'INVALID_AUDIT_ID'});
    try{
      const rows=(await sheetsBatchGet(['Audit planning!A1:BW2000']))[0]?.values||[];
      const found=findAudit(rows,auditId);
      if(!found)return send(res,404,{success:false,error:'AUDIT_NOT_FOUND'});
      const uid=clean(val(found.row,col(found.h,['Auditor_UID','Auditor UID'])));
      if(!uid||uid!==clean(actor.auditorUid||actor.auditorId))return send(res,403,{success:false,error:'AUDITOR_ACTION_NOT_ASSIGNED'});
      const status=directStatusKey(val(found.row,col(found.h,['Status'])));
      const allowedActions=status==='APPROVED'?['ACCEPT']:status==='PENDING_APPROVAL'?['CANCEL']:[];
      return send(res,200,{success:true,rows:[{auditId,statusKey:status,allowedActions,sourceRevision:directRowRevision(found.h,found.row)}]});
    }catch(e){return send(res,503,{success:false,error:'EMAIL_AUDIT_READ_FAILED'});}
  }
  if(u.pathname==='/api/v1/auditor/action'&&req.method==='POST'){
    const acceptStarted=Date.now(),acceptPerf={};let acceptAuditId='',acceptAction='';
    const acceptRecord=(phase,detail)=>{if(acceptAction!=='ACCEPT')return;console.log(JSON.stringify({event:'AMS_ACCEPT_TIMING_20',phase,auditId:acceptAuditId,totalMs:Date.now()-acceptStarted,stages:acceptPerf,...(detail||{})}));};
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{success:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='auditor'||!clean(actor.auditorUid||actor.auditorId))return send(res,403,{success:false,error:'AUDITOR_UID_REQUIRED'});
    let sameOrigin=false;
    try{const origin=new URL(String(req.headers.origin||''));sameOrigin=origin.protocol==='https:'&&(origin.host===String(req.headers.host||'')||(process.env.AMS_RUNTIME_ENV==='DEV'&&origin.origin==='https://ams-transport-proof-510075419067.europe-west1.run.app'));}catch{}
    if(!sameOrigin)return send(res,403,{success:false,error:'ORIGIN_FORBIDDEN'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(res,413,{success:false,error:'REQUEST_TOO_LARGE'});}
    let body={};try{body=JSON.parse(raw);}catch{return send(res,400,{success:false,error:'INVALID_JSON'});}
    const auditId=clean(body.auditId),action=clean(body.action).toUpperCase(),options=body.options||{},expectedRevision=clean(options.expectedRevision),comment=clean(options.reason||options.comment);
    acceptAuditId=auditId;acceptAction=action;
    if(!auditId||auditId.length>256||!['ACCEPT','CANCEL','COMPLETE'].includes(action)||!(/^[a-f0-9]{24}$/.test(expectedRevision)))return send(res,400,{success:false,error:'INVALID_AUDITOR_ACTION_REQUEST'});
    if(action==='CANCEL'&&!comment)return send(res,400,{success:false,error:'CANCEL_REASON_REQUIRED'});
    if(process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'&&body.authorityPreflight===true){
      if(action==='CANCEL'||action==='COMPLETE'){
       try{
        const effectiveBody={auditId,authorityPreflight:true,options:{...options,expectedRevision}};
        const out=await lifecycleAuthorityPreflight20(actor,effectiveBody,action,()=>
          action==='CANCEL'?directManagerCancel(actor,effectiveBody,true):directAuditorComplete(actor,effectiveBody));
        return send(res,out?.success===true?200:409,out);
       }catch(error){return send(res,409,{success:false,error:clean(error?.message||error)});}
      }
      if(action!=='ACCEPT')return send(res,409,{success:false,error:'AUDITOR_LIFECYCLE_ATOMIC_PREFLIGHT_NOT_MIGRATED'});
      try{
       const vr=await sheetsBatchGet(['Audit planning!A1:BW2000','Auditors!A1:Z256']),ap=vr[0]?.values||[],av=vr[1]?.values||[];
       if(ap.length>=2000||!ap.length)throw Error('DIRECT_ACCEPT_PREFLIGHT_CANONICAL_INCOMPLETE');
       const found=findAudit(ap,auditId);if(!found)throw Error('AUDIT_NOT_FOUND');
       const builder=buildDirectAuditorAcceptSheets20({
        actor:{role:'AUDITOR',uid:clean(actor.auditorUid||actor.auditorId),email:clean(actor.email)},
        auditId,expectedRevision,values:{audit:ap,auditors:av},
        sheetIds:{audit:1,queue:2},stamp:new Date().toISOString()
       });
       const row=found.row.slice();
       const queue=[];
       for(const request of builder.requests){
        if(request.updateCells){
         const index=request.updateCells.range.startColumnIndex;
         if(request.updateCells.range.startRowIndex!==found.sourceRow-1||request.updateCells.range.endColumnIndex!==index+1)throw Error('DIRECT_ACCEPT_PREFLIGHT_OUT_OF_SCOPE');
         row[index]=request.updateCells.rows?.[0]?.values?.[0]?.userEnteredValue?.stringValue??'';
        }else if(request.appendCells){
         const values=request.appendCells.rows?.[0]?.values?.map(x=>x.userEnteredValue?.stringValue??'');
         if(!values?.length)throw Error('DIRECT_ACCEPT_PREFLIGHT_QUEUE_INVALID');
         queue.push({range:'Notification Queue!A:M',values:[values]});
        }else throw Error('DIRECT_ACCEPT_PREFLIGHT_REQUEST_UNSUPPORTED');
       }
       if(queue.length!==1)throw Error('DIRECT_ACCEPT_PREFLIGHT_TRAIL_REQUIRED');
       const range='Audit planning!A'+found.sourceRow+':'+a1col(found.h.length)+found.sourceRow;
       return send(res,200,{success:true,authorityPreflight:true,auditId,action:'ACCEPT',
        expectedSourceRevision:directRowRevision(found.h,found.row),
        canonicalSnapshot:{auditId,sourceRow:found.sourceRow,headers:found.h,row,status:'Accepted',
         assignedTo:val(row,col(found.h,['Assigned to','Assigned auditor','Auditor'])),sourceRevision:directRowRevision(found.h,row)},
        projectionWrites:[{range,values:[row]}],projectionPreconditions:[{range,before:found.row.slice()}],
        appendIntents:queue,owner:'CLOUD_RUN_DEV_AUDITOR_ACCEPT_PREFLIGHT'});
      }catch(error){return send(res,409,{success:false,error:clean(error?.message||error)});}
    }
    if(action==='ACCEPT' && process.env.AMS_AUDITOR_DIRECT_ACCEPT_ENABLED==='true'){
      try{
        const result=await directAuditorAcceptSheets20(actor,{auditId,expectedRevision});
        acceptRecord('direct_sheets_confirmed',{totalMs:Date.now()-acceptStarted,owner:result.owner,readMs:result.readMs,writeMs:result.writeMs});
        return send(res,200,{...result,acceptTiming:{
          totalMs:Date.now()-acceptStarted,transport:'CLOUD_RUN_DIRECT_SHEETS',
          directReadMs:result.readMs,directWriteMs:result.writeMs
        }});
      }catch(error){
        const code=clean(error?.message||error);
        acceptRecord('direct_sheets_rejected',{error:code});
        const outcomeUnknown=code.includes('OUTCOME_UNCONFIRMED_DO_NOT_RETRY');
        return send(res,outcomeUnknown||code==='DIRECT_AUDITOR_ACCEPT_EXCLUSIVE_WRITER_CUTOVER_REQUIRED'?503:409,
          {success:false,error:code,safeToRetry:!outcomeUnknown});
      }
    }
    if(!GAS_WRITE_URL||!WRITE_KEY)return send(res,503,{success:false,error:'CANONICAL_WRITER_UNAVAILABLE'});
    try{
      // GAS is the canonical transactional authorization point for ACCEPT:
      // validates actor UID/email, assignment, status and revision under script lock.
      // Avoid duplicate Google Sheets authorization read in Cloud Run.
      if(action!=='ACCEPT'){
        // A status-changing action is authorized against one canonical live audit row.
        // Auditor Grid visibility is a presentation read and must not veto a UID-owned action.
        const readStart=Date.now();
        const auditValues=(await sheetsBatchGet(['Audit planning!A1:BW2000']))[0]?.values||[];
        acceptPerf.canonicalReadMs=Date.now()-readStart;
        const current=findAudit(auditValues,auditId);
        if(!current)return send(res,404,{success:false,error:'AUDIT_NOT_FOUND'});
        const h=current.h,r=current.row,uid=clean(val(r,col(h,['Auditor_UID','Auditor UID']))),actorUid=clean(actor.auditorUid||actor.auditorId);
        const currentStatus=directStatusKey(val(r,col(h,['Status'])));
        const allowed=(action==='ACCEPT'&&currentStatus==='APPROVED')||(action==='CANCEL'&&currentStatus==='PENDING_APPROVAL')||(action==='COMPLETE'&&currentStatus==='ACCEPTED');
        if(!uid||uid!==actorUid)return send(res,403,{success:false,error:'AUDITOR_ACTION_NOT_ASSIGNED'});
        if(!allowed)return send(res,409,{success:false,error:'AUDITOR_ACTION_STATUS_CONFLICT',currentStatus});
        if(directRowRevision(h,r)!==expectedRevision)return send(res,409,{success:false,error:'AUDIT_REVISION_CONFLICT'});
        if(action==='COMPLETE'){
          try{const result=await directAuditorComplete(actor,{auditId,action:'complete',options:{hoursDedicated:Number(options.hoursDedicated),expectedRevision}});return send(res,result&&result.success===false?409:200,result)}
          catch(error){return send(res,409,{success:false,error:'AUDITOR_COMPLETE_FAILED',detail:clean(error.message)})}
        }
  
      }
      const url=new URL(GAS_WRITE_URL);
      if(url.protocol!=='https:')return send(res,503,{success:false,error:'CANONICAL_WRITER_HTTPS_REQUIRED'});
      url.searchParams.set('action','externalauditoraction20');
      const gasStart=Date.now();
      const first=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bridgeKey:WRITE_KEY,actorRole:'AUDITOR',actorEmail:clean(actor.email).toLowerCase(),auditorUid:clean(actor.auditorUid||actor.auditorId),auditId,action,expectedRevision,comment}),redirect:'manual',signal:AbortSignal.timeout(60000)});
      acceptPerf.gasPostResponseMs=Date.now()-gasStart;
      acceptPerf.gasPostHttpStatus=first.status;
      let reply=first;
      if([301,302,303,307,308].includes(first.status)){
        const redirectStarted=Date.now();
        const loc=first.headers.get('location'),target=loc?new URL(loc,url):null;
        if(!target||target.protocol!=='https:'||!target.hostname.endsWith('.googleusercontent.com'))return send(res,503,{success:false,error:'CANONICAL_RESPONSE_REDIRECT_REJECTED'});
        reply=await fetch(target,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(60000)});
        acceptPerf.gasRedirectReadMs=Date.now()-redirectStarted;
      }
      const verifyActionAfterLostReply=async()=>{
        try{
          const rows=(await sheetsBatchGet(['Audit planning!A1:BW2000']))[0]?.values||[];
          const found=findAudit(rows,auditId),actual=found?directStatusKey(val(found.row,col(found.h,['Status']))):'';
          const expected=action==='ACCEPT'?'ACCEPTED':'PENDING_PLANNING';
          if(actual===expected)return send(res,200,{success:true,verifiedBy:'CANONICAL_AUDIT_STATUS_READBACK',auditId,action,newStatus:expected,afterStatus:expected,statusResultVerified:true});
        }catch(err){}
        return send(res,503,{success:false,error:'AUDITOR_ACTION_OUTCOME_UNCONFIRMED_DO_NOT_RETRY'});
      };
      acceptPerf.gasRoundtripMs=Date.now()-gasStart;
      acceptPerf.gasResponseHttpStatus=reply.status;
      if(!reply.ok){acceptRecord('gas_non_ok',{httpStatus:reply.status});return await verifyActionAfterLostReply();}
      let result;try{result=JSON.parse(await reply.text());}catch{return await verifyActionAfterLostReply();}
      acceptPerf.gasExecution=result&&result.acceptPerf||null;
      if(action==='ACCEPT' && Number.isFinite(Number(result?.acceptPerf?.totalMs))){
        // Cross-runtime diagnostic only: this is NOT proven network latency.
        acceptPerf.gasHandlerReportedMs=Number(result.acceptPerf.totalMs);
        acceptPerf.gasOutsideHandlerMs=Math.max(0,acceptPerf.gasPostResponseMs-acceptPerf.gasHandlerReportedMs);
        acceptPerf.gasOutsideHandlerMeaning='GAS_POST_ELAPSED_MINUS_INSTRUMENTED_HANDLER_NOT_NETWORK_PROOF';
      }
      acceptRecord(result&&result.success===true?'confirmed':'rejected',{resultCode:result&&result.error||''});
      return send(res,result&&result.success===true?200:409,{...(result||{success:false,error:'CANONICAL_ACTION_EMPTY'}),acceptTiming:{totalMs:Date.now()-acceptStarted,...acceptPerf}});
    }catch(error){acceptRecord('exception',{error:clean(error.message)});return send(res,503,{success:false,error:'AUDITOR_ACTION_OUTCOME_UNCONFIRMED_DO_NOT_RETRY'});}
  }
  if(u.pathname==='/api/v1/manager/action'&&req.method==='POST'){const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}try{const out=await canonicalManagerAction(s,b);return send(res,out&&out.success===false?409:200,out)}catch(e){return send(res,500,{ok:false,error:'MANAGER_ACTION_BRIDGE_FAILED',detail:clean(e?.message||e)})}}
  if(u.pathname==='/api/v1/manager/archived'&&req.method==='GET'){const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});const role=clean(s.role).toLowerCase();if(!['manager','auditor'].includes(role))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});try{return send(res,200,role==='auditor'?await auditorArchivedRead(clean(s.email).toLowerCase()):await managerArchivedRead(clean(s.email).toLowerCase()));}catch(e){return send(res,500,{ok:false,error:'ARCHIVED_READ_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/manager/company-management/scopes/hours'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let b;try{b=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const uid=clean(b?.companyUid),code=clean(b?.scopeCode),value=clean(b?.hours),expected=clean(b?.expected);if(!uid||!code||!Object.hasOwn(b,'expected')||value&&!(/^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)>=0.25&&Number(value)<=200&&Number.isInteger(Number(value)*4)))return send(res,400,{ok:false,error:'INVALID_COMPANY_HOURS'});
    try{const v=await sheetsBatchGet(['Company_Scopes!A1:L3000','Company_Scope_Hours!A1:M3000','Config_Scopes!A1:Z128','ScopeVersions!A1:I1000']);const [cs,hs,cfg,versions]=v.map(x=>x?.values||[]),ch=cs[0]||[],hh=hs[0]||[],sh=cfg[0]||[],vh=versions[0]||[];
      if(!['Company_UID','ScopeCode','Active','Company_Formal_Hours_Override'].every(x=>ch.includes(x))||!['OverrideId','Company_UID','ScopeCode','Hours','Status','Revision','EffectiveTo','EffectiveFrom'].every(x=>hh.includes(x)))throw Error('SCHEMA_MISSING');
      const relation=cs.slice(1).filter(r=>clean(r[ch.indexOf('Company_UID')])===uid&&clean(r[ch.indexOf('ScopeCode')])===code);if(relation.length!==1)return send(res,409,{ok:false,error:'SCOPE_RELATION_REQUIRED'});
      if(!['YES','TRUE','1'].includes(clean(relation[0][ch.indexOf('Active')]).toUpperCase()))return send(res,409,{ok:false,error:'COMPANY_SCOPE_INACTIVE'});
      const active=hs.slice(1).map((r,i)=>({r,n:i+2})).filter(x=>clean(x.r[hh.indexOf('Company_UID')])===uid&&clean(x.r[hh.indexOf('ScopeCode')])===code&&clean(x.r[hh.indexOf('Status')]).toUpperCase()==='ACTIVE');if(active.length>1)return send(res,409,{ok:false,error:'MULTIPLE_ACTIVE_HOURS_OVERRIDES'});
      const old=active.length?clean(active[0].r[hh.indexOf('Hours')]):clean(relation[0][ch.indexOf('Company_Formal_Hours_Override')]);if(old!==value&&old!==expected&&!(old!==''&&expected!==''&&Number(old)===Number(expected)))return send(res,409,{ok:false,error:'STALE_COMPANY_HOURS',current:old});
      const legacy=clean(relation[0][ch.indexOf('Company_Formal_Hours_Override')]);if(value===''&&legacy)return send(res,409,{ok:false,error:'LEGACY_OVERRIDE_CUTOVER_REQUIRED'});
      if(value===old)return send(res,200,{ok:true,updated:0});
      const now=new Date().toISOString(),updates=[];if(active.length){const statusCol=hh.indexOf('Status')+1,endCol=hh.indexOf('EffectiveTo')+1;const letter=n=>{let t='';while(n){n--;t=String.fromCharCode(65+n%26)+t;n=Math.floor(n/26)}return t};updates.push({range:'Company_Scope_Hours!'+letter(statusCol)+active[0].n,values:[['ENDED']]},{range:'Company_Scope_Hours!'+letter(endCol)+active[0].n,values:[[now]]});}
      if(value){const rec=Object.fromEntries(hh.map(h=>[h,'']));rec.OverrideId='OV_'+randomUUID().replace(/-/g,'');rec.Company_UID=uid;rec.ScopeCode=code;rec.Hours=value;rec.EffectiveFrom=now;rec.Status='ACTIVE';rec.Revision=active.length?Number(active[0].r[hh.indexOf('Revision')]||1)+1:1;rec.CreatedAt=now;rec.CreatedBy=clean(actor.email);rec.ChangeReason='Company Management 2.0 manager update';rec.SupersedesOverrideId=active.length?clean(active[0].r[hh.indexOf('OverrideId')]):'';rec.ScopeVersionPolicy='CURRENT_AT_OBLIGATION_CREATION';
        await sheetsValuesAppend('Company_Scope_Hours!A:M',[hh.map(h=>rec[h]??'')]);}
      if(updates.length)await sheetsValuesBatchUpdate(updates);
      return send(res,200,{ok:true,updated:1,scopeCode:code});
    }catch(e){return send(res,409,{ok:false,error:'COMPANY_HOURS_SAVE_FAILED',detail:clean(e.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/company-management/scopes/assign'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let b;try{b=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const uid=clean(b?.companyUid),code=clean(b?.scopeCode);if(!uid||!code)return send(res,400,{ok:false,error:'REQUIRED_FIELDS_MISSING'});
    try{const v=await sheetsBatchGet(['Companies!A1:X2500','Company_Scopes!A1:L3000','Config_Scopes!A1:Z128']);const [companies,relations,scopes]=v.map(x=>x?.values||[]);
      const ch=companies[0]||[],rh=relations[0]||[],sh=scopes[0]||[];if(!['Company_UID'].every(x=>ch.includes(x))||!['Company_UID','ScopeCode','Company_Scope_ID','Active'].every(x=>rh.includes(x))||!['ScopeCode','Active','Archived'].every(x=>sh.includes(x)))throw Error('SCHEMA_MISSING');
      if(companies.slice(1).filter(r=>clean(r[ch.indexOf('Company_UID')])===uid).length!==1)return send(res,409,{ok:false,error:'COMPANY_NOT_UNIQUE'});
      const match=scopes.slice(1).filter(r=>clean(r[sh.indexOf('ScopeCode')])===code);if(match.length!==1||!['YES','TRUE','1'].includes(clean(match[0][sh.indexOf('Active')]).toUpperCase())||['YES','TRUE','1'].includes(clean(match[0][sh.indexOf('Archived')]).toUpperCase()))return send(res,409,{ok:false,error:'SCOPE_NOT_AVAILABLE'});
      if(relations.slice(1).some(r=>clean(r[rh.indexOf('Company_UID')])===uid&&clean(r[rh.indexOf('ScopeCode')])===code))return send(res,409,{ok:false,error:'COMPANY_SCOPE_ALREADY_EXISTS'});
      const record=Object.fromEntries(rh.map(h=>[h,'']));record.Company_Scope_ID='CS_'+randomUUID().replace(/-/g,'');record.Company_UID=uid;record.ScopeCode=code;record.Active='YES';record.Lifecycle_Type='CERTIFICATE_RECURRING';record.Created_At=new Date().toISOString();record.Updated_At=record.Created_At;
      await sheetsValuesAppend('Company_Scopes!A:L',[rh.map(h=>record[h]??'')]);return send(res,200,{ok:true,scopeCode:code,companyUid:uid,created:true});
    }catch(e){return send(res,409,{ok:false,error:'COMPANY_SCOPE_ASSIGN_FAILED',detail:clean(e.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/company-management/scopes/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let b;try{b=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    if(!clean(b?.companyUid)||!Array.isArray(b.changes)||!b.changes.length||b.changes.length>20)return send(res,400,{ok:false,error:'INVALID_SCOPE_CHANGES'});
    try{
      const v=await sheetsBatchGet(['Company_Scopes!A1:L3000','Config_Scopes!A1:Z128','Companies!A1:X2500']);const cs=v[0]?.values||[],cfg=v[1]?.values||[],companies=v[2]?.values||[];
      const h=cs[0]||[],ch=cfg[0]||[],companyH=companies[0]||[];const idx=k=>h.indexOf(k),ci=k=>ch.indexOf(k);
      if(['Company_UID','ScopeCode','Active'].some(k=>idx(k)<0)||['ScopeCode','Active','Archived'].some(k=>ci(k)<0))throw Error('SCOPE_SCHEMA_MISSING');
      if(!companies.slice(1).some(r=>clean(r[companyH.indexOf('Company_UID')])===clean(b.companyUid)))return send(res,404,{ok:false,error:'COMPANY_NOT_FOUND'});
      const changes=[],seen=new Set();for(const item of b.changes){const code=clean(item?.scopeCode),value=clean(item?.active).toUpperCase(),expected=clean(item?.expected).toUpperCase();
        if(!code||seen.has(code)||!['YES','NO'].includes(value)||!['YES','NO'].includes(expected))return send(res,400,{ok:false,error:'INVALID_SCOPE_CHANGE'});seen.add(code);
        const scope=cfg.slice(1).find(r=>clean(r[ci('ScopeCode')])===code);if(!scope||!['YES','TRUE'].includes(clean(scope[ci('Active')]).toUpperCase())||['YES','TRUE'].includes(clean(scope[ci('Archived')]).toUpperCase()))return send(res,409,{ok:false,error:'SCOPE_NOT_AVAILABLE',scopeCode:code});
        const rows=cs.slice(1).map((r,i)=>({r,n:i+2})).filter(x=>clean(x.r[idx('Company_UID')])===clean(b.companyUid)&&clean(x.r[idx('ScopeCode')])===code);
        if(rows.length!==1)return send(res,409,{ok:false,error:'SCOPE_RELATION_REQUIRES_GOVERNED_CREATION',scopeCode:code});
        const current=['YES','TRUE','1'].includes(clean(rows[0].r[idx('Active')]).toUpperCase())?'YES':'NO';if(current!==value&&current!==expected)return send(res,409,{ok:false,error:'STALE_COMPANY_SCOPE',scopeCode:code,current});
        if(current!==value)changes.push({n:rows[0].n,value});
      }
      if(changes.length){const n=idx('Active')+1;let col='',k=n;while(k){k--;col=String.fromCharCode(65+k%26)+col;k=Math.floor(k/26)}await sheetsValuesBatchUpdate(changes.map(x=>({range:'Company_Scopes!'+col+x.n,values:[[x.value]]})))}
      return send(res,200,{ok:true,updated:changes.length});
    }catch(e){return send(res,409,{ok:false,error:'COMPANY_SCOPE_SAVE_FAILED',detail:clean(e.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/company-management/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let b;try{b=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const allowed=new Set(['Contactperson ','Contactperson e-mail','Contactperson phone','Number','Group','Region','Country','Time zone',' Language communication','Manager_Email','Comments','Audit planning limitations - days','Audit planning limitations - hours','Preferred_Audit_Months','Locations_JSON','Auditor_Exclusions','Auditor comments']);
    const changes=b?.changes;if(!clean(b?.companyUid)||!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.keys(changes).some(k=>!allowed.has(k)))return send(res,400,{ok:false,error:'INVALID_COMPANY_CHANGES'});
    try{
      const v=await sheetsBatchGet(['Companies!A1:Y2500']);const values=v[0]?.values||[],headers=(values[0]||[]).map(String);const uidIndex=headers.indexOf('Company_UID');if(uidIndex<0)return send(res,409,{ok:false,error:'COMPANY_SCHEMA_MISSING'});
      const hits=values.slice(1).map((row,i)=>({row,i:i+2})).filter(x=>clean(x.row[uidIndex])===clean(b.companyUid));if(hits.length!==1)return send(res,409,{ok:false,error:'COMPANY_NOT_UNIQUE_OR_MISSING'});
      const target=hits[0],updates=[];for(const [key,item] of Object.entries(changes)){
        if(!item||typeof item!=='object'||typeof item.value!=='string'||typeof item.expected!=='string'||item.value.length>12000)return send(res,400,{ok:false,error:'INVALID_CHANGE_VALUE',field:key});
        const col=headers.indexOf(key);if(col<0)return send(res,409,{ok:false,error:'COMPANY_FIELD_MISSING',field:key});const old=String(target.row[col]??'');if(old!==item.value&&old!==item.expected&&!(old.trim()===item.expected.trim())&&!(old!==''&&item.expected!==''&&Number.isFinite(Number(old))&&Number.isFinite(Number(item.expected))&&Number(old)===Number(item.expected)))return send(res,409,{ok:false,error:'STALE_COMPANY_FIELD',field:key,current:old});
        if(key==='Auditor_Exclusions'){
          let exclusions;try{exclusions=JSON.parse(item.value||'[]')}catch{return send(res,400,{ok:false,error:'INVALID_AUDITOR_EXCLUSIONS'})}
          if(!Array.isArray(exclusions)||exclusions.length>100||exclusions.some(v=>typeof v!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))||new Set(exclusions.map(v=>v.toLowerCase())).size!==exclusions.length)return send(res,400,{ok:false,error:'INVALID_AUDITOR_EXCLUSIONS'});
          const auditors=(await sheetsBatchGet(['Auditors!A1:R256']))[0]?.values||[],ah=auditors[0]||[],ei=ah.indexOf('E-mail');
          if(ei<0||exclusions.some(v=>!auditors.slice(1).some(r=>clean(r[ei]).toLowerCase()===v.toLowerCase())))return send(res,409,{ok:false,error:'AUDITOR_EXCLUSION_UNKNOWN'});
        }
        if(key==='Contactperson e-mail'&&item.value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.value))return send(res,400,{ok:false,error:'INVALID_EMAIL'});
        if(key==='Audit planning limitations - days'&&item.value&&!/^(Mo|Tu|We|Th|Fr|Sa|Su)(, ?(Mo|Tu|We|Th|Fr|Sa|Su))*$/.test(item.value))return send(res,400,{ok:false,error:'INVALID_PLANNING_DAYS'});
        if(key==='Audit planning limitations - hours'&&item.value){const m=/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.exec(item.value);if(!m||m[0].slice(0,5)>=m[0].slice(6))return send(res,400,{ok:false,error:'INVALID_PLANNING_HOURS'});}

        if(key==='Locations_JSON'){let loc;try{loc=JSON.parse(item.value)}catch{return send(res,400,{ok:false,error:'INVALID_LOCATIONS_JSON'})}if(!Array.isArray(loc)||loc.length>100)return send(res,400,{ok:false,error:'INVALID_LOCATIONS_JSON'});
          const codes=new Set(),active=loc.filter(x=>x&&x.active===true);for(const x of loc){if(!x||typeof x.code!=='string'||!x.code.trim()||codes.has(x.code)||typeof x.name!=='string'||typeof x.active!=='boolean'||Object.values(x).some(y=>typeof y==='string'&&y.length>4000))return send(res,400,{ok:false,error:'INVALID_LOCATION_ENTRY'});codes.add(x.code)}
          if(clean(target.row[headers.indexOf('Status')]).toLowerCase()==='active'&&(active.filter(x=>x.hq===true||x.isHQ===true||(x.code.toUpperCase()==='HQ'&&!loc.some(y=>y.hq===true||y.isHQ===true))).length!==1))return send(res,409,{ok:false,error:'EXACTLY_ONE_ACTIVE_HQ_REQUIRED'});
        }
        if(old!==item.value){let n=col+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}updates.push({range:'Companies!'+letter+target.i,values:[[item.value]]})}
      }
      if(updates.length)await sheetsValuesBatchUpdate(updates);
      return send(res,200,{ok:true,updated:updates.length,companyUid:clean(b.companyUid)});
    }catch(e){return send(res,409,{ok:false,error:'COMPANY_SAVE_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/maps-config'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(!['manager','auditor'].includes(clean(actor.role).toLowerCase()))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    const apiKey=clean(process.env.GOOGLE_MAPS_BROWSER_API_KEY);
    return send(res,200,{ok:true,configured:!!apiKey,apiKey});
  }
  if(u.pathname==='/api/v1/manager/auditor-management/history'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    const email=clean(u.searchParams.get('email')).toLowerCase();if(!email)return send(res,400,{ok:false,error:'AUDITOR_EMAIL_REQUIRED'});
    try{
      const values=(await sheetsBatchGet(['Diagnostics_Log!A1:K5000']))[0]?.values||[];
      const rows=values.slice(1).map(row=>{let detail=null;try{detail=JSON.parse(String(row[10]||'{}'))}catch{}return{row,detail}}).filter(({row,detail})=>clean(row[1])==='AUDITOR_MANAGEMENT_2_0'&&clean(row[4])==='CHANGE_APPLIED'&&(clean(row[3]).toLowerCase()===email||(clean(row[2])==='AUDIT_TRANSFER'&&(clean(detail?.fromEmail).toLowerCase()===email||clean(detail?.toEmail).toLowerCase()===email)))).slice(-150).reverse().map(({row,detail})=>({timestamp:String(row[0]||''),action:String(row[2]||''),actor:String(row[5]||''),changes:Array.isArray(detail?.changes)?detail.changes:[],detail:detail&&typeof detail==='object'?detail:null,summary:clean(row[9]),trailId:clean(detail?.id)}));
      return send(res,200,{ok:true,email,rows});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_HISTORY_READ_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualification/withdraw'&&req.method==='POST'){
    if(process.env.AMS_QUALIFICATION_WITHDRAWAL_WRITE_ENABLED!=='true')return send(res,409,{ok:false,error:'WITHDRAWAL_WRITE_DISABLED_PENDING_DUAL_RUNTIME_GUARDS'});
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>20000)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let payload;try{payload=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(payload?.email).toLowerCase(),scopeCode=clean(payload?.scopeCode),date=clean(payload?.effectiveDate),exceptions=payload?.grandfatheredAuditIds;
    if(!email||!scopeCode||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<new Date().toISOString().slice(0,10)||!Array.isArray(exceptions)||exceptions.length>500||exceptions.some(x=>typeof x!=='string'||!x.trim())||new Set(exceptions).size!==exceptions.length)return send(res,400,{ok:false,error:'INVALID_WITHDRAWAL_REQUEST'});
    try{
      const vv=await sheetsBatchGet(['Auditors!A1:AZ1000','Audit planning!A1:BW2500','Config_Scopes!A1:Z200']);
      const av=vv[0]?.values||[],ap=vv[1]?.values||[],sc=vv[2]?.values||[],h=av[0]||[],eidx=col(h,['E-mail','Email']),pidx=h.indexOf('Qualification_Withdrawals_JSON');
      if(pidx<0)return send(res,409,{ok:false,error:'WITHDRAWAL_SCHEMA_MISSING'});
      const matches=av.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>eidx>=0&&clean(x.row[eidx]).toLowerCase()===email);
      if(matches.length!==1)return send(res,409,{ok:false,error:'AUDITOR_NOT_UNIQUE'});
      const scope=scopeCatalog(sc).find(x=>clean(x.scopeCode)===scopeCode);
      if(!scope)return send(res,409,{ok:false,error:'SCOPE_NOT_ACTIVE'});
      const record=matches[0],qualifiedCol=col(h,[scopeCode,scope.displayName,scope.slotKey].filter(Boolean));
      if(qualifiedCol<0||!yes(record.row[qualifiedCol]))return send(res,409,{ok:false,error:'QUALIFICATION_NOT_CURRENT'});
      const ph=ap[0]||[],ai=col(ph,['Assigned to','Assigned auditor','Auditor']),pi=col(ph,['Preassigned Auditor']),idc=col(ph,['Audit ID']),statusCol=col(ph,['Status']),aliases=[scopeCode,scope.displayName,scope.slotKey];
      const scopeCols=aliases.map(x=>col(ph,[x])).filter(x=>x>=0);
      if(!scopeCols.length)return send(res,409,{ok:false,error:'WITHDRAWAL_IMPACT_UNRESOLVED'});
      const impacted=ap.slice(1).filter(row=>{
        const status=clean(val(row,statusCol)).toUpperCase().replace(/[\s-]+/g,'_');
        return ['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(status)&&scopeCols.some(i=>yes(row[i]))&&(directResolveAuditorEmail(av,val(row,ai))===email||directResolveAuditorEmail(av,val(row,pi))===email);
      });
      const currentIds=impacted.map(row=>val(row,idc));
      if(currentIds.some(x=>!x)||currentIds.length!==new Set(currentIds).size)return send(res,409,{ok:false,error:'AMBIGUOUS_IMPACT_AUDITS'});
      if(currentIds.length!==exceptions.length||currentIds.some(id=>!exceptions.includes(id)))return send(res,409,{ok:false,error:'IMPACT_CHANGED_REVIEW_AGAIN',impactAuditIds:currentIds});
      const rawPolicy=String(record.row[pidx]||'');let policies;try{policies=rawPolicy?JSON.parse(rawPolicy):[]}catch{return send(res,409,{ok:false,error:'WITHDRAWAL_POLICY_CORRUPT'})}
      if(!Array.isArray(policies)||policies.some(x=>!x||!x.scopeCode||!x.effectiveDate))return send(res,409,{ok:false,error:'WITHDRAWAL_POLICY_CORRUPT'});
      if(policies.some(x=>clean(x.scopeCode)===scopeCode))return send(res,409,{ok:false,error:'WITHDRAWAL_ALREADY_DEFINED'});
      const now=new Date().toISOString(),trailId=createHash('sha256').update(email+scopeCode+date+now).digest('hex').slice(0,24);
      policies.push({scopeCode,effectiveDate:date,grandfatheredAuditIds:currentIds,approvedBy:clean(actor.email).toLowerCase(),approvedAt:now,trailId});
      const next=JSON.stringify(policies),auditDetail=JSON.stringify({trailId,email,scopeCode,effectiveDate:date,grandfatheredAuditIds:currentIds,actor:clean(actor.email),oldValue:rawPolicy,newValue:next});
      let n=pidx+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[now,'AUDITOR_MANAGEMENT_2_0','QUALIFICATION_WITHDRAWAL',email,'CHANGE_INTENT',clean(actor.email),'','',false,'Withdrawal scheduled; impact verified',auditDetail]]);
      await sheetsValuesBatchUpdateRaw([{range:'Auditors!'+letter+record.line,values:[[next]]}]);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','QUALIFICATION_WITHDRAWAL',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Withdrawal policy saved',auditDetail]]);
      return send(res,200,{ok:true,scopeCode,effectiveDate:date,grandfatheredAuditIds:currentIds,trailId});
    }catch(e){return send(res,503,{ok:false,error:'WITHDRAWAL_SAVE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualification/withdraw/cancel'&&req.method==='POST'){
    if(process.env.AMS_RUNTIME_ENV!=='DEV')return send(res,403,{ok:false,error:'DEV_ONLY'});
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const c of req){raw+=c;if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(body?.email).toLowerCase(),scopeCode=clean(body?.scopeCode),expectedDate=clean(body?.expectedEffectiveDate);
    if(!email||!scopeCode||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(expectedDate))return send(res,400,{ok:false,error:'INVALID_CANCELLATION'});
    try{
      const av=(await sheetsBatchGet(['Auditors!A1:AZ1000']))[0]?.values||[],h=av[0]||[],ec=col(h,['E-mail','Email']),pc=h.indexOf('Qualification_Withdrawals_JSON');
      if(ec<0||pc<0)return send(res,409,{ok:false,error:'WITHDRAWAL_SCHEMA_MISSING'});
      const matches=av.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>val(x.row,ec).toLowerCase()===email);
      if(matches.length!==1)return send(res,409,{ok:false,error:'AUDITOR_NOT_UNIQUE'});
      const record=matches[0],oldValue=String(record.row[pc]||'');let policies;
      try{policies=oldValue?JSON.parse(oldValue):[]}catch{return send(res,409,{ok:false,error:'WITHDRAWAL_POLICY_CORRUPT'})}
      if(!Array.isArray(policies))return send(res,409,{ok:false,error:'WITHDRAWAL_POLICY_CORRUPT'});
      const found=policies.filter(x=>clean(x?.scopeCode)===scopeCode);
      if(found.length!==1||clean(found[0].effectiveDate)!==expectedDate)return send(res,409,{ok:false,error:'WITHDRAWAL_CHANGED_RELOAD_REQUIRED'});
      const next=JSON.stringify(policies.filter(x=>clean(x?.scopeCode)!==scopeCode));
      let n=pc+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}
      const now=new Date().toISOString(),detail=JSON.stringify({email,scopeCode,expectedEffectiveDate:expectedDate,oldValue,newValue:next,actor:clean(actor.email)});
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[now,'AUDITOR_MANAGEMENT_2_0','QUALIFICATION_WITHDRAWAL_CANCEL',email,'CHANGE_INTENT',clean(actor.email),'','',false,'Withdrawal cancellation requested',detail]]);
      await sheetsValuesBatchUpdateRaw([{range:'Auditors!'+letter+record.line,values:[[next]]}]);
      const verify=(await sheetsBatchGet(['Auditors!A1:AZ1000']))[0]?.values||[];
      if(String(verify[record.line-1]?.[pc]||'')!==next)return send(res,503,{ok:false,error:'CANCELLATION_WRITE_UNCONFIRMED_RECONCILE'});
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','QUALIFICATION_WITHDRAWAL_CANCEL',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Withdrawal cancelled and verified',detail]]);
      return send(res,200,{ok:true,email,scopeCode,cancelledEffectiveDate:expectedDate});
    }catch(e){return send(res,503,{ok:false,error:'CANCELLATION_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualification/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const c of req){raw+=c;if(raw.length>8192)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let input;try{input=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(input?.email).toLowerCase(),scopeCode=clean(input?.scopeCode),expected=input?.expected,qualified=input?.qualified;
    if(!email||!scopeCode||typeof expected!=='boolean'||typeof qualified!=='boolean')return send(res,400,{ok:false,error:'INVALID_QUALIFICATION_CHANGE'});
    try{
      const v=await sheetsBatchGet(['Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Audit planning!A1:BW2500']);
      const av=v[0]?.values||[],ah=av[0]||[],sc=v[1]?.values||[],sh=sc[0]||[],ap=v[2]?.values||[],ph=ap[0]||[];
      const ec=col(ah,['E-mail','Email']),matches=av.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>ec>=0&&clean(x.row[ec]).toLowerCase()===email);
      if(matches.length!==1)return send(res,409,{ok:false,error:'AUDITOR_IDENTITY_NOT_UNIQUE'});
      const sci=col(sh,['ScopeCode','Scope Code']),sdi=col(sh,['DisplayName','Display Name']),slot=col(sh,['SlotKey','Slot key','Slot']),activeCol=col(sh,['Active']),archivedCol=col(sh,['Archived']);
      const catalog=sc.slice(1).filter(row=>sci>=0&&clean(row[sci])===scopeCode&&(!((activeCol>=0)&&/^(No|false|0)$/i.test(clean(row[activeCol]))))&&!(archivedCol>=0&&yes(row[archivedCol])));
      if(catalog.length!==1)return send(res,409,{ok:false,error:'SCOPE_NOT_UNIQUELY_ACTIVE'});
      const sr=catalog[0],fieldIndex=col(ah,[scopeCode,clean(sr[sdi]),clean(sr[slot])].filter(Boolean));
      if(fieldIndex<0)return send(res,409,{ok:false,error:'AUDITOR_QUALIFICATION_COLUMN_MISSING'});
      const record=matches[0],old=String(record.row[fieldIndex]??''),oldQualified=/^(x|yes|true|1)$/i.test(clean(old));
      if(oldQualified!==expected)return send(res,409,{ok:false,error:'STALE_AUDITOR_QUALIFICATION'});
      if(oldQualified===qualified)return send(res,200,{ok:true,updated:0});
      const ai=col(ph,['Assigned to','Assigned auditor','Auditor']),pi=col(ph,['Preassigned Auditor']),statusCol=col(ph,['Status']);
      const aliases=[scopeCode,clean(sr[sdi]),clean(sr[slot])].filter(Boolean),scopeColumns=aliases.map(x=>col(ph,[x])).filter(i=>i>=0);
      // Changes to qualifications with any linked unfinished audit are governed later by an assignment-impact migration.
      // The fail-closed guard also applies to additions: an uncertain existing assignment never becomes silently valid.
      if(!qualified&&scopeColumns.length===0)return send(res,409,{ok:false,error:'QUALIFICATION_IMPACT_SCHEMA_UNRESOLVED'});
      const impacts=ap.slice(1).filter(row=>{
        const status=clean(row[statusCol]).toUpperCase().replace(/[\s-]+/g,'_');
        if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(status))return false;
        if(!scopeColumns.some(i=>yes(row[i])))return false;
        return directResolveAuditorEmail(av,val(row,ai))===email||directResolveAuditorEmail(av,val(row,pi))===email;
      });
      if(!qualified&&impacts.length)return send(res,409,{ok:false,error:'QUALIFICATION_WITH_OPEN_AUDITS_REQUIRES_SCHEDULED_WITHDRAWAL',affected:impacts.length,impactAuditIds:impacts.map(row=>val(row,col(ph,['Audit ID'])))});
      let n=fieldIndex+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}
      const now=new Date().toISOString(),trailId=createHash('sha256').update(now+email+scopeCode).digest('hex').slice(0,24),payload=JSON.stringify({trailId,auditorEmail:email,actor:clean(actor.email),scopeCode,old,newValue:qualified?'x':'',impactedAuditIds:!qualified?impacts.map(row=>val(row,col(ph,['Audit ID']))):[]});
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[now,'AUDITOR_MANAGEMENT_2_0','QUALIFICATION_EDIT',email,'CHANGE_INTENT',clean(actor.email),'','',false,'No linked open audits; verified before write',payload]]);
      await sheetsValuesBatchUpdateRaw([{range:'Auditors!'+letter+record.line,values:[[qualified?'x':'']]}]);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','QUALIFICATION_EDIT',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Qualification updated',payload]]);
      return send(res,200,{ok:true,updated:1,trailId});
    }catch(e){return send(res,503,{ok:false,error:'QUALIFICATION_SAVE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/audit/transfer-candidates'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    const auditId=clean(u.searchParams.get('auditId')),fromEmail=clean(u.searchParams.get('fromEmail')).toLowerCase();
    if(!auditId||!fromEmail)return send(res,400,{ok:false,error:'TRANSFER_CANDIDATE_INPUT_REQUIRED'});
    try{
      const versioned=process.env.AMS_AUDITOR_UID_ROTATION_READ_ENABLED==='true',ranges=['Audit planning!A1:BW2500','Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Companies!A1:AJ2500','Log realized audits!A1:AZ2500'];if(versioned)ranges.push('Auditor_Identity_Versions!A1:P2000');const v=await sheetsBatchGet(ranges);
      const ap=v[0]?.values||[],av=v[1]?.values||[],sc=v[2]?.values||[],companies=v[3]?.values||[],log=v[4]?.values||[],found=findAudit(ap,auditId);
      if(!found)return send(res,404,{ok:false,error:'AUDIT_NOT_FOUND'});
      const h=found.h,row=found.row,ai=col(h,['Assigned to','Assigned auditor','Auditor']),pi=col(h,['Preassigned Auditor']);
      if(directResolveAuditorEmail(av,val(row,ai))!==fromEmail&&directResolveAuditorEmail(av,val(row,pi))!==fromEmail)return send(res,409,{ok:false,error:'TRANSFER_SOURCE_MISMATCH'});
      const catalog=scopeCatalog(sc),required=scopesForAudit(found,catalog),company=val(row,col(h,['Company'])),companyUid=val(row,col(h,['Company_UID','Company UID'])),planned=dateOnly(val(row,col(h,['Date planned','Date - Planned']))),ah=av[0]||[],ec=col(ah,['E-mail','Email']),nc=col(ah,['Name']),ac=col(ah,['Active']),rc=col(ah,['Role']);
      if(!required.length||ec<0||ac<0||rc<0)return send(res,409,{ok:false,error:'TRANSFER_CANDIDATE_SCHEMA_UNRESOLVED'});
      const missingScopesFor=(auditor)=>required.filter(scope=>{const def=catalog.find(x=>[x.scopeCode,x.displayName,x.slotKey].some(y=>key(y)===key(scope)));const names=def?[def.scopeCode,def.displayName,def.slotKey]:[scope];const column=col(ah,names.filter(Boolean));return column<0||!yes(auditor[column])});
      const versions=versioned?rotationIdentityVersions(v[5]?.values||[]):null,eligible=[],excluded=[];
      for(const auditor of av.slice(1)){
        const email=val(auditor,ec).toLowerCase();if(!email||email===fromEmail||!yes(auditor[ac])||val(auditor,rc).toLowerCase()!=='auditor')continue;
        const hard=v211AssignmentHardCheck({auditorEmail:email,auditorValues:av,catalog,scopeCodes:required,companyValues:companies,companyUid,companyName:company,logValues:log,requestedDates:planned?[planned]:[]});
        const rotation=rotationReadFromLoaded(auditId,email,ap,av,sc,log,versions),rotationHard=v211RotationHardCheck(rotation);
        const intervalReasons=hard.reasons.filter(x=>x.startsWith('MIN_INTERVAL_HARD_BLOCK_'));const auditorReasons=hard.reasons.filter(x=>!x.startsWith('MIN_INTERVAL_HARD_BLOCK_'));const entry={email,name:val(auditor,nc)||email,missingScopes:missingScopesFor(auditor),planningWarnings:intervalReasons,planningDateValid:intervalReasons.length===0,dateRecheckRequired:!planned};if(!auditorReasons.length&&rotationHard.ok)eligible.push(entry);else excluded.push({...entry,reasons:[...auditorReasons,...rotationHard.reasons],planningWarnings:intervalReasons});
      }
      return send(res,200,{ok:true,auditId,company,scopes:required,status:val(row,col(h,['Status'])),eligible,excluded,availabilityWarning:true});
    }catch(e){return send(res,503,{ok:false,error:'TRANSFER_CANDIDATES_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/audit/transfer'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const transferPreflight=process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_DEV_FIRESTORE_ATOMIC_PLANNING_ENABLED==='true'&&body?.authorityPreflight===true;
    const auditId=clean(body?.auditId),fromEmail=clean(body?.fromEmail).toLowerCase(),toEmail=clean(body?.toEmail).toLowerCase(),expectedStatus=clean(body?.expectedStatus).toUpperCase().replace(/[\s-]+/g,'_');
    if(!auditId||!fromEmail||!toEmail||fromEmail===toEmail||!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(expectedStatus))return send(res,400,{ok:false,error:'INVALID_TRANSFER'});
    try{
      const values=await sheetsBatchGet(['Audit planning!A1:BW2500','Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Companies!A1:AJ2500','Log realized audits!A1:AZ2500']);
      const ap=values[0]?.values||[],av=values[1]?.values||[],sc=values[2]?.values||[],audit=findAudit(ap,auditId);
      if(!audit)return send(res,404,{ok:false,error:'AUDIT_NOT_FOUND'});
      const h=audit.h,row=audit.row,ci=col(h,['Status']),ai=col(h,['Assigned to','Assigned auditor','Auditor']),pi=col(h,['Preassigned Auditor']),si=col(h,['Status since']),li=col(h,['Last decision timestamp']);
      if(ci<0||ai<0||pi<0||si<0||li<0)return send(res,409,{ok:false,error:'TRANSFER_SCHEMA_INCOMPLETE'});
      const current=val(row,ci).toUpperCase().replace(/[\s-]+/g,'_');
      if(current!==expectedStatus)return send(res,409,{ok:false,error:'TRANSFER_STALE_STATUS',current});
      if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(current))return send(res,409,{ok:false,error:'TRANSFER_STATUS_FORBIDDEN'});
      if(directResolveAuditorEmail(av,val(row,ai))!==fromEmail&&directResolveAuditorEmail(av,val(row,pi))!==fromEmail)return send(res,409,{ok:false,error:'TRANSFER_SOURCE_MISMATCH'});
      const ah=av[0]||[],ec=col(ah,['E-mail','Email']),active=col(ah,['Active']),role=col(ah,['Role']);
      const targets=av.slice(1).filter(r=>ec>=0&&val(r,ec).toLowerCase()===toEmail);
      if(targets.length!==1||active<0||!yes(targets[0][active])||role<0||!['auditor','manager'].includes(val(targets[0],role).toLowerCase()))return send(res,409,{ok:false,error:'TRANSFER_TARGET_NOT_ACTIVE_AUDITOR'});
      const catalog=scopeCatalog(sc).filter(x=>x.active&&!x.archived),required=catalog.filter(x=>[x.slotKey,x.scopeCode,x.displayName].some(name=>{const i=col(h,[name]);return i>=0&&yes(row[i])}));
      if(!required.length)return send(res,409,{ok:false,error:'TRANSFER_SCOPE_UNRESOLVED'});
      const missing=required.filter(x=>{const i=col(ah,[x.scopeCode,x.displayName,x.slotKey]);return i<0||!yes(targets[0][i])}).map(x=>x.scopeCode);
      if(missing.length)return send(res,409,{ok:false,error:'TRANSFER_TARGET_NOT_QUALIFIED',missing});
      const requiredScopes=scopesForAudit(audit,scopeCatalog(sc)),companyName=val(row,col(h,['Company'])),companyUid=val(row,col(h,['Company_UID','Company UID'])),plannedDate=dateOnly(val(row,col(h,['Date planned','Date - Planned'])));const eligibility=v211AssignmentHardCheck({auditorEmail:toEmail,auditorValues:av,catalog:scopeCatalog(sc),scopeCodes:requiredScopes,companyValues:values[3]?.values||[],companyUid,companyName,logValues:values[4]?.values||[],requestedDates:plannedDate?[plannedDate]:[]});const intervalWarnings=eligibility.reasons.filter(x=>x.startsWith('MIN_INTERVAL_HARD_BLOCK_'));const transferHardReasons=eligibility.reasons.filter(x=>!x.startsWith('MIN_INTERVAL_HARD_BLOCK_'));if(transferHardReasons.length)return send(res,409,{ok:false,error:'TRANSFER_ELIGIBILITY_BLOCKED',reasons:transferHardReasons});if(intervalWarnings.length&&body?.acknowledgeDateRestriction!==true)return send(res,409,{ok:false,error:'TRANSFER_DATE_RESTRICTION_ACK_REQUIRED',warnings:intervalWarnings});const rotation=v211RotationHardCheck(rotationReadFromLoaded(auditId,toEmail,ap,av,sc,values[4]?.values||[]));if(!rotation.ok)return send(res,409,{ok:false,error:'TRANSFER_ROTATION_BLOCKED',reasons:rotation.reasons});
      const stamp=new Date().toISOString(),trail=JSON.stringify({auditId,actor:clean(actor.email),fromEmail,toEmail,oldStatus:current,newStatus:'Pending Approval',previousAssigned:val(row,ai),previousPreassigned:val(row,pi),plannedDate:val(row,col(h,['Date planned','Date - Planned'])),availability:'NOT_VERIFIED_SOFT_WARNING',planningWarnings:intervalWarnings,reason:clean(body?.reason).slice(0,500)});
      if(!transferPreflight)await sheetsValuesAppend('Diagnostics_Log!A:K',[[stamp,'AUDITOR_MANAGEMENT_2_0','AUDIT_TRANSFER',auditId,'CHANGE_INTENT',clean(actor.email),'','',false,'Transfer to Pending Approval',trail]]);
      const letter=n=>{let x=n+1,out='';while(x){x--;out=String.fromCharCode(65+x%26)+out;x=Math.floor(x/26)}return out};
      const planningIndex=col(h,['Planning JSON']),managerCommentIndex=col(h,['Manager comment (last)']),managerDecisionIndex=col(h,['Last manager decision']),transferUidIndex=col(h,['Auditor_UID','Auditor UID']);const transferComment='TRANSFER: '+fromEmail+' → '+toEmail+'. Pending Approval; receiving auditor must Accept or Cancel. Availability not confirmed.'+(intervalWarnings.length?' DATE WARNING: '+intervalWarnings.join(', ')+'. Replan required.':'');let planningUpdate=[];if(planningIndex>=0&&val(row,planningIndex)){let p;try{p=JSON.parse(val(row,planningIndex))}catch{return send(res,409,{ok:false,error:'TRANSFER_PLANNING_JSON_INVALID'})}if(!p||typeof p!=='object'||Array.isArray(p))return send(res,409,{ok:false,error:'TRANSFER_PLANNING_JSON_INVALID'});p.auditorEmail=toEmail;p.auditorName=val(targets[0],col(ah,['Name']))||toEmail;planningUpdate=[{range:'Audit planning!'+letter(planningIndex)+audit.sourceRow,values:[[JSON.stringify(p)]]}]};const transferWrites=[{range:'Audit planning!'+letter(ai)+audit.sourceRow,values:[['']]},...(transferUidIndex>=0?[{range:'Audit planning!'+letter(transferUidIndex)+audit.sourceRow,values:[['']]}]:[]),{range:'Audit planning!'+letter(pi)+audit.sourceRow,values:[[toEmail]]},{range:'Audit planning!'+letter(ci)+audit.sourceRow,values:[['Pending Approval']]},{range:'Audit planning!'+letter(si)+audit.sourceRow,values:[[stamp]]},{range:'Audit planning!'+letter(li)+audit.sourceRow,values:[[stamp]]},...(managerCommentIndex>=0?[{range:'Audit planning!'+letter(managerCommentIndex)+audit.sourceRow,values:[[transferComment]]}]:[]),...(managerDecisionIndex>=0?[{range:'Audit planning!'+letter(managerDecisionIndex)+audit.sourceRow,values:[['TRANSFER']]}]:[]),...planningUpdate];
      if(transferPreflight){
       if(transferUidIndex<0)throw Error('TRANSFER_AUDITOR_UID_COLUMN_MISSING');
       const revisionBefore=directRowRevision(h,row);
       if(clean(body?.expectedRevision)&&clean(body.expectedRevision)!==revisionBefore)throw Error('TRANSFER_SOURCE_REVISION_CONFLICT');
       const envelope=await normalizeLifecycleWriteset({writes:transferWrites,readBefore:sheetsBatchGet});
       const nextRow=row.slice();
       nextRow[ai]='';nextRow[transferUidIndex]='';nextRow[pi]=toEmail;nextRow[ci]='Pending Approval';
       nextRow[si]=stamp;nextRow[li]=stamp;
       if(managerCommentIndex>=0)nextRow[managerCommentIndex]=transferComment;
       if(managerDecisionIndex>=0)nextRow[managerDecisionIndex]='TRANSFER';
       if(planningUpdate.length&&planningIndex>=0)nextRow[planningIndex]=planningUpdate[0].values[0][0];
       return send(res,200,{success:true,authorityPreflight:true,auditId,action:'TRANSFER',
        expectedSourceRevision:revisionBefore,fromEmail,toEmail,
        canonicalSnapshot:{auditId,sourceRow:audit.sourceRow,headers:h,row:nextRow,status:'Pending Approval',
         assignedTo:'',sourceRevision:directRowRevision(h,nextRow)},
        projectionWrites:envelope.projectionWrites,projectionPreconditions:envelope.projectionPreconditions,
        appendIntents:[{range:'Diagnostics_Log!A:K',values:[[stamp,'AUDITOR_MANAGEMENT_2_0','AUDIT_TRANSFER',auditId,'CHANGE_INTENT',clean(actor.email),'','',false,'Transfer to Pending Approval',trail],[stamp,'AUDITOR_MANAGEMENT_2_0','AUDIT_TRANSFER',auditId,'CHANGE_APPLIED',clean(actor.email),'','',false,'Transferred; approval required; availability unverified',trail]]}],
        owner:'CLOUD_RUN_DEV_FIRESTORE_TRANSFER_PREFLIGHT'});
      }
      await sheetsValuesBatchUpdateRaw(transferWrites);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','AUDIT_TRANSFER',auditId,'CHANGE_APPLIED',clean(actor.email),'','',false,'Transferred; approval required; availability unverified',trail]]);
      return send(res,200,{ok:true,auditId,status:'Pending Approval',toEmail,availabilityWarning:true});
    }catch(e){return send(res,503,{ok:false,error:'TRANSFER_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualification-impact'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    const email=clean(u.searchParams.get('email')).toLowerCase(),code=clean(u.searchParams.get('scopeCode'));
    if(!email||!code)return send(res,400,{ok:false,error:'IMPACT_INPUT_REQUIRED'});
    try{
      const v=await sheetsBatchGet(['Auditors!A1:AZ1000','Audit planning!A1:BW2500','Config_Scopes!A1:Z200','Companies!A1:Y2500']);
      const av=v[0]?.values||[],ap=v[1]?.values||[],catalog=scopeCatalog(v[2]?.values||[]),companies=v[3]?.values||[],h=av[0]||[],emailCol=col(h,['E-mail','Email']);
      const matches=av.slice(1).filter(row=>emailCol>=0&&clean(row[emailCol]).toLowerCase()===email);
      if(matches.length!==1)return send(res,409,{ok:false,error:'AUDITOR_IDENTITY_NOT_UNIQUE'});
      const scope=catalog.find(x=>clean(x.scopeCode)===code||clean(x.displayName)===code);
      if(!scope)return send(res,404,{ok:false,error:'SCOPE_NOT_FOUND'});
      const projected=managerOpen(ap,'',v[2]?.values||[],companies,av).rows||[];
      const impacted=projected.filter(row=>{
        if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(row.statusKey))return false;
        if(!Array.isArray(row.scopes)||!row.scopes.some(x=>[scope.scopeCode,scope.displayName,scope.slotKey].some(y=>clean(x).toLowerCase()===clean(y).toLowerCase())))return false;
        return directResolveAuditorEmail(av,row.assignedTo)===email||directResolveAuditorEmail(av,row.preassignedAuditor)===email;
      }).map(row=>({auditId:row.auditId,company:row.company,scopeCode:code,status:row.status,statusKey:row.statusKey,datePlanned:row.datePlanned||'',assigned:directResolveAuditorEmail(av,row.assignedTo)===email,preassigned:directResolveAuditorEmail(av,row.preassignedAuditor)===email}));
      return send(res,200,{ok:true,readOnly:true,email,scopeCode:code,impacted,impactedCount:impacted.length,acceptedCount:impacted.filter(x=>x.statusKey==='ACCEPTED').length,withdrawalWriteEnabled:process.env.AMS_QUALIFICATION_WITHDRAWAL_WRITE_ENABLED==='true'});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_QUALIFICATION_IMPACT_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/role/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const c of req){raw+=c;if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let data;try{data=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(data?.email).toLowerCase(),next=clean(data?.role),expected=clean(data?.expected);
    if(!email||!['Auditor','Manager'].includes(next)||!['Auditor','Manager'].includes(expected))return send(res,400,{ok:false,error:'INVALID_ROLE_CHANGE'});
    if(email===clean(actor.email).toLowerCase())return send(res,403,{ok:false,error:'SELF_ROLE_CHANGE_FORBIDDEN'});
    try{
      const result=await sheetsBatchGet(['Auditors!A1:AZ1000','Audit planning!A1:BW2500']);
      const av=result[0]?.values||[],h=av[0]||[],ec=col(h,['E-mail','Email']),rc=col(h,['Role']);
      const matches=av.slice(1).map((row,i)=>({row,index:i+2})).filter(x=>ec>=0&&clean(x.row[ec]).toLowerCase()===email);
      if(matches.length!==1||rc<0)return send(res,409,{ok:false,error:'AUDITOR_IDENTITY_NOT_UNIQUE'});
      const target=matches[0],old=clean(target.row[rc]);if(old!==expected)return send(res,409,{ok:false,error:'STALE_AUDITOR_ROLE'});
      if(old===next)return send(res,200,{ok:true,updated:0});
      const ap=result[1]?.values||[],ah=ap[0]||[],ac=col(ah,['Assigned to','Assigned auditor','Auditor']),pc=col(ah,['Preassigned Auditor']),st=col(ah,['Status']),id=col(ah,['Audit ID']);
      const impacted=ap.slice(1).filter(row=>['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(clean(val(row,st)).toUpperCase().replace(/[\s-]+/g,'_'))&&(directResolveAuditorEmail(av,val(row,ac))===email||directResolveAuditorEmail(av,val(row,pc))===email)).map(row=>val(row,id));
      if(impacted.length)return send(res,409,{ok:false,error:'ROLE_CHANGE_REQUIRES_ASSIGNMENT_REVIEW',impactedAuditIds:impacted});
      if(next==='Manager')return send(res,403,{ok:false,error:'MANAGER_ROLE_GRANT_REQUIRES_SEPARATE_AUTHORIZATION'});
      const detail=JSON.stringify({email,old,newValue:next,actor:clean(actor.email)}),now=new Date().toISOString();
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[now,'AUDITOR_MANAGEMENT_2_0','ROLE_EDIT',email,'CHANGE_INTENT',clean(actor.email),'','',false,'Role change validation',detail]]);
      await sheetsValuesBatchUpdateRaw([{range:'Auditors!E'+target.index,values:[[next]]}]);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','ROLE_EDIT',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Role changed',detail]]);
      return send(res,200,{ok:true,updated:1,role:next});
    }catch(e){return send(res,503,{ok:false,error:'ROLE_CHANGE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/identity/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let data;try{data=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(data?.email).toLowerCase(),name=clean(data?.name),newEmail=clean(data?.newEmail).toLowerCase(),newName=clean(data?.newName);
    if(!email||!name||!newEmail||!newName||newName.length>160||newEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))return send(res,400,{ok:false,error:'INVALID_IDENTITY_CHANGE'});
    try{
      const v=await sheetsBatchGet(['Auditors!A1:AZ1000','Audit planning!A1:BW2500','Log realized audits!A1:AZ2500']),av=v[0]?.values||[],ah=av[0]||[],ec=col(ah,['E-mail','Email']),nc=col(ah,['Name']);
      const matched=av.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>ec>=0&&clean(x.row[ec]).toLowerCase()===email);
      if(matched.length!==1||nc<0)return send(res,409,{ok:false,error:'AUDITOR_NOT_UNIQUE'});
      const target=matched[0];if(clean(target.row[nc])!==name)return send(res,409,{ok:false,error:'STALE_AUDITOR_NAME'});
      if(newEmail===email&&newName===name)return send(res,200,{ok:true,updated:0});
      if(av.slice(1).some(row=>row!==target.row&&(clean(row[ec]).toLowerCase()===newEmail||clean(row[nc]).toLowerCase()===newName.toLowerCase())))return send(res,409,{ok:false,error:'IDENTITY_ALREADY_USED'});
      const affected=[];
      for(let j=1;j<=2;j++){const values=v[j]?.values||[],headers=values[0]||[];for(let i=1;i<values.length;i++){const row=values[i],hit=headers.some((h,k)=>/auditor|assigned|preassign/i.test(String(h||''))&&[email,name.toLowerCase()].includes(clean(row[k]).toLowerCase()));if(hit){const idcol=col(headers,['Audit ID']);affected.push({source:j===1?'Audit planning':'Log realized audits',auditId:val(row,idcol)||'row '+(i+1)})}}}
      if(newEmail!==email){
        if(newName!==name)return send(res,409,{ok:false,error:'AUDITOR_EMAIL_AND_NAME_CHANGE_SEPARATELY'});
        const readiness=await auditorIdentityReadinessRead();
        if(!readiness.ready)return send(res,409,{ok:false,error:'AUDITOR_UID_IDENTITY_NOT_READY',identityReady:false});
        const uidCol=col(ah,['Auditor_UID','Auditor UID']);
        if(uidCol<0)return send(res,409,{ok:false,error:'AUDITOR_UID_COLUMN_MISSING'});
        const uid=val(target.row,uidCol),at=new Date().toISOString();
        const vr=await sheetsBatchGet(['Auditor_Identity_Versions!A1:P2000'],true),vv=vr[0]?.values||[],vh=vv[0]||[],versions=rotationIdentityVersions(vv);
        const auditors=av.slice(1).filter(row=>val(row,ec)).map(row=>({uid:val(row,uidCol),email:val(row,ec)}));
        let plan;try{plan=planAuditorEmailTransition(auditors,versions,{uid,oldEmail:email,newEmail,at});}catch(e){return send(res,409,{ok:false,error:'AUDITOR_EMAIL_TRANSITION_REJECTED',reason:clean(e?.message||e)})}
        const vc=col(vh,['Version_ID']),uc=col(vh,['Auditor_UID']),emc=col(vh,['Email_Normalized']),sc=col(vh,['State']);
        if([vc,uc,emc,sc].some(x=>x<0))return send(res,409,{ok:false,error:'AUDITOR_VERSION_SCHEMA_INVALID'});
        const oldVersionMatches=vv.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>val(x.row,uc)===uid&&val(x.row,emc).toLowerCase()===email&&val(x.row,sc)==='ACTIVE');
        if(oldVersionMatches.length!==1)return send(res,409,{ok:false,error:'AUDITOR_ACTIVE_VERSION_NOT_UNIQUE'});
        // Planning stores denormalized auditor email in addition to Auditor_UID.
        // Until projection migration is part of the same cutover, prevent orphaned
        // current assignments even when an operator enables the write flag.
        const planningValues=v[1]?.values||[],planningHeaders=planningValues[0]||[],assignedCol=col(planningHeaders,['Assigned to']),planningUidCol=col(planningHeaders,['Auditor_UID','Auditor UID']);
        if(assignedCol<0||planningUidCol<0)return send(res,409,{ok:false,error:'AUDITOR_EMAIL_PLANNING_SCHEMA_MISSING'});
        const planningRows=planningValues.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>val(x.row,planningUidCol)===uid&&val(x.row,assignedCol).toLowerCase()===email).map(x=>x.line);
        if(planningValues.slice(1).some(row=>val(row,assignedCol).toLowerCase()===email&&val(row,planningUidCol)!==uid))return send(res,409,{ok:false,error:'AUDITOR_EMAIL_PLANNING_UID_CONFLICT'});
        if(process.env.AMS_AUDITOR_EMAIL_CHANGE_WRITE_ENABLED!=='true')return send(res,409,{ok:false,error:'AUDITOR_EMAIL_CHANGE_WRITE_DISABLED',identityReady:true,transitionReady:true});
        const lockReadiness=await auditorEmailLockReadiness();
        if(!lockReadiness.ready)return send(res,409,{ok:false,error:'AUDITOR_EMAIL_LOCK_NOT_READY',reason:lockReadiness.reason});
        const versionCells={Version_ID:randomUUID(),Auditor_UID:uid,Email_Normalized:newEmail,Valid_From_UTC:at,State:'ACTIVE',Created_At_UTC:at,Created_By:clean(actor.email),Approved_At_UTC:at,Approved_By:clean(actor.email),Reason:'Manager email change'};
        const outcome=await sheetsAtomicAuditorEmailTransition({auditorRow:target.line,auditorEmailCol:ec,oldEmail:email,newEmail,uid,versionRow:oldVersionMatches[0].line,versionHeaders:vh,versionCells,at,actor:clean(actor.email),reason:'Manager email change',planningRows});
        return send(res,200,{ok:true,updated:1,newEmail,newName,revokedTokens:outcome.revokedTokens,updatedAssignments:outcome.updatedAssignments});
      }
      if(newName!==name){const refs=v.slice(1).some(batch=>{const values=batch?.values||[],heads=values[0]||[];return values.slice(1).some(row=>heads.some((head,index)=>/auditor|assigned|preassign/i.test(String(head||''))&&clean(row[index]).toLowerCase()===name.toLowerCase()))});if(refs)return send(res,409,{ok:false,error:'AUDITOR_NAME_REKEY_REQUIRES_REFERENCE_MIGRATION'});}
      const updates=[];if(newName!==name)updates.push({range:'Auditors!A'+target.line,values:[[newName]]});if(newEmail!==email)updates.push({range:'Auditors!C'+target.line,values:[[newEmail]]});
      const detail=JSON.stringify({oldName:name,newName,oldEmail:email,newEmail,actor:clean(actor.email)}),stamp=new Date().toISOString();
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[stamp,'AUDITOR_MANAGEMENT_2_0','IDENTITY_CHANGE',email,'CHANGE_INTENT',clean(actor.email),'','',false,'No planning or realized references',detail]]);
      await sheetsValuesBatchUpdateRaw(updates);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','IDENTITY_CHANGE',newEmail,'CHANGE_APPLIED',clean(actor.email),'','',false,'Auditor identity changed',detail]]);
      return send(res,200,{ok:true,updated:updates.length,newEmail,newName});
    }catch(e){return send(res,503,{ok:false,error:'IDENTITY_SAVE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/active/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const part of req){raw+=part;if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let data;try{data=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(data?.email).toLowerCase();if(!email||typeof data?.active!=='boolean'||typeof data?.expected!=='boolean')return send(res,400,{ok:false,error:'BAD_ACTIVE_CHANGE'});
    try{
      const v=await sheetsBatchGet(['Auditors!A1:AZ1000','Audit planning!A1:BW2500']),aud=v[0]?.values||[],h=aud[0]||[],ec=col(h,['E-mail','Email']),ac=col(h,['Active']);
      const matched=aud.slice(1).map((row,i)=>({row,line:i+2})).filter(x=>ec>=0&&clean(x.row[ec]).toLowerCase()===email);
      if(matched.length!==1||ac<0)return send(res,409,{ok:false,error:'AUDITOR_IDENTITY_NOT_UNIQUE'});
      const target=matched[0],old=yes(target.row[ac]);if(old!==data.expected)return send(res,409,{ok:false,error:'STALE_AUDITOR_ACTIVE'});
      if(old===data.active)return send(res,200,{ok:true,updated:0});
      const ap=v[1]?.values||[],ah=ap[0]||[],assigned=col(ah,['Assigned to','Assigned auditor','Auditor']),pre=col(ah,['Preassigned Auditor']),st=col(ah,['Status']),id=col(ah,['Audit ID']);
      const impacted=ap.slice(1).filter(row=>['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(clean(val(row,st)).toUpperCase().replace(/[\s-]+/g,'_'))&&(directResolveAuditorEmail(aud,val(row,assigned))===email||directResolveAuditorEmail(aud,val(row,pre))===email)).map(row=>({auditId:val(row,id),status:val(row,st)}));
      if(!data.active&&impacted.length){const reviewed=data.confirmedAuditIds;if(!Array.isArray(reviewed)||reviewed.length!==impacted.length||new Set(reviewed).size!==reviewed.length||impacted.some(x=>!x.auditId||!reviewed.includes(x.auditId)))return send(res,409,{ok:false,error:'AUDITOR_INACTIVATION_REQUIRES_CONFIRMATION',impacted});}
      const trail=JSON.stringify({email,actor:clean(actor.email),old,newValue:data.active,impactedAuditIds:impacted.map(x=>x.auditId)}),when=new Date().toISOString();
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[when,'AUDITOR_MANAGEMENT_2_0','ACTIVE_CHANGE',email,'CHANGE_INTENT',clean(actor.email),'','',false,'Revalidated auditor assignments',trail]]);
      await sheetsValuesBatchUpdateRaw([{range:'Auditors!D'+target.line,values:[[data.active?'Yes':'No']]}]);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','ACTIVE_CHANGE',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Auditor status changed',trail]]);
      return send(res,200,{ok:true,updated:1,active:data.active});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_ACTIVE_SAVE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/create'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8000)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let data;try{data=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const name=clean(data?.name),email=clean(data?.email).toLowerCase(),area=clean(data?.area),role=clean(data?.role||'Auditor');
    if(!name||name.length>160||!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||role!=='Auditor')return send(res,400,{ok:false,error:'INVALID_AUDITOR_IDENTITY'});
    try{
      const readBatch=await sheetsBatchGet(['Auditors!A1:AZ1000','Auditor_Identity_Versions!A1:P2000']),read=readBatch[0]?.values||[],versionValues=readBatch[1]?.values||[],headers=read[0]||[],ec=col(headers,['E-mail','Email']),nc=col(headers,['Name']);
      if(ec<0||nc<0)return send(res,409,{ok:false,error:'AUDITORS_SCHEMA_MISSING'});
      if(read.slice(1).some(row=>clean(row[ec]).toLowerCase()===email))return send(res,409,{ok:false,error:'AUDITOR_EMAIL_EXISTS'});
      if(read.slice(1).some(row=>clean(row[nc]).toLowerCase()===name.toLowerCase()))return send(res,409,{ok:false,error:'AUDITOR_NAME_EXISTS'});
      const row=headers.map(()=>''),put=(field,value)=>{const i=headers.indexOf(field);if(i>=0)row[i]=value};
      put('Name',name);row[ec]=email;put('Active','No');put('Role',role);put('Area',area);put('Default time zone',clean(data?.timezone)||'Europe/Madrid');put('Qualification_Withdrawals_JSON','[]');
      const uidColumn=col(headers,['Auditor_UID','Auditor UID']),vh=versionValues[0]||[],ve=col(vh,['Email_Normalized']),vu=col(vh,['Auditor_UID']),vf=col(vh,['Valid_From_UTC']),vs=col(vh,['State']),vv=col(vh,['Version_ID']);
      if(uidColumn<0||[ve,vu,vf,vs,vv].some(i=>i<0))throw Error('AUDITOR_CREATE_VERSIONED_UID_SCHEMA_REQUIRED');
      if(versionValues.slice(1).some(r=>val(r,ve).toLowerCase()===email))return send(res,409,{ok:false,error:'AUDITOR_EMAIL_ALIAS_ALREADY_RESERVED'});
      const newUid=randomUUID(),versionId=randomUUID(),stamp=new Date().toISOString(),versionRow=vh.map(()=>''),vput=(field,value)=>{const i=col(vh,[field]);if(i>=0)versionRow[i]=value};
      row[uidColumn]=newUid;vput('Version_ID',versionId);vput('Auditor_UID',newUid);vput('Email_Normalized',email);vput('Valid_From_UTC',stamp);vput('State','ACTIVE');vput('Created_At_UTC',stamp);vput('Created_By',clean(actor.email));vput('Approved_At_UTC',stamp);vput('Approved_By',clean(actor.email));vput('Reason','New inactive auditor identity');
      const auditId=randomUUID(),detail=JSON.stringify({auditId,name,email,actor:clean(actor.email),active:'No'});
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','AUDITOR_CREATE',email,'CHANGE_INTENT',clean(actor.email),'','',false,'Create inactive auditor',detail]]);
      await sheetsAtomicAuditorCreate(row,versionRow);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','AUDITOR_CREATE',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Inactive auditor created',detail]]);
      return send(res,200,{ok:true,email,active:false});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_CREATE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/profile/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12288)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let request;try{request=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const email=clean(request?.email).toLowerCase(),changes=request?.changes,keys=changes&&!Array.isArray(changes)&&typeof changes==='object'?Object.keys(changes):[];
    const allowed=new Set(['Area','Default time zone','Blocked weekdays','Default departure from','Mobile telephone']);
    if(!email||!keys.length||keys.length>allowed.size||keys.some(k=>!allowed.has(k)))return send(res,400,{ok:false,error:'INVALID_AUDITOR_PROFILE_CHANGES'});
    for(const field of keys){const c=changes[field];if(!c||typeof c.expected!=='string'||typeof c.value!=='string'||c.value.length>500)return send(res,400,{ok:false,error:'INVALID_AUDITOR_PROFILE_VALUE',field});
      if(field==='Blocked weekdays'&&c.value&&!/^(Mo|Tu|We|Th|Fr)(, ?(Mo|Tu|We|Th|Fr))*$/.test(c.value))return send(res,400,{ok:false,error:'INVALID_AUDITOR_BLOCKED_WEEKDAYS'});
      if(field==='Default time zone'&&c.value&&!/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(c.value))return send(res,400,{ok:false,error:'INVALID_AUDITOR_TIMEZONE'});
    }
    try{
      const v=await sheetsBatchGet(['Auditors!A1:AZ1000']),values=v[0]?.values||[],h=values[0]||[],emailCol=col(h,['E-mail','Email']);
      const hits=values.slice(1).map((row,i)=>({row,index:i+2})).filter(x=>emailCol>=0&&clean(x.row[emailCol]).toLowerCase()===email);
      if(hits.length!==1)return send(res,409,{ok:false,error:'AUDITOR_IDENTITY_NOT_UNIQUE'});
      const target=hits[0],updates=[],diffs=[];
      for(const field of keys){const c=changes[field],j=h.indexOf(field);if(j<0)return send(res,409,{ok:false,error:'AUDITOR_FIELD_NOT_IN_SCHEMA',field});
        const old=String(target.row[j]??'');if(old!==c.expected&&old.trim()!==c.expected.trim()&&old!==c.value)return send(res,409,{ok:false,error:'STALE_AUDITOR_FIELD',field});
        if(old===c.value)continue;diffs.push({field,old,newValue:c.value});
        let n=j+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}
        updates.push({range:'Auditors!'+letter+target.index,values:[[c.value]]});
      }
      if(!updates.length)return send(res,200,{ok:true,updated:0});
      const now=new Date().toISOString(),id=createHash('sha256').update(email+now+JSON.stringify(diffs)).digest('hex').slice(0,24),details=JSON.stringify({id,auditorEmail:email,actor:clean(actor.email).toLowerCase(),changes:diffs});
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[now,'AUDITOR_MANAGEMENT_2_0','PROFILE_EDIT',email,'CHANGE_INTENT',clean(actor.email),'','',false,'Manager profile change validated',details]]);
      await sheetsValuesBatchUpdateRaw(updates);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'AUDITOR_MANAGEMENT_2_0','PROFILE_EDIT',email,'CHANGE_APPLIED',clean(actor.email),'','',false,'Canonical Auditors row updated',details]]);
      return send(res,200,{ok:true,updated:updates.length,trailId:id});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_PROFILE_SAVE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualifications/migration-lock-probe'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    if(process.env.AMS_RUNTIME_ENV!=='DEV'||SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return send(res,403,{ok:false,error:'QUALIFICATION_LOCK_DEV_ONLY'});
    try{
      const project=await verifiedAuditorLockDevProject();
      const token=await accessToken();
      const result=await withQualificationMigrationFirestoreLock20({
        project,spreadsheetId:SID,token,fetchFn:fetch,randomId:randomUUID,
        work:async()=>({ok:true,probe:'SCOPE20_LOCK_ACQUIRED'})
      });
      return send(res,200,{...result,released:true,writeToSheets:false});
    }catch(e){return send(res,409,{ok:false,error:'QUALIFICATION_LOCK_PROBE_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualifications/migration-apply'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    if(process.env.AMS_SCOPE20_QUALIFICATION_MIGRATION_WRITE_ENABLED!=='true')return send(res,403,{ok:false,error:'QUALIFICATION_MIGRATION_WRITE_DISABLED'});
    if(process.env.AMS_RUNTIME_ENV!=='DEV'||SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return send(res,403,{ok:false,error:'QUALIFICATION_MIGRATION_DEV_BOUNDARY'});
    let body;
    try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}body=JSON.parse(raw)}catch(e){return send(res,400,{ok:false,error:'INVALID_REQUEST'})}
    if(body?.confirmation!=='MIGRATE_DEV_AUDITOR_QUALIFICATIONS')return send(res,400,{ok:false,error:'QUALIFICATION_MIGRATION_CONFIRMATION_REQUIRED'});
    try{
      const project=await verifiedAuditorLockDevProject();
      const token=await accessToken();
      const result=await migrateAuditorQualificationsSheets20({
        runtimeEnv:process.env.AMS_RUNTIME_ENV,spreadsheetId:SID,verifiedProject:project,
        enabled:true,confirmation:body.confirmation,
        batchGet:sheetsBatchGet,append:sheetsValuesAppend,
        withExclusiveLock:work=>withQualificationMigrationFirestoreLock20({
          project,spreadsheetId:SID,token,fetchFn:fetch,randomId:randomUUID,work
        })
      });
      return send(res,200,result);
    }catch(e){return send(res,409,{ok:false,error:'QUALIFICATION_MIGRATION_NOT_VERIFIED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualifications/migration-plan'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const v=await sheetsBatchGet(['Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Auditor_Scope_Qualifications!A1:Z5000'],true);
      const plan=planAuditorQualificationMigration20({auditors:v[0]?.values||[],catalog:v[1]?.values||[],relations:v[2]?.values||[]});
      return send(res,plan.ok?200:409,plan);
    }catch(e){return send(res,503,{ok:false,readOnly:true,error:'QUALIFICATION_MIGRATION_PLAN_UNAVAILABLE',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualifications/parity-preview'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const batches=await sheetsBatchGet(['Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Auditor_Scope_Qualifications!A1:Z5000'],true);
      const parity=compareAuditorQualificationParity20({auditors:batches[0]?.values||[],catalog:batches[1]?.values||[],relations:batches[2]?.values||[]});
      return send(res,parity.ok?200:409,parity);
    }catch(e){return send(res,503,{ok:false,readOnly:true,error:'QUALIFICATION_PARITY_PREVIEW_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management/qualifications/migration-preview'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const batches=await sheetsBatchGet(['Auditors!A1:AZ1000','Config_Scopes!A1:Z200'],true);
      const preview=previewAuditorQualificationMigration20({auditors:batches[0]?.values||[],catalog:batches[1]?.values||[]});
      // Canonical relation parity is evaluated by the standalone read-only checker.
      return send(res,preview.ok?200:409,preview);
    }catch(e){return send(res,503,{ok:false,readOnly:true,error:'QUALIFICATION_MIGRATION_PREVIEW_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/auditor-management'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const batches=await sheetsBatchGet(['Auditors!A1:AZ1000','Config_Scopes!A1:Z200','Audit planning!A1:BW2500']);
      const av=batches[0]?.values||[],h=av[0]||[],sc=batches[1]?.values||[],sh=sc[0]||[],planning=batches[2]?.values||[],ph=planning[0]||[];
      const field=(row,names)=>{const i=col(h,names);return i<0?'':String(row[i]??'')};
      const scopeIndex=col(sh,['ScopeCode','Scope Code']),displayIndex=col(sh,['DisplayName','Display Name']);
      const scopeActive=col(sh,['Active']),scopeArchived=col(sh,['Archived']);
      const scopes=sc.slice(1).filter(row=>scopeIndex>=0&&clean(row[scopeIndex])&&(!((scopeActive>=0)&&/^(no|false|0)$/i.test(clean(row[scopeActive]))))&&!(scopeArchived>=0&&yes(row[scopeArchived]))).map(row=>({code:clean(row[scopeIndex]),name:clean(row[displayIndex])||clean(row[scopeIndex])}));
      const audits=planning.slice(1).filter(row=>{const i=col(ph,['Status']);return !/^(completed|cancelled|canceled|rejected)$/i.test(clean(row[i]))});
      const assigned=col(ph,['Assigned to','Assigned auditor','Auditor']),preassigned=col(ph,['Preassigned Auditor']);
      const rows=av.slice(1).filter(row=>field(row,['E-mail','Email'])).map(row=>{
        const email=clean(field(row,['E-mail','Email'])).toLowerCase();
        const qualified=scopes.filter(scope=>{const def=scopeCatalog(sc).find(x=>x.scopeCode===scope.code);const i=col(h,[scope.code,scope.name,def?.slotKey].filter(Boolean));return i>=0&&/^(x|yes|true|1)$/i.test(clean(row[i]))}).map(scope=>scope.code);
        const linkedAudits=audits.filter(a=>directResolveAuditorEmail(av,val(a,assigned))===email||directResolveAuditorEmail(av,val(a,preassigned))===email);const futureAudits=linkedAudits.length;const qualificationConflicts=linkedAudits.filter(a=>scopes.some(scope=>{const def=scopeCatalog(sc).find(x=>x.scopeCode===scope.code);return [scope.code,scope.name,def?.slotKey].filter(Boolean).some(alias=>{const p=col(ph,[alias]);return p>=0&&yes(a[p])})&&!qualified.includes(scope.code)})).map(a=>({auditId:val(a,col(ph,['Audit ID'])),status:val(a,col(ph,['Status']))}));
        let withdrawals=[];try{withdrawals=JSON.parse(field(row,['Qualification_Withdrawals_JSON'])||'[]');if(!Array.isArray(withdrawals))withdrawals=[]}catch{withdrawals=[]}return {name:field(row,['Name']),email,active:yes(field(row,['Active'])),role:field(row,['Role']),area:field(row,['Area']),timezone:field(row,['Default time zone']),blockedWeekdays:field(row,['Blocked weekdays']),homeBase:field(row,['Default departure from']),phone:field(row,['Mobile telephone']),qualifications:qualified,withdrawals,futureAudits,qualificationConflicts,qualificationConflictCount:qualificationConflicts.length};
      });
      return send(res,200,{ok:true,readOnly:true,source:'Auditors',scopeCatalog:scopes,rows,count:rows.length});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_MANAGEMENT_READ_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/auditor/company-management/save'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='auditor')return send(res,403,{ok:false,error:'AUDITOR_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'})}
    let request;try{request=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const uid=clean(request?.companyUid),changes=request?.changes;
    if(!uid)return send(res,400,{ok:false,error:'COMPANY_UID_REQUIRED'});
    try{validateAuditorCompanyChanges(changes)}catch(e){return send(res,400,{ok:false,error:clean(e.message)})}
    try{
      const v=await sheetsBatchGet(['Companies!A1:Y2500','Audit planning!A1:BW2500','Log realized audits!A1:AZ2500','Auditors!A1:R256']);
      const companies=v[0]?.values||[],h=companies[0]||[],id=h.indexOf('Company_UID'),nameCol=h.indexOf('Company');
      const matches=companies.slice(1).map((row,i)=>({row,index:i+2})).filter(x=>id>=0&&clean(x.row[id])===uid);
      if(matches.length!==1)return send(res,409,{ok:false,error:'COMPANY_NOT_UNIQUE_OR_MISSING'});
      const company=matches[0],name=clean(company.row[nameCol]),email=clean(actor.email).toLowerCase(),aud=v[3]?.values||[];
      const owns=(values,companyIdentifiers,auditorIdentifiers)=>{const hh=values[0]||[],uidCol=col(hh,companyIdentifiers[0]),nameIdx=col(hh,companyIdentifiers[1]),audIdx=auditorIdentifiers.map(c=>col(hh,c));return values.slice(1).some(row=>((uidCol>=0&&clean(row[uidCol])===uid)||(uidCol<0||!clean(row[uidCol]))&&nameIdx>=0&&clean(row[nameIdx]).toLowerCase()===name.toLowerCase())&&audIdx.some(i=>i>=0&&directResolveAuditorEmail(aud,val(row,i))===email))};
      const refs=[['Company_UID','Company UID'],['Company']];
      const authorized=owns(v[1]?.values||[],refs,[['Assigned to','Assigned auditor','Auditor'],['Preassigned Auditor']])||owns(v[2]?.values||[],refs,[['Auditor','Auditor Email','Email']]);
      if(!authorized)return send(res,403,{ok:false,error:'AUDITOR_COMPANY_NOT_AUTHORIZED'});
      const updates=[],diffs=[];
      for(const [field,change] of Object.entries(changes)){const colIndex=h.indexOf(field);if(colIndex<0)return send(res,409,{ok:false,error:'COMPANY_FIELD_MISSING',field});const old=String(company.row[colIndex]??'');
        if(old!==change.value&&old!==change.expected&&old.trim()!==change.expected.trim())return send(res,409,{ok:false,error:'STALE_COMPANY_FIELD',field});
        if(old===change.value)continue;
        diffs.push({field,old,newValue:change.value});let n=colIndex+1,letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26)}updates.push({range:'Companies!'+letter+company.index,values:[[change.value]]});
      }
      if(!updates.length)return send(res,200,{ok:true,updated:0,companyUid:uid});
      const stamp=new Date().toISOString(),auditId=createHash('sha256').update(stamp+'|'+email+'|'+uid+'|'+JSON.stringify(diffs)).digest('hex').slice(0,24),detail=JSON.stringify({auditId,actor:email,companyUid:uid,changes:diffs});
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[stamp,'COMPANY_2_0','AUDITOR_FIELD_EDIT',uid,'CHANGE_INTENT',email,'','',false,'Validated; canonical write pending',detail]]);
      await sheetsValuesBatchUpdateRaw(updates);
      await sheetsValuesAppend('Diagnostics_Log!A:K',[[new Date().toISOString(),'COMPANY_2_0','AUDITOR_FIELD_EDIT',uid,'CHANGE_APPLIED',email,'','',false,'Canonical write completed',detail]]);
      return send(res,200,{ok:true,updated:updates.length,companyUid:uid,auditId});
    }catch(e){return send(res,503,{ok:false,error:'AUDITOR_COMPANY_SAVE_UNCONFIRMED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/auditor/company-management'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='auditor')return send(res,403,{ok:false,error:'AUDITOR_REQUIRED'});
    try{
      const values=await sheetsBatchGet(['Companies!A1:Y2500','Company_Scopes!A1:L3000','Config_Scopes!A1:Z128','ScopeVersions!A1:I1000','Company_Scope_Hours!A1:M3000','Audit planning!A1:BW2500','Log realized audits!A1:AZ2500','Auditors!A1:R256']);
      const ap=values[5]?.values||[],ah=ap[0]||[],ci=col(ah,['Company_UID','Company UID']),cn=col(ah,['Company']),ca=col(ah,['Assigned to','Assigned auditor','Auditor']),cp=col(ah,['Preassigned Auditor']),aud=values[7]?.values||[],email=clean(actor.email).toLowerCase(),uids=new Set(),names=new Set();
      for(const row of ap.slice(1)){
        if(directResolveAuditorEmail(aud,val(row,ca))!==email&&directResolveAuditorEmail(aud,val(row,cp))!==email)continue;
        if(ci>=0&&clean(row[ci]))uids.add(clean(row[ci]));else if(cn>=0&&clean(row[cn]))names.add(clean(row[cn]).toLowerCase());
      }
      const log=values[6]?.values||[],lh=log[0]||[],lci=col(lh,['Company_UID','Company UID']),lcn=col(lh,['Company']),la=col(lh,['Auditor','Auditor Email','Email']);
      for(const row of log.slice(1)){if(directResolveAuditorEmail(aud,val(row,la))!==email)continue;if(lci>=0&&clean(row[lci]))uids.add(clean(row[lci]));else if(lcn>=0&&clean(row[lcn]))names.add(clean(row[lcn]).toLowerCase())}
      const result=buildCompanyManagementReadModel20({companies:values[0]?.values||[],companyScopes:values[1]?.values||[],configScopes:values[2]?.values||[],scopeVersions:values[3]?.values||[],companyHours:values[4]?.values||[]});
      result.companies=result.companies.filter(c=>uids.has(c.companyUid)||(names.has(clean(c.name).toLowerCase())&&result.companies.filter(y=>clean(y.name).toLowerCase()===clean(c.name).toLowerCase()).length===1));
      result.readOnly=true;result.actorRole='AUDITOR';result.activeAuditors=[];return send(res,200,result);
    }catch(e){return send(res,409,{ok:false,error:'AUDITOR_COMPANY_READ_FAILED',detail:clean(e?.message||e)})}
  }
  if(u.pathname==='/api/v1/manager/company-management'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{const v=await sheetsBatchGet(['Companies!A1:Y2500','Company_Scopes!A1:L3000','Config_Scopes!A1:Z128','ScopeVersions!A1:I1000','Company_Scope_Hours!A1:M3000','Auditors!A1:R256']);
      const out=buildCompanyManagementReadModel20({companies:v[0]?.values||[],companyScopes:v[1]?.values||[],configScopes:v[2]?.values||[],scopeVersions:v[3]?.values||[],companyHours:v[4]?.values||[]});const aud=v[5]?.values||[],ah=aud[0]||[],ei=ah.indexOf('E-mail'),ni=ah.indexOf('Name'),ai=ah.indexOf('Active'),ri=ah.indexOf('Role');out.activeAuditors=aud.slice(1).filter(r=>ei>=0&&ni>=0&&clean(r[ei])&&(!~ai||['YES','TRUE','1'].includes(clean(r[ai]).toUpperCase()))&&(!~ri||clean(r[ri]).toLowerCase()==='auditor')).map(r=>({email:clean(r[ei]).toLowerCase(),name:clean(r[ni])}));return send(res,200,out);
    }catch(e){return send(res,409,{ok:false,error:'COMPANY_MANAGEMENT_READ_FAILED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/company-scope-hours'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const vr=await sheetsBatchGet(['Company_Scope_Hours!A1:M2000']);
      const values=vr[0]?.values||[],head=(values[0]||[]).map(clean);
      const required=['OverrideId','Company_UID','ScopeCode','Hours','Status','Revision','SupersedesOverrideId'];
      if(required.some(h=>!head.includes(h)))return send(res,409,{ok:false,error:'COMPANY_HOURS_SCHEMA_MISMATCH'});
      const rows=values.slice(1).filter(r=>r.some(v=>clean(v))).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
      return send(res,200,{ok:true,rows,readOnly:true,cutover:false});
    }catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/company-scope-hours/resolve'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    const companyId=clean(u.searchParams.get('companyUid')),scopeCode=clean(u.searchParams.get('scopeCode')),effectiveDate=clean(u.searchParams.get('effectiveDate'));
    if(!companyId||!scopeCode||!effectiveDate)return send(res,400,{ok:false,error:'RESOLUTION_PARAMETERS_REQUIRED'});
    try{
      const vr=await sheetsBatchGet(['Company_Scopes!A1:L2000','Company_Scope_Hours!A1:M2000','ScopeVersions!A1:I1000']);
      const objects=x=>{const rows=x?.values||[],h=(rows[0]||[]).map(clean);return rows.slice(1).filter(r=>r.some(v=>clean(v))).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));};
      const result=resolveCompanyScopeHours20({companyId,scopeCode,effectiveDate,companyScopes:objects(vr[0]),overrides:objects(vr[1]),scopeVersions:objects(vr[2])});
      return send(res,200,{ok:true,...result,readOnly:true,cutover:false});
    }catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/company-scope-hours/backfill'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{return send(res,200,await backfillCompanyHours20({body,actor,SID,sheetsBatchGet,accessToken}));}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/company-scope-hours/migration-preview'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const storage=await companyHoursStorage20({method:'GET',SID,accessToken,sheetsBatchGet});
      const ranges=['Company_Scopes!A1:L2000','Config_Scopes!A1:Z128'];
      if(storage.ready)ranges.push('Company_Scope_Hours!A1:M2000');
      const vr=await sheetsBatchGet(ranges);
      return send(res,200,previewCompanyHoursMigration20({companyScopes:vr[0]?.values||[],configScopes:vr[1]?.values||[],targetRows:storage.ready?vr[2]?.values||[]:[]}));
    }catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/company-scope-hours/storage'&&['GET','POST'].includes(req.method)){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let body={};
    if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}}
    try{const result=await companyHoursStorage20({method:req.method,body,SID,accessToken,sheetsBatchGet});if(result.created)console.info(JSON.stringify({event:'COMPANY_HOURS_STORAGE_CREATED',actor:clean(actor.email),timestamp:new Date().toISOString()}));return send(res,200,result);}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/create'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{return send(res,200,await createScope20({body,actor,SID,sheetsBatchGet,accessToken,clean}));}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/cosmetic'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const part of req)raw+=part;
    if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let body={};try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{const saved=await saveScopeCosmetic20(body);if(saved.ok&&!saved.unchanged)console.info(JSON.stringify({event:'SCOPE_MANAGEMENT_20_COSMETIC_CHANGE',actor:clean(actor.email).toLowerCase(),scopeCode:saved.scopeCode,field:saved.field,before:saved.previous,after:saved.value,timestamp:new Date().toISOString()}));return send(res,200,saved);}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/scheme-version'&&(req.method==='GET'||req.method==='POST')){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let body={scopeCode:u.searchParams.get('scopeCode')};
    if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}}
    try{return send(res,200,await scopeSchemeVersion20({method:req.method,body,actor,SID,sheetsBatchGet,accessToken,clean}));}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/policy'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{return send(res,200,await updateScopePolicy20({body,actor,SID,sheetsBatchGet,accessToken,clean}));}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/impact'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    const code=clean(u.searchParams.get('scopeCode')),field=clean(u.searchParams.get('field'));
    if(!code||!['Default_hours','Active','Archived','Max number audits','Min_Interval_Months','Planning from','Planning to','Extension','Recurring','Obligation cycle','Complete by','Provisioning source','Trigger source','Source service','Max_Offsite_Hours'].includes(field))return send(res,400,{ok:false,error:'IMPACT_FIELD_NOT_ALLOWED'});
    try{
      const vr=await sheetsBatchGet(['Config_Scopes!A1:Z128','Audit planning!A1:BW2500','Audit_Obligations!A1:Z2500','Audit_Visit_Obligations!A1:Z2500']);
      const catalog=vr[0]?.values||[],head=(catalog[0]||[]).map(clean),ci=head.indexOf('ScopeCode'),fi=head.indexOf(field);
      if(ci<0||fi<0)return send(res,409,{ok:false,error:'SCOPE_SCHEMA_MISSING'});
      const matches=catalog.slice(1).filter(r=>clean(r[ci])===code);
      if(matches.length!==1)return send(res,409,{ok:false,error:'SCOPE_IDENTITY_AMBIGUOUS'});
      const audits=vr[1]?.values||[],ah=(audits[0]||[]).map(clean),auditIdCol=col(ah,['Audit ID','Audit_ID']),statusCol=col(ah,['Status']);
      if(auditIdCol<0||statusCol<0)return send(res,409,{ok:false,error:'AUDIT_SCHEMA_INCOMPLETE'});
      const obligations=vr[2]?.values||[],oh=(obligations[0]||[]).map(clean),oc=col(oh,['ScopeCode','Scope_Code','Scope']),oid=col(oh,['Obligation_ID','Obligation ID']);
      const links=vr[3]?.values||[],lh=(links[0]||[]).map(clean),linkOb=col(lh,['Obligation_ID','Obligation ID']),linkAudit=col(lh,['Audit_ID','Audit ID']);
      if(oc<0||oid<0||linkOb<0||linkAudit<0)return send(res,409,{ok:false,error:'IMPACT_LINK_SCHEMA_INCOMPLETE'});
      const obligationIds=new Set(obligations.slice(1).filter(r=>clean(r[oc])===code).map(r=>clean(r[oid])));
      const affectedIds=new Set(links.slice(1).filter(r=>obligationIds.has(clean(r[linkOb]))).map(r=>clean(r[linkAudit])));
      const impacted=audits.slice(1).filter(r=>affectedIds.has(clean(r[auditIdCol]))).map(r=>({auditId:clean(r[auditIdCol]),status:clean(r[statusCol])}));
      const open=impacted.filter(r=>!['completed','cancelled','canceled','rejected'].includes(r.status.toLowerCase()));
      return send(res,200,{ok:true,readOnly:true,scopeCode:code,field,current:String(matches[0][fi]??''),linkedAudits:impacted.length,openAudits:open.length,accepted:open.filter(r=>r.status.toLowerCase()==='accepted').length,impacted:open.slice(0,100),truncated:open.length>100});
    }catch(e){return send(res,409,{ok:false,error:'IMPACT_PREVIEW_UNAVAILABLE',detail:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/hours-version'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{return send(res,200,await activateScopeHoursVersion20({body,actor,SID,sheetsBatchGet,accessToken,clean}));}
    catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/bootstrap-v1'&&req.method==='POST'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let body;try{body=JSON.parse(raw)}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    if(body?.confirmation!=='INITIALIZE_CURRENT_V1'||!clean(body?.reason))return send(res,400,{ok:false,error:'EXPLICIT_CONFIRMATION_AND_REASON_REQUIRED'});
    try{
      const catalog=(await sheetsBatchGet(['Config_Scopes!A1:Z128']))[0]?.values||[],head=(catalog[0]||[]).map(clean),codeIndex=head.indexOf('ScopeCode'),hoursIndex=head.indexOf('Default_hours');
      if(codeIndex<0||hoursIndex<0)return send(res,409,{ok:false,error:'CATALOG_SCHEMA_MISSING'});
      const records=catalog.slice(1).filter(r=>clean(r[codeIndex]));
      if(!records.length||records.length>20)return send(res,409,{ok:false,error:'CATALOG_SIZE_INVALID'});
      const codes=new Set(),versions=[],skipped=[];
      for(const r of records){
        const code=clean(r[codeIndex]),rawHours=r[hoursIndex],hours=Number(String(rawHours??'').replace(',','.'));
        if(codes.has(code))return send(res,409,{ok:false,error:'DUPLICATE_SCOPE_CODE',scopeCode:code});
        codes.add(code);
        if(rawHours===''||rawHours===null||rawHours===undefined){skipped.push({scopeCode:code,reason:'HOURS_NOT_CONFIGURED'});continue;}
        if(!Number.isFinite(hours)||hours<0)return send(res,409,{ok:false,error:'INVALID_SCOPE_HOURS',scopeCode:code,value:String(rawHours)});
        versions.push([code,'V1',hours,'CURRENT','','',new Date().toISOString(),clean(actor.email||actor.sub||'Manager'),clean(body.reason)]);
      }
      if(!versions.length)return send(res,409,{ok:false,error:'NO_CONFIGURED_SCOPE_HOURS',skipped});
      const token=await accessToken(),base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID);
      const metadataResponse=await fetch(base+'?fields=sheets.properties(title,sheetId)',{headers:{authorization:'Bearer '+token}});
      if(!metadataResponse.ok)throw Error('SHEETS_METADATA_UNAVAILABLE');
      const metadata=await metadataResponse.json(),sheets=metadata.sheets||[];
      if(sheets.some(x=>x.properties?.title==='ScopeVersions'))return send(res,409,{ok:false,error:'VERSION_STORAGE_ALREADY_EXISTS'});
      const sheetId=20261011;
      if(sheets.some(x=>x.properties?.sheetId===sheetId))return send(res,409,{ok:false,error:'VERSION_SHEET_ID_COLLISION'});
      const headers=['ScopeCode','VersionId','Hours_to_plan','Status','Effective_From','Effective_To','Created_At','Created_By','Change_Reason'];
      const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}});
      const rows=[headers,...versions].map(values=>({values:values.map(cell)}));
      const requests=[{addSheet:{properties:{sheetId,title:'ScopeVersions',gridProperties:{rowCount:1000,columnCount:9,frozenRowCount:1}}}},{updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows,fields:'userEnteredValue'}}];
      const write=await fetch(base+':batchUpdate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requests})});
      if(!write.ok)throw Error('ATOMIC_VERSION_BOOTSTRAP_FAILED_'+write.status);
      console.info(JSON.stringify({event:'SCOPE_V1_INITIALIZED',actor:clean(actor.email||actor.sub||'Manager'),scopeCount:versions.length,timestamp:new Date().toISOString()}));
      return send(res,200,{ok:true,initialized:true,versionId:'V1',count:versions.length,skipped});
    }catch(e){return send(res,409,{ok:false,error:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/version-status'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const token=await accessToken(),url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'?fields=sheets.properties(title,sheetId)';
      const response=await fetch(url,{headers:{authorization:'Bearer '+token}});
      if(!response.ok)throw Error('SHEET_METADATA_HTTP_'+response.status);
      const metadata=await response.json(),present=(metadata.sheets||[]).some(x=>x.properties?.title==='ScopeVersions');
      return send(res,200,{ok:true,initialized:present,storage:present?'PRESENT':'ABSENT'});
    }catch(e){return send(res,409,{ok:false,error:'VERSION_STATUS_UNAVAILABLE',detail:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes/versions'&&req.method==='GET'){
    const actor=await sessionFromRequestValidated(req);
    if(!actor)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(actor.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const vr=await sheetsBatchGet(['ScopeVersions!A1:I1000']);
      const rows=vr[0]?.values||[],required=['ScopeCode','VersionId','Hours_to_plan','Status','Effective_From','Effective_To','Created_At','Created_By','Change_Reason'],head=(rows[0]||[]).map(clean);
      if(required.some(h=>!head.includes(h)))return send(res,409,{ok:false,error:'VERSION_SCHEMA_INVALID'});
      const versions=rows.slice(1).filter(r=>clean(r[head.indexOf('ScopeCode')])).map(r=>Object.fromEntries(required.map(h=>[h,r[head.indexOf(h)]??''])));
      const currents={};for(const v of versions){if(clean(v.Status).toUpperCase()==='CURRENT'){if(currents[v.ScopeCode])return send(res,409,{ok:false,error:'MULTIPLE_CURRENT_VERSIONS'});currents[v.ScopeCode]=v.VersionId;}}
      return send(res,200,{ok:true,initialized:true,versions});
    }catch(e){return send(res,409,{ok:false,initialized:false,error:'VERSION_STORAGE_NOT_READY',detail:clean(e.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/scopes'&&req.method==='GET'){
    const session=sessionFromRequest(req);
    if(!session)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(session.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'MANAGER_REQUIRED'});
    try{
      const vr=await sheetsBatchGet(['Config_Scopes!A1:Z128','ScopeVersions!A1:I1000']);
      const values=vr[0]?.values||[],headers=(values[0]||[]).map(v=>clean(v));
      const versionRows=vr[1]?.values||[],vh=(versionRows[0]||[]).map(v=>clean(v));
      const vCode=vh.indexOf('ScopeCode'),vId=vh.indexOf('VersionId'),vStatus=vh.indexOf('Status');
      if(vCode<0||vId<0||vStatus<0)return send(res,409,{ok:false,error:'SCOPE_VERSION_SCHEMA_MISSING'});
      const currentVersions=new Map();for(const row of versionRows.slice(1)){if(clean(row[vStatus]).toUpperCase()!=='CURRENT')continue;const code=clean(row[vCode]);if(currentVersions.has(code))return send(res,409,{ok:false,error:'MULTIPLE_CURRENT_VERSIONS',scopeCode:code});currentVersions.set(code,clean(row[vId]));}
      const required=['SlotKey','ScopeCode','DisplayName','Active','Archived','Default_hours','Max number audits','Min_Interval_Months','Planning from','Planning to'];
      const missing=required.filter(h=>!headers.includes(h));
      if(missing.length)return send(res,409,{ok:false,error:'SCOPE_SCHEMA_MISSING',missing});
      const get=(r,h)=>r[headers.indexOf(h)]??'';
      const rows=values.slice(1).filter(r=>clean(get(r,'ScopeCode'))).map(r=>({
        slotKey:get(r,'SlotKey'),scopeCode:get(r,'ScopeCode'),displayName:get(r,'DisplayName'),currentVersion:currentVersions.get(clean(get(r,'ScopeCode')))||'',
        active:['yes','true','1'].includes(clean(get(r,'Active')).toLowerCase()),
        archived:['yes','true','1'].includes(clean(get(r,'Archived')).toLowerCase()),
        hoursToPlan:get(r,'Default_hours'),rotationLimit:get(r,'Max number audits'),
        minimumIntervalMonths:get(r,'Min_Interval_Months'),planningFrom:get(r,'Planning from'),planningTo:get(r,'Planning to'),
        policy:Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))
      }));
      return send(res,200,{ok:true,readOnly:true,rows,versionStorageInitialized:false});
    }catch(e){return send(res,500,{ok:false,error:'SCOPE_READ_FAILED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/open'&&req.method==='GET'){const s=await sessionFromRequestValidated(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});const role=clean(s.role).toLowerCase();if(!['manager','auditor'].includes(role))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});try{return send(res,200,role==='auditor'?await auditorOpenRead(clean(s.email).toLowerCase()):await managerOpenRead(clean(s.email).toLowerCase()));}catch(e){return send(res,500,{ok:false,error:'OPEN_GRID_READ_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/internal/dev-auditor-uid'&&req.method==='POST'){
    if(process.env.AMS_RUNTIME_ENV!=='DEV'||!sessionConfigured())return send(res,404,{ok:false,error:'NOT_FOUND'});
    if(!safeEq(clean(req.headers['x-ams-internal-secret']),SESSION_SECRET))return send(res,403,{ok:false,error:'FORBIDDEN'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});}
    let body;try{body=JSON.parse(raw);}catch{return send(res,400,{ok:false,error:'BAD_JSON'});}
    const email=clean(body?.email).toLowerCase();
    if(!email||email!==clean(process.env.AMS_DEV_AUDITOR_EMAIL).toLowerCase())return send(res,403,{ok:false,error:'DEV_AUDITOR_NOT_CONFIGURED'});
    try{const result=await validateVersionedAuditorLogin(email);return result.ok&&result.uid?send(res,200,{ok:true,auditorUid:result.uid}):send(res,409,{ok:false,error:result.error||'AUDITOR_UID_UNAVAILABLE'});}
    catch(e){return send(res,503,{ok:false,error:'AUDITOR_IDENTITY_LOOKUP_FAILED',detail:clean(e.message)});}
  }
  if(u.pathname==='/api/v1/session'&&req.method==='GET'){if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});const s=await sessionFromRequestValidated(req);return s?send(res,200,{ok:true,identity:{email:s.email,role:s.role},expiresAt:s.exp}):send(res,401,{ok:false,error:'SESSION_REQUIRED'});}
  if(u.pathname!=='/api/v1/planning/workspace'||req.method!=='GET')return send(res,404,{ok:false,error:'NOT_FOUND'});
  const session=await sessionFromRequestValidated(req);if(!session)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(!['manager','auditor'].includes(clean(session.role).toLowerCase()))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
  const id=clean(u.searchParams.get('auditId'));
  if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});
  if(!id)return send(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});
  if(!SID)return send(res,500,{ok:false,error:'DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED'});
  try{return send(res,200,await focused(id,session));}
  catch(e){return send(res,500,{ok:false,error:'DIRECT_SHEETS_READ_FAILED',detail:clean(e?.message||e)});}
}).listen(PORT,'0.0.0.0');