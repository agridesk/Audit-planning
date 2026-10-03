import http from 'node:http';
import {URL} from 'node:url';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const BUILD='2026-10-03_AMS_R11_TRANSPARENT_FORMAL_HOURS';

process.env.PORT=String(INNER_PORT);
await import('./server-r10.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ams-build':BUILD});res.end(JSON.stringify(body));}

async function proxy(req,res,raw){
  const target='http://127.0.0.1:'+INNER_PORT+(req.url||'/'),headers={};
  for(const [k,v] of Object.entries(req.headers)){if(v!=null&&!['host','content-length','connection'].includes(k.toLowerCase()))headers[k]=v;}
  const init={method:req.method,headers,redirect:'manual'};
  if(req.method!=='GET'&&req.method!=='HEAD')init.body=raw||'';
  const r=await fetch(target,init),buf=Buffer.from(await r.arrayBuffer()),outHeaders={};
  r.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','connection'].includes(k.toLowerCase()))outHeaders[k]=v;});
  outHeaders['x-ams-build']=BUILD;
  res.writeHead(r.status,outHeaders);res.end(buf);
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&u.pathname==='/api/v1/build')return sendJson(res,200,{ok:true,build:BUILD,outer:'server-r11',inner:'server-r10',hoursSemantics:'formalHours only',transparent:true});
  let raw='';
  try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{ok:false,error:clean(e?.message||e),build:BUILD});}
  try{return await proxy(req,res,raw);}catch(e){return sendJson(res,502,{ok:false,error:'R11_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}
}).listen(PUBLIC_PORT,'0.0.0.0');
