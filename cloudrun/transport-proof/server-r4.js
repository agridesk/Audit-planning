import http from 'node:http';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
const PORT=Number(process.env.PORT||8080);
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const ORIGIN=process.env.DEV_ALLOWED_ORIGIN||'';
const BUILD='2026-09-25_AMS_CLOUD_RUN_MANAGER_PORTAL_R32_STATIC_FRONTEND';
const SESSION_SECRET=process.env.AMS_SESSION_SIGNING_SECRET||'';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const SESSION_COOKIE='ams_dev_session';
const SESSION_TTL_SECONDS=2*60*60;
const MANAGER_PORTAL_HTML=readFileSync(new URL('./manager-portal.html',import.meta.url),'utf8');
const MANAGER_PORTAL_JS=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
function send(res,status,body,extra){const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(extra||{})};if(ORIGIN){h['access-control-allow-origin']=ORIGIN;h['access-control-allow-credentials']='true';h.vary='Origin';}res.writeHead(status,h);res.end(JSON.stringify(body));}
async function accessToken(){
  const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});
  if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);
  const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');return j.access_token;
}
async function sheetsBatchGet(ranges,serialDates=false){
  const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchGet');
  for(const range of ranges)u.searchParams.append('ranges',range);
  u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption',serialDates?'SERIAL_NUMBER':'FORMATTED_STRING');
  const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(body));return body.valueRanges||[];
}
function clean(v){return String(v==null?'':v).trim();}
function b64url(v){return Buffer.from(v).toString('base64url');}
function cookieMap(req){const out={};for(const part of clean(req.headers.cookie).split(';')){const p=part.indexOf('=');if(p>0)out[part.slice(0,p).trim()]=part.slice(p+1).trim();}return out;}
function sessionConfigured(){return SESSION_SECRET.length>=32;}
function sign(v){return createHmac('sha256',SESSION_SECRET).update(v).digest('base64url');}
function safeEq(a,b){const x=Buffer.from(clean(a)),y=Buffer.from(clean(b));return x.length===y.length&&timingSafeEqual(x,y);}
function issueSession(identity){if(!sessionConfigured())throw new Error('SESSION_SECRET_NOT_CONFIGURED');const now=Math.floor(Date.now()/1000),payload=b64url(JSON.stringify({v:1,email:clean(identity.email).toLowerCase(),role:clean(identity.role),iat:now,exp:now+SESSION_TTL_SECONDS}));return payload+'.'+sign(payload);}
function verifySession(raw){if(!sessionConfigured()||!raw)return null;const parts=clean(raw).split('.');if(parts.length!==2||!safeEq(sign(parts[0]),parts[1]))return null;try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')),now=Math.floor(Date.now()/1000);if(p.v!==1||!p.email||!p.role||!p.exp||p.exp<=now)return null;return p;}catch{return null;}}
function sessionFromRequest(req){return verifySession(cookieMap(req)[SESSION_COOKIE]);}
function sessionCookie(token){return SESSION_COOKIE+'='+token+'; Max-Age='+SESSION_TTL_SECONDS+'; Path=/; HttpOnly; Secure; SameSite=Lax';}
function html(res,status,body,headers={}){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store',...headers});res.end(body);}
function esc(v){return clean(v).replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));}
function sha256Hex(v){return createHash('sha256').update(clean(v)).digest('hex');}
function revoked(v){return v===true||['YES','TRUE'].includes(clean(v).toUpperCase());}
function sheetSerialMs(v){if(typeof v==='number'&&Number.isFinite(v))return Math.round((v-25569)*86400000);const n=Number(v);if(Number.isFinite(n)&&clean(v)!=='')return Math.round((n-25569)*86400000);const t=Date.parse(clean(v));return Number.isFinite(t)?t:NaN;}
async function validateLegacyIdentity(rawToken,role,deviceId){rawToken=clean(rawToken);role=clean(role);deviceId=clean(deviceId);if(!rawToken)return{ok:false,error:'NO_TOKEN'};if(!deviceId)return{ok:false,error:'MISSING_DEVICE_ID'};if(!role)return{ok:false,error:'MISSING_ROLE'};const tokenHash=sha256Hex(rawToken),deviceHash=sha256Hex(deviceId),vr=await sheetsBatchGet(['Auditor_Tokens!A1:Z1024'],true),rows=vr[0]?.values||[];if(rows.length<2)return{ok:false,error:'TOKEN_NOT_FOUND'};const h=rows[0],ce=col(h,['Email']),cr=col(h,['Role']),ct=col(h,['Token_Hash']),cd=col(h,['Device_Fingerprint','Device_Fingerprin','Device_Fingerprint_Hash']),cx=col(h,['Expires_At']),cv=col(h,['Revoked']);if([ce,cr,ct,cd,cx,cv].some(x=>x<0))throw new Error('AUDITOR_TOKENS_HEADER_MISSING');for(let i=1;i<rows.length;i++){const row=rows[i];if(clean(row[cr]).toLowerCase()!==role.toLowerCase()||clean(row[ct])!==tokenHash)continue;if(revoked(row[cv]))return{ok:false,error:'TOKEN_REVOKED'};const exp=sheetSerialMs(row[cx]);if(!Number.isFinite(exp)||exp<Date.now())return{ok:false,error:'TOKEN_EXPIRED'};const stored=clean(row[cd]);if(stored&&stored!==deviceHash)return{ok:false,error:'DEVICE_MISMATCH'};const email=clean(row[ce]).toLowerCase();if(!email)return{ok:false,error:'TOKEN_EMAIL_EMPTY'};return{ok:true,email,role};}return{ok:false,error:'TOKEN_NOT_FOUND'};}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};h.forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean(r[i]):'';}
function findAudit(values,id){if(!values.length)return null;const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']);if(ci<0)throw new Error('AUDIT_ID_COLUMN_MISSING');for(let i=1;i<values.length;i++)if(val(values[i],ci)===id)return{h,row:values[i],sourceRow:i+1};return null;}
function yes(v){const s=clean(v).toLowerCase();return s==='x'||s==='yes'||s==='true'||s==='1';}

function scopeCatalog(values){
  if(!values.length)return[];
  const h=values[0],cs=col(h,['SlotKey','Slot key','Slot']),cc=col(h,['ScopeCode','Scope code','Code']),cn=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),ca=col(h,['Active']),car=col(h,['Archived']);
  return values.slice(1).map(r=>({slotKey:val(r,cs),scopeCode:val(r,cc),displayName:val(r,cn),active:ca<0||yes(r[ca]),archived:car>=0&&yes(r[car])})).filter(x=>x.displayName&&x.active&&!x.archived);
}

function scopesForAudit(f,catalog){
  const out=[];
  for(const s of catalog){
    for(const k of [s.slotKey,s.scopeCode,s.displayName]){
      const i=col(f.h,[k]);
      if(i>=0&&yes(f.row[i])){out.push(s.displayName);break;}
    }
  }
  return [...new Set(out)];
}

function candidates(audValues,catalog,required,pre){
  if(!audValues.length)return[];
  const h=audValues[0],n=col(h,['Name','Auditor','Auditor name']),e=col(h,['E-mail','Email','E-mail address','Mail']),a=col(h,['Active','Is active']),r=col(h,['Role','Function']),bw=col(h,['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
  const aliases=new Map();
  for(const s of catalog)for(const k of [s.displayName,s.slotKey,s.scopeCode])if(k)aliases.set(key(k),s.displayName);
  return audValues.slice(1)
    .filter(row=>yes(row[a])&&clean(row[r]).toLowerCase()==='auditor')
    .filter(row=>required.every(sc=>{
      const canon=aliases.get(key(sc))||sc;
      for(let i=0;i<h.length;i++){if((aliases.get(key(h[i]))||clean(h[i]))===canon)return yes(row[i]);}
      return false;
    }))
    .map(row=>({email:val(row,e).toLowerCase(),name:val(row,n),blockedWeekdays:val(row,bw),isPreassigned:[val(row,e).toLowerCase(),val(row,n).toLowerCase()].includes(clean(pre).toLowerCase()),rotationState:'DEFERRED',rotationWarning:null,performedCount:null,maxAllowed:null}))
    .filter(x=>x.email)
    .sort((x,y)=>{if(x.isPreassigned!==y.isPreassigned)return x.isPreassigned?-1:1;return clean(x.name||x.email).localeCompare(clean(y.name||y.email));})
    .slice(0,5);
}

function auditContext(values,catalog){
  const by={};if(!values.length)return by;
  const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),cc=col(h,['Company']),cs=col(h,['Status']);
  if(ci<0)return by;
  for(const row of values.slice(1)){const id=val(row,ci);if(id)by[id]={company:val(row,cc),status:val(row,cs),scopes:scopesForAudit({h,row},catalog)};}
  return by;
}

function project(f,catalog,audValues){
  const g=n=>val(f.row,col(f.h,n)),pre=g(['Preassigned Auditor','Preassigned auditor']),scopes=scopesForAudit(f,catalog);
  return{
    auditId:g(['Audit ID','Audit_ID','AuditId','Audit Id']),
    company:g(['Company']),
    companyUid:g(['Company_UID','Company UID','CompanyUid']),
    status:g(['Status']),
    planningWindowFrom:g(['Planning window from','Plan van','Planning from']),
    planningWindowTo:g(['Planning window to','Plan tot','Planning to']),
    country:g(['Country']),
    region:g(['Region']),
    assignedTo:g(['Assigned to','Assigned auditor','Auditor']),
    preassignedAuditor:pre,
    scopes,
    candidateAuditors:candidates(audValues,catalog,scopes,pre),
    sourceRow:f.sourceRow
  };
}

function dateOnly(v){const s=clean(v);const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}

function availabilityProjection(values,emails,from,to,context){
  const set=new Set(emails.map(x=>clean(x).toLowerCase())),by={};
  if(!values.length)return by;
  const h=values[0],cd=col(h,['Date']),ce=col(h,['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']),ca=col(h,['Available']),s1=col(h,['First_Audit_Start_Time','First Audit Start Time']),e1=col(h,['First_Audit_End_Time','First Audit End Time']),id1=col(h,['Audit_ID_1','Audit ID 1','AuditId1']),st1=col(h,['Status_1','Status 1','Status','Source']),s2=col(h,['Second_Audit_Start_Time','Second Audit Start Time']),e2=col(h,['Second_Audit_End_Time','Second Audit End Time']),id2=col(h,['Audit_ID_2','Audit ID 2','AuditId2']),st2=col(h,['Status_2','Status 2']);
  for(const row of values.slice(1)){
    const em=val(row,ce).toLowerCase(),d=dateOnly(row[cd]);
    if(!set.has(em)||!d||d<from||d>to)continue;
    const slots=[];
    for(const x of [[s1,e1,id1,st1],[s2,e2,id2,st2]]){
      const auditRef=val(row,x[2]),ctx=auditRef&&context[auditRef]?context[auditRef]:{},z={start:val(row,x[0]),end:val(row,x[1]),auditId:auditRef,auditRef,status:ctx.status||val(row,x[3]),company:ctx.company||'',scopes:Array.isArray(ctx.scopes)?ctx.scopes:[]};
      if(z.start||z.end||z.auditRef||z.status)slots.push(z);
    }
    if(!by[em])by[em]=[];
    by[em].push({date:d,auditorEmail:em,available:val(row,ca),state:yes(row[ca])?'YES':(clean(row[ca])?'NO':''),slots});
  }
  return by;
}

function blocks(raw){if(Array.isArray(raw))return raw;try{const p=JSON.parse(clean(raw));return Array.isArray(p)?p:(Array.isArray(p?.blocks)?p.blocks:[]);}catch{return[];}}

function reservationProjection(values,emails,from,to,auditContext){
  const set=new Set(emails.map(x=>clean(x).toLowerCase())),rows=[],staleRows=[];auditContext=auditContext||{};
  if(!values.length)return{rows,byAuditorEmail:{},byAuditId:{},staleRows:[]};
  const h=values[0],ci=col(h,['Audit ID','Audit_ID']),cr=col(h,['Reservation ID','Reservation_ID']),ce=col(h,['Auditor Email','Auditor_Email']),cn=col(h,['Auditor Name','Auditor_Name']),cb=col(h,['Blocks JSON','Blocks_JSON','Blocks']),cs=col(h,['State']),cv=col(h,['Source Revision','Source_Revision']),cc=col(h,['Created At','Created_At']),cu=col(h,['Updated At','Updated_At']);
  for(const row of values.slice(1)){
    const em=val(row,ce).toLowerCase();
    if(clean(row[cs]).toUpperCase()!=='ACTIVE'||!set.has(em))continue;
    const b=blocks(row[cb]);
    if(!b.some(x=>{const d=dateOnly(x?.date);return d&&d>=from&&d<=to;}))continue;
    const auditId=val(row,ci),canonical=auditContext[auditId]||{},normalized=clean(canonical.status).toUpperCase().replace(/[\\s-]+/g,'_'),item={auditId,reservationId:val(row,cr),auditorEmail:em,auditorName:val(row,cn),blocks:b,state:'ACTIVE',sourceRevision:val(row,cv),createdAt:val(row,cc),updatedAt:val(row,cu),canonicalStatus:clean(canonical.status),canonicalStatusNormalized:normalized,lifecycleCurrent:normalized==='PENDING_PLANNING'};if(!item.lifecycleCurrent){item.state='STALE';item.lifecycleReason=!auditId||!canonical.status?'CANONICAL_AUDIT_OR_STATUS_MISSING':'CANONICAL_STATUS_'+normalized;staleRows.push(item);continue;}item.lifecycleReason='PENDING_PLANNING';rows.push(item);
  }
  const byAuditorEmail={},byAuditId={};
  for(const x of rows){(byAuditorEmail[x.auditorEmail]??=[]).push(x);if(x.auditId)byAuditId[x.auditId]=x;}
  return{rows,byAuditorEmail,byAuditId,staleRows};
}

function managerOpen(apValues,email,scopeValues,companyValues){
  if(!apValues.length)return{success:true,view:'open',rows:[],managerEmail:email,counts:{total:0,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0}};
  const h=apValues[0],idx=n=>col(h,n),ci=idx(['Audit ID','Audit_ID','AuditId','Audit Id']),cs=idx(['Status']),cc=idx(['Company']),cl=idx(['Location']),ca=idx(['Assigned to','Assigned auditor','Auditor']),cp=idx(['Preassigned Auditor']),cself=idx(['Allow self planning']),ch=idx(['Total audit time in hours']),cph=idx(['Hours planned']),cd=idx(['Date planned']),cm=idx(['Manager email']),cf=idx(['Planning window from']),ct=idx(['Planning window to']),cu=idx(['Company UID']),ce=idx(['Date - Will Expire','Date will expire','Expiration date']),cee=idx(['Extended Expiration Date']),cex=idx(['Extension Applied']);
  const catalog=scopeCatalog(scopeValues||[]),companyIndex=new Map();
  if(companyValues?.length){const hh=companyValues[0],uid=col(hh,['Company_UID','Company UID','CompanyUid']),cn=col(hh,['Company']),loc=col(hh,['Location']),reg=col(hh,['Region']);for(const r of companyValues.slice(1)){const region=val(r,reg);if(!region)continue;const keys=[val(r,uid),val(r,cn)+'|'+val(r,loc),val(r,cn)];for(const k of keys)if(k&&!companyIndex.has(key(k)))companyIndex.set(key(k),region);}}
  const allowed=new Set(['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED']),rows=[];
  for(const row of apValues.slice(1)){
    const id=val(row,ci);if(!id)continue;const raw=val(row,cs),statusKey=clean(raw).toUpperCase().replace(/[\\s-]+/g,'_');if(!allowed.has(statusKey))continue;
    const rowMgr=val(row,cm).toLowerCase();if(email&&rowMgr&&rowMgr!==email)continue;
    const company=val(row,cc),location=val(row,cl),uid=val(row,cu),region=companyIndex.get(key(uid))||companyIndex.get(key(company+'|'+location))||companyIndex.get(key(company))||'',from=dateOnly(row[cf]),to=dateOnly(row[ct]),pw=from&&to?from+' → '+to:(from||to||''),required=Number(row[ch]),scopes=scopesForAudit({h,row},catalog),expiry=dateOnly(row[cee])||dateOnly(row[ce]),ext=val(row,cex);
    const actions=statusKey==='PENDING_PLANNING'?['PLAN','REJECT']:statusKey==='PENDING_APPROVAL'?['APPROVE','DENY','REJECT']:statusKey==='APPROVED'?['CANCEL','DENY','REJECT']:statusKey==='ACCEPTED'?['CANCEL','REJECT']:[];rows.push({auditId:id,source:'Audit planning',company,companyLocation:location,location,region,companyRegion:region,scopes,scopesText:scopes.join(', '),status:raw,statusKey,planningWindow:pw,planningWindowText:pw,planningDisplay:statusKey==='PENDING_PLANNING'?pw:dateOnly(row[cd]),plannedHours:val(row,cph),hoursPlanned:val(row,cph),requiredHours:Number.isFinite(required)?required:0,toBePlanned:Number.isFinite(required)?required:0,auditor:val(row,ca),assignedTo:val(row,ca),assignedToEmail:val(row,ca),preassignedAuditor:val(row,cp),allowSelfPlanning:val(row,cself),datePlanned:dateOnly(row[cd]),expirationDate:expiry,extensionApplied:yes(ext),companyUid:uid,managerEmail:rowMgr,allowedActions:actions,readOnly:false,needsEnrichment:false});
  }
  const order={PENDING_PLANNING:0,PENDING_APPROVAL:1,APPROVED:2,ACCEPTED:3};rows.sort((a,b)=>(order[a.statusKey]-order[b.statusKey])||a.planningWindow.localeCompare(b.planningWindow)||a.company.localeCompare(b.company)||a.auditId.localeCompare(b.auditId));
  const count=k=>rows.filter(x=>x.statusKey===k).length;
  return{success:true,view:'open',fastFirstPaint:false,enrichmentAvailable:true,managerEmail:email,rows,counts:{total:rows.length,pendingPlanning:count('PENDING_PLANNING'),pendingApproval:count('PENDING_APPROVAL'),approved:count('APPROVED'),accepted:count('ACCEPTED')}};
}
async function managerOpenRead(email){const t=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX768','Config_Scopes!A1:Z128','Companies!A1:AZ1024']);const out=managerOpen(vr[0]?.values||[],clean(email).toLowerCase(),vr[1]?.values||[],vr[2]?.values||[]);out.build=BUILD;out.serverMs=Date.now()-t;return out;}


function managerArchived(logValues,email,scopeValues,companyValues){
  const rows=[];if(!logValues.length)return{success:true,view:'archived',rows};
  const h=logValues[0],ci=col(h,['Audit ID','Audit_ID','AuditId']),cs=col(h,['Status']),cc=col(h,['Company']),cl=col(h,['Location']),ca=col(h,['Auditor','Auditor Email','Email']),cd=col(h,['Date planned']),chp=col(h,['Hours planned']),chd=col(h,['Hours dedicated']),ccd=col(h,['Date completed']),cm=col(h,['Manager email']),cu=col(h,['Company UID']),csl=col(h,['Scopes list','Scopes','Scope']),scopeCat=scopeCatalog(scopeValues||[]),companyIndex=new Map();
  if(companyValues?.length){const hh=companyValues[0],uid=col(hh,['Company_UID','Company UID','CompanyUid']),cn=col(hh,['Company']),loc=col(hh,['Location']),reg=col(hh,['Region']);for(const r of companyValues.slice(1)){const region=val(r,reg);if(!region)continue;for(const k of [val(r,uid),val(r,cn)+'|'+val(r,loc),val(r,cn)])if(k&&!companyIndex.has(key(k)))companyIndex.set(key(k),region);}}
  for(let n=1;n<logValues.length;n++){const r=logValues[n],status=(val(r,cs)||'Completed'),sn=status.toUpperCase().replace(/[\\s-]+/g,'_');if(sn!=='COMPLETED')continue;const mgr=val(r,cm).toLowerCase();const company=val(r,cc);if(!company&&!val(r,ci))continue;const location=val(r,cl),uid=val(r,cu);let scopes=scopesForAudit({h,row:r},scopeCat);if(!scopes.length&&csl>=0){scopes=val(r,csl).split(/[,;|]/).map(clean).filter(Boolean);}rows.push({auditId:val(r,ci)||('LOGROW_'+(n+1)),source:'Log realized audits',company,location,region:companyIndex.get(key(uid))||companyIndex.get(key(company+'|'+location))||companyIndex.get(key(company))||'',scopes,scopesText:scopes.join(', '),executedOn:dateOnly(r[cd]),auditor:val(r,ca),hoursPlanned:Number(r[chp])||0,hoursDedicated:Number(r[chd])||0,completedDate:dateOnly(r[ccd]),status:'Completed',statusKey:'COMPLETED',managerEmail:mgr,companyUid:uid,readOnly:true});}
  rows.sort((a,b)=>(b.completedDate||b.executedOn||'').localeCompare(a.completedDate||a.executedOn||'')||a.company.localeCompare(b.company)||a.auditId.localeCompare(b.auditId));return{success:true,view:'archived',rows};
}
async function managerArchivedRead(email){const t=Date.now(),vr=await sheetsBatchGet(['Log realized audits!A1:AZ2048','Config_Scopes!A1:Z128','Companies!A1:AZ1024']);const out=managerArchived(vr[0]?.values||[],clean(email).toLowerCase(),vr[1]?.values||[],vr[2]?.values||[]);out.build=BUILD;out.serverMs=Date.now()-t;return out;}

async function canonicalManagerAction(identity,body){
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('WRITE_BRIDGE_NOT_CONFIGURED');
  const auditId=clean(body?.auditId),managerAction=clean(body?.action).toLowerCase();
  if(!auditId||!['approve','deny','cancel','reject'].includes(managerAction))throw new Error('INVALID_MANAGER_ACTION_REQUEST');
  const options=body?.options&&typeof body.options==='object'?body.options:{};
  const r=await fetch(GAS_WRITE_URL,{method:'POST',headers:{'content-type':'application/json'},redirect:'follow',body:JSON.stringify({bridgeKey:WRITE_KEY,auditId,managerAction,actorEmail:clean(identity.email).toLowerCase(),options})});
  const raw=await r.text();let out;try{out=JSON.parse(raw)}catch{throw new Error('WRITE_BRIDGE_NON_JSON_'+r.status)}
  if(!r.ok)throw new Error('WRITE_BRIDGE_HTTP_'+r.status);return out;
}
async function focused(id){
  const t=Date.now(),s=Date.now();
  const vr=await sheetsBatchGet(['Audit planning!A1:AX768','Auditors!A1:AZ256','Auditor Availability!A1:P768','Concept Reservations!A1:P256','Config_Scopes!A1:Z128']);
  const sheetMs=Date.now()-s,ap=vr[0]?.values||[],f=findAudit(ap,id);
  if(!f)return{ok:false,error:'AUDIT_NOT_FOUND',timing:{sheetsApiMs:sheetMs,totalMs:Date.now()-t}};
  const p=Date.now(),catalog=scopeCatalog(vr[4]?.values||[]),context=auditContext(ap,catalog),audit=project(f,catalog,vr[1]?.values||[]),emails=audit.candidateAuditors.map(x=>x.email),from=dateOnly(audit.planningWindowFrom),to=dateOnly(audit.planningWindowTo),availability=availabilityProjection(vr[2]?.values||[],emails,from,to,context),reservations=reservationProjection(vr[3]?.values||[],emails,from,to,context);
  return{
    ok:true,
    proof:'AMS_CLOUD_RUN_DIRECT_SHEETS_R8_SESSION_ENFORCED',
    build:BUILD,
    data:{
      period:{from,to},
      audit,
      advisory:{period:{from,to},rows:[{...audit,advisoryState:audit.candidateAuditors.length?'READY':'NO_CANDIDATES',advisoryReason:audit.candidateAuditors.length?'':'NO_HARD_QUALIFIED_AUDITORS',requiresCanonicalRefresh:false,hoursToPlan:null,hoursToPlanState:'DEFERRED'}],candidateAuditorEmails:emails},
      overlays:{period:{from,to},availability:{byAuditorEmail:availability},reservations},
      sourceCounts:{auditPlanning:Math.max(0,ap.length-1),auditors:Math.max(0,(vr[1]?.values||[]).length-1),availability:Math.max(0,(vr[2]?.values||[]).length-1),conceptReservations:Math.max(0,(vr[3]?.values||[]).length-1),configScopes:Math.max(0,(vr[4]?.values||[]).length-1)}
    },
    timing:{sheetsApiMs:sheetMs,projectionMs:Date.now()-p,totalMs:Date.now()-t}
  };
}

http.createServer(async(req,res)=>{if(req.method==='OPTIONS'){if(!ORIGIN)return send(res,403,{ok:false,error:'CORS_DISABLED'});res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','access-control-allow-credentials':'true','vary':'Origin'});return res.end();}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health')return send(res,200,{ok:true,service:'ams-hot-read-proof',build:BUILD,mode:'DIRECT_SHEETS_READ_CANONICAL_GAS_WRITE',ssotConfigured:!!SID,corsConfigured:!!ORIGIN,sessionSecretConfigured:sessionConfigured(),sessionSecretPresent:SESSION_SECRET.length>0,sessionSecretLength:SESSION_SECRET.length,writeUrlConfigured:!!GAS_WRITE_URL,writeBridgeSecretConfigured:WRITE_KEY.length>=32,authState:sessionConfigured()?'SESSION_EXCHANGE_READY':'PENDING_SESSION_SECRET'});
  if(u.pathname==='/manager-portal.js'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'});return res.end(MANAGER_PORTAL_JS);}
  if(u.pathname==='/'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return html(res,401,'<!doctype html><meta charset="utf-8"><title>AMS DEV</title><h1>AMS DEV</h1><p>Application session required.</p>');if(clean(s.role).toLowerCase()!=='manager')return html(res,403,'<!doctype html><meta charset="utf-8"><title>AMS DEV</title><h1>Role not available in external portal yet</h1>');return html(res,200,MANAGER_PORTAL_HTML);}
  if(u.pathname==='/auth/legacy-handoff'&&req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});const form=new URLSearchParams(raw);try{const identity=await validateLegacyIdentity(form.get('token'),form.get('role'),form.get('deviceId'));if(!identity.ok)return send(res,401,identity);const token=issueSession(identity);res.writeHead(303,{'set-cookie':sessionCookie(token),'location':'/','cache-control':'no-store'});return res.end();}catch(e){return send(res,500,{ok:false,error:'IDENTITY_HANDOFF_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/session/exchange'&&req.method==='POST'){if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}');}catch{return send(res,400,{ok:false,error:'BAD_JSON'});}try{const identity=await validateLegacyIdentity(b.token,b.role,b.deviceId);if(!identity.ok)return send(res,401,identity);const token=issueSession(identity);return send(res,200,{ok:true,identity:{email:identity.email,role:identity.role},expiresIn:SESSION_TTL_SECONDS},{'set-cookie':sessionCookie(token)});}catch(e){return send(res,500,{ok:false,error:'IDENTITY_EXCHANGE_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/manager/action'&&req.method==='POST'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}try{const out=await canonicalManagerAction(s,b);return send(res,out&&out.success===false?409:200,out)}catch(e){return send(res,500,{ok:false,error:'MANAGER_ACTION_BRIDGE_FAILED',detail:clean(e?.message||e)})}}
  if(u.pathname==='/api/v1/manager/archived'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});try{return send(res,200,await managerArchivedRead(clean(s.email).toLowerCase()));}catch(e){return send(res,500,{ok:false,error:'MANAGER_ARCHIVED_READ_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/manager/open'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});try{return send(res,200,await managerOpenRead(clean(s.email).toLowerCase()));}catch(e){return send(res,500,{ok:false,error:'MANAGER_OPEN_READ_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/session'&&req.method==='GET'){if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});const s=sessionFromRequest(req);return s?send(res,200,{ok:true,identity:{email:s.email,role:s.role},expiresAt:s.exp}):send(res,401,{ok:false,error:'SESSION_REQUIRED'});}
  if(u.pathname!=='/api/v1/planning/workspace'||req.method!=='GET')return send(res,404,{ok:false,error:'NOT_FOUND'});
  const session=sessionFromRequest(req);if(!session)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(!['manager','auditor'].includes(clean(session.role).toLowerCase()))return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
  const id=clean(u.searchParams.get('auditId'));
  if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});
  if(!id)return send(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});
  if(!SID)return send(res,500,{ok:false,error:'DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED'});
  try{return send(res,200,await focused(id));}
  catch(e){return send(res,500,{ok:false,error:'DIRECT_SHEETS_READ_FAILED',detail:clean(e?.message||e)});}
}).listen(PORT,'0.0.0.0');