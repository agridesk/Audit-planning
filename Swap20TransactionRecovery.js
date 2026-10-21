/** Inspect a durable swap journal without mutating any planning data. */
function Swap20_recoveryStatus_(operationId){
 var history=Swap20Journal_history_(operationId);
 var stage=history.length?history[history.length-1].stage:'NOT_STARTED';
 return {operationId:operationId,stage:stage,sequence:history.length,
  requiresManualReview:history.length>0&&stage!=='COMMITTED'&&stage!=='ROLLED_BACK'};
}

/** Recover interrupted swap using its durable PREPARED before-images. */
function Swap20_recoverLocked_(operationId){
 if(String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('Swap recovery restricted to DEV');
 var history=Swap20Journal_history_(operationId);
 if(!history.length)throw Error('Swap journal not found');
 var last=history[history.length-1].stage;
 if(last==='PREPARED'||last==='WRITING')return {success:true,stage:last,readOnly:true,requiresReview:true};
 if(last==='COMMITTED'||last==='ROLLED_BACK')return {success:true,stage:last,idempotent:true};
 if(last==='CONFLICT')throw Error('Manual review required for conflicted recovery');
 if(last==='FAILED')throw Error('Manual review required for failed recovery');
 if(last==='ROLLING_BACK')return {success:true,stage:last,readOnly:true,requiresReview:true};
 throw Error('Unsupported recovery stage; manual review required');
}
