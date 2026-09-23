/***********************************************************************
 * PlanningHandoverReadModel.js
 * BUILD: 2026-09-23_AMS03_PHASE9_HANDOVER_R1
 * Structured read-only handover projection from existing canonical/profile
 * owners. Does not create CRM/lifecycle truth.
 ***********************************************************************/
var AMS03_HANDOVER_BUILD='2026-09-23_AMS03_PHASE9_HANDOVER_R2_PRELOADED_PROFILE';
function PHR_s_(v){return String(v==null?'':v).trim();}
function getPlanningHandoverV5(payload){
 payload=payload||{};var t0=Date.now(),uid=PHR_s_(payload.companyUid),auditId=PHR_s_(payload.auditId),cp=getPlanningCompanyCommunicationV5({companyUids:uid?[uid]:[],preloadedCompanyProfiles:payload.preloadedCompanyProfiles||null}),company=(cp.companies||[])[0]||null,visit=null;
 if(auditId&&typeof PlanningWorkspacePlannedAuditReadService_get==='function'){try{visit=PlanningWorkspacePlannedAuditReadService_get({auditId:auditId});}catch(e){visit={success:false,error:PHR_s_(e&&e.message||e)};}}
 return{success:true,build:AMS03_HANDOVER_BUILD,companyUid:uid,auditId:auditId,companyHandover:company?{contact:company.contact,planningConstraints:company.planningConstraints,country:company.country,region:company.region,timezone:company.timezone}:null,visitHandover:visit,governance:{structured:true,auditableSourceOwners:true,permissionAwareAtCaller:true,lifecycleTruth:false,genericCrm:false,mutationAllowed:false},meta:{readOnly:true,writes:false,newSsot:false,companyOwner:'Companies via PlanningProfilesService',visitOwner:'PlanningWorkspacePlannedAuditReadService_get',totalMs:Date.now()-t0}};
}
