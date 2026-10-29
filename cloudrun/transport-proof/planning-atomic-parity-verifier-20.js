/** Read-only DEV source-of-truth parity gate.
 * Verify Sheet rows against backfilled Firestore canonical documents and every
 * indexed quarter-hour claim. Does not write to either datastore.
 */
import {preparePlanningBackfill} from './planning-atomic-backfill-20.js';
export function createPlanningAtomicParityVerifier({store,readPlanningRows,getRoster}={}){
 if(typeof store?.readAudit!=='function'||typeof store?.inspectAuditClaimIndex!=='function'||typeof readPlanningRows!=='function'||typeof getRoster!=='function')throw Error('PLANNING_PARITY_CONFIG_INVALID');
 async function verify({startRow=2,limit=50,asOfDate=new Date().toISOString().slice(0,10)}={}){
  if(!Number.isSafeInteger(startRow)||startRow<2||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('PLANNING_PARITY_BATCH_INVALID');
  const prepared=preparePlanningBackfill({rows:await readPlanningRows(),roster:await getRoster(),asOfDate});
  const items=prepared.items.filter(x=>x.snapshot.sourceRow>=startRow).slice(0,limit);
  const problems=[];let verified=0,claims=0;
  for(const item of items){
   let reason='';
   try{
    const record=await store.readAudit(item.auditId);
    if(!record)reason='FIRESTORE_AUDIT_MISSING';
    else if(record.pendingOperationId)reason='UNSETTLED_OUTBOX';
    else if(record.revision!==0)reason='POST_BACKFILL_REVISION_CHANGED';
    else if(record.auditorId!==item.auditorId)reason='AUDITOR_UID_MISMATCH';
    else if(record.snapshot?.sourceRevision!==item.snapshot.sourceRevision||JSON.stringify(record.snapshot?.row)!==JSON.stringify(item.snapshot.row))reason='SOURCE_ROW_MISMATCH';
    else if(JSON.stringify(record.blocks||[])!==JSON.stringify(item.blocks))reason='BLOCK_SNAPSHOT_MISMATCH';
    else{
     const evidence=await store.inspectAuditClaimIndex(item.auditId);
     if(evidence?.ok!==true)reason=evidence?.reason||'CLAIM_INDEX_INVALID';
     else{verified++;claims+=evidence.checked;}
    }
   }catch{reason='PARITY_READ_FAILED';}
   if(reason)problems.push({sourceRow:item.snapshot.sourceRow,reason});
  }
  const more=prepared.items.some(x=>x.snapshot.sourceRow>=(items.at(-1)?.snapshot.sourceRow??startRow)+1);
  return {ready:problems.length===0&&!more&&verified===prepared.items.length,asOfDate,sourceAudits:prepared.items.length,batch:items.length,verified,claims,problems,remaining:more,nextRow:more?(items.at(-1)?.snapshot.sourceRow+1||startRow):null};
 }
 return Object.freeze({verify});
}
