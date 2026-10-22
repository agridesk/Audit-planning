/** AMS DEV Availability 2.0 entrypoint. All existing R12 routes are preserved by proxy.
 * Enable only after Firestore IAM/database preflight and DEV-only deployment approval.
 */
import http from 'node:http';
import {resolveAmsRuntimeConfig} from './runtime-environment-20.mjs';
import {notificationOverview} from './notification-overview-20.mjs';
import {buildRotationManager20} from './rotation-manager-20.mjs';

import {URL} from 'node:url';
import {createAvailabilityHttpRouter} from './availability-http-api-20.js';
import {createAvailabilityService} from './availability-storage-service-20.js';
import {createFirestoreAvailabilityAdapter} from './availability-firestore-adapter-20.js';
import {createPlanningOverlayService} from './availability-planning-overlay-service-20.js';
import {createPlanningReadCache} from './availability-planning-read-cache-20.js';
import {planLegacyHardMigration} from './availability-legacy-hard-migration-plan-20.js';
import {migrateLegacyHardHistory} from './availability-hard-history-migration-20.js';

const port=Number(process.env.PORT||8080);
const innerPort=port+1;
async function resolveProject(){
 const configured=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCP_PROJECT||'';
 if(configured)return configured;
 try{
  const r=await fetch('http://metadata.google.internal/computeMetadata/v1/project/project-id',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(2500)});
  if(r.ok)return (await r.text()).trim();
 }catch{}
 return '';
}
const runtime=resolveAmsRuntimeConfig(process.env,await resolveProject());
const project=runtime.project;
const spreadsheet=runtime.spreadsheet;
process.env.AMS_RUNTIME_ENV=runtime.mode;
process.env.AMS_SSOT_SPREADSHEET_ID=spreadsheet;
if(!runtime.isDev){
 process.env.AMS_GAS_WRITE_URL=runtime.gasWriteUrl;
 process.env.AMS_ALLOWED_ORIGIN=runtime.origin;
 process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY=process.env.AMS_PROD_EXTERNAL_WRITE_BRIDGE_KEY;
}
process.env.PORT=String(innerPort);
await import('./server-r12.js');
process.env.PORT=String(port);
const tokenState={token:'',expires:0};
async function getToken(){
 if(tokenState.token&&Date.now()<tokenState.expires-60000)return tokenState.token;
 const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});
 if(!r.ok)throw Error('METADATA_TOKEN_'+r.status);
 const j=await r.json();tokenState.token=j.access_token;tokenState.expires=Date.now()+(Number(j.expires_in)||300)*1000;
 if(!tokenState.token)throw Error('METADATA_TOKEN_MISSING');return tokenState.token;
}
async function getRoster(){
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent("'Auditors'!A1:AZ500");
 const r=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
 if(!r.ok)throw Error('AUDITOR_ROSTER_READ_'+r.status);
 const rows=(await r.json()).values||[],headers=(rows[0]||[]).map(v=>String(v).trim().toLowerCase().replace(/[\s_-]+/g,''));
 const idx=(...names)=>names.map(n=>headers.indexOf(n.toLowerCase().replace(/[\s_-]+/g,''))).find(i=>i>=0)??-1;
 const email=idx('Email','E-mail'),uid=idx('Auditor UID','AuditorUID','UID','Auditor ID','AuditorID'),name=idx('Auditor Name','Full Name','Name','Display Name'),role=idx('Role'),active=idx('Active');
 if(email<0||uid<0||role<0)throw Error('AUDITOR_ROSTER_CANONICAL_COLUMNS_MISSING');
 const records=rows.slice(1).map(r=>({auditorId:String(r[uid]||'').trim(),email:String(r[email]||'').trim().toLowerCase(),displayName:String(r[name]||r[email]||'').trim(),role:String(r[role]||'').trim().toLowerCase(),active:active<0||['yes','true','1','active','x'].includes(String(r[active]||'').trim().toLowerCase())})).filter(x=>x.auditorId&&x.email&&x.active);
 if(new Set(records.map(x=>x.auditorId)).size!==records.length||new Set(records.map(x=>x.email)).size!==records.length)throw Error('AUDITOR_ROSTER_DUPLICATE_IDENTITY');
 return records;
}
async function session(req){
 const r=await fetch('http://127.0.0.1:'+innerPort+'/api/v1/session',{headers:{cookie:String(req.headers.cookie||'')},redirect:'manual'});
 if(!r.ok)return null;
 const j=await r.json().catch(()=>null);
 if(j?.ok!==true||!j.identity?.email)return null;
 const role=String(j.identity.role||'').trim().toLowerCase();
 if(!['auditor','manager'].includes(role))return null;
 const email=String(j.identity.email).trim().toLowerCase();
 // The verified R12 session grants the role; the roster provides the immutable UID.
 // Managers and auditors use the same canonical identity resolution.
 const records=await getRoster();
 const user=records.find(x=>x.email===email);
 if(!user?.auditorId||user.role!==role)throw Error('AVAILABILITY_AUDITOR_UID_UNRESOLVED');
 return {role,email,auditorId:user.auditorId};
}
const adapter=createFirestoreAvailabilityAdapter({projectId:project,getToken});
const service=createAvailabilityService(adapter);
async function readPlanningRows(){
 // Existing DEV Audit planning tab; bounded read, never a full-sheet hot-path scan.
 // Fail closed if configured maximum is reached: a truncated source is unsafe.
 const range='Audit planning!A1:AZ2000';
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(range);
 const response=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
 if(!response.ok)throw Error('CANONICAL_PLANNING_READ_'+response.status);
 const rows=(await response.json()).values;
 if(!Array.isArray(rows)||rows.length===0||rows.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');
 return rows;
}
const planningCache=createPlanningReadCache({load:readPlanningRows,ttlMs:10000});
const scopeNamesCache=createPlanningReadCache({load:async()=>{
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent("'Config_Scopes'!A1:AZ250");
 const response=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
 if(!response.ok)throw Error('CANONICAL_SCOPE_CONFIG_READ_'+response.status);
 const rows=(await response.json()).values;
 if(!Array.isArray(rows)||!rows.length)throw Error('CANONICAL_SCOPE_CONFIG_MISSING');
 return rows;
},ttlMs:30000});
async function readScopeNames(){
 const rows=await scopeNamesCache.read(),headers=(rows[0]||[]).map(x=>String(x||'').trim().toLowerCase().replace(/[\s_-]+/g,''));
 const idx=(...names)=>names.map(n=>headers.indexOf(n.toLowerCase().replace(/[\s_-]+/g,''))).find(i=>i>=0)??-1;
 const slot=idx('SlotKey','Slot','ScopeSlot'),name=idx('DisplayName','Name','ScopeName','ScopeCode');
 if(slot<0||name<0)throw Error('CANONICAL_SCOPE_CONFIG_HEADERS_MISSING');
 const map={};for(const row of rows.slice(1)){const k=String(row[slot]||'').trim().toUpperCase(),v=String(row[name]||'').trim();if(/^SCOPE_\d+$/.test(k)&&v)map[k]=v;}return map;
}
const overlay=createPlanningOverlayService({
 service,
 readPlanningRows:planningCache.read,
 readScopeNames,
 listCanonicalAuditors:async()=>{
  const roster=await getRoster();
  return roster.filter(x=>x.auditorId&&!x.auditorId.startsWith('manager:')).map(x=>({auditorId:x.auditorId,email:x.email}));
 }
});
const availability=createAvailabilityHttpRouter({service:overlay,resolveIdentity:session,listAuditors:async actor=>{
 const roster=await getRoster();
 return roster.filter(x=>actor.role==='auditor'?x.auditorId===actor.auditorId:x.role==='auditor').map(x=>({auditorId:x.auditorId,displayName:x.displayName}));
}});
async function legacyAvailabilityDiagnostic(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(403);res.end();return;}
 const range="'Auditor Availability'!A1:AZ2000";
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(range);
 const r=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
 if(!r.ok)throw Error('LEGACY_AVAILABILITY_READ_'+r.status);
 const rows=(await r.json()).values||[];
 if(rows.length>=2000)throw Error('LEGACY_AVAILABILITY_SCAN_LIMIT');
 const headers=rows[0]||[];
 const required=['Date','Auditor_Email','Available','Status_1','Status_2'];
 const missing=required.filter(x=>!headers.includes(x));
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 const at=name=>headers.indexOf(name);
 const statusCols=[at('Status_1'),at('Status_2')].filter(i=>i>=0);
 const availableCol=at('Available'),dateCol=at('Date'),emailCol=at('Auditor_Email');
 const migrationPlan=planLegacyHardMigration({rows,roster:await getRoster(),verifiedEmailAliases:[{oldEmail:'romboutsrwj@gmail.com',newEmail:'info@agridesk.com',uid:'7ab11689-692c-4aa9-8056-c106f249bdae'}]});
 const counts={recurringDefault:0,weekendDefault:0,manualHardCandidate:0,manualAmbiguous:0,occupancy:0,unclassified:0};
 const statusCounts={};const candidates=[];
 for(let n=1;n<rows.length;n++){
  const row=rows[n],statuses=statusCols.map(i=>String(row[i]||'').trim().toUpperCase()).filter(Boolean);
  for(const state of statuses)statusCounts[state]=(statusCounts[state]||0)+1;
  const hasAudit=at('Audit_ID_1')>=0&&Boolean(row[at('Audit_ID_1')])||at('Audit_ID_2')>=0&&Boolean(row[at('Audit_ID_2')]);
  if(hasAudit){counts.occupancy++;continue;}
  if(statuses.includes('DEFAULT_WEEKEND_SOFT')){counts.weekendDefault++;continue;}
  if(statuses.includes('DEFAULT_AUDITOR_BLOCKED_SOFT')){counts.recurringDefault++;continue;}
  if(statuses.includes('MANUAL_AUDITOR_BLOCKED_SOFT')||statuses.includes('USER_MANUAL')||statuses.includes('MANUAL_AUDITOR_BLOCKED_HARD')){
   if(statuses.includes('MANUAL_AUDITOR_BLOCKED_SOFT')&&statuses.includes('USER_MANUAL')&&dateCol>=0&&emailCol>=0&&row[dateCol]&&row[emailCol]&&String(row[availableCol]||'').toUpperCase()==='NO'){counts.manualHardCandidate++;candidates.push(n+1);}
   else counts.manualAmbiguous++;
   continue;
  }
  if(statuses.length||availableCol>=0&&String(row[availableCol]||'').toUpperCase()==='NO')counts.unclassified++;
 }
 res.end(JSON.stringify({success:true,readOnly:true,rows:Math.max(0,rows.length-1),missing,legacySource:'Auditor Availability',statusCounts,classification:counts,manualHardMigrationCandidateRows:candidates.slice(0,100),candidatesTruncated:candidates.length>100,migration:'NOT_APPLIED',hardMigrationPlan:migrationPlan}));
}
async function legacyHardMigration(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(403,{'cache-control':'no-store'});res.end('Manager session required');return;}
 const host=String(req.headers.host||'');
 const origin=String(req.headers.origin||'');
 if(req.method==='POST'&&(!origin||new URL(origin).host!==host||new URL(origin).protocol!=='https:')){res.writeHead(403);res.end('Invalid origin');return;}
 const range="'Auditor Availability'!A1:AZ2000";
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(range);
 const source=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
 if(!source.ok)throw Error('LEGACY_AVAILABILITY_READ_'+source.status);
 const rows=(await source.json()).values||[];
 if(rows.length>=2000)throw Error('LEGACY_AVAILABILITY_SCAN_LIMIT');
 const plan=planLegacyHardMigration({rows,roster:await getRoster(),verifiedEmailAliases:[{oldEmail:'romboutsrwj@gmail.com',newEmail:'info@agridesk.com',uid:'7ab11689-692c-4aa9-8056-c106f249bdae'}]});
 if(req.method==='GET'){
  const result=await migrateLegacyHardHistory({plan,adapter,dryRun:true});
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end('<!doctype html><meta charset="utf-8"><title>DEV HARD migration</title><h2>DEV historical HARD migration</h2><p>Read-only check: '+result.total+' legacy records, '+result.alreadyMigrated+' already migrated, '+result.toCreate+' to create. PROD untouched.</p><form method="post"><button type="submit">Migrate historical HARD records to DEV Firestore</button></form>');
  return;
 }
 if(req.method!=='POST'){res.writeHead(405);res.end();return;}
 const result=await migrateLegacyHardHistory({plan,adapter,dryRun:false});
 res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
 res.end(JSON.stringify(result));
}
async function notificationsManagerOverview(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401,{'cache-control':'no-store'});res.end('Manager session required');return;}
 const sources=[['Notification_Config',500],['Notification_Rules',500],['System_Config',500]];
 const data={};
 for(const [tab,limit] of sources){
  const range="'"+tab+"'!A1:AZ"+limit;
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(range);
  const response=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
  if(!response.ok)throw Error('NOTIFICATION_OVERVIEW_SOURCE_UNAVAILABLE');
  const rows=(await response.json()).values||[];
  if(rows.length>=limit)throw Error('NOTIFICATION_OVERVIEW_SOURCE_TRUNCATED');
  data[tab]=rows;
 }
 const rules=data.Notification_Rules||[];
 const head=(rules[0]||[]).map(x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''));
 const keyCol=head.indexOf('RULEKEY'),valueCol=head.indexOf('VALUE');
 const queueRule=rules.slice(1).find(row=>keyCol>=0&&String(row[keyCol]||'').trim().toUpperCase()==='QUEUE_SHEET_NAME');
 const configuredQueue=queueRule&&valueCol>=0?String(queueRule[valueCol]||'').trim():'';
 const queueName=configuredQueue||'Notification Queue';
 if(!queueName||queueName.length>100||/[\x00-\x1f]/.test(queueName))throw Error('NOTIFICATION_QUEUE_NAME_INVALID');
 const queueRange="'"+queueName.replace(/'/g,"''")+"'!A1:AZ5000";
 const queueUrl='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(queueRange);
 const queueResponse=await fetch(queueUrl,{headers:{authorization:'Bearer '+await getToken()}});
 if(!queueResponse.ok)throw Error('NOTIFICATION_QUEUE_UNAVAILABLE');
 const queue=(await queueResponse.json()).values||[];
 if(queue.length>=5000)throw Error('NOTIFICATION_QUEUE_SOURCE_TRUNCATED');
 const sysRowsForCount=data.System_Config||[];const sysHeadersForCount=(sysRowsForCount[0]||[]).map(v=>String(v||'').trim().toUpperCase());const devColForCount=sysHeadersForCount.indexOf(runtime.mode);const systemSettingsForCount=[['SETTING_KEY','SETTING_VALUE']];if(devColForCount>=0)for(const row of sysRowsForCount.slice(1)){const key=String(row[0]||'').trim().toUpperCase();if(key)systemSettingsForCount.push([key,'CONFIGURED']);}
 const result=notificationOverview({config:data.Notification_Config,rules:data.Notification_Rules,settings:systemSettingsForCount,queue});
 const sys=data.System_Config||[];const envHeaders=(sys[0]||[]).map(v=>String(v||'').trim().toUpperCase());const envCol=envHeaders.indexOf(runtime.mode);const systemMap={};for(const row of sys.slice(1)){const key=String(row[0]||'').trim().toUpperCase();if(key&&envCol>=0)systemMap[key]=String(row[envCol]||'').trim();}
 // Environment-specific notification settings are owned exclusively by System_Config; do not read legacy Notification_Settings.
 const settingMap=systemMap;
 const duplicateDiagnostics=[];
 for(const [tab,rows,keys] of [['Notification_Config',data.Notification_Config,['EVENTKEY']],['Notification_Rules',data.Notification_Rules,['RULEKEY']],['System_Config',data.System_Config,['KEY','SETTINGKEY']]]){
  const header=(rows[0]||[]).map(v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''));
  const index=keys.map(k=>header.indexOf(k)).find(i=>i>=0)??(tab==='System_Config'?0:-1);
  if(index<0){duplicateDiagnostics.push({tab,issue:'KEY_COLUMN_NOT_FOUND'});continue;}
  const seen=new Map();
  rows.slice(1).forEach((row,i)=>{const key=String(row[index]||'').trim().toUpperCase();if(!key)return;const found=seen.get(key)||[];found.push(i+2);seen.set(key,found);});
  for(const [key,lines] of seen)if(lines.length>1)duplicateDiagnostics.push({tab,key,rows:lines,issue:'DUPLICATE_KEY'});
 }
 const editableRuleKeys=new Set(['COMING_UP_DAYS','PENDING_PLANNING_UPCOMING_DAYS','PENDING_PLANNING_URGENT_DAYS','PENDING_PLANNING_CRITICAL_DAYS','WEEKLY_MANAGER_SEND_DAY','WEEKLY_MANAGER_SEND_HOUR','WEEKLY_AUDITOR_SEND_DAY','WEEKLY_AUDITOR_SEND_HOUR','COMMENT_ALLOWED_AUDIT_APPROVED','COMMENT_ALLOWED_AUDIT_ACCEPTED','COMMENT_ALLOWED_AUDIT_COMPLETED','COMMENT_ALLOWED_AUDIT_CANCELLED_BY_AUDITOR']);
 const activeCol=head.indexOf('ACTIVE'),unitCol=head.indexOf('UNIT'),descriptionCol=head.indexOf('DESCRIPTION'),groupCol=head.indexOf('RULEGROUP');
 result.editableRules=rules.slice(1).filter(row=>keyCol>=0&&editableRuleKeys.has(String(row[keyCol]||'').trim().toUpperCase())).map(row=>({key:String(row[keyCol]||'').trim().toUpperCase(),value:String(row[valueCol]??'').trim(),active:String(row[activeCol]||'').trim().toUpperCase()==='YES',unit:String(row[unitCol]||'').trim(),description:String(row[descriptionCol]||'').trim(),group:String(row[groupCol]||'').trim()}));
 result.configurationDiagnostics={duplicates:duplicateDiagnostics,destructiveCleanupAllowed:false};
 const mode=String(systemMap[runtime.isDev?'DEV_NOTIFICATION_MODE':'PROD_NOTIFICATION_MODE']||'').toUpperCase();const send=String(systemMap.SEND_NOTIFICATIONS||'').toUpperCase();const validMode=['OFF','DRY_RUN','TEST_TO_SELF'].includes(mode);const validSend=['TRUE','FALSE','YES','NO','1','0'].includes(send);const isDev=runtime.isDev;result.deliveryPolicy={environment:runtime.mode,mode:validMode?mode:'UNKNOWN',sendNotifications:validSend?send:'UNKNOWN',testRecipientConfigured:Boolean(systemMap.DEV_TEST_EMAIL),senderName:systemMap.DEFAULT_FROM_NAME||'',replyToConfigured:Boolean(systemMap.DEFAULT_REPLY_TO),configurationVerified:envCol>=0&&validMode&&validSend,overlapKeys:['DEV_NOTIFICATION_MODE','NOTIFICATION_TEST_MODE','TEST_MODE','DEV_TEST_EMAIL','TEST_RECIPIENT'].filter(k=>Object.hasOwn(systemMap,k)||Object.hasOwn(settingMap,k))};
 res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(JSON.stringify({success:true,...result}));
}

async function notificationGasCall(actor,operation,payload){
 const endpoint=process.env.AMS_GAS_WRITE_URL||process.env.GAS_DEV_WRITE_URL,secret=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY;
 if(!endpoint||!secret)throw Error('NOTIFICATION_GAS_BRIDGE_UNAVAILABLE');
 const u=new URL(endpoint);if(u.protocol!=='https:')throw Error('NOTIFICATION_GAS_HTTPS_REQUIRED');
 u.searchParams.set('action','externalnotification20');
 let result,stage='post';
 try{
  const first=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bridgeKey:secret,actorRole:'manager',actorEmail:actor.email,operation,...payload}),redirect:'manual',signal:AbortSignal.timeout(60000)});
  result=first;
  // Apps Script ContentService redirects its JSON response to googleusercontent.
  // Follow the response with GET; never replay the write POST or forward the bridge secret.
  if([301,302,303,307,308].includes(first.status)){
   const location=first.headers.get('location');
   if(!location)throw Error('NOTIFICATION_GAS_REDIRECT_MISSING');
   const target=new URL(location,u);
   if(target.protocol!=='https:'||!target.hostname.endsWith('.googleusercontent.com'))throw Error('NOTIFICATION_GAS_REDIRECT_REJECTED');
   stage='redirect_get';
   result=await fetch(target,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(60000)});
  }
 }catch(err){
  const cause=err?.message?.startsWith('NOTIFICATION_GAS_')?err.message:(err?.cause?.code||err?.name||'NETWORK_ERROR');
  console.error('[NOTIFICATION_GAS_BRIDGE]',JSON.stringify({operation,stage,cause:String(cause).slice(0,80)}));
  throw Error(String(cause).startsWith('NOTIFICATION_GAS_')?cause:'NOTIFICATION_GAS_TRANSPORT_'+String(cause).replace(/[^A-Z0-9_]/gi,'_'));
 }
 if(!result.ok){
  console.error('[NOTIFICATION_GAS_BRIDGE]',JSON.stringify({operation,stage,status:result.status,host:new URL(result.url).hostname}));
  throw Error('NOTIFICATION_GAS_HTTP_'+result.status+'_'+stage.toUpperCase());
 }
 const raw=await result.text();
 let data;
 try{data=JSON.parse(raw);}catch{
  const type=String(result.headers.get('content-type')||'').toLowerCase();
  const start=raw.slice(0,300).toLowerCase();
  const kind=start.includes('accounts.google.com')||start.includes('signin')||start.includes('sign in')?'AUTH_HTML':start.includes('<!doctype html')||start.includes('<html')?'HTML':raw.trim()===''?'EMPTY':'NON_JSON';
  console.error('[NOTIFICATION_GAS_BRIDGE]',JSON.stringify({operation,phase:'decode',status:result.status,contentType:type.slice(0,90),bytes:raw.length,kind,host:new URL(result.url).hostname}));
  throw Error('NOTIFICATION_GAS_INVALID_RESPONSE_'+kind);
 }
 if(data?.error==='UNHANDLED_POST')return {ok:false,error:'GAS_DEV_DEPLOYMENT_OUTDATED'};
 return data;
}
async function notificationPreviewOrSend(req,res,operation){
 const actor=await session(req);if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401);res.end();return;}
 const origin=String(req.headers.origin||''),host=String(req.headers.host||'');
 if(!origin||new URL(origin).host!==host||!origin.startsWith('https://')){res.writeHead(403);res.end();return;}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024){res.writeHead(413);res.end();return;}}
 let body;try{body=JSON.parse(raw);}catch{res.writeHead(400);res.end();return;}
 const eventKey=String(body.eventKey||'').trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_]{1,100}$/.test(eventKey)){res.writeHead(400);res.end();return;}
 let data;
 try{data=await notificationGasCall(actor,operation,{eventKey});}
 catch(err){
  if(operation==='sendTest'&&/^NOTIFICATION_GAS_(HTTP_404_REDIRECT_GET|INVALID_RESPONSE_|TRANSPORT_)/.test(String(err.message||''))){
   res.writeHead(202,{'content-type':'application/json','cache-control':'no-store'});
   res.end(JSON.stringify({ok:true,deliveryStatus:'UNCONFIRMED',message:'The test request reached GAS but its response could not be verified. Email may have been sent. Check the receiving inbox before trying again.'}));
   return;
  }
  throw err;
 }
 res.writeHead(data.ok?200:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));
}
async function notificationDevModeMutation(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401);res.end();return;}
 const origin=String(req.headers.origin||''),host=String(req.headers.host||'');
 if(!origin||new URL(origin).host!==host||!origin.startsWith('https://')){res.writeHead(403);res.end('ORIGIN_REJECTED');return;}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024){res.writeHead(413);res.end();return;}}
 let body;try{body=JSON.parse(raw);}catch{res.writeHead(400);res.end('INVALID_JSON');return;}
 const mode=String(body.mode||''),expected=String(body.expected||'');
 if(!['OFF','DRY_RUN','TEST_TO_SELF'].includes(mode)||!['OFF','DRY_RUN','TEST_TO_SELF'].includes(expected)){res.writeHead(400);res.end('INVALID_DEV_MODE');return;}
 const data=await notificationGasCall(actor,'updateDevMode',{mode,expected});
 res.writeHead(data.ok?200:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));
}
async function notificationRuleMutation(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401);res.end();return;}
 const origin=String(req.headers.origin||''),host=String(req.headers.host||'');
 let validOrigin=false;try{const u=new URL(origin);validOrigin=u.protocol==='https:'&&u.host===host;}catch{}
 if(!validOrigin){res.writeHead(403);res.end('ORIGIN_REJECTED');return;}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048){res.writeHead(413);res.end();return;}}
 let body;try{body=JSON.parse(raw);}catch{res.writeHead(400);res.end('INVALID_JSON');return;}
 const key=String(body.ruleKey||'').trim().toUpperCase(),value=body.value,expected=body.expected;
 const editable=new Set(['COMING_UP_DAYS','PENDING_PLANNING_UPCOMING_DAYS','PENDING_PLANNING_URGENT_DAYS','PENDING_PLANNING_CRITICAL_DAYS','WEEKLY_MANAGER_SEND_DAY','WEEKLY_MANAGER_SEND_HOUR','WEEKLY_AUDITOR_SEND_DAY','WEEKLY_AUDITOR_SEND_HOUR','COMMENT_ALLOWED_AUDIT_APPROVED','COMMENT_ALLOWED_AUDIT_ACCEPTED','COMMENT_ALLOWED_AUDIT_COMPLETED','COMMENT_ALLOWED_AUDIT_CANCELLED_BY_AUDITOR']);
 if(!editable.has(key)||typeof value!=='string'||typeof expected!=='string'||value.length>30||expected.length>30){res.writeHead(400);res.end('INVALID_RULE_MUTATION');return;}
 const data=await notificationGasCall(actor,'updateRule',{ruleKey:key,value,expected});
 res.writeHead(data.ok?200:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));
}
async function notificationDigestBufferMutation(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401);res.end();return;}
 let validOrigin=false;try{const origin=new URL(String(req.headers.origin||''));validOrigin=origin.protocol==='https:'&&origin.host===String(req.headers.host||'');}catch{}
 if(!validOrigin){res.writeHead(403);res.end('ORIGIN_REJECTED');return;}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048){res.writeHead(413);res.end();return;}}
 let body;try{body=JSON.parse(raw);}catch{res.writeHead(400);res.end('INVALID_JSON');return;}
 const key=String(body.eventKey||'').trim().toUpperCase(),minutes=body.minutes,expected=body.expected;
 const valid=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=1440;
 if(!/^[A-Z][A-Z0-9_]{1,100}$/.test(key)||!valid(minutes)||!valid(expected)){res.writeHead(400);res.end('INVALID_BUFFER_MUTATION');return;}
 const data=await notificationGasCall(actor,'updateDigestBuffer',{eventKey:key,minutes,expected});
 res.writeHead(data.ok?200:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));
}
async function notificationEventMutation(req,res){
 const actor=await session(req);
 if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401);res.end();return;}
 const origin=String(req.headers.origin||'');
 const host=String(req.headers.host||'');
 if(!origin||new URL(origin).host!==host||!origin.startsWith('https://')){res.writeHead(403);res.end('ORIGIN_REJECTED');return;}
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.writeHead(400);res.end('INVALID_JSON');return;}
 const key=String(body.eventKey||'').trim().toUpperCase(),field=String(body.field||'');
 if(!/^[A-Z][A-Z0-9_]{1,100}$/.test(key)||!['ACTIVE','SEND_EMAIL'].includes(field)||typeof body.value!=='boolean'||typeof body.expected!=='boolean'){res.writeHead(400);res.end('INVALID_MUTATION');return;}
 const range="'Notification_Config'!A1:AZ500";
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/';
 const headers={authorization:'Bearer '+await getToken()};
 const read=await fetch(base+encodeURIComponent(range),{headers});
 if(!read.ok)throw Error('NOTIFICATION_CONFIG_READ_FAILED');
 const rows=(await read.json()).values||[];
 const h=(rows[0]||[]).map(x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,''));
 const keyCol=h.indexOf('EVENTKEY'),col=h.indexOf(field.replace(/[^A-Z0-9]/g,''));
 if(keyCol<0||col<0)throw Error('NOTIFICATION_SCHEMA_MISMATCH');
 const matches=rows.slice(1).map((r,i)=>({r,i})).filter(x=>String(x.r[keyCol]||'').trim().toUpperCase()===key);
 if(matches.length!==1){res.writeHead(409);res.end('EVENT_NOT_UNIQUE');return;}
 const current=['YES','TRUE','1','ON'].includes(String(matches[0].r[col]||'').toUpperCase());
 if(current!==body.expected){res.writeHead(409);res.end('RELOAD_REQUIRED');return;}
 const data=await notificationGasCall(actor,'updateEvent',{eventKey:key,changes:{[field]:body.value},expected:{[field]:body.expected}});
 res.writeHead(data.ok?200:409,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));
}
async function proxy(req,res){
 const url='http://127.0.0.1:'+innerPort+(req.url||'/');
 const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
 const init={method:req.method,headers,redirect:'manual'};
 if(!['GET','HEAD'].includes(req.method)){const chunks=[];for await(const c of req)chunks.push(c);init.body=Buffer.concat(chunks);}
 const r=await fetch(url,init);const h={};r.headers.forEach((v,k)=>{if(k!=='set-cookie'&&!['content-length','connection','transfer-encoding'].includes(k))h[k]=v;});const multiCookies=r.headers.getSetCookie();if(multiCookies.length)h['set-cookie']=multiCookies;
 const responseBody=Buffer.from(await r.arrayBuffer());
 const mutationPath=new URL(req.url||'/','http://localhost').pathname;
 const planningWriter=/^\/api\/v1\/(?:manager\/(?:approve-direct|accept-direct|reject-direct|cancel-direct|complete-direct|action|auditor-management\/audit\/transfer)|internal\/auditor\/complete-direct|planning\/direct-commit|auditor\/action)$/;
 if(req.method==='POST'&&r.ok&&planningWriter.test(mutationPath)){
  try{const outcome=JSON.parse(responseBody.toString('utf8'));if(outcome?.success!==false&&outcome?.ok!==false)planningCache.invalidate();}catch{}
 }
 res.writeHead(r.status,h);res.end(responseBody);
}
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&u.pathname==='/api/v1/manager/runtime-readiness'){
   const identity=await session(req);
   if(!identity||identity.role!=='manager'){res.writeHead(identity?403:401,{'cache-control':'no-store'});res.end('Manager session required');return;}
   res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
   res.end(JSON.stringify({ok:true,entrypoint:'R15',environment:runtime.mode,revision:process.env.K_REVISION||'UNAVAILABLE',buildSha:process.env.AMS_BUILD_SHA||'UNAVAILABLE',ssotConfigured:Boolean(spreadsheet),gasWriterConfigured:Boolean(process.env.AMS_GAS_WRITE_URL||process.env.GAS_DEV_WRITE_URL),availabilityBackend:'FIRESTORE',productionReleaseEnabled:!runtime.isDev}));
   return;
  }
  if(req.method==='GET'&&['/rotation','/rotation-manager-20'].includes(u.pathname)){
   const actor=await session(req);
   if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401,{'cache-control':'no-store'});res.end('Manager session required');return;}
   const {readFile}=await import('node:fs/promises');
   const html=await readFile(new URL('./rotation-manager-20.html',import.meta.url));
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(html);return;
  }
  if(req.method==='GET'&&['/rotation.js','/rotation-manager-20.js'].includes(u.pathname)){
   const actor=await session(req);
   if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401,{'cache-control':'no-store'});res.end('Manager session required');return;}
   const {readFile}=await import('node:fs/promises');
   const script=await readFile(new URL('./rotation-manager-20.js',import.meta.url));
   res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
   res.end(script);return;
  }
  if(req.method==='GET'&&['/api/v1/rotation','/api/v1/rotation-manager-20'].includes(u.pathname)){
   const actor=await session(req);
   if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401,{'cache-control':'no-store'});res.end('Manager session required');return;}
   const data=[];
   for(const range of ["'Config_Scopes'!A1:AZ100","'Auditors'!A1:AZ500","'Log realized audits'!A1:AZ10000"]){
    const endpoint='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(range);
    const response=await fetch(endpoint,{headers:{authorization:'Bearer '+await getToken()}});
    if(!response.ok)throw Error('ROTATION_SOURCE_READ_'+response.status);
    data.push((await response.json()).values||[]);
   }
   const includeTestData=runtime.isDev&&u.searchParams.get('includeTestData')==='1';
   const result=buildRotationManager20(...data,{includeTestData});
   result.testDataAvailable=runtime.isDev;
   result.includeTestData=includeTestData;
   result.role='manager';
   res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
   res.end(JSON.stringify(result));return;
  }
  if(['GET','POST'].includes(req.method)&&u.pathname==='/api/v1/availability/migrate-legacy-hard'){if(!runtime.isDev){res.writeHead(404,{'cache-control':'no-store'});res.end('Not found');return;}await legacyHardMigration(req,res);return;}
  if(req.method==='GET'&&u.pathname==='/api/v1/availability/legacy-diagnostic'){await legacyAvailabilityDiagnostic(req,res);return;}
  if(req.method==='GET'&&(u.pathname==='/my-availability'||u.pathname==='/my-availability-20')){
   const identity=await session(req);
   if(identity?.role==='manager'){res.writeHead(302,{'location':'/availability-manager-20','cache-control':'no-store'});res.end();return;}if(!identity||identity.role!=='auditor'){res.writeHead(identity?403:401,{'cache-control':'no-store'});res.end('Not authorized');return;}
   const {readFile}=await import('node:fs/promises');
   const html=await readFile(new URL('./availability-my-calendar-20.html',import.meta.url));
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(html);return;
  }
  if(req.method==='GET'&&u.pathname==='/availability-manager-20'){
   const identity=await session(req);
   if(!identity||identity.role!=='manager'){res.writeHead(identity?403:401);res.end('Not authorized');return;}
   const {readFile}=await import('node:fs/promises');
   const html=await readFile(new URL('./availability-manager-calendar-20.html',import.meta.url));
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(html);return;
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/notifications-manager-20/preview'){await notificationPreviewOrSend(req,res,'preview');return;}
  if(req.method==='POST'&&u.pathname==='/api/v1/notifications-manager-20/send-test'){await notificationPreviewOrSend(req,res,'sendTest');return;}
  if(req.method==='POST'&&u.pathname==='/api/v1/notifications-manager-20/dev-mode'){if(!runtime.isDev){res.writeHead(404,{'cache-control':'no-store'});res.end('Not found');return;}await notificationDevModeMutation(req,res);return;}
  if(req.method==='POST'&&u.pathname==='/api/v1/notifications-manager-20/rules'){await notificationRuleMutation(req,res);return;}
  if(req.method==='POST'&&u.pathname==='/api/v1/notifications-manager-20/digest-buffer'){await notificationDigestBufferMutation(req,res);return;}
  if(req.method==='POST'&&u.pathname==='/api/v1/notifications-manager-20/events'){await notificationEventMutation(req,res);return;}
  if(req.method==='GET'&&u.pathname==='/api/v1/notifications-manager-20/overview'){await notificationsManagerOverview(req,res);return;}
  if(req.method==='GET'&&u.pathname==='/notifications-manager-20'){
   const actor=await session(req);
   if(!actor||actor.role!=='manager'){res.writeHead(actor?403:401,{'cache-control':'no-store'});res.end('Manager session required');return;}
   const {readFile}=await import('node:fs/promises');
   const html=await readFile(new URL('./notification-manager-20.html',import.meta.url));
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(html);return;
  }
  if(await availability(req,res))return;
  await proxy(req,res);
 }catch(e){const path=String(req.url||'/').split('?')[0];const subsystem=path.includes('notification')?'NOTIFICATIONS':path.includes('rotation')?'ROTATION':path.includes('availability')?'AVAILABILITY':'PORTAL';const code=subsystem+'_INTEGRATION_FAILED';console.error('[AMS_ROUTE_ERROR]',JSON.stringify({subsystem,path,errorCode:String(e?.message||'UNKNOWN').slice(0,160)}));if(!res.headersSent){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify({success:false,error:code,diagnostic:subsystem==='NOTIFICATIONS'?String(e?.message||'UNKNOWN').slice(0,100):undefined}));}else res.destroy();}
}).listen(port,'0.0.0.0');