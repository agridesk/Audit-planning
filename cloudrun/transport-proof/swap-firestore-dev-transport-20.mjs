import {createSwapFirestoreCanonicalReader} from './swap-firestore-canonical-reader-20.mjs';
import {createSwapFirestoreAtomicWriter} from './swap-firestore-atomic-writer-20.mjs';
import {createSwapDirectCommitCoordinator} from './swap-direct-commit-coordinator-20.mjs';
export function createSwapFirestoreDevTransport(options={}){
 const {project,getToken,fetchImpl,authorize,enabled=false}=options;
 if(typeof project!=='string'||!project.endsWith('-dev'))throw Error('SWAP_DEV_PROJECT_REQUIRED');
 const reader=createSwapFirestoreCanonicalReader({project,getToken,fetchImpl});
 const writer=createSwapFirestoreAtomicWriter({project,getToken,fetchImpl});
 const coordinator=createSwapDirectCommitCoordinator({project,readProposal:reader.readProposal,readPair:reader.readPair,readAvailability:reader.readAvailability,atomicWriter:writer,authorize,enabled});
 return Object.freeze({...reader,commit:coordinator.commit});
}
