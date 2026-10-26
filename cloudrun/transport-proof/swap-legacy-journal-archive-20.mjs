/** DEV-only create-only archive of the original GAS journal.
 * The archive is NOT the executable Firestore journal and never permits cutover.
 */
const OP=/^[A-Za-z0-9_-]{8,100}$/;
const STAGES=new Set(['PREPARED','WRITING','COMMITTED','ROLLING_BACK','ROLLED_BACK','FAILED','CONFLICT']);
const NEXT={'':new Set(['PREPARED']),PREPARED:new Set(['WRITING','CONFLICT']),WRITING:new Set(['COMMITTED','ROLLING_BACK']),ROLLING_BACK:new Set(['ROLLED_BACK','FAILED'])};
export function classifySwapLegacyJournal(rows){
 if(!Array.isArray(rows)||rows.length>2999)throw Error('SWAP_LEGACY_JOURNAL_ROWS_INVALID');
 const entries=new Map();
 for(const row of rows){
  if(!Array.isArray(row)||row.length<5)throw Error('SWAP_LEGACY_JOURNAL_ROW_INCOMPLETE');
  const [id,sequence,stage,recordedAt,payload]=row.map(String);
  if(!OP.test(id)||!Number.isSafeInteger(Number(sequence))||Number(sequence)<1||!STAGES.has(stage)||
     !/^\d{4}-\d{2}-\d{2}T/.test(recordedAt)||!payload||payload.length>45000)
   throw Error('SWAP_LEGACY_JOURNAL_ROW_INVALID');
  if(!entries.has(id))entries.set(id,[]);
  entries.get(id).push({sequence:Number(sequence),stage,recordedAt,payloadRaw:payload});
 }
 const operations=[];
 for(const [operationId,history] of entries){
  history.sort((a,b)=>a.sequence-b.sequence);
  let previous='';
  for(let i=0;i<history.length;i++){
   const h=history[i];
   if(h.sequence!==i+1||!NEXT[previous]?.has(h.stage))throw Error('SWAP_LEGACY_JOURNAL_SEQUENCE_OR_TRANSITION_INVALID');
   previous=h.stage;
  }
  operations.push({operationId,history,finalStage:previous,terminal:['COMMITTED','ROLLED_BACK','FAILED','CONFLICT'].includes(previous)});
 }
 operations.sort((a,b)=>a.operationId.localeCompare(b.operationId));
 return operations;
}
export function createSwapLegacyJournalArchive({project,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||'')||typeof getToken!=='function')
  throw Error('SWAP_LEGACY_ARCHIVE_CONFIG_INVALID');
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents/ams_swap20_dev_legacy_journal/';
 const canonical=x=>JSON.stringify(x);
 async function stage(operation){
  if(!operation?.terminal||!OP.test(operation.operationId)||!Array.isArray(operation.history)||!operation.history.length)
   return {ok:false,code:'NONTERMINAL_NOT_ARCHIVED'};
  const url=new URL(base+encodeURIComponent(operation.operationId));
  const headers={authorization:'Bearer '+await getToken()};
  const existing=await fetchImpl(url.toString(),{headers,signal:AbortSignal.timeout(12000)});
  const payload={...operation,archiveState:'HISTORICAL_INACTIVE',canonicalCommitVerified:false};
  if(existing.ok){
   const doc=await existing.json(),found=JSON.parse(doc?.fields?.payload?.stringValue||'null');
   if(canonical(found)!==canonical(payload))throw Error('SWAP_LEGACY_ARCHIVE_EXISTING_MISMATCH');
   return {ok:true,existing:true};
  }
  if(existing.status!==404)throw Error('SWAP_LEGACY_ARCHIVE_READ_'+existing.status);
  url.searchParams.set('currentDocument.exists','false');
  const result=await fetchImpl(url.toString(),{method:'PATCH',headers:{...headers,'content-type':'application/json'},
   body:JSON.stringify({fields:{payload:{stringValue:canonical(payload)}}}),signal:AbortSignal.timeout(12000)});
  if(result.status===409||result.status===412)return {ok:false,conflict:true};
  if(!result.ok)throw Error('SWAP_LEGACY_ARCHIVE_WRITE_'+result.status);
  const written=await result.json();
  if(!written.updateTime)throw Error('SWAP_LEGACY_ARCHIVE_WRITE_UNVERIFIED');
  return {ok:true,staged:true};
 }
 return Object.freeze({stage});
}
