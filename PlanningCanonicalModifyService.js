/***********************************************************************
 * PlanningCanonicalModifyService.js
 * BUILD: 2026-09-14_ROADMAP_2_4_CANONICAL_MODIFY_R6_EXISTING_OUTSIDE_WINDOW
 *
 * Planned audit reschedule policy:
 *   - date/time blocks may change; auditor remains unchanged;
 *   - Pending Approval / Approved preserve status;
 *   - Accepted -> Approved and auditor must accept the changed planning again.
 *
 * R6:
 *   - already-planned audits whose existing canonical planning is outside the
 *     resolved planning window may be rescheduled outside that window;
 *   - this is a Modify-only exception for legacy/current planned audits;
 *   - ONLY PLANNING_WINDOW_OUTSIDE is downgraded; qualification,
 *     availability, revision and all other hard blocks remain hard;
 *   - audits whose existing canonical planning is inside the window do NOT
 *     receive this exception;
 *   - normal/new planning-window enforcement is unchanged;
 *   - row validation still runs before any Availability mutation.
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_BUILD='2026-09-14_ROADMAP_2_4_CANONICAL_MODIFY_R6_EXISTING_OUTSIDE_WINDOW';

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
function PCMOD_iso_(v){
  if(!v)return'';
  if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())){
    var tz='Etc/UTC';try{tz=SpreadsheetApp.getActive().getSpreadsheetTimeZone()||tz;}catch(e){}
    return Utilities.formatDate(v,tz,'yyyy-MM-dd');
  }
  var s=PCMOD_clean_(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  var m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);return m?m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2):'';
}
function PCMOD_dayNumber_(iso){var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Math.floor(Date.UTC(+m[1],+m[2]-1,+m[3])/86400000):null;}
function PCMOD_outsideDistance_(dateIso,fromIso,toIso){
  var d=PCMOD_dayNumber_(dateIso),f=PCMOD_dayNumber_(fromIso),t=PCMOD_dayNumber_(toIso);if(d==null||f==null||t==null)return null;
  if(d<f)return f-d;if(d>t)return d-t;return 0;
}
function PCMOD_verdictRule_(v){return PCMOD_clean_(v&&v.ruleCode||v&&v.code);}
function PCMOD_grandfatherWindow_(gate,rowInfo,newBlocks){
  if(!gate||gate.revisionAccepted!==true||!gate.preflight||!gate.preflight.validatorResult)return{allowed:false,reason:'GATE_NOT_ELIGIBLE'};
  var aggregate=gate.preflight.validatorResult||{},verdicts=Array.isArray(aggregate.verdicts)?aggregate.verdicts:[];
  var windowVerdict=null,otherHard=[];
  verdicts.forEach(function(v){
    if(PCMOD_clean_(v&&v.level).toUpperCase()!=='HARD_BLOCK')return;
    if(PCMOD_verdictRule_(v)==='PLANNING_WINDOW_OUTSIDE'&&!windowVerdict)windowVerdict=v;else otherHard.push(v);
  });
  if(!windowVerdict)return{allowed:false,reason:'NO_WINDOW_HARD_BLOCK'};
  if(otherHard.length)return{allowed:false,reason:'OTHER_HARD_BLOCKS',otherHardBlocks:otherHard};

  var ev=windowVerdict.evidence||{},from=PCMOD_iso_(ev.from),to=PCMOD_iso_(ev.to);
  if(!from||!to)return{allowed:false,reason:'WINDOW_EVIDENCE_MISSING'};
  var old=PCMOD_oldPlanning_(rowInfo),oldBlocks=old.blocks||[];
  if(!oldBlocks.length)return{allowed:false,reason:'NO_EXISTING_PLANNING'};

  var oldMax=0,newMax=0,oldValid=true,newValid=true;
  oldBlocks.forEach(function(b){var x=PCMOD_outsideDistance_(PCMOD_iso_(b&&b.date),from,to);if(x==null)oldValid=false;else if(x>oldMax)oldMax=x;});
  (newBlocks||[]).forEach(function(b){var x=PCMOD_outsideDistance_(PCMOD_iso_(b&&b.date),from,to);if(x==null)newValid=false;else if(x>newMax)newMax=x;});
  if(!oldValid||!newValid)return{allowed:false,reason:'INVALID_DATE'};
  if(oldMax<=0)return{allowed:false,reason:'EXISTING_PLANNING_NOT_OUTSIDE_WINDOW',oldMaxDays:oldMax,newMaxDays:newMax,from:from,to:to};
  return{allowed:true,reason:'GRANDFATHERED_EXISTING_OUTSIDE_WINDOW_MODIFY',oldMaxDays:oldMax,newMaxDays:newMax,from:from,to:to,ruleCode:'PLANNING_WINDOW_OUTSIDE'};
}
function PCMOD_acceptGrandfatheredGate_(gate,grandfather){
  gate.canCommit=true;
  gate.reason='GATE_ACCEPTED_GRANDFATHERED_RESCHEDULE';
  gate.grandfatheredPlanningWindow=grandfather;
  if(gate.meta){gate.meta.futureWriteAllowed=true;gate.meta.grandfatheredReschedule=true;}
  return gate;
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
    var gate=PlanningCommitGateService_evaluateLocked_({auditId:auditId,expectedRevision:expected,auditorEmail:email,auditorName:name,blocks:blocks,waiverAccepted:input.waiverAccepted===true});

    var ss=SpreadsheetApp.getActive(),sh=ss&&ss.getSheetByName('Audit planning');
    if(!sh)return PCMOD_failure_(auditId,'AUDIT_PLANNING_SHEET_MISSING',"Sheet 'Audit planning' missing.");
    var rowInfo=findAudit_(loadContext_(sh),auditId);
    if(!rowInfo)return PCMOD_failure_(auditId,'AUDIT_NOT_FOUND_AT_WRITE_BOUNDARY','Audit not found at write boundary.');

    var grandfather=null;
    if(!gate||gate.canCommit!==true){
      grandfather=PCMOD_grandfatherWindow_(gate,rowInfo,blocks);
      if(grandfather.allowed===true)gate=PCMOD_acceptGrandfatheredGate_(gate,grandfather);
      else return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:gate&&gate.reason||'MODIFY_PREFLIGHT_BLOCKED',gate:gate||null,grandfatheredPlanningWindow:grandfather,meta:{writes:false,lockUsed:true}};
    }

    var owner=PlanningCanonicalAvailabilityOwnerGuard_evaluate();
    if(!owner||owner.canProceed!==true)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'CANONICAL_AVAILABILITY_OWNER_UNAVAILABLE',gate:gate,availabilityOwnerGuard:owner||null,meta:{writes:false,lockUsed:true}};

    var status=PCMOD_status_(rowInfo.status);
    if(status!=='APPROVED'&&status!=='PENDING_APPROVAL'&&status!=='ACCEPTED')return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'STATUS_NOT_MODIFIABLE',canonicalStatus:rowInfo.status,gate:gate,meta:{writes:false,lockUsed:true}};

    var old=PCMOD_oldPlanning_(rowInfo),oldOwner=PCMOD_normEmail_(old.auditorEmail||old.assigned),newOwner=PCMOD_normEmail_(email||name);
    if(oldOwner&&newOwner&&oldOwner!==newOwner)return{success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:false,reason:'AUDITOR_CHANGE_NOT_SUPPORTED_R6',canonicalStatus:rowInfo.status,meta:{writes:false,lockUsed:true,sameAuditorOnly:true}};
    if(!email&&old.auditorEmail)email=old.auditorEmail;
    if(!name&&old.auditorName)name=old.auditorName;

    var transition=PCMOD_transition_(rowInfo.status);
    var writerOpts={auditId:auditId,blocks:blocks,auditorName:name||old.auditorName,auditorEmail:email||old.auditorEmail,allowWeekend:input.allowWeekendOverride!==false,isReschedule:true};

    var validation=PlanningCanonicalRowWriter_validate(rowInfo,transition,writerOpts);
    if(!validation||validation.success!==true){
      return PCMOD_failure_(auditId,validation&&validation.code||'CANONICAL_ROW_VALIDATION_FAILED',validation&&validation.message||'Canonical row validation failed.',{
        validation:validation||null,plannedHours:validation&&validation.plannedHours,requiredHours:validation&&validation.requiredHours,hardConflicts:validation&&validation.hardConflicts||[],gate:gate,grandfatheredPlanningWindow:grandfather,
        meta:{writes:false,lockUsed:true,validatedBeforeAvailability:true,availabilityMutated:false}
      });
    }

    var released=PlanningCanonicalAvailabilityAdapter_release({auditId:auditId});
    if(!released||released.success===false)return PCMOD_failure_(auditId,'OLD_AVAILABILITY_RELEASE_FAILED',PCMOD_clean_(released&&released.message)||'Old Availability could not be released.',{availabilityRelease:released||null,validation:validation});

    var reserved=PlanningCanonicalAvailabilityAdapter_reserve({auditId:auditId,auditorEmail:email||old.assigned,auditorName:name||old.assigned,blocks:blocks});
    if(!reserved||reserved.success===false){
      var restoreAfterReserveFail=PCMOD_restore_(auditId,old);
      return PCMOD_failure_(auditId,'NEW_AVAILABILITY_RESERVE_FAILED',PCMOD_clean_(reserved&&reserved.message)||'New Availability could not be reserved.',{availabilityReserve:reserved||null,restoreResult:restoreAfterReserveFail,repairRequired:!(restoreAfterReserveFail&&restoreAfterReserveFail.success!==false),validation:validation});
    }

    writerOpts.prevalidated=validation;
    var writeResult=PlanningCanonicalRowWriter_execute(rowInfo,transition,writerOpts);
    if(!writeResult||writeResult.success!==true){
      var releaseNew=PlanningCanonicalAvailabilityAdapter_release({auditId:auditId}),restoreAfterWriteFail=PCMOD_restore_(auditId,old);
      return PCMOD_failure_(auditId,writeResult&&writeResult.code||'CANONICAL_ROW_WRITE_FAILED',writeResult&&writeResult.message||'Canonical row write failed.',{writeResult:writeResult||null,newAvailabilityRelease:releaseNew||null,restoreResult:restoreAfterWriteFail,repairRequired:!(restoreAfterWriteFail&&restoreAfterWriteFail.success!==false),validation:validation});
    }

    var reaccept=status==='ACCEPTED';
    var notification=reaccept?PCMOD_notifyReaccept_({auditId:auditId,auditorEmail:email,auditorName:name,actorEmail:input.actorEmail},writeResult):null;
    var newRevision=PRT_tokenFromSnapshot_({auditId:auditId,status:writeResult.newStatus||writeResult.afterStatusDisplay,assignedTo:writeResult.assignedTo,datePlanned:writeResult.plannedDate,planningJson:writeResult.planningJson});
    return{
      success:true,build:PLANNING_CANONICAL_MODIFY_BUILD,auditId:auditId,modified:true,reason:reaccept?'MODIFIED_REACCEPTANCE_REQUIRED':'MODIFIED',gate:gate,grandfatheredPlanningWindow:grandfather,validation:validation,plannedHours:validation.plannedHours,requiredHours:validation.requiredHours,availabilityRelease:released,availabilityReserve:reserved,writeResult:writeResult,newRevision:newRevision,notification:notification,
      meta:{writes:true,lockUsed:true,sameAuditorOnly:true,statusPreserved:!reaccept,reacceptanceRequired:reaccept,acceptedMovesToApproved:reaccept,validatedBeforeAvailability:true,availabilityRestoreOnFailure:true,grandfatheredReschedule:!!(grandfather&&grandfather.allowed),notificationRequired:reaccept,notificationDispatched:!!(notification&&notification.success===true&&notification.skipped!==true),notificationFailureDoesNotRollbackLifecycle:true,notificationEvent:reaccept?'AUDIT_PLANNED_BY_MANAGER':'',newSsot:false}
    };
  },wait);
}