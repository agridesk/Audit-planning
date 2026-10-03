import http from 'node:http';
import {URL} from 'node:url';
import {createHmac} from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const BUILD='2026-10-03_GRID2_R12_MAX_OFFSITE_POLICY';
const MANAGER_ORIGIN='https://ams-transport-proof-510075419067.europe-west1.run.app';
let tokenCache={token:'',expiresAt:0};

process.env.PORT=String(INNER_PORT);
await import('./server-r11.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};(h||[]).forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean((r||[])[i]):'';}
function dateOnly(v){const s=clean(v),m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}
function statusKey(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function allowedActions(k){return k==='PENDING_PLANNING'?['PLAN','REJECT']:k==='PENDING_APPROVAL'?['APPROVE','CANCEL','REJECT']:k==='APPROVED'||k==='ACCEPTED'?['CANCEL','REJECT']:[];}
function b64url(buf){return Buffer.from(buf).toString('base64url');}
function relayPayload(email,role,exp,origin){return['v1','MANAGER_ACTION_RELAY',clean(email).toLowerCase(),clean(role),String(exp),clean(origin)].join('\n');}
function relaySignature(email,role,exp,origin){return b64url(createHmac('sha256',WRITE_KEY).update(relayPayload(email,role,exp,origin)).digest());}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ams-build':BUILD});res.end(JSON.stringify(body));}
async function accessToken(){const now=Date.now();if(tokenCache.token&&now<tokenCache.expiresAt-60000)return tokenCache.token;const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');tokenCache={token:j.access_token,expiresAt:now+(Number(j.expires_in)||300)*1000};return tokenCache.token;}
async function values(range){if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent(range));u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),j=await r.json();if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));return j.values||[];}
async function batchValues(ranges){if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchGet');for(const range of ranges)u.searchParams.append('ranges',range);u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),j=await r.json();if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));return (j.valueRanges||[]).map(x=>x.values||[]);}
async function innerSession(req){const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/api/v1/session',{headers:{cookie:clean(req.headers.cookie)},redirect:'manual'});let j={};try{j=await r.json();}catch{}return r.ok&&j?.ok===true?j.identity:null;}
function commentsFrom(h,row){const mc=val(row,col(h,['Manager comment (last)'])),md=val(row,col(h,['Last manager decision'])),mt=val(row,col(h,['Last decision timestamp'])),ac=val(row,col(h,['Auditor comment (last)'])),ad=val(row,col(h,['Last auditor decision'])),at=val(row,col(h,['Last auditor decision timestamp'])),ss=val(row,col(h,['Status since']));let latestComment='',latestActor='',latestAction='',latestTimestamp='';if(mc||mt){latestComment=mc;latestActor='Manager';latestAction=md;latestTimestamp=mt;}if((ac||at)&&(!latestTimestamp||at>latestTimestamp)){latestComment=ac;latestActor='Auditor';latestAction=ad;latestTimestamp=at;}return{managerComment:mc,managerDecision:md,managerDecisionTimestamp:mt,auditorComment:ac,auditorDecision:ad,auditorDecisionTimestamp:at,statusSince:ss,latestComment,latestCommentActor:latestActor,latestCommentAction:latestAction,latestCommentTimestamp:latestTimestamp};}
async function enrichOpen(obj){if(!Array.isArray(obj?.rows)||!obj.rows.length)return obj;const ap=await values('Audit planning!A1:AX483');if(ap.length<2)return obj;const h=ap[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),byId=new Map();for(let i=1;i<ap.length;i++){const id=val(ap[i],ci);if(id)byId.set(id,{row:ap[i],sourceRow:i+1});}let enriched=0;for(const r of obj.rows){const x=byId.get(clean(r.auditId));if(!x)continue;Object.assign(r,commentsFrom(h,x.row),{sourceRow:x.sourceRow});if(statusKey(r.status)==='PENDING_PLANNING'){r.hoursPlanned='';r.plannedHours='';}enriched++;}obj.actionCommunication={build:BUILD,enriched,canonicalFields:['Manager comment (last)','Auditor comment (last)']};return obj;}
function maxOffsiteHoursForAuditRow(header,row,scopeValues){
  if(!scopeValues?.length)return 0;
  const sh=scopeValues[0],slot=col(sh,['SlotKey','Slot key','Slot']),code=col(sh,['ScopeCode','Scope code','Code']),name=col(sh,['DisplayName','Display name','Name','ScopeName','Scope']),active=col(sh,['Active']),archived=col(sh,['Archived']),moh=col(sh,['Max_Offsite_Hours','Max Offsite Hours','Max offsite hours','Maximum offsite hours']);
  const truthy=v=>['x','yes','true','1','active'].includes(clean(v).toLowerCase());
  let total=0;
  for(const sr of scopeValues.slice(1)){
    if(active>=0&&!truthy(sr[active]))continue;
    if(archived>=0&&truthy(sr[archived]))continue;
    let applies=false;
    for(const alias of [val(sr,slot),val(sr,code),val(sr,name)]){
      if(!alias)continue;
      const ix=col(header,[alias]);
      if(ix>=0&&truthy(row[ix])){applies=true;break;}
    }
    if(!applies)continue;
    total+=Math.max(0,Number(String(val(sr,moh)||'0').replace(',','.'))||0);
  }
  return Math.round(total*100)/100;
}
async function readAuditPatch(auditId,sourceRow){
  const t=Date.now();let row=[],rowNo=Number(sourceRow)||0,header=[],scopeValues=[];
  if(rowNo>1){const vr=await batchValues(['Audit planning!A1:AX1','Audit planning!A'+rowNo+':AX'+rowNo,'Config_Scopes!A1:Z128']);header=vr[0]?.[0]||[];row=vr[1]?.[0]||[];scopeValues=vr[2]||[];const ci=col(header,['Audit ID','Audit_ID','AuditId','Audit Id']);if(val(row,ci)!==auditId){row=[];rowNo=0;}}
  if(!header.length)header=(await values('Audit planning!A1:AX1'))[0]||[];
  if(!row.length){const ap=await values('Audit planning!A2:AX483'),ci=col(header,['Audit ID','Audit_ID','AuditId','Audit Id']);for(let i=0;i<ap.length;i++)if(val(ap[i],ci)===auditId){row=ap[i];rowNo=i+2;break;}}
  if(!row.length)return{success:false,error:'AUDIT_NOT_FOUND',auditId,serverMs:Date.now()-t};
  if(!scopeValues.length)scopeValues=await values('Config_Scopes!A1:Z128');
  const g=names=>val(row,col(header,names)),rawStatus=g(['Status']),k=statusKey(rawStatus),required=Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.')),maxOffsiteHours=maxOffsiteHoursForAuditRow(header,row,scopeValues);let hp=g(['Hours planned']),assigned=g(['Assigned to','Assigned auditor','Auditor']),planningJson=g(['Planning JSON','Planning_JSON']);
  // Semantic invariant: Pending Planning has no committed plan.
  if(k==='PENDING_PLANNING'){hp='';planningJson='';assigned='';}
  return{success:true,auditId,sourceRow:rowNo,status:rawStatus,statusKey:k,allowedActions:allowedActions(k),assignedTo:assigned,auditor:assigned,assignedToEmail:assigned,datePlanned:k==='PENDING_PLANNING'?'':dateOnly(g(['Date planned','Date - Planned'])),hoursPlanned:hp,plannedHours:hp,requiredHours:Number.isFinite(required)?required:0,formalHours:Number.isFinite(required)?required:0,maxOffsiteHours,toBePlanned:Number.isFinite(required)?required:0,planningJson,...commentsFrom(header,row),serverMs:Date.now()-t,build:BUILD};
}
function actionRelayUrl(identity){
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('ACTION_RELAY_NOT_CONFIGURED');
  const email=clean(identity?.email).toLowerCase(),role='Manager',exp=Date.now()+10*60*1000,origin=MANAGER_ORIGIN;
  if(!email)throw new Error('ACTION_RELAY_EMAIL_REQUIRED');
  const u=new URL(GAS_WRITE_URL);u.searchParams.set('action','externalmanageractionrelay');u.searchParams.set('email',email);u.searchParams.set('role',role);u.searchParams.set('exp',String(exp));u.searchParams.set('origin',origin);u.searchParams.set('signature',relaySignature(email,role,exp,origin));return u.toString();
}
async function proxy(req,res,raw){const target='http://127.0.0.1:'+INNER_PORT+(req.url||'/'),headers={};for(const [k,v] of Object.entries(req.headers)){if(v!=null&&!['host','content-length','connection'].includes(k.toLowerCase()))headers[k]=v;}const init={method:req.method,headers,redirect:'manual'};if(req.method!=='GET'&&req.method!=='HEAD')init.body=raw||'';const r=await fetch(target,init),buf=Buffer.from(await r.arrayBuffer()),outHeaders={};r.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','connection'].includes(k.toLowerCase()))outHeaders[k]=v;});outHeaders['x-ams-build']=BUILD;let body=buf;const u=new URL(req.url||'/','http://localhost'),ct=clean(r.headers.get('content-type'));if(r.ok&&req.method==='GET'&&u.pathname==='/api/v1/manager/open'&&ct.includes('application/json')){let j;try{j=JSON.parse(buf.toString('utf8'));}catch{j=null;}if(j){j=await enrichOpen(j);body=Buffer.from(JSON.stringify(j),'utf8');outHeaders['content-length']=String(body.length);}}res.writeHead(r.status,outHeaders);res.end(body);}

http.createServer(async(req,res)=>{
  const u=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&u.pathname==='/api/v1/build')return sendJson(res,200,{ok:true,build:BUILD,inner:'server-r11.js',managerActionMicroRefresh:true,canonicalCommentFields:true,managerActionRelay:true,targetedReread:true,pendingPlanningClearsCommittedHours:true});
  if(req.method==='GET'&&u.pathname==='/api/v1/manager/action-relay-url'){
    const identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED'});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN'});
    try{return sendJson(res,200,{success:true,url:actionRelayUrl(identity),build:BUILD});}catch(e){return sendJson(res,500,{success:false,error:'ACTION_RELAY_URL_FAILED',detail:clean(e?.message||e),build:BUILD});}
  }
  if(req.method==='GET'&&u.pathname==='/api/v1/manager/audit'){
    const identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED'});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN'});const auditId=clean(u.searchParams.get('auditId')),sourceRow=clean(u.searchParams.get('sourceRow'));if(!auditId)return sendJson(res,400,{success:false,error:'AUDIT_ID_REQUIRED'});try{const out=await readAuditPatch(auditId,sourceRow);return sendJson(res,out.success?200:404,out);}catch(e){return sendJson(res,500,{success:false,error:'MANAGER_AUDIT_REREAD_FAILED',detail:clean(e?.message||e),build:BUILD});}
  }
  let raw='';try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{ok:false,error:clean(e?.message||e),build:BUILD});}
  try{return await proxy(req,res,raw);}catch(e){return sendJson(res,502,{ok:false,error:'R12_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}
}).listen(PUBLIC_PORT,'0.0.0.0');
