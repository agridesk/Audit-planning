/** AMS 2.0 Manager Availability Overview — pure Node.js ESM read model.
 * Inputs MUST originate from authenticated, authorized canonical storage.
 * No writes, no external requests, no daily persistence materialization.
 */
import {resolveAvailabilityPeriod} from './availability-resolver-20.js';
const dateNumber=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;};
const clean=x=>String(x??'').trim();
const states=new Set(['FREE','SOFT','PROVISIONAL','HARD','COMMITTED']);
function freshness(meta,fromDate,toDate){
 const c=meta?.confirmation;
 if(!c?.confirmedAt||!c?.fromDate||!c?.throughDate)return {status:'NOT_CONFIRMED',label:'Not confirmed'};
 const cf=dateNumber(c.fromDate),ct=dateNumber(c.throughDate),f=dateNumber(fromDate),t=dateNumber(toDate);
 if(cf>f||ct<t)return {status:'OUTSIDE_CONFIRMATION',label:'Not confirmed for this period'};
 const changes=Array.isArray(meta?.changes)?meta.changes:[];
 // A later substantive change invalidates only overlapping confirmation coverage.
 const stale=changes.some(x=>{
  if(x?.substantive!==true)return false;
  if(!x.at||!Number.isFinite(Date.parse(x.at)))return true;
  if(x.at<=c.confirmedAt)return false;
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
  const auditorId=clean(a?.auditorId);
  if(!auditorId||seen.has(auditorId))throw Error('DUPLICATE_OR_MISSING_AUDITOR_ID');
  seen.add(auditorId);
  const days=resolveAvailabilityPeriod({fromDate,toDate,...(a.availability||{})});
  const counts=Object.fromEntries([...states].map(s=>[s,0]));
  for(const day of days)for(const s of day.segments){if(!states.has(s.state))throw Error('UNKNOWN_STATE');const [h1,m1]=s.start.split(':').map(Number),[h2,m2]=s.end.split(':').map(Number);counts[s.state]+=(h2*60+m2)-(h1*60+m1);}
  return {auditorId,displayName:clean(a.displayName)||auditorId,lastAvailabilityChangeAt:a.metadata?.lastAvailabilityChangeAt||null,lastAvailabilityChangeBy:a.metadata?.lastAvailabilityChangeBy||null,confirmation:freshness(a.metadata,fromDate,toDate),days,stateMinutes:counts};
 })};
}