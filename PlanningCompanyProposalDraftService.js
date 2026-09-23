/***********************************************************************
 * PlanningCompanyProposalDraftService.js
 * BUILD: 2026-09-23_AMS03_PHASE9_COMPANY_PROPOSAL_DRAFT_R1
 * Draft/read model only. Company feedback/confirmation write flow is not
 * invented here; final planning remains canonical Workspace commit.
 ***********************************************************************/
var AMS03_COMPANY_PROPOSAL_DRAFT_BUILD='2026-09-23_AMS03_PHASE9_COMPANY_PROPOSAL_DRAFT_R1';
function PCPD_s_(v){return String(v==null?'':v).trim();}
function PlanningCompanyProposalDraft_build(payload){
 payload=payload||{};var auditId=PCPD_s_(payload.auditId),uid=PCPD_s_(payload.companyUid),date=PCPD_s_(payload.date),blocks=Array.isArray(payload.blocks)?payload.blocks:[],ctx=getPlanningCompanyCommunicationV5({companyUids:uid?[uid]:[]}),company=(ctx.companies||[])[0]||null;
 if(!auditId)return{success:false,error:'AUDIT_ID_REQUIRED'};if(!uid)return{success:false,error:'COMPANY_UID_REQUIRED'};if(!date)return{success:false,error:'DATE_REQUIRED'};if(!blocks.length)return{success:false,error:'TIME_BLOCK_REQUIRED'};
 return{success:true,build:AMS03_COMPANY_PROPOSAL_DRAFT_BUILD,proposal:{auditId:auditId,companyUid:uid,company:company?company.company:'',recipient:company&&company.contact?company.contact.email:'',date:date,blocks:blocks,companyActions:['CONFIRM','DECLINE','PARTIAL_AVAILABILITY','SUGGEST_ALTERNATIVE'],finalPlanningCommitted:false},effects:{status:'NONE',availability:'NONE',notification:'DRAFT_ONLY_NOT_QUEUED',auditTrail:'NONE_UNTIL_MUTATION'},governance:{companyCanCommit:false,feedbackMustReturnToWorkspace:true,validatorsRerunAtCommit:true,notificationQueueRequiredForFutureDelivery:true},meta:{readOnly:true,writes:false,sends:false,newSsot:false}};
}
