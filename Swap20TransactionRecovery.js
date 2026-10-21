/** Inspect a durable swap journal without mutating any planning data. */
function Swap20_recoveryStatus_(operationId){
 var history=Swap20Journal_history_(operationId);
 var stage=history.length?history[history.length-1].stage:'NOT_STARTED';
 return {operationId:operationId,stage:stage,sequence:history.length,
  requiresManualReview:history.length>0&&stage!=='COMMITTED'&&stage!=='ROLLED_BACK'};
}
