/***********************************************************************
 * PlanningCanonicalModifyService.js
 * BUILD: 2026-09-14_ROADMAP_2_4_CANONICAL_MODIFY_R8_NO_PAST_DATES
 *
 * Planned audit reschedule policy:
 *   - date/time blocks may change; auditor remains unchanged;
 *   - Pending Approval / Approved preserve status;
 *   - Accepted -> Approved and auditor must accept the changed planning again.
 *
 * R8:
 *   - canonical planning window remains a hard constraint for Modify;
 *   - new modified dates may never be before today's canonical spreadsheet date;
 *   - no grandfather/legacy bypass for PLANNING_WINDOW_OUTSIDE;
 *   - canonical row validation runs BEFORE any Availability mutation;
 *   - concrete validation code/message/planned/required hours are returned;
 *   - successful prevalidation is reused by the writer under the same lock;
 *   - rollback remains in place for reserve/write failures.
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_BUILD='2026-09-14_ROADMAP_2_4_CANONICAL_MODIFY_R8_NO_PAST_DATES';

function PCMOD_clean_(v){return String(v==null?'':v).trim();}
function PCMOD_normEmail_(v){return PCMOD_clean_(v).toLowerCase();}
function PCMOD_dependencies_(){return{
  lock:typeof Platform_withLock==='function',
  gate:typeof PlanningCommitGateService_evaluateLocked_==='function',
  loadContext:typeof loadContext_==='function',
  findAudit:typeof findAudit_==='function',
  validator:typeof PlanningCanonicalRowWriter_validate==='function',
  writer:typeof PlanningCanonicalRowWriter_execute==='function',
  release:typeof PlanningCanonicalAvailabilityAdapter_release==='function',
  reserve:typeof PlanningCanonicalAvailabilityAdapter_reserve==='function',
  ownerGuard:typeof PlanningCanonicalAvailabilityOwnerGuard_evaluate==='function',
  revisionBuilder:typeof PRT_tokenFromSnapshot_==='function'
};}
function PCMOD_assert_(){var d=PCMOD_dependencies_();Object.keys(d).forEach(function(k){if(!d[k])throw new Error('PlanningCanonicalModifyService: dependency unavailable: '+k);});}
function PCMOD_status_(raw){return typeof Status_normalizeStatus_==='function'?Status_normalizeStatus_(raw):PCMOD_clean_(raw).toUpperCase().replace(/\s+/g,'_');}
function PCMOD_display_(status){return typeof Status_toDisplayStatus_==='function'?Status_toDisplayStatus_(status):PCMOD_clean_(status);}
function PCMOD_todayIso_(){var ss=SpreadsheetApp.getActive();var tz=ss&&ss.getSpreadsheetTimeZone?ss.getSpreadsheetTimeZone():Session.getScriptTimeZone();return Utilities.formatDate(new Date(),tz||Session.getScriptTimeZone(),'yyyy-MM-dd');}
function PCMOD_pastDates_(blocks,today){var out=[];for(var i=0;i<(blocks||[]).length;i++){var d=PCMOD_clean_(blocks[i]&&blocks[i].date).slice(0,10);if(d&&d<today&&out.indexOf(d)<0)out.push(d);}return out.sort();}
function PCMOD_oldPlanning_(rowInfo){
  var ctx=rowInfo&&rowInfo.ctx||{},row=rowInfo&&rowInfo.row||[],raw=ctx.colJson>0?row[ctx.colJson-1]:'';
  var j={};
  try{j=raw?JSON.parse(String(raw)):{};}catch(e){j={};}
  return{
    raw:PCMOD_clean_(raw),
    blocks:Array.isArray(j.blocks)?j.blocks:[],
    auditorEmail:PCMOD_normEmail_(j.auditorEmail),
    auditorName:PCMOD_clean_(j.auditorName),
    assigned:ctx.colAssigned>0?PCMOD_clean_(row[ctx.colAssigned-1]):''
  };
}
function PCMOD_transition_(status){var s=PCMOD_status_(status),after=s==='ACCEPTED'?'APPROVED':s;return{beforeStatus:s,beforeStatusDisplay:PCMOD_display_(s),afterStatus:after,afterStatusDisplay:PCMOD_display_(after)};}
function PCMOD_restore_(auditId,old){if(!old||!old.blocks||!old.blocks.length)return{success:true,skipped:true,reason:'NO_OLD_BLOCKS'};return PlanningCanonicalAvailabilityAdapter_reserve({auditId:auditId,auditorEmail:old.auditorEmail||old.assigned,auditorName:old.auditorName||old.assigned,blocks:old.blocks});}
function PCMOD_failure_(auditId,reason,message,extra){
  var out={success:false,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:reason||'MODIFY_FAILED',message:message||reason||'Modify failed'};
  extra=extra||{};
  Object.keys(extra).forEach(function(k){out[k]=extra[k];});
  return out;
}
function PCMOD_notifyReaccept_(input,writeResult){
  if(typeof StatusNotificationBridge_QueueWithLock_!=='function'||typeof StatusNotificationBridge_LoadEcasAuditBriefing_!=='function')return{success:true,skipped:true,reason:'NOTIFICATION_DEPENDENCY_UNAVAILABLE'};
  try{
    var auditId=PCMOD_clean_(input.auditId),recipient=PCMOD_normEmail_(input.auditorEmail||writeResult&&writeResult.assignedTo),brief=StatusNotificationBridge_LoadEcasAuditBriefing_(auditId)||{};
    recipient=PCMOD_normEmail_(brief.auditorEmail||recipient);
    if(!recipient)return{success:false,retryable:true,reason:'REACCEPT_AUDITOR_RECIPIENT_MISSING'};
    var payload={auditId:auditId,action:'RESCHEDULE',actorRole:'MANAGER',actorEmail:PCMOD_clean_(input.actorEmail),recipientRole:'AUDITOR',recipientEmail:recipient,company:PCMOD_clean_(brief.company),companyUid:PCMOD_clean_(brief.companyUid),mpsNumber:PCMOD_clean_(brief.mpsNumber),auditNumber:PCMOD_clean_(brief.mpsNumber),scopes:Array.isArray(brief.scopes)?brief.scopes:[],blocks:Array.isArray(brief.blocks)?brief.blocks:[],plannedDates:Array.isArray(brief.plannedDates)?brief.plannedDates:[],plannedHours:brief.plannedHours,planningJson:PCMOD_clean_(brief.planningJson||writeResult&&writeResult.planningJson),auditorEmail:recipient,auditorName:PCMOD_clean_(brief.auditorName||input.auditorName),resultStatus:'Approved',comment:'Planning changed by manager; please review and accept the changed planning again.',reschedule:true,reacceptanceRequired:true,skipAuditBriefing:true,config:{consolidate:true,bufferMinutes:10}};
    return StatusNotificationBridge_QueueWithLock_(recipient,'AUDIT_PLANNED_BY_MANAGER',payload,auditId)||{success:true,skipped:true,reason:'NO_QUEUE_RESULT'};
  }catch(e){return{success:false,retryable:true,reason:'REACCEPT_NOTIFICATION_FAILED',error:PCMOD_clean_(e&&e.message||e)};}
}

function PlanningCanonicalModifyService_modify(input){
  input=input||{};
  var auditId=PCMOD_clean_(input.auditId),expected=PCMOD_clean_(input.expectedRevision),email=PCMOD_normEmail_(input.auditorEmail),name=PCMOD_clean_(input.auditorName),blocks=Array.isArray(input.blocks)?input.blocks:[];
  if(!auditId)throw new Error('PlanningCanonicalModifyService: auditId is required');
  if(!expected)throw new Error('PlanningCanonicalModifyService: expectedRevision is required');
  if(!blocks.length)throw new Error('PlanningCanonicalModifyService: blocks are required');
  PCMOD_assert_();

  var wait=Math.max(500,Math.min(10000,Number(input.lockWaitMs||3000)||3000));
  return Platform_withLock('planning-modify:'+auditId,function(){
    var today=PCMOD_todayIso_(),pastDates=PCMOD_pastDates_(blocks,today);
    if(pastDates.length)return PCMOD_failure_(auditId,'PAST_DATE_NOT_ALLOWED','Modify cannot create a new planning date before '+today+'.',{pastDates:pastDates,today:today,meta:{writes:false,lockUsed:true,pastDateHardRule:true,planningWindowLeading:true}});

    var gate=PlanningCommitGateService_evaluateLocked_({auditId:auditId,expectedRevision:expected,auditorEmail:email,auditorName:name,blocks:blocks,waiverAccepted:input.waiverAccepted===true});
    if(!gate||gate.canCommit!==true)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:gate&&gate.reason||'MODIFY_PREFLIGHT_BLOCKED',gate:gate||null,meta:{writes:false,lockUsed:true,planningWindowLeading:true,pastDateHardRule:true}};

    var owner=PlanningCanonicalAvailabilityOwnerGuard_evaluate();
    if(!owner||owner.canProceed!==true)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'CANONICAL_AVAILABILITY_OWNER_UNAVAILABLE',gate:gate,availabilityOwnerGuard:owner||null,meta:{writes:false,lockUsed:true}};

    var ss=SpreadsheetApp.getActive(),sh=ss&&ss.getSheetByName('Audit planning');
    if(!sh)return PCMOD_failure_(auditId,'AUDIT_PLANNING_SHEET_MISSING',"Sheet 'Audit planning' missing.");
    var rowInfo=findAudit_(loadContext_(sh),auditId);
    if(!rowInfo)return PCMOD_failure_(auditId,'AUDIT_NOT_FOUND_AT_WRITE_BOUNDARY','Audit not found at write boundary.');

    var status=PCMOD_status_(rowInfo.status);
    if(status!=='APPROVED'&&status!=='PENDING_APPROVAL'&&status!=='ACCEPTED')return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'STATUS_NOT_MODIFIABLE',canonicalStatus:rowInfo.status,gate:gate,meta:{writes:false,lockUsed:true}};

    var old=PCMOD_oldPlanning_(rowInfo),oldOwner=PCMOD_normEmail_(old.auditorEmail||old.assigned),newOwner=PCMOD_normEmail_(email||name);
    if(oldOwner&&newOwner&&oldOwner!==newOwner)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'AUDITOR_CHANGE_NOT_SUPPORTED_R8',canonicalStatus:rowInfo.status,meta:{writes:false,lockUsed:true,sameAuditorOnly:true}};
    if(!email&&old.auditorEmail)email=old.auditorEmail;
    if(!name&&old.auditorName)name=old.auditorName;

    var transition=PCMOD_transition_(rowInfo.status);
    var writerOpts={auditId:auditId,blocks:blocks,auditorName:name||old.auditorName,auditorEmail:email||old.auditorEmail,allowWeekend:input.allowWeekendOverride!==false,isReschedule:true};

    var validation=PlanningCanonicalRowWriter_validate(rowInfo,transition,writerOpts);
    if(!validation||validation.success!==true){
      return PCMOD_failure_(auditId,validation&&validation.code||'CANONICAL_ROW_VALIDATION_FAILED',validation&&validation.message||'Canonical row validation failed.',{
        validation:validation||null,
        plannedHours:validation&&validation.plannedHours,
        requiredHours:validation&&validation.requiredHours,
        hardConflicts:validation&&validation.hardConflicts||[],
        gate:gate,
        meta:{writes:false,lockUsed:true,validatedBeforeAvailability:true,availabilityMutated:false,planningWindowLeading:true,pastDateHardRule:true}
      });
    }

    var released=PlanningCanonicalAvailabilityAdapter_release({auditId:auditId});
    if(!released||released.success===false)return PCMOD_failure_(auditId,'OLD_AVAILABILITY_RELEASE_FAILED',PCMOD_clean_(released&&released.message)||'Old Availability could not be released.',{availabilityRelease:released||null,validation:validation});
    SpreadsheetApp.flush();

    var reserved=PlanningCanonicalAvailabilityAdapter_reserve({auditId:auditId,auditorEmail:email||old.assigned,auditorName:name||old.assigned,blocks:blocks});
    if(!reserved||reserved.success===false){
      var restoreAfterReserveFail=PCMOD_restore_(auditId,old);
      SpreadsheetApp.flush();
      return PCMOD_failure_(auditId,'NEW_AVAILABILITY_RESERVE_FAILED',PCMOD_clean_(reserved&&reserved.message)||'New Availability could not be reserved.',{availabilityReserve:reserved||null,restoreResult:restoreAfterReserveFail,repairRequired:!(restoreAfterReserveFail&&restoreAfterReserveFail.success!==false),validation:validation});
    }
    SpreadsheetApp.flush();

    writerOpts.prevalidated=validation;
    var writeResult=PlanningCanonicalRowWriter_execute(rowInfo,transition,writerOpts);
    if(!writeResult||writeResult.success!==true){
      var releaseNew=PlanningCanonicalAvailabilityAdapter_release({auditId:auditId}),restoreAfterWriteFail=PCMOD_restore_(auditId,old);
      SpreadsheetApp.flush();
      return PCMOD_failure_(auditId,writeResult&&writeResult.code||'CANONICAL_ROW_WRITE_FAILED',writeResult&&writeResult.message||'Canonical row write failed.',{writeResult:writeResult||null,newAvailabilityRelease:releaseNew||null,restoreResult:restoreAfterWriteFail,repairRequired:!(restoreAfterWriteFail&&restoreAfterWriteFail.success!==false),validation:validation});
    }
    SpreadsheetApp.flush();

    var reaccept=status==='ACCEPTED';
    var notification=reaccept?PCMOD_notifyReaccept_({auditId:auditId,auditorEmail:email,auditorName:name,actorEmail:input.actorEmail},writeResult):null;
    var newRevision=PRT_tokenFromSnapshot_({auditId:auditId,status:writeResult.newStatus||writeResult.afterStatusDisplay,assignedTo:writeResult.assignedTo,datePlanned:writeResult.plannedDate,planningJson:writeResult.planningJson});
    return{
      success:true,
      build:PLANNING_CANONICAL_MODIFY_BUILD,
      auditId:auditId,
      modified:true,
      reason:reaccept?'MODIFIED_REACCEPTANCE_REQUIRED':'MODIFIED',
      gate:gate,
      validation:validation,
      plannedHours:validation.plannedHours,
      requiredHours:validation.requiredHours,
      availabilityRelease:released,
      availabilityReserve:reserved,
      writeResult:writeResult,
      newRevision:newRevision,
      notification:notification,
      meta:{writes:true,lockUsed:true,sameAuditorOnly:true,statusPreserved:!reaccept,reacceptanceRequired:reaccept,acceptedMovesToApproved:reaccept,validatedBeforeAvailability:true,availabilityRestoreOnFailure:true,availabilityFlushedBeforeRefresh:true,planningWindowLeading:true,pastDateHardRule:true,notificationRequired:reaccept,notificationDispatched:!!(notification&&notification.success===true&&notification.skipped!==true),notificationFailureDoesNotRollbackLifecycle:true,notificationEvent:reaccept?'AUDIT_PLANNED_BY_MANAGER':'',newSsot:false}
    };
  },wait);
}
