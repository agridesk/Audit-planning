/**
 * Swap 2.0 DEV proposal persistence. Script Properties stores only bounded
 * proposal metadata; no canonical audit or availability writes.
 */
var SWAP20_STORE_PREFIX_='AMS_SWAP20_PROPOSAL_';
function Swap20Store_key_(id){
 id=String(id||'').trim();
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(id))throw new Error('Invalid swap operation ID');
 return SWAP20_STORE_PREFIX_+id;
}
function Swap20Store_read_(id){
 var raw=PropertiesService.getScriptProperties().getProperty(Swap20Store_key_(id));
 return raw?JSON.parse(raw):null;
}
function Swap20Store_create_(proposal){
 if(!proposal||!proposal.operationId||!proposal.auditA||!proposal.auditB||proposal.auditA===proposal.auditB)throw new Error('Invalid swap proposal');
 if(!Array.isArray(proposal.requiredAuditorUids)||!proposal.requiredAuditorUids.length||!Array.isArray(proposal.acknowledgedAuditorUids)||proposal.acknowledgedAuditorUids.length)throw new Error('Invalid initial acknowledgements');
 if(proposal.status!=='AWAITING_ACKNOWLEDGEMENT'&&!(proposal.status==='CONFIRMED'&&proposal.dateChanged===false))throw new Error('Invalid initial proposal status');
 var key=Swap20Store_key_(proposal.operationId),lock=LockService.getScriptLock();
 if(!lock.tryLock(20000))throw new Error('Swap proposal store busy');
 try{
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty(key))throw new Error('Swap operation already exists');
  var raw=JSON.stringify(proposal);
  if(raw.length>8000)throw new Error('Swap proposal exceeds storage limit');
  props.setProperty(key,raw);
  return {success:true,operationId:proposal.operationId,status:proposal.status};
 }finally{lock.releaseLock();}
}
function Swap20Store_transition_(operationId,expectedStatus,nextProposal,expectedSnapshot){
 var key=Swap20Store_key_(operationId),lock=LockService.getScriptLock();
 if(!lock.tryLock(20000))throw new Error('Swap proposal store busy');
 try{
  var props=PropertiesService.getScriptProperties(),raw=props.getProperty(key);
  if(!raw)throw new Error('Swap proposal not found');
  var previous=JSON.parse(raw);
  if(previous.status!==expectedStatus)throw new Error('Swap proposal status conflict');
  if(expectedSnapshot&&JSON.stringify(previous)!==JSON.stringify(expectedSnapshot))throw new Error('Swap proposal concurrent modification');
  Swap20_validateTransition_(previous,nextProposal);
  if(!nextProposal||nextProposal.operationId!==operationId||nextProposal.auditA!==previous.auditA||nextProposal.auditB!==previous.auditB)throw new Error('Swap proposal identity mismatch');
  var output=JSON.stringify(nextProposal);
  if(output.length>8000)throw new Error('Swap proposal exceeds storage limit');
  props.setProperty(key,output);
  return {success:true,operationId:operationId,status:nextProposal.status};
 }finally{lock.releaseLock();}
}
