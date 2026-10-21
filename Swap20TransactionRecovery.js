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
 if(last==='PREPARED')return {success:true,stage:'PREPARED',readOnly:true,requiresReview:true};
 if(last==='COMMITTED'||last==='ROLLED_BACK')return {success:true,stage:last,idempotent:true};
 if(last==='FAILED')throw Error('Manual review required for failed recovery');
 var prepared=history[0];
 if(prepared.stage!=='PREPARED'||!prepared.payload||!prepared.payload.canonical||!prepared.payload.availability)throw Error('Swap before-images unavailable');
 var failures=[];
 try{Swap20Journal_appendLocked_(operationId,history.length,'ROLLING_BACK',{recovery:true});}catch(e){failures.push(String(e));}
 try{Swap20_restoreCanonicalBeforeImages_(prepared.payload.canonical);}catch(e){failures.push(String(e));}
 try{Swap20_restoreAvailabilityBeforeImages_(prepared.payload.availability);}catch(e){failures.push(String(e));}
 var stage=failures.length?'FAILED':'ROLLED_BACK';
 Swap20Journal_appendLocked_(operationId,Swap20Journal_history_(operationId).length,stage,{recovery:true,failures:failures});
 if(failures.length)throw Error('Swap recovery incomplete: '+failures.join('; '));
 return {success:true,stage:stage,operationId:operationId};
}
