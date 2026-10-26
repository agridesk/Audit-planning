import {validateSwapCanonicalSchedule} from './swap-firestore-schedule-guard-20.mjs';
import {buildSwapFirestoreWriteSet} from './swap-firestore-writeset-20.mjs';

/**
 * Firestore-only DEV swap commit orchestrator.
 * Deliberately not connected to the live SWAP route until canonical
 * audit and availability records are migrated and reconciled.
 */
export function createSwapDirectCommitCoordinator({project,readProposal,readJournal,readPair,readAvailability,atomicWriter,authorize,resolveFinalReservations,enabled=false}={}){
 if(!project||typeof readProposal!=='function'||typeof readPair!=='function'||
  typeof readAvailability!=='function'||typeof readJournal!=='function'||typeof atomicWriter?.commit!=='function'||typeof authorize!=='function'||typeof resolveFinalReservations!=='function')
  throw Error('SWAP_DIRECT_COORDINATOR_CONFIG_INVALID');
 async function commit({operationId,actor}={}){
  if(enabled!==true)return {ok:false,code:'SWAP_DIRECT_COMMIT_DISABLED'};
  if(!actor||actor.role!=='manager'||await authorize(actor,operationId)!==true)
   throw Error('SWAP_DIRECT_MANAGER_UNAUTHORIZED');
  // Independent Firestore reads in one network round-trip window.
  const [proposal,priorJournal]=await Promise.all([readProposal(operationId),readJournal(operationId)]);
  if(proposal?.operationId===operationId&&proposal.status==='APPLIED'&&proposal.canonicalCommitVerified===true){
   const journal=priorJournal;
   if(journal?.stage==='COMMITTED'&&journal.operationId===operationId&&journal.auditA===proposal.auditA&&journal.auditB===proposal.auditB)
    return {ok:true,committed:true,idempotent:true,operationId};
   throw Error('SWAP_DIRECT_APPLIED_JOURNAL_MISMATCH');
  }
  if(!proposal||proposal.operationId!==operationId||proposal.status!=='CONFIRMED')
   throw Error('SWAP_DIRECT_PROPOSAL_NOT_CONFIRMED');
  // A pre-existing journal indicates an attempted or uncertain operation.
  // Never start a second write, even if the proposal still says CONFIRMED.
  // Commit is not authoritative until the proposal and its GAS journal have
  // been migrated together. An index projection cannot replace that proof.
  if(proposal.source!=='firestore-canonical'||!proposal.updateTime)
   throw Error('SWAP_DIRECT_PROPOSAL_MIGRATION_REQUIRED');
  if(priorJournal!==null&&priorJournal!==undefined)
   throw Error('SWAP_DIRECT_JOURNAL_ALREADY_EXISTS');
  const ids=[proposal.auditA,proposal.auditB];
  const [pair,availability]=await Promise.all([readPair(ids),readAvailability(ids)]);
  if(pair.some(row=>row?.source!=='firestore-canonical')||
     availability.some(row=>row?.source!=='firestore-canonical')||
     proposal.source!=='firestore-canonical')
   throw Error('SWAP_DIRECT_CANONICAL_MIGRATION_REQUIRED');
  const schedule=validateSwapCanonicalSchedule({proposal,pair});
  const resolved=await resolveFinalReservations({proposal,pair,availability,owners:schedule.owners});
  const finalReservations=resolved.reservations;
  const fenceRevision=resolved.fenceRevision;
  const writeSet=buildSwapFirestoreWriteSet({project,operationId,proposal,pair,availability,finalReservations,fenceRevision,actorEmail:actor.email});
  let result;
  try{result=await atomicWriter.commit(writeSet);}
  catch(error){
   // Firestore may commit while its HTTP response is lost. Resolve by readback;
   // never automatically submit the same commit a second time.
   let afterProposal,afterJournal;
   try{[afterProposal,afterJournal]=await Promise.all([readProposal(operationId),readJournal(operationId)]);}
   catch{throw Error('SWAP_DIRECT_COMMIT_OUTCOME_UNKNOWN_MANUAL_REVIEW');}
   if(afterProposal?.operationId===operationId&&afterProposal.status==='APPLIED'&&
      afterProposal.canonicalCommitVerified===true&&afterJournal?.stage==='COMMITTED'&&
      afterJournal.operationId===operationId&&afterJournal.auditA===proposal.auditA&&afterJournal.auditB===proposal.auditB)
    return {ok:true,committed:true,verifiedAfterUncertainResponse:true,operationId};
   throw Error('SWAP_DIRECT_COMMIT_OUTCOME_UNKNOWN_MANUAL_REVIEW');
  }
  if(!result.ok)return {ok:false,code:result.conflict?'SWAP_DIRECT_REVISION_CONFLICT':'SWAP_DIRECT_COMMIT_FAILED'};
  return {ok:true,committed:true,operationId,commitTime:result.commitTime,writeCount:result.writeCount};
 }
 return Object.freeze({commit});
}
