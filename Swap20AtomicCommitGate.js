/** Authenticated manager commit. DEV only, opt-in after DEV acceptance. */
function Swap20ManagerCommit(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw Error('Manager authentication required');
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('Swap commit restricted to DEV');
 if(String(props.getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')!=='true')
  return {success:false,code:'SWAP_ATOMIC_WRITE_DISABLED',readOnly:true,message:'DEV acceptance gate not enabled'};
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(20000))throw Error('Swap transaction lock busy');
 try{
  var proposal=Swap20Store_read_(input.operationId);
  if(!proposal)throw Error('Swap proposal missing');
  var history=Swap20Journal_history_(proposal.operationId);
  if(history.length){
   var last=history[history.length-1].stage;
   if(last==='COMMITTED'){
    var current=Swap20Store_read_(proposal.operationId);
    if(current&&current.status==='APPLIED'&&current.canonicalCommitVerified===true)
     return Swap20_finishCommitWithNotificationLocked_({success:true,operationId:proposal.operationId,committed:true,idempotent:true});
    if(current&&current.status==='CONFIRMED'&&JSON.stringify(current)===JSON.stringify(proposal)){
     if(typeof Swap20_verifyCommittedReconciliationLocked_!=='function'||Swap20_verifyCommittedReconciliationLocked_(history,current)!==true)throw Error('Committed swap cannot be reconciled without verified paired state');
     // Journal COMMITTED is written only after verified paired canonical and
     // availability writes; never repeat those writes on a retry.
     var repaired=JSON.parse(JSON.stringify(current));
     repaired.status='APPLIED';repaired.canonicalCommitVerified=true;
     repaired.appliedAt=new Date().toISOString();repaired.appliedBy=String(auth.email);
     Swap20_validateTransition_(current,repaired);
     var repairedKey=Swap20Store_key_(proposal.operationId);
     if(props.getProperty(repairedKey)!==JSON.stringify(current))
      throw Error('Committed swap proposal changed; reconciliation required');
     props.setProperty(repairedKey,JSON.stringify(repaired));
     return Swap20_finishCommitWithNotificationLocked_({success:true,operationId:proposal.operationId,committed:true,reconciled:true,status:'APPLIED'});
    }
    throw Error('Committed swap requires proposal reconciliation');
   }
   throw Error('Swap transaction already journaled; recovery required');
  }
  if(proposal.status!=='CONFIRMED')throw Error('Confirmed swap proposal required');
  var result=Swap20_executeLocked_(proposal);
  if(!result||result.committed!==true)throw Error('Swap canonical commit unverified');
  var next=JSON.parse(JSON.stringify(proposal));
  next.status='APPLIED';next.canonicalCommitVerified=true;
  next.appliedAt=new Date().toISOString();next.appliedBy=String(auth.email);
  // Store transition uses the script lock itself; do not re-enter LockService.
  var key=Swap20Store_key_(proposal.operationId),raw=props.getProperty(key);
  if(!raw||raw!==JSON.stringify(proposal))throw Error('Committed swap proposal changed; reconciliation required');
  Swap20_validateTransition_(proposal,next);
  props.setProperty(key,JSON.stringify(next));
  return Swap20_finishCommitWithNotificationLocked_({success:true,operationId:proposal.operationId,committed:true,status:'APPLIED'});
 }finally{lock.releaseLock();}
}

function Swap20_finishCommitWithNotificationLocked_(result){
 var intent={ok:false,reason:'INTENT_NOT_RECORDED'};
 try{
  if(typeof Swap20_stageNotificationAfterCommitLocked_!=='function')throw Error('Intent stage handler missing');
  intent=Swap20_stageNotificationAfterCommitLocked_(result.operationId);
 }catch(e){intent={ok:false,reason:'INTENT_STAGE_FAILED',detail:String(e)};}
 result.notificationIntent=intent;
 result.notificationPending=!(intent&&intent.ok===true&&intent.queued===true);
 result.notificationQueued=!!(intent&&intent.queued===true);
 // A notification failure must not convert an APPLIED canonical transaction into failure.
 // Retry the same operation ID after delivery prerequisites are satisfied.
 return result;
}
