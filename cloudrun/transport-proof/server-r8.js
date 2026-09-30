import http from 'node:http';
import {URL} from 'node:url';
import {createHash} from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const BUILD='2026-10-01_AMS_COMBINED_VISIT_REVISION_ENRICH_R1';

process.env.PORT=String(INNER_PORT);
await import('./server-r7.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};(h||[]).forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean((r||[])[i]):'';}
function shaRevision(h,row){const g=n=>val(row,col(h,n));return createHash('sha256').update([g(['Audit ID','Audit_ID','AuditId','Audit Id']),g(['Status']),g(['Assigned to','Assigned auditor','Auditor']),g(['Planning JSON','Planning_JSON']),g(['Last decision timestamp']),g(['Status since'])].join('|')).digest('hex').slice(0,24);}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ams-build':BUILD});res.end(JSON.stringify(body));}
async function accessToken(){const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');return j.access_token;}
async function auditPlanningRows(){if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/Audit%20planning!A1:AX483');u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),j=await r.json();if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));return j.values||[];}
async function enrichWorkspaceJson(obj){const set=obj?.data?.audit?.companyPlanningSet;if(!Array.isArray(set)||!set.some(x=>x&&!clean(x.sourceRevision)))return obj;const values=await auditPlanningRows();if(values.length<2)return obj;const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),byId=new Map();for(const row of values.slice(1)){const id=val(row,ci);if(id)byId.set(id,row);}for(const item of set){if(!item||clean(item.sourceRevision))continue;const row=byId.get(clean(item.auditId));if(row)item.sourceRevision=shaRevision(h,row);}obj.revisionEnrichment={build:BUILD,enriched:set.filter(x=>clean(x?.sourceRevision)).length,total:set.length};return obj;}
async function proxy(req,res,raw){const target='http://127.0.0.1:'+INNER_PORT+(req.url||'/'),headers={};for(const [k,v] of Object.entries(req.headers)){if(v!=null&&!['host','content-length','connection'].includes(k.toLowerCase()))headers[k]=v;}const init={method:req.method,headers,redirect:'manual'};if(req.method!=='GET'&&req.method!=='HEAD')init.body=raw||'';const r=await fetch(target,init),buf=Buffer.from(await r.arrayBuffer()),outHeaders={};r.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','connection'].includes(k.toLowerCase()))outHeaders[k]=v;});outHeaders['x-ams-build']=BUILD;let body=buf;const u=new URL(req.url||'/','http://localhost');if(r.ok&&req.method==='GET'&&u.pathname==='/api/v1/planning/workspace'&&clean(r.headers.get('content-type')).includes('application/json')){let j;try{j=JSON.parse(buf.toString('utf8'));}catch{j=null;}if(j){j=await enrichWorkspaceJson(j);body=Buffer.from(JSON.stringify(j),'utf8');outHeaders['content-length']=String(body.length);}}res.writeHead(r.status,outHeaders);res.end(body);}

http.createServer(async(req,res)=>{const u=new URL(req.url||'/','http://localhost');if(req.method==='GET'&&u.pathname==='/api/v1/build')return sendJson(res,200,{ok:true,build:BUILD,inner:'server-r7.js',revisionEnrichment:true});let raw='';try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{ok:false,error:clean(e?.message||e),build:BUILD});}try{return await proxy(req,res,raw);}catch(e){return sendJson(res,502,{ok:false,error:'R8_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}}).listen(PUBLIC_PORT,'0.0.0.0');
