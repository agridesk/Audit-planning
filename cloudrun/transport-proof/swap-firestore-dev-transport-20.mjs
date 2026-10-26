import {requireSwapIndexCoverage} from './swap-index-coverage-gate-20.mjs';
import {createSwapReservationFenceReader} from './swap-reservation-fence-reader-20.mjs';
import {createSwapFirestoreReservationIndex} from './swap-firestore-reservation-index-20.mjs';
import {outsideSwapPair} from './swap-reservation-index-filter-20.mjs';
import {resolveSwapFirestoreReservations} from './swap-firestore-reservation-planner-20.mjs';
import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
import {createSwapFirestoreAtomicWriter} from './swap-firestore-atomic-writer-20.mjs';
import {createSwapDirectCommitCoordinator} from './swap-direct-commit-coordinator-20.mjs';
import {createSwapDirectProposalStore} from './swap-direct-proposal-store-20.mjs';
import {validateSwapCanonicalSchedule} from './swap-firestore-schedule-guard-20.mjs';
export function createSwapFirestoreDevTransport(options={}){
 const {project,getToken,fetchImpl,authorize,loadCompleteReservationIndex,expectedAvailabilityDocuments,canonicalCutoverVerified=false,enabled=false,resolveCanonicalAuditorUids,authorizeCanonicalAuditor,verifySourceFreeze}=options;
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||''))throw Error('SWAP_DEV_PROJECT_REQUIRED');
 const reader=createSwapFirestoreCanonicalReader({project,getToken,fetchImpl});
 const writer=createSwapFirestoreAtomicWriter({project,getToken,fetchImpl});
 const indexLoader=loadCompleteReservationIndex||createSwapFirestoreReservationIndex({project,getToken,fetchImpl}).loadCompleteReservationIndex;
 const readFence=createSwapReservationFenceReader({project,getToken,fetchImpl});
 const resolveFinalReservations=async context=>{
  const fence=await readFence();
  const index=requireSwapIndexCoverage(await indexLoader(context),expectedAvailabilityDocuments);
  const reservations=resolveSwapFirestoreReservations({...context,externalReservations:outsideSwapPair(index?.reservations||[],context.proposal.auditA,context.proposal.auditB),completeExternalIndex:index?.complete===true});
  return {reservations,fenceRevision:fence.revision};
 };
 const coordinator=createSwapDirectCommitCoordinator({project,readProposal:reader.readProposal,readJournal:reader.readJournal,readPair:reader.readPair,readAvailability:reader.readAvailability,atomicWriter:writer,authorize,resolveFinalReservations,enabled:enabled===true&&canonicalCutoverVerified===true});
 const directProposalStore=createSwapDirectProposalStore({project,getToken,fetchImpl});
 const assertSourceFreeze=async()=>{
  // Flags alone do not prove that the canonical Sheets writers were stopped.
  // A direct-write cutover must supply a independently verified, current
  // source-freeze evidence provider; absent proof always blocks mutations.
  if(typeof verifySourceFreeze!=='function'||await verifySourceFreeze()!==true)
   throw Error('SWAP_DIRECT_SHEETS_SOURCE_FREEZE_UNVERIFIED');
 };
 const propose=async({operationId,auditA,auditB,internalReason,ecasComment,actor}={})=>{
  if(enabled!==true||canonicalCutoverVerified!==true)return {ok:false,code:'SWAP_DIRECT_PROPOSE_DISABLED'};
  await assertSourceFreeze();
  if(actor?.role!=='manager'||!actor.email||typeof resolveCanonicalAuditorUids!=='function')
   throw Error('SWAP_DIRECT_MANAGER_OR_AUDITOR_DIRECTORY_UNAVAILABLE');
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(operationId||'')||typeof internalReason!=='string'||
     !internalReason.trim()||internalReason.length>500||typeof ecasComment!=='string'||
     !ecasComment.trim()||ecasComment.length>1000)throw Error('SWAP_DIRECT_PROPOSAL_INPUT_INVALID');
  const ids=[auditA,auditB];
  const [pair,availability]=await Promise.all([reader.readPair(ids),reader.readAvailability(ids)]);
  const draft=buildSwapFirestoreReadOnlyPreview({pair,availability});
  if(!draft?.eligible||draft.dateChanged!==true)throw Error('SWAP_DIRECT_PAIR_NOT_ELIGIBLE');
  const index=requireSwapIndexCoverage(await indexLoader({auditA,auditB}),expectedAvailabilityDocuments);
  if(!index.complete)throw Error('SWAP_DIRECT_RESERVATIONS_INCOMPLETE');
  const fence=await readFence();
  if(!fence?.revision)throw Error('SWAP_DIRECT_RESERVATION_FENCE_INVALID');
  const resolved=await resolveCanonicalAuditorUids({actor,owners:ids.map((id,i)=>pair[i].canonical.assignedTo),pair});
  if(!Array.isArray(resolved)||resolved.length!==2||resolved.some(uid=>!/^([A-Za-z0-9_-]{8,128})$/.test(uid)))
   throw Error('SWAP_DIRECT_CANONICAL_AUDITORS_UNVERIFIED');
  const uids=[...new Set(resolved)];
  const revisions={[auditA]:pair[0].canonical.revision,[auditB]:pair[1].canonical.revision};
  const proposal={operationId,auditA,auditB,requiredAuditorUids:uids,acknowledgedAuditorUids:[],
   createdBy:actor.email.toLowerCase(),createdAt:new Date().toISOString(),status:'AWAITING_ACKNOWLEDGEMENT',
   reminderSentAt:null,escalatedAt:null,originalRevisions:revisions,
   internalReason:internalReason.trim(),ecasComment:ecasComment.trim(),
   blocksA:draft.afterA,blocksB:draft.afterB,dateChanged:true};
  validateSwapCanonicalSchedule({proposal,pair});
  const stored=await directProposalStore.create(proposal);
  if(!stored.ok)return {ok:false,code:'SWAP_DIRECT_PROPOSAL_OPERATION_CONFLICT'};
  return {ok:true,status:proposal.status,operationId,requiresAcknowledgement:true,source:'firestore-direct'};
 };
 const respond=async({operationId,decision,actor}={})=>{
  if(enabled!==true||canonicalCutoverVerified!==true)return {ok:false,code:'SWAP_DIRECT_RESPOND_DISABLED'};
  await assertSourceFreeze();
  if(typeof authorizeCanonicalAuditor!=='function')throw Error('SWAP_DIRECT_AUDITOR_DIRECTORY_UNAVAILABLE');
  return directProposalStore.respond({operationId,decision,actor,authorizeAuditor:authorizeCanonicalAuditor});
 };
 const list=async({actor}={})=>{
  if(enabled!==true||canonicalCutoverVerified!==true)return {ok:false,code:'SWAP_DIRECT_LIST_DISABLED'};
  await assertSourceFreeze();
  return directProposalStore.list({actor,authorizeAuditor:authorizeCanonicalAuditor});
 };
 const getProposal=async({operationId,actor}={})=>{
  if(enabled!==true||canonicalCutoverVerified!==true)return {ok:false,code:'SWAP_DIRECT_GET_PROPOSAL_DISABLED'};
  await assertSourceFreeze();
  if(actor?.role!=='manager'||!actor.email)throw Error('SWAP_DIRECT_MANAGER_UNAUTHORIZED');
  const proposal=await reader.readProposal(operationId);
  const journal=await reader.readJournal(operationId);
  const stage=journal?.stage||'NOT_STARTED';
  const requiresManualReview=Boolean(journal&&stage!=='COMMITTED');
  return {ok:true,readOnly:true,operationId,status:proposal.status,
   auditA:proposal.auditA,auditB:proposal.auditB,dateChanged:proposal.dateChanged===true,
   acknowledgedCount:(proposal.acknowledgedAuditorUids||[]).length,
   requiredCount:(proposal.requiredAuditorUids||[]).length,
   journalStage:stage,journalSequence:journal?1:0,journalRequiresManualReview:requiresManualReview,
   commitEnabled:proposal.status==='CONFIRMED'&&!journal,
   source:'firestore-canonical'};
 };
 const preview=async({auditA,auditB}={})=>{
  if(typeof auditA!=='string'||typeof auditB!=='string'||!auditA||!auditB||auditA===auditB)return null;
  const ids=[auditA,auditB];
  const [pair,availability]=await Promise.all([reader.readPair(ids),reader.readAvailability(ids)]);
  return buildSwapFirestoreReadOnlyPreview({pair,availability});
 };
 const commit=async args=>{if(enabled===true&&canonicalCutoverVerified===true)await assertSourceFreeze();return coordinator.commit(args);};
 return Object.freeze({...reader,preview,propose,respond,getProposal,list,commit});
}

/** Read-only preview readiness check; no commit or routing authorization. */
export function assessSwapFirestorePreviewReadiness({pair,availability,index,expectedDocuments=20,orphanReservationsUnresolved=true}={}){
 const reasons=[];
 if(!Array.isArray(pair)||pair.length!==2||!Array.isArray(availability)||availability.length!==2)reasons.push('PAIR_INVALID');
 else {
 if(!pair[0]?.auditId||pair[0].auditId===pair[1]?.auditId)reasons.push('PAIR_ID_INVALID');
 for(let i=0;i<2;i++){
  const audit=pair[i],av=availability[i];
  if(audit?.source!=='firestore-canonical'||av?.source!=='firestore-canonical'||audit?.auditId!==av?.auditId)reasons.push('PAIR_SOURCE_INVALID');
  if(audit?.canonical?.status!=='Accepted'||!Array.isArray(audit?.canonical?.plannedBlocks)||!audit.canonical.plannedBlocks.length)reasons.push('AUDIT_NOT_ACCEPTED');
  if(!Array.isArray(av?.reservations)||!av.reservations.length)reasons.push('AVAILABILITY_INCOMPLETE');
 }
 }
 if(index?.complete!==true||index?.documentCount!==expectedDocuments)reasons.push('RESERVATION_COVERAGE_UNVERIFIED');
 if(orphanReservationsUnresolved!==false)reasons.push('ORPHAN_RESERVATIONS_UNRESOLVED');
 return {ready:reasons.length===0,readOnly:true,commitAuthorized:false,reasons:[...new Set(reasons)]};
}

/** Pure historical-orphan isolation proof. Does not authorize runtime cutover.
 * Caller must obtain a complete, contemporaneous orphan snapshot from Sheets.
 */
export function assessHistoricalOrphanIsolation({orphanSlots,targetBlocks,referenceDate}={}){
 const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
 if(!date(referenceDate)||!Array.isArray(orphanSlots)||!orphanSlots.length||!Array.isArray(targetBlocks)||!targetBlocks.length)
  return {isolated:false,readOnly:true,cutoverAuthorized:false,reason:'EVIDENCE_INCOMPLETE'};
 const bad=orphanSlots.some(s=>!date(s?.date)||typeof s?.owner!=='string'||!s.owner.includes('@')||
  !/^([01]\d|2[0-3]):[0-5]\d$/.test(s?.start||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s?.end||'')||
  s.start>=s.end||s.date>=referenceDate);
 const targetsInvalid=targetBlocks.some(b=>!date(b?.date)||b.date<referenceDate);
 return {isolated:!bad&&!targetsInvalid,readOnly:true,cutoverAuthorized:false,
  reason:bad?'ORPHAN_DATE_OR_SHAPE_UNVERIFIED':targetsInvalid?'TARGET_NOT_FUTURE':'HISTORICAL_ONLY'};
}

/** Provisional, read-only preview. Canonical GAS proposal always revalidates.
 * Never supplies write authorization or pretends to confirm a reservation fence.
 */
export function buildSwapFirestoreReadOnlyPreview({pair,availability}={}){
 if(!Array.isArray(pair)||pair.length!==2||!Array.isArray(availability)||availability.length!==2)return null;
 const idA=pair[0]?.auditId,idB=pair[1]?.auditId;
 if(!idA||!idB||idA===idB||availability[0]?.auditId!==idA||availability[1]?.auditId!==idB)return null;
 for(let i=0;i<2;i++){
  const a=pair[i],v=availability[i],c=a?.canonical;
  if(a?.source!=='firestore-canonical'||v?.source!=='firestore-canonical'||c?.status!=='Accepted'||
     !Array.isArray(c?.plannedBlocks)||!c.plannedBlocks.length||c.plannedBlocks.length>30||
     !Array.isArray(v?.reservations)||v.reservations.length!==c.plannedBlocks.length)return null;
  if(!String(c.assignedTo||'').includes('@')||!a.updateTime||!v.updateTime)return null;
  const planned=c.plannedBlocks.map(b=>[b.date,b.start,b.end].join('|')).sort();
  const reserved=v.reservations.map(b=>[b.date,b.start,b.end].join('|')).sort();
  if(JSON.stringify(planned)!==JSON.stringify(reserved)||
    v.reservations.some(x=>String(x.owner||'').toLowerCase()!==String(c.assignedTo).toLowerCase()))return null;
 }
 const time=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 const min=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 const normalize=blocks=>blocks.map(b=>({date:b.date,start:b.start,end:b.end}));
 const beforeA=normalize(pair[0].canonical.plannedBlocks),beforeB=normalize(pair[1].canonical.plannedBlocks);
 const eligible=(reason)=>({ok:true,eligible:false,readOnly:true,provisional:true,commitEnabled:false,reason});
 if(beforeA.length!==beforeB.length)return eligible('Unequal swap block count requires explicit mapping');
 if([...beforeA,...beforeB].some(b=>!date(b.date)||!time(b.start)||!time(b.end)||min(b.start)>=min(b.end)))return null;
 const afterA=[],afterB=[];
 for(let i=0;i<beforeA.length;i++){
  const a=beforeA[i],b=beforeB[i],da=min(a.end)-min(a.start),db=min(b.end)-min(b.start);
  if(da!==db&&beforeA.length!==1)return eligible('Unequal swap block duration requires explicit mapping');
  afterA.push(da===db?{...b}:{date:b.date,start:a.start,end:a.end});
  afterB.push(da===db?{...a}:{date:a.date,start:b.start,end:b.end});
 }
 if(JSON.stringify(afterA)===JSON.stringify(beforeA)&&JSON.stringify(afterB)===JSON.stringify(beforeB))return eligible('Swap has no schedule change');
 const overlap=(x,y)=>x.date===y.date&&min(x.start)<min(y.end)&&min(y.start)<min(x.end);
 if(String(pair[0].canonical.assignedTo).toLowerCase()===String(pair[1].canonical.assignedTo).toLowerCase()&&
 afterA.some(a=>afterB.some(b=>overlap(a,b))))return eligible('Swap overlaps same auditor');
 const display=(audit,blocks)=>({auditId:audit.auditId,assignedTo:audit.canonical.assignedTo,blocks,revision:audit.canonical.revision||audit.updateTime});
 const changed=beforeA.some((b,i)=>b.date!==afterA[i].date)||beforeB.some((b,i)=>b.date!==afterB[i].date);
 return {ok:true,eligible:true,readOnly:true,provisional:true,canonicalRevalidationRequired:true,
  commitEnabled:false,beforeA:display(pair[0],beforeA),beforeB:display(pair[1],beforeB),
  afterA,afterB,dateChanged:changed,requiresAcknowledgement:changed};
}
