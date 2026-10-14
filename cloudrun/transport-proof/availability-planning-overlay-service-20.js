/** AMS Availability 2.0 — read-only canonical planning overlay for calendar and manager overview.
 * Never persists planning-derived blocks to Availability storage.
 * Canonical planning source is injected and must fail closed on incomplete data.
 */
import {canonicalAuditSlotsFromPlanningRows} from './availability-audit-planning-bridge-20.js';
import {committedBlocksFromCanonicalSlots,withCommittedOverlay} from './availability-committed-overlay-20.js';
import {resolveAvailabilityPeriod} from './availability-resolver-20.js';
import {buildManagerAvailabilityOverview} from './availability-manager-overview-20.js';
const clean=x=>String(x??'').trim();
export function createPlanningOverlayService({service,readPlanningRows,listCanonicalAuditors}={}){
 if(!service||typeof service.read!=='function'||typeof service.mutate!=='function'||typeof readPlanningRows!=='function'||typeof listCanonicalAuditors!=='function')throw Error('INVALID_OVERLAY_CONFIGURATION');
 async function slotsFor(fromDate,toDate,{fresh=false}={}){
  const [rows,auditors]=await Promise.all([readPlanningRows({fresh}),listCanonicalAuditors()]);
  if(!Array.isArray(rows)||!Array.isArray(auditors))throw Error('CANONICAL_PLANNING_UNAVAILABLE');
  return canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate,toDate});
 }
 async function period({actor,auditorId,fromDate,toDate}){
  const doc=await service.read(actor,auditorId);
  const slots=await slotsFor(fromDate,toDate);
  const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
  const merged=withCommittedOverlay(doc,blocks);
  const auditDetails={};for(const slot of slots){if(slot.auditorId!==auditorId)continue;const id='audit:'+slot.auditId+'|'+slot.date+'|'+slot.start+'|'+slot.end;auditDetails[id]={auditId:slot.auditId,company:slot.company||'',scopes:slot.scopes||''};}
  return {auditorId,version:doc.version,days:resolveAvailabilityPeriod({fromDate,toDate,...merged}),auditDetails,metadata:{...structuredClone(doc.metadata),baselineIds:(doc.baselineExceptions||[]).map(x=>x.id),recurring:structuredClone(doc.recurring||[])}};
 }
 async function managerOverview({actor,auditorIds,fromDate,toDate,displayNames={}}){
  if(clean(actor?.role).toLowerCase()!=='manager'||!clean(actor?.id))throw Error('NOT_AUTHORIZED');
  if(!Array.isArray(auditorIds)||auditorIds.length>250||new Set(auditorIds).size!==auditorIds.length)throw Error('INVALID_AUDITOR_SET');
  const slots=await slotsFor(fromDate,toDate);
  const auditors=await Promise.all(auditorIds.map(async auditorId=>{
   const doc=await service.read(actor,auditorId);
   const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
   return {auditorId,displayName:displayNames[auditorId]||auditorId,availability:withCommittedOverlay(doc,blocks),metadata:{...doc.metadata,availabilityVersion:doc.version}};
  }));
  return buildManagerAvailabilityOverview({fromDate,toDate,auditors});
 }
 async function mutate({actor,auditorId,expectedVersion,mutation,now}){
  if(['BLOCK_PERIOD','SET_FREE_OVERRIDE'].includes(mutation?.action)){
   const fromDate=clean(mutation.fromDate||mutation.date);
   const toDate=clean(mutation.toDate||mutation.fromDate||mutation.date);
   // Validate against authoritative planning before changing the baseline.
   // A baseline is not permitted to overwrite a committed audit.
   const slots=await slotsFor(fromDate,toDate,{fresh:true});
   const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
   const start=mutation.wholeDay===true?'00:00':clean(mutation.start);
   const end=mutation.wholeDay===true?'24:00':clean(mutation.end);
   if(blocks.some(b=>['COMMITTED','PROVISIONAL'].includes(b.state)&&b.date>=fromDate&&b.date<=toDate&&start<b.end&&b.start<end))throw Error('COMMITTED_CONFLICT');
  }
  return service.mutate({actor,auditorId,expectedVersion,mutation,...(now?{now}:{})});
 }
 return Object.freeze({period,managerOverview,mutate,read:service.read});
}