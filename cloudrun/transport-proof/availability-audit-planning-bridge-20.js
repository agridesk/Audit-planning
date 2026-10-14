/** AMS Availability 2.0 — strict read-only bridge from canonical Audit planning rows.
 * This bridge does NOT infer commitment from a date alone. Unknown statuses, ambiguous
 * auditor identities, and malformed planning blocks fail closed. Never writes to Sheets.
 */
import {committedBlocksFromCanonicalSlots} from './availability-committed-overlay-20.js';
const norm=x=>String(x??'').trim();
const key=x=>norm(x).toLowerCase().replace(/[\s_-]+/g,'');
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const clock=(x,end=false)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)||(end&&x==='24:00');
function index(headers,aliases){for(const alias of aliases){const i=headers.findIndex(x=>key(x)===key(alias));if(i>=0)return i;}return -1;}
export function canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate,toDate}={}){
 if(!Array.isArray(rows)||!Array.isArray(auditors)||!date(fromDate)||!date(toDate)||fromDate>toDate)throw Error('INVALID_AUDIT_BRIDGE_INPUT');
 if(!rows.length)return [];
 const h=rows[0],id=index(h,['Audit ID','Audit_ID']),status=index(h,['Status']),assigned=index(h,['Assigned to','Assigned auditor','Auditor']),json=index(h,['Planning JSON','Planning_JSON']);
 if([id,status,assigned,json].some(x=>x<0))throw Error('AUDIT_PLANNING_HEADERS_MISSING');
 const companyColumn=index(h,['Company','Company name','Company Name','Company_Name','Company name (display)']),scopesColumn=index(h,['Scopes','Scope','Scope(s)','Scope names','Scope Names','Audit scopes']);
 const lookup=new Map();
 for(const a of auditors){const uid=norm(a.auditorId),email=norm(a.email).toLowerCase();if(!uid||!email||lookup.has(email))throw Error('AUDITOR_IDENTITY_AMBIGUOUS');lookup.set(email,uid);}
 const slots=[],seen=new Set();
 for(const row of rows.slice(1)){
  const auditId=norm(row[id]),state=key(row[status]).toUpperCase();
  if(!auditId)continue;
  // Only these explicitly committed planning states can reserve an auditor.
  if(!['APPROVED','ACCEPTED','PENDINGAPPROVAL'].includes(state))continue;
  const raw=norm(row[json]);if(!raw)continue;
  const email=norm(row[assigned]).toLowerCase();
  if(!email||!lookup.has(email))continue; // Unresolved historical assignments cannot reserve a known auditor UID.
  let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('AUDIT_PLANNING_JSON_INVALID');}
  const blocks=Array.isArray(parsed)?parsed:parsed?.blocks;
  if(!Array.isArray(blocks)){console.warn('AVAILABILITY_LEGACY_PLANNING_WITHOUT_BLOCKS',JSON.stringify({sheetRow:rows.indexOf(row)+1,shape:Array.isArray(parsed)?'array':parsed===null?'null':typeof parsed,keys:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.keys(parsed).slice(0,20):[]}));continue;} // Same non-blocking legacy interpretation as canonical R4 blocks(raw).
  if(!blocks.length)continue; // Historical empty plans reserve no calendar time.
  for(const b of blocks){
   const d=norm(b?.date),start=norm(b?.start),end=norm(b?.end);
   if(!date(d)||!clock(start)||!clock(end,true)||start>=end)throw Error('AUDIT_PLANNING_SLOT_INVALID');
   if(d<fromDate||d>toDate)continue;
   const auditorId=lookup.get(email),signature=[auditId,d,start,end].join('|');
   if(seen.has(signature))throw Error('AUDIT_PLANNING_SLOT_DUPLICATE');seen.add(signature);
   slots.push({auditorId,auditId,date:d,start,end,state:state==='PENDINGAPPROVAL'?'PROVISIONAL':'COMMITTED',company:companyColumn<0?'':norm(row[companyColumn]),scopes:scopesColumn<0?'':norm(row[scopesColumn])});
  }
 }
 return slots;
}
export function canonicalAuditBlocksForAuditor({rows,auditors,auditorId,fromDate,toDate}={}){
 const slots=canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate,toDate});
 return committedBlocksFromCanonicalSlots({auditorId,slots});
}