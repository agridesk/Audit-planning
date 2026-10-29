/** AMS 2.0 durable Firestore -> Sheets projection reconciler.
 * A Firestore authority commit is the durable outbox. No blind retry is allowed:
 * after an uncertain outcome the projector must observe authoritative projection
 * evidence before declaring success or attempting a write.
 * This module intentionally does not grant itself a cross-instance execution lock.
 * The caller MUST supply a durable auditor/slot fencing operation and a projector
 * whose operationId is idempotently enforced by the Sheets boundary.
 */
const valid=x=>typeof x==='string'&&x.length>0;
export function createPlanningSheetsProjector({authority,inspect,apply,fence}={}){
 if(!authority||typeof authority.read!=='function'||typeof authority.transition!=='function'||typeof inspect!=='function'||typeof apply!=='function'||typeof fence!=='function')throw Error('PROJECTOR_DEPENDENCY_REQUIRED');
 async function reconcile({auditId,commitId}){
  if(!valid(auditId)||!valid(commitId))throw Error('PROJECTOR_ID_REQUIRED');
  const ledger=await authority.read(auditId);
  const commit=ledger.commits.find(x=>x.id===commitId);
  if(!commit)throw Error('PROJECTOR_COMMIT_NOT_FOUND');
  if(commit.state==='PROJECTED'||commit.state==='REJECTED')return {state:commit.state,replayed:true};
  if(!['PENDING','UNCERTAIN'].includes(commit.state)||!commit.projectionPayload||!commit.projectionDigest)throw Error('PROJECTOR_INCOMPLETE_INTENT');
  // The fence must be distributed, durable, and protect all overlapping writer paths.
  return fence({auditId,commitId,auditorId:commit.auditorId,blocks:commit.blocks},async()=>{
   const latest=(await authority.read(auditId)).commits.find(x=>x.id===commitId);
   if(!latest||!['PENDING','UNCERTAIN'].includes(latest.state))return {state:latest?.state||'MISSING',replayed:true};
   let observed;
   try{observed=await inspect(latest);}catch{throw Error('PROJECTOR_INSPECTION_UNAVAILABLE');}
   if(observed?.state==='MATCH'){
    await authority.transition({auditId,commitId,from:latest.state,to:'PROJECTED',detail:'VERIFIED_CANONICAL_PROJECTION'});
    return {state:'PROJECTED',recovered:true};
   }
   if(observed?.state==='CONFLICT')throw Error('PROJECTOR_CANONICAL_CONFLICT');
   if(observed?.state!=='ABSENT')throw Error('PROJECTOR_PROJECTION_UNKNOWN');
   if(latest.state==='UNCERTAIN')throw Error('PROJECTOR_UNCERTAIN_REQUIRES_EVIDENCE');
   // A negative read alone cannot prove that an earlier timed-out write will
   // not arrive later. The Sheets writer must enforce the same operationId.
   let result;
   try{result=await apply({operationId:latest.id,commit:latest,expectedSourceRevision:latest.sourceRevision});}
   catch{
    await authority.transition({auditId,commitId,from:'PENDING',to:'UNCERTAIN',detail:'PROJECTOR_WRITE_UNKNOWN'}).catch(()=>{});
    throw Error('PROJECTOR_WRITE_UNKNOWN');
   }
   if(result?.operationId!==latest.id||result?.idempotent!==true){
    await authority.transition({auditId,commitId,from:'PENDING',to:'UNCERTAIN',detail:'PROJECTOR_ACK_UNVERIFIED'}).catch(()=>{});
    throw Error('PROJECTOR_ACK_UNVERIFIED');
   }
   const verified=await inspect(latest).catch(()=>({state:'UNKNOWN'}));
   if(verified?.state!=='MATCH'){
    await authority.transition({auditId,commitId,from:'PENDING',to:'UNCERTAIN',detail:'PROJECTOR_POSTWRITE_UNVERIFIED'}).catch(()=>{});
    throw Error('PROJECTOR_POSTWRITE_UNVERIFIED');
   }
   await authority.transition({auditId,commitId,from:'PENDING',to:'PROJECTED',detail:'VERIFIED_CANONICAL_PROJECTION'});
   return {state:'PROJECTED',recovered:false};
  });
 }
 return Object.freeze({reconcile});
}
