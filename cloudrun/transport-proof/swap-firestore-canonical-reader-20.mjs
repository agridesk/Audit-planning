/**
 * DEV-only canonical Firestore snapshot reader for SWAP 2.0.
 * Uses batchGet to retrieve six independent revisioned documents.
 * Fail closed on missing records, unexpected document paths and duplicates.
 */
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
export function createSwapFirestoreCanonicalReader({project,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||'')||typeof getToken!=='function')
  throw Error('SWAP_CANONICAL_READER_CONFIG_INVALID');
 const root='projects/'+project+'/databases/(default)/documents/';
 const endpoint='https://firestore.googleapis.com/v1/'+root+':batchGet';
 async function fetchDocuments(paths){
  const token=await getToken();
  if(!token)throw Error('SWAP_CANONICAL_READER_TOKEN_MISSING');
  const response=await fetchImpl(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({documents:paths.map(path=>root+path)}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('SWAP_CANONICAL_READER_HTTP_'+response.status);
  const body=await response.text();
  let raw;
  try{raw=JSON.parse(body);}catch{
   try{raw=body.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
   catch{throw Error('SWAP_CANONICAL_READER_RESPONSE_INVALID');}
  }
  if(!Array.isArray(raw))raw=[raw];
  if(raw.length!==paths.length)throw Error('SWAP_CANONICAL_READER_COUNT_INVALID');
  const map=new Map();
  for(const item of raw){
   if(!item.found||!item.found.name||!item.found.updateTime||!TIME.test(item.found.updateTime))
    throw Error('SWAP_CANONICAL_READER_DOCUMENT_MISSING');
   const name=item.found.name;
   if(!paths.some(path=>root+path===name)||map.has(name))
    throw Error('SWAP_CANONICAL_READER_DOCUMENT_UNEXPECTED');
   let payload;
   try{payload=JSON.parse(item.found.fields?.payload?.stringValue||'null');}
   catch{throw Error('SWAP_CANONICAL_READER_PAYLOAD_INVALID');}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('SWAP_CANONICAL_READER_PAYLOAD_INVALID');
   map.set(name,{payload,updateTime:item.found.updateTime});
  }
  return paths.map(path=>map.get(root+path));
 }
 function validatePair(ids){
  if(!Array.isArray(ids)||ids.length!==2||ids.some(id=>!ID.test(String(id||'')))||ids[0]===ids[1])
   throw Error('SWAP_CANONICAL_READER_PAIR_INVALID');
 }
 async function readPair(ids){
  validatePair(ids);
  const records=await fetchDocuments(ids.map(id=>'ams_swap20_dev_audits/'+id));
  return records.map((record,i)=>({auditId:ids[i],status:record.payload.status,canonical:record.payload,
   updateTime:record.updateTime,source:'firestore-canonical'}));
 }
 async function readAvailability(ids){
  validatePair(ids);
  const records=await fetchDocuments(ids.map(id=>'ams_swap20_dev_availability/'+id));
  return records.map((record,i)=>{
   if(!Array.isArray(record.payload.reservations))throw Error('SWAP_CANONICAL_READER_RESERVATIONS_INVALID');
   return {auditId:ids[i],canonical:record.payload,reservations:record.payload.reservations,updateTime:record.updateTime,source:'firestore-canonical'};
  });
 }
 async function readJournal(operationId){
  if(!ID.test(String(operationId||'')))throw Error('SWAP_CANONICAL_READER_OPERATION_INVALID');
  const [record]=await fetchDocuments(['ams_swap20_dev_journal/'+operationId]);
  if(record.payload.operationId!==operationId)throw Error('SWAP_CANONICAL_READER_JOURNAL_MISMATCH');
  return {...record.payload,updateTime:record.updateTime};
 }
 async function readProposal(operationId){
  if(!ID.test(String(operationId||'')))throw Error('SWAP_CANONICAL_READER_OPERATION_INVALID');
  const [record]=await fetchDocuments(['ams_swap20_dev_proposals/'+operationId]);
  if(record.payload.operationId!==operationId)throw Error('SWAP_CANONICAL_READER_OPERATION_MISMATCH');
  return {...record.payload,updateTime:record.updateTime,source:'firestore-canonical'};
 }
 return Object.freeze({readPair,readAvailability,readProposal,readJournal});
}
