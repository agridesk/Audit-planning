/** Issue #87: DEV-only Together/Separately transactional composition.
 * This service has NO HTTP route. Call only after an authoritative, fresh
 * Model C / source-revision / qualification / Availability preflight.
 * Firestore is committed once, followed by fully verified Sheets projection.
 */
import {createHash} from 'node:crypto';
import {validateScopeVisitAllocation20} from './model-c-scope-allocation-20.mjs';
const str=x=>String(x??'').trim();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const distinct=xs=>new Set(xs).size===xs.length;
const state=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
function validate(preview,sourceAuditId,mode,requestedRevision){
 if(preview?.success!==true||preview.authorityPreflight!==true||preview.composition!==mode||
    preview.sourceAuditId!==sourceAuditId||preview.expectedSourceRevision!==requestedRevision||
    preview.freshAvailabilityProvenance!==true||preview.qualificationsVerified!==true||
    !preview.availabilityVersions||typeof preview.availabilityVersions!=='object'||
    !Array.isArray(preview.projectionWrites)||preview.projectionWrites.length===0||
    !Array.isArray(preview.projectionPreconditions)||preview.projectionPreconditions.length===0||
    !Array.isArray(preview.appendIntents)||preview.appendIntents.length===0||
    !Array.isArray(preview.visits)||preview.visits.length<1)
  throw Error('VISIT_COMPOSITION_AUTHORITY_PREFLIGHT_INCOMPLETE');
 const visits=preview.visits;
 const auditIds=visits.map(v=>str(v.auditId)),obligationIds=visits.flatMap(v=>v.obligationIds||[]);
 const active=preview.activeObligationIds;
 if(!Array.isArray(active)||active.length<1||!distinct(active)||active.some(x=>!str(x)))
  throw Error('VISIT_COMPOSITION_ACTIVE_LINK_MEMBERSHIP_MISMATCH');
 const remaining=mode==='SEPARATELY'?preview.remainingObligationIds||[]:[];
 if(mode==='SEPARATELY'&&(!Array.isArray(remaining)||!distinct(remaining)||
    remaining.some(id=>!str(id)||obligationIds.includes(id))||
    active.length!==obligationIds.length+remaining.length||
    active.some(id=>!obligationIds.includes(id)&&!remaining.includes(id))))
  throw Error('VISIT_COMPOSITION_PARTIAL_LINK_PARTITION_INVALID');
 if(mode==='TOGETHER'&&
    (active.length!==obligationIds.length||active.some(id=>!obligationIds.includes(id))))
  throw Error('VISIT_COMPOSITION_ACTIVE_LINK_MEMBERSHIP_MISMATCH');
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
 const minute=t=>{const m=/^(\d{2}):(\d{2})$/.exec(str(t));if(!m)return NaN;const h=Number(m[1]),n=Number(m[2]);return h<24&&n<60?h*60+n:NaN;};
 const intervals=allBlocks.map(b=>({...b,from:minute(b.start),to:minute(b.end)}));
 if(intervals.some(b=>!Number.isFinite(b.from)||!Number.isFinite(b.to)||b.to<=b.from))
  throw Error('VISIT_COMPOSITION_INTERVAL_INVALID');
 for(const v of visits){
  const minutes=intervals.filter(b=>b.visitId===v.auditId).reduce((sum,b)=>sum+b.to-b.from,0);
  if(Math.abs(minutes-v.requiredMinutes)>15)throw Error('VISIT_COMPOSITION_FORMAL_HOURS_MISMATCH');
  if(mode==='TOGETHER'&&v.snapshot.allocations?.reduce((sum,a)=>sum+a.minutes,0)!==minutes)
   throw Error('VISIT_COMPOSITION_ALLOCATION_MINUTES_MISMATCH');
 }
 const ordered=intervals.slice().sort((a,b)=>a.auditorId.localeCompare(b.auditorId)||a.date.localeCompare(b.date)||a.from-b.from);
 for(let i=1;i<ordered.length;i++){
  const a=ordered[i-1],b=ordered[i];
  if(a.auditorId===b.auditorId&&a.date===b.date&&a.to>b.from)
   throw Error('VISIT_COMPOSITION_CAPACITY_SELF_OVERLAP');
 }
 if(mode==='TOGETHER'){
  if(!preview.scopeAllocation||preview.scopeAllocation.auditId!==sourceAuditId||
     preview.scopeAllocation.composition!=='TOGETHER')
   throw Error('VISIT_COMPOSITION_SCOPE_ALLOCATION_PROOF_REQUIRED');
  const allocated=validateScopeVisitAllocation20(preview.scopeAllocation);
  if(allocated.scopes.length!==obligationIds.length||
     allocated.scopes.some(x=>x.remainingMinutes!==0||x.plannedMinutes!==x.requiredMinutes)||
     allocated.blocks.some(x=>x.unallocatedMinutes!==0))
   throw Error('VISIT_COMPOSITION_SCOPE_ALLOCATION_INCOMPLETE');
  const key=x=>[str(x.blockId),str(x.obligationId),Number(x.minutes)].join('|');
  const expected=preview.scopeAllocation.allocations.map(key).sort();
  const actual=visits[0].snapshot.allocations.map(key).sort();
  if(expected.length!==actual.length||expected.some((x,i)=>x!==actual[i]))
   throw Error('VISIT_COMPOSITION_SCOPE_ALLOCATION_DIVERGED');
  if(auditIds.length!==1||auditIds[0]!==sourceAuditId||
     visits[0].obligationIds.length<2||state(visits[0].snapshot.status)!=='APPROVED')
   throw Error('VISIT_COMPOSITION_TOGETHER_IDENTITY_INVALID');
  // Together is one physical Visit with explicit allocation for each Obligation.
  // Do not manufacture a second audit ID or double-count physical blocks.
  if(preview.entities?.length!==1||preview.entities[0].auditId!==sourceAuditId||
     preview.entities[0].remove===true||
     JSON.stringify(preview.entities[0].nextSnapshot)!==JSON.stringify(visits[0].snapshot)||
     !Array.isArray(visits[0].snapshot.allocations)||
     new Set(visits[0].snapshot.allocations.map(x=>str(x.obligationId))).size!==visits[0].obligationIds.length||
     visits[0].snapshot.allocations.some(x=>!visits[0].obligationIds.includes(str(x.obligationId))||
      !Number.isSafeInteger(x.minutes)||x.minutes<=0))
   throw Error('VISIT_COMPOSITION_TOGETHER_ENTITY_INVALID');
 }else{
  if(auditIds.includes(sourceAuditId)||visits.some(v=>state(v.snapshot.status)!=='APPROVED'||v.obligationIds.length!==1)||
     !preview.sourceTombstone||preview.sourceTombstone.auditId!==sourceAuditId||
     !Array.isArray(preview.entities)||preview.entities.length!==visits.length+1)
   throw Error('VISIT_COMPOSITION_SPLIT_ENTITY_INVALID');
  // Retire identity, not lifecycle status. The source Audit stays in
  // history with an explicit successor lineage; no fake Completed/Rejected.
  const retired=preview.sourceTombstone,partial=remaining.length>0;
  if((partial?
      retired.partialScopePlanning!==true||retired.identityRetired===true||
      retired.composition!=='SEPARATELY'||
      JSON.stringify(retired.remainingObligationIds)!==JSON.stringify(remaining):
      retired.identityRetired!==true||retired.retirementReason!=='VISIT_COMPOSITION_SPLIT')||
     !Array.isArray(retired.successorAuditIds)||
     auditIds.some(id=>!retired.successorAuditIds.includes(id))||
     JSON.stringify(preview.entities.find(e=>e.auditId===sourceAuditId)?.nextSnapshot)!==
      JSON.stringify(retired))
   throw Error('VISIT_COMPOSITION_SOURCE_RETIREMENT_LINEAGE_INVALID');
  // Materialized split IDs must be derived from the source Audit + Company
  // + Obligation identity, never supplied freely by the client.
  for(const visit of visits){
   if(visit.companyUid!==visits[0].companyUid)
    throw Error('VISIT_COMPOSITION_CROSS_COMPANY_SPLIT_DENIED');
   const expected='VIS-'+createHash('sha256').update(
    ['AMS_SPLIT_V1',sourceAuditId,visit.companyUid,visit.obligationIds[0]].join('|')
   ).digest('hex').slice(0,20).toUpperCase();
   if(visit.auditId!==expected)
    throw Error('VISIT_COMPOSITION_SPLIT_IDENTITY_NOT_DETERMINISTIC');
  }
  // Exact link transfer is mandatory for split: source links are tombstoned
  // in the writeset and each successor receives precisely one ACTIVE link.
  // A boolean flag alone is not Model C evidence.
  const linkWrites=preview.projectionWrites.filter(x=>
   /^Audit_Visit_Obligations!/.test(str(x.range)));
  const closedRows=linkWrites.flatMap(x=>x.values||[])
   .filter(r=>Array.isArray(r)&&str(r[0])===sourceAuditId&&
    state(r[2])==='INACTIVE');
  const closed=new Set(closedRows.map(r=>str(r[1])));
  const linkAppends=preview.appendIntents.filter(x=>
   /^Audit_Visit_Obligations!A:F$/.test(str(x.range)));
  const opened=linkAppends.flatMap(x=>x.values||[])
   .filter(r=>Array.isArray(r)&&state(r[2])==='ACTIVE');
  if(closedRows.length!==obligationIds.length||closed.size!==obligationIds.length||
     obligationIds.some(id=>!closed.has(id))||opened.length!==visits.length||
     visits.some(v=>opened.filter(r=>str(r[0])===v.auditId&&
      str(r[1])===v.obligationIds[0]).length!==1))
   throw Error('VISIT_COMPOSITION_MODEL_C_LINK_TRANSFER_INCOMPLETE');
  // Distinct canonical successors must be represented in the projected
  // Audit planning tab. Resolve the Audit ID column from the source header.
  const planningIndex=preview.planningAuditIdColumnIndex;
  if(!Number.isSafeInteger(planningIndex)||planningIndex<0||planningIndex>100)
   throw Error('VISIT_COMPOSITION_PLANNING_ID_COLUMN_UNVERIFIED');
  const statusIndex=preview.planningStatusColumnIndex,
   planningJsonIndex=preview.planningJsonColumnIndex;
  if(!Number.isSafeInteger(statusIndex)||statusIndex<0||statusIndex>100||
     !Number.isSafeInteger(planningJsonIndex)||planningJsonIndex<0||planningJsonIndex>100)
   throw Error('VISIT_COMPOSITION_SOURCE_PROJECTION_COLUMNS_UNVERIFIED');
  const sourceRows=preview.projectionWrites.filter(x=>
   /^Audit planning!/.test(str(x.range))).flatMap(x=>x.values||[])
   .filter(row=>Array.isArray(row)&&str(row[planningIndex])===sourceAuditId);
  if(sourceRows.length!==1||state(sourceRows[0][statusIndex])!==state(retired.status))
   throw Error('VISIT_COMPOSITION_SOURCE_PROJECTION_INVALID');
  let retiredJson;
  try{retiredJson=JSON.parse(str(sourceRows[0][planningJsonIndex]));}
  catch{throw Error('VISIT_COMPOSITION_SOURCE_RETIREMENT_JSON_MISSING');}
  if((partial?
      retiredJson?.partialScopePlanning!==true||
      retiredJson.composition!=='SEPARATELY'||
      JSON.stringify(retiredJson.remainingObligationIds)!==JSON.stringify(remaining):
      retiredJson?.identityRetired!==true||
      retiredJson.retirementReason!=='VISIT_COMPOSITION_SPLIT')||
     !Array.isArray(retiredJson.successorAuditIds)||
     auditIds.some(id=>!retiredJson.successorAuditIds.includes(id)))
   throw Error('VISIT_COMPOSITION_SOURCE_RETIREMENT_JSON_MISMATCH');
  const newRows=preview.appendIntents.filter(x=>
   /^Audit planning!A:[A-Z]+$/.test(str(x.range)))
   .flatMap(x=>x.values||[]);
  if(newRows.length!==visits.length||
     visits.some(v=>newRows.filter(row=>Array.isArray(row)&&
      str(row[planningIndex])===v.auditId).length!==1))
   throw Error('VISIT_COMPOSITION_SUCCESSOR_PLANNING_ROWS_MISSING');
  const entityIds=preview.entities.map(e=>str(e.auditId));
  if(!distinct(entityIds)||!entityIds.includes(sourceAuditId)||auditIds.some(id=>!entityIds.includes(id))||
     preview.entities.find(e=>e.auditId===sourceAuditId)?.remove===partial||
     visits.some(v=>preview.entities.find(e=>e.auditId===v.auditId)?.expectedRevision!==null||
      JSON.stringify(preview.entities.find(e=>e.auditId===v.auditId)?.nextSnapshot)!==JSON.stringify(v.snapshot)))
   throw Error('VISIT_COMPOSITION_SPLIT_ENTITY_INTEGRITY');
 }
 if(!preview.modelCLinkTransferVerified||!preview.notificationIntentsVerified||
    !preview.sourceIdentityCollisionChecked||!preview.sourceRevisionChecked)
  throw Error('VISIT_COMPOSITION_CANONICAL_PROOF_MISSING');
 // Queue schema A:M: D=Recipient, E=Audit ID. Every materialized Visit
 // must have its own durable notification identity, including Separately.
 const queue=preview.appendIntents.filter(x=>str(x.range)==='Notification Queue!A:M')
  .flatMap(x=>x.values||[]);
 if(visits.some(v=>!queue.some(row=>Array.isArray(row)&&
    str(row[4])===v.auditId&&str(row[3]))))
  throw Error('VISIT_COMPOSITION_NOTIFICATION_RECIPIENT_MISSING');
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
   if(!parent||!Number.isSafeInteger(parent.revision)||parent.pendingOperationId||parent.removed===true||
      parent.snapshot?.sourceRevision!==preview.expectedSourceRevision||parent.snapshot?.legacyUnverified)
    throw Error('VISIT_COMPOSITION_SOURCE_CAS_FAILED');
   if(mode==='SEPARATELY'&&(state(parent.snapshot?.status)!=='PENDING_PLANNING'||
      state(preview.sourceTombstone.status)!==state(parent.snapshot.status)))
    throw Error('VISIT_COMPOSITION_SOURCE_STATUS_MUST_BE_PRESERVED');
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
    // Track the acquired lease before any subsequent validation can fail:
    // a mismatch must never strand a lease outside cleanup.
    leases.push({auditorId:group.auditorId,token:lease.token});
    const expectedVersion=preview.availabilityVersions[group.auditorId];
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||
       lease.version!==expectedVersion+1||lease.document?.version!==lease.version)
     throw Error('VISIT_COMPOSITION_AVAILABILITY_VERSION_DRIFT');
    hardGate({document:lease.document,blocks:group.blocks});
   }
   const plan={...preview.sourceTombstone,...preview.projectionPlan,
    auditId:sourceAuditId,
    // Durable auditor roster for multi-lease recovery after a process crash.
    // Tokens stay in the canonical Availability documents; never in Sheets.
    availabilityLeaseAuditors:groups.map(x=>x.auditorId),
    projectionWrites:preview.projectionWrites,
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
