import http from 'node:http';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
const PORT=Number(process.env.PORT||8080);
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const ORIGIN=process.env.DEV_ALLOWED_ORIGIN||'';
const BUILD='2026-10-03_PLANNING_R55_OFFSITE_BLOCK_POLICY';
const SESSION_SECRET=process.env.AMS_SESSION_SIGNING_SECRET||'';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const SESSION_COOKIE='ams_dev_session';
const SESSION_TTL_SECONDS=30*24*60*60;
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
async function sheetsValuesBatchUpdate(data){
  const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchUpdate';
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_BATCH_UPDATE_'+r.status+': '+JSON.stringify(body));return body;
}
async function sheetsValuesAppend(range,values){
  const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent(range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({values})}),body=await r.json();
  if(!r.ok)throw new Error('SHEETS_APPEND_'+r.status+': '+JSON.stringify(body));return body;
}
async function sheetsDeleteRow(sheetTitle,rowNumber){
  const token=await accessToken(),metaUrl='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'?fields=sheets.properties';
  const mr=await fetch(metaUrl,{headers:{authorization:'Bearer '+token}}),meta=await mr.json();
  if(!mr.ok)throw new Error('SHEETS_META_'+mr.status+': '+JSON.stringify(meta));
  const sh=(meta.sheets||[]).find(x=>x.properties?.title===sheetTitle);if(!sh)throw new Error('SHEET_NOT_FOUND_'+sheetTitle);
  const rn=Number(rowNumber||0);if(rn<2)throw new Error('INVALID_DELETE_ROW');
  const u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+':batchUpdate';
  const body={requests:[{deleteDimension:{range:{sheetId:sh.properties.sheetId,dimension:'ROWS',startIndex:rn-1,endIndex:rn}}}]};
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}),out=await r.json();
  if(!r.ok)throw new Error('SHEETS_DELETE_ROW_'+r.status+': '+JSON.stringify(out));return out;
}
async function sheetsEnsureRows(sheetTitle,requiredRows){
  const token=await accessToken(),metaUrl='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'?fields=sheets.properties';
  const mr=await fetch(metaUrl,{headers:{authorization:'Bearer '+token}}),meta=await mr.json();
  if(!mr.ok)throw new Error('SHEETS_META_'+mr.status+': '+JSON.stringify(meta));
  const sh=(meta.sheets||[]).find(x=>x.properties?.title===sheetTitle);if(!sh)throw new Error('SHEET_NOT_FOUND_'+sheetTitle);
  const current=Number(sh.properties.gridProperties?.rowCount||0);if(requiredRows<=current)return;
  const u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+':batchUpdate';
  const body={requests:[{appendDimension:{sheetId:sh.properties.sheetId,dimension:'ROWS',length:Math.max(requiredRows-current,100)}}]};
  const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}),out=await r.json();
  if(!r.ok)throw new Error('SHEETS_GRID_EXPAND_'+r.status+': '+JSON.stringify(out));
}
function a1col(n){let s='';for(let x=n;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+((x-1)%26))+s;return s;}
function isoLocalStamp(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace('T',' ');}
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
  const h=values[0],cs=col(h,['SlotKey','Slot key','Slot']),cc=col(h,['ScopeCode','Scope code','Code']),cn=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),ca=col(h,['Active']),car=col(h,['Archived']),cr=col(h,['Recurring']),coc=col(h,['Obligation cycle','Obligation_cycle','Cycle']),ccb=col(h,['Complete by','Complete_by','Must be completed by']),cfh=col(h,['Formal_hours','Formal hours','Formal Hours','Default_hours','Default hours']),cmoh=col(h,['Max_Offsite_Hours','Max Offsite Hours','Max offsite hours','Maximum offsite hours']),cpf=col(h,['Planning from','Planning_from','PlanningFrom']),cpt=col(h,['Planning to','Planning_to','PlanningTo']),cex=col(h,['Extension','Extension months','Extension_months']);
  return values.slice(1).map(r=>({slotKey:val(r,cs),scopeCode:val(r,cc),displayName:val(r,cn),active:ca<0||yes(r[ca]),archived:car>=0&&yes(r[car]),recurring:cr<0?null:yes(r[cr]),obligationCycle:val(r,coc).toUpperCase(),completeBy:val(r,ccb),formalHours:Number(String(val(r,cfh)||'').replace(',','.'))||0,maxOffsiteHours:Math.max(0,Number(String(val(r,cmoh)||'0').replace(',','.'))||0),planningFrom:Number(String(val(r,cpf)||'0').replace(',','.'))||0,planningTo:Number(String(val(r,cpt)||'0').replace(',','.'))||0,extensionMonths:Number(String(val(r,cex)||'0').replace(',','.'))||0})).filter(x=>x.displayName&&x.active&&!x.archived);
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

function offsitePolicyForScopes(catalog,scopes){
  const wanted=new Set((scopes||[]).map(key)),byScope=[];
  for(const s of catalog||[]){
    if(!wanted.has(key(s.displayName))&&!wanted.has(key(s.scopeCode))&&!wanted.has(key(s.slotKey)))continue;
    byScope.push({scopeCode:s.scopeCode||s.displayName||s.slotKey,maxOffsiteHours:Math.max(0,Number(s.maxOffsiteHours||0)||0)});
  }
  const positive=byScope.filter(x=>x.maxOffsiteHours>0);
  return{
    byScope,
    maxOffsiteHours:byScope.length===1?byScope[0].maxOffsiteHours:0,
    requiresScopeAllocation:byScope.length>1&&positive.length>0
  };
}
function maxOffsiteHoursForScopes(catalog,scopes){return offsitePolicyForScopes(catalog,scopes).maxOffsiteHours}

function obligationPlanningForAudit(auditId,catalog,obValues,linkValues){
  const out=[];if(!obValues?.length||!linkValues?.length)return out;const cfg=new Map();for(const s of catalog||[])cfg.set(clean(s.scopeCode),s);const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),oc=col(oh,['ScopeCode','Scope Code']),of=col(oh,['Formal_Hours','Formal Hours']),os=col(oh,['Obligation_State','Obligation State']),obById=new Map();for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);for(const lr of linkValues.slice(1)){if(val(lr,la)!==auditId||val(lr,ls).toUpperCase()!=='ACTIVE')continue;const ob=obById.get(val(lr,lo));if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;const code=val(ob,oc),def=cfg.get(code)||{},formal=Number(String(val(ob,of)||def.formalHours||'').replace(',','.'))||0;out.push({obligationId:val(lr,lo),scopeCode:code,formalHours:formal});}return out;
}

function executionConstraint(auditId,catalog,obValues,linkValues){
  const out={cycleKey:'',mustCompleteBy:'',source:'',scopeCodes:[]};if(!obValues?.length||!linkValues?.length)return out;
  const cfg=new Map();for(const s of catalog||[])cfg.set(clean(s.scopeCode),s);
  const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),oc=col(oh,['ScopeCode','Scope Code']),ock=col(oh,['Cycle_Key','Cycle Key']),os=col(oh,['Obligation_State','Obligation State']),obById=new Map();
  for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}
  const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),deadlines=[];
  for(const lr of linkValues.slice(1)){if(val(lr,la)!==auditId||val(lr,ls).toUpperCase()!=='ACTIVE')continue;const ob=obById.get(val(lr,lo));if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;const code=val(ob,oc),def=cfg.get(code),cycle=val(ob,ock);if(!def||def.recurring!==false||def.obligationCycle!=='ANNUAL'||!/^[0-9]{4}$/.test(cycle)||!/^([0-9]{2})-([0-9]{2})$/.test(def.completeBy))continue;const deadline=cycle+'-'+def.completeBy;if(!/^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(deadline))continue;deadlines.push({deadline,cycle,code});}
  if(!deadlines.length)return out;deadlines.sort((a,b)=>a.deadline.localeCompare(b.deadline));out.cycleKey=deadlines[0].cycle;out.mustCompleteBy=deadlines[0].deadline;out.source='CONFIG_SCOPES_NON_RECURRING_CYCLE';out.scopeCodes=[...new Set(deadlines.map(x=>x.code))];return out;
}

function candidates(audValues,catalog,required,pre){
  if(!audValues.length)return[];
  const h=audValues[0],n=col(h,['Name','Auditor','Auditor name']),e=col(h,['E-mail','Email','E-mail address','Mail']),a=col(h,['Active','Is active']),r=col(h,['Role','Function']),bw=col(h,['Blocked weekdays','Blocked days','Default unavailable','Default unavailable weekdays']);
  const aliases=new Map();
  for(const s of catalog){
    const canonical=key(s.displayName||s.scopeCode||s.slotKey);
    for(const k of [s.displayName,s.slotKey,s.scopeCode])if(k)aliases.set(key(k),canonical);
  }
  return audValues.slice(1)
    .filter(row=>yes(row[a])&&clean(row[r]).toLowerCase()==='auditor')
    .filter(row=>required.every(sc=>{
      const canon=aliases.get(key(sc))||key(sc);
      for(let i=0;i<h.length;i++){
        const headerCanon=aliases.get(key(h[i]))||key(h[i]);
        if(headerCanon===canon)return yes(row[i]);
      }
      return false;
    }))
    .map(row=>({email:val(row,e).toLowerCase(),name:val(row,n),blockedWeekdays:val(row,bw),isPreassigned:[val(row,e).toLowerCase(),val(row,n).toLowerCase()].includes(clean(pre).toLowerCase()),rotationState:'DEFERRED',rotationWarning:null,performedCount:null,maxAllowed:null}))
    .filter(x=>x.email)
    .sort((x,y)=>{if(x.isPreassigned!==y.isPreassigned)return x.isPreassigned?-1:1;return clean(x.name||x.email).localeCompare(clean(y.name||y.email));});
}

function auditContext(values,catalog){
  const by={};if(!values.length)return by;
  const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),cc=col(h,['Company']),cs=col(h,['Status']);
  if(ci<0)return by;
  for(const row of values.slice(1)){const id=val(row,ci);if(id)by[id]={company:val(row,cc),status:val(row,cs),scopes:scopesForAudit({h,row},catalog)};}
  return by;
}

function companyPlanningContext(values,companyUid,companyName){
  const out={preferredAuditMonths:'',locations:[],number:'',group:'',region:'',country:'',contactName:'',contactEmail:'',contactPhone:'',timeZone:'',comments:'',auditorComments:'',blockedWeekdays:'',preferredTimeWindow:''};if(!values.length)return out;
  const h=values[0],cu=col(h,['Company_UID','Company UID','UID']),cn=col(h,['Company']),cl=col(h,['Location']),cg=col(h,['GPS-data','GPS data','GPS','gps_data']),cj=col(h,['Locations_JSON','Locations JSON','locations_json']),cp=col(h,['Preferred audit months','Preferred audit period','Preferred_Audit_Months','preferred_audit_months','Preferred audit period/months','Preferred audit periode','Preferred months']),cnum=col(h,['Number','Company number']),cgrp=col(h,['Group']),creg=col(h,['Region']),ccountry=col(h,['Country']),ccn=col(h,['Contactperson','Contact person','Contactperson ']),cce=col(h,['Contactperson e-mail','Contactperson email','Contact email']),ccp=col(h,['Contactperson phone','Contact phone','Telephone']),ctz=col(h,['Time zone','Timezone']),ccom=col(h,['Comments','Company comment','General comments']),cacom=col(h,['Auditor comments','Auditor comment','Comments auditor','Audit comments']),cbd=col(h,['Audit planning limitations - days','Company blocked weekdays']),ctw=col(h,['Audit planning limitations - hours','Company time window']);
  const uid=key(companyUid),name=key(companyName);let best=null,score=-1;
  for(const row of values.slice(1)){const ru=cu>=0?key(row[cu]):'',rn=cn>=0?key(row[cn]):'';let s=-1;if(uid&&ru===uid)s=1000;else if(name&&rn===name)s=600;if(s<0)continue;if(cj>=0&&clean(row[cj]))s+=5;if(cp>=0&&clean(row[cp]))s+=5;if(s>score){score=s;best=row;}}
  if(!best)return out;
  const pick=i=>i>=0?val(best,i):'';out.preferredAuditMonths=pick(cp);out.number=pick(cnum);out.group=pick(cgrp);out.region=pick(creg);out.country=pick(ccountry);out.contactName=pick(ccn);out.contactEmail=pick(cce);out.contactPhone=pick(ccp);out.timeZone=pick(ctz);out.comments=pick(ccom);out.auditorComments=pick(cacom);out.blockedWeekdays=pick(cbd);out.preferredTimeWindow=pick(ctw);
  const fallback=cl>=0?val(best,cl):'HQ',gps=cg>=0?val(best,cg):'',raw=cj>=0?val(best,cj):'';
  function add(o,i){o=o||{};if(o.active===false||String(o.active).toLowerCase()==='false')return;const code=clean(o.code||o.Code||o.locationCode||o.location_code||o.type||o.Type||(i===0?'HQ':String(i+1))),nm=clean(o.location||o.Location||o.name||o.Name||o.label||o.Label||o.address||o.Address||fallback||code),g=clean(o.gps||o.GPS||o.gpsData||o['GPS-data']||o.gps_data||o.coordinates||o.Coordinates||o.latLng||o.latlng||gps),comment=clean(o.comment||o.Comment||o.notes||o.Notes);out.locations.push({code:code||'HQ',name:nm||code||'HQ',gps:g,comment});}
  try{const p=JSON.parse(raw);const arr=Array.isArray(p)?p:(Array.isArray(p?.locations)?p.locations:Array.isArray(p?.Locations)?p.Locations:Array.isArray(p?.items)?p.items:Array.isArray(p?.sites)?p.sites:Array.isArray(p?.points)?p.points:(p&&typeof p==='object'?[p]:[]));arr.forEach(add);}catch{}
  if(!out.locations.length)add({code:'HQ',name:fallback||'HQ',gps},0);return out;
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
    managerCommentLast:g(['Manager comment (last)','Manager comment','Last manager comment']),
    auditorCommentLast:g(['Auditor comment (last)','Auditor comment','Last auditor comment']),
    planningJson:g(['Planning JSON','Planning_JSON']),
    sourceRevision:createHash('sha256').update([g(['Audit ID','Audit_ID','AuditId','Audit Id']),g(['Status']),g(['Assigned to','Assigned auditor','Auditor']),g(['Planning JSON','Planning_JSON']),g(['Last decision timestamp']),g(['Status since'])].join('|')).digest('hex').slice(0,24),
    requiredHours:Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.'))||0,
    formalHours:Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.'))||0,
    maxOffsiteHours:maxOffsiteHoursForScopes(catalog,scopes),
    offsitePolicy:offsitePolicyForScopes(catalog,scopes),
    scopes,
    candidateAuditors:candidates(audValues,catalog,scopes,pre),
    sourceRow:f.sourceRow
  };
}

function dateOnly(v){const s=clean(v);const m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}

function availabilityProjection(values,candidates,from,to,context){
  const identities=(candidates||[]).map(x=>({email:clean(x.email).toLowerCase(),name:key(x.name)})),set=new Set(identities.map(x=>x.email)),by={};
  if(!values.length)return by;
  const h=values[0],cd=col(h,['Date']),ci=col(h,['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name','Auditor']),ca=col(h,['Available']),s1=col(h,['First_Audit_Start_Time','First Audit Start Time']),e1=col(h,['First_Audit_End_Time','First Audit End Time']),id1=col(h,['Audit_ID_1','Audit ID 1','AuditId1']),s2=col(h,['Second_Audit_Start_Time','Second Audit Start Time']),e2=col(h,['Second_Audit_End_Time','Second Audit End Time']),id2=col(h,['Audit_ID_2','Audit ID 2','AuditId2']),st1=col(h,['Status_1','Status 1','Status','Source']),st2=col(h,['Status_2','Status 2']);
  for(const row of values.slice(1)){
    const rawIdentity=ci>=0?val(row,ci):'';let em=clean(rawIdentity).toLowerCase();
    if(!set.has(em)){const nm=key(rawIdentity),hit=identities.find(x=>x.name===nm);if(hit)em=hit.email;}
    const d=dateOnly(row[cd]);if(!set.has(em)||!d||d<from||d>to)continue;
    const slots=[];
    for(const x of [[s1,e1,id1,st1],[s2,e2,id2,st2]]){const auditRef=val(row,x[2]),rawStatus=val(row,x[3]),ctx=auditRef&&context[auditRef]?context[auditRef]:{},status=ctx.status||rawStatus,statusKey=clean(status).toUpperCase(),soft=!auditRef&&(statusKey==='SYSTEM_DEFAULT'||statusKey==='USER_MANUAL'||statusKey==='CALENDAR'||statusKey==='CALENDER'||statusKey.startsWith('DEFAULT_')||statusKey.startsWith('MANUAL_')),z={start:val(row,x[0]),end:val(row,x[1]),auditId:auditRef,auditRef,status,kind:auditRef?'audit':soft?'soft':'hard',company:ctx.company||'',scopes:Array.isArray(ctx.scopes)?ctx.scopes:[]};if(z.auditRef||z.start||z.end||z.status)slots.push(z);}
    const state=yes(row[ca])?'YES':(clean(row[ca])?'NO':''),hasAudit=slots.some(z=>z.kind==='audit'),hasSoft=slots.some(z=>z.kind==='soft'),visualState=hasAudit?'OCCUPIED':state==='NO'?(hasSoft?'SOFT_UNAVAILABLE':'HARD_BLOCKED'):'AVAILABLE';if(!by[em])by[em]=[];by[em].push({date:d,auditorEmail:em,available:val(row,ca),state,visualState,slots});
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
    const auditId=val(row,ci),canonical=auditContext[auditId]||{},normalized=clean(canonical.status).toUpperCase().replace(/[\s-]+/g,'_'),item={auditId,reservationId:val(row,cr),auditorEmail:em,auditorName:val(row,cn),blocks:b,state:'ACTIVE',company:clean(canonical.company),scopes:Array.isArray(canonical.scopes)?canonical.scopes:[],sourceRevision:val(row,cv),createdAt:val(row,cc),updatedAt:val(row,cu),canonicalStatus:clean(canonical.status),canonicalStatusNormalized:normalized,lifecycleCurrent:normalized==='PENDING_PLANNING'};if(!item.lifecycleCurrent){item.state='STALE';item.lifecycleReason=!auditId||!canonical.status?'CANONICAL_AUDIT_OR_STATUS_MISSING':'CANONICAL_STATUS_'+normalized;staleRows.push(item);continue;}item.lifecycleReason='PENDING_PLANNING';rows.push(item);
  }
  const byAuditorEmail={},byAuditId={};
  for(const x of rows){(byAuditorEmail[x.auditorEmail]??=[]).push(x);if(x.auditId)byAuditId[x.auditId]=x;}
  return{rows,byAuditorEmail,byAuditId,staleRows};
}

function managerCompanyGridMeta(companyValues){
  const out=new Map();
  if(!companyValues?.length)return out;
  const h=companyValues[0];
  const uid=col(h,['Company_UID','Company UID','CompanyUid']);
  const cn=col(h,['Company']);
  const loc=col(h,['Location']);
  const reg=col(h,['Region']);
  const gps=col(h,['GPS-data','GPS data','GPS','GPS HQ','HQ GPS']);
  const json=col(h,['Locations_JSON','Locations JSON','locations_json']);
  const locs=col(h,['Locations_to_plan','Locations to plan','Locs']);
  for(const row of companyValues.slice(1)){
    const company=val(row,cn),companyUid=val(row,uid),companyLocation=val(row,loc),region=val(row,reg);
    let activeLocations=0,hqGps='';
    const rawJson=val(row,json);
    if(rawJson){
      try{
        const parsed=JSON.parse(rawJson);
        const arr=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.locations)?parsed.locations:[]);
        for(const x of arr){
          if(!x||x.active===false||String(x.active).toLowerCase()==='false')continue;
          activeLocations++;
          const code=clean(x.code||x.Code||x.locationCode||x.location_code).toUpperCase();
          const g=clean(x.gps||x.GPS||x.gpsData||x['GPS-data']||x.gps_data||x.coordinates||x.latLng||x.latlng);
          if(!hqGps&&code==='HQ')hqGps=g;
        }
      }catch{}
    }
    if(!(activeLocations>0)){
      const n=Number(val(row,locs));
      activeLocations=Number.isFinite(n)&&n>0?Math.round(n):1;
    }
    if(!hqGps)hqGps=val(row,gps);
    const meta={region,activeLocations,hqGps};
    for(const k of [companyUid,company+'|'+companyLocation,company])if(k&&!out.has(key(k)))out.set(key(k),meta);
  }
  return out;
}

function managerOpen(apValues,email,scopeValues,companyValues){
  if(!apValues.length)return{success:true,view:'open',rows:[],managerEmail:email,counts:{total:0,pendingPlanning:0,pendingApproval:0,approved:0,accepted:0}};
  const h=apValues[0],idx=n=>col(h,n),ci=idx(['Audit ID','Audit_ID','AuditId','Audit Id']),cs=idx(['Status']),cc=idx(['Company']),cl=idx(['Location']),ca=idx(['Assigned to','Assigned auditor','Auditor']),cp=idx(['Preassigned Auditor']),cself=idx(['Allow self planning']),ch=idx(['Total audit time in hours']),cph=idx(['Hours planned']),cd=idx(['Date planned','Date - Planned']),cm=idx(['Manager email']),cf=idx(['Planning window from']),ct=idx(['Planning window to']),cu=idx(['Company UID']),ce=idx(['Date - Will Expire','Date will expire','Expiration date']),cee=idx(['Extended Expiration Date']),cex=idx(['Extension Applied']),cpj=idx(['Planning JSON','Planning_JSON']),cldt=idx(['Last decision timestamp']),css=idx(['Status since']);
  const catalog=scopeCatalog(scopeValues||[]),companyIndex=managerCompanyGridMeta(companyValues||[]);
  const allowed=new Set(['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED']),rows=[];
  for(const row of apValues.slice(1)){
    const id=val(row,ci);if(!id)continue;const raw=val(row,cs),statusKey=clean(raw).toUpperCase().replace(/[\s-]+/g,'_');if(!allowed.has(statusKey))continue;
    const rowMgr=val(row,cm).toLowerCase();if(email&&rowMgr&&rowMgr!==email)continue;
    const company=val(row,cc),location=val(row,cl),uid=val(row,cu),companyMeta=companyIndex.get(key(uid))||companyIndex.get(key(company+'|'+location))||companyIndex.get(key(company))||{},region=companyMeta.region||'',from=dateOnly(row[cf]),to=dateOnly(row[ct]),pw=from&&to?from+' → '+to:(from||to||''),required=Number(row[ch]),scopes=scopesForAudit({h,row},catalog),expiry=dateOnly(row[cee])||dateOnly(row[ce]),ext=val(row,cex),activeLocations=Number(companyMeta.activeLocations||1),hqGps=clean(companyMeta.hqGps);
    const actions=statusKey==='PENDING_PLANNING'?['PLAN','REJECT']:statusKey==='PENDING_APPROVAL'?['APPROVE','CANCEL','REJECT']:statusKey==='APPROVED'?['ACCEPT','CANCEL','REJECT']:statusKey==='ACCEPTED'?['COMPLETE','CANCEL','REJECT']:[];rows.push({auditId:id,source:'Audit planning',company,companyLocation:location,location,locs:activeLocations,locationsToPlan:activeLocations,locationCount:activeLocations,gps:hqGps,gpsData:hqGps,region,companyRegion:region,scopes,scopesText:scopes.join(', '),status:raw,statusKey,planningWindow:pw,planningWindowText:pw,planningDisplay:statusKey==='PENDING_PLANNING'?pw:dateOnly(row[cd]),plannedHours:val(row,cph),hoursPlanned:val(row,cph),requiredHours:Number.isFinite(required)?required:0,formalHours:Number.isFinite(required)?required:0,maxOffsiteHours:maxOffsiteHoursForScopes(catalog,scopes),offsitePolicy:offsitePolicyForScopes(catalog,scopes),toBePlanned:Number.isFinite(required)?required:0,auditor:val(row,ca),assignedTo:val(row,ca),assignedToEmail:val(row,ca),preassignedAuditor:val(row,cp),allowSelfPlanning:val(row,cself),datePlanned:dateOnly(row[cd]),planningJson:val(row,cpj),expirationDate:expiry,extensionApplied:yes(ext),companyUid:uid,managerEmail:rowMgr,sourceRevision:createHash('sha256').update([id,raw,val(row,ca),val(row,cpj),val(row,cldt),val(row,css)].join('|')).digest('hex').slice(0,24),sourceRow:apValues.indexOf(row)+1,allowedActions:actions,readOnly:false,needsEnrichment:false});
  }
  const order={PENDING_PLANNING:0,PENDING_APPROVAL:1,APPROVED:2,ACCEPTED:3};rows.sort((a,b)=>(order[a.statusKey]-order[b.statusKey])||a.planningWindow.localeCompare(b.planningWindow)||a.company.localeCompare(b.company)||a.auditId.localeCompare(b.auditId));
  const count=k=>rows.filter(x=>x.statusKey===k).length;
  return{success:true,view:'open',fastFirstPaint:false,enrichmentAvailable:true,managerEmail:email,rows,counts:{total:rows.length,pendingPlanning:count('PENDING_PLANNING'),pendingApproval:count('PENDING_APPROVAL'),approved:count('APPROVED'),accepted:count('ACCEPTED')}};
}
async function managerOpenRead(email){const t=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX483','Config_Scopes!A1:Z128','Companies!A1:AZ1024']);const out=managerOpen(vr[0]?.values||[],clean(email).toLowerCase(),vr[1]?.values||[],vr[2]?.values||[]);out.build=BUILD;out.serverMs=Date.now()-t;return out;}


function managerArchived(logValues,email,scopeValues,companyValues){
  const rows=[];if(!logValues.length)return{success:true,view:'archived',rows};
  const h=logValues[0],ci=col(h,['Audit ID','Audit_ID','AuditId']),cs=col(h,['Status']),cc=col(h,['Company']),cl=col(h,['Location']),ca=col(h,['Auditor','Auditor Email','Email']),cd=col(h,['Date planned']),chp=col(h,['Hours planned']),chd=col(h,['Hours dedicated']),ccd=col(h,['Date completed']),cm=col(h,['Manager email']),cu=col(h,['Company UID']),csl=col(h,['Scopes list','Scopes','Scope']),scopeCat=scopeCatalog(scopeValues||[]),companyIndex=new Map();
  if(companyValues?.length){const hh=companyValues[0],uid=col(hh,['Company_UID','Company UID','CompanyUid']),cn=col(hh,['Company']),loc=col(hh,['Location']),reg=col(hh,['Region']);for(const r of companyValues.slice(1)){const region=val(r,reg);if(!region)continue;for(const k of [val(r,uid),val(r,cn)+'|'+val(r,loc),val(r,cn)])if(k&&!companyIndex.has(key(k)))companyIndex.set(key(k),region);}}
  for(let n=1;n<logValues.length;n++){const r=logValues[n],status=(val(r,cs)||'Completed'),sn=status.toUpperCase().replace(/[\s-]+/g,'_');if(sn!=='COMPLETED')continue;const mgr=val(r,cm).toLowerCase();const company=val(r,cc);if(!company&&!val(r,ci))continue;const location=val(r,cl),uid=val(r,cu);let scopes=scopesForAudit({h,row:r},scopeCat);if(!scopes.length&&csl>=0){scopes=val(r,csl).split(/[,;|]/).map(clean).filter(Boolean);}rows.push({auditId:val(r,ci)||('LOGROW_'+(n+1)),source:'Log realized audits',company,location,region:companyIndex.get(key(uid))||companyIndex.get(key(company+'|'+location))||companyIndex.get(key(company))||'',scopes,scopesText:scopes.join(', '),executedOn:dateOnly(r[cd]),auditor:val(r,ca),hoursPlanned:Number(r[chp])||0,hoursDedicated:Number(r[chd])||0,completedDate:dateOnly(r[ccd]),status:'Completed',statusKey:'COMPLETED',managerEmail:mgr,companyUid:uid,readOnly:true});}
  rows.sort((a,b)=>(b.completedDate||b.executedOn||'').localeCompare(a.completedDate||a.executedOn||'')||a.company.localeCompare(b.company)||a.auditId.localeCompare(b.auditId));return{success:true,view:'archived',rows};
}
async function managerArchivedRead(email){const t=Date.now(),vr=await sheetsBatchGet(['Log realized audits!A1:AZ2048','Config_Scopes!A1:Z128','Companies!A1:AZ1024']);const out=managerArchived(vr[0]?.values||[],clean(email).toLowerCase(),vr[1]?.values||[],vr[2]?.values||[]);out.build=BUILD;out.serverMs=Date.now()-t;return out;}

function rotationLooseKey(v){return key(v).replace(/\s+/g,'').replace(/tracecert/g,'tracecert').replace(/tracecert/g,'tracecert').replace(/tracert/g,'tracecert')}
function rotationAliasMeta(scopeValues){
  const meta={byAny:new Map(),byLoose:new Map(),maxByScope:new Map()};if(!scopeValues?.length)return meta;
  const h=scopeValues[0],slot=col(h,['SlotKey','Slot key','Slot']),code=col(h,['ScopeCode','Scope code','Code']),name=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),max=col(h,['Max number audits','Max number audit','Max audits','Max audit','Maximum audits','Max consecutive','MaxConsecutive']);
  const aliasCols=h.map((x,i)=>({i,k:key(x)})).filter(x=>x.k.includes('alias')||x.k.includes('aliases')||x.k.includes('alternative')||x.k.includes('alternatives')||x.k.includes('typo')||x.k.includes('synonym')||x.k.includes('synonyms')).map(x=>x.i);
  for(const r of scopeValues.slice(1)){const canonical=val(r,name)||val(r,code)||val(r,slot);if(!canonical)continue;for(const raw of [canonical,val(r,slot),val(r,code),val(r,name),...aliasCols.flatMap(i=>val(r,i).split(/[;,|]/))]){if(!raw)continue;meta.byAny.set(key(raw),canonical);meta.byLoose.set(rotationLooseKey(raw),canonical)}const mx=max>=0?parseInt(r[max],10):NaN;if(Number.isFinite(mx))meta.maxByScope.set(canonical,mx);}
  return meta;
}
function rotationCanonical(meta,raw){return meta.byAny.get(key(raw))||meta.byLoose.get(rotationLooseKey(raw))||clean(raw)}
function rotationAuditorMap(audValues){const out={byName:new Map(),byEmail:new Map()};if(!audValues?.length)return out;const h=audValues[0],n=col(h,['Name','Auditor','Auditor name']),e=col(h,['E-mail','Email','E-mail address','Mail']);for(const r of audValues.slice(1)){const email=val(r,e).toLowerCase(),name=val(r,n).toLowerCase();if(email){out.byEmail.set(email,{email,name:val(r,n)});if(name)out.byName.set(name,{email,name:val(r,n)})}}return out}
function rotationResolveAuditor(map,raw){const v=clean(raw).toLowerCase();if(!v)return'';if(v.includes('@'))return v;const a=map.byName.get(v);return a?a.email:v}
function rotationScopeCols(headers,meta){let da=-1,hp=-1;headers.forEach((x,i)=>{const k=key(x);if(k==='date_approved'||k==='date approved')da=i;if(k==='hours_planned'||k==='hours planned')hp=i});const out=[];if(da>=0&&hp>da+1){for(let i=da+1;i<hp;i++){const sc=rotationCanonical(meta,headers[i]);if(sc)out.push({i,scope:sc})}if(out.length)return out}for(let i=0;i<headers.length;i++){const raw=clean(headers[i]);if(/^SCOPE_\d+$/i.test(raw)){const sc=rotationCanonical(meta,raw);if(sc)out.push({i,scope:sc})}}if(out.length)return out;const one=col(headers,['Scope','Scopes','SCOPE','STANDARD','Standards']);return one>=0?[{i:one,single:true}]:[]}
function rotationYear(v){if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.getFullYear();const m=clean(v).match(/^(\d{4})[-\/]/);return m?Number(m[1]):null}
function rotationConsecutive(ownersByYear,auditor,maxYearExclusive){const years=Object.keys(ownersByYear).map(Number).filter(y=>Number.isFinite(y)&&(!maxYearExclusive||y<maxYearExclusive)).sort((a,b)=>b-a);let count=0;for(const y of years){const owners=ownersByYear[y]||{};if(!owners[auditor])break;count++;if(Object.keys(owners).some(x=>x!==auditor))return count}return count}
async function directRotationRead(auditId,auditorEmail){
  const t=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX483','Auditors!A1:Z256','Config_Scopes!A1:Z128','Log realized audits!A1:AZ2048']),ap=vr[0]?.values||[],aud=vr[1]?.values||[],scv=vr[2]?.values||[],log=vr[3]?.values||[],f=findAudit(ap,auditId);
  if(!f)return{success:false,error:'AUDIT_NOT_FOUND'};
  const meta=rotationAliasMeta(scv),catalog=scopeCatalog(scv),required=[...new Set(scopesForAudit(f,catalog).map(x=>rotationCanonical(meta,x)).filter(Boolean))],uid=val(f.row,col(f.h,['Company_UID','Company UID','CompanyUid'])),company=val(f.row,col(f.h,['Company'])),yearRaw=val(f.row,col(f.h,['Year','YEAR'])),currentYear=parseInt(yearRaw,10)||new Date().getFullYear(),audMap=rotationAuditorMap(aud),target=rotationResolveAuditor(audMap,auditorEmail),targetAud=audMap.byEmail.get(target)||audMap.byName.get(clean(auditorEmail).toLowerCase())||{email:target,name:clean(auditorEmail)},ownersByScope={};
  if(log.length){const h=log[0],cu=col(h,['Company_UID','Company UID','CompanyUID','COMPANY_UID']),cc=col(h,['Company','Customer','Bedrijf','COMPANY']),ca=col(h,['Auditor','AUDITOR','Auditor email','AuditorEmail','Auditor_Email','E-mail','Email']),cy=col(h,['Year','YEAR']),cd=col(h,['Date','Audit date','Audit_Date','Completed date','Completion date','Execution date','Executed on']),cs=col(h,['Status','STATUS']),scopeCols=rotationScopeCols(h,meta);for(const r of log.slice(1)){const st=val(r,cs).toLowerCase();if(st&&(st.includes('cancel')||st.includes('reject')||st.includes('deny')||(!st.includes('complete')&&!st.includes('realized'))))continue;const ru=val(r,cu),rn=val(r,cc);if(uid){if(ru!==uid&&key(rn)!==key(company))continue}else if(key(rn)!==key(company))continue;const owner=rotationResolveAuditor(audMap,val(r,ca)),yr=parseInt(val(r,cy),10)||rotationYear(r[cd]);if(!owner||!yr)continue;let scopes=[];if(scopeCols.length===1&&scopeCols[0].single)scopes=val(r,scopeCols[0].i).split(',').map(x=>rotationCanonical(meta,x)).filter(Boolean);else scopes=scopeCols.filter(x=>yes(r[x.i])).map(x=>x.scope);for(const sc of scopes){if(!required.includes(sc))continue;(ownersByScope[sc]??={});(ownersByScope[sc][yr]??={})[owner]=true}}}
  const rotationByScope={},performedByScope={};let performedCount=0,strictestMax=null,soft=false,near=false;for(const sc of required){const pc=rotationConsecutive(ownersByScope[sc]||{},target,currentYear),mx=meta.maxByScope.has(sc)?meta.maxByScope.get(sc):null,at=mx!=null&&mx>0&&pc>=mx,nr=mx!=null&&mx>0&&pc===mx-1;performedByScope[sc]=pc;performedCount=Math.max(performedCount,pc);if(mx!=null)strictestMax=strictestMax==null?mx:Math.min(strictestMax,mx);soft ||= at;near ||= nr;rotationByScope[sc]={performedCount:pc,maxAllowed:mx,atLimit:at,nearLimit:nr}}
  return{success:true,auditId,auditor:{name:targetAud.name||target,email:targetAud.email||target,softBlockRotation:soft,nearRotationLimit:near,hardBlockQualification:false,ineligible:false,performedByScope,rotationByScope,performedCount,maxAllowed:strictestMax,eligibilityOwner:'CloudRun_DirectRotationRead_R40'},auditorEligibilityMeta:{requiredScopes:required,currentYear,rotationMode:'SELECTED_AUDITOR_SOFT_METADATA_ONLY'},__serverMs:Date.now()-t,__rotationReadOwner:'CLOUD_RUN_DIRECT_SHEETS'};
}

function extAddMonths(iso,n){const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';let t=Number(m[1])*12+Number(m[2])-1+Number(n||0),y=Math.floor(t/12),mo=t-y*12+1,d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo,0)).getUTCDate());return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function extScopes(found,catalog){return(catalog||[]).filter(s=>[s.slotKey,s.scopeCode,s.displayName].some(a=>{const i=col(found.h,[a]);return i>=0&&yes(found.row[i]);}));}
function extWindow(expiry,scopes){let from='',to='';for(const s of scopes){let x=extAddMonths(expiry,s.planningFrom),y=extAddMonths(expiry,s.planningTo);if(!x||!y)continue;if(x>y)[x,y]=[y,x];if(!from||x>from)from=x;if(!to||y<to)to=y;}if(!from||!to||from>to)throw new Error('EXTENSION_PLANNING_WINDOW_INVALID');return{from,to};}
async function sheetsValuesBatchUpdateRaw(data){const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values:batchUpdate',r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data})}),body=await r.json();if(!r.ok)throw new Error('SHEETS_BATCH_UPDATE_RAW_'+r.status);return body;}

async function directManagerExtension(identity,body){
  const t0=Date.now(),auditId=clean(body?.auditId),command=clean(body?.command).toLowerCase();
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!['apply','undo'].includes(command))throw new Error('EXTENSION_COMMAND_NOT_ALLOWED');
  return withDirectManagerActionLock(auditId,async()=>{
    const tr=Date.now();
    const vr=await sheetsBatchGet(['Audit planning!A1:AX483','Config_Scopes!A1:Z128','Audit_Obligations!A1:Z1024','Audit_Visit_Obligations!A1:Z1024']);
    const readMs=Date.now()-tr,found=findAudit(vr[0]?.values||[],auditId);
    if(!found)throw new Error('AUDIT_NOT_FOUND');
    if(directStatusKey(val(found.row,col(found.h,['Status'])))!=='PENDING_PLANNING')throw new Error('EXTENSION_ALLOWED_ONLY_PENDING_PLANNING');
    const scopes=extScopes(found,scopeCatalog(vr[1]?.values||[]));
    const exts=scopes.map(s=>Number(s.extensionMonths||0)).filter(n=>n>0),months=exts.length?Math.min(...exts):0;
    if(!months)throw new Error('NO_EXTENSION_CONFIGURED_FOR_ACTIVE_SCOPES');
    const expiryY=val(found.row,col(found.h,['Date - Will Expire','Date – Will Expire','Will Expire']));
    if(!extAddMonths(expiryY,0))throw new Error('MISSING_OR_INVALID_ORIGINAL_EXPIRY');
    const applied=command==='apply',expiryZ=applied?extAddMonths(expiryY,months):expiryY,w=extWindow(expiryZ,scopes),now=isoLocalStamp();
    const ob=vr[2]?.values||[],links=vr[3]?.values||[],oh=ob[0]||[],lh=links[0]||[];
    const oid=col(oh,['Obligation_ID','Obligation ID']),ots=col(oh,['Trigger_Source','Trigger Source']),la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);
    if([oid,ots,la,lo,ls].some(i=>i<0))throw new Error('MODEL_C_EXTENSION_SCHEMA_MISSING');
    const linked=new Set();
    for(const r of links.slice(1))if(val(r,la)===auditId&&val(r,ls).toUpperCase()==='ACTIVE')linked.add(val(r,lo));
    const targets=[];
    for(let i=1;i<ob.length;i++)if(linked.has(val(ob[i],oid))&&val(ob[i],ots).toUpperCase()!=='ECAS')targets.push(i+1);
    if(!targets.length)throw new Error('NO_ACTIVE_CERTIFICATE_OBLIGATION_LINKED');
    const data=[],put=(sheet,h,row,names,v)=>{const i=col(h,names);if(i<0)throw new Error('EXTENSION_COLUMN_MISSING_'+names[0]);data.push({range:sheet+'!'+a1col(i+1)+row,values:[[v]]});};
    const meta=JSON.stringify({months,undo:command==='undo',source:'CLOUD_RUN_DIRECT_MANAGER_EXTENSION',actorEmail:clean(identity?.email).toLowerCase(),timestamp:now});
    for(const rowNo of targets){
      put('Audit_Obligations',oh,rowNo,['Extension_Applied'],applied?'Yes':'');
      put('Audit_Obligations',oh,rowNo,['Extension_Metadata_JSON'],meta);
      put('Audit_Obligations',oh,rowNo,['Effective_Expiry_Date'],expiryZ);
      put('Audit_Obligations',oh,rowNo,['Planning_Window_From'],w.from);
      put('Audit_Obligations',oh,rowNo,['Planning_Window_To'],w.to);
      put('Audit_Obligations',oh,rowNo,['Updated_At'],now);
    }
    put('Audit planning',found.h,found.sourceRow,['Extension applied'],applied?'Yes':'');
    put('Audit planning',found.h,found.sourceRow,['Extended Expiration Date'],expiryZ);
    put('Audit planning',found.h,found.sourceRow,['Planning window from'],w.from);
    put('Audit planning',found.h,found.sourceRow,['Planning window to'],w.to);
    const tw=Date.now();await sheetsValuesBatchUpdateRaw(data);const writeMs=Date.now()-tw;
    const patch={auditId,expiryY,expiryZ,extensionApplied:applied,extApplied:applied,extensionMonths:months,extMonths:months,canExtend:true,planningWindowFrom:w.from,planningWindowTo:w.to,planningWindow:w.from+' → '+w.to,planningWindowText:w.from+' → '+w.to,planningWindowState:'MODEL_C_OBLIGATION_OWNER_DIRECT'};
    return{success:true,auditId,command,owner:'CLOUD_RUN_DIRECT_MODEL_C_EXTENSION',directCommit:true,obligationsUpdated:targets.length,patch,readMs,writeMs,totalMs:Date.now()-t0};
  });
}

async function canonicalManagerAction(identity,body){
  const auditId=clean(body?.auditId),managerAction=clean(body?.action).toLowerCase();
  if(!auditId||!['approve','accept','cancel','reject','complete'].includes(managerAction))throw new Error('INVALID_MANAGER_ACTION_REQUEST');
  const options=body?.options&&typeof body.options==='object'?body.options:{};
  if((managerAction==='cancel'||managerAction==='reject')&&!clean(options.reason||options.comment))throw new Error('ACTION_REASON_REQUIRED');
  if(managerAction==='approve')return directManagerApprove(identity,body);
  if(managerAction==='accept')return directManagerAcceptOnBehalf(identity,body);
  if(managerAction==='cancel')return directManagerCancel(identity,body);
  if(managerAction==='reject')return directManagerReject(identity,body);
  if(managerAction==='complete')return directManagerComplete(identity,body);
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('WRITE_BRIDGE_NOT_CONFIGURED');
  const writeUrl=new URL(GAS_WRITE_URL);writeUrl.searchParams.set('action','externalmanageraction');
  const r=await fetch(writeUrl,{method:'POST',headers:{'content-type':'application/json'},redirect:'follow',body:JSON.stringify({bridgeKey:WRITE_KEY,auditId,managerAction,actorEmail:clean(identity.email).toLowerCase(),options})});
  const raw=await r.text();let out;try{out=JSON.parse(raw)}catch{throw new Error('WRITE_BRIDGE_NON_JSON_'+r.status)}
  if(!r.ok)throw new Error('WRITE_BRIDGE_HTTP_'+r.status);return out;
}

const DIRECT_MANAGER_ACTION_LOCKS=new Map();
async function withDirectManagerActionLock(auditId,fn){
  const key='MANAGER_ACTION|'+clean(auditId),prev=DIRECT_MANAGER_ACTION_LOCKS.get(key)||Promise.resolve();let release;
  const gate=new Promise(r=>release=r),chain=prev.then(()=>gate);DIRECT_MANAGER_ACTION_LOCKS.set(key,chain);await prev;
  try{return await fn();}finally{release();if(DIRECT_MANAGER_ACTION_LOCKS.get(key)===chain)DIRECT_MANAGER_ACTION_LOCKS.delete(key);}
}
function directStatusKey(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function directRowRevision(h,row){
  const g=n=>val(row,col(h,n));
  return createHash('sha256').update([
    g(['Audit ID','Audit_ID','AuditId','Audit Id']),
    g(['Status']),
    g(['Assigned to','Assigned auditor','Auditor']),
    g(['Planning JSON','Planning_JSON']),
    g(['Last decision timestamp']),
    g(['Status since'])
  ].join('|')).digest('hex').slice(0,24);
}
function directResolveAuditorEmail(audValues,assigned){
  const a=clean(assigned).toLowerCase();if(!a)return'';
  if(a.includes('@'))return a;
  if(!audValues?.length)return'';
  const h=audValues[0],ce=col(h,['Email','E-mail','Auditor Email','Auditor email']),cn=col(h,['Name','Auditor','Auditor Name','Display name']);
  if(ce<0)return'';
  for(const r of audValues.slice(1)){
    const email=val(r,ce).toLowerCase(),name=cn>=0?val(r,cn).toLowerCase():'';
    if(email===a||name===a)return email;
  }
  return'';
}
function directSoftAvailabilityStatus(v){
  const s=clean(v).toUpperCase();
  return s==='SYSTEM_DEFAULT'||s==='USER_MANUAL'||s==='CALENDAR'||s==='CALENDER'||s.startsWith('DEFAULT_')||s.startsWith('MANUAL_');
}
async function directManagerApprove(identity,body){
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX483','Auditors!A1:Z256','Companies!A1:AJ686','Config_Scopes!A1:Z128']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[],found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const h=found.h,row=found.row.slice(),beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(beforeKey==='ACCEPTED')return{success:true,idempotent:true,auditId,action:'APPROVE',beforeStatus:'Accepted',newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_APPROVE',readMs,writeMs:0,sideEffectMs:0,totalMs:Date.now()-started};
    if(beforeKey!=='PENDING_APPROVAL')throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');

    const assigned=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])),recipientEmail=directResolveAuditorEmail(vr[1]?.values||[],assigned);
    if(!recipientEmail)throw new Error('APPROVE_AUDITOR_RECIPIENT_REQUIRED');
    const company=val(row,col(h,['Company'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid'])),now=isoLocalStamp(),minuteStamp=now.slice(0,16),actorEmail=clean(identity?.email).toLowerCase();
    const set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    set(['Status'],'Accepted');
    set(['Status since'],now);
    set(['Last manager decision'],'APPROVE');
    set(['Date - Approved','Date approved','Date Approved'],now.slice(0,10));
    set(['Date accepted','Date - Accepted','Date Accepted'],now.slice(0,10));
    set(['Last decision timestamp'],now);
    set(['Manager comment (last)'],clean(options.reason||options.comment));

    const writeStarted=Date.now();await sheetsValuesBatchUpdate([{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}]);const writeMs=Date.now()-writeStarted;

    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,companyUid,actorEmail,actorRole:'MANAGER',beforeStatus,afterStatus:'Accepted',reason:clean(options.reason||options.comment),source:'CLOUD_RUN_DIRECT_MANAGER_APPROVE',timestamp:now,action:'APPROVE',roadmapRule:'AUDITOR_SELF_PLAN_MANAGER_APPROVE_DIRECT_ACCEPTED'};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Accepted').digest('hex');
    const approvePayload={eventType:'AUDIT_APPROVED',eventFamily:'COMPACT_LIFECYCLE',rendererProfile:'COMPACT_LIFECYCLE',deliveryProfile:'BUFFERED_COMPACT',company,companyUid,auditId,actor:actorEmail,actorRole:'MANAGER',recipientRole:'AUDITOR',recipientGroup:'AUDITOR',recipientEmail,resultStatus:'Accepted',displayStatus:'Accepted',comment:'',assignedAuditor:assigned,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'LIFECYCLE_AUDITOR',templateFamily:'COMPACT_LIFECYCLE',templateKeyDefault:'AUDIT_APPROVED',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const bodyText=['Audit approved','Company: '+company,'Audit ID: '+auditId,'Auditor: '+assigned].join('\\n'),notifyHash=createHash('md5').update(recipientEmail+'|AUDIT_APPROVED|'+auditId+'|'+now).digest('hex');
    const companies=vr[2]?.values||[],ch=companies[0]||[],cuid=col(ch,['Company_UID','Company UID','CompanyUid']),cmps=col(ch,['MPS number','MPS Number','MPS nr','MPS-nr','Number']),cfg=scopeCatalog(vr[3]?.values||[]),scopes=scopesForAudit(found,cfg);
    let mpsNumber='';for(const cr of companies.slice(1)){if(cuid>=0&&val(cr,cuid)===companyUid){mpsNumber=val(cr,cmps);break;}}
    const planningRaw=val(found.row,col(h,['Planning JSON','PlanningJSON','Planning']));let planningBlocks=blocks(planningRaw);let parsedPlanning={};try{parsedPlanning=JSON.parse(planningRaw||'{}')||{};}catch{}if(!planningBlocks.length&&Array.isArray(parsedPlanning.days)){planningBlocks=parsedPlanning.days.map(d=>({date:clean(d?.date),start:clean(d?.start),end:clean(d?.end),hours:Number(d?.hours)||0,execLoc:clean(d?.execLoc||d?.location),slotComment:clean(d?.slotComment||d?.comment)}));}let plannedHours=Number(val(found.row,col(h,['Hours planned','Planned hours','Hours Planned']))||0);if(!(plannedHours>0)){plannedHours=Number(parsedPlanning.totalPlannedHours||parsedPlanning.totalHours||0)||planningBlocks.reduce((s,b)=>s+(Number(b&&b.hours)||0),0);}
    const ecasPayload={eventType:'ECAS_AUDIT_APPROVAL_DIGEST',eventFamily:'EXTERNAL_OPERATIONAL',rendererProfile:'EXTERNAL_OPERATIONAL',deliveryProfile:'BUFFERED_EXTERNAL',company,companyUid,mpsNumber,auditNumber:mpsNumber,auditId,actor:actorEmail,actorRole:'MANAGER',auditorEmail:recipientEmail,auditorName:assigned,recipientRole:'PLANNING',recipientGroup:'PLANNING',recipientEmail:actorEmail,resultStatus:'Accepted',displayStatus:'Accepted',scopes,blocks:planningBlocks,plannedHours,planningJson:planningRaw,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL',templateKeyDefault:'ECAS_AUDIT_APPROVAL_DIGEST',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const ecasHash=createHash('md5').update(actorEmail+'|ECAS_AUDIT_APPROVAL_DIGEST|'+auditId+'|'+now).digest('hex');
    const queueRows=[
      [minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})],
      [minuteStamp,'PENDING','AUDIT_APPROVED',recipientEmail,auditId,company,'Audit approved – '+company+' – '+auditId,bodyText,0,'',notifyHash,'',JSON.stringify({payload:approvePayload})],
      [minuteStamp,'PENDING','ECAS_AUDIT_APPROVAL_DIGEST',actorEmail,auditId,company,'ECAS audit approval – '+company+' – '+auditId,bodyText,0,'',ecasHash,'',JSON.stringify({payload:ecasPayload})]
    ];
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;
    return{success:true,auditId,action:'APPROVE',beforeStatus,newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',assignedTo:assigned,directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_APPROVE',readMs,writeMs,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}

async function directManagerAcceptOnBehalf(identity,body){
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  const note=clean(options.reason||options.comment),acceptSource='MANAGER_PORTAL';
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX483','Auditors!A1:Z256','Companies!A1:AJ686','Config_Scopes!A1:Z128']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[],found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const h=found.h,row=found.row.slice(),beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(beforeKey==='ACCEPTED')return{success:true,idempotent:true,auditId,action:'ACCEPT',beforeStatus:'Accepted',newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF',readMs,writeMs:0,sideEffectMs:0,totalMs:Date.now()-started};
    if(beforeKey!=='APPROVED')throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    const representedAuditor=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']));
    if(!representedAuditor)throw new Error('ACCEPT_ON_BEHALF_REPRESENTED_AUDITOR_REQUIRED');
    const managerActor=clean(identity?.email).toLowerCase();if(!managerActor)throw new Error('MANAGER_ACTOR_REQUIRED');
    const audValues=vr[1]?.values||[],ah=audValues[0]||[],ae=col(ah,['Email','E-mail','Auditor Email','Auditor email']),ar=col(ah,['Role']),aa=col(ah,['Active','Enabled']);
    let managerRecipient='';for(const rr of audValues.slice(1)){const role=ar>=0?val(rr,ar).toUpperCase():'',active=aa>=0?val(rr,aa).toUpperCase():'YES';if(role==='MANAGER'&&!['NO','FALSE','0','INACTIVE'].includes(active)){managerRecipient=val(rr,ae).toLowerCase();if(managerRecipient)break;}}
    if(!managerRecipient)managerRecipient=managerActor;
    const company=val(row,col(h,['Company'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid'])),now=isoLocalStamp(),minuteStamp=now.slice(0,16);
    const set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    set(['Status'],'Accepted');
    set(['Status since'],now);
    set(['Last manager decision'],'ACCEPT_ON_BEHALF');
    set(['Last decision timestamp'],now);
    set(['Manager comment (last)'],'Accepted by manager on behalf of assigned auditor');
    set(['Date accepted','Date - Accepted','Date Accepted'],now.slice(0,10));
    const writeStarted=Date.now();await sheetsValuesBatchUpdate([{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}]);const writeMs=Date.now()-writeStarted;

    const cfg=scopeCatalog(vr[3]?.values||[]),scopes=scopesForAudit(found,cfg);
    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,companyUid,actorEmail:managerActor,actorRole:'MANAGER',representedAuditor,confirmationSource:acceptSource,confirmationNote:'',confirmedAt:now,beforeStatus,afterStatus:'Accepted',reason:note,source:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF',timestamp:now,action:'ACCEPT',onBehalf:true,scopes};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Accepted|MANAGER_ON_BEHALF').digest('hex');
    const notifyPayload={eventType:'AUDIT_ACCEPTED',eventFamily:'COMPACT_LIFECYCLE',rendererProfile:'COMPACT_LIFECYCLE',deliveryProfile:'BUFFERED_COMPACT',company,companyUid,auditId,actor:managerActor,actorRole:'MANAGER',representedAuditor,onBehalf:true,confirmationSource:acceptSource,recipientRole:'MANAGER',recipientGroup:'MANAGER',recipientEmail:managerRecipient,resultStatus:'Accepted',displayStatus:'Accepted',comment:note,scopes,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'LIFECYCLE_MANAGER',templateFamily:'COMPACT_LIFECYCLE',templateKeyDefault:'AUDIT_ACCEPTED',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const bodyText=['Audit accepted on behalf of auditor','Company: '+company,'Audit ID: '+auditId,'Represented auditor: '+representedAuditor,'Source: Manager Portal'].join('\\n'),notifyHash=createHash('md5').update(managerActor+'|AUDIT_ACCEPTED|'+auditId+'|'+now+'|MANAGER_ON_BEHALF').digest('hex');
    const companies=vr[2]?.values||[],ch=companies[0]||[],cuid=col(ch,['Company_UID','Company UID','CompanyUid']),cmps=col(ch,['MPS number','MPS Number','MPS nr','MPS-nr','Number']);
    let mpsNumber='';for(const cr of companies.slice(1)){if(cuid>=0&&val(cr,cuid)===companyUid){mpsNumber=val(cr,cmps);break;}}
    const planningRaw=val(found.row,col(h,['Planning JSON','PlanningJSON','Planning']));let planningBlocks=blocks(planningRaw);let parsedPlanning={};try{parsedPlanning=JSON.parse(planningRaw||'{}')||{};}catch{}if(!planningBlocks.length&&Array.isArray(parsedPlanning.days)){planningBlocks=parsedPlanning.days.map(d=>({date:clean(d?.date),start:clean(d?.start),end:clean(d?.end),hours:Number(d?.hours)||0,execLoc:clean(d?.execLoc||d?.location),slotComment:clean(d?.slotComment||d?.comment)}));}let plannedHours=Number(val(found.row,col(h,['Hours planned','Planned hours','Hours Planned']))||0);if(!(plannedHours>0)){plannedHours=Number(parsedPlanning.totalPlannedHours||parsedPlanning.totalHours||0)||planningBlocks.reduce((s,b)=>s+(Number(b&&b.hours)||0),0);}const representedAuditorEmail=directResolveAuditorEmail(vr[1]?.values||[],representedAuditor);
    const ecasPayload={eventType:'ECAS_AUDIT_APPROVAL_DIGEST',eventFamily:'EXTERNAL_OPERATIONAL',rendererProfile:'EXTERNAL_OPERATIONAL',deliveryProfile:'BUFFERED_EXTERNAL',company,companyUid,mpsNumber,auditNumber:mpsNumber,auditId,actor:managerActor,actorRole:'MANAGER',representedAuditor,onBehalf:true,confirmationSource:acceptSource,auditorEmail:representedAuditorEmail,auditorName:representedAuditor,recipientRole:'PLANNING',recipientGroup:'PLANNING',recipientEmail:managerRecipient,resultStatus:'Accepted',displayStatus:'Accepted',scopes,blocks:planningBlocks,plannedHours,planningJson:planningRaw,config:{active:true,sendEmail:true,logOnly:false,consolidate:true,bufferMinutes:10,digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL',templateKeyDefault:'ECAS_AUDIT_APPROVAL_DIGEST',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:false,requireReason:false}};
    const ecasHash=createHash('md5').update(managerRecipient+'|ECAS_AUDIT_APPROVAL_DIGEST|'+auditId+'|'+now+'|MANAGER_ON_BEHALF').digest('hex');
    const queueRows=[
      [minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})],
      [minuteStamp,'PENDING','AUDIT_ACCEPTED',managerRecipient,auditId,company,'Audit accepted on behalf – '+company+' – '+auditId,bodyText,0,'',notifyHash,'',JSON.stringify({payload:notifyPayload})],
      [minuteStamp,'PENDING','ECAS_AUDIT_APPROVAL_DIGEST',managerRecipient,auditId,company,'ECAS audit approval – '+company+' – '+auditId,bodyText,0,'',ecasHash,'',JSON.stringify({payload:ecasPayload})]
    ];
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;
    return{success:true,auditId,action:'ACCEPT',beforeStatus,newStatus:'Accepted',afterStatus:'ACCEPTED',afterStatusDisplay:'Accepted',representedAuditor,managerActor,confirmationSource:acceptSource,confirmedAt:now,directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_ACCEPT_ON_BEHALF',readMs,writeMs,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}


function directIsoDate(v){
  const s=clean(v);if(!s)return'';
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return m[3]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[1])).padStart(2,'0');
  return'';
}
function directDateAddYears(iso,years){
  const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
  const y=Number(m[1])+Number(years||0),mo=Number(m[2]),d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo,0)).getUTCDate());
  return[String(y),String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function directDateAddMonths(iso,months){
  const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
  const total=Number(m[1])*12+(Number(m[2])-1)+Number(months||0),y=Math.floor(total/12),mo=((total%12)+12)%12,d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo+1,0)).getUTCDate());
  return[String(y),String(mo+1).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function directSetByHeader(headers,row,names,value){const i=col(headers,names);if(i>=0)row[i]=value;}
function directAppendObjectRow(headers,obj){return headers.map(h=>obj[h]===undefined?'':obj[h]);}
function directSuccessorGroups(items){
  const sorted=(items||[]).slice().sort((a,b)=>a.from.localeCompare(b.from)||a.scopeCode.localeCompare(b.scopeCode)),groups=[];
  for(const item of sorted){
    let placed=false;
    for(const g of groups){
      const from=item.from>g.from?item.from:g.from,to=item.to<g.to?item.to:g.to;
      if(from<=to){g.items.push(item);g.from=from;g.to=to;placed=true;break;}
    }
    if(!placed)groups.push({items:[item],from:item.from,to:item.to});
  }
  return groups;
}
function directAuditPlanningScopeHours(headers,row,def,scopeCode){
  const ix=col(headers,['Duration '+clean(def?.slotKey),'Duration '+clean(scopeCode)]);
  if(ix<0)return null;
  const raw=clean(row[ix]);
  if(raw==='')return null;
  const n=Number(String(raw).replace(',','.'));
  return Number.isFinite(n)&&n>=0?n:null;
}
function directCompletedLogRow(logHeaders,found,hoursDedicated,actorEmail,now,fallbackPlannedHours){
  const out=new Array(logHeaders.length).fill(''),h=found.h,row=found.row,g=names=>val(row,col(h,names)),set=(names,v)=>directSetByHeader(logHeaders,out,names,v);
  let planned=Number(g(['Hours planned','Planned hours','Hours Planned']))||0;
  if(!(planned>0)){try{const j=JSON.parse(g(['Planning JSON','PlanningJSON','Planning'])||'{}');planned=Number(j.totalPlannedHours||j.formalHours||j.totalHours||0)||0;}catch{}}if(!(planned>0)&&Number(fallbackPlannedHours)>0)planned=Number(fallbackPlannedHours);
  const datePlanned=dateOnly(g(['Date - Planned','Date planned','Date Planned'])),expiry=dateOnly(g(['Date - Will Expire','Will Expire']));
  set(['Company'],g(['Company']));set(['Auditor'],g(['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']));
  set(['Status'],'Completed');set(['Date planned','Date - Planned'],datePlanned);set(['Date approved','Date - Approved'],dateOnly(g(['Date - Approved','Date approved','Date Approved'])));
  for(let n=1;n<=8;n++){const key='SCOPE_'+String(n).padStart(2,'0');if(yes(g([key])))set([key],'x');}
  set(['Hours planned'],planned);set(['Hours dedicated'],hoursDedicated);set(['Hours to be planned'],Number(g(['Total audit time in hours','Total hours','Hours to be planned']))||planned);
  set(['Year'],(datePlanned||expiry||now).slice(0,4));set(['Date accepted','Date - Accepted'],dateOnly(g(['Date accepted','Date - Accepted','Date Accepted'])));
  set(['Audit ID'],g(['Audit ID','Audit_ID','AuditId','Audit Id']));set(['Manager_Email','Manager Email','Manager e-mail'],actorEmail);
  set(['Company_UID','Company UID','CompanyUid'],g(['Company_UID','Company UID','CompanyUid']));set(['Date completed'],now.slice(0,10));
  return out;
}

async function directQueueRealizedHoursCorrection(auditId,company,companyUid,actorEmail,oldHours,newHours){
  const now=isoLocalStamp(),payload={type:'REALIZED_HOURS_CORRECTED',auditId,company,companyUid,actorEmail,actorRole:'MANAGER',oldHours:Number(oldHours),newHours:Number(newHours),timestamp:now,source:'CLOUD_RUN_DIRECT_MANAGER_COMPLETE'};
  const body=JSON.stringify(payload),hash=createHash('md5').update('REALIZED_HOURS_CORRECTED|'+auditId+'|'+oldHours+'|'+newHours+'|'+now).digest('hex');
  await sheetsValuesAppend('Notification Queue!A:M',[[now.slice(0,16),'AUDIT_TRAIL','REALIZED_HOURS_CORRECTED','',auditId,company,'[TRAIL] REALIZED_HOURS_CORRECTED :: '+auditId,body,0,'',hash,'',JSON.stringify({payload})]]);
  return payload;
}
function directExistingSuccessorRows(ap,auditId,actorEmail,cfgValues,companies){
  if(!Array.isArray(ap)||ap.length<2)return[];
  const h=ap[0]||[],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),prefix=clean(auditId)+'_NEXT_';
  if(ci<0||!prefix)return[];
  const out=[];
  for(let i=1;i<ap.length;i++){
    const id=val(ap[i],ci);
    if(!id.startsWith(prefix))continue;
    const mapped=managerOpen([h,ap[i]],actorEmail,cfgValues,companies).rows[0];
    if(mapped){mapped.sourceRow=i+1;out.push(mapped);}
  }
  return out;
}
async function directManagerComplete(identity,body){return directComplete(identity,body,'MANAGER');}
async function directAuditorComplete(identity,body){return directComplete(identity,body,'AUDITOR');}
async function directComplete(identity,body,actorRole){
  actorRole=clean(actorRole).toUpperCase();
  if(actorRole!=='MANAGER'&&actorRole!=='AUDITOR')throw new Error('COMPLETE_ACTOR_ROLE_INVALID');
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},hoursDedicated=Number(options.hoursDedicated),expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!Number.isFinite(hoursDedicated)||hoursDedicated<=0||Math.abs(Math.round(hoursDedicated*4)/4-hoursDedicated)>1e-9)throw new Error('HOURS_DEDICATED_INVALID');
  const owner=actorRole==='MANAGER'?'CLOUD_RUN_DIRECT_MANAGER_COMPLETE':'CLOUD_RUN_DIRECT_AUDITOR_COMPLETE';
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet([
      'Audit planning!A1:AX600','Log realized audits!A1:AZ2500','Auditor Availability!A:P',
      'Config_Scopes!A1:Z128','Audit_Obligations!A1:Z2500','Audit_Visit_Obligations!A1:H2500',
      'Company_Scopes!A1:Z1500','Companies!A1:AZ1200'
    ]),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[],log=vr[1]?.values||[],av=vr[2]?.values||[],cfgValues=vr[3]?.values||[],obs=vr[4]?.values||[],links=vr[5]?.values||[],companyScopes=vr[6]?.values||[],companies=vr[7]?.values||[];
    const found=findAudit(ap,auditId),logH=log[0]||[],logAuditIx=col(logH,['Audit ID','Audit_ID','AuditId']),logHoursIx=col(logH,['Hours dedicated']);
    let existingLogRow=0;
    if(logAuditIx>=0)for(let i=1;i<log.length;i++)if(val(log[i],logAuditIx)===auditId){existingLogRow=i+1;break;}
    if(!found){
      if(!existingLogRow)throw new Error('AUDIT_NOT_FOUND');
      let correctionMs=0,managerOverride=false,managerCorrection=null;
      const existingHours=logHoursIx>=0?Number(log[existingLogRow-1][logHoursIx]):0;
      if(actorRole==='MANAGER'&&logHoursIx>=0&&existingHours!==hoursDedicated){
        const oldHours=existingHours,t=Date.now();await sheetsValuesBatchUpdate([{range:'Log realized audits!'+a1col(logHoursIx+1)+existingLogRow,values:[[hoursDedicated]]}]);correctionMs=Date.now()-t;managerOverride=true;
        const companyIx=col(logH,['Company']),uidIx=col(logH,['Company_UID','Company UID','CompanyUid']);try{managerCorrection=await directQueueRealizedHoursCorrection(auditId,val(log[existingLogRow-1],companyIx),val(log[existingLogRow-1],uidIx),clean(identity?.email).toLowerCase(),oldHours,hoursDedicated);}catch{}
      }
      const effectiveHours=actorRole==='AUDITOR'&&existingHours>0?existingHours:hoursDedicated;
      const retrySuccessorRows=directExistingSuccessorRows(ap,auditId,clean(identity?.email).toLowerCase(),cfgValues,companies);
      return{success:true,idempotent:true,alreadyCompleted:true,managerOverride,managerCorrection,auditId,action:'COMPLETE',hoursDedicated:effectiveHours,directCommit:true,owner,readMs,writeMs:correctionMs,successorRows:retrySuccessorRows,successorAuditIds:retrySuccessorRows.map(r=>r.auditId),totalMs:Date.now()-started};
    }
    const h=found.h,row=found.row,beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(beforeKey!=='ACCEPTED')throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    let existingLogCorrectionMs=0,managerCorrection=null;
    const existingCommittedHours=existingLogRow&&logHoursIx>=0?Number(log[existingLogRow-1][logHoursIx]):0;
    if(actorRole==='MANAGER'&&existingLogRow&&logHoursIx>=0&&existingCommittedHours!==hoursDedicated){
      const oldHours=existingCommittedHours,t=Date.now();await sheetsValuesBatchUpdate([{range:'Log realized audits!'+a1col(logHoursIx+1)+existingLogRow,values:[[hoursDedicated]]}]);existingLogCorrectionMs=Date.now()-t;
      const companyIx=col(logH,['Company']),uidIx=col(logH,['Company_UID','Company UID','CompanyUid']);try{managerCorrection=await directQueueRealizedHoursCorrection(auditId,val(log[existingLogRow-1],companyIx),val(log[existingLogRow-1],uidIx),clean(identity?.email).toLowerCase(),oldHours,hoursDedicated);}catch{}
    }

    const company=val(row,col(h,['Company'])),location=val(row,col(h,['Location'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid'])),actorEmail=clean(identity?.email).toLowerCase(),now=isoLocalStamp(),stamp=new Date().toISOString();
    const assignedTo=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])).toLowerCase();
    if(actorRole==='AUDITOR'&&(!assignedTo||assignedTo!==actorEmail))throw new Error('AUDITOR_NOT_ASSIGNED');
    if(!companyUid)throw new Error('COMPANY_UID_REQUIRED');

    const cfg=scopeCatalog(cfgValues),cfgByCode=new Map(cfg.map(x=>[clean(x.scopeCode),x]));
    const oh=obs[0]||[],oi=col(oh,['Obligation_ID','Obligation ID']),ocs=col(oh,['Company_Scope_ID','Company Scope ID']),ocu=col(oh,['Company_UID','Company UID']),osc=col(oh,['ScopeCode','Scope Code']),ock=col(oh,['Cycle_Key','Cycle Key']),ots=col(oh,['Trigger_Source','Trigger Source']),ost=col(oh,['Obligation_State','Obligation State']),obe=col(oh,['Base_Expiry_Date','Base Expiry Date']),oee=col(oh,['Effective_Expiry_Date','Effective Expiry Date']),opf=col(oh,['Planning_Window_From','Planning Window From']),opt=col(oh,['Planning_Window_To','Planning Window To']),ofh=col(oh,['Formal_Hours','Formal Hours']),opa=col(oh,['Preassigned_Auditor_Email']),oas=col(oh,['Allow_Self_Planning']),oup=col(oh,['Updated_At','Updated At']),ocl=col(oh,['Closed_At','Closed At']),osrc=col(oh,['Source_Audit_ID']);
    const lh=links[0]||[],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),llu=col(lh,['Unlinked_At','Unlinked At']);
    if([oi,ocs,ocu,osc,ost,la,lo,ls].some(x=>x<0))throw new Error('MODEL_C_COMPLETE_SCHEMA_INVALID');
    const activeLinks=[],seenActiveObIds=new Set();for(let i=1;i<links.length;i++)if(val(links[i],la)===auditId&&val(links[i],ls).toUpperCase()==='ACTIVE'){const obId=val(links[i],lo);if(!obId||seenActiveObIds.has(obId))continue;seenActiveObIds.add(obId);activeLinks.push({row:i+1,obId,values:links[i].slice()});}
    if(!activeLinks.length){
      if(!existingLogRow)throw new Error('MODEL_C_NO_ACTIVE_OBLIGATIONS_FOR_COMPLETE');
      const deleteStarted=Date.now();await sheetsDeleteRow('Audit planning',found.sourceRow);const deleteMs=Date.now()-deleteStarted;
      const recoveredSuccessorRows=directExistingSuccessorRows(ap,auditId,clean(identity?.email).toLowerCase(),cfgValues,companies);
      const recoveredHours=actorRole==='AUDITOR'&&existingCommittedHours>0?existingCommittedHours:hoursDedicated;
      return{success:true,idempotent:true,recovered:true,auditId,action:'COMPLETE',hoursDedicated:recoveredHours,directCommit:true,owner,successorRows:recoveredSuccessorRows,successorAuditIds:recoveredSuccessorRows.map(r=>r.auditId),readMs,writeMs:existingLogCorrectionMs,deleteMs,totalMs:Date.now()-started};
    }
    const obById=new Map();for(let i=1;i<obs.length;i++)obById.set(val(obs[i],oi),{row:i+1,values:obs[i].slice()});

    const successorItems=[],obligationWrites=[],linkWrites=[];let completedFormalHours=0;
    for(const link of activeLinks){
      const pack=obById.get(link.obId);if(!pack)throw new Error('MODEL_C_ORPHAN_ACTIVE_LINK');
      const rr=pack.values.slice();while(rr.length<oh.length)rr.push('');
      const code=val(rr,osc),def=cfgByCode.get(code)||null;completedFormalHours+=Number(val(rr,ofh))>0?Number(val(rr,ofh)):Number((cfgByCode.get(code)||{}).formalHours||0);
      if(!def)throw new Error('CONFIG_SCOPES_MISSING_'+code);
      if(val(rr,ocu)!==companyUid)throw new Error('MODEL_C_COMPANY_UID_MISMATCH');
      if(def.recurring===true){
        const base=directIsoDate(val(rr,obe));if(!base)throw new Error('RECURRING_BASE_EXPIRY_MISSING_'+code);
        const next=directDateAddYears(base,1),from=directDateAddMonths(next,Number(def.planningFrom||0)),to=directDateAddMonths(next,Number(def.planningTo||0));
        if(!next||!from||!to)throw new Error('SUCCESSOR_WINDOW_INVALID_'+code);
        const apScopeHours=directAuditPlanningScopeHours(h,row,def,code);
        const successorFormalHours=apScopeHours!==null?apScopeHours:(Number(val(rr,ofh))>=0&&clean(val(rr,ofh))!==''?Number(val(rr,ofh)):Number(def.formalHours||0));
        successorItems.push({scopeCode:code,companyScopeId:val(rr,ocs),cycleKey:next,baseExpiry:next,from,to,formalHours:successorFormalHours,preassigned:val(rr,opa),allowSelfPlanning:val(rr,oas)});
      }
      rr[ost]='COMPLETED';if(oup>=0)rr[oup]=stamp;if(ocl>=0)rr[ocl]=stamp;
      obligationWrites.push({range:'Audit_Obligations!A'+pack.row+':'+a1col(oh.length)+pack.row,values:[rr]});
      const lr=link.values.slice();while(lr.length<lh.length)lr.push('');lr[ls]='INACTIVE';if(llu>=0)lr[llu]=stamp;
      linkWrites.push({range:'Audit_Visit_Obligations!A'+link.row+':'+a1col(lh.length)+link.row,values:[lr]});
    }

    const groups=directSuccessorGroups(successorItems),newPlanningRows=[],newObRows=[],newLinkRows=[],successorIds=[];
    const csH=companyScopes[0]||[],csId=col(csH,['Company_Scope_ID','Company Scope ID']),csBirthday=col(csH,['Certificate_Birthday','Certificate Birthday']),birthdayById=new Map();
    for(let i=1;i<companyScopes.length;i++)birthdayById.set(val(companyScopes[i],csId),directIsoDate(val(companyScopes[i],csBirthday)));
    const apH=ap[0]||[],source=row.slice(),auditIdIx=col(apH,['Audit ID','Audit_ID','AuditId','Audit Id']);
    for(let g=0;g<groups.length;g++){
      const group=groups[g],newId=auditId+'_NEXT_'+String(g+1)+'_'+createHash('md5').update(auditId+'|'+group.items.map(x=>x.scopeCode+'|'+x.cycleKey).join('|')).digest('hex').slice(0,10);
      const existingAp=ap.slice(1).some(r=>val(r,auditIdIx)===newId);
      if(!existingAp){
        const nr=source.slice();for(let i=0;i<nr.length;i++)nr[i]=nr[i]??'';
        for(const s of cfg){const ix=col(apH,[s.slotKey,s.scopeCode,s.displayName]);if(ix>=0)nr[ix]='';const durationIx=col(apH,['Duration '+s.slotKey,'Duration '+s.scopeCode]);if(durationIx>=0)nr[durationIx]='';}
        let total=0,expiry='',birthday='';
        for(const item of group.items){
          const def=cfgByCode.get(item.scopeCode)||{},six=col(apH,[def.slotKey,item.scopeCode,def.displayName]);if(six>=0)nr[six]='x';
          const dix=col(apH,['Duration '+def.slotKey,'Duration '+item.scopeCode]);if(dix>=0)nr[dix]=item.formalHours;
          total+=Number(item.formalHours||0);if(!expiry||item.baseExpiry<expiry)expiry=item.baseExpiry;if(!birthday)birthday=birthdayById.get(item.companyScopeId)||'';
        }
        directSetByHeader(apH,nr,['Audit ID'],newId);directSetByHeader(apH,nr,['Status'],'Pending Planning');directSetByHeader(apH,nr,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'],'');
        directSetByHeader(apH,nr,['Date - Planned','Date planned'],'');directSetByHeader(apH,nr,['Date - Approved','Date approved'],'');directSetByHeader(apH,nr,['Date accepted','Date - Accepted'],'');
        directSetByHeader(apH,nr,['Planning JSON','PlanningJSON','Planning'],'');directSetByHeader(apH,nr,['Audit days textual'],'');directSetByHeader(apH,nr,['Hours planned','Planned hours'],'');
        directSetByHeader(apH,nr,['Last manager decision'],'');directSetByHeader(apH,nr,['Last decision timestamp'],'');directSetByHeader(apH,nr,['Status since'],'');directSetByHeader(apH,nr,['Manager comment (last)'],'');directSetByHeader(apH,nr,['Last auditor decision'],'');directSetByHeader(apH,nr,['Last auditor decision timestamp'],'');directSetByHeader(apH,nr,['Auditor comment (last)'],'');
        directSetByHeader(apH,nr,['Total audit time in hours'],total);directSetByHeader(apH,nr,['Date - Will Expire'],expiry);directSetByHeader(apH,nr,['Extended Expiration Date'],expiry);
        directSetByHeader(apH,nr,['Birthdate certificate'],birthday);directSetByHeader(apH,nr,['Planning window from'],group.from);directSetByHeader(apH,nr,['Planning window to'],group.to);
        directSetByHeader(apH,nr,['Scopes_List'],group.items.map(x=>x.scopeCode).join(', '));directSetByHeader(apH,nr,['Extension applied'],'');
        newPlanningRows.push(nr);
      }
      successorIds.push(newId);
      for(const item of group.items){
        let existingOb=null;
        for(let oi2=1;oi2<obs.length;oi2++){
          const rr0=obs[oi2];
          if(val(rr0,ocs)===item.companyScopeId&&directIsoDate(val(rr0,ock))===item.cycleKey&&val(rr0,ots)==='CERTIFICATE_LIFECYCLE'){
            existingOb={id:val(rr0,oi),row:oi2+1,values:rr0};break;
          }
        }
        const obId=existingOb?.id||('OBL_'+createHash('sha256').update(newId+'|'+item.companyScopeId+'|'+item.cycleKey).digest('hex').slice(0,32));
        if(!existingOb){
          const obj={};for(const hh of oh)obj[hh]='';
          Object.assign(obj,{Obligation_ID:obId,Company_Scope_ID:item.companyScopeId,Company_UID:companyUid,ScopeCode:item.scopeCode,Cycle_Key:item.cycleKey,Trigger_Source:'CERTIFICATE_LIFECYCLE',Obligation_State:'OPEN',Base_Expiry_Date:item.baseExpiry,Effective_Expiry_Date:item.baseExpiry,Planning_Window_From:item.from,Planning_Window_To:item.to,Formal_Hours:item.formalHours,Preassigned_Auditor_Email:item.preassigned,Allow_Self_Planning:item.allowSelfPlanning,Source_Audit_ID:newId,Created_At:stamp,Updated_At:stamp,Closed_At:''});
          newObRows.push(directAppendObjectRow(oh,obj));
        }
        const activeLinkExists=links.slice(1).some(r=>val(r,la)===newId&&val(r,lo)===obId&&val(r,ls).toUpperCase()==='ACTIVE');
        if(!activeLinkExists){
          const linkObj={};for(const hh of lh)linkObj[hh]='';Object.assign(linkObj,{Audit_ID:newId,Obligation_ID:obId,Link_State:'ACTIVE',Linked_At:stamp,Unlinked_At:''});newLinkRows.push(directAppendObjectRow(lh,linkObj));
        }
      }
    }

    const ah=av[0]||[],aid1=col(ah,['Audit_ID_1','Audit ID 1']),aid2=col(ah,['Audit_ID_2','Audit ID 2']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),available=col(ah,['Available']),lu=col(ah,['Last_Updated']),availabilityWrites=[];
    for(let i=1;i<av.length;i++){const rr=(av[i]||[]).slice();while(rr.length<ah.length)rr.push('');let changed=false;if(aid1>=0&&clean(rr[aid1])===auditId){rr[aid1]='';if(s1>=0)rr[s1]='';if(e1>=0)rr[e1]='';if(st1>=0)rr[st1]='';changed=true;}if(aid2>=0&&clean(rr[aid2])===auditId){rr[aid2]='';if(s2>=0)rr[s2]='';if(e2>=0)rr[e2]='';if(st2>=0)rr[st2]='';changed=true;}if(changed){const has1=aid1>=0&&clean(rr[aid1]),has2=aid2>=0&&clean(rr[aid2]),soft=directSoftAvailabilityStatus(st1>=0?rr[st1]:'')||directSoftAvailabilityStatus(st2>=0?rr[st2]:'');if(available>=0)rr[available]=(has1||has2||soft)?'NO':'YES';if(lu>=0)rr[lu]=now.slice(0,16);availabilityWrites.push({range:'Auditor Availability!A'+(i+1)+':'+a1col(ah.length)+(i+1),values:[rr]});}}

    if(!logH.length)throw new Error('LOG_REALIZED_SCHEMA_MISSING');
    const managerEmailForLog=actorRole==='MANAGER'?actorEmail:'planning@agriqa.es';
    const logRow=directCompletedLogRow(logH,found,hoursDedicated,managerEmailForLog,now,completedFormalHours);
    const writeStarted=Date.now(),allWrites=[...obligationWrites,...linkWrites,...availabilityWrites];
    if(!existingLogRow)allWrites.push({range:'Log realized audits!A'+(log.length+1)+':'+a1col(logH.length)+(log.length+1),values:[logRow]});
    for(let i=0;i<newPlanningRows.length;i++)allWrites.push({range:'Audit planning!A'+(ap.length+i+1)+':'+a1col(apH.length)+(ap.length+i+1),values:[newPlanningRows[i]]});
    for(let i=0;i<newObRows.length;i++)allWrites.push({range:'Audit_Obligations!A'+(obs.length+i+1)+':'+a1col(oh.length)+(obs.length+i+1),values:[newObRows[i]]});
    for(let i=0;i<newLinkRows.length;i++)allWrites.push({range:'Audit_Visit_Obligations!A'+(links.length+i+1)+':'+a1col(lh.length)+(links.length+i+1),values:[newLinkRows[i]]});
    if(allWrites.length)await sheetsValuesBatchUpdate(allWrites);
    const writeMs=Date.now()-writeStarted+existingLogCorrectionMs;

    const deleteStarted=Date.now();await sheetsDeleteRow('Audit planning',found.sourceRow);const deleteMs=Date.now()-deleteStarted;

    const minuteStamp=now.slice(0,16),trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,companyUid,actorEmail,actorRole,beforeStatus,afterStatus:'Completed',source:owner,timestamp:now,action:'COMPLETE',hoursDedicated,successorAuditIds:successorIds};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Completed').digest('hex');
    const queueRows=[[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})]];
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;

    const successorRows=newPlanningRows.map((nr,i)=>{const mapped=managerOpen([apH,nr],actorEmail,cfgValues,companies).rows[0];if(mapped)mapped.sourceRow=ap.length+i+1;return mapped;}).filter(Boolean);
    return{success:true,auditId,action:'COMPLETE',beforeStatus,newStatus:'Completed',afterStatus:'COMPLETED',afterStatusDisplay:'Completed',hoursDedicated,directCommit:true,owner,successorAuditIds:successorIds,successorRows,managerCorrection,readMs,writeMs,deleteMs,availabilityRows:availabilityWrites.length,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}

async function directManagerCancel(identity,body){
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},reason=clean(options.reason||options.comment),expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!reason)throw new Error('ACTION_REASON_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX483','Auditor Availability!A:P','Auditors!A1:Z256']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[],found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const h=found.h,row=found.row.slice(),statusCol=col(h,['Status']),beforeStatus=statusCol>=0?clean(row[statusCol]):'',beforeKey=directStatusKey(beforeStatus);
    if(!['PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(beforeKey))throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    const assignedCol=col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned']),assignedBefore=assignedCol>=0?clean(row[assignedCol]):'',recipientEmail=directResolveAuditorEmail(vr[2]?.values||[],assignedBefore);
    const company=val(row,col(h,['Company'])),now=isoLocalStamp(),set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    for(const names of [
      ['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'],
      ['Date - Planned','Date – Planned','Date planned','Date Planned'],
      ['Date - Approved','Date – Approved','Date approved','Date Approved'],
      ['Audit days textual'],
      ['Planning JSON','PlanningJSON','Planning'],
      ['Hours planned','Planned hours','Hours Planned']
    ])set(names,'');
    set(['Status'],'Pending Planning');
    set(['Status since'],now);
    set(['Last manager decision'],'CANCEL');
    set(['Last decision timestamp'],now);
    set(['Manager comment (last)'],reason);

    const av=vr[1]?.values||[],ah=av[0]||[],ca=col(ah,['Available']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),id1=col(ah,['Audit_ID_1']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),id2=col(ah,['Audit_ID_2']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),lu=col(ah,['Last_Updated']);
    if(id1<0&&id2<0)throw new Error('AVAILABILITY_SCHEMA_INVALID');
    const writes=[{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}];
    let availabilityRows=0;
    for(let i=1;i<av.length;i++){
      const r=(av[i]||[]).slice();while(r.length<ah.length)r.push('');let changed=false;
      if(id1>=0&&clean(r[id1])===auditId){if(s1>=0)r[s1]='';if(e1>=0)r[e1]='';r[id1]='';if(st1>=0)r[st1]='';changed=true;}
      if(id2>=0&&clean(r[id2])===auditId){if(s2>=0)r[s2]='';if(e2>=0)r[e2]='';r[id2]='';if(st2>=0)r[st2]='';changed=true;}
      if(!changed)continue;
      const has1=id1>=0&&clean(r[id1]),has2=id2>=0&&clean(r[id2]),soft=directSoftAvailabilityStatus(st1>=0?r[st1]:'')||directSoftAvailabilityStatus(st2>=0?r[st2]:'');
      if(ca>=0)r[ca]=(has1||has2||soft)?'NO':'YES';if(lu>=0)r[lu]=now.slice(0,16);
      writes.push({range:'Auditor Availability!A'+(i+1)+':'+a1col(ah.length)+(i+1),values:[r]});availabilityRows++;
    }

    const writeStarted=Date.now();await sheetsValuesBatchUpdate(writes);const writeMs=Date.now()-writeStarted;
    const actorEmail=clean(identity?.email).toLowerCase(),minuteStamp=now.slice(0,16),afterStatus='Pending Planning';
    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,actorEmail,actorRole:'MANAGER',beforeStatus,afterStatus,reason,source:'CLOUD_RUN_DIRECT_MANAGER_CANCEL',timestamp:now,action:'CANCEL'};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|'+afterStatus).digest('hex');
    const queueRows=[[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})]];
    if(recipientEmail){
      const cancelPayload={eventType:'AUDIT_CANCELLED_BY_MANAGER',eventFamily:'RICH_OPERATIONAL',rendererProfile:'RICH_OPERATIONAL',deliveryProfile:'IMMEDIATE_RICH',company,auditId,actor:actorEmail,actorRole:'MANAGER',recipientRole:'AUDITOR',recipientGroup:'AUDITOR',recipientEmail,resultStatus:afterStatus,displayStatus:afterStatus,comment:reason,assignedAuditor:assignedBefore,config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,digestGroup:'AUDITOR_OPERATIONAL',templateFamily:'RICH_OPERATIONAL',templateKeyDefault:'AUDIT_CANCELLED_BY_MANAGER',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:true,requireReason:true}};
      const bodyText=['Audit cancelled by manager','Company: '+company,'Audit ID: '+auditId,'Comment: '+reason].join('\\n'),hash=createHash('md5').update(recipientEmail+'|AUDIT_CANCELLED_BY_MANAGER|'+auditId+'|'+now).digest('hex');
      queueRows.push([minuteStamp,'PENDING','AUDIT_CANCELLED_BY_MANAGER',recipientEmail,auditId,company,'Audit cancelled by manager – '+company+' – '+auditId,bodyText,0,'',hash,'',JSON.stringify({payload:cancelPayload})]);
    }
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}
    const sideEffectMs=Date.now()-sideStarted;
    return{success:true,auditId,action:'CANCEL',beforeStatus,newStatus:'Pending Planning',afterStatus:'PENDING_PLANNING',afterStatusDisplay:'Pending Planning',assignedTo:'',planningJson:'',hoursPlanned:0,directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_CANCEL',readMs,writeMs,writeCount:writes.length,availabilityRows,sideEffectMs,sideEffectQueue,totalMs:Date.now()-started};
  });
}


async function directManagerReject(identity,body){
  const started=Date.now(),auditId=clean(body?.auditId),options=body?.options&&typeof body.options==='object'?body.options:{},reason=clean(options.reason||options.comment),expectedRevision=clean(options.expectedRevision||body?.expectedRevision);
  if(!auditId)throw new Error('AUDIT_ID_REQUIRED');
  if(!reason)throw new Error('ACTION_REASON_REQUIRED');
  return withDirectManagerActionLock(auditId,async()=>{
    const readStarted=Date.now();
    const vr=await sheetsBatchGet([
      'Audit planning!A1:AX483',
      'Auditor Availability!A:P',
      'Auditors!A1:Z256',
      'Rejected audits!A1:Z2000',
      'Companies!A1:AJ686',
      'Config_Scopes!A1:Z128',
      'Company_Scopes!A1:Z1000',
      'Audit_Obligations!A1:Z2000',
      'Audit_Visit_Obligations!A1:H2000'
    ]);
    const readMs=Date.now()-readStarted,ap=vr[0]?.values||[],found=findAudit(ap,auditId);
    const rejected=vr[3]?.values||[],rh=rejected[0]||[],rAuditId=col(rh,['Audit ID']);
    if(!found){
      const already=rAuditId>=0&&rejected.slice(1).some(r=>val(r,rAuditId)===auditId);
      if(already)return{success:true,idempotent:true,auditId,action:'REJECT',newStatus:'Rejected',afterStatus:'REJECTED',afterStatusDisplay:'Rejected',directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_REJECT',readMs,totalMs:Date.now()-started};
      throw new Error('AUDIT_NOT_FOUND');
    }
    const h=found.h,row=found.row.slice(),beforeStatus=val(row,col(h,['Status'])),beforeKey=directStatusKey(beforeStatus);
    if(!['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(beforeKey))throw new Error('STATUS_TRANSITION_BLOCKED');
    const revision=directRowRevision(h,row);if(expectedRevision&&revision!==expectedRevision)throw new Error('MANAGER_ACTION_SOURCE_REVISION_CONFLICT');
    const company=val(row,col(h,['Company'])),location=val(row,col(h,['Location'])),companyUid=val(row,col(h,['Company_UID','Company UID','CompanyUid']));
    if(!companyUid)throw new Error('COMPANY_UID_REQUIRED');
    const assignedBefore=val(row,col(h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])),preassigned=val(row,col(h,['Preassigned Auditor','Preassigned auditor']));
    const datePlanned=dateOnly(val(row,col(h,['Date - Planned','Date planned','Date Planned']))),dateApproved=dateOnly(val(row,col(h,['Date - Approved','Date approved','Date Approved'])));
    const actorEmail=clean(identity?.email).toLowerCase(),recipientEmail=directResolveAuditorEmail(vr[2]?.values||[],assignedBefore),now=isoLocalStamp(),minuteStamp=now.slice(0,16);

    const cfg=scopeCatalog(vr[5]?.values||[]),scopes=scopesForAudit(found,cfg),scopeText=scopes.join('; ');

    const links=vr[8]?.values||[],lh=links[0]||[],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);
    const obs=vr[7]?.values||[],oh=obs[0]||[],oi=col(oh,['Obligation_ID','Obligation ID']),ocs=col(oh,['Company_Scope_ID','Company Scope ID']),ocu=col(oh,['Company_UID','Company UID']),osc=col(oh,['ScopeCode','Scope Code']),ost=col(oh,['Obligation_State','Obligation State']),oup=col(oh,['Updated_At','Updated At']),ocl=col(oh,['Closed_At','Closed At']);
    if([la,lo,ls,oi,ocs,ocu,osc,ost].some(x=>x<0))throw new Error('MODEL_C_REJECT_SCHEMA_INVALID');
    const activeObIds=new Set();
    for(let i=1;i<links.length;i++)if(val(links[i],la)===auditId&&val(links[i],ls).toUpperCase()==='ACTIVE')activeObIds.add(val(links[i],lo));
    if(!activeObIds.size)throw new Error('MODEL_C_NO_ACTIVE_OBLIGATIONS_FOR_REJECT');

    const obligationWrites=[],companyScopeIds=new Set(),rejectedScopeCodes=new Set(),terminalStates=new Set(['COMPLETED','CANCELLED','REJECTED']);
    for(let i=1;i<obs.length;i++){
      const obId=val(obs[i],oi);if(!activeObIds.has(obId))continue;
      if(val(obs[i],ocu)!==companyUid)throw new Error('MODEL_C_COMPANY_UID_MISMATCH');
      const rr=obs[i].slice();while(rr.length<oh.length)rr.push('');
      rr[ost]='REJECTED';if(oup>=0)rr[oup]=now;if(ocl>=0)rr[ocl]=now;
      obligationWrites.push({range:'Audit_Obligations!A'+(i+1)+':'+a1col(oh.length)+(i+1),values:[rr]});
      companyScopeIds.add(val(rr,ocs));rejectedScopeCodes.add(val(rr,osc));
    }
    if(!obligationWrites.length)throw new Error('MODEL_C_ACTIVE_OBLIGATIONS_NOT_FOUND');

    const cs=vr[6]?.values||[],csh=cs[0]||[],csid=col(csh,['Company_Scope_ID','Company Scope ID']),csuid=col(csh,['Company_UID','Company UID']),cscode=col(csh,['ScopeCode','Scope Code']),csactive=col(csh,['Active']),csupdated=col(csh,['Updated_At','Updated At']);
    if([csid,csuid,cscode,csactive].some(x=>x<0))throw new Error('MODEL_C_COMPANY_SCOPES_SCHEMA_INVALID');
    const companyScopeWrites=[];
    for(let i=1;i<cs.length;i++){
      if(!companyScopeIds.has(val(cs[i],csid)))continue;
      if(val(cs[i],csuid)!==companyUid)throw new Error('MODEL_C_COMPANY_SCOPE_UID_MISMATCH');
      const rr=cs[i].slice();while(rr.length<csh.length)rr.push('');rr[csactive]='NO';if(csupdated>=0)rr[csupdated]=now;
      companyScopeWrites.push({range:'Company_Scopes!A'+(i+1)+':'+a1col(csh.length)+(i+1),values:[rr]});
    }
    if(companyScopeWrites.length!==companyScopeIds.size)throw new Error('MODEL_C_COMPANY_SCOPE_NOT_FOUND');

    const av=vr[1]?.values||[],ah=av[0]||[],ca=col(ah,['Available']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),id1=col(ah,['Audit_ID_1']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),id2=col(ah,['Audit_ID_2']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),lu=col(ah,['Last_Updated']);
    if(id1<0&&id2<0)throw new Error('AVAILABILITY_SCHEMA_INVALID');
    const availabilityWrites=[];let availabilityRows=0;
    for(let i=1;i<av.length;i++){
      const rr=(av[i]||[]).slice();while(rr.length<ah.length)rr.push('');let changed=false;
      if(id1>=0&&clean(rr[id1])===auditId){if(s1>=0)rr[s1]='';if(e1>=0)rr[e1]='';rr[id1]='';if(st1>=0)rr[st1]='';changed=true;}
      if(id2>=0&&clean(rr[id2])===auditId){if(s2>=0)rr[s2]='';if(e2>=0)rr[e2]='';rr[id2]='';if(st2>=0)rr[st2]='';changed=true;}
      if(!changed)continue;
      const has1=id1>=0&&clean(rr[id1]),has2=id2>=0&&clean(rr[id2]),soft=directSoftAvailabilityStatus(st1>=0?rr[st1]:'')||directSoftAvailabilityStatus(st2>=0?rr[st2]:'');
      if(ca>=0)rr[ca]=(has1||has2||soft)?'NO':'YES';if(lu>=0)rr[lu]=now.slice(0,16);
      availabilityWrites.push({range:'Auditor Availability!A'+(i+1)+':'+a1col(ah.length)+(i+1),values:[rr]});availabilityRows++;
    }

    const companies=vr[4]?.values||[],ch=companies[0]||[],cuid=col(ch,['Company_UID','Company UID','CompanyUID']),cname=col(ch,['Company']),cactive=col(ch,['Active Audits','Active audits','Active audit','ActiveAudit','Active_Audits']);
    let companyWrite=null;
    if(cactive>=0){
      const remainingActive=obs.slice(1).some((r,idx)=>{
        if(val(r,ocu)!==companyUid)return false;
        const obId=val(r,oi),state=activeObIds.has(obId)?'REJECTED':val(r,ost).toUpperCase();
        return !terminalStates.has(state);
      });
      for(let i=1;i<companies.length;i++){
        if((cuid>=0&&val(companies[i],cuid)===companyUid)||(cname>=0&&val(companies[i],cname).toLowerCase()===company.toLowerCase())){
          const rr=companies[i].slice();while(rr.length<ch.length)rr.push('');rr[cactive]=remainingActive?'Yes':'No';
          companyWrite={range:'Companies!A'+(i+1)+':'+a1col(ch.length)+(i+1),values:[rr]};break;
        }
      }
    }

    let archiveAlready=false;
    if(rAuditId>=0)archiveAlready=rejected.slice(1).some(r=>val(r,rAuditId)===auditId);
    const archiveStarted=Date.now();
    if(!archiveAlready){
      if(!rh.length)throw new Error('REJECTED_AUDITS_SCHEMA_MISSING');
      const out=new Array(rh.length).fill(''),setR=(names,value)=>{const i=col(rh,names);if(i>=0)out[i]=value;};
      setR(['Company'],company);setR(['Location'],location);setR(['Scopes'],scopeText);setR(['Preassigned Auditor'],preassigned);setR(['Assigned to'],assignedBefore);
      setR(['Date - Planned'],datePlanned);setR(['Date - Approved'],dateApproved);setR(['Status'],beforeStatus);setR(['Reason / Comment'],reason);setR(['Date - Rejected'],now);
      setR(['Audit ID'],auditId);setR(['Manager_Email','Manager Email'],actorEmail);setR(['Company_UID','Company UID'],companyUid);
      await sheetsValuesAppend('Rejected audits!A:'+a1col(rh.length),[out]);
    }
    const archiveMs=Date.now()-archiveStarted;

    const writeData=[...obligationWrites,...companyScopeWrites,...availabilityWrites];if(companyWrite)writeData.push(companyWrite);
    const writeStarted=Date.now();if(writeData.length)await sheetsValuesBatchUpdate(writeData);const writeMs=Date.now()-writeStarted;

    const deleteStarted=Date.now();await sheetsDeleteRow('Audit planning',found.sourceRow);const deleteMs=Date.now()-deleteStarted;

    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,company,actorEmail,actorRole:'MANAGER',beforeStatus,afterStatus:'Rejected',reason,source:'CLOUD_RUN_DIRECT_MANAGER_REJECT',timestamp:now,action:'REJECT',scopes:[...rejectedScopeCodes]};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|Rejected').digest('hex');
    const queueRows=[[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,company,'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})]];
    if(recipientEmail){
      const payload={eventType:'AUDIT_REJECTED_BY_MANAGER',eventFamily:'RICH_OPERATIONAL',rendererProfile:'RICH_OPERATIONAL',deliveryProfile:'IMMEDIATE_RICH',company,companyUid,auditId,actor:actorEmail,actorRole:'MANAGER',recipientRole:'AUDITOR',recipientGroup:'AUDITOR',recipientEmail,resultStatus:'Rejected',displayStatus:'Rejected',comment:reason,scopes:[...rejectedScopeCodes],config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,digestGroup:'AUDITOR_OPERATIONAL',templateFamily:'RICH_OPERATIONAL',templateKeyDefault:'AUDIT_REJECTED_BY_MANAGER',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:true,requireReason:true}};
      const bodyText=['Audit rejected by manager','Company: '+company,'Audit ID: '+auditId,'Scopes: '+[...rejectedScopeCodes].join(', '),'Comment: '+reason].join('\\n'),hash=createHash('md5').update(recipientEmail+'|AUDIT_REJECTED_BY_MANAGER|'+auditId+'|'+now).digest('hex');
      queueRows.push([minuteStamp,'PENDING','AUDIT_REJECTED_BY_MANAGER',recipientEmail,auditId,company,'Audit rejected by manager – '+company+' – '+auditId,bodyText,0,'',hash,'',JSON.stringify({payload})]);
    }
    let sideEffectQueue={success:true};const sideStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',queueRows);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)}}const sideEffectMs=Date.now()-sideStarted;

    return{success:true,auditId,action:'REJECT',beforeStatus,newStatus:'Rejected',afterStatus:'REJECTED',afterStatusDisplay:'Rejected',reason,directCommit:true,owner:'CLOUD_RUN_DIRECT_MANAGER_REJECT',scopesRejected:[...rejectedScopeCodes],companyScopesDeactivated:companyScopeWrites.length,obligationsRejected:obligationWrites.length,availabilityRows,archiveMs,archiveAlready,writeMs,deleteMs,sideEffectMs,sideEffectQueue,readMs,totalMs:Date.now()-started};
  });
}

const DIRECT_PLAN_LOCKS=new Map();
async function withDirectPlanLock(auditId,fn){
  // PLAN mutates shared auditor/date capacity. Serialize all PLAN commits inside
  // the single-instance DEV service so two different audits cannot both claim
  // the same free Availability slot after concurrent reads.
  const key='__GLOBAL_MANAGER_PLAN__',prev=DIRECT_PLAN_LOCKS.get(key)||Promise.resolve();let release;
  const gate=new Promise(r=>release=r),chain=prev.then(()=>gate);DIRECT_PLAN_LOCKS.set(key,chain);await prev;
  try{return await fn();}finally{release();if(DIRECT_PLAN_LOCKS.get(key)===chain)DIRECT_PLAN_LOCKS.delete(key);}
}
function directPlanNormBlocks(raw){
  const out=[];for(const x of Array.isArray(raw)?raw:[]){const date=dateOnly(x?.date),start=clean(x?.start),end=clean(x?.end),executionType=clean(x?.executionType||x?.workType||'ONSITE').toUpperCase()==='OFFSITE'?'OFFSITE':'ONSITE',execLoc=executionType==='OFFSITE'?'':(clean(x?.execLoc||x?.executionLocation||x?.location||'HQ')||'HQ'),slotComment=clean(x?.slotComment||x?.comment);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))throw new Error('PLANNING_BLOCK_INVALID');
    const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);if(sh<0||sh>23||eh<0||eh>23||![0,15,30,45].includes(sm)||![0,15,30,45].includes(em))throw new Error('PLANNING_BLOCK_QUARTER_HOUR_REQUIRED');const startMin=sh*60+sm,endMin=eh*60+em,hours=(endMin-startMin)/60;if(!(hours>0))throw new Error('PLANNING_BLOCK_INVALID');
    out.push({date,start,end,hours,executionType,execLoc,slotComment});
  }out.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.end.localeCompare(b.end));return out;
}
function overlaps(a,b){return clean(a.start)<clean(b.end)&&clean(b.start)<clean(a.end);}
async function visitCompositionPlan(targetAuditId,memberAuditIds,obValues,linkValues){
  const members=new Set((memberAuditIds||[]).map(clean).filter(Boolean)),out={targetAuditId:clean(targetAuditId),moves:[],sourceAuditIds:[],obligationIds:[]};if(!out.targetAuditId||!members.size)return out;if(!obValues?.length||!linkValues?.length)return out;const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),ou=col(oh,['Company_UID','Company UID']),os=col(oh,['Obligation_State','Obligation State']),obById=new Map();for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']),activeByOb=new Map();for(let i=1;i<linkValues.length;i++){const r=linkValues[i],obId=val(r,lo);if(val(r,ls).toUpperCase()!=='ACTIVE'||!obId)continue;if(activeByOb.has(obId))throw new Error('VISIT_OBLIGATION_MULTIPLE_ACTIVE_LINKS');activeByOb.set(obId,{row:r,rowIndex:i+1,auditId:val(r,la),obligationId:obId});}let companyUid='';for(const x of activeByOb.values()){if(!members.has(x.auditId))continue;const ob=obById.get(x.obligationId);if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;const uid=val(ob,ou);if(companyUid&&uid&&uid!==companyUid)throw new Error('VISIT_COMPOSITION_COMPANY_MISMATCH');if(uid)companyUid=uid;out.obligationIds.push(x.obligationId);if(x.auditId!==out.targetAuditId)out.moves.push({sourceAuditId:x.auditId,obligationId:x.obligationId,oldLinkRow:x.rowIndex});}out.sourceAuditIds=[...new Set(out.moves.map(x=>x.sourceAuditId))];for(const sourceAuditId of out.sourceAuditIds){const active=[...activeByOb.values()].filter(x=>x.auditId===sourceAuditId&&!['COMPLETED','CANCELLED','REJECTED'].includes(val(obById.get(x.obligationId)||[],os).toUpperCase())),moving=new Set(out.moves.filter(x=>x.sourceAuditId===sourceAuditId).map(x=>x.obligationId));if(active.some(x=>!moving.has(x.obligationId)))throw new Error('VISIT_COMPOSITION_SOURCE_VISIT_NOT_EMPTY');}if(!out.obligationIds.length)throw new Error('VISIT_COMPOSITION_NO_ACTIVE_OBLIGATIONS');return out;
}

function directPlanningCommit(identity,body){
  const started=Date.now(),auditId=clean(body?.auditId),auditorEmail=clean(body?.auditorEmail).toLowerCase(),auditorName=clean(body?.auditorName),sourceRevision=clean(body?.sourceRevision);
  if(!auditId||!auditorEmail)throw new Error('PLANNING_REQUIRED_FIELDS_MISSING');
  const requested=directPlanNormBlocks(body?.blocks);if(!requested.length)throw new Error('PLANNING_REQUIRED_FIELDS_MISSING');if(new Set(requested.map(b=>b.date)).size>5)throw new Error('PLANNING_MAX_5_DAYS');for(let i=0;i<requested.length;i++)for(let j=i+1;j<requested.length;j++)if(requested[i].date===requested[j].date&&overlaps(requested[i],requested[j]))throw new Error('PLANNING_BLOCKS_OVERLAP');
  return withDirectPlanLock(auditId,async()=>{
    const readStarted=Date.now(),vr=await sheetsBatchGet(['Audit planning!A1:AX483','Auditors!A1:Z256','Auditor Availability!A:P','Concept Reservations!A1:P256','Config_Scopes!A1:Z128','Companies!A1:AJ686','Audit_Obligations!A1:Z1000','Audit_Visit_Obligations!A1:H1000']),readMs=Date.now()-readStarted;
    const ap=vr[0]?.values||[],found=findAudit(ap,auditId);if(!found)throw new Error('AUDIT_NOT_FOUND');
    const catalog=scopeCatalog(vr[4]?.values||[]),audit=project(found,catalog,vr[1]?.values||[]),companyCtx=companyPlanningContext(vr[5]?.values||[],audit.companyUid,audit.company),allowedExecLocs=new Set((companyCtx.locations||[]).map(x=>clean(x.code||x.name)).filter(Boolean));if(requested.some(b=>b.executionType==='ONSITE'&&!allowedExecLocs.has(clean(b.execLoc))))throw new Error('PLANNING_EXECUTION_LOCATION_INVALID');
    const currentStatus=clean(audit.status).toUpperCase().replace(/[\s-]+/g,'_'),currentPlanning=blocks(found.row[col(found.h,['Planning JSON','PlanningJSON','Planning'])]),sameBlocks=currentPlanning.length===requested.length&&currentPlanning.every((b,i)=>dateOnly(b?.date)===requested[i].date&&clean(b?.start)===requested[i].start&&clean(b?.end)===requested[i].end&&clean(b?.executionType||b?.workType||'ONSITE').toUpperCase()===requested[i].executionType&&clean(b?.execLoc||b?.executionLocation||b?.location||'HQ')===clean(requested[i].execLoc||'HQ')&&clean(b?.slotComment||b?.comment)===clean(requested[i].slotComment)),currentAssigned=clean(found.row[col(found.h,['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'])]).toLowerCase();
    if(currentStatus==='APPROVED'&&currentAssigned===auditorEmail&&sameBlocks)return{success:true,idempotent:true,auditId,newStatus:'Approved',assignedTo:auditorEmail,planningJson:clean(found.row[col(found.h,['Planning JSON','PlanningJSON','Planning'])]),totalMs:Date.now()-started,readMs,writeMs:0,sideEffectMs:0,sideEffectQueue:{success:true,skipped:true,reason:'IDEMPOTENT_REPLAY'},owner:'CLOUD_RUN_DIRECT_SHEETS_MANAGER_PLAN'};
    if(sourceRevision&&sourceRevision!==clean(audit.sourceRevision))throw new Error('PLANNING_SOURCE_REVISION_CONFLICT');
    if(currentStatus!=='PENDING_PLANNING')throw new Error('STATUS_TRANSITION_BLOCKED');
    if(!audit.candidateAuditors.some(a=>clean(a.email).toLowerCase()===auditorEmail))throw new Error('AUDITOR_NOT_HARD_QUALIFIED');
    const execution=executionConstraint(auditId,catalog,vr[6]?.values||[],vr[7]?.values||[]),from=dateOnly(audit.planningWindowFrom),to=dateOnly(audit.planningWindowTo);
    if(execution.mustCompleteBy&&requested.some(b=>b.date>execution.mustCompleteBy)&&body?.executionExceptionApproved!==true)throw new Error('EXECUTION_DEADLINE_APPROVAL_REQUIRED');
    if(requested.some(b=>(from&&b.date<from)||(to&&b.date>to)))throw new Error('PLANNING_WINDOW_BLOCKED');
    const total=requested.reduce((s,b)=>s+b.hours,0),formalTarget=Math.round(Number(audit.formalHours||audit.requiredHours||0)*100)/100,offsiteHours=Math.round(requested.filter(b=>b.executionType==='OFFSITE').reduce((s,b)=>s+b.hours,0)*100)/100,offsitePolicy=audit.offsitePolicy||offsitePolicyForScopes(catalog,audit.scopes||[]);if(total+1e-9<formalTarget)throw new Error('PLANNED_HOURS_BELOW_FORMAL_HOURS');if(total-formalTarget>1e-9)throw new Error('PLANNED_HOURS_ABOVE_FORMAL_HOURS');if(offsiteHours>0&&offsitePolicy.requiresScopeAllocation)throw new Error('OFFSITE_MULTI_SCOPE_ALLOCATION_REQUIRED');if(offsiteHours-Number(offsitePolicy.maxOffsiteHours||0)>1e-9)throw new Error('OFFSITE_HOURS_ABOVE_SCOPE_MAX');const requestedVisitMembers=Array.isArray(body?.visitMembers)?body.visitMembers:[],requestedVisitAuditIds=[...new Set([auditId,...(Array.isArray(body?.visitAuditIds)?body.visitAuditIds:[]),...requestedVisitMembers.map(x=>x?.auditId)].map(clean).filter(Boolean))];if(requestedVisitAuditIds.some(x=>x!==auditId)){const companySet=ap.slice(1).map((row,i)=>({h:ap[0],row,sourceRow:i+2})).map(x=>project(x,catalog,vr[1]?.values||[])).filter(x=>x.companyUid===audit.companyUid),byId=new Map(companySet.map(x=>[x.auditId,x])),memberById=new Map(requestedVisitMembers.map(x=>[clean(x?.auditId),x]));for(const relatedId of requestedVisitAuditIds){if(relatedId===auditId)continue;const related=byId.get(relatedId);if(!related)throw new Error('VISIT_RELATED_AUDIT_NOT_FOUND');const member=memberById.get(relatedId);if(!member||!clean(member.sourceRevision))throw new Error('VISIT_RELATED_SOURCE_REVISION_REQUIRED');if(clean(member.sourceRevision)!==clean(related.sourceRevision))throw new Error('VISIT_RELATED_SOURCE_REVISION_CONFLICT');if(clean(related.status).toUpperCase().replace(/[\s-]+/g,'_')!=='PENDING_PLANNING')throw new Error('VISIT_RELATED_AUDIT_NOT_PENDING_PLANNING');const relatedExecution=executionConstraint(relatedId,catalog,vr[6]?.values||[],vr[7]?.values||[]),relatedFrom=dateOnly(related.planningWindowFrom),relatedTo=dateOnly(related.planningWindowTo);if(requested.some(b=>(relatedFrom&&b.date<relatedFrom)||(relatedTo&&b.date>relatedTo)))throw new Error('VISIT_RELATED_PLANNING_WINDOW_BLOCKED');if(relatedExecution.mustCompleteBy&&requested.some(b=>b.date>relatedExecution.mustCompleteBy)&&body?.executionExceptionApproved!==true)throw new Error('VISIT_RELATED_EXECUTION_DEADLINE_APPROVAL_REQUIRED');}if(requestedVisitAuditIds.length>1){const composition=visitCompositionPlan(auditId,requestedVisitAuditIds,vr[6]?.values||[],vr[7]?.values||[]);throw new Error('VISIT_COMBINED_COMMIT_NOT_YET_CANONICAL');}}

    const av=vr[2]?.values||[],ah=av[0]||[],cd=col(ah,['Date']),ce=col(ah,['Auditor_Email','Auditor Email','Email','E-mail']),ca=col(ah,['Available']),s1=col(ah,['First_Audit_Start_Time']),e1=col(ah,['First_Audit_End_Time']),id1=col(ah,['Audit_ID_1']),s2=col(ah,['Second_Audit_Start_Time']),e2=col(ah,['Second_Audit_End_Time']),id2=col(ah,['Audit_ID_2']),st1=col(ah,['Status_1']),st2=col(ah,['Status_2']),lu=col(ah,['Last_Updated']);
    if([cd,ce,ca,s1,e1,id1,s2,e2,id2,st1,st2].some(x=>x<0))throw new Error('AVAILABILITY_SCHEMA_INVALID');
    const avRows=av.slice(1).map((row,i)=>({row:row.slice(),sheetRow:i+2,date:dateOnly(row[cd]),email:clean(row[ce]).toLowerCase()}));
    const touched=new Map();
    for(const x of avRows){if(x.email!==auditorEmail)continue;let changed=false;if(clean(x.row[id1])===auditId){x.row[s1]='';x.row[e1]='';x.row[id1]='';x.row[st1]='';changed=true;}if(clean(x.row[id2])===auditId){x.row[s2]='';x.row[e2]='';x.row[id2]='';x.row[st2]='';changed=true;}if(changed)touched.set(x.sheetRow,x);}
    for(const b of requested){
      let x=avRows.find(r=>r.email===auditorEmail&&r.date===b.date);if(!x){const width=ah.length,row=new Array(width).fill('');row[cd]=b.date;row[ce]=auditorEmail;row[ca]='YES';if(lu>=0)row[lu]=isoLocalStamp();x={row,sheetRow:av.length+1,date:b.date,email:auditorEmail,isNew:true};avRows.push(x);av.push(row);}
      const slots=[{s:s1,e:e1,id:id1,st:st1},{s:s2,e:e2,id:id2,st:st2}];
      for(const z of slots){const other=clean(x.row[z.id]);if(other&&other!==auditId&&overlaps(b,{start:clean(x.row[z.s]),end:clean(x.row[z.e])}))throw new Error('AVAILABILITY_COLLISION_'+b.date);}
      const hardNo=!yes(x.row[ca])&&slots.some(z=>!clean(x.row[z.id])&&clean(x.row[z.st])&&!/^(DEFAULT_|MANUAL_|SYSTEM_DEFAULT|USER_MANUAL|CALENDAR|CALENDER)/i.test(clean(x.row[z.st])));
      if(hardNo)throw new Error('AVAILABILITY_HARD_BLOCK_'+b.date);
      let z=slots.find(q=>!clean(x.row[q.id]));if(!z)throw new Error('AVAILABILITY_CAPACITY_'+b.date);
      x.row[z.s]=b.start;x.row[z.e]=b.end;x.row[z.id]=auditId;x.row[z.st]='Manager Planned';x.row[ca]='NO';if(lu>=0)x.row[lu]=isoLocalStamp();touched.set(x.sheetRow,x);
    }

    const h=ap[0]||[],row=found.row.slice(),set=(names,value)=>{const i=col(h,names);if(i>=0)row[i]=value;};
    const now=isoLocalStamp(),formalHours=Math.round(Number(audit.formalHours||audit.requiredHours||0)*100)/100,planningJson=JSON.stringify({blocks:requested,formalHours,totalPlannedHours:formalHours,offsiteHours,maxOffsiteHours:Number(offsitePolicy.maxOffsiteHours||0),auditorEmail,auditorName});
    set(['Assigned to'],auditorEmail);set(['Date - Planned'],requested[0].date);set(['Date - Approved'],now.slice(0,10));set(['Status'],'Approved');set(['Hours planned','Planned hours','Hours Planned'],formalHours);set(['Planning JSON'],planningJson);set(['Last manager decision'],'PLAN');set(['Last decision timestamp'],now);set(['Status since'],now);
    const maxTouchedAvailabilityRow=Math.max(0,...[...touched.values()].map(x=>x.sheetRow));if(maxTouchedAvailabilityRow)await sheetsEnsureRows('Auditor Availability',maxTouchedAvailabilityRow);
    const writes=[{range:'Audit planning!A'+found.sourceRow+':'+a1col(h.length)+found.sourceRow,values:[row]}];
    for(const x of touched.values())writes.push({range:'Auditor Availability!A'+x.sheetRow+':'+a1col(ah.length)+x.sheetRow,values:[x.row]});
    const cr=vr[3]?.values||[],ch=cr[0]||[],ci=col(ch,['Audit ID']),cs=col(ch,['State']),cu=col(ch,['Updated At']),cby=col(ch,['Released By']),cat=col(ch,['Released At']),creason=col(ch,['Release Reason']);
    for(let i=1;i<cr.length;i++){const rr=cr[i].slice();if(clean(rr[ci])!==auditId||clean(rr[cs]).toUpperCase()!=='ACTIVE')continue;rr[cs]='RELEASED';if(cu>=0)rr[cu]=now;if(cby>=0)rr[cby]=clean(identity?.email);if(cat>=0)rr[cat]=now;if(creason>=0)rr[creason]='CANONICAL_COMMIT';writes.push({range:'Concept Reservations!A'+(i+1)+':'+a1col(ch.length)+(i+1),values:[rr]});}
    const minuteStamp=now.slice(0,16),beforeStatus='Pending Planning',afterStatus='Approved',actorEmail=clean(identity?.email).toLowerCase();
    const trailPayload={type:'LIFECYCLE_STATUS_CHANGED',auditId,auditNumber:'',company:clean(audit.company),actorEmail,actorRole:'MANAGER',beforeStatus,afterStatus,reason:'',hours:null,source:'CLOUD_RUN_DIRECT_SHEETS_MANAGER_PLAN',timestamp:now,action:'PLAN'};
    const trailBody=JSON.stringify(trailPayload),trailHash=createHash('md5').update('LIFECYCLE_STATUS_CHANGED|'+auditId+'|'+now+'|'+afterStatus).digest('hex');
    const trailRow=[minuteStamp,'AUDIT_TRAIL','LIFECYCLE_STATUS_CHANGED','',auditId,clean(audit.company),'[TRAIL] LIFECYCLE_STATUS_CHANGED :: '+auditId,trailBody,0,'',trailHash,'',JSON.stringify({payload:trailPayload})];
    const plannedPayload={eventType:'AUDIT_PLANNED_BY_MANAGER',eventFamily:'RICH_OPERATIONAL',rendererProfile:'RICH_OPERATIONAL',deliveryProfile:'IMMEDIATE_RICH',company:clean(audit.company),companyUid:clean(audit.companyUid),auditId,actor:actorEmail,actorRole:'MANAGER',recipientRole:'AUDITOR',recipientGroup:'AUDITOR',resultStatus:'Approved',displayStatus:'Pending acceptance',plannedDates:[...new Set(requested.map(x=>x.date))],plannedHours:Math.round(total*100)/100,blocks:requested,scopes:Array.isArray(audit.scopes)?audit.scopes:[],auditorEmail,auditorName,planningJson,config:{active:true,sendEmail:true,logOnly:false,consolidate:false,bufferMinutes:0,digestGroup:'AUDITOR_OPERATIONAL',templateFamily:'RICH_OPERATIONAL',templateKeyDefault:'AUDIT_PLANNED_BY_MANAGER',fromEmail:'planning@agriqa.es',fromName:'Agri Quality Assurance – Audit Planning',replyTo:'',includeComment:true,requireReason:false}};
    const plannedSubject='Audit planned by manager – '+clean(audit.company)+' – '+auditId,plannedBody=['Audit planned by manager','Company: '+clean(audit.company),'Audit ID: '+auditId,'Auditor: '+auditorName+' <'+auditorEmail+'>','Planning: '+requested.map(x=>x.date+' '+x.start+'-'+x.end).join('; '),'Total hours: '+plannedPayload.plannedHours].join('\\n');
    const plannedHash=createHash('md5').update(auditorEmail+'|AUDIT_PLANNED_BY_MANAGER|'+auditId+'|'+planningJson).digest('hex'),plannedRow=[minuteStamp,'PENDING','AUDIT_PLANNED_BY_MANAGER',auditorEmail,auditId,clean(audit.company),plannedSubject,plannedBody,0,'',plannedHash,'',JSON.stringify({payload:plannedPayload})];
    const writeStarted=Date.now();await sheetsValuesBatchUpdate(writes);const writeMs=Date.now()-writeStarted;
    let sideEffectQueue={success:true};const sideEffectStarted=Date.now();try{await sheetsValuesAppend('Notification Queue!A:M',[trailRow,plannedRow]);}catch(e){sideEffectQueue={success:false,error:clean(e?.message||e)};}
    const sideEffectMs=Date.now()-sideEffectStarted;
    return{success:true,auditId,newStatus:'Approved',assignedTo:auditorEmail,planningJson,totalMs:Date.now()-started,directCommit:true,readMs,writeMs,writeCount:writes.length,sideEffectMs,sideEffectQueue,owner:'CLOUD_RUN_DIRECT_SHEETS_MANAGER_PLAN'};
  });
}

async function focused(id){
  const t=Date.now(),s=Date.now();
  const vr=await sheetsBatchGet(['Audit planning!A1:AX483','Auditors!A1:Z256','Auditor Availability!A:P','Concept Reservations!A1:P256','Config_Scopes!A1:Z128','Companies!A1:AJ686','Audit_Obligations!A1:Z1000','Audit_Visit_Obligations!A1:H1000']);
  const sheetMs=Date.now()-s,ap=vr[0]?.values||[],f=findAudit(ap,id);
  if(!f)return{ok:false,error:'AUDIT_NOT_FOUND',timing:{sheetsApiMs:sheetMs,totalMs:Date.now()-t}};
  const p=Date.now(),catalog=scopeCatalog(vr[4]?.values||[]),context=auditContext(ap,catalog),audit=project(f,catalog,vr[1]?.values||[]),relatedOpenAudits=ap.slice(1).map((row,i)=>({h:ap[0],row,sourceRow:i+2})).filter(x=>val(x.row,col(x.h,['Audit ID']))!==id&&val(x.row,col(x.h,['Company_UID','Company UID','CompanyUid']))&&val(x.row,col(x.h,['Company_UID','Company UID','CompanyUid']))===audit.companyUid&&['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(val(x.row,col(x.h,['Status'])).toUpperCase().replace(/[\s-]+/g,'_'))).map(x=>{const z=project(x,catalog,vr[1]?.values||[]);const sameWindow=!!(dateOnly(audit.planningWindowFrom)&&dateOnly(audit.planningWindowTo)&&dateOnly(z.planningWindowFrom)&&dateOnly(z.planningWindowTo)&&dateOnly(audit.planningWindowFrom)<=dateOnly(z.planningWindowTo)&&dateOnly(z.planningWindowFrom)<=dateOnly(audit.planningWindowTo));const missingWindow=!dateOnly(z.planningWindowFrom)||!dateOnly(z.planningWindowTo),pending=z.status==='Pending Planning',alreadyPlanned=!!(z.assignedTo||z.planningJson);return{auditId:z.auditId,status:z.status,scopes:z.scopes,requiredHours:z.requiredHours,planningWindowFrom:dateOnly(z.planningWindowFrom),planningWindowTo:dateOnly(z.planningWindowTo),assignedTo:z.assignedTo,linkCandidate:pending,sameVisitCandidate:pending&&sameWindow,sameVisitBlockedReason:pending&&missingWindow?'NO_SHARED_CANONICAL_WINDOW':'',missingPlanningWindow:missingWindow,planningRelation:pending?'UNPLANNED_RELATED':alreadyPlanned?'ALREADY_PLANNED_RELATED':'RELATED',attentionRequired:pending};}),companyCtx=companyPlanningContext(vr[5]?.values||[],audit.companyUid,audit.company);const companyPlanningSet=[audit,...relatedOpenAudits].map(z=>{const own=z.auditId===audit.auditId,raw=own?audit:z,exec=executionConstraint(raw.auditId,catalog,vr[6]?.values||[],vr[7]?.values||[]),committed=blocks(raw.planningJson),plannedDates=[...new Set(committed.map(b=>dateOnly(b?.date)).filter(Boolean))].sort();const obligationPlanning=obligationPlanningForAudit(raw.auditId,catalog,vr[6]?.values||[],vr[7]?.values||[]);return{auditId:raw.auditId,scopes:raw.scopes||[],status:raw.status,sourceRevision:raw.sourceRevision||'',requiredHours:Number(raw.requiredHours||0),formalHours:Number(raw.formalHours||raw.requiredHours||0),maxOffsiteHours:Number(raw.maxOffsiteHours||maxOffsiteHoursForScopes(catalog,raw.scopes||[])||0),obligations:obligationPlanning,planningWindowFrom:dateOnly(raw.planningWindowFrom),planningWindowTo:dateOnly(raw.planningWindowTo),mustCompleteBy:exec.mustCompleteBy||'',cycleKey:exec.cycleKey||'',plannedDates,planningState:plannedDates.length?'COMMITTED':raw.status==='Pending Planning'?'UNPLANNED':'LIFECYCLE_PLANNED',isPrimary:own};});audit.companyPlanningSet=companyPlanningSet;audit.preferredAuditMonths=companyCtx.preferredAuditMonths;audit.locations=companyCtx.locations;audit.companyContext=companyCtx;audit.relatedOpenAudits=relatedOpenAudits;audit.hasRelatedOpenAudits=relatedOpenAudits.length>0;const execution=executionConstraint(id,catalog,vr[6]?.values||[],vr[7]?.values||[]);audit.cycleKey=execution.cycleKey;audit.mustCompleteBy=execution.mustCompleteBy;audit.executionConstraintSource=execution.source;const emails=audit.candidateAuditors.map(x=>x.email),from=dateOnly(audit.planningWindowFrom)||dateOnly(isoLocalStamp()),deadline=execution.mustCompleteBy,overdue=!!(deadline&&deadline<from),to=dateOnly(audit.planningWindowTo)||(!overdue&&deadline?deadline:dateOnly(new Date(Date.now()+90*86400000).toISOString()));audit.executionDeadlineOverdue=overdue;const availability=availabilityProjection(vr[2]?.values||[],audit.candidateAuditors,from,to,context),reservations=reservationProjection(vr[3]?.values||[],emails,from,to,context);
  return{
    ok:true,
    proof:'AMS_CLOUD_RUN_DIRECT_SHEETS_R8_SESSION_ENFORCED',
    build:BUILD,
    data:{
      period:{from,to},
      audit,
      advisory:{period:{from,to},rows:[{...audit,advisoryState:audit.candidateAuditors.length?'READY':'NO_CANDIDATES',advisoryReason:audit.candidateAuditors.length?'':'NO_HARD_QUALIFIED_AUDITORS',requiresCanonicalRefresh:false,hoursToPlan:null,hoursToPlanState:'DEFERRED'}],candidateAuditorEmails:emails},
      overlays:{period:{from,to},availability:{byAuditorEmail:availability},reservations},
      sourceCounts:{auditPlanning:Math.max(0,ap.length-1),auditors:Math.max(0,(vr[1]?.values||[]).length-1),availability:Math.max(0,(vr[2]?.values||[]).length-1),conceptReservations:Math.max(0,(vr[3]?.values||[]).length-1),configScopes:Math.max(0,(vr[4]?.values||[]).length-1),companies:Math.max(0,(vr[5]?.values||[]).length-1)}
    },
    timing:{sheetsApiMs:sheetMs,projectionMs:Date.now()-p,totalMs:Date.now()-t}
  };
}

http.createServer(async(req,res)=>{if(req.method==='OPTIONS'){if(!ORIGIN)return send(res,403,{ok:false,error:'CORS_DISABLED'});res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','access-control-allow-credentials':'true','vary':'Origin'});return res.end();}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health')return send(res,200,{ok:true,service:'ams-hot-read-proof',build:BUILD,mode:'DIRECT_SHEETS_READ_CANONICAL_GAS_WRITE',ssotConfigured:!!SID,corsConfigured:!!ORIGIN,sessionSecretConfigured:sessionConfigured(),sessionSecretPresent:SESSION_SECRET.length>0,sessionSecretLength:SESSION_SECRET.length,writeUrlConfigured:!!GAS_WRITE_URL,writeBridgeSecretConfigured:WRITE_KEY.length>=32,authState:sessionConfigured()?'SESSION_EXCHANGE_READY':'PENDING_SESSION_SECRET'});
  if(u.pathname==='/planning'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});const id=clean(u.searchParams.get('auditId'));if(!id)return send(res,400,{ok:false,error:'AUDIT_ID_REQUIRED'});if(!GAS_WRITE_URL)return send(res,500,{ok:false,error:'GAS_DEV_WRITE_URL_NOT_CONFIGURED'});const target=new URL(GAS_WRITE_URL);target.searchParams.set('action','planningworkspace');target.searchParams.set('role','Manager');target.searchParams.set('auditId',id);res.writeHead(303,{'location':target.toString(),'cache-control':'no-store'});return res.end();}
  if(u.pathname==='/manager-portal.js'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'});return res.end(MANAGER_PORTAL_JS);}
  if(u.pathname==='/'&&req.method==='GET'){const s=sessionFromRequest(req);if(!s)return html(res,401,'<!doctype html><meta charset="utf-8"><title>AMS DEV</title><h1>AMS DEV</h1><p>Application session required.</p>');if(clean(s.role).toLowerCase()!=='manager')return html(res,403,'<!doctype html><meta charset="utf-8"><title>AMS DEV</title><h1>Role not available in external portal yet</h1>');return html(res,200,MANAGER_PORTAL_HTML);}
  if(u.pathname==='/auth/legacy-handoff'&&req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});const form=new URLSearchParams(raw);try{const identity=await validateLegacyIdentity(form.get('token'),form.get('role'),form.get('deviceId'));if(!identity.ok)return send(res,401,identity);const token=issueSession(identity);res.writeHead(303,{'set-cookie':sessionCookie(token),'location':'/','cache-control':'no-store'});return res.end();}catch(e){return send(res,500,{ok:false,error:'IDENTITY_HANDOFF_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/session/exchange'&&req.method==='POST'){if(req.headers.origin&&(!ORIGIN||req.headers.origin!==ORIGIN))return send(res,403,{ok:false,error:'ORIGIN_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}');}catch{return send(res,400,{ok:false,error:'BAD_JSON'});}try{const identity=await validateLegacyIdentity(b.token,b.role,b.deviceId);if(!identity.ok)return send(res,401,identity);const token=issueSession(identity);return send(res,200,{ok:true,identity:{email:identity.email,role:identity.role},expiresIn:SESSION_TTL_SECONDS},{'set-cookie':sessionCookie(token)});}catch(e){return send(res,500,{ok:false,error:'IDENTITY_EXCHANGE_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/planning/rotation-direct'&&req.method==='GET'){const sess=sessionFromRequest(req);if(!sess)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(sess.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});const auditId=clean(u.searchParams.get('auditId')),auditorEmail=clean(u.searchParams.get('auditorEmail')).toLowerCase();if(!auditId||!auditorEmail)return send(res,400,{ok:false,error:'ROTATION_REQUIRED_FIELDS_MISSING'});try{return send(res,200,await directRotationRead(auditId,auditorEmail));}catch(e){return send(res,500,{ok:false,error:'DIRECT_ROTATION_READ_FAILED',detail:clean(e?.message||e)});}}
  if(u.pathname==='/api/v1/manager/extension-direct'&&req.method==='POST'){
    const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{const out=await directManagerExtension(s,b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_EXTENSION_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/accept-direct'&&req.method==='POST'){
    const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='accept';const out=await directManagerAcceptOnBehalf(s,b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_ACCEPT_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/approve-direct'&&req.method==='POST'){
    const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='approve';const out=await directManagerApprove(s,b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_APPROVE_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/reject-direct'&&req.method==='POST'){
    const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='reject';const out=await directManagerReject(s,b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_REJECT_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/internal/auditor/complete-direct'&&req.method==='POST'){
    if(!WRITE_KEY)return send(res,503,{ok:false,error:'WRITE_BRIDGE_NOT_CONFIGURED'});
    const supplied=clean(req.headers['x-ams-bridge-key']);
    if(!supplied||!safeEq(supplied,WRITE_KEY))return send(res,403,{ok:false,error:'BRIDGE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    const actorEmail=clean(b.actorEmail).toLowerCase();if(!actorEmail)return send(res,400,{ok:false,error:'AUDITOR_EMAIL_REQUIRED'});
    try{b.action='complete';const out=await directAuditorComplete({email:actorEmail,role:'Auditor'},b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_AUDITOR_COMPLETE_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/complete-direct'&&req.method==='POST'){
    const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{b.action='complete';const out=await directManagerComplete(s,b);return send(res,out&&out.success===false?409:200,out);}
    catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_COMPLETE_BLOCKED',detail:clean(e?.message||e)});}
  }
  if(u.pathname==='/api/v1/manager/cancel-direct'&&req.method==='POST'){
    const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});
    if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});
    let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>16384)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});
    let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}
    try{
      b.action='cancel';
      const out=await directManagerCancel(s,b);
      return send(res,out&&out.success===false?409:200,out);
    }catch(e){
      return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_MANAGER_CANCEL_BLOCKED',detail:clean(e?.message||e)});
    }
  }
  if(u.pathname==='/api/v1/planning/direct-commit'&&req.method==='POST'){const s=sessionFromRequest(req);if(!s)return send(res,401,{ok:false,error:'SESSION_REQUIRED'});if(clean(s.role).toLowerCase()!=='manager')return send(res,403,{ok:false,error:'ROLE_FORBIDDEN'});let raw='';for await(const chunk of req)raw+=chunk;if(raw.length>65536)return send(res,413,{ok:false,error:'REQUEST_TOO_LARGE'});let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{ok:false,error:'BAD_JSON'})}try{return send(res,200,await directPlanningCommit(s,b));}catch(e){return send(res,409,{ok:false,error:clean(e?.message||e)||'DIRECT_PLANNING_COMMIT_BLOCKED',detail:clean(e?.message||e)});}}
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