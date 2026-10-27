// Issue #45: direct Auditor ACCEPT preparation; no side effects.
// All write operations require the separately verified cutover gate.
import {createHash} from 'node:crypto';
import {assertAuditorAcceptCutover20} from './lifecycle-accept-cutover-20.mjs';
const clean=x=>String(x??'').trim();
const index=(h,names)=>{for(const n of names){const i=h.findIndex(x=>clean(x).toLowerCase()===n.toLowerCase());if(i>=0)return i;}return -1;};
const read=(h,r,names)=>{const i=index(h,names);return i<0?'':clean(r[i]);};
export function prepareDirectAuditorAccept20({cutover,actor,audit,roster,now}={}){
  const {headers:h,row:r,sourceRow}=audit||{};
  if(!Array.isArray(h)||!Array.isArray(r)||!Number.isInteger(sourceRow)||sourceRow<2)throw Error('AUDITOR_ACCEPT_CANONICAL_ROW_REQUIRED');
  const auditId=read(h,r,['Audit ID','Audit_ID','AuditId','Audit Id']);
  assertAuditorAcceptCutover20({...cutover,auditorUid:actor?.auditorUid,auditId,expectedRevision:cutover?.expectedRevision});
  if(!actor?.email||clean(actor.role).toUpperCase()!=='AUDITOR')throw Error('AUDITOR_ACCEPT_ACTOR_INVALID');
  if(!Array.isArray(roster?.headers)||!Array.isArray(roster?.rows))throw Error('AUDITOR_ACCEPT_CURRENT_ROSTER_REQUIRED');
  const matches=roster.rows.filter(x=>read(roster.headers,x,['Auditor_UID','Auditor UID'])===actor.auditorUid);
  if(matches.length!==1)throw Error('AUDITOR_ACCEPT_IDENTITY_NOT_UNIQUE');
  const member=matches[0],email=clean(actor.email).toLowerCase();
  if(read(roster.headers,member,['E-mail','Email']).toLowerCase()!==email||read(roster.headers,member,['Role']).toUpperCase()!=='AUDITOR'||read(roster.headers,member,['Active']).toUpperCase()!=='YES')throw Error('AUDITOR_ACCEPT_CURRENT_IDENTITY_INVALID');
  if(read(h,r,['Auditor_UID','Auditor UID'])!==actor.auditorUid)throw Error('AUDITOR_ACCEPT_NOT_ASSIGNED');
  const assigned=read(h,r,['Assigned to','Assigned auditor','Auditor']).toLowerCase();
  const identities=[email,clean(actor.auditorUid).toLowerCase(),read(roster.headers,member,['Name']).toLowerCase(),read(roster.headers,member,['Abbreviation']).toLowerCase()];
  if(!assigned||!identities.includes(assigned))throw Error('AUDITOR_ACCEPT_ASSIGNMENT_MISMATCH');
  if(read(h,r,['Status']).toUpperCase().replace(/[ \t-]+/g,'_')!=='APPROVED')throw Error('AUDITOR_ACCEPT_STATUS_CONFLICT');
  const revisionParts=[auditId,read(h,r,['Status']),read(h,r,['Assigned to','Assigned auditor','Auditor']),read(h,r,['Planning JSON','Planning_JSON']),read(h,r,['Last decision timestamp']),read(h,r,['Status since'])];
  const revision=createHash('sha256').update(revisionParts.join('|')).digest('hex').slice(0,24);
  if(revision!==cutover.expectedRevision)throw Error('AUDITOR_ACCEPT_REVISION_CONFLICT');
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/.test(clean(now)))throw Error('AUDITOR_ACCEPT_TIMESTAMP_REQUIRED');
  const next=r.slice();
  const set=(names,value)=>{const i=index(h,names);if(i<0)throw Error('AUDITOR_ACCEPT_REQUIRED_COLUMN_MISSING_'+names[0]);next[i]=value;};
  set(['Status'],'Accepted');
  set(['Status since'],now);
  set(['Last auditor decision'],'ACCEPT');
  set(['Last auditor decision timestamp'],now);
  set(['Date accepted','Date - Accepted','Date Accepted'],now.slice(0,10));
  return Object.freeze({auditId,sourceRow,expectedRevision:revision,actorEmail:email,auditorUid:actor.auditorUid,beforeStatus:'Approved',afterStatus:'Accepted',row:next,operation:'AUDITOR_ACCEPT',needsAtomicOutbox:true});
}
