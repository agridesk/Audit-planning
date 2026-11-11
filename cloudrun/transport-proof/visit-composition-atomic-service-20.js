/** Issue #87: DEV-only Together/Separately transactional composition.
 * This service has NO HTTP route. Call only after an authoritative, fresh
 * Model C / source-revision / qualification / Availability preflight.
 * Firestore is committed once, followed by fully verified Sheets projection.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const distinct=xs=>new Set(xs).size===xs.length;
const state=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
function validate(preview,sourceAuditId,mode,requestedRevision){
 if(preview?.success!==true||preview.authorityPreflight!==true||preview.composition!==mode||
    preview.sourceAuditId!==sourceAuditId||preview.expectedSourceRevision!==requestedRevision||
    preview.freshAvailabilityProvenance!==true||preview.qualificationsVerified!==true||
    !Array.isArray(preview.projectionWrites)||preview.projectionWrites.length===0||
    !Array.isArray(preview.projectionPreconditions)||preview.projectionPreconditions.length===0||
    !Array.isArray(preview.appendIntents)||preview.appendIntents.length===0||
    !Array.isArray(preview.visits)||preview.visits.length<2)
  throw Error('VISIT_COMPOSITION_AUTHORITY_PREFLIGHT_INCOMPLETE');
 const visits=preview.visits;
 const auditIds=visits.map(v=>str(v.auditId)),obligationIds=visits.flatMap(v=>v.obligationIds||[]);
 if(auditIds.some(x=>!x)||!distinct(auditIds)||obligationIds.some(x=>!x)||!distinct(obligationIds)||
    visits.some(v=>!Array.isArray(v.obligationIds)||!v.obligationIds.length||
      !v.snapshot||v.snapshot.auditId!==v.auditId||
      !Array.isArray(v.blocks)||!v.blocks.length||
      !str(v.auditorId)||!str(v.auditorEmail)||!str(v.companyUid)||
      !Number.isSafeInteger(v.requiredMinutes)||v.requiredMinutes<=0))
  throw Error('VISIT_COMPOSITION_VISIT_IDENTITY_INVALID');
 const allBlocks=visits.flatMap(v=>v.blocks.map(b=>({...b,visitId:v.auditId,auditorId:v.auditorId})));
 if(allBlocks.some(b=>!/^\d{4}-\d{2}-\d{2}$/.test(str(b.date))||
    !/^\d{2}:\d{2}$/.test(str(b.start))||!/^\d{2}:\d{2}$/.test(str(b.end))))
  throw Error('VISIT_COMPOSITION_BLOCK_INVALID');
 if(mode==='TOGETHER'){
  if(auditIds.length!==2||auditIds[0]!==sourceAuditId||auditIds[1]!==sourceAuditId+'#ALLOCATION'||
     visits[0].auditorId!==visits[1].auditorId)
   throw Error('VISIT_COMPOSITION_TOGETHER_IDENTITY_INVALID');
  // Together is one physical Visit; the second record is allocation evidence,
  // not a new audit. Commit the actual canonical audit only.
  if(preview.entities?.length!==1||preview.entities[0].auditId!==sourceAuditId||
     preview.entities[0].remove===true)
   throw Error('VISIT_COMPOSITION_TOGETHER_ENTITY_INVALID');
 }else{
  if(auditIds.includes(sourceAuditId)||visits.some(v=>state(v.snapshot.status)!=='APPROVED')||
     !preview.sourceTombstone||preview.sourceTombstone.auditId!==sourceAuditId||
     !Array.isArray(preview.entities)||preview.entities.length!==visits.length+1)
   throw Error('VISIT_COMPOSITION_SPLIT_ENTITY_INVALID');
  const entityIds=preview.entities.map(e=>str(e.auditId));
  if(!distinct(entityIds)||!entityIds.includes(sourceAuditId)||auditIds.some(id=>!entityIds.includes(id))||
     preview.entities.find(e=>e.auditId===sourceAuditId)?.remove!==true||
     visits.some(v=>preview.entities.find(e=>e.auditId===v.auditId)?.expectedRevision!==null))
   throw Error('VISIT_COMPOSITION_SPLIT_ENTITY_INTEGRITY');
 }
 if(!preview.modelCLinkTransferVerified||!preview.notificationIntentsVerified||
    !preview.sourceIdentityCollisionChecked||!preview.sourceRevisionChecked)
  throw Error('VISIT_COMPOSITION_CANONICAL_PROOF_MISSING');
 const claimsByAuditor=new Map();
 for(const v of visits){
  const current=claimsByAuditor.get(v.auditorId)||{auditorId:v.auditorId,auditorEmail:v.auditorEmail,blocks:[]};
  if(current.auditorEmail!==v.auditorEmail)throw Error('VISIT_COMPOSITION_AUDITOR_IDENTITY_CONFLICT');
  current.blocks.push(...v.blocks);claimsByAuditor.set(v.auditorId,current);
 }
 return [...claimsByAuditor.values()].sort((a,b)=>a.auditorId.localeCompare(b.auditorId));
}
export function createVisitCompositionAtomicService20({store,gate,availabilityService,hardGate,preflight,projector,appendProjector}={}){
 const functions=[[store,'readAudit'],[store,'readOutbox'],[store,'commitMulti'],[store,'markProjected'],
  [gate,'acquire'],[gate,'release'],[gate,'uncertain'],
  [availabilityService,'acquirePlanningLease'],[availabilityService,'releasePlanningLease'],[availabilityService,'markPlanningLeaseUncertain'],
  [projector,'apply'],[projector,'inspect'],[appendProjector,'apply'],[appendProjector,'inspect']];
 if(functions.some(([o,k])=>typeof o?.[k]!=='function')||typeof hardGate!=='function'||typeof preflight!=='function')
  throw Error('VISIT_COMPOSITION_ATOMIC_DEPENDENCY_INVALID');
 async function commit({actor,body}={}){
  if(actor?.role!=='manager'||!str(actor.auditorId)||!str(body?.auditId)||
    !['TOGETHER','SEPARATELY'].includes(body?.composition)||!str(body.sourceRevision))
   throw Error('VISIT_COMPOSITION_MANAGER_REQUEST_INVALID');
  const sourceAuditId=str(body.auditId),mode=body.composition,operationId=digest({sourceAuditId,mode,actorId:actor.auditorId,body});
  const existing=await store.readOutbox(operationId);
  if(existing){
   if(existing.auditId!==sourceAuditId||existing.actorId!==actor.auditorId||
      existing.action!=='VISIT_COMPOSITION_'+mode)throw Error('VISIT_COMPOSITION_REPLAY_CONFLICT');
   if(existing.state==='PROJECTED')return {success:true,idempotent:true,sourceAuditId,operationId};
   throw Error('VISIT_COMPOSITION_RECOVERY_REQUIRED');
  }
  const leases=[],leaseActor={role:'manager',id:actor.auditorId};
  let lock=null,attempted=false,committed=false,projected=false;
  try{
   // Global gate must precede source preflight to eliminate read/write races.
   lock=await gate.acquire({operationId,actorId:actor.auditorId,kind:'VISIT_COMPOSITION_'+mode});
   const preview=await preflight({actor,body:{...body,authorityPreflight:true}});
   const groups=validate(preview,sourceAuditId,mode,str(body.sourceRevision));
   const parent=await store.readAudit(sourceAuditId);
   if(!parent||!Number.isSafeInteger(parent.revision)||parent.pendingOperationId||
      parent.snapshot?.sourceRevision!==preview.expectedSourceRevision||parent.snapshot?.legacyUnverified)
    throw Error('VISIT_COMPOSITION_SOURCE_CAS_FAILED');
   const entities=preview.entities;
   if(entities.find(e=>e.auditId===sourceAuditId)?.expectedRevision!==parent.revision)
    throw Error('VISIT_COMPOSITION_SOURCE_REVISION_MISMATCH');
   if(mode==='SEPARATELY'){
    for(const visit of preview.visits)if(await store.readAudit(visit.auditId))
     throw Error('VISIT_COMPOSITION_NEW_AUDIT_ID_COLLISION');
   }
   for(const group of groups){
    const lease=await availabilityService.acquirePlanningLease({
     actor:leaseActor,auditorId:group.auditorId,auditId:sourceAuditId,
     auditorEmail:group.auditorEmail,plannedBlocks:group.blocks});
    leases.push({auditorId:group.auditorId,token:lease.token});
    hardGate({document:lease.document,blocks:group.blocks});
   }
   const plan={...preview.sourceTombstone,...preview.projectionPlan,
    auditId:sourceAuditId,projectionWrites:preview.projectionWrites,
    projectionPreconditions:preview.projectionPreconditions,appendIntents:preview.appendIntents};
   attempted=true;
   const receipt=await store.commitMulti({operationId,actorId:actor.auditorId,
    action:'VISIT_COMPOSITION_'+mode,entities,projectionPlan:plan});
   committed=true;
   if(receipt.replayed)throw Error('VISIT_COMPOSITION_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan});
   await appendProjector.apply({operationId,gateToken:lock.token,intents:plan.appendIntents});
   const rows=await projector.inspect(plan),append=await appendProjector.inspect(plan.appendIntents);
   if(rows.state!=='MATCH'||append.state!=='MATCH')throw Error('VISIT_COMPOSITION_PROJECTION_UNVERIFIED');
   await store.markProjected({auditId:sourceAuditId,operationId,
    proof:{verified:true,auditId:sourceAuditId,rowHash:digest({rows:rows.detail,append:append.count})}});
   projected=true;
   for(const lease of leases){
    await availabilityService.releasePlanningLease({actor:leaseActor,...lease});
    lease.released=true;
   }
   await gate.release({token:lock.token,verified:true,proof:'VISIT_COMPOSITION_FIRESTORE_MODEL_C_SHEETS_VERIFIED'});
   lock=null;
   return {success:true,sourceAuditId,composition:mode,operationId,authority:'FIRESTORE',
    projection:'PROJECTED',auditIds:preview.visits.map(v=>v.auditId)};
  }finally{
   for(const lease of leases.filter(x=>!x.released)){
    try{
     if(!attempted)await availabilityService.releasePlanningLease({actor:leaseActor,...lease});
     else await availabilityService.markPlanningLeaseUncertain({actor:leaseActor,...lease,reason:'VISIT_COMPOSITION_WRITE_UNCERTAIN'});
    }catch{/* Preserve gate uncertainty, never pronounce success. */}
   }
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'VISIT_COMPOSITION_PREFLIGHT_REJECTED'});
    else if(projected)await gate.release({token:lock.token,verified:true,proof:'VISIT_COMPOSITION_PROJECTED_LEASE_UNCERTAIN'});
    else{
     if(committed&&typeof store.markUncertain==='function')
      await store.markUncertain({auditId:sourceAuditId,operationId,reason:'VISIT_COMPOSITION_PROJECTION_UNKNOWN'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'VISIT_COMPOSITION_TRANSACTION_OR_PROJECTION_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
