/** AMS Availability 2.0 — read-only canonical planning overlay for calendar and manager overview.
 * Never persists planning-derived blocks to Availability storage.
 * Canonical planning source is injected and must fail closed on incomplete data.
 */
import {canonicalAuditSlotsFromPlanningRows} from './availability-audit-planning-bridge-20.js';
import {committedBlocksFromCanonicalSlots,withCommittedOverlay} from './availability-committed-overlay-20.js';
import {resolveAvailabilityPeriod} from './availability-resolver-20.js';
import {buildManagerAvailabilityOverview} from './availability-manager-overview-20.js';
const clean=x=>String(x??'').trim();
function validateReadRange(fromDate,toDate){
 const parse=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;};
 const from=parse(fromDate),to=parse(toDate);if(to<from||to-from>92)throw Error('QUERY_RANGE_OUT_OF_BOUNDS');
}
export function createPlanningOverlayService({service,readPlanningRows,listCanonicalAuditors,readScopeNames,readCanonicalSwaps}={}){
 if(!service||typeof service.read!=='function'||typeof service.mutate!=='function'||typeof readPlanningRows!=='function'||typeof listCanonicalAuditors!=='function')throw Error('INVALID_OVERLAY_CONFIGURATION');
 async function slotsFor(fromDate,toDate,{fresh=false}={}){
  const [rows,auditors,scopeNamesBySlot]=await Promise.all([readPlanningRows({fresh}),listCanonicalAuditors(),readScopeNames?readScopeNames():{}]);
  if(!Array.isArray(rows)||!Array.isArray(auditors))throw Error('CANONICAL_PLANNING_UNAVAILABLE');
  const legacy=canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate:'1900-01-01',toDate:'2100-12-31',scopeNamesBySlot});
  if(typeof readCanonicalSwaps!=='function')return legacy.filter(x=>x.date>=fromDate&&x.date<=toDate);
  const swaps=await readCanonicalSwaps();
  if(swaps?.ok!==true||!Array.isArray(swaps.rows))throw Error('AVAILABILITY_SWAP_CANONICAL_READ_UNVERIFIED');
  const replaceIds=new Set(),canonical=[];
  for(const audit of swaps.rows){
   const id=clean(audit.auditId);
   if(!id||replaceIds.has(id)||!Array.isArray(audit.plannedBlocks)||!audit.plannedBlocks.length)throw Error('AVAILABILITY_SWAP_CANONICAL_INVALID');
   replaceIds.add(id);
   const prior=legacy.filter(x=>x.auditId===id);
   if(!prior.length)throw Error('AVAILABILITY_SWAP_SHEET_AUDIT_NOT_FOUND');
   const meta=prior[0];
   for(const block of audit.plannedBlocks){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(block.date||''))||!/^\d{2}:\d{2}$/.test(String(block.start||''))||!/^\d{2}:\d{2}$/.test(String(block.end||''))||block.start>=block.end)throw Error('AVAILABILITY_SWAP_BLOCK_INVALID');
    canonical.push({...meta,date:block.date,start:block.start,end:block.end,state:'COMMITTED'});
   }
  }
  return legacy.filter(x=>!replaceIds.has(x.auditId)&&x.date>=fromDate&&x.date<=toDate).concat(canonical.filter(x=>x.date>=fromDate&&x.date<=toDate));
 }
 async function period({actor,auditorId,fromDate,toDate}){
  validateReadRange(fromDate,toDate);
  const doc=await service.read(actor,auditorId);
  const slots=await slotsFor(fromDate,toDate);
  const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
  const merged=withCommittedOverlay(doc,blocks);
  const auditDetails={};for(const slot of slots){if(slot.auditorId!==auditorId)continue;const id='audit:'+slot.auditId+'|'+slot.date+'|'+slot.start+'|'+slot.end;auditDetails[id]={auditId:slot.auditId,company:slot.company||'',scopes:slot.scopes||'',location:slot.location||'',date:slot.date,start:slot.start,end:slot.end,state:slot.state};}
  return {auditorId,version:doc.version,days:resolveAvailabilityPeriod({...merged,fromDate,toDate}),auditDetails,metadata:{...structuredClone(doc.metadata),baselineIds:(doc.baselineExceptions||[]).map(x=>x.id),baselineExceptions:structuredClone(doc.baselineExceptions||[]),recurring:structuredClone(doc.recurring||[])}};
 }
 async function managerOverview({actor,auditorIds,fromDate,toDate,displayNames={}}){
  validateReadRange(fromDate,toDate);
  if(clean(actor?.role).toLowerCase()!=='manager'||!clean(actor?.id))throw Error('NOT_AUTHORIZED');
  if(!Array.isArray(auditorIds)||auditorIds.length>250||new Set(auditorIds).size!==auditorIds.length)throw Error('INVALID_AUDITOR_SET');
  const slots=await slotsFor(fromDate,toDate);
  const auditors=await Promise.all(auditorIds.map(async auditorId=>{
   const doc=await service.read(actor,auditorId);
   const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
   return {auditorId,displayName:displayNames[auditorId]||auditorId,availability:withCommittedOverlay(doc,blocks),metadata:{...doc.metadata,availabilityVersion:doc.version}};
  }));
  const overview=buildManagerAvailabilityOverview({fromDate,toDate,auditors});
  const auditDetailsByAuditor={};for(const slot of slots){if(!auditorIds.includes(slot.auditorId))continue;(auditDetailsByAuditor[slot.auditorId]??=[]).push({auditId:slot.auditId,date:slot.date,start:slot.start,end:slot.end,state:slot.state,company:slot.company||'',scopes:slot.scopes||'',location:slot.location||''});}
  return {...overview,auditDetailsByAuditor};
 }
 async function mutate({actor,auditorId,expectedVersion,mutation,now}){
  const role=clean(actor?.role).toLowerCase(),actorId=clean(actor?.id),target=clean(auditorId);
  if(!actorId||!target||!(role==='manager'||role==='auditor'&&actorId===target))throw Error('NOT_AUTHORIZED');
  let affectedAudits=[];
  if(['BLOCK_PERIOD','EDIT_HARD_BLOCK','SET_FREE_OVERRIDE'].includes(mutation?.action)){
   const fromDate=clean(mutation.fromDate||mutation.date);
   const toDate=clean(mutation.toDate||mutation.fromDate||mutation.date);
   const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
   if(!dateValid(fromDate)||!dateValid(toDate)||fromDate>toDate)throw Error('INVALID_DATE_RANGE');
   // Validate against authoritative planning before changing the baseline.
   // A baseline is not permitted to overwrite a committed audit.
   const slots=await slotsFor(fromDate,toDate,{fresh:true});
   const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
   const start=mutation.wholeDay===true?'00:00':clean(mutation.start);
   const end=mutation.wholeDay===true?'24:00':clean(mutation.end);
   affectedAudits=slots.filter(slot=>slot.auditorId===auditorId&&slot.date>=fromDate&&slot.date<=toDate&&start<slot.end&&slot.start<end).map(slot=>({auditId:slot.auditId,date:slot.date,start:slot.start,end:slot.end,company:slot.company,state:slot.state}));
   if((mutation.action==='BLOCK_PERIOD'||mutation.action==='EDIT_HARD_BLOCK')&&affectedAudits.some(a=>a.state==='COMMITTED'))throw Error('COMMITTED_CONFLICT');
   if(mutation.action==='SET_FREE_OVERRIDE'&&blocks.some(b=>(b.state==='COMMITTED'||b.state==='PROVISIONAL')&&b.date>=fromDate&&b.date<=toDate&&start<b.end&&b.start<end))throw Error('AUDIT_CONFLICT');
   // COMMITTED occupancy is authoritative; overlapping HARD writes fail closed.
   // Provisional intervals are revalidated by their canonical planning owner; never delete them here.
  }
  const result=await service.mutate({actor,auditorId,expectedVersion,mutation,...(now?{now}:{})});
  return {...result,protectedAudits:affectedAudits.filter(x=>x.state==='COMMITTED'),provisionalConflicts:mutation?.action==='SET_FREE_OVERRIDE'?[]:affectedAudits.filter(x=>x.state==='PROVISIONAL')};
 }
 return Object.freeze({period,managerOverview,mutate,read:service.read});
}