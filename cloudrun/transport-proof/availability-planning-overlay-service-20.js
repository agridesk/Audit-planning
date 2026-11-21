/** AMS Availability 2.0 — read-only canonical planning overlay for calendar and manager overview.
 * Never persists planning-derived blocks to Availability storage.
 * Canonical planning source is injected and must fail closed on incomplete data.
 */
import {canonicalAuditSlotsFromPlanningRows} from './availability-audit-planning-bridge-20.js';
import {committedBlocksFromCanonicalSlots,withCommittedOverlay} from './availability-committed-overlay-20.js';
import {resolveAvailabilityPeriod} from './availability-resolver-20.js';
import {buildManagerAvailabilityOverview} from './availability-manager-overview-20.js';
const clean=x=>String(x??'').trim();
const key=x=>clean(x).toLowerCase().replace(/[\s_-]+/g,'');
function verifiedInactiveSwap({audit,record,rows,swap}){
 const headers=rows[0].map(key),column=(...names)=>names.map(key).map(n=>headers.indexOf(n)).find(i=>i>=0)??-1;
 const id=column('Audit ID','Audit_ID'),status=column('Status');
 if(id<0||status<0||headers.filter(x=>x===headers[id]).length!==1||headers.filter(x=>x===headers[status]).length!==1)return false;
 const matched=rows.slice(1).filter(row=>clean(row[id])===swap.auditId);
 if(matched.length>1)return false;
 const state=key(audit?.snapshot?.status),action={pendingplanning:'CANCEL',rejected:'REJECT',completed:'COMPLETE'}[state];
 if(matched.length===1&&key(matched[0][status])!==state)return false;
 if(!matched.length&&action==='CANCEL')return false;
 const outbox=record?.value,operationId=audit?.lastProjectedOperationId;
 if(!action||!operationId||audit.auditId!==swap.auditId||audit.pendingOperationId||
    audit.lastOperationId!==operationId||
    !Array.isArray(audit.blocks)||audit.blocks.length||!Array.isArray(audit.claimIds)||audit.claimIds.length||
    outbox?.operationId!==operationId||outbox.state!=='PROJECTED'||outbox.action!==action||
    outbox.proof?.verified!==true||outbox.proof.auditId!==outbox.auditId||
    !/^[a-f0-9]{64}$/.test(outbox.proof.rowHash||'')||!Number.isSafeInteger(audit.revision))return false;
 if(action==='CANCEL'){
  const planning=column('Planning JSON','Planning_JSON'),date=column('Date - Planned','Date Planned'),decision=column('Last manager decision');
  if([planning,date,decision].some(i=>i<0)||clean(matched[0][planning])||clean(matched[0][date])||key(matched[0][decision])!=='cancel'||
     audit.removed===true||outbox.multi===true||outbox.auditId!==swap.auditId||outbox.revision!==audit.revision)return false;
 }else{
  if(audit.removed!==true||outbox.multi!==true||!Array.isArray(outbox.entities))return false;
  const entities=outbox.entities.filter(x=>x?.auditId===swap.auditId);
  if(entities.length!==1||entities[0].revision!==audit.revision||entities[0].removed!==true)return false;
 }
 const validTime=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)&&Number.isFinite(Date.parse(x));
 return validTime(record.createTime)&&validTime(swap.revision)&&Date.parse(record.createTime)>Date.parse(swap.revision);
}
function validateReadRange(fromDate,toDate){
 const parse=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return Date.parse(s+'T00:00:00Z')/86400000;};
 const from=parse(fromDate),to=parse(toDate);if(to<from||to-from>92)throw Error('QUERY_RANGE_OUT_OF_BOUNDS');
}
export function createPlanningOverlayService({service,readPlanningRows,listCanonicalAuditors,readScopeNames,readCanonicalSwaps,readInactiveSwapEvidence}={}){
 if(!service||typeof service.read!=='function'||typeof service.mutate!=='function'||typeof readPlanningRows!=='function'||typeof listCanonicalAuditors!=='function')throw Error('INVALID_OVERLAY_CONFIGURATION');
 async function slotsFor(fromDate,toDate,{fresh=false,incompleteAuditDiagnostics,canonicalAuditors}={}){
  if(canonicalAuditors!==undefined&&!Array.isArray(canonicalAuditors))throw Error('CANONICAL_PLANNING_UNAVAILABLE');
  const [rows,auditors,scopeNamesBySlot]=await Promise.all([readPlanningRows({fresh}),canonicalAuditors===undefined?listCanonicalAuditors():canonicalAuditors,readScopeNames?readScopeNames():{}]);
  if(!Array.isArray(rows)||!Array.isArray(auditors))throw Error('CANONICAL_PLANNING_UNAVAILABLE');
  const legacy=canonicalAuditSlotsFromPlanningRows({rows,auditors,fromDate:'1900-01-01',toDate:'2100-12-31',scopeNamesBySlot,incompleteAuditDiagnostics});
  if(typeof readCanonicalSwaps!=='function')return {slots:legacy.filter(x=>x.date>=fromDate&&x.date<=toDate),auditors};
  const swaps=await readCanonicalSwaps();
  if(swaps?.ok!==true||!Array.isArray(swaps.rows))throw Error('AVAILABILITY_SWAP_CANONICAL_READ_UNVERIFIED');
  const replaceIds=new Set(),canonical=[];
  for(const audit of swaps.rows){
   const id=clean(audit.auditId);
   if(!id||replaceIds.has(id)||!Array.isArray(audit.plannedBlocks)||!audit.plannedBlocks.length)throw Error('AVAILABILITY_SWAP_CANONICAL_INVALID');
   replaceIds.add(id);
   const prior=legacy.filter(x=>x.auditId===id);
   if(!prior.length){
    if(typeof readInactiveSwapEvidence==='function'){
     const evidence=await readInactiveSwapEvidence(id);
     if(verifiedInactiveSwap({...evidence,rows,swap:audit}))continue;
    }
    throw Error('AVAILABILITY_SWAP_SHEET_AUDIT_NOT_FOUND');
   }
   const meta=prior[0];
   for(const block of audit.plannedBlocks){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(block.date||''))||!/^\d{2}:\d{2}$/.test(String(block.start||''))||!/^\d{2}:\d{2}$/.test(String(block.end||''))||block.start>=block.end)throw Error('AVAILABILITY_SWAP_BLOCK_INVALID');
    canonical.push({...meta,date:block.date,start:block.start,end:block.end,state:'COMMITTED'});
   }
  }
  return {slots:legacy.filter(x=>!replaceIds.has(x.auditId)&&x.date>=fromDate&&x.date<=toDate).concat(canonical.filter(x=>x.date>=fromDate&&x.date<=toDate)),auditors};
 }
 function reviewDiagnostics(items,auditorIds,fromDate,toDate,{manager=false,roster}={}){
  const allowed=new Set(auditorIds);
  const known=new Set(roster.map(a=>clean(a.auditorId)));
  const current=[],historical=[],uncertain=new Set();let unknownOwner=false;
  for(const item of items){
   // An explicit undated transfer is a workflow task, not a calendar reservation.
   if(item.unplannedTransfer)continue;
   const uid=clean(item.auditorUid);
   // Auditor_UID is the only canonical owner. Email must never reassign history.
   const owner=uid&&known.has(uid)?uid:'';
   // This mirrors the existing mutation guard: undated, unassigned provisional
   // work has no occupied slot to protect. Do not invent a reservation.
   const state=clean(item.status).toLowerCase().replace(/[\s_-]+/g,'');
   if(state==='pendingapproval'&&!clean(item.plannedDate)&&!clean(item.assignedEmail)&&!uid)continue;
   if(owner&&!allowed.has(owner))continue;
   const plannedDate=clean(item.plannedDate);
   const validDate=/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)&&Number.isFinite(Date.parse(plannedDate+'T00:00:00Z'))&&new Date(plannedDate+'T00:00:00Z').toISOString().slice(0,10)===plannedDate;
   const entry={auditId:item.auditId,status:item.status,code:item.code,company:clean(item.company)||'Company not recorded',plannedDate:validDate?plannedDate:'',auditorId:owner};
   // A declared date outside the requested period is not a missing slot in that
   // period. Keep it separately visible: it cannot prove a full multi-day plan.
   const outside=validDate&&(plannedDate<fromDate||plannedDate>toDate);
   if(!owner&&!manager){if(!outside)unknownOwner=true;continue;} // Never disclose other auditors' audits.
   // Historical dated records remain reviewable but do not taint this period's
   // read-only selection. Mutation validation remains fail-closed globally.
   if(!outside){if(owner)uncertain.add(owner);else unknownOwner=true;}
   (outside?historical:current).push(entry);
  }
  return {incompleteAuditDiagnostics:current,outsidePeriodAuditDiagnostics:historical,uncertainAuditorIds:[...uncertain],unknownReservationOwner:unknownOwner};
 }
 async function period({actor,auditorId,fromDate,toDate,canonicalAuditors}){
  validateReadRange(fromDate,toDate);
  const doc=await service.read(actor,auditorId);
  const incompleteAuditDiagnostics=[];
  const {slots,auditors:roster}=await slotsFor(fromDate,toDate,{incompleteAuditDiagnostics,...(clean(actor?.role).toLowerCase()==='manager'&&canonicalAuditors!==undefined?{canonicalAuditors}:{})});
  const review=reviewDiagnostics(incompleteAuditDiagnostics,[auditorId],fromDate,toDate,{manager:clean(actor?.role).toLowerCase()==='manager',roster});
  const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
  const merged=withCommittedOverlay(doc,blocks);
  const auditDetails={};for(const slot of slots){if(slot.auditorId!==auditorId)continue;const id='audit:'+slot.auditId+'|'+slot.date+'|'+slot.start+'|'+slot.end;auditDetails[id]={auditId:slot.auditId,company:slot.company||'',scopes:slot.scopes||'',location:slot.location||'',date:slot.date,start:slot.start,end:slot.end,state:slot.state};}
  return {auditorId,version:doc.version,days:resolveAvailabilityPeriod({...merged,fromDate,toDate}),auditDetails,...review,metadata:{...structuredClone(doc.metadata),baselineIds:(doc.baselineExceptions||[]).map(x=>x.id),baselineExceptions:structuredClone(doc.baselineExceptions||[]),recurring:structuredClone(doc.recurring||[])}};
 }
 async function managerOverview({actor,auditorIds,fromDate,toDate,displayNames={},canonicalAuditors}){
  validateReadRange(fromDate,toDate);
  if(clean(actor?.role).toLowerCase()!=='manager'||!clean(actor?.id))throw Error('NOT_AUTHORIZED');
  if(!Array.isArray(auditorIds)||auditorIds.length>250||new Set(auditorIds).size!==auditorIds.length)throw Error('INVALID_AUDITOR_SET');
  const incompleteAuditDiagnostics=[];
  const {slots,auditors:roster}=await slotsFor(fromDate,toDate,{incompleteAuditDiagnostics,...(canonicalAuditors!==undefined?{canonicalAuditors}:{})});
  const auditors=await Promise.all(auditorIds.map(async auditorId=>{
   const doc=await service.read(actor,auditorId);
   const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
   return {auditorId,displayName:displayNames[auditorId]||auditorId,availability:withCommittedOverlay(doc,blocks),metadata:{...doc.metadata,availabilityVersion:doc.version}};
  }));
  const overview=buildManagerAvailabilityOverview({fromDate,toDate,auditors});
  const auditDetailsByAuditor={};for(const slot of slots){if(!auditorIds.includes(slot.auditorId))continue;(auditDetailsByAuditor[slot.auditorId]??=[]).push({auditId:slot.auditId,date:slot.date,start:slot.start,end:slot.end,state:slot.state,company:slot.company||'',scopes:slot.scopes||'',location:slot.location||''});}
  const review=reviewDiagnostics(incompleteAuditDiagnostics,auditorIds,fromDate,toDate,{manager:true,roster});
  return {...overview,auditDetailsByAuditor,...review};
 }
 async function searchAudits({actor,auditorId,term}){
  const role=clean(actor?.role).toLowerCase(),actorId=clean(actor?.id),target=clean(auditorId);
  if(!actorId||!target||role!=='auditor'||actorId!==target)throw Error('NOT_AUTHORIZED');
  const query=clean(term);
  if(query.length<2||query.length>100)throw Error('INVALID_SEARCH_TERM');
  // Query canonical audit slots for all months, never only the visible calendar.
  // Incomplete historical plans cannot yield a dated search hit.
  const incompleteAuditDiagnostics=[];
  const {slots}=await slotsFor('1900-01-01','2100-12-31',{incompleteAuditDiagnostics});
  const seen=new Set(),matches=[];
  for(const slot of slots){
   if(slot.auditorId!==target||!slot.company.toLocaleLowerCase().includes(query.toLocaleLowerCase()))continue;
   const id=[slot.auditId,slot.date,slot.start,slot.end].join('|');
   if(seen.has(id))continue;
   seen.add(id);
   matches.push({company:slot.company,date:slot.date,start:slot.start,end:slot.end,state:slot.state});
  }
  matches.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.company.localeCompare(b.company));
  return {results:matches.slice(0,100),truncated:matches.length>100};
 }
 async function mutate({actor,auditorId,expectedVersion,mutation,now}){
  const role=clean(actor?.role).toLowerCase(),actorId=clean(actor?.id),target=clean(auditorId);
  if(!actorId||!target||!(role==='manager'||role==='auditor'&&actorId===target))throw Error('NOT_AUTHORIZED');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=Number.MAX_SAFE_INTEGER)throw Error('VERSION_CONFLICT');
  if(!mutation||typeof mutation!=='object'||Array.isArray(mutation))throw Error('INVALID_MUTATION');
  let affectedAudits=[];
  if(['BLOCK_PERIOD','EDIT_HARD_BLOCK','SET_FREE_OVERRIDE'].includes(mutation?.action)){
   const fromDate=clean(mutation.fromDate||mutation.date);
   const toDate=clean(mutation.toDate||mutation.fromDate||mutation.date);
   const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
   if(!dateValid(fromDate)||!dateValid(toDate)||fromDate>toDate)throw Error('INVALID_DATE_RANGE');
   if((Date.parse(toDate+'T00:00:00Z')-Date.parse(fromDate+'T00:00:00Z'))/86400000>3660)throw Error('PERIOD_TOO_LONG');
   const validStart=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
   const validEnd=s=>validStart(s)||s==='24:00';
   const startTime=mutation.wholeDay===true?'00:00':mutation.start,endTime=mutation.wholeDay===true?'24:00':mutation.end;
   if(!validStart(startTime)||!validEnd(endTime)||startTime>=endTime)throw Error('INVALID_TIME_RANGE');
   // Validate against authoritative planning before changing the baseline.
   // A baseline is not permitted to overwrite a committed audit.
   const incompleteAuditDiagnostics=[];
   const {slots}=await slotsFor(fromDate,toDate,{fresh:true,incompleteAuditDiagnostics});
   if(incompleteAuditDiagnostics.length){
    // Missing plan payload must not globally block unrelated auditors.
    // Unknown owner of an actually dated/accepted audit still fails closed.
    const canonicalAuditors=await listCanonicalAuditors();
    const validAuditorIds=new Set(canonicalAuditors.map(a=>clean(a.auditorId)));
    for(const audit of incompleteAuditDiagnostics){
     const state=clean(audit.status).toLowerCase().replace(/[\s_-]+/g,'');
     const knownUid=clean(audit.auditorUid);
     const legacyEmail=clean(audit.assignedEmail).toLowerCase();
     const emailOwner=legacyEmail?canonicalAuditors.find(a=>clean(a.email).toLowerCase()===legacyEmail):null;
     if(knownUid&&emailOwner&&clean(emailOwner.auditorId)!==knownUid)throw Error('AUDIT_PLANNING_AUDITOR_IDENTITY_CONFLICT');
     if(knownUid&&!validAuditorIds.has(knownUid))throw Error('AUDIT_PLANNING_AUDITOR_UID_UNKNOWN');
     const resolved=knownUid;
     if(!resolved){
      // An unassigned, undated Pending Approval has no auditor reservation
      // to protect. It remains a separate data-quality diagnostic.
      if(state==='pendingapproval'&&!clean(audit.plannedDate)&&!knownUid)continue;
      throw Error('AUDIT_PLANNING_INCOMPLETE_RESERVATION_UNCERTAIN');
     }
     if(resolved===auditorId)throw Error('AUDIT_PLANNING_INCOMPLETE_RESERVATION_UNCERTAIN');
    }
   }
   const blocks=committedBlocksFromCanonicalSlots({auditorId,slots});
   const start=mutation.wholeDay===true?'00:00':clean(mutation.start);
   const end=mutation.wholeDay===true?'24:00':clean(mutation.end);
   affectedAudits=slots.filter(slot=>slot.auditorId===auditorId&&slot.date>=fromDate&&slot.date<=toDate&&start<slot.end&&slot.start<end).map(slot=>({auditId:slot.auditId,date:slot.date,start:slot.start,end:slot.end,company:slot.company,state:slot.state}));
   // Availability is an independent baseline. Existing COMMITTED/PROVISIONAL
   // planning stays in its canonical source and overlays HARD in the resolver.
   // Mutating HARD must not delete, alter, or reject an occupied audit.
   // Confirmation of a provisional plan against HARD is a separate planning
   // commit gate, not an availability-write constraint.
   if(mutation.action==='SET_FREE_OVERRIDE'&&blocks.some(b=>(b.state==='COMMITTED'||b.state==='PROVISIONAL')&&b.date>=fromDate&&b.date<=toDate&&start<b.end&&b.start<end))throw Error('AUDIT_CONFLICT');
   // COMMITTED occupancy is authoritative; overlapping HARD writes fail closed.
   // Provisional intervals are revalidated by their canonical planning owner; never delete them here.
  }
  const result=await service.mutate({actor,auditorId,expectedVersion,mutation,...(now?{now}:{})});
  return {...result,protectedAudits:affectedAudits.filter(x=>x.state==='COMMITTED'),provisionalConflicts:mutation?.action==='SET_FREE_OVERRIDE'?[]:affectedAudits.filter(x=>x.state==='PROVISIONAL')};
 }
 return Object.freeze({period,managerOverview,searchAudits,mutate,read:service.read});
}