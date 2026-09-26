import http from 'node:http';
import {createHmac} from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const BUILD='2026-09-26_AMS_CLOUD_RUN_MANAGER_PORTAL_R39_SIGNED_PLANNING_HANDOFF';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';

process.env.PORT=String(INNER_PORT);
await import('./server-r4.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
function esc(v){return clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function b64url(buf){return Buffer.from(buf).toString('base64url');}
function handoffPayload(email,role,auditId,exp){return['v1',clean(email).toLowerCase(),clean(role),clean(auditId),String(exp)].join('\n');}
function signHandoff(payload){return b64url(createHmac('sha256',WRITE_KEY).update(payload).digest());}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}
function sendHtml(res,status,body){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(body);}

async function sessionIdentity(req){
  const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/api/v1/session',{method:'GET',headers:{cookie:clean(req.headers.cookie)},redirect:'manual'});
  let body={};
  try{body=await r.json();}catch{}
  if(!r.ok||!body||body.ok!==true||!body.identity)return null;
  return body.identity;
}

async function handlePlanning(req,res,u){
  const identity=await sessionIdentity(req);
  if(!identity)return sendJson(res,401,{ok:false,error:'SESSION_REQUIRED'});
  if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
  const auditId=clean(u.searchParams.get('auditId'));
  if(!auditId)return sendJson(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});
  if(!GAS_WRITE_URL)return sendJson(res,500,{ok:false,error:'GAS_DEV_WRITE_URL_NOT_CONFIGURED'});
  if(WRITE_KEY.length<32)return sendJson(res,500,{ok:false,error:'WRITE_BRIDGE_NOT_CONFIGURED'});

  const email=clean(identity.email).toLowerCase();
  const role='Manager';
  const exp=Date.now()+60000;
  const signature=signHandoff(handoffPayload(email,role,auditId,exp));
  const form=[
    '<!doctype html><html><head><meta charset="utf-8"><title>AMS - Opening Planning Workspace</title></head><body>',
    '<form id="handoff" method="post" action="'+esc(GAS_WRITE_URL)+'">',
    '<input type="hidden" name="action" value="externalplanningworkspace">',
    '<input type="hidden" name="email" value="'+esc(email)+'">',
    '<input type="hidden" name="role" value="Manager">',
    '<input type="hidden" name="auditId" value="'+esc(auditId)+'">',
    '<input type="hidden" name="exp" value="'+esc(String(exp))+'">',
    '<input type="hidden" name="signature" value="'+esc(signature)+'">',
    '</form><script>document.getElementById("handoff").submit();</script>',
    '<noscript><button type="submit" form="handoff">Open Planning Workspace</button></noscript>',
    '</body></html>'
  ].join('');
  return sendHtml(res,200,form);
}

function proxy(req,res){
  const options={hostname:'127.0.0.1',port:INNER_PORT,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:'+INNER_PORT}};
  const p=http.request(options,inner=>{
    const headers={...inner.headers};
    res.writeHead(inner.statusCode||502,headers);
    inner.pipe(res);
  });
  p.on('error',err=>sendJson(res,502,{ok:false,error:'INNER_PROXY_FAILED',detail:clean(err&&err.message||err)}));
  req.pipe(p);
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/planning'&&req.method==='GET'){
    try{return await handlePlanning(req,res,u);}catch(err){return sendJson(res,500,{ok:false,error:'PLANNING_HANDOFF_FAILED',detail:clean(err&&err.message||err)});}
  }
  if(u.pathname==='/health'&&req.method==='GET'){
    try{
      const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/health',{redirect:'manual'});
      const inner=await r.json();
      return sendJson(res,r.status,{...inner,build:BUILD,innerBuild:inner.build||'',planningHandoff:'SIGNED_POST',handoffKeyConfigured:WRITE_KEY.length>=32});
    }catch(err){return sendJson(res,500,{ok:false,error:'INNER_HEALTH_FAILED',build:BUILD,detail:clean(err&&err.message||err)});}
  }
  return proxy(req,res);
}).listen(PUBLIC_PORT,'0.0.0.0');
