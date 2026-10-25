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
 if(typeof project!=='string'||!project.endsWith('-dev'))throw Error('SWAP_DEV_PROJECT_REQUIRED');
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
