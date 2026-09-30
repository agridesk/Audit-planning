import http from 'node:http';
import {URL} from 'node:url';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const BUILD='2026-09-30_AMS_COMBINED_VISIT_UI_HOURS_R2';

process.env.PORT=String(INNER_PORT);
await import('./server-r6.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}

function patchPlanningHtml(html){
  const from="hours=plannedHours(),required=Number(model?.data?.audit?.requiredHours||0),remaining=required-hours";
  const to="hours=plannedHours(),required=requiredVisitHours(),remaining=required-hours";
  if(!html.includes(from))throw new Error('PLANNING_COMBINED_HOURS_PATCH_MARKER_MISSING');
  return html.replace(from,to);
}

async function proxy(req,res,raw){
  const target='http://127.0.0.1:'+INNER_PORT+(req.url||'/'),headers={};
  for(const [k,v] of Object.entries(req.headers)){if(v!=null&&!['host','content-length','connection'].includes(k.toLowerCase()))headers[k]=v;}
  const init={method:req.method,headers,redirect:'manual'};
  if(req.method!=='GET'&&req.method!=='HEAD')init.body=raw||'';
  const r=await fetch(target,init),buf=Buffer.from(await r.arrayBuffer()),outHeaders={};
  r.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','connection'].includes(k.toLowerCase()))outHeaders[k]=v;});
  let body=buf;
  if(r.ok&&clean(r.headers.get('content-type')).includes('text/html')&&(req.url||'').startsWith('/planning')){
    body=Buffer.from(patchPlanningHtml(buf.toString('utf8')),'utf8');
    outHeaders['content-length']=String(body.length);
  }
  res.writeHead(r.status,outHeaders);res.end(body);
}

http.createServer(async(req,res)=>{
  let raw='';
  try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{ok:false,error:clean(e?.message||e),build:BUILD});}
  try{return await proxy(req,res,raw);}catch(e){return sendJson(res,502,{ok:false,error:'R7_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}
}).listen(PUBLIC_PORT,'0.0.0.0');
