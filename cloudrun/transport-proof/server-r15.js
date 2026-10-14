/** AMS DEV Availability 2.0 entrypoint. All existing R12 routes are preserved by proxy.
 * Enable only after Firestore IAM/database preflight and DEV-only deployment approval.
 */
import http from 'node:http';
import {URL} from 'node:url';
import {createAvailabilityHttpRouter} from './availability-http-api-20.js';
import {createAvailabilityService} from './availability-storage-service-20.js';
import {createFirestoreAvailabilityAdapter} from './availability-firestore-adapter-20.js';
import {createPlanningOverlayService} from './availability-planning-overlay-service-20.js';
import {createPlanningReadCache} from './availability-planning-read-cache-20.js';

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
const project=await resolveProject();
const spreadsheet=process.env.DEV_SSOT_SPREADSHEET_ID||'';
if(project!=='audit-management-system-dev')throw Error('AVAILABILITY_DEV_PROJECT_ONLY');
if(!spreadsheet)throw Error('AVAILABILITY_DEV_SHEET_REQUIRED');
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
 const records=rows.slice(1).map(r=>({auditorId:String(r[uid]||'').trim()||(String(r[role]||'').trim().toLowerCase()==='manager'?'manager:'+String(r[email]||'').trim().toLowerCase():''),email:String(r[email]||'').trim().toLowerCase(),displayName:String(r[name]||r[email]||'').trim(),role:String(r[role]||'').trim().toLowerCase(),active:active<0||['yes','true','1','active','x'].includes(String(r[active]||'').trim().toLowerCase())})).filter(x=>x.auditorId&&x.email&&x.active);
 if(new Set(records.map(x=>x.auditorId)).size!==records.length||new Set(records.map(x=>x.email)).size!==records.length)throw Error('AUDITOR_ROSTER_DUPLICATE_IDENTITY');
 return records;
}
async function session(req){
 const r=await fetch('http://127.0.0.1:'+innerPort+'/api/v1/session',{headers:{cookie:String(req.headers.cookie||'')},redirect:'manual'});
 if(!r.ok)return null;
 const j=await r.json().catch(()=>null);
 if(j?.ok!==true||!j.identity?.email)return null;
 const records=await getRoster();const user=records.find(x=>x.email===String(j.identity.email).trim().toLowerCase());
 if(!user)return null;
 const role=String(j.identity.role||'').toLowerCase();
 if(!['auditor','manager'].includes(role))return null;
 // The verified session is authoritative for the active role. The roster
 // resolves the stable auditor UID; its optional Role field is not a login grant.
 if(role==='auditor'&&!user.auditorId)return null;
 return {role,email:user.email,auditorId:user.auditorId};
}
const adapter=createFirestoreAvailabilityAdapter({projectId:project,getToken});
const service=createAvailabilityService(adapter);
async function readPlanningRows(){
 // Existing DEV Audit planning tab; bounded read, never a full-sheet hot-path scan.
 // Fail closed if configured maximum is reached: a truncated source is unsafe.
 const range="'Audit planning'!A1:AX2000";
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheet)+'/values/'+encodeURIComponent(range);
 const response=await fetch(url,{headers:{authorization:'Bearer '+await getToken()}});
 if(!response.ok)throw Error('CANONICAL_PLANNING_READ_'+response.status);
 const rows=(await response.json()).values;
 if(!Array.isArray(rows)||rows.length===0||rows.length>=2000)throw Error('CANONICAL_PLANNING_INCOMPLETE');
 return rows;
}
const planningCache=createPlanningReadCache({load:readPlanningRows,ttlMs:10000});
const overlay=createPlanningOverlayService({
 service,
 readPlanningRows:planningCache.read,
 listCanonicalAuditors:async()=>{
  const roster=await getRoster();
  return roster.filter(x=>x.role==='auditor').map(x=>({auditorId:x.auditorId,email:x.email}));
 }
});
const availability=createAvailabilityHttpRouter({service:overlay,resolveIdentity:session,listAuditors:async actor=>{
 const roster=await getRoster();
 return roster.filter(x=>actor.role==='auditor'?x.auditorId===actor.auditorId:x.role==='auditor').map(x=>({auditorId:x.auditorId,displayName:x.displayName}));
}});
async function proxy(req,res){
 const url='http://127.0.0.1:'+innerPort+(req.url||'/');
 const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
 const init={method:req.method,headers,redirect:'manual'};
 if(!['GET','HEAD'].includes(req.method)){const chunks=[];for await(const c of req)chunks.push(c);init.body=Buffer.concat(chunks);}
 const r=await fetch(url,init);const h={};r.headers.forEach((v,k)=>{if(!['content-length','connection','transfer-encoding'].includes(k))h[k]=v;});
 res.writeHead(r.status,h);res.end(Buffer.from(await r.arrayBuffer()));
}
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&u.pathname==='/my-availability-20'){
   const identity=await session(req);
   if(!identity||identity.role!=='auditor'){res.writeHead(identity?403:401,{'cache-control':'no-store'});res.end('Not authorized');return;}
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
  if(await availability(req,res))return;
  await proxy(req,res);
 }catch(e){if(!res.headersSent){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({success:false,error:'AVAILABILITY_INTEGRATION_FAILED'}));}else res.destroy();}
}).listen(port,'0.0.0.0');