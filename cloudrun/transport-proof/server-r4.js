import http from 'node:http';
import {URL} from 'node:url';
const PORT=Number(process.env.PORT||8080);
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const ORIGIN=process.env.DEV_ALLOWED_ORIGIN||'';
function send(res,status,body){const h={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};if(ORIGIN){h['access-control-allow-origin']=ORIGIN;h.vary='Origin';}res.writeHead(status,h);res.end(JSON.stringify(body));}
async function accessToken(){
  const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});
  if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);
  const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');return j.access_token;
}
async function sheetsBatchGet(ranges){
  const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchGet');
  for(const range of ranges)u.searchParams.append('ranges',range);
  u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');
  const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(body));return body.valueRanges||[];
}
function clean(v){return String(v==null?'':v).trim();}
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
    .filter(x=>x.email);
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

function reservationProjection(values,emails,from,to){
  const set=new Set(emails.map(x=>clean(x).toLowerCase())),rows=[];
  if(!values.length)return{rows,byAuditorEmail:{},byAuditId:{},staleRows:[]};
  const h=values[0],ci=col(h,['Audit ID','Audit_ID']),cr=col(h,['Reservation ID','Reservation_ID']),ce=col(h,['Auditor Email','Auditor_Email']),cn=col(h,['Auditor Name','Auditor_Name']),cb=col(h,['Blocks JSON','Blocks_JSON','Blocks']),cs=col(h,['State']),cv=col(h,['Source Revision','Source_Revision']),cc=col(h,['Created At','Created_At']),cu=col(h,['Updated At','Updated_At']);
  for(const row of values.slice(1)){
    const em=val(row,ce).toLowerCase();
    if(clean(row[cs]).toUpperCase()!=='ACTIVE'||!set.has(em))continue;
    const b=blocks(row[cb]);
    if(!b.some(x=>{const d=dateOnly(x?.date);return d&&d>=from&&d<=to;}))continue;
    rows.push({auditId:val(row,ci),reservationId:val(row,cr),auditorEmail:em,auditorName:val(row,cn),blocks:b,state:'ACTIVE',sourceRevision:val(row,cv),createdAt:val(row,cc),updatedAt:val(row,cu)});
  }
  const byAuditorEmail={},byAuditId={};
  for(const x of rows){(byAuditorEmail[x.auditorEmail]??=[]).push(x);if(x.auditId)byAuditId[x.auditId]=x;}
  return{rows,byAuditorEmail,byAuditId,staleRows:[]};
}

async function focused(id){
  const t=Date.now(),s=Date.now();
  const vr=await sheetsBatchGet(['Audit planning!A1:AX768','Auditors!A1:AZ256','Auditor Availability!A1:P768','Concept Reservations!A1:P256','Config_Scopes!A1:Z128']);
  const sheetMs=Date.now()-s,ap=vr[0]?.values||[],f=findAudit(ap,id);
  if(!f)return{ok:false,error:'AUDIT_NOT_FOUND',timing:{sheetsApiMs:sheetMs,totalMs:Date.now()-t}};
  const p=Date.now(),catalog=scopeCatalog(vr[4]?.values||[]),context=auditContext(ap,catalog),audit=project(f,catalog,vr[1]?.values||[]),emails=audit.candidateAuditors.map(x=>x.email),from=dateOnly(audit.planningWindowFrom),to=dateOnly(audit.planningWindowTo),availability=availabilityProjection(vr[2]?.values||[],emails,from,to,context),reservations=reservationProjection(vr[3]?.values||[],emails,from,to);
  return{
    ok:true,
    proof:'AMS_CLOUD_RUN_DIRECT_SHEETS_R5_CONTRACT_ALIGNED',
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

http.createServer(async(req,res)=>{if(req.method==='OPTIONS'){if(!ORIGIN)return send(res,403,{ok:false,error:'CORS_DISABLED'});res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'});return res.end();}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health')return send(res,200,{ok:true,service:'ams-hot-read-proof',mode:'DIRECT_SHEETS_READ_ONLY',ssotConfigured:!!SID,corsConfigured:!!ORIGIN});
  if(u.pathname!=='/api/v1/planning/workspace'||req.method!=='GET')return send(res,404,{ok:false,error:'NOT_FOUND'});if(ORIGIN&&req.headers.origin&&req.headers.origin!==ORIGIN)return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});
  const id=clean(u.searchParams.get('auditId'));
  if(!id)return send(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});
  if(!SID)return send(res,500,{ok:false,error:'DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED'});
  try{return send(res,200,await focused(id));}
  catch(e){return send(res,500,{ok:false,error:'DIRECT_SHEETS_READ_FAILED',detail:clean(e?.message||e)});}
}).listen(PORT,'0.0.0.0');