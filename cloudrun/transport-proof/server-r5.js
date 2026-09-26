import http from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const BUILD='2026-09-26_AMS_CLOUD_RUN_MANAGER_PORTAL_R40_SIGNED_MANAGER_SESSION';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const SESSION_SECRET=process.env.AMS_SESSION_SIGNING_SECRET||'';
const SESSION_COOKIE='ams_dev_session';
const SESSION_TTL_SECONDS=2*60*60;
const MANAGER_HANDOFF_MAX_FUTURE_MS=90*1000;
const MANAGER_HANDOFF_CLOCK_SKEW_MS=10*1000;

process.env.PORT=String(INNER_PORT);
await import('./server-r4.js');
process.env.PORT=String(PUBLIC_PORT);

function clean(v){return String(v==null?'':v).trim();}
function esc(v){return clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function b64url(buf){return Buffer.from(buf).toString('base64url');}
function safeEq(a,b){const x=Buffer.from(clean(a)),y=Buffer.from(clean(b));return x.length===y.length&&timingSafeEqual(x,y);}
function handoffPayload(email,role,auditId,exp){return['v1',clean(email).toLowerCase(),clean(role),clean(auditId),String(exp)].join('\n');}
function signHandoff(payload){return b64url(createHmac('sha256',WRITE_KEY).update(payload).digest());}
function managerSessionPayload(email,role,exp){return['v1','MANAGER_SESSION',clean(email).toLowerCase(),clean(role),String(exp)].join('\n');}
function signManagerSessionHandoff(payload){return b64url(createHmac('sha256',WRITE_KEY).update(payload).digest());}
function signSession(payload){return createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');}
function issueSession(identity){
  if(SESSION_SECRET.length<32)throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  const now=Math.floor(Date.now()/1000);
  const payload=b64url(JSON.stringify({v:1,email:clean(identity.email).toLowerCase(),role:clean(identity.role),iat:now,exp:now+SESSION_TTL_SECONDS}));
  return payload+'.'+signSession(payload);
}
function sessionCookie(token){return SESSION_COOKIE+'='+token+'; Max-Age='+SESSION_TTL_SECONDS+'; Path=/; HttpOnly; Secure; SameSite=Lax';}
function sendJson(res,status,body,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(body));}
function sendHtml(res,status,body,headers={}){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers});res.end(body);}

async function readForm(req){
  let raw='';
  for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw new Error('REQUEST_TOO_LARGE');}
  return new URLSearchParams(raw);
}

function verifyManagerSessionHandoff(form){
  if(WRITE_KEY.length<32)return{ok:false,error:'WRITE_BRIDGE_NOT_CONFIGURED'};
  const email=clean(form.get('email')).toLowerCase();
  const role=clean(form.get('role'));
  const exp=Number(clean(form.get('exp')));
  const supplied=clean(form.get('signature'));
  if(!email||!role||!exp||!supplied)return{ok:false,error:'HANDOFF_REQUIRED_FIELDS_MISSING'};
  if(role.toLowerCase()!=='manager')return{ok:false,error:'ROLE_FORBIDDEN'};
  const now=Date.now();
  if(exp<now-MANAGER_HANDOFF_CLOCK_SKEW_MS)return{ok:false,error:'HANDOFF_EXPIRED'};
  if(exp>now+MANAGER_HANDOFF_MAX_FUTURE_MS)return{ok:false,error:'HANDOFF_EXPIRY_INVALID'};
  const expected=signManagerSessionHandoff(managerSessionPayload(email,'Manager',exp));
  if(!safeEq(supplied,expected))return{ok:false,error:'HANDOFF_SIGNATURE_INVALID'};
  return{ok:true,email,role:'Manager'};
}

async function handleManagerSessionHandoff(req,res){
  let form;
  try{form=await readForm(req);}catch(err){return sendJson(res,413,{ok:false,error:clean(err&&err.message||err)});}
  const verified=verifyManagerSessionHandoff(form);
  if(!verified.ok)return sendJson(res,401,verified);
  if(SESSION_SECRET.length<32)return sendJson(res,500,{ok:false,error:'SESSION_SECRET_NOT_CONFIGURED'});
  const token=issueSession(verified);
  res.writeHead(303,{'set-cookie':sessionCookie(token),'location':'/','cache-control':'no-store','referrer-policy':'no-referrer'});
  return res.end();
}

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
  if(u.pathname==='/auth/signed-handoff'&&req.method==='POST'){
    try{return await handleManagerSessionHandoff(req,res);}catch(err){return sendJson(res,500,{ok:false,error:'MANAGER_SESSION_HANDOFF_FAILED',detail:clean(err&&err.message||err)});}
  }
  if(u.pathname==='/planning'&&req.method==='GET'){
    try{return await handlePlanning(req,res,u);}catch(err){return sendJson(res,500,{ok:false,error:'PLANNING_HANDOFF_FAILED',detail:clean(err&&err.message||err)});}
  }
  if(u.pathname==='/health'&&req.method==='GET'){
    try{
      const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/health',{redirect:'manual'});
      const inner=await r.json();
      return sendJson(res,r.status,{...inner,build:BUILD,innerBuild:inner.build||'',planningHandoff:'SIGNED_POST',managerSessionHandoff:'SIGNED_POST_GAS_CANONICAL_AUTH',handoffKeyConfigured:WRITE_KEY.length>=32,sessionSecretConfigured:SESSION_SECRET.length>=32});
    }catch(err){return sendJson(res,500,{ok:false,error:'INNER_HEALTH_FAILED',build:BUILD,detail:clean(err&&err.message||err)});}
  }
  return proxy(req,res);
}).listen(PUBLIC_PORT,'0.0.0.0');
