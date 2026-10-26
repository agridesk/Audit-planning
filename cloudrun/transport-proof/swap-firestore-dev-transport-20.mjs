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
export function assessSwapFirestorePreviewReadiness({pair,availability,index,expectedDocuments=20}={}){
 const reasons=[];
 if(!Array.isArray(pair)||pair.length!==2||!Array.isArray(availability)||availability.length!==2)reasons.push('PAIR_INVALID');
 else for(let i=0;i<2;i++){
  const audit=pair[i],av=availability[i];
  if(audit?.source!=='firestore-canonical'||av?.source!=='firestore-canonical'||audit?.auditId!==av?.auditId)reasons.push('PAIR_SOURCE_INVALID');
  if(audit?.canonical?.status!=='Accepted'||!Array.isArray(audit?.canonical?.plannedBlocks)||!audit.canonical.plannedBlocks.length)reasons.push('AUDIT_NOT_ACCEPTED');
  if(!Array.isArray(av?.reservations)||!av.reservations.length)reasons.push('AVAILABILITY_INCOMPLETE');
 }
 if(index?.complete!==true||index?.documentCount!==expectedDocuments)reasons.push('RESERVATION_COVERAGE_UNVERIFIED');
 return {ready:reasons.length===0,readOnly:true,commitAuthorized:false,reasons:[...new Set(reasons)]};
}
