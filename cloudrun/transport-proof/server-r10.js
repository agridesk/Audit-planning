import http from 'node:http';
import {URL} from 'node:url';
import crypto from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const RELAY_PARENT_ORIGIN='https://ams-transport-proof-510075419067.europe-west1.run.app';
const BUILD='2026-10-03_COMPLETE_V29_DIRECT_R6_SHARED_AUDITOR_OWNER';

process.env.PORT=String(INNER_PORT);
await import('./server-r9.js');
process.env.PORT=String(PUBLIC_PORT);

function relayPayload(email,role,exp,origin,nonce){return ['v3','MANAGER_ACTION_WARM_WORKER',clean(email).toLowerCase(),clean(role),String(exp),clean(origin),clean(nonce)].join('\n');}
function relaySignature(payload){return crypto.createHmac('sha256',WRITE_KEY).update(payload).digest('base64url');}
function buildManagerRelayUrl(identity){
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('MANAGER_ACTION_RELAY_NOT_CONFIGURED');
  const email=clean(identity?.email).toLowerCase(),role='Manager',exp=Date.now()+15*60*1000,origin=RELAY_PARENT_ORIGIN,nonce=crypto.randomBytes(24).toString('base64url');
  if(!email)throw new Error('MANAGER_IDENTITY_EMAIL_REQUIRED');
  const u=new URL(GAS_WRITE_URL);
  u.searchParams.set('action','externalmanageractionrelay');
  u.searchParams.set('email',email);
  u.searchParams.set('role',role);
  u.searchParams.set('exp',String(exp));
  u.searchParams.set('origin',origin);
  u.searchParams.set('nonce',nonce);
  u.searchParams.set('signature',relaySignature(relayPayload(email,role,exp,origin,nonce)));
  return {url:u.toString(),nonce};
}
function clean(v){return String(v==null?'':v).trim();}
function bridgeSafeEq(a,b){const x=Buffer.from(clean(a)),y=Buffer.from(clean(b));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};(h||[]).forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean((r||[])[i]):'';}
function a1col(n){let s='';for(let x=n;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+((x-1)%26))+s;return s;}
function parseJson(raw){try{return typeof raw==='string'?JSON.parse(raw):raw}catch{return null}}
function dateOnly(v){const s=clean(v),m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}
function normalizeStatus(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function allowedActions(k){return k==='PENDING_PLANNING'?['PLAN','REJECT']:k==='PENDING_APPROVAL'?['APPROVE','CANCEL','REJECT']:k==='APPROVED'?['ACCEPT','CANCEL','REJECT']:k==='ACCEPTED'?['COMPLETE','CANCEL','REJECT']:[];}
function blockHours(blocks){let total=0,seen=false;for(const b of Array.isArray(blocks)?blocks:[]){const n=Number(b?.hours);if(Number.isFinite(n)){total+=n;seen=true;continue;}const s=clean(b?.start),e=clean(b?.end);if(/^\d{2}:\d{2}$/.test(s)&&/^\d{2}:\d{2}$/.test(e)){const [sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number),mins=(eh*60+em)-(sh*60+sm);if(mins>0){total+=mins/60;seen=true;}}}return seen?Math.round(total*100)/100:null;}
function scheduledHours(j){if(!j||typeof j!=='object')return null;const explicit=Number(j.scheduledHours);if(Number.isFinite(explicit))return explicit;const blocks=blockHours(j.blocks);if(blocks!=null)return blocks;const legacy=Number(j.totalPlannedHours);return Number.isFinite(legacy)?legacy:null;}
function formalHours(j,fallback){if(j&&typeof j==='object'){const explicit=Number(j.formalHours);if(Number.isFinite(explicit))return explicit;}const n=Number(fallback);return Number.isFinite(n)?n:null;}
function commentsFrom(h,row){const mc=val(row,col(h,['Manager comment (last)'])),md=val(row,col(h,['Last manager decision'])),mt=val(row,col(h,['Last decision timestamp'])),ac=val(row,col(h,['Auditor comment (last)'])),ad=val(row,col(h,['Last auditor decision'])),at=val(row,col(h,['Last auditor decision timestamp'])),ss=val(row,col(h,['Status since']));let latestComment='',latestActor='',latestAction='',latestTimestamp='';if(mc||mt){latestComment=mc;latestActor='Manager';latestAction=md;latestTimestamp=mt;}if((ac||at)&&(!latestTimestamp||at>latestTimestamp)){latestComment=ac;latestActor='Auditor';latestAction=ad;latestTimestamp=at;}return{managerComment:mc,managerDecision:md,managerDecisionTimestamp:mt,auditorComment:ac,auditorDecision:ad,auditorDecisionTimestamp:at,statusSince:ss,latestComment,latestCommentActor:latestActor,latestCommentAction:latestAction,latestCommentTimestamp:latestTimestamp};}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ams-build':BUILD});res.end(JSON.stringify(body));}
async function accessToken(){const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');return j.access_token;}
async function sheetValues(range){if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent(range));u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),j=await r.json();if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));return j.values||[];}
async function auditPlanningRows(){return sheetValues('Audit planning!A1:AX483');}
async function innerSession(req){const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/api/v1/session',{headers:{cookie:clean(req.headers.cookie)},redirect:'manual'});let j={};try{j=await r.json();}catch{}return r.ok&&j?.ok===true?j.identity:null;}
function managerAuditorDisplayMap(values){const out=new Map();if(!values?.length)return out;const h=values[0],ce=col(h,['E-mail','Email','E-mail address','Mail']),cn=col(h,['Name','Auditor','Auditor name','Display name']);for(const r of values.slice(1)){const email=val(r,ce).toLowerCase(),name=val(r,cn);if(email&&name)out.set(email,name);}return out;}
function managerSchedulingDeltaCatalog(values){const out=[];if(!values?.length)return out;const h=values[0],cs=col(h,['SlotKey','Slot key','Slot']),cc=col(h,['ScopeCode','Scope code','Code']),cn=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),cd=col(h,['Scheduling_hours_delta','Scheduling hours delta','Scheduling_hours delta','Scheduling delta']),ca=col(h,['Active']),car=col(h,['Archived']);for(const r of values.slice(1)){const active=ca<0||['true','yes','1','x'].includes(val(r,ca).toLowerCase()),archived=car>=0&&['true','yes','1','x'].includes(val(r,car).toLowerCase());if(!active||archived)continue;const delta=Number(String(val(r,cd)||'0').replace(',','.'));out.push({aliases:[val(r,cs),val(r,cc),val(r,cn)].filter(Boolean),delta:Number.isFinite(delta)?delta:0});}return out;}
function managerSchedulingDeltaForAudit(h,row,catalog){let total=0,matched=0;for(const s of catalog||[]){let on=false;for(const a of s.aliases){const i=col(h,[a]);if(i>=0&&['x','yes','true','1'].includes(val(row,i).toLowerCase())){on=true;break;}}if(on){total+=Number(s.delta)||0;matched++;}}return{delta:Math.round(total*100)/100,matched};}
function managerExtensionCatalog(values){const out=[];if(!values?.length)return out;const h=values[0],cs=col(h,['SlotKey','Slot key','Slot']),cc=col(h,['ScopeCode','Scope code','Code']),cn=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),ce=col(h,['Extension','Extension months','Extension_months']),ca=col(h,['Active']),car=col(h,['Archived']);for(const r of values.slice(1)){const active=ca<0||['true','yes','1','x'].includes(val(r,ca).toLowerCase()),archived=car>=0&&['true','yes','1','x'].includes(val(r,car).toLowerCase());if(!active||archived)continue;const months=Number(String(val(r,ce)||'0').replace(',','.'));out.push({aliases:[val(r,cs),val(r,cc),val(r,cn)].filter(Boolean),months:Number.isFinite(months)&&months>0?Math.round(months):0});}return out;}
function managerAnnualWindowCatalog(values){
  const out=new Map();if(!values?.length)return out;
  const h=values[0],cc=col(h,['ScopeCode','Scope code','Code']),cn=col(h,['DisplayName','Display name','Name','ScopeName','Scope']),ca=col(h,['Active']),car=col(h,['Archived']),cr=col(h,['Recurring']),coc=col(h,['Obligation cycle','Obligation_cycle','Cycle']),ccb=col(h,['Complete by','Complete_by','Must be completed by']),cpf=col(h,['Planning from','Planning_from','PlanningFrom']),cpt=col(h,['Planning to','Planning_to','PlanningTo']);
  for(const r of values.slice(1)){
    const active=ca<0||['','true','yes','1','x','ja'].includes(val(r,ca).toLowerCase()),archived=car>=0&&['true','yes','1','x','ja'].includes(val(r,car).toLowerCase());if(!active||archived)continue;
    const cfg={scopeCode:val(r,cc),displayName:val(r,cn),recurring:cr>=0&&['true','yes','1','x','ja'].includes(val(r,cr).toLowerCase()),obligationCycle:val(r,coc).toUpperCase(),completeBy:val(r,ccb),planningFromRaw:cpf>=0?clean(r[cpf]):'',planningToRaw:cpt>=0?clean(r[cpt]):''};
    for(const a of [cfg.scopeCode,cfg.displayName])if(a)out.set(clean(a).toUpperCase(),cfg);
  }
  return out;
}
function managerAddMonthsIso(iso,months){const m=clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';let total=Number(m[1])*12+(Number(m[2])-1)+Number(months||0),y=Math.floor(total/12),mo=total-y*12+1,d=Math.min(Number(m[3]),new Date(Date.UTC(y,mo,0)).getUTCDate());return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function managerResolvedVisitWindow(auditId,cfgByScope,obValues,linkValues){
  if(!auditId||!obValues?.length||!linkValues?.length)return null;
  const oh=obValues[0],oi=col(oh,['Obligation_ID','Obligation ID']),oc=col(oh,['ScopeCode','Scope Code']),ocy=col(oh,['Cycle_Key','Cycle Key']),os=col(oh,['Obligation_State','Obligation State']),opf=col(oh,['Planning_Window_From','Planning Window From']),opt=col(oh,['Planning_Window_To','Planning Window To']);
  const lh=linkValues[0],la=col(lh,['Audit_ID','Audit ID']),lo=col(lh,['Obligation_ID','Obligation ID']),ls=col(lh,['Link_State','Link State']);if([oi,oc,ocy,os,la,lo,ls].some(i=>i<0))return null;
  const obById=new Map();for(const r of obValues.slice(1)){const id=val(r,oi);if(id)obById.set(id,r);}
  const wins=[];
  for(const lr of linkValues.slice(1)){
    if(val(lr,la)!==auditId||val(lr,ls).toUpperCase()!=='ACTIVE')continue;
    const ob=obById.get(val(lr,lo));if(!ob||['COMPLETED','CANCELLED','REJECTED'].includes(val(ob,os).toUpperCase()))continue;
    let from=opf>=0?val(ob,opf):'',to=opt>=0?val(ob,opt):'';
    if((from&&!to)||(!from&&to))return null;
    if(!from&&!to){
      const scope=val(ob,oc),cycle=val(ob,ocy),cfg=cfgByScope.get(scope.toUpperCase());
      if(!cfg||cfg.recurring||cfg.obligationCycle!=='ANNUAL'||!/^20\d{2}$/.test(cycle)||! /^(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(cfg.completeBy))return null;
      const deadline=cycle+'-'+cfg.completeBy,cycleStart=cycle+'-01-01',hasFrom=cfg.planningFromRaw!=='',hasTo=cfg.planningToRaw!=='';
      if(hasFrom!==hasTo)return null;
      from=cycleStart;to=deadline;
      if(hasFrom&&hasTo){
        const fm=Number(String(cfg.planningFromRaw).replace(',','.')),tm=Number(String(cfg.planningToRaw).replace(',','.'));if(!Number.isFinite(fm)||!Number.isFinite(tm))return null;
        from=managerAddMonthsIso(deadline,fm);to=managerAddMonthsIso(deadline,tm);if(from<cycleStart)from=cycleStart;if(to>deadline)to=deadline;
      }
    }
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(from)||!/^20\d{2}-\d{2}-\d{2}$/.test(to)||from>to)return null;
    wins.push({from,to});
  }
  if(!wins.length)return null;let from=wins[0].from,to=wins[0].to;for(const w of wins.slice(1)){if(w.from>from)from=w.from;if(w.to<to)to=w.to;}if(from>to)return null;return{from,to,source:'MODEL_C_CONFIG_SCOPES'};
}

function managerExtensionMonthsForAudit(h,row,catalog){const months=[];for(const s of catalog||[]){let on=false;for(const a of s.aliases){const i=col(h,[a]);if(i>=0&&['x','yes','true','1'].includes(val(row,i).toLowerCase())){on=true;break;}}if(on&&s.months>0)months.push(s.months);}return months.length?Math.min(...months):0;}
async function enrichManagerOpen(obj){const rows=obj?.rows;if(!Array.isArray(rows)||!rows.length)return obj;const [values,scopeValues,audValues,obValues,linkValues]=await Promise.all([sheetValues('Audit planning!A1:AX483'),sheetValues('Config_Scopes!A1:Z128'),sheetValues('Auditors!A1:Z256'),sheetValues('Audit_Obligations!A1:Z1024'),sheetValues('Audit_Visit_Obligations!A1:Z1024')]);if(values.length<2)return obj;const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),cp=col(h,['Planning JSON','Planning_JSON']),byId=new Map(),auditorNames=managerAuditorDisplayMap(audValues),scheduleCatalog=managerSchedulingDeltaCatalog(scopeValues),extensionCatalog=managerExtensionCatalog(scopeValues),annualWindowCatalog=managerAnnualWindowCatalog(scopeValues);for(let i=1;i<values.length;i++){const id=val(values[i],ci);if(id)byId.set(id,{row:values[i],sourceRow:i+1});}let hoursEnriched=0,commentsEnriched=0;for(const r of rows){if(!r)continue;r.allowedActions=allowedActions(clean(r.statusKey||r.status).toUpperCase().replace(/[\s-]+/g,'_'));const source=byId.get(clean(r.auditId));if(!source)continue;Object.assign(r,commentsFrom(h,source.row),{sourceRow:source.sourceRow});commentsEnriched++;const assigned=clean(r.assignedTo||r.auditor).toLowerCase();r.assignedToDisplayName=auditorNames.get(assigned)||clean(r.assignedTo||r.auditor);r.auditorDisplayName=r.assignedToDisplayName;const canonicalWindow=managerResolvedVisitWindow(clean(r.auditId),annualWindowCatalog,obValues,linkValues);if(canonicalWindow){r.planningWindowFrom=canonicalWindow.from;r.planningWindowTo=canonicalWindow.to;r.planningWindowText=canonicalWindow.from+' → '+canonicalWindow.to;r.planningWindowState=canonicalWindow.source;}const extMonths=managerExtensionMonthsForAudit(h,source.row,extensionCatalog);r.extMonths=extMonths;r.extensionMonths=extMonths;r.canExtend=r.statusKey==='PENDING_PLANNING'&&extMonths>0;if(r.statusKey==='PENDING_PLANNING'){r.hoursPlanned='';r.plannedHours='';r.scheduledHours='';continue;}const j=parseJson(val(source.row,cp)),formal=formalHours(j,r.requiredHours),deltaInfo=managerSchedulingDeltaForAudit(h,source.row,scheduleCatalog);if(formal!=null){r.hoursPlanned=Math.round(formal*100)/100;r.plannedHours=r.hoursPlanned;const scheduled=Math.max(0,Math.round((formal+deltaInfo.delta)*100)/100);r.scheduledHours=scheduled;r.hoursVariance=Math.round((scheduled-formal)*100)/100;}r.schedulingDelta=deltaInfo.delta;r.schedulingDeltaScopeCount=deltaInfo.matched;hoursEnriched++;}obj.hoursSemantics={build:BUILD,enriched:hoursEnriched,formalField:'hoursPlanned',scheduledField:'scheduledHours',scheduledOwner:'CONFIG_SCOPES_SCHEDULING_HOURS_DELTA'};obj.actionCommunication={build:BUILD,enriched:commentsEnriched,canonicalFields:['Manager comment (last)','Auditor comment (last)']};return obj;}
async function readAuditPatch(auditId,sourceRow){const started=Date.now(),[headerRows,scopeValues,audValues]=await Promise.all([sheetValues('Audit planning!A1:AX1'),sheetValues('Config_Scopes!A1:Z128'),sheetValues('Auditors!A1:Z256')]),header=headerRows[0]||[];let row=[],rowNo=Number(sourceRow)||0;const ci=col(header,['Audit ID','Audit_ID','AuditId','Audit Id']);if(rowNo>1){row=(await sheetValues('Audit planning!A'+rowNo+':AX'+rowNo))[0]||[];if(val(row,ci)!==auditId){row=[];rowNo=0;}}if(!row.length){const rows=await sheetValues('Audit planning!A2:AX483');for(let i=0;i<rows.length;i++){if(val(rows[i],ci)===auditId){row=rows[i];rowNo=i+2;break;}}}if(!row.length)return{success:false,error:'AUDIT_NOT_FOUND',auditId,serverMs:Date.now()-started,build:BUILD};const g=names=>val(row,col(header,names)),rawStatus=g(['Status']),k=normalizeStatus(rawStatus),required=Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.'));let planningJson=g(['Planning JSON','Planning_JSON']),j=parseJson(planningJson),formal=formalHours(j,required),assigned=g(['Assigned to','Assigned auditor','Auditor']),display=managerAuditorDisplayMap(audValues).get(clean(assigned).toLowerCase())||assigned,deltaInfo=managerSchedulingDeltaForAudit(header,row,managerSchedulingDeltaCatalog(scopeValues)),scheduled=formal==null?null:Math.max(0,Math.round((formal+deltaInfo.delta)*100)/100);if(k==='PENDING_PLANNING'){planningJson='';scheduled=null;formal=null;assigned='';display='';}return{success:true,auditId,sourceRow:rowNo,status:rawStatus,statusKey:k,allowedActions:allowedActions(k),assignedTo:assigned,auditor:assigned,assignedToEmail:assigned,assignedToDisplayName:display,auditorDisplayName:display,datePlanned:k==='PENDING_PLANNING'?'':dateOnly(g(['Date planned','Date - Planned'])),hoursPlanned:formal==null?'':Math.round(formal*100)/100,plannedHours:formal==null?'':Math.round(formal*100)/100,requiredHours:Number.isFinite(required)?required:0,toBePlanned:Number.isFinite(required)?required:0,scheduledHours:scheduled==null?'':Math.round(scheduled*100)/100,schedulingDelta:deltaInfo.delta,schedulingDeltaScopeCount:deltaInfo.matched,scheduledHoursTarget:k==='PENDING_PLANNING'?'':undefined,planningJson,...commentsFrom(header,row),serverMs:Date.now()-started,build:BUILD};}
async function callGasBridge(identity,route,payload){
  const started=Date.now();
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('MANAGER_ACTION_BRIDGE_NOT_CONFIGURED');
  const actorEmail=clean(identity?.email).toLowerCase();
  if(!actorEmail)throw new Error('MANAGER_IDENTITY_EMAIL_REQUIRED');
  const u=new URL(GAS_WRITE_URL);u.searchParams.set('action',route);
  const gasStarted=Date.now();
  const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({bridgeKey:WRITE_KEY,actorEmail},payload||{}))});
  const text=await r.text(),gasHttpMs=Date.now()-gasStarted;
  let result=null;try{result=JSON.parse(text);}catch{const e=new Error('MANAGER_BRIDGE_BAD_GAS_RESPONSE_'+r.status);e.gasHttpMs=gasHttpMs;throw e;}
  if(!r.ok||!result||result.success===false||result.ok===false){const e=new Error(clean(result?.error||result?.message)||('MANAGER_BRIDGE_GAS_HTTP_'+r.status));e.gasResult=result;e.gasHttpMs=gasHttpMs;throw e;}
  return{result,gasHttpMs,totalMs:Date.now()-started};
}
async function callCanonicalManagerAction(identity,body){
  const started=Date.now();
  const actorEmail=clean(identity?.email).toLowerCase();
  const auditId=clean(body?.auditId);
  const managerAction=clean(body?.action||body?.managerAction).toLowerCase();
  const options=(body?.options&&typeof body.options==='object')?body.options:{};
  if(!actorEmail||!auditId||!managerAction)throw new Error('MISSING_REQUIRED_FIELDS');
  if(!['approve','cancel','reject'].includes(managerAction))throw new Error('MANAGER_PORTAL_ACTION_NOT_ALLOWED');
  if((managerAction==='cancel'||managerAction==='reject')&&!clean(options.reason||options.comment))throw new Error('ACTION_REASON_REQUIRED');
  const write=await callGasBridge(identity,'externalmanageraction',{auditId,managerAction,options});
  return{result:write.result,gasHttpMs:write.gasHttpMs,totalMs:Date.now()-started};
}
async function normalizeCombinedProjection(auditId,formal,scheduled,planningJson){const values=await auditPlanningRows();if(values.length<2)throw new Error('AUDIT_PLANNING_EMPTY');const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),cp=col(h,['Planning JSON','Planning_JSON']);if(ci<0||cp<0)throw new Error('PLANNING_JSON_SCHEMA_MISSING');let rowNo=0;for(let i=1;i<values.length;i++)if(val(values[i],ci)===clean(auditId)){rowNo=i+1;break;}if(!rowNo)throw new Error('AUDIT_NOT_FOUND');const j=parseJson(planningJson)||{};j.scheduledHours=Math.round(Number(scheduled)*100)/100;j.formalHours=Math.round(Number(formal)*100)/100;j.totalPlannedHours=j.formalHours;const normalized=JSON.stringify(j),token=await accessToken(),range='Audit planning!'+a1col(cp+1)+rowNo,u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent(range)+'?valueInputOption=USER_ENTERED',r=await fetch(u,{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({values:[[normalized]]})}),out=await r.json();if(!r.ok)throw new Error('PLANNING_JSON_NORMALIZE_'+r.status+': '+JSON.stringify(out));return{success:true,auditId:clean(auditId),formalHours:j.formalHours,scheduledHours:j.scheduledHours,row:rowNo,planningJson:normalized};}
async function proxy(req,res,raw){const target='http://127.0.0.1:'+INNER_PORT+(req.url||'/'),headers={};for(const [k,v] of Object.entries(req.headers)){if(v!=null&&!['host','content-length','connection'].includes(k.toLowerCase()))headers[k]=v;}const init={method:req.method,headers,redirect:'manual'};if(req.method!=='GET'&&req.method!=='HEAD')init.body=raw||'';const r=await fetch(target,init),buf=Buffer.from(await r.arrayBuffer()),outHeaders={};r.headers.forEach((v,k)=>{if(!['content-length','transfer-encoding','connection'].includes(k.toLowerCase()))outHeaders[k]=v;});outHeaders['x-ams-build']=BUILD;let body=buf;const u=new URL(req.url||'/','http://localhost'),ct=clean(r.headers.get('content-type'));
  if(r.ok&&req.method==='GET'&&u.pathname==='/api/v1/manager/open'&&ct.includes('application/json')){let j;try{j=JSON.parse(buf.toString('utf8'));}catch{j=null;}if(j){j=await enrichManagerOpen(j);body=Buffer.from(JSON.stringify(j),'utf8');outHeaders['content-length']=String(body.length);}}
  if(r.ok&&req.method==='POST'&&u.pathname==='/api/v1/planning/commit-handoff'&&ct.includes('application/json')){let j;try{j=JSON.parse(buf.toString('utf8'));}catch{j=null;}const result=j?.result;if(j?.ok===true&&result?.success===true&&result?.combinedVisit===true){const formal=Number(result.formalHours),scheduled=Number(result.schedulingHours);if(Number.isFinite(formal)&&Number.isFinite(scheduled)){try{const fixed=await normalizeCombinedProjection(result.auditId,formal,scheduled,result.planningJson);result.planningJson=fixed.planningJson;j.formalSchedulingProjection=fixed;}catch(e){j.formalSchedulingProjection={success:false,error:clean(e?.message||e)};}body=Buffer.from(JSON.stringify(j),'utf8');outHeaders['content-length']=String(body.length);}}}
  res.writeHead(r.status,outHeaders);res.end(body);
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&u.pathname==='/api/v1/build')return sendJson(res,200,{ok:true,build:BUILD,inner:'server-r9.js',hoursSemantics:{formalPlanned:'hoursPlanned',scheduledDuration:'scheduledHours'},ecasHoursSource:'Planning JSON totalPlannedHours=formalHours',managerActionMicroRefresh:true,canonicalCommentFields:true,managerActionTransport:'warm-google-script-run-worker',pendingPlanningClearsCommittedHours:true,openAuditsGrid2:{bulkEnrichment:true,canonicalExtension:true,noNPlusOne:true,conceptCommitted:false,provisionalCommitted:false}});
  if(req.method==='GET'&&u.pathname==='/api/v1/manager/audit'){
    const identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});const auditId=clean(u.searchParams.get('auditId')),sourceRow=clean(u.searchParams.get('sourceRow'));if(!auditId)return sendJson(res,400,{success:false,error:'AUDIT_ID_REQUIRED',build:BUILD});try{const out=await readAuditPatch(auditId,sourceRow);return sendJson(res,out.success?200:404,out);}catch(e){return sendJson(res,500,{success:false,error:'MANAGER_AUDIT_REREAD_FAILED',detail:clean(e?.message||e),build:BUILD});}
  }
  let raw='';try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{success:false,error:clean(e?.message||e),build:BUILD});}
  if(req.method==='GET'&&u.pathname==='/api/v1/manager/action-relay-url'){
    const identity=await innerSession(req);
    if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});
    if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});
    try{const relay=buildManagerRelayUrl(identity);return sendJson(res,200,{success:true,url:relay.url,nonce:relay.nonce,expiresInMs:900000,build:BUILD});}
    catch(e){return sendJson(res,500,{success:false,error:clean(e?.message||e),build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/open-enrichment'){
    const started=Date.now(),identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}const auditIds=Array.isArray(body.auditIds)?body.auditIds.map(clean).filter(Boolean):[];if(!auditIds.length)return sendJson(res,200,{success:true,rows:[],perf:{totalMs:Date.now()-started},build:BUILD});if(auditIds.length>500)return sendJson(res,400,{success:false,error:'TOO_MANY_AUDIT_IDS',build:BUILD});try{const x=await callGasBridge(identity,'externalmanageropenenriched',{auditIds}),normalized=await enrichManagerOpen(Object.assign({},x.result));return sendJson(res,200,Object.assign({},normalized,{perf:Object.assign({},normalized?.perf||{},{gasHttpMs:x.gasHttpMs,totalMs:Date.now()-started}),build:BUILD}));}catch(e){return sendJson(res,502,{success:false,error:clean(e?.message||e),gasResult:e?.gasResult||null,perf:{gasHttpMs:e?.gasHttpMs||null,totalMs:Date.now()-started},build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/extension'){
    const started=Date.now(),identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});
    try{const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/manager/extension-direct',headers={'content-type':'application/json'};if(req.headers.cookie)headers.cookie=clean(req.headers.cookie);const rr=await fetch(target,{method:'POST',headers,body:raw||'{}',redirect:'manual'}),txt=await rr.text();let out=null;try{out=JSON.parse(txt);}catch{out={success:false,error:'DIRECT_EXTENSION_NON_JSON'}}if(out&&typeof out==='object'){out.r10InnerMs=Date.now()-started;out.perf={totalMs:Date.now()-started,innerMs:out.r10InnerMs,readMs:out.readMs||null,writeMs:out.writeMs||null};}return sendJson(res,rr.status,out||{success:false,error:'DIRECT_EXTENSION_EMPTY'});}catch(e){return sendJson(res,502,{success:false,error:'DIRECT_EXTENSION_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/internal/auditor/complete-direct'){
    if(!WRITE_KEY)return sendJson(res,503,{success:false,error:'WRITE_BRIDGE_NOT_CONFIGURED',build:BUILD});
    const supplied=clean(req.headers['x-ams-bridge-key']);
    if(!bridgeSafeEq(supplied,WRITE_KEY))return sendJson(res,403,{success:false,error:'BRIDGE_FORBIDDEN',build:BUILD});
    const started=Date.now();
    try{
      const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/internal/auditor/complete-direct';
      const rr=await fetch(target,{method:'POST',headers:{'content-type':'application/json','x-ams-bridge-key':WRITE_KEY},body:raw||'{}',redirect:'manual'});
      const txt=await rr.text();let out=null;try{out=JSON.parse(txt);}catch{out={success:false,error:'DIRECT_AUDITOR_COMPLETE_NON_JSON'}}
      if(out&&typeof out==='object')out.r10InnerMs=Date.now()-started;
      return sendJson(res,rr.status,out||{success:false,error:'DIRECT_AUDITOR_COMPLETE_EMPTY'});
    }catch(e){
      return sendJson(res,502,{success:false,error:'DIRECT_AUDITOR_COMPLETE_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});
    }
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/action'){
    const totalStarted=Date.now();
    const identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});
    let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}
    const managerAction=clean(body?.action||body?.managerAction).toLowerCase();
    if(managerAction==='complete'){
      const innerStarted=Date.now();
      try{
        const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/manager/complete-direct';
        const headers={'content-type':'application/json'};
        if(req.headers.cookie)headers.cookie=clean(req.headers.cookie);
        const rr=await fetch(target,{method:'POST',headers,body:raw||'{}',redirect:'manual'});
        const txt=await rr.text();let out=null;try{out=JSON.parse(txt);}catch{out={success:false,error:'DIRECT_COMPLETE_NON_JSON'}}
        if(out&&typeof out==='object')out.r10InnerMs=Date.now()-innerStarted;
        return sendJson(res,rr.status,out||{success:false,error:'DIRECT_COMPLETE_EMPTY'});
      }catch(e){
        return sendJson(res,502,{success:false,error:'DIRECT_COMPLETE_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});
      }
    }
    if(managerAction==='cancel'){
      const innerStarted=Date.now();
      try{
        const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/manager/cancel-direct';
        const headers={'content-type':'application/json'};
        if(req.headers.cookie)headers.cookie=clean(req.headers.cookie);
        const rr=await fetch(target,{method:'POST',headers,body:raw||'{}',redirect:'manual'});
        const text=await rr.text();let out=null;try{out=JSON.parse(text);}catch{out={success:false,error:'DIRECT_CANCEL_NON_JSON',raw:text.slice(0,500)}}
        if(out&&typeof out==='object')out.r10InnerMs=Date.now()-innerStarted;
        return sendJson(res,rr.status,out||{success:false,error:'DIRECT_CANCEL_EMPTY',r10InnerMs:Date.now()-innerStarted});
      }catch(e){
        return sendJson(res,502,{success:false,error:'DIRECT_CANCEL_PROXY_FAILED',detail:clean(e?.message||e),r10InnerMs:Date.now()-innerStarted,build:BUILD});
      }
    }
    if(managerAction==='accept'){
      const innerStarted=Date.now();
      try{
        const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/manager/accept-direct';
        const headers={'content-type':'application/json'};
        if(req.headers.cookie)headers.cookie=clean(req.headers.cookie);
        const rr=await fetch(target,{method:'POST',headers,body:raw||'{}',redirect:'manual'});
        const txt=await rr.text();let out=null;try{out=JSON.parse(txt);}catch{out={success:false,error:'DIRECT_ACCEPT_NON_JSON'}}
        if(out&&typeof out==='object')out.r10InnerMs=Date.now()-innerStarted;
        return sendJson(res,rr.status,out||{success:false,error:'DIRECT_ACCEPT_EMPTY'});
      }catch(e){
        return sendJson(res,502,{success:false,error:'DIRECT_ACCEPT_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});
      }
    }
    if(managerAction==='approve'){
      const innerStarted=Date.now();
      try{
        const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/manager/approve-direct';
        const headers={'content-type':'application/json'};
        if(req.headers.cookie)headers.cookie=clean(req.headers.cookie);
        const rr=await fetch(target,{method:'POST',headers,body:raw||'{}',redirect:'manual'});
        const txt=await rr.text();let out=null;try{out=JSON.parse(txt);}catch{out={success:false,error:'DIRECT_APPROVE_NON_JSON'}}
        if(out&&typeof out==='object')out.r10InnerMs=Date.now()-innerStarted;
        return sendJson(res,rr.status,out||{success:false,error:'DIRECT_APPROVE_EMPTY'});
      }catch(e){
        return sendJson(res,502,{success:false,error:'DIRECT_APPROVE_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});
      }
    }
    if(managerAction==='reject'){
      const innerStarted=Date.now();
      try{
        const target='http://127.0.0.1:'+INNER_PORT+'/api/v1/manager/reject-direct';
        const headers={'content-type':'application/json'};
        if(req.headers.cookie)headers.cookie=clean(req.headers.cookie);
        const rr=await fetch(target,{method:'POST',headers,body:raw||'{}',redirect:'manual'});
        const txt=await rr.text();let out=null;try{out=JSON.parse(txt);}catch{out={success:false,error:'DIRECT_REJECT_NON_JSON'}}
        if(out&&typeof out==='object')out.r10InnerMs=Date.now()-innerStarted;
        return sendJson(res,rr.status,out||{success:false,error:'DIRECT_REJECT_EMPTY'});
      }catch(e){
        return sendJson(res,502,{success:false,error:'DIRECT_REJECT_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});
      }
    }
    try{
      const write=await callCanonicalManagerAction(identity,body);
      const rereadStarted=Date.now();
      const patch=await readAuditPatch(clean(body.auditId),body.sourceRow);
      const rereadMs=Date.now()-rereadStarted;
      if(!patch.success)return sendJson(res,500,{success:false,error:patch.error||'POST_ACTION_REREAD_FAILED',result:write.result,perf:{gasHttpMs:write.gasHttpMs,rereadMs,totalMs:Date.now()-totalStarted},build:BUILD});
      return sendJson(res,200,{success:true,result:write.result,patch,perf:{gasHttpMs:write.gasHttpMs,rereadMs,totalMs:Date.now()-totalStarted},build:BUILD});
    }catch(e){return sendJson(res,500,{success:false,error:clean(e?.message||e),gasResult:e?.gasResult||null,perf:{gasHttpMs:e?.gasHttpMs||null,totalMs:Date.now()-totalStarted},build:BUILD});}
  }
  try{return await proxy(req,res,raw);}catch(e){return sendJson(res,502,{ok:false,error:'R10_PROXY_FAILED',detail:clean(e?.message||e),build:BUILD});}
}).listen(PUBLIC_PORT,'0.0.0.0');