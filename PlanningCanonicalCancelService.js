/***********************************************************************
 * PlanningCanonicalCancelService.js
 * BUILD: 2026-09-13_ROADMAP_2_4_CANONICAL_CANCEL_R1
 *
 * Manager command for cancelling an already planned audit back to
 * Pending Planning. StatusMachine remains lifecycle owner and performs
 * the canonical Availability release + planning reset.
 ***********************************************************************/
var PLANNING_CANONICAL_CANCEL_BUILD='2026-09-13_ROADMAP_2_4_CANONICAL_CANCEL_R1';
function PCCAN_clean_(v){return String(v==null?'':v).trim();}
function PCCAN_dependencies_(){return{
  lock:typeof Platform_withLock==='function',
  revision:typeof PlanningRevisionTokenService_get==='function',
  revisionGuard:typeof PlanningOptimisticRevisionGuard_evaluate==='function',
  statusAction:typeof Status_applyAction==='function'
};}
function PCCAN_assert_(){var d=PCCAN_dependencies_();Object.keys(d).forEach(function(k){if(!d[k])throw new Error('PlanningCanonicalCancelService: dependency unavailable: '+k);});}
function PlanningCanonicalCancelService_cancel(input){
  input=input||{};
  var auditId=PCCAN_clean_(input.auditId),expected=PCCAN_clean_(input.expectedRevision),reason=PCCAN_clean_(input.reason),actorEmail=PCCAN_clean_(input.actorEmail||input.cancelledBy);
  if(!auditId)throw new Error('PlanningCanonicalCancelService: auditId is required');
  if(!expected)throw new Error('PlanningCanonicalCancelService: expectedRevision is required');
  if(!reason)throw new Error('PlanningCanonicalCancelService: reason is required');
  PCCAN_assert_();
  var wait=Math.max(500,Math.min(10000,Number(input.lockWaitMs||3000)||3000));
  return Platform_withLock('planning-cancel:'+auditId,function(){
    var current=PlanningRevisionTokenService_get({auditId:auditId});
    var guard=PlanningOptimisticRevisionGuard_evaluate({auditId:auditId,expectedRevision:expected,currentRevision:current&&current.revision});
    if(!guard||guard.accepted!==true)return{success:true,build:PLANNING_CANONICAL_CANCEL_BUILD,auditId:auditId,cancelled:false,reason:guard&&guard.reason||'REVISION_CONFLICT',revisionGuard:guard||null,currentRevision:current&&current.revision||'',meta:{writes:false,lockUsed:true,statusOwner:'StatusMachine'}};
    var result=Status_applyAction('MANAGER','CANCEL',auditId,{reason:reason,actorEmail:actorEmail,source:'Planning Workspace 2.0'});
    if(!result||result.success!==true)return{success:false,build:PLANNING_CANONICAL_CANCEL_BUILD,auditId:auditId,cancelled:false,reason:PCCAN_clean_(result&&result.message)||PCCAN_clean_(result&&result.code)||'CANCEL_FAILED',statusResult:result||null,revisionGuard:guard,meta:{writes:false,lockUsed:true,statusOwner:'StatusMachine'}};
    var after=PlanningRevisionTokenService_get({auditId:auditId});
    return{success:true,build:PLANNING_CANONICAL_CANCEL_BUILD,auditId:auditId,cancelled:true,reason:'CANCELLED_TO_PENDING_PLANNING',statusResult:result,revisionGuard:guard,newRevision:after&&after.revision||'',meta:{writes:true,lockUsed:true,statusOwner:'StatusMachine',availabilityReleaseOwner:'StatusMachine/AvailabilityService',canonicalTargetStatus:'Pending Planning',planningReset:true,notificationBridgeOwnedByStatusMachine:true,newSsot:false}};
  },wait);
}
