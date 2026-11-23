/** AMS 2.0 Manager Availability Overview — pure Node.js ESM read model.
 * Inputs MUST originate from authenticated, authorized canonical storage.
 * No writes, no external requests, no daily persistence materialization.
 */
import {resolveAvailabilityPeriod} from './availability-resolver-20.js';
import {committedBlocksFromCanonicalSlots,withCommittedOverlay} from './availability-committed-overlay-20.js';
const dateNumber=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;};
const clean=x=>String(x??'').trim();
const states=new Set(['FREE','SOFT','PROVISIONAL','HARD','COMMITTED']);
const validTimestamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
function freshness(meta,fromDate,toDate){
 const c=meta?.confirmation;
 if(!validTimestamp(c?.confirmedAt)||!c?.fromDate||!c?.throughDate||!Number.isFinite(Date.parse(c.confirmedAt)))return {status:'NOT_CONFIRMED',label:'Not confirmed'};
 let cf,ct;try{cf=dateNumber(c.fromDate);ct=dateNumber(c.throughDate);}catch{return {status:'NOT_CONFIRMED',label:'Not confirmed'};}
 if(cf>ct)return {status:'NOT_CONFIRMED',label:'Not confirmed'};
 const f=dateNumber(fromDate),t=dateNumber(toDate);
 if(cf>f||ct<t)return {status:'OUTSIDE_CONFIRMATION',label:'Not confirmed for this period'};
 if(meta?.lastAvailabilityChangeAt&&(!validTimestamp(meta.lastAvailabilityChangeAt)||(Date.parse(meta.lastAvailabilityChangeAt)>Date.parse(c.confirmedAt)&&(meta?.historyComplete!==true||!Array.isArray(meta?.changes)||meta.changes.length===0))))return {status:'REVIEW_NEEDED',label:'Review needed'};
 const changes=Array.isArray(meta?.changes)?meta.changes:[];
 if(meta?.historyComplete===true&&validTimestamp(meta?.lastAvailabilityChangeAt)&&changes.length>0&&!changes.some(x=>validTimestamp(x?.at)&&Date.parse(x.at)===Date.parse(meta.lastAvailabilityChangeAt)&&x.substantive===true))return {status:'REVIEW_NEEDED',label:'Review needed'};
 if(meta?.historyComplete===true&&changes.some(x=>!x||typeof x!=='object'||Array.isArray(x)||typeof x.substantive!=='boolean'||!x.at||!validTimestamp(x.at)||(x.substantive===true&&x.action!=='SET_RECURRING'&&(!x.fromDate||!x.toDate))))return {status:'REVIEW_NEEDED',label:'Review needed'};
 if(meta?.historyComplete===true&&changes.some(x=>{if(!x?.fromDate&&!x?.toDate)return false;try{return dateNumber(x.fromDate)>dateNumber(x.toDate);}catch{return true;}}))return {status:'REVIEW_NEEDED',label:'Review needed'};
 if(meta?.historyComplete===true&&!Array.isArray(meta?.changes))return {status:'REVIEW_NEEDED',label:'Review needed'};
 if(meta?.historyComplete===true&&changes.length===0&&Number.isSafeInteger(meta?.availabilityVersion)&&Number.isSafeInteger(c.availabilityVersion)&&meta.availabilityVersion!==c.availabilityVersion)return {status:'REVIEW_NEEDED',label:'Review needed'};
 if(!Number.isSafeInteger(c.availabilityVersion)||!Number.isSafeInteger(meta?.availabilityVersion)||c.availabilityVersion<0||meta.availabilityVersion<0||c.availabilityVersion>meta.availabilityVersion)return {status:'REVIEW_NEEDED',label:'Review needed'};
 // A later substantive change invalidates only overlapping confirmation coverage.
 const stale=changes.some(x=>{
  if(x?.substantive!==true)return false;
  if(!validTimestamp(x.at))return true;
  if(Date.parse(x.at)<=Date.parse(c.confirmedAt))return false;
  // Recurring availability changes have no finite date window and invalidate every confirmed period.
  if(x.action==='SET_RECURRING')return true;
  // Missing or invalid bounds must never silently preserve a confirmation.
  if(!x.fromDate||!x.toDate)return true;
  try{return dateNumber(x.fromDate)<=t&&dateNumber(x.toDate)>=f;}catch{return true;}
 });
 if(stale)return {status:'REVIEW_NEEDED',label:'Review needed'};
 // If event history is not complete, use version guard conservatively.
 if(meta?.historyComplete!==true&&Number.isSafeInteger(meta?.availabilityVersion)&&Number.isSafeInteger(c.availabilityVersion)&&meta.availabilityVersion!==c.availabilityVersion)return {status:'REVIEW_NEEDED',label:'Review needed'};
 return {status:'CONFIRMED',label:'Confirmed',confirmedAt:c.confirmedAt,confirmedThrough:c.throughDate};
}
export function buildManagerAvailabilityOverview({fromDate,toDate,auditors=[]}={}){
 const f=dateNumber(fromDate),t=dateNumber(toDate);
 if(t<f||t-f>92)throw Error('QUERY_RANGE_OUT_OF_BOUNDS');
 if(!Array.isArray(auditors)||auditors.length>250)throw Error('INVALID_AUDITOR_SET');
 const seen=new Set();
 return {fromDate,toDate,auditors:auditors.map(a=>{
  if(!a||typeof a!=='object'||Array.isArray(a))throw Error('INVALID_AUDITOR_RECORD');
  const auditorId=clean(a.auditorId);
  if(!auditorId||seen.has(auditorId))throw Error('DUPLICATE_OR_MISSING_AUDITOR_ID');
  seen.add(auditorId);
  if(a.availability!==undefined&&a.availability!==null&&(typeof a.availability!=='object'||Array.isArray(a.availability)))throw Error('INVALID_AVAILABILITY_SOURCE');
  const days=resolveAvailabilityPeriod({...(a.availability||{}),fromDate,toDate});
  const counts=Object.fromEntries([...states].map(s=>[s,0]));
  for(const day of days)for(const s of day.segments){if(!states.has(s.state))throw Error('UNKNOWN_STATE');const [h1,m1]=s.start.split(':').map(Number),[h2,m2]=s.end.split(':').map(Number);counts[s.state]+=(h2*60+m2)-(h1*60+m1);}
  return {auditorId,displayName:clean(a.displayName)||auditorId,lastAvailabilityChangeAt:a.metadata?.lastAvailabilityChangeAt||null,lastAvailabilityChangeBy:a.metadata?.lastAvailabilityChangeBy||null,confirmation:freshness(a.metadata,fromDate,toDate),days,stateMinutes:counts};
 })};
}

// Inputs must be complete, authorized Firestore availability and planning data.
// This is not a replacement for the legacy annual-capacity model or a parity claim.
export function buildAnnualAvailabilityStateTotals20({year,auditors,planningSlots,planningComplete}={}){
 if(!Number.isSafeInteger(year)||year<2000||year>3000)throw Error('INVALID_YEAR');
 if(planningComplete!==true||!Array.isArray(planningSlots))throw Error('ANNUAL_PLANNING_SOURCE_INCOMPLETE');
 if(!Array.isArray(auditors)||auditors.length>250)throw Error('INVALID_AUDITOR_SET');
 const byUid=new Map(),slotsByUid=new Map();
 for(const auditor of auditors){
  const uid=clean(auditor?.auditorId),doc=auditor?.availability;
  if(!uid||byUid.has(uid))throw Error('DUPLICATE_OR_MISSING_AUDITOR_ID');
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.auditorId!==uid||
     !Number.isSafeInteger(doc.version)||doc.version<0||doc.version>=Number.MAX_SAFE_INTEGER||
     ['blocks','recurring','overrides','baselineExceptions','baselineReleases'].some(field=>!Array.isArray(doc[field])))
   throw Error('ANNUAL_AVAILABILITY_SOURCE_INVALID');
  byUid.set(uid,auditor);slotsByUid.set(uid,[]);
 }
 for(const slot of planningSlots){
  if(!slot||typeof slot.auditorId!=='string'||!slotsByUid.has(slot.auditorId))
   throw Error('ANNUAL_PLANNING_OWNER_UNRESOLVED');
  slotsByUid.get(slot.auditorId).push(slot);
 }
 const start=Date.UTC(year,0,1)/86400000,end=Date.UTC(year+1,0,1)/86400000-1;
 const iso=day=>new Date(day*86400000).toISOString().slice(0,10);
 return {year,window:{start:'08:00',end:'18:00'},readOnly:true,writesPerformed:false,
  auditors:[...byUid].map(([uid,auditor])=>{
   const doc=auditor.availability,blocks=committedBlocksFromCanonicalSlots({auditorId:uid,slots:slotsByUid.get(uid)});
   const merged=withCommittedOverlay(doc,blocks),stateMinutes=Object.fromEntries([...states].map(state=>[state,0]));
   for(let first=start;first<=end;first+=93){
    const days=resolveAvailabilityPeriod({...merged,fromDate:iso(first),toDate:iso(Math.min(first+92,end))});
    for(const day of days)for(const segment of day.segments){
     const [sh,sm]=segment.start.split(':').map(Number),[eh,em]=segment.end.split(':').map(Number);
     stateMinutes[segment.state]+=Math.max(0,Math.min(eh*60+em,1080)-Math.max(sh*60+sm,480));
    }
   }
   return {auditorId:uid,availabilityVersion:doc.version,stateMinutes,
    confirmation:freshness({...doc.metadata,availabilityVersion:doc.version},iso(start),iso(end))};
  })};
}