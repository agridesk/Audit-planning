/**
 * Swap 2.0 transaction coordinator. Adapter methods are supplied by the
 * canonical GAS owner. No implicit sheet, lifecycle or notification writes.
 * Journal MUST be durable; adapter must guarantee operationId uniqueness.
 */
export async function executeSwapAtomic(input,adapter){
 const {operationId,auditA,auditB,expectedRevisions,blocksA,blocksB}=input||{};
 if(!operationId||!auditA||!auditB||auditA===auditB)throw Error('Invalid swap pair');
 if(!expectedRevisions||!expectedRevisions[auditA]||!expectedRevisions[auditB])throw Error('Expected revisions required');
 if(!Array.isArray(blocksA)||!blocksA.length||!Array.isArray(blocksB)||!blocksB.length)throw Error('Both final schedules required');
 const required=['withPairLock','readJournal','readCanonicalPair','validateFinalState','captureBeforeImages','persistJournal','replacePairReservations','replacePairPlans','verifyPair','restoreBeforeImages'];
 for(const name of required)if(typeof adapter?.[name]!=='function')throw Error('Missing canonical adapter: '+name);
 return adapter.withPairLock([auditA,auditB],async()=>{
  const existing=await adapter.readJournal(operationId);
  if(existing){
   if(!Array.isArray(existing.auditIds)||existing.auditIds[0]!==auditA||existing.auditIds[1]!==auditB)throw Error('Operation identity conflict');
   if(existing.phase==='COMMITTED')return {success:true,idempotent:true,operationId};
   if(existing.phase==='WRITING'||existing.phase==='FAILED')throw Error('Recovery required before retry: '+operationId);
   throw Error('Existing incomplete swap operation: '+operationId);
  }
  const current=await adapter.readCanonicalPair([auditA,auditB]);
  for(const id of [auditA,auditB]){
   if(!current?.[id]||String(current[id].revision)!==String(expectedRevisions[id])||String(current[id].status).toLowerCase()!=='accepted')throw Error('Canonical revision/status conflict: '+id);
  }
  const valid=await adapter.validateFinalState({auditA,auditB,blocksA,blocksB,current});
  if(valid?.ok!==true)throw Error('Final state rejected');
  const before=await adapter.captureBeforeImages([auditA,auditB]);
  if(!before?.canonical||!before?.reservations||!before.canonical[auditA]||!before.canonical[auditB]||!Array.isArray(before.reservations[auditA])||!Array.isArray(before.reservations[auditB]))throw Error('Incomplete canonical before-images');
  const journal={operationId,auditIds:[auditA,auditB],expectedRevisions,phase:'PREPARED',before,createdAt:new Date().toISOString()};
  await adapter.persistJournal(journal);
  // Journal must reach WRITING before the first mutating operation.
  await adapter.persistJournal({...journal,phase:'WRITING'});
  try{
   await adapter.replacePairReservations({auditA,auditB,blocksA,blocksB});
   await adapter.replacePairPlans({auditA,auditB,blocksA,blocksB});
   const verified=await adapter.verifyPair({auditA,auditB,blocksA,blocksB});
   if(verified?.ok!==true)throw Error('Pair verification failed');
   await adapter.persistJournal({...journal,phase:'COMMITTED',committedAt:new Date().toISOString()});
   return {success:true,idempotent:false,operationId};
  }catch(error){
   try{
    await adapter.restoreBeforeImages(before);
    const restored=await adapter.verifyPair({auditA,auditB,before,restore:true});
    if(restored?.ok!==true)throw Error('Rollback verification failed');
    await adapter.persistJournal({...journal,phase:'ROLLED_BACK',error:String(error.message||error)});
   }catch(rollbackError){
    await adapter.persistJournal({...journal,phase:'FAILED',error:String(error.message||error),rollbackError:String(rollbackError.message||rollbackError)});
    throw new AggregateError([error,rollbackError],'Swap failed and rollback requires manual recovery');
   }
   throw error;
  }
 });
}
