/** DEV SWAP Firestore reconciliation. Requires verified Cloud Scheduler OIDC. */
export function createSwapIndexScheduler({index,roster,gasCall,serviceEmail,audience,readCanonicalProposal,readJournalOperationIds,stageCanonicalProposal,readHistoricalJournalRows,classifyHistoricalJournal,stageHistoricalJournal,fetchImpl=fetch,now=Date.now}={}){
 if(!index||typeof roster!=='function'||typeof gasCall!=='function')throw Error('SWAP_SCHEDULER_DEPENDENCIES');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(serviceEmail||'')||!/^https:\/\/[^/]+$/.test(audience||''))throw Error('SWAP_SCHEDULER_CONFIG');
 async function verify(auth){
  const matched=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(auth||''));
  if(!matched)return false;
  const response=await fetchImpl('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(matched[1]),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)return false;
  const t=await response.json();
  return t.aud===audience&&t.email===serviceEmail&&
   (t.email_verified===true||t.email_verified==='true')&&
   ['https://accounts.google.com','accounts.google.com'].includes(t.iss)&&
   Number(t.exp)>Math.floor(now()/1000)&&typeof t.sub==='string'&&t.sub.length>0;
 }
 let migrationPreflightAttempted=false;
 async function reconcile(){
  const records=await roster(),manager=records.find(x=>x.role==='manager'&&x.email&&x.auditorId);
  if(!manager)throw Error('SWAP_SCHEDULER_NO_MANAGER');
  const seed=await gasCall({role:'manager',email:manager.email,auditorId:manager.auditorId},'listIndexSeed',{},'externalswap20');
  if(seed?.ok!==true||!Array.isArray(seed.records)){ console.error('[SWAP_SEED_REJECTED]',JSON.stringify({ok:seed?.ok,code:String(seed?.error||'MISSING_RECORDS').slice(0,80)}));throw Error('SWAP_SCHEDULER_SEED_FAILED'); }
  const meta=await index.meta();
  const updated=meta?await index.reconcile(seed.records):await index.bootstrap(seed.records);
  if(!updated)throw Error('SWAP_SCHEDULER_RECONCILIATION_BUSY');
  // Single read-only migration check per Cloud Run instance, not each
  // five-minute synchronization. Never affect the operational read index.
  if(!migrationPreflightAttempted&&typeof readCanonicalProposal==='function'&&typeof readJournalOperationIds==='function'){
   migrationPreflightAttempted=true;
   try{
    const status=await previewCanonicalMigration();
    console.info('[SWAP20_CANONICAL_MIGRATION_PREFLIGHT]',JSON.stringify(status));
    // Non-authoritative, create-only copies. Journaled proposals are excluded;
    // no active Firestore route ever reads a staged proposal.
    if(typeof readHistoricalJournalRows==='function'&&
       typeof classifyHistoricalJournal==='function'&&typeof stageHistoricalJournal==='function'){
     try{
      const archive=await archiveHistoricalJournals();
      console.info('[SWAP20_LEGACY_JOURNAL_ARCHIVE]',JSON.stringify(archive));
     }catch(archiveError){
      console.error('[SWAP20_LEGACY_JOURNAL_ARCHIVE_FAILED]',String(archiveError?.message||archiveError).slice(0,180));
     }
    }
    if(typeof stageCanonicalProposal==='function'){
     try{
      const staged=await stageCanonicalProposals();
      console.info('[SWAP20_INACTIVE_PROPOSAL_STAGING]',JSON.stringify(staged));
     }catch(stageError){
      console.error('[SWAP20_INACTIVE_PROPOSAL_STAGING_FAILED]',
       String(stageError?.message||stageError).slice(0,180));
     }
    }
   }catch(error){
    console.error('[SWAP20_CANONICAL_MIGRATION_PREFLIGHT_FAILED]',
     String(error?.message||error).slice(0,180));
   }
  }
  return {ok:true,records:seed.records.length};
 }
 async function previewCanonicalMigration(){
  if(typeof readCanonicalProposal!=='function'||typeof readJournalOperationIds!=='function')
   throw Error('SWAP_MIGRATION_SOURCE_READERS_UNAVAILABLE');
  const records=await roster();
  const manager=records.find(x=>x.role==='manager'&&x.email&&x.auditorId);
  if(!manager)throw Error('SWAP_MIGRATION_NO_TRUSTED_MANAGER');
  // This source reads GAS ScriptProperties, not the incomplete read index.
  const seed=await gasCall({role:'manager',email:manager.email,auditorId:manager.auditorId},
   'listIndexSeed',{},'externalswap20');
  if(seed?.ok!==true||!Array.isArray(seed.records)||seed.records.length>300)
   throw Error('SWAP_MIGRATION_GAS_SEED_UNAVAILABLE');
  const ids=new Set();
  const sourceProblems=[];
  const all=seed.records;
  for(const p of all){
   if(!p||!/^[A-Za-z0-9_-]{8,100}$/.test(String(p.operationId||''))||
      ids.has(p.operationId)||!p.auditA||!p.auditB||p.auditA===p.auditB||
      !p.originalRevisions?.[p.auditA]||!p.originalRevisions?.[p.auditB]||
      !Array.isArray(p.blocksA)||!Array.isArray(p.blocksB)||
      !Array.isArray(p.requiredAuditorUids)||!p.requiredAuditorUids.length||
      !Array.isArray(p.acknowledgedAuditorUids)||!p.status)
    sourceProblems.push(String(p?.operationId||'INVALID').slice(0,100));
   else ids.add(p.operationId);
  }
  if(sourceProblems.length)throw Error('SWAP_MIGRATION_GAS_CANONICAL_PROPOSAL_INVALID_'+sourceProblems.length);
  const journalled=await readJournalOperationIds();
  if(!(journalled instanceof Set))throw Error('SWAP_MIGRATION_JOURNAL_INVENTORY_INVALID');
  let firestoreMissing=0,firestoreMatched=0,firestoreConflict=0,journalledProposals=0;
  const sourceStatus={};
  for(let i=0;i<all.length;i+=8){
   const batch=all.slice(i,i+8);
   const results=await Promise.all(batch.map(p=>readCanonicalProposal(p.operationId)));
   for(let j=0;j<batch.length;j++){
    const p=batch[j],found=results[j];
    sourceStatus[p.status]=(sourceStatus[p.status]||0)+1;
    if(journalled.has(p.operationId))journalledProposals++;
    if(!found){firestoreMissing++;continue;}
    const snapshot=found.proposal||found;
    const fields=['operationId','auditA','auditB','status','originalRevisions',
     'requiredAuditorUids','acknowledgedAuditorUids','blocksA','blocksB','dateChanged'];
    if(fields.every(key=>JSON.stringify(snapshot[key])===JSON.stringify(p[key])))firestoreMatched++;
    else firestoreConflict++;
   }
  }
  return {ok:true,result:'SWAP_CANONICAL_PROPOSAL_MIGRATION_PREFLIGHT',dryRun:true,
   gasProposalCount:all.length,gasStatusCounts:sourceStatus,
   firestoreMissing,firestoreMatched,firestoreConflict,
   gasJournalledProposalCount:journalledProposals,gasJournalOperationCount:journalled.size,
   sourceFreezeVerified:false,cutoverAuthorized:false};
 }
 async function stageCanonicalProposals(){
  if(typeof stageCanonicalProposal!=='function'||typeof readCanonicalProposal!=='function'||
     typeof readJournalOperationIds!=='function')
   throw Error('SWAP_STAGING_DEPENDENCIES_MISSING');
  const manager=(await roster()).find(x=>x.role==='manager'&&x.email&&x.auditorId);
  if(!manager)throw Error('SWAP_STAGING_NO_MANAGER');
  const source=async()=>{
   const result=await gasCall(manager,'listIndexSeed',{},'externalswap20');
   if(result?.ok!==true||!Array.isArray(result.records)||result.records.length>300)
    throw Error('SWAP_STAGING_GAS_SOURCE_MISSING');
   return result.records;
  };
  const before=await source(),journalled=await readJournalOperationIds();
  if(!(journalled instanceof Set))throw Error('SWAP_STAGING_JOURNAL_INVENTORY_MISSING');
  const candidates=before.filter(p=>!journalled.has(p.operationId)&&
   ['WITHDRAWN','DECLINED','CONFIRMED','AWAITING_ACKNOWLEDGEMENT','ESCALATED'].includes(p.status));
  const verified=await source();
  // Source may mutate while GAS is live. Exclude every non-identical record.
  const latest=new Map(verified.map(p=>[p.operationId,p]));
  let stale=0,existing=0,staged=0;
  const sourceFields=['operationId','auditA','auditB','status','createdAt','createdBy',
   'originalRevisions','requiredAuditorUids','acknowledgedAuditorUids',
   'blocksA','blocksB','internalReason','ecasComment','dateChanged'];
  // Bound concurrent Firestore writes and avoid a Sheets journal read
  // for every historical proposal. Copies remain inactive during staging.
  for(let start=0;start<candidates.length;start+=4){
   const currentJournal=await readJournalOperationIds();
   if(!(currentJournal instanceof Set))throw Error('SWAP_STAGING_JOURNAL_RECHECK_FAILED');
   const batch=candidates.slice(start,start+4);
   const outcomes=await Promise.all(batch.map(async p=>{
    if(!latest.has(p.operationId)||
       sourceFields.some(k=>JSON.stringify(p[k])!==JSON.stringify(latest.get(p.operationId)[k]))||
       currentJournal.has(p.operationId))return 'stale';
    const prior=await readCanonicalProposal(p.operationId);
    if(prior){
     const actual=prior.proposal||prior;
     if(actual.migrationState!=='STAGED_FROM_GAS'||actual.migrationVerified!==false||
        sourceFields.some(k=>JSON.stringify(actual[k])!==JSON.stringify(p[k])))
      throw Error('SWAP_STAGING_EXISTING_PARITY_MISMATCH');
     return 'existing';
    }
    const result=await stageCanonicalProposal({proposal:p,journalAbsentVerified:true});
    if(result?.ok===true&&result.staged===true){
     const record=await readCanonicalProposal(p.operationId);
     const actual=record?.proposal||record;
     if(!actual||actual.migrationState!=='STAGED_FROM_GAS'||actual.migrationVerified!==false||
        sourceFields.some(k=>JSON.stringify(actual[k])!==JSON.stringify(p[k])))
      throw Error('SWAP_STAGING_READBACK_MISMATCH');
     return 'staged';
    }
    if(result?.conflict===true)return 'existing';
    throw Error('SWAP_STAGING_WRITE_UNVERIFIED');
   }));
   for(const outcome of outcomes){
    if(outcome==='stale')stale++;
    else if(outcome==='existing')existing++;
    else if(outcome==='staged')staged++;
   }
  }
  return {ok:true,result:'SWAP_GAS_PROPOSALS_STAGED_INACTIVE',sourceProposals:before.length,
   journalExcluded:before.length-candidates.length,candidates:candidates.length,
   staged,existing,stale,directWriteEnabled:false,cutoverAuthorized:false};
 }
 async function archiveHistoricalJournals(){
  if(typeof readHistoricalJournalRows!=='function'||typeof classifyHistoricalJournal!=='function'||typeof stageHistoricalJournal!=='function')
   throw Error('SWAP_LEGACY_ARCHIVE_DEPENDENCIES');
  const rows=await readHistoricalJournalRows(),operations=classifyHistoricalJournal(rows);
  let archived=0,existing=0,pending=0;
  const pendingOperations=[];
  for(const operation of operations){
   if(!operation.terminal){
    pending++;
    pendingOperations.push({operationId:operation.operationId,stage:operation.finalStage,
     sequence:operation.history.length,manualReviewRequired:true});
   }
   const result=await stageHistoricalJournal(operation);
   if(result?.staged===true)archived++;
   else if(result?.existing===true)existing++;
   else throw Error('SWAP_LEGACY_ARCHIVE_CONFLICT');
  }
  return {ok:true,result:'SWAP_LEGACY_JOURNAL_ARCHIVED_INACTIVE',
   operations:operations.length,archived,existing,pending,pendingOperations,
   directWriteEnabled:false,cutoverAuthorized:false};
 }
 return Object.freeze({verify,reconcile,previewCanonicalMigration,stageCanonicalProposals,archiveHistoricalJournals});
}
