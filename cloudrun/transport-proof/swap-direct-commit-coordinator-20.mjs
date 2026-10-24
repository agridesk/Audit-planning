import {buildSwapFirestoreWriteSet} from './swap-firestore-writeset-20.mjs';

/**
 * Firestore-only DEV swap commit orchestrator.
 * Deliberately not connected to the live SWAP route until canonical
 * audit and availability records are migrated and reconciled.
 */
export function createSwapDirectCommitCoordinator({project,readProposal,readPair,readAvailability,atomicWriter,authorize,resolveFinalReservations,enabled=false}={}){
 if(!project||typeof readProposal!=='function'||typeof readPair!=='function'||
  typeof readAvailability!=='function'||typeof atomicWriter?.commit!=='function'||typeof authorize!=='function'||typeof resolveFinalReservations!=='function')
  throw Error('SWAP_DIRECT_COORDINATOR_CONFIG_INVALID');
 async function commit({operationId,actor}={}){
  if(enabled!==true)return {ok:false,code:'SWAP_DIRECT_COMMIT_DISABLED'};
  if(!actor||actor.role!=='manager'||await authorize(actor,operationId)!==true)
   throw Error('SWAP_DIRECT_MANAGER_UNAUTHORIZED');
  const proposal=await readProposal(operationId);
  if(!proposal||proposal.operationId!==operationId||proposal.status!=='CONFIRMED')
   throw Error('SWAP_DIRECT_PROPOSAL_NOT_CONFIRMED');
  const ids=[proposal.auditA,proposal.auditB];
  const [pair,availability]=await Promise.all([readPair(ids),readAvailability(ids)]);
  if(pair.some(row=>row?.source!=='firestore-canonical')||
     availability.some(row=>row?.source!=='firestore-canonical')||
     proposal.source!=='firestore-canonical')
   throw Error('SWAP_DIRECT_CANONICAL_MIGRATION_REQUIRED');
  const finalReservations=await resolveFinalReservations({proposal,pair,availability});
  const writeSet=buildSwapFirestoreWriteSet({project,operationId,proposal,pair,availability,finalReservations,actorEmail:actor.email});
  const result=await atomicWriter.commit(writeSet);
  if(!result.ok)return {ok:false,code:result.conflict?'SWAP_DIRECT_REVISION_CONFLICT':'SWAP_DIRECT_COMMIT_FAILED'};
  return {ok:true,committed:true,operationId,commitTime:result.commitTime,writeCount:result.writeCount};
 }
 return Object.freeze({commit});
}
