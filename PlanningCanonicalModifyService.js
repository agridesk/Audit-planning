/***********************************************************************
 * PlanningCanonicalModifyService.js
 * BUILD: 2026-09-13_ROADMAP_2_4_CANONICAL_MODIFY_R1_SAME_AUDITOR
 *
 * Safe first modify scope for already planned audits:
 *   - date/time blocks may change;
 *   - auditor remains unchanged in R1;
 *   - canonical status is preserved for Pending Approval / Approved;
 *   - Accepted is deliberately blocked until re-acceptance/notification
 *     policy is implemented.
 *
 * Uses revision guard + canonical preflight. Availability is migrated with
 * explicit restoration of the previous reservation on failure.
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_BUILD='2026-09-13_ROADMAP_2_4_CANONICAL_MODIFY_R1_SAME_AUDITOR';
function PCMOD_clean_(v){return String(v==null?'':v).trim();}
function PCMOD_normEmail_(v){return PCMOD_clean_(v).toLowerCase();}
function PCMOD_dependencies_(){return{
  lock:typeof Platform_withLock==='function',
  gate:typeof PlanningCommitGateService_evaluateLocked_==='function',
  loadContext:typeof loadContext_==='function',
  findAudit:typeof findAudit_==='function',
  writer:typeof PlanningCanonicalRowWriter_execute==='function',
  release:typeof PlanningCanonicalAvailabilityAdapter_release==='function',
  reserve:typeof PlanningCanonicalAvailabilityAdapter_reserve==='function',
  ownerGuard:typeof PlanningCanonicalAvailabilityOwnerGuard_evaluate==='function',
  revisionBuilder:typeof PRT_tokenFromSnapshot_==='function'
};}
function PCMOD_assert_(){var d=PCMOD_dependencies_();Object.keys(d).forEach(function(k){if(!d[k])throw new Error('PlanningCanonicalModifyService: dependency unavailable: '+k);});}
function PCMOD_status_(raw){return typeof Status_normalizeStatus_==='function'?Status_normalizeStatus_(raw):PCMOD_clean_(raw).toUpperCase().replace(/\s+/g,'_');}
function PCMOD_oldPlanning_(rowInfo){
  var ctx=rowInfo&&rowInfo.ctx||{},row=rowInfo&&rowInfo.row||[],raw=ctx.colJson>0?row[ctx.colJson-1]:'';
  var j={};try{j=raw?JSON.parse(String(raw)):{};}catch(e){j={};}
  return{raw:PCMOD_clean_(raw),blocks:Array.isArray(j.blocks)?j.blocks:[],auditorEmail:PCMOD_normEmail_(j.auditorEmail),auditorName:PCMOD_clean_(j.auditorName),assigned:ctx.colAssigned>0?PCMOD_clean_(row[ctx.colAssigned-1]):''};
}
function PCMOD_transition_(status){var display=typeof Status_toDisplayStatus_==='function'?Status_toDisplayStatus_(status):PCMOD_clean_(status);return{beforeStatus:PCMOD_status_(status),beforeStatusDisplay:display,afterStatus:PCMOD_status_(status),afterStatusDisplay:display};}
function PCMOD_restore_(auditId,old){if(!old||!old.blocks||!old.blocks.length)return{success:true,skipped:true,reason:'NO_OLD_BLOCKS'};return PlanningCanonicalAvailabilityAdapter_reserve({auditId:auditId,auditorEmail:old.auditorEmail||old.assigned,auditorName:old.auditorName||old.assigned,blocks:old.blocks});}
function PlanningCanonicalModifyService_modify(input){
  input=input||{};
  var auditId=PCMOD_clean_(input.auditId),expected=PCMOD_clean_(input.expectedRevision),email=PCMOD_normEmail_(input.auditorEmail),name=PCMOD_clean_(input.auditorName),blocks=Array.isArray(input.blocks)?input.blocks:[];
  if(!auditId)throw new Error('PlanningCanonicalModifyService: auditId is required');
  if(!expected)throw new Error('PlanningCanonicalModifyService: expectedRevision is required');
  if(!blocks.length)throw new Error('PlanningCanonicalModifyService: blocks are required');
  PCMOD_assert_();
  var wait=Math.max(500,Math.min(10000,Number(input.lockWaitMs||3000)||3000));
  return Platform_withLock('planning-modify:'+auditId,function(){
    var gate=PlanningCommitGateService_evaluateLocked_({auditId:auditId,expectedRevision:expected,auditorEmail:email,auditorName:name,blocks:blocks,waiverAccepted:input.waiverAccepted===true});
    if(!gate||gate.canCommit!==true)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:gate&&gate.reason||'MODIFY_PREFLIGHT_BLOCKED',gate:gate||null,meta:{writes:false,lockUsed:true}};
    var owner=PlanningCanonicalAvailabilityOwnerGuard_evaluate();
    if(!owner||owner.canProceed!==true)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'CANONICAL_AVAILABILITY_OWNER_UNAVAILABLE',gate:gate,availabilityOwnerGuard:owner||null,meta:{writes:false,lockUsed:true}};
    var ss=SpreadsheetApp.getActive(),sh=ss&&ss.getSheetByName('Audit planning');
    if(!sh)return{success:false,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:"Sheet 'Audit planning' missing."};
    var rowInfo=findAudit_(loadContext_(sh),auditId);
    if(!rowInfo)return{success:false,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'AUDIT_NOT_FOUND_AT_WRITE_BOUNDARY'};
    var status=PCMOD_status_(rowInfo.status);
    if(status==='ACCEPTED')return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'ACCEPTED_MODIFY_REQUIRES_REACCEPTANCE_POLICY',canonicalStatus:rowInfo.status,gate:gate,meta:{writes:false,lockUsed:true,policyDecisionRequired:true}};
    if(status!=='APPROVED'&&status!=='PENDING_APPROVAL')return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'STATUS_NOT_MODIFIABLE',canonicalStatus:rowInfo.status,gate:gate,meta:{writes:false,lockUsed:true}};
    var old=PCMOD_oldPlanning_(rowInfo),oldOwner=PCMOD_normEmail_(old.auditorEmail||old.assigned),newOwner=PCMOD_normEmail_(email||name);
    if(oldOwner&&newOwner&&oldOwner!==newOwner)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'AUDITOR_CHANGE_NOT_SUPPORTED_R1',canonicalStatus:rowInfo.status,meta:{writes:false,lockUsed:true,sameAuditorOnly:true}};
    if(!email&&old.auditorEmail)email=old.auditorEmail;if(!name&&old.auditorName)name=old.auditorName;
    var released=PlanningCanonicalAvailabilityAdapter_release({auditId:auditId});
    if(!released||released.success===false)return{success:false,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'OLD_AVAILABILITY_RELEASE_FAILED',availabilityRelease:released||null};
    var reserved=PlanningCanonicalAvailabilityAdapter_reserve({auditId:auditId,auditorEmail:email||old.assigned,auditorName:name||old.assigned,blocks:blocks});
    if(!reserved||reserved.success===false){var restoreAfterReserveFail=PCMOD_restore_(auditId,old);return{success:false,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'NEW_AVAILABILITY_RESERVE_FAILED',availabilityReserve:reserved||null,restoreResult:restoreAfterReserveFail,repairRequired:!(restoreAfterReserveFail&&restoreAfterReserveFail.success!==false)};}
    var transition=PCMOD_transition_(rowInfo.status),writeResult=PlanningCanonicalRowWriter_execute(rowInfo,transition,{auditId:auditId,blocks:blocks,auditorName:name||old.auditorName,auditorEmail:email||old.auditorEmail,allowWeekend:input.allowWeekendOverride!==false,isReschedule:true});
    if(!writeResult||writeResult.success!==true){var releaseNew=PlanningCanonicalAvailabilityAdapter_release({auditId:auditId}),restoreAfterWriteFail=PCMOD_restore_(auditId,old);return{success:false,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'CANONICAL_ROW_WRITE_FAILED',writeResult:writeResult||null,newAvailabilityRelease:releaseNew||null,restoreResult:restoreAfterWriteFail,repairRequired:!(restoreAfterWriteFail&&restoreAfterWriteFail.success!==false)};}
    var newRevision=PRT_tokenFromSnapshot_({auditId:auditId,status:writeResult.newStatus||writeResult.afterStatusDisplay,assignedTo:writeResult.assignedTo,datePlanned:writeResult.plannedDate,planningJson:writeResult.planningJson});
    return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:true,reason:'MODIFIED',gate:gate,availabilityRelease:released,availabilityReserve:reserved,writeResult:writeResult,newRevision:newRevision,meta:{writes:true,lockUsed:true,sameAuditorOnly:true,statusPreserved:true,acceptedBlockedPendingReacceptancePolicy:true,availabilityRestoreOnFailure:true,notificationRequired:status==='APPROVED'||status==='PENDING_APPROVAL',notificationDispatched:false,newSsot:false}};
  },wait);
}
