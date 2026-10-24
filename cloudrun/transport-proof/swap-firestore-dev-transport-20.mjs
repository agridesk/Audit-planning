import {resolveSwapFirestoreReservations} from './swap-firestore-reservation-planner-20.mjs';
import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
import {createSwapFirestoreAtomicWriter} from './swap-firestore-atomic-writer-20.mjs';
import {createSwapDirectCommitCoordinator} from './swap-direct-commit-coordinator-20.mjs';
export function createSwapFirestoreDevTransport(options={}){
 const {project,getToken,fetchImpl,authorize,loadCompleteReservationIndex,enabled=false}=options;
 if(typeof project!=='string'||!project.endsWith('-dev'))throw Error('SWAP_DEV_PROJECT_REQUIRED');
 const reader=createSwapFirestoreCanonicalReader({project,getToken,fetchImpl});
 const writer=createSwapFirestoreAtomicWriter({project,getToken,fetchImpl});
 if(typeof loadCompleteReservationIndex!=='function')throw Error('SWAP_DEV_COMPLETE_INDEX_LOADER_REQUIRED');
 const resolveFinalReservations=async context=>{
  const index=await loadCompleteReservationIndex(context);
  return resolveSwapFirestoreReservations({...context,externalReservations:index?.reservations,completeExternalIndex:index?.complete===true});
 };
 const coordinator=createSwapDirectCommitCoordinator({project,readProposal:reader.readProposal,readJournal:reader.readJournal,readPair:reader.readPair,readAvailability:reader.readAvailability,atomicWriter:writer,authorize,resolveFinalReservations,enabled});
 return Object.freeze({...reader,commit:coordinator.commit});
}
