'use strict';
const {evaluateCombinedRotation}=require('./rotation-policy-20');
// This decision adapter is intentionally side-effect free. The canonical writer
// must recompute under its write lock; a UI warning is never an authorization.
function preassignmentRotationDecision(scopes,phase){
  const result=evaluateCombinedRotation(scopes);
  const validPhase=['DRAFT','PREASSIGN','COMMIT'].includes(phase);
  if(!validPhase)return {decision:'BLOCK',reason:'UNKNOWN_PHASE',...result};
  if(result.allowed)return {decision:'ALLOW',...result};
  const hard=result.results.some(r=>['CONFIG_ERROR','CONFLICT','LIMIT_REACHED'].includes(r.status));
  if(phase==='DRAFT'&&!hard)return {decision:'WARN',...result};
  if(phase==='PREASSIGN'&&!hard)return {decision:'WARN',...result,requiresManagerReview:true};
  return {decision:'BLOCK',...result};
}
module.exports={preassignmentRotationDecision};
