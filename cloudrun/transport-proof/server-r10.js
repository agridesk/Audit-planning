import http from 'node:http';
import {URL} from 'node:url';
import crypto from 'node:crypto';

const PUBLIC_PORT=Number(process.env.PORT||8080);
const INNER_PORT=PUBLIC_PORT+1;
const SID=process.env.DEV_SSOT_SPREADSHEET_ID||'';
const GAS_WRITE_URL=process.env.GAS_DEV_WRITE_URL||'';
const WRITE_KEY=process.env.AMS_EXTERNAL_WRITE_BRIDGE_KEY||'';
const RELAY_PARENT_ORIGIN='https://ams-transport-proof-510075419067.europe-west1.run.app';
const BUILD='2026-10-02_AMS_R10_DIRECT_CANCEL_REJECT_R3';

process.env.PORT=String(INNER_PORT);
await import('./server-r9.js');
process.env.PORT=String(PUBLIC_PORT);

function relayPayload(email,role,exp,origin,auditId,managerAction,reason){return ['v2','MANAGER_ACTION_RELAY_EXECUTE',clean(email).toLowerCase(),clean(role),String(exp),clean(origin),clean(auditId),clean(managerAction).toLowerCase(),clean(reason)].join('\n');}
function relaySignature(payload){return crypto.createHmac('sha256',WRITE_KEY).update(payload).digest('base64url');}
function buildManagerRelayUrl(identity,body){
  if(!GAS_WRITE_URL||!WRITE_KEY)throw new Error('MANAGER_ACTION_RELAY_NOT_CONFIGURED');
  const email=clean(identity?.email).toLowerCase(),role='Manager',exp=Date.now()+5*60*1000,origin=RELAY_PARENT_ORIGIN;
  const auditId=clean(body?.auditId),managerAction=clean(body?.action||body?.managerAction).toLowerCase();
  const options=(body?.options&&typeof body.options==='object')?body.options:{},reason=clean(options.reason||options.comment);
  if(!email)throw new Error('MANAGER_IDENTITY_EMAIL_REQUIRED');
  if(!auditId||!managerAction)throw new Error('MISSING_REQUIRED_FIELDS');
  if(!['approve','cancel','reject'].includes(managerAction))throw new Error('MANAGER_PORTAL_ACTION_NOT_ALLOWED');
  if((managerAction==='cancel'||managerAction==='reject')&&!reason)throw new Error('ACTION_REASON_REQUIRED');
  const u=new URL(GAS_WRITE_URL);
  u.searchParams.set('action','externalmanageractionrelay');
  u.searchParams.set('email',email);
  u.searchParams.set('role',role);
  u.searchParams.set('exp',String(exp));
  u.searchParams.set('origin',origin);
  u.searchParams.set('auditId',auditId);
  u.searchParams.set('managerAction',managerAction);
  u.searchParams.set('reason',reason);
  u.searchParams.set('signature',relaySignature(relayPayload(email,role,exp,origin,auditId,managerAction,reason)));
  return u.toString();
}
function clean(v){return String(v==null?'':v).trim();}
function key(v){return clean(v).toLowerCase().replace(/\s+/g,'_');}
function col(h,names){const m={};(h||[]).forEach((v,i)=>{const k=key(v);if(k&&m[k]===undefined)m[k]=i;});for(const n of names){const k=key(n);if(m[k]!==undefined)return m[k];}return-1;}
function val(r,i){return i>=0?clean((r||[])[i]):'';}
function a1col(n){let s='';for(let x=n;x>0;x=Math.floor((x-1)/26))s=String.fromCharCode(65+((x-1)%26))+s;return s;}
function parseJson(raw){try{return typeof raw==='string'?JSON.parse(raw):raw}catch{return null}}
function dateOnly(v){const s=clean(v),m=s.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:s.slice(0,10);}
function normalizeStatus(v){return clean(v).toUpperCase().replace(/[\s-]+/g,'_');}
function allowedActions(k){return k==='PENDING_PLANNING'?['PLAN','REJECT']:k==='PENDING_APPROVAL'?['APPROVE','CANCEL','REJECT']:k==='APPROVED'||k==='ACCEPTED'?['CANCEL','REJECT']:[];}
function blockHours(blocks){let total=0,seen=false;for(const b of Array.isArray(blocks)?blocks:[]){const n=Number(b?.hours);if(Number.isFinite(n)){total+=n;seen=true;continue;}const s=clean(b?.start),e=clean(b?.end);if(/^\d{2}:\d{2}$/.test(s)&&/^\d{2}:\d{2}$/.test(e)){const [sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number),mins=(eh*60+em)-(sh*60+sm);if(mins>0){total+=mins/60;seen=true;}}}return seen?Math.round(total*100)/100:null;}
function scheduledHours(j){if(!j||typeof j!=='object')return null;const explicit=Number(j.scheduledHours);if(Number.isFinite(explicit))return explicit;const blocks=blockHours(j.blocks);if(blocks!=null)return blocks;const legacy=Number(j.totalPlannedHours);return Number.isFinite(legacy)?legacy:null;}
function formalHours(j,fallback){if(j&&typeof j==='object'){const explicit=Number(j.formalHours);if(Number.isFinite(explicit))return explicit;}const n=Number(fallback);return Number.isFinite(n)?n:null;}
function commentsFrom(h,row){const mc=val(row,col(h,['Manager comment (last)'])),md=val(row,col(h,['Last manager decision'])),mt=val(row,col(h,['Last decision timestamp'])),ac=val(row,col(h,['Auditor comment (last)'])),ad=val(row,col(h,['Last auditor decision'])),at=val(row,col(h,['Last auditor decision timestamp'])),ss=val(row,col(h,['Status since']));let latestComment='',latestActor='',latestAction='',latestTimestamp='';if(mc||mt){latestComment=mc;latestActor='Manager';latestAction=md;latestTimestamp=mt;}if((ac||at)&&(!latestTimestamp||at>latestTimestamp)){latestComment=ac;latestActor='Auditor';latestAction=ad;latestTimestamp=at;}return{managerComment:mc,managerDecision:md,managerDecisionTimestamp:mt,auditorComment:ac,auditorDecision:ad,auditorDecisionTimestamp:at,statusSince:ss,latestComment,latestCommentActor:latestActor,latestCommentAction:latestAction,latestCommentTimestamp:latestTimestamp};}
async function readRaw(req,max=131072){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error('REQUEST_TOO_LARGE');}return raw;}
function sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ams-build':BUILD});res.end(JSON.stringify(body));}
async function accessToken(){const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}});if(!r.ok)throw new Error('METADATA_TOKEN_'+r.status);const j=await r.json();if(!j.access_token)throw new Error('METADATA_TOKEN_MISSING');return j.access_token;}
async function sheetValues(range){if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');const token=await accessToken(),u=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+'/values/'+encodeURIComponent(range));u.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');u.searchParams.set('dateTimeRenderOption','FORMATTED_STRING');const r=await fetch(u,{headers:{authorization:'Bearer '+token}}),j=await r.json();if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));return j.values||[];}
async function auditPlanningRows(){return sheetValues('Audit planning!A1:AX2000');}
async function sheetsApi(path,method='GET',body=null){
  if(!SID)throw new Error('DEV_SSOT_SPREADSHEET_ID_NOT_CONFIGURED');
  const token=await accessToken(),u='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SID)+path;
  const init={method,headers:{authorization:'Bearer '+token}};
  if(body!==null){init.headers['content-type']='application/json';init.body=JSON.stringify(body);}
  const r=await fetch(u,init),j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error('SHEETS_API_'+r.status+': '+JSON.stringify(j));
  return j;
}
async function batchValueWrites(data){
  if(!data.length)return{success:true,updated:0};
  return sheetsApi('/values:batchUpdate','POST',{valueInputOption:'USER_ENTERED',data:data.map(x=>({range:x.range,majorDimension:'ROWS',values:[[x.value]]}))});
}
async function appendRow(sheetName,row){
  const range=encodeURIComponent("'"+sheetName+"'!A:AZ");
  return sheetsApi('/values/'+range+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS','POST',{majorDimension:'ROWS',values:[row]});
}
async function spreadsheetMeta(){return sheetsApi('?fields=sheets.properties(sheetId,title)');}
async function deleteSheetRows(sheetTitle,rowNumbers){
  if(!rowNumbers.length)return{success:true,deleted:0};
  const meta=await spreadsheetMeta(),sheet=(meta.sheets||[]).find(x=>x?.properties?.title===sheetTitle);
  if(!sheet)throw new Error('SHEET_NOT_FOUND_'+sheetTitle);
  const requests=[...new Set(rowNumbers.map(Number).filter(x=>x>1))].sort((a,b)=>b-a).map(r=>({deleteDimension:{range:{sheetId:sheet.properties.sheetId,dimension:'ROWS',startIndex:r-1,endIndex:r}}}));
  if(!requests.length)return{success:true,deleted:0};
  await sheetsApi(':batchUpdate','POST',{requests});
  return{success:true,deleted:requests.length};
}
function quotedCell(sheetName,colIndex,rowNo){return "'"+sheetName.replace(/'/g,"''")+"'!"+a1col(colIndex+1)+rowNo;}
function amsStamp(){
  const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());
  const m={};p.forEach(x=>{if(x.type!=='literal')m[x.type]=x.value;});
  return m.year+'-'+m.month+'-'+m.day+' '+m.hour+':'+m.minute+':'+m.second;
}
function defaultOrManualAvailabilityStatus(v){const x=clean(v).toUpperCase();return !!x&&(x.startsWith('DEFAULT_')||x==='CALENDAR'||x==='CALENDER'||x==='SYSTEM_DEFAULT'||x.startsWith('MANUAL')||x.startsWith('BLOCK'));}
function auditTransitionAllowed(statusKey,action){
  if(action==='cancel')return ['PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(statusKey);
  if(action==='reject')return ['PENDING_PLANNING','PENDING_APPROVAL','APPROVED','ACCEPTED'].includes(statusKey);
  return false;
}
async function locateAuditDirect(auditId){
  const values=await auditPlanningRows();
  if(values.length<2)throw new Error('AUDIT_PLANNING_EMPTY');
  const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']);
  if(ci<0)throw new Error('AUDIT_ID_COLUMN_MISSING');
  for(let i=1;i<values.length;i++)if(val(values[i],ci)===auditId)return{header:h,row:values[i],rowNo:i+1};
  throw new Error('AUDIT_NOT_FOUND');
}
async function releaseAvailabilityDirect(auditId){
  const sheetName='Auditor Availability';
  const values=await sheetValues("'Auditor Availability'!A1:AZ3000");
  if(!values.length)return{success:true,changed:0,deleted:0};
  const h=values[0];
  const iS1=col(h,['First_Audit_Start_Time','First Audit Start Time']),iE1=col(h,['First_Audit_End_Time','First Audit End Time']),iId1=col(h,['Audit_ID_1','Audit ID 1','AuditId1']),iSt1=col(h,['Status_1','Status 1','Status','Source']);
  const iS2=col(h,['Second_Audit_Start_Time','Second Audit Start Time']),iE2=col(h,['Second_Audit_End_Time','Second Audit End Time']),iId2=col(h,['Audit_ID_2','Audit ID 2','AuditId2']),iSt2=col(h,['Status_2','Status 2']);
  const iAvail=col(h,['Available']),iUpd=col(h,['Last_Updated','Last Updated','Timestamp']);
  if(iId1<0&&iId2<0)throw new Error('AVAILABILITY_AUDIT_ID_COLUMNS_MISSING');
  const writes=[],deletes=[],stamp=amsStamp();let changed=0;
  for(let i=1;i<values.length;i++){
    const row=values[i]||[],rn=i+1;
    const hit1=iId1>=0&&val(row,iId1)===auditId,hit2=iId2>=0&&val(row,iId2)===auditId;
    if(!hit1&&!hit2)continue;
    const next=row.slice();
    if(hit1){for(const c of [iS1,iE1,iId1,iSt1])if(c>=0)next[c]='';changed++;}
    if(hit2){for(const c of [iS2,iE2,iId2,iSt2])if(c>=0)next[c]='';changed++;}
    const has1=iId1>=0&&clean(next[iId1]),has2=iId2>=0&&clean(next[iId2]);
    const keepBlocked=defaultOrManualAvailabilityStatus(iSt1>=0?next[iSt1]:'')||defaultOrManualAvailabilityStatus(iSt2>=0?next[iSt2]:'');
    if(!has1&&!has2&&!keepBlocked){deletes.push(rn);continue;}
    const changedCols=new Set();
    if(hit1)[iS1,iE1,iId1,iSt1].forEach(c=>{if(c>=0)changedCols.add(c)});
    if(hit2)[iS2,iE2,iId2,iSt2].forEach(c=>{if(c>=0)changedCols.add(c)});
    if(iAvail>=0){next[iAvail]='NO';changedCols.add(iAvail);}
    if(iUpd>=0){next[iUpd]=stamp;changedCols.add(iUpd);}
    for(const c of changedCols)writes.push({range:quotedCell(sheetName,c,rn),value:next[c]??''});
  }
  if(writes.length)await batchValueWrites(writes);
  if(deletes.length)await deleteSheetRows(sheetName,deletes);
  return{success:true,changed,rows:writes.length?new Set(writes.map(x=>x.range.match(/\d+$/)?.[0])).size:0,deleted:deletes.length};
}
function scopeTextFromAuditRow(h,row){
  const direct=val(row,col(h,['Scopes_List','Scopes List','Scopes']));
  if(direct)return direct;
  const defs=[['MPS-ABC',['MPS-ABC']],['MPS-GAP',['MPS-GAP']],['MPS-SQ',['MPS-SQ']],['GRASP',['GRASP']],['Florimark Tracecert',['Florimark Tracecert']],['Florimark GTP',['Florimark GTP']],['Scope 7',['Scope 7']],['Scope 8',['Scope 8']]];
  return defs.filter(([,names])=>{const x=val(row,col(h,names)).toLowerCase();return !!x&&!['no','0','false','inactive','n'].includes(x)}).map(([label])=>label).join('; ');
}
async function directCancel(identity,auditId,reason){
  const started=Date.now(),x=await locateAuditDirect(auditId),h=x.header,row=x.row,rowNo=x.rowNo;
  const statusCol=col(h,['Status']),statusKey=normalizeStatus(val(row,statusCol));
  if(!auditTransitionAllowed(statusKey,'cancel'))throw new Error('ACTION_NOT_ALLOWED_FROM_'+statusKey);
  const availabilityStarted=Date.now(),availability=await releaseAvailabilityDirect(auditId),availabilityMs=Date.now()-availabilityStarted;
  const stamp=amsStamp(),writes=[];
  const set=(names,value)=>{const c=col(h,names);if(c>=0)writes.push({range:quotedCell('Audit planning',c,rowNo),value});};
  set(['Assigned to','Assigned To','Assigned auditor','Assigned Auditor','Assigned'],'');
  set(['Date - Planned','Date – Planned','Date planned','Date Planned'],'');
  set(['Date - Approved','Date – Approved','Date approved','Date Approved'],'');
  set(['Audit days textual'],'');
  set(['Planning JSON','PlanningJSON','Planning'],'');
  set(['Hours planned','Planned hours','Hours Planned'],'');
  set(['Status'],'Pending Planning');
  set(['Status since'],stamp);
  set(['Last manager decision'],'CANCEL');
  set(['Last decision timestamp'],stamp);
  set(['Manager comment (last)'],reason);
  const writeStarted=Date.now();await batchValueWrites(writes);const writeMs=Date.now()-writeStarted;
  const rereadStarted=Date.now(),patch=await readAuditPatch(auditId,rowNo),rereadMs=Date.now()-rereadStarted;
  if(!patch.success||patch.statusKey!=='PENDING_PLANNING')throw new Error('CANCEL_CANONICAL_VERIFY_FAILED');
  return{success:true,action:'cancel',auditId,patch,availability,perf:{availabilityMs,writeMs,rereadMs,totalMs:Date.now()-started},transport:'direct-sheets-api'};
}
async function directReject(identity,auditId,reason){
  const started=Date.now(),x=await locateAuditDirect(auditId),h=x.header,row=x.row,rowNo=x.rowNo;
  const statusCol=col(h,['Status']),beforeStatus=val(row,statusCol),statusKey=normalizeStatus(beforeStatus);
  if(!auditTransitionAllowed(statusKey,'reject'))throw new Error('ACTION_NOT_ALLOWED_FROM_'+statusKey);
  const availabilityStarted=Date.now(),availability=await releaseAvailabilityDirect(auditId),availabilityMs=Date.now()-availabilityStarted;
  const [rejected,companies]=await Promise.all([sheetValues("'Rejected audits'!A1:AZ2000"),sheetValues("'Companies'!A1:AZ3000")]);
  if(!rejected.length)throw new Error('REJECTED_AUDITS_SCHEMA_MISSING');
  const rh=rejected[0],rid=col(rh,['Audit ID','Audit_ID','AuditId']),already=rid>=0&&rejected.slice(1).some(r=>val(r,rid)===auditId);
  const company=val(row,col(h,['Company'])),companyUidFromAudit=val(row,col(h,['Company_UID','Company UID','CompanyUID']));
  let companyUid=companyUidFromAudit,companyRowNo=0,companyActiveCol=-1;
  if(companies.length){
    const ch=companies[0],cName=col(ch,['Company']),cUid=col(ch,['Company_UID','Company UID','CompanyUID']),cActive=col(ch,['Active Audits','Active audits','Active audit','ActiveAudit','Active_Audits']);
    companyActiveCol=cActive;
    for(let i=1;i<companies.length;i++){
      if((companyUid&&cUid>=0&&val(companies[i],cUid)===companyUid)||(!companyUid&&cName>=0&&val(companies[i],cName).toLowerCase()===company.toLowerCase())){
        companyRowNo=i+1;if(!companyUid&&cUid>=0)companyUid=val(companies[i],cUid);break;
      }
    }
  }
  if(!companyUid)throw new Error('COMPANY_UID_NOT_FOUND');
  if(!already){
    const newRow=new Array(rh.length).fill('');
    const put=(names,value)=>{const c=col(rh,names);if(c>=0)newRow[c]=value;};
    put(['Company'],company);
    put(['Location'],val(row,col(h,['Location'])));
    put(['Scopes'],scopeTextFromAuditRow(h,row));
    put(['Preassigned Auditor'],val(row,col(h,['Preassigned Auditor'])));
    put(['Assigned to'],val(row,col(h,['Assigned to','Assigned auditor'])));
    put(['Date - Planned'],dateOnly(val(row,col(h,['Date - Planned','Date planned']))));
    put(['Date - Approved'],dateOnly(val(row,col(h,['Date - Approved','Date approved']))));
    put(['Status'],beforeStatus);
    put(['Reason / Comment'],reason);
    put(['Date - Rejected'],amsStamp());
    put(['Audit ID'],auditId);
    put(['Manager_Email','Manager Email'],clean(identity?.email).toLowerCase());
    put(['Company_UID','Company UID'],companyUid);
    await appendRow('Rejected audits',newRow);
  }
  if(companyRowNo>1&&companyActiveCol>=0)await batchValueWrites([{range:quotedCell('Companies',companyActiveCol,companyRowNo),value:'No'}]);
  await deleteSheetRows('Audit planning',[rowNo]);
  const verify=await readAuditPatch(auditId,0);
  if(verify.success||verify.error!=='AUDIT_NOT_FOUND')throw new Error('REJECT_CANONICAL_VERIFY_FAILED');
  return{success:true,action:'reject',auditId,rejected:true,availability,archiveAlreadyPresent:already,perf:{availabilityMs,totalMs:Date.now()-started},transport:'direct-sheets-api'};
}
async function directManagerCancelReject(identity,body){
  const auditId=clean(body?.auditId),action=clean(body?.action||body?.managerAction).toLowerCase(),options=(body?.options&&typeof body.options==='object')?body.options:{},reason=clean(options.reason||options.comment);
  if(!auditId||!['cancel','reject'].includes(action))throw new Error('DIRECT_ACTION_NOT_ALLOWED');
  if(!reason)throw new Error('ACTION_REASON_REQUIRED');
  if(action==='cancel')return directCancel(identity,auditId,reason);
  return directReject(identity,auditId,reason);
}
async function innerSession(req){const r=await fetch('http://127.0.0.1:'+INNER_PORT+'/api/v1/session',{headers:{cookie:clean(req.headers.cookie)},redirect:'manual'});let j={};try{j=await r.json();}catch{}return r.ok&&j?.ok===true?j.identity:null;}
async function enrichManagerOpen(obj){const rows=obj?.rows;if(!Array.isArray(rows)||!rows.length)return obj;const values=await auditPlanningRows();if(values.length<2)return obj;const h=values[0],ci=col(h,['Audit ID','Audit_ID','AuditId','Audit Id']),cp=col(h,['Planning JSON','Planning_JSON']),byId=new Map();for(let i=1;i<values.length;i++){const id=val(values[i],ci);if(id)byId.set(id,{row:values[i],sourceRow:i+1});}let hoursEnriched=0,commentsEnriched=0;for(const r of rows){if(!r)continue;const source=byId.get(clean(r.auditId));if(!source)continue;Object.assign(r,commentsFrom(h,source.row),{sourceRow:source.sourceRow});commentsEnriched++;if(r.statusKey==='PENDING_PLANNING'){r.hoursPlanned='';r.plannedHours='';r.scheduledHours='';continue;}const j=parseJson(val(source.row,cp));if(!j)continue;const scheduled=scheduledHours(j),formal=formalHours(j,r.requiredHours);if(formal!=null){r.hoursPlanned=Math.round(formal*100)/100;r.plannedHours=r.hoursPlanned;}if(scheduled!=null)r.scheduledHours=Math.round(scheduled*100)/100;if(formal!=null&&scheduled!=null)r.hoursVariance=Math.round((scheduled-formal)*100)/100;hoursEnriched++;}obj.hoursSemantics={build:BUILD,enriched:hoursEnriched,formalField:'hoursPlanned',scheduledField:'scheduledHours'};obj.actionCommunication={build:BUILD,enriched:commentsEnriched,canonicalFields:['Manager comment (last)','Auditor comment (last)']};return obj;}
async function readAuditPatch(auditId,sourceRow){const started=Date.now(),header=(await sheetValues('Audit planning!A1:AX1'))[0]||[];let row=[],rowNo=Number(sourceRow)||0;const ci=col(header,['Audit ID','Audit_ID','AuditId','Audit Id']);if(rowNo>1){row=(await sheetValues('Audit planning!A'+rowNo+':AX'+rowNo))[0]||[];if(val(row,ci)!==auditId){row=[];rowNo=0;}}if(!row.length){const rows=await sheetValues('Audit planning!A2:AX483');for(let i=0;i<rows.length;i++){if(val(rows[i],ci)===auditId){row=rows[i];rowNo=i+2;break;}}}if(!row.length)return{success:false,error:'AUDIT_NOT_FOUND',auditId,serverMs:Date.now()-started,build:BUILD};const g=names=>val(row,col(header,names)),rawStatus=g(['Status']),k=normalizeStatus(rawStatus),required=Number(String(g(['Total audit time in hours','Total time in hours','Required hours','Total hours'])||'').replace(',','.'));let planningJson=g(['Planning JSON','Planning_JSON']),j=parseJson(planningJson),scheduled=scheduledHours(j),formal=formalHours(j,required),assigned=g(['Assigned to','Assigned auditor','Auditor']);if(k==='PENDING_PLANNING'){planningJson='';scheduled=null;formal=null;assigned='';}return{success:true,auditId,sourceRow:rowNo,status:rawStatus,statusKey:k,allowedActions:allowedActions(k),assignedTo:assigned,auditor:assigned,assignedToEmail:assigned,datePlanned:k==='PENDING_PLANNING'?'':dateOnly(g(['Date planned','Date - Planned'])),hoursPlanned:formal==null?'':Math.round(formal*100)/100,plannedHours:formal==null?'':Math.round(formal*100)/100,requiredHours:Number.isFinite(required)?required:0,toBePlanned:Number.isFinite(required)?required:0,scheduledHours:scheduled==null?'':Math.round(scheduled*100)/100,scheduledHoursTarget:k==='PENDING_PLANNING'?'':undefined,planningJson,...commentsFrom(header,row),serverMs:Date.now()-started,build:BUILD};}
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
  if(req.method==='GET'&&u.pathname==='/api/v1/build')return sendJson(res,200,{ok:true,build:BUILD,inner:'server-r9.js',hoursSemantics:{formalPlanned:'hoursPlanned',scheduledDuration:'scheduledHours'},ecasHoursSource:'Planning JSON totalPlannedHours=formalHours',managerActionMicroRefresh:true,canonicalCommentFields:true,managerActionTransport:'direct-sheets-api-cancel-reject',pendingPlanningClearsCommittedHours:true,openAuditsGrid2:{bulkEnrichment:true,canonicalExtension:true,noNPlusOne:true,conceptCommitted:false,provisionalCommitted:false}});
  if(req.method==='GET'&&u.pathname==='/api/v1/manager/audit'){
    const identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});const auditId=clean(u.searchParams.get('auditId')),sourceRow=clean(u.searchParams.get('sourceRow'));if(!auditId)return sendJson(res,400,{success:false,error:'AUDIT_ID_REQUIRED',build:BUILD});try{const out=await readAuditPatch(auditId,sourceRow);return sendJson(res,out.success?200:404,out);}catch(e){return sendJson(res,500,{success:false,error:'MANAGER_AUDIT_REREAD_FAILED',detail:clean(e?.message||e),build:BUILD});}
  }
  let raw='';try{if(req.method!=='GET'&&req.method!=='HEAD')raw=await readRaw(req);}catch(e){return sendJson(res,413,{success:false,error:clean(e?.message||e),build:BUILD});}
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/action-direct'){
    const totalStarted=Date.now(),identity=await innerSession(req);
    if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});
    if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});
    let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}
    try{
      const out=await directManagerCancelReject(identity,body);
      out.perf=Object.assign({},out.perf||{},{requestTotalMs:Date.now()-totalStarted});
      return sendJson(res,200,Object.assign({build:BUILD},out));
    }catch(e){return sendJson(res,500,{success:false,error:clean(e?.message||e),perf:{totalMs:Date.now()-totalStarted},build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/action-relay-url'){
    const identity=await innerSession(req);
    if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});
    if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});
    let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}
    try{return sendJson(res,200,{success:true,url:buildManagerRelayUrl(identity,body),expiresInMs:300000,build:BUILD});}
    catch(e){return sendJson(res,400,{success:false,error:clean(e?.message||e),build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/open-enrichment'){
    const started=Date.now(),identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}const auditIds=Array.isArray(body.auditIds)?body.auditIds.map(clean).filter(Boolean):[];if(!auditIds.length)return sendJson(res,200,{success:true,rows:[],perf:{totalMs:Date.now()-started},build:BUILD});if(auditIds.length>500)return sendJson(res,400,{success:false,error:'TOO_MANY_AUDIT_IDS',build:BUILD});try{const x=await callGasBridge(identity,'externalmanageropenenriched',{auditIds});return sendJson(res,200,Object.assign({},x.result,{perf:Object.assign({},x.result?.perf||{},{gasHttpMs:x.gasHttpMs,totalMs:Date.now()-started}),build:BUILD}));}catch(e){return sendJson(res,502,{success:false,error:clean(e?.message||e),gasResult:e?.gasResult||null,perf:{gasHttpMs:e?.gasHttpMs||null,totalMs:Date.now()-started},build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/extension'){
    const started=Date.now(),identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}const auditId=clean(body.auditId),command=clean(body.command).toLowerCase();if(!auditId)return sendJson(res,400,{success:false,error:'AUDIT_ID_REQUIRED',build:BUILD});if(!['apply','undo'].includes(command))return sendJson(res,400,{success:false,error:'EXTENSION_COMMAND_NOT_ALLOWED',build:BUILD});try{const x=await callGasBridge(identity,'externalmanagerextension',{auditId,command});return sendJson(res,200,Object.assign({},x.result,{perf:Object.assign({},x.result?.perf||{},{gasHttpMs:x.gasHttpMs,totalMs:Date.now()-started}),build:BUILD}));}catch(e){return sendJson(res,502,{success:false,error:clean(e?.message||e),gasResult:e?.gasResult||null,perf:{gasHttpMs:e?.gasHttpMs||null,totalMs:Date.now()-started},build:BUILD});}
  }
  if(req.method==='POST'&&u.pathname==='/api/v1/manager/action'){
    const totalStarted=Date.now();
    const identity=await innerSession(req);if(!identity)return sendJson(res,401,{success:false,error:'SESSION_REQUIRED',build:BUILD});if(clean(identity.role).toLowerCase()!=='manager')return sendJson(res,403,{success:false,error:'ROLE_FORBIDDEN',build:BUILD});
    let body={};try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{success:false,error:'BAD_JSON',build:BUILD});}
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