import http from 'node:http';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const BUILD='2026-09-26_AMS_CLOUD_RUN_MANAGER_PORTAL_R42_EXTERNAL_PLANNING_CANONICAL_SAVE';
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
function b64url(buf){return Buffer.from(buf).toString('base64url');}
function safeEq(a,b){const x=Buffer.from(clean(a)),y=Buffer.from(clean(b));return x.length===y.length&&timingSafeEqual(x,y);}
function managerSessionPayload(email,role,exp){return['v1','MANAGER_SESSION',clean(email).toLowerCase(),clean(role),String(exp)].join('\n');}
function signManagerSessionHandoff(payload){return b64url(createHmac('sha256',WRITE_KEY).update(payload).digest());}
function signSession(payload){return createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');}
function sha256b64url(v){return createHash('sha256').update(String(v||''),'utf8').digest('base64url');}
function planningCommitPayload(email,role,auditId,exp,planningPayloadJson){return['v2','PLANNING_COMMIT',clean(email).toLowerCase(),clean(role),clean(auditId),String(exp),sha256b64url(planningPayloadJson)].join('\n');}
function signPlanningCommit(payload){return b64url(createHmac('sha256',WRITE_KEY).update(payload).digest());}
function issueSession(identity){
  if(SESSION_SECRET.length<32)throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  const now=Math.floor(Date.now()/1000);
  const payload=b64url(JSON.stringify({v:1,email:clean(identity.email).toLowerCase(),role:clean(identity.role),iat:now,exp:now+SESSION_TTL_SECONDS}));
  return payload+'.'+signSession(payload);
}
function sessionCookie(token){return SESSION_COOKIE+'='+token+'; Max-Age='+SESSION_TTL_SECONDS+'; Path=/; HttpOnly; Secure; SameSite=Lax';}
function sendJson(res,status,body,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(body));}
function sendHtml(res,status,body,headers={}){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers});res.end(body);}
async function readRaw(req,max=32768){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
async function readForm(req){return new URLSearchParams(await readRaw(req,16384));}
function verifyManagerSessionHandoff(form){
  if(WRITE_KEY.length<32)return{ok:false,error:'WRITE_BRIDGE_NOT_CONFIGURED'};
  const email=clean(form.get('email')).toLowerCase(),role=clean(form.get('role')),exp=Number(clean(form.get('exp'))),supplied=clean(form.get('signature'));
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
  let form;try{form=await readForm(req);}catch(err){return sendJson(res,413,{ok:false,error:clean(err&&err.message||err)});}
  const verified=verifyManagerSessionHandoff(form);if(!verified.ok)return sendJson(res,401,verified);
  if(SESSION_SECRET.length<32)return sendJson(res,500,{ok:false,error:'SESSION_SECRET_NOT_CONFIGURED'});
  const token=issueSession(verified);res.writeHead(303,{'set-cookie':sessionCookie(token),'location':'/','cache-control':'no-store','referrer-policy':'no-referrer'});return res.end();
}
async function sessionIdentity(req){
  const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/api/v1/session',{method:'GET',headers:{cookie:clean(req.headers.cookie)},redirect:'manual'});
  let body={};try{body=await r.json();}catch{}
  if(!r.ok||!body||body.ok!==true||!body.identity)return null;return body.identity;
}
function validPlanningBody(body){
  const auditId=clean(body?.auditId),auditorEmail=clean(body?.auditorEmail).toLowerCase(),blocks=Array.isArray(body?.blocks)?body.blocks:[];
  if(!auditId||!auditorEmail||!blocks.length)return{ok:false,error:'PLANNING_REQUIRED_FIELDS_MISSING'};
  if(blocks.length>5)return{ok:false,error:'PLANNING_TOO_MANY_BLOCKS'};
  for(const b of blocks){
    const date=clean(b?.date),start=clean(b?.start),end=clean(b?.end);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||end<=start)return{ok:false,error:'PLANNING_BLOCK_INVALID'};
  }
  return{ok:true,auditId,auditorEmail,blocks};
}
async function canonicalPlanningSave(identity,body){
  if(!GAS_WRITE_URL||WRITE_KEY.length<32)throw new Error('WRITE_BRIDGE_NOT_CONFIGURED');
  const chk=validPlanningBody(body);if(!chk.ok)return{success:false,error:chk.error};
  const planningPayloadJson=JSON.stringify({
    auditorEmail:chk.auditorEmail,
    auditorName:clean(body?.auditorName),
    blocks:chk.blocks.map(b=>({date:clean(b.date),start:clean(b.start),end:clean(b.end),execLoc:clean(b.execLoc||b.location||'HQ')||'HQ',slotComment:clean(b.slotComment||b.comment)})),
    comment:clean(body?.comment)
  });
  const email=clean(identity.email).toLowerCase(),role='Manager',exp=Date.now()+60000;
  const signature=signPlanningCommit(planningCommitPayload(email,role,chk.auditId,exp,planningPayloadJson));
  const writeUrl=new URL(GAS_WRITE_URL);writeUrl.searchParams.set('action','externalplanningworkspace');
  const form=new URLSearchParams({mode:'commit',email,role,auditId:chk.auditId,exp:String(exp),planningPayload:planningPayloadJson,signature});
  const r=await fetch(writeUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},redirect:'follow',body:form.toString()});
  const raw=await r.text();let out;try{out=JSON.parse(raw)}catch{throw new Error('PLANNING_WRITE_BRIDGE_NON_JSON_'+r.status)}
  if(!r.ok)throw new Error('PLANNING_WRITE_BRIDGE_HTTP_'+r.status);
  return out;
}
async function handlePlanningSave(req,res){
  const identity=await sessionIdentity(req);if(!identity)return sendJson(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
  let raw='';try{raw=await readRaw(req,32768);}catch(err){return sendJson(res,413,{ok:false,error:clean(err&&err.message||err)});}
  let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{ok:false,error:'BAD_JSON'});}
  try{const out=await canonicalPlanningSave(identity,body);return sendJson(res,out&&out.success===false?409:200,out);}catch(err){return sendJson(res,500,{ok:false,error:'PLANNING_SAVE_BRIDGE_FAILED',detail:clean(err&&err.message||err)});}
}
function planningHtml(auditId){
  const id=JSON.stringify(clean(auditId));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AMS - Planning 2.0</title><style>
  body{font-family:system-ui;margin:0;background:#f4f5f7;color:#111827}header{background:#111827;color:white;padding:14px 22px;display:flex;gap:14px;align-items:center}header button{background:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer}main{padding:20px;max-width:1400px;margin:auto}.muted{color:#6b7280;font-size:12px}.hero,.panel{background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:12px}.hero{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:14px}.label{font-size:11px;text-transform:uppercase;color:#6b7280}.value{font-weight:650;margin-top:3px}.grid{display:grid;grid-template-columns:360px 1fr;gap:12px}.field{margin:10px 0}.field label{display:block;font-size:12px;font-weight:600;margin-bottom:5px}select,input,textarea{box-sizing:border-box;width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;background:white}.row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.status{font-size:12px;margin:6px 0 12px}.err{color:#b91c1c}.ok{color:#166534}.warn{color:#92400e}.days{display:grid;grid-template-columns:repeat(7,minmax(100px,1fr));gap:6px}.day{border:1px solid #e5e7eb;border-radius:7px;padding:8px;min-height:70px;background:#fff;cursor:pointer}.day.yes{background:#f0fdf4}.day.no{background:#fff7ed}.day .d{font-weight:650;font-size:12px}.day .s{font-size:11px;color:#6b7280;margin-top:4px}.pill{display:inline-block;padding:2px 6px;border-radius:999px;background:#fee2e2;font-size:11px;margin:2px}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.primary{background:#2563eb;color:white;border:0;border-radius:7px;padding:9px 14px;cursor:pointer}.primary:disabled{opacity:.45;cursor:default}.secondary{background:white;border:1px solid #d1d5db;border-radius:7px;padding:9px 14px;cursor:pointer}@media(max-width:900px){.hero,.grid{grid-template-columns:1fr}.days{grid-template-columns:repeat(2,1fr)}}
  </style></head><body><header><button onclick="location.href='/'">← Manager Overview</button><strong>Planning 2.0</strong><span class="muted" style="color:#cbd5e1">single audit</span></header><main>
  <div id="status" class="status">Loading planning data…</div>
  <section class="hero"><div><div class="label">Company</div><div id="company" class="value">—</div><div id="auditId" class="muted"></div></div><div><div class="label">Status</div><div id="auditStatus" class="value">—</div></div><div><div class="label">Planning window</div><div id="window" class="value">—</div></div><div><div class="label">Scopes</div><div id="scopes" class="value">—</div></div></section>
  <div class="grid"><section class="panel"><div class="field"><label>Auditor</label><select id="auditor"><option value="">Select auditor</option></select></div><div id="auditorMeta" class="muted"></div><div class="field"><label>Date</label><input id="date" type="date"></div><div class="row"><div class="field"><label>Start</label><input id="start" type="time" value="09:00"></div><div class="field"><label>End</label><input id="end" type="time" value="17:00"></div><div class="field"><label>Location</label><input id="location" value="HQ"></div></div><div class="field"><label>Slot comment</label><textarea id="comment" rows="3"></textarea></div><div class="actions"><button class="secondary" onclick="location.href='/'">Cancel</button><button id="save" class="primary" disabled>Save planning</button></div></section>
  <section class="panel"><div style="display:flex;justify-content:space-between"><strong>Availability</strong><span id="timing" class="muted"></span></div><div id="availability" class="days" style="margin-top:10px"></div></section></div>
  </main><script>(function(){const auditId=${id};let model=null;const q=s=>document.querySelector(s);function txt(id,v){q(id).textContent=(v===undefined||v===null||v==='')?'—':String(v)}function setStatus(msg,cls){q('#status').textContent=msg;q('#status').className='status '+(cls||'')}function selectedCandidate(){const email=q('#auditor').value;return model?.data?.audit?.candidateAuditors?.find(x=>x.email===email)||null}function selectedDay(){const email=q('#auditor').value,date=q('#date').value;const rows=(((model?.data||{}).overlays||{}).availability||{}).byAuditorEmail?.[email]||[];return rows.find(r=>r.date===date)||null}function renderAvailability(){const email=q('#auditor').value,box=q('#availability');box.innerHTML='';if(!email||!model)return;const rows=(((model.data||{}).overlays||{}).availability||{}).byAuditorEmail?.[email]||[];if(!rows.length){box.innerHTML='<div class="muted">No availability rows in planning window.</div>';return;}for(const r of rows){const d=document.createElement('div');d.className='day '+(r.state==='YES'?'yes':r.state==='NO'?'no':'');const slots=(r.slots||[]).map(s=>'<span class="pill">'+[s.start,s.end,s.company||s.auditId].filter(Boolean).join(' · ')+'</span>').join('');d.innerHTML='<div class="d">'+r.date+'</div><div class="s">'+(r.state||r.available||'')+'</div>'+slots;d.onclick=function(){q('#date').value=r.date;validate()};box.appendChild(d)}}function validate(){const ok=model&&q('#auditor').value&&q('#date').value&&q('#start').value&&q('#end').value&&q('#end').value>q('#start').value;q('#save').disabled=!ok;return!!ok}
  async function save(){if(!validate())return;const day=selectedDay();if(day&&day.state==='NO'&&!confirm('The selected auditor is marked unavailable on this date. This is a soft warning. Continue?'))return;const c=selectedCandidate()||{};const body={auditId,auditorEmail:q('#auditor').value,auditorName:c.name||q('#auditor').value,blocks:[{date:q('#date').value,start:q('#start').value,end:q('#end').value,execLoc:q('#location').value||'HQ',slotComment:q('#comment').value||''}],comment:q('#comment').value||''};q('#save').disabled=true;setStatus('Saving planning…','warn');try{const r=await fetch('/api/v1/planning/save',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const x=await r.json();if(!r.ok||x.success===false||x.ok===false)throw new Error(x.message||x.error||'Planning save failed');setStatus('Planning saved. Status: '+(x.newStatus||'Approved')+'.','ok');setTimeout(()=>{location.href='/'},700);}catch(e){setStatus(e.message,'err');q('#save').disabled=false;}}
  fetch('/api/v1/planning/workspace?auditId='+encodeURIComponent(auditId),{credentials:'same-origin'}).then(async r=>{const x=await r.json();if(!r.ok||x.ok===false)throw new Error(x.error||'Planning read failed');model=x;const a=x.data?.audit||{};txt('#company',a.company);txt('#auditId',a.auditId);txt('#auditStatus',a.status);txt('#window',[a.planningWindowFrom,a.planningWindowTo].filter(Boolean).join(' → '));txt('#scopes',(a.scopes||[]).join(', '));q('#date').min=a.planningWindowFrom||'';q('#date').max=a.planningWindowTo||'';const sel=q('#auditor');for(const c of a.candidateAuditors||[]){const o=document.createElement('option');o.value=c.email;o.textContent=(c.name||c.email)+(c.isPreassigned?' · preassigned':'');o.dataset.blocked=c.blockedWeekdays||'';sel.appendChild(o)}if(a.candidateAuditors?.length){sel.value=a.candidateAuditors[0].email;txt('#auditorMeta',a.candidateAuditors[0].blockedWeekdays?'Default less available: '+a.candidateAuditors[0].blockedWeekdays:'');}q('#timing').textContent=(x.timing?.totalMs||0)+' ms server';setStatus('Ready','ok');renderAvailability();validate();}).catch(e=>setStatus(e.message,'err'));q('#auditor').addEventListener('change',function(){const o=this.options[this.selectedIndex];txt('#auditorMeta',o?.dataset.blocked?'Default less available: '+o.dataset.blocked:'');renderAvailability();validate()});for(const id of ['#date','#start','#end'])q(id).addEventListener('change',validate);q('#save').addEventListener('click',save);})();</script></body></html>`;
}
async function handlePlanning(req,res,u){
  const identity=await sessionIdentity(req);if(!identity)return sendJson(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
  const auditId=clean(u.searchParams.get('auditId'));if(!auditId)return sendJson(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});return sendHtml(res,200,planningHtml(auditId));
}
function proxy(req,res){
  const options={hostname:'127.0.0.1',port:INNER_PORT,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:'+INNER_PORT}};
  const p=http.request(options,inner=>{const headers={...inner.headers};res.writeHead(inner.statusCode||502,headers);inner.pipe(res);});p.on('error',err=>sendJson(res,502,{ok:false,error:'INNER_PROXY_FAILED',detail:clean(err&&err.message||err)}));req.pipe(p);
}
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/auth/signed-handoff'&&req.method==='POST'){try{return await handleManagerSessionHandoff(req,res);}catch(err){return sendJson(res,500,{ok:false,error:'MANAGER_SESSION_HANDOFF_FAILED',detail:clean(err&&err.message||err)});}}
  if(u.pathname==='/planning'&&req.method==='GET'){try{return await handlePlanning(req,res,u);}catch(err){return sendJson(res,500,{ok:false,error:'PLANNING_2_0_OPEN_FAILED',detail:clean(err&&err.message||err)});}}
  if(u.pathname==='/api/v1/planning/save'&&req.method==='POST'){return handlePlanningSave(req,res);}
  if(u.pathname==='/health'&&req.method==='GET'){try{const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/health',{redirect:'manual'});const inner=await r.json();return sendJson(res,r.status,{...inner,build:BUILD,innerBuild:inner.build||'',planningSurface:'EXTERNAL_FOCUSED_2_0',planningReadOwner:'CLOUD_RUN_FOCUSED_READ',planningWriteOwner:'GAS_CANONICAL_saveManagerPlanning',managerSessionHandoff:'SIGNED_POST_GAS_CANONICAL_AUTH',handoffKeyConfigured:WRITE_KEY.length>=32,gasWriteUrlConfigured:!!GAS_WRITE_URL,sessionSecretConfigured:SESSION_SECRET.length>=32});}catch(err){return sendJson(res,500,{ok:false,error:'INNER_HEALTH_FAILED',build:BUILD,detail:clean(err&&err.message||err)});}}
  return proxy(req,res);
}).listen(PUBLIC_PORT,'0.0.0.0');
