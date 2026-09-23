/***********************************************************************
 * PlanningCompanyFeedbackContract.js
 * BUILD: 2026-09-23_AMS03_PHASE9_COMPANY_FEEDBACK_CONTRACT_R1
 *
 * Company response contract for a proposed planning slot.
 * Deliberately does NOT write Audit planning, Availability or status.
 * Persistence/transport remains separate until an authenticated external
 * response channel is selected.
 ***********************************************************************/
var AMS03_COMPANY_FEEDBACK_BUILD='2026-09-23_AMS03_PHASE9_COMPANY_FEEDBACK_CONTRACT_R1';
function PCF_s_(v){return String(v==null?'':v).trim();}
function PlanningCompanyFeedback_validate(payload){
 payload=payload||{};var action=PCF_s_(payload.action).toUpperCase(),allowed=['CONFIRM','DECLINE','PARTIAL_AVAILABILITY','SUGGEST_ALTERNATIVE'],errors=[];
 if(!PCF_s_(payload.auditId))errors.push('AUDIT_ID_REQUIRED');
 if(!PCF_s_(payload.companyUid))errors.push('COMPANY_UID_REQUIRED');
 if(allowed.indexOf(action)<0)errors.push('ACTION_INVALID');
 if(action==='DECLINE'&&!PCF_s_(payload.comment))errors.push('DECLINE_REASON_REQUIRED');
 if((action==='PARTIAL_AVAILABILITY'||action==='SUGGEST_ALTERNATIVE')&&(!PCF_s_(payload.date)||!Array.isArray(payload.blocks)||!payload.blocks.length))errors.push('ALTERNATIVE_DATE_TIME_REQUIRED');
 return{success:errors.length===0,build:AMS03_COMPANY_FEEDBACK_BUILD,errors:errors,feedback:{auditId:PCF_s_(payload.auditId),companyUid:PCF_s_(payload.companyUid),action:action,date:PCF_s_(payload.date),blocks:Array.isArray(payload.blocks)?payload.blocks:[],comment:PCF_s_(payload.comment)},effects:{auditStatus:'NONE',availability:'NONE',planning:'NONE'},governance:{companyCanCommit:false,managerReviewRequired:true,workspaceRevalidationRequired:true,canonicalCommitOwner:'PlanningWorkspaceRpc_commit / canonical commit chain',persistenceImplemented:false,externalAuthImplemented:false},meta:{readOnly:true,writes:false,sends:false,newSsot:false}};
}
