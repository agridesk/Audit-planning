import {requireSwapIndexCoverage} from './swap-index-coverage-gate-20.mjs';
import {createSwapReservationFenceReader} from './swap-reservation-fence-reader-20.mjs';
import {createSwapFirestoreReservationIndex} from './swap-firestore-reservation-index-20.mjs';
import {outsideSwapPair} from './swap-reservation-index-filter-20.mjs';
import {resolveSwapFirestoreReservations} from './swap-firestore-reservation-planner-20.mjs';
import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
import {createSwapFirestoreAtomicWriter} from './swap-firestore-atomic-writer-20.mjs';
import {createSwapDirectCommitCoordinator} from './swap-direct-commit-coordinator-20.mjs';
export function createSwapFirestoreDevTransport(options={}){
 const {project,getToken,fetchImpl,authorize,loadCompleteReservationIndex,expectedAvailabilityDocuments,canonicalCutoverVerified=false,enabled=false}=options;
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
 return Object.freeze({...reader,commit:coordinator.commit});
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
