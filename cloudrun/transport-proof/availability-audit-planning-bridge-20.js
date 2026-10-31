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
export function canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate,toDate,scopeNamesBySlot={}}={}){
 if(!Array.isArray(rows)||!Array.isArray(auditors)||!date(fromDate)||!date(toDate)||fromDate>toDate)throw Error('INVALID_AUDIT_BRIDGE_INPUT');
 if(!rows.length||!Array.isArray(rows[0]))throw Error('AUDIT_PLANNING_HEADERS_MISSING');
 const normalizedHeaders=rows[0].map(key).filter(Boolean);if(new Set(normalizedHeaders).size!==normalizedHeaders.length)throw Error('AUDIT_PLANNING_HEADERS_DUPLICATE');
 const h=rows[0],id=index(h,['Audit ID','Audit_ID']),status=index(h,['Status']),assigned=index(h,['Assigned to','Assigned auditor','Auditor']),json=index(h,['Planning JSON','Planning_JSON']);
 if([id,status,json].some(x=>x<0)||(assigned<0&&index(h,['Auditor_UID','Auditor UID','Assigned_Auditor_UID','Assigned Auditor UID'])<0))throw Error('AUDIT_PLANNING_HEADERS_MISSING');
 const assignedUid=index(h,['Auditor_UID','Auditor UID','Assigned_Auditor_UID','Assigned Auditor UID']);
 const companyColumn=index(h,['Company','Company name','Company Name','Company_Name','Company name (display)']),scopesColumn=index(h,['Scopes','Scope','Scope(s)','Scope names','Scope Names','Audit scopes']);
 const scopeSlotColumns=h.map((header,i)=>({slot:norm(header).toUpperCase(),i})).filter(x=>/^SCOPE_\d+$/.test(x.slot));
 const locationColumn=index(h,['Execution location','Execution Location','Location','Audit location','Site','Visit location']);
 const lookup=new Map(),uidLookup=new Set();
 for(const a of auditors){const uid=norm(a.auditorId),email=norm(a.email).toLowerCase();if(!uid||!email||lookup.has(email)||uidLookup.has(uid))throw Error('AUDITOR_IDENTITY_AMBIGUOUS');lookup.set(email,uid);uidLookup.add(uid);}
 const slots=[],seen=new Set(),seenAuditIds=new Set();
 for(const row of rows.slice(1)){
  const auditId=norm(row[id]),state=key(row[status]).toUpperCase();
  // Only these explicitly committed planning states can reserve an auditor.
  if(!['APPROVED','ACCEPTED','PENDINGAPPROVAL'].includes(state))continue;
  if(!auditId)throw Error('AUDIT_PLANNING_COMMITTED_ID_MISSING');
  if(seenAuditIds.has(auditId))throw Error('AUDIT_PLANNING_COMMITTED_ID_DUPLICATE');seenAuditIds.add(auditId);
  const raw=norm(row[json]);if(!raw)throw Error('AUDIT_PLANNING_COMMITTED_PLAN_MISSING');
  let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('AUDIT_PLANNING_JSON_INVALID');}
  const email=assigned<0?'':norm(row[assigned]).toLowerCase(),explicitUid=assignedUid<0?'':norm(row[assignedUid]);
  const payloadEmail=Array.isArray(parsed)?'':norm(parsed?.auditorEmail).toLowerCase();
  if(explicitUid&&!uidLookup.has(explicitUid))throw Error('AUDIT_PLANNING_AUDITOR_UID_UNKNOWN');
  const canonicalFromEmail=email?lookup.get(email):undefined;
  const canonicalFromPayload=payloadEmail?lookup.get(payloadEmail):undefined;
  if(explicitUid&&canonicalFromEmail&&canonicalFromEmail!==explicitUid)throw Error('AUDIT_PLANNING_AUDITOR_IDENTITY_CONFLICT');
  if(explicitUid&&canonicalFromPayload&&canonicalFromPayload!==explicitUid)throw Error('AUDIT_PLANNING_AUDITOR_IDENTITY_CONFLICT');
  if(canonicalFromEmail&&canonicalFromPayload&&canonicalFromEmail!==canonicalFromPayload)throw Error('AUDIT_PLANNING_AUDITOR_IDENTITY_CONFLICT');
  const auditorId=explicitUid||canonicalFromEmail||canonicalFromPayload;
  if(!auditorId)throw Error('AUDIT_PLANNING_AUDITOR_IDENTITY_UNRESOLVED');
  const blocks=Array.isArray(parsed)?parsed:parsed?.blocks;
  if(!Array.isArray(blocks))throw Error('AUDIT_PLANNING_COMMITTED_BLOCKS_INVALID');
  if(!blocks.length)throw Error('AUDIT_PLANNING_COMMITTED_BLOCKS_EMPTY');
  for(const b of blocks){
   const d=norm(b?.date),start=norm(b?.start),end=norm(b?.end);
   if(!date(d)||!clock(start)||!clock(end,true)||start>=end)throw Error('AUDIT_PLANNING_SLOT_INVALID');
   if(d<fromDate||d>toDate)continue;
   const signature=[auditId,d,start,end].join('|');
   if(seen.has(signature))throw Error('AUDIT_PLANNING_SLOT_DUPLICATE');seen.add(signature);
   const markedScopes=scopeSlotColumns.filter(x=>['x','yes','true','1'].includes(norm(row[x.i]).toLowerCase())).map(x=>norm(scopeNamesBySlot[x.slot])||x.slot);
   const scopeLabel=markedScopes.length?markedScopes.join(', '):scopesColumn<0?'':norm(row[scopesColumn]);
   slots.push({auditorId,auditId,date:d,start,end,state:state==='PENDINGAPPROVAL'?'PROVISIONAL':'COMMITTED',company:companyColumn<0?'':norm(row[companyColumn]),scopes:scopeLabel,location:locationColumn<0?'':norm(row[locationColumn])});
  }
 }
 return slots;
}
export function canonicalAuditBlocksForAuditor({rows,auditors,auditorId,fromDate,toDate}={}){
 const slots=canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate,toDate});
 return committedBlocksFromCanonicalSlots({auditorId,slots});
}