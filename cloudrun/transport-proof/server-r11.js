import http from 'node:http';
import {URL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const BUILD='2026-10-01_AMS_SCHEDULING_HOURS_DELTA_R2_HARDENED';

function patchFile(path,replacements){
  let s=readFileSync(new URL(path,import.meta.url),'utf8');
  for(const [from,to,label] of replacements){
    if(!s.includes(from))throw new Error('DELTA_PATCH_MARKER_MISSING_'+label);
    s=s.replace(from,to);
  }
  writeFileSync(new URL(path,import.meta.url),s,'utf8');
}

const strictDeltaExpr="(()=>{const raw=String(val(r,csd)||'').trim().replace(',','.');if(raw==='')return 0;const n=Number(raw);if(!Number.isFinite(n))throw new Error('SCHEDULING_HOURS_DELTA_INVALID_'+val(r,cc));return n;})()";
patchFile('./server-r4.js',[
  ["csh=col(h,['Scheduling_hours','Scheduling hours','Scheduling Hours','Planning duration','Planning_duration'])","csd=col(h,['Scheduling_hours_delta','Scheduling hours delta','Scheduling Hours Delta'])",'R4_HEADER'],
  ["schedulingHours:Number(String(val(r,csh)||'').replace(',','.'))||0","schedulingHoursDelta:"+strictDeltaExpr,'R4_CATALOG'],
  ["scheduling=Number(def.schedulingHours||0)||formal;out.push({obligationId:val(lr,lo),scopeCode:code,formalHours:formal,schedulingHours:scheduling,schedulingSource:def.schedulingHours>0?'CONFIG_SCOPES_SCHEDULING_HOURS':'FORMAL_HOURS_FALLBACK'});","delta=Number(def.schedulingHoursDelta||0),scheduling=formal+delta;if(!Number.isFinite(scheduling)||scheduling<0)throw new Error('SCHEDULING_HOURS_TARGET_INVALID_'+code);out.push({obligationId:val(lr,lo),scopeCode:code,formalHours:formal,schedulingHours:scheduling,schedulingDelta:delta,schedulingSource:'FORMAL_HOURS_PLUS_CONFIG_DELTA'});",'R4_OBLIGATION']
]);

patchFile('./server-r6.js',[
  ["csh=col(h,['Scheduling_hours','Scheduling hours','Scheduling Hours','Planning duration','Planning_duration'])","csd=col(h,['Scheduling_hours_delta','Scheduling hours delta','Scheduling Hours Delta'])",'R6_HEADER'],
  ["schedulingHours:Number(String(val(r,csh)||'').replace(',','.'))||0","schedulingHoursDelta:"+strictDeltaExpr,'R6_CATALOG'],
  ["const cfg=cfgByCode.get(x.scopeCode)||{},sched=Number(cfg.schedulingHours||0)||x.formalHours;formalRequired+=x.formalHours;schedulingRequired+=sched;","const cfg=cfgByCode.get(x.scopeCode)||{},delta=Number(cfg.schedulingHoursDelta||0),sched=x.formalHours+delta;if(!Number.isFinite(sched)||sched<0)throw new Error('SCHEDULING_HOURS_TARGET_INVALID_'+x.scopeCode);formalRequired+=x.formalHours;schedulingRequired+=sched;",'R6_REQUIRED']
]);

process.env.PORT=String(INNER_PORT);
await import('./server-r10.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};(h||[]).forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean((r||[])[i]):'';}
function parseJson(v){try{return typeof v==='string'?JSON.parse(v):v}catch{return null}}
function parseDelta(raw,scopeCode){const s=clean(raw).replace(',','.');if(s==='')return 0;const n=Number(s);if(!Number.isFinite(n))throw new Error('SCHEDULING_HOURS_DELTA_INVALID_'+clean(scopeCode));return n;}
function schedulingTarget(formal,delta,scopeCode){const f=Number(formal),d=Number(delta);if(!Number.isFinite(f)||!Number.isFinite(d))throw new Error('SCHEDULING_HOURS_TARGET_INVALID_'+clean(scopeCode));const target=f+d;if(target<0)throw new Error('SCHEDULING_HOURS_TARGET_NEGATIVE_'+clean(scopeCode));return Math.round(target*100)/100;}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ams-build':BUILD});res.end(JSON.stringify(body));}
async function accessToken(){const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');return j.access_token;}
async function batchGet(ranges){if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchGet');for(const range of ranges)u.searchParams.append('ranges',range);u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),j=await r.json();if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));return j.valueRanges||[];}

async function enrichSchedulingTargets(obj){
  const rows=obj?.rows;if(!Array.isArray(rows)||!rows.length)return obj;
  const vr=await batchGet(['Audit planning!A1:AX483','Config_Scopes!A1:Z128']);
  const ap=vr[0]?.values||[],sc=vr[1]?.values||[];
  if(ap.length<2||sc.length<2)return obj;
  const ah=ap[0],ai=col(ah,['Audit ID','Audit_ID','AuditId','Audit Id']),apj=col(ah,['Planning JSON','Planning_JSON']);
  const byAudit=new Map();for(const row of ap.slice(1)){const id=val(row,ai);if(id)byAudit.set(id,row);}
  const sh=sc[0],scode=col(sh,['ScopeCode','Scope code','Code']),sname=col(sh,['DisplayName','Display name','Name']),sdelta=col(sh,['Scheduling_hours_delta','Scheduling hours delta','Scheduling Hours Delta']);
  if(scode<0||sdelta<0)throw new Error('SCHEDULING_HOURS_DELTA_SCHEMA_MISSING');
  const byCode=new Map(),byName=new Map();for(const row of sc.slice(1)){const code=val(row,scode),name=val(row,sname);if(!code)continue;const cfg={code,name,delta:parseDelta(val(row,sdelta),code)};byCode.set(code,cfg);if(name)byName.set(name.toLowerCase(),cfg);}
  let enriched=0;
  for(const r of rows){
    if(!r||r.statusKey==='PENDING_PLANNING')continue;
    const source=byAudit.get(clean(r.auditId)),j=source?parseJson(val(source,apj)):null;
    let codes=Array.isArray(j?.scopeCodes)?j.scopeCodes.map(clean).filter(Boolean):[];
    if(!codes.length){const names=clean(r.scopesText).split(/\s*\+\s*|\s*,\s*/).filter(Boolean);codes=names.map(n=>byName.get(n.toLowerCase())?.code||'').filter(Boolean);}
    codes=[...new Set(codes)];
    const formal=Number(r.hoursPlanned),actual=Number(r.scheduledHours);
    if(!Number.isFinite(formal)||!codes.length)continue;
    const delta=codes.reduce((sum,c)=>{if(!byCode.has(c))throw new Error('SCHEDULING_HOURS_DELTA_SCOPE_MISSING_'+c);return sum+byCode.get(c).delta;},0),target=schedulingTarget(formal,delta,codes.join('+'));
    r.scheduledHoursTarget=target;
    r.schedulingHoursDelta=Math.round(delta*100)/100;
    if(Number.isFinite(actual))r.scheduledTargetVariance=Math.round((actual-target)*100)/100;
    enriched++;
  }
  obj.schedulingDeltaSemantics={build:BUILD,enriched,base:'company-specific formal hours',configField:'Scheduling_hours_delta',invalidDeltaPolicy:'FAIL_CLOSED'};
  return obj;
}

async function proxy(req,res,raw){
  const target='http://127.0.0.1:'+INNER_PORT+(req.url||'/'),headers={};for(const [k,v] of Object.entries(req.headers)){if(v!=null&&!['host','content-length','connection'].includes(k.toLowerCase()))headers[k]=v;}const init={method:req.method,headers,redirect:'manual'};if(req.method!=='GET'&&req.method!=='HEAD')init.body=raw||'';
  const r=await fetch(target,init),buf=Buffer.from(await r.arrayBuffer()),outHeaders={};r.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','connection'].includes(k.toLowerCase()))outHeaders[k]=v;});outHeaders['x-ams-build']=BUILD;let body=buf;const u=new URL(req.url||'/','http://localhost'),ct=clean(r.headers.get('content-type'));
  if(r.ok&&req.method==='GET'&&u.pathname==='/api/v1/manager/open'&&ct.includes('application/json')){let j;try{j=JSON.parse(buf.toString('utf8'));}catch{j=null;}if(j){j=await enrichSchedulingTargets(j);body=Buffer.from(JSON.stringify(j),'utf8');outHeaders['content-length']=String(body.length);}}
  res.writeHead(r.status,outHeaders);res.end(body);
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&u.pathname==='/api/v1/build')return sendJson(res,200,{ok:true,build:BUILD,inner:'server-r10.js',schedulingHoursSemantics:'company formal hours + Config_Scopes.Scheduling_hours_delta',invalidDeltaPolicy:'FAIL_CLOSED'});
  let raw='';try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{ok:false,error:clean(e?.message||e),build:BUILD});}
  try{return await proxy(req,res,raw);}catch(e){return sendJson(res,502,{ok:false,error:'R11_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}
}).listen(PUBLIC_PORT,'0.0.0.0');
