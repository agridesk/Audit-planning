/***********************************************************************
 * PlanningCompanyCommunicationReadModel.js
 * BUILD: 2026-09-23_AMS03_PHASE9_COMPANY_COMMUNICATION_R1
 * Read-only communication/proposal context; does not send or mutate.
 ***********************************************************************/
var AMS03_COMPANY_COMM_BUILD='2026-09-23_AMS03_PHASE9_COMPANY_COMMUNICATION_R1';
function PCC_clean_(v){return String(v==null?'':v).trim();}
function getPlanningCompanyCommunicationV5(payload){
 payload=payload||{};var t0=Date.now(),uids=Array.isArray(payload.companyUids)?payload.companyUids:[],names=Array.isArray(payload.companyNames)?payload.companyNames:[],p=PlanningProfilesService_get({companyUids:uids,companyNames:names,includeCompanies:true,includeAuditors:false}),rows=(p.companies||[]).map(function(x){return{companyUid:PCC_clean_(x.companyUid),company:PCC_clean_(x.companyName),country:PCC_clean_(x.country),region:PCC_clean_(x.region),timezone:PCC_clean_(x.timezone),contact:{name:PCC_clean_(x.contactName),email:PCC_clean_(x.contactEmail),phone:PCC_clean_(x.contactPhone)},planningConstraints:{days:PCC_clean_(x.planningLimitsDays),hours:PCC_clean_(x.planningLimitsHours),comments:PCC_clean_(x.planningComments)},communicationReady:!!PCC_clean_(x.contactEmail)};});
 return{success:true,build:AMS03_COMPANY_COMM_BUILD,companies:rows,summary:{companies:rows.length,communicationReady:rows.filter(function(x){return x.communicationReady;}).length},meta:{readOnly:true,writes:false,sends:false,newSsot:false,companyOwner:'Companies via PlanningProfilesService',proposalOwner:'Company_Update_Proposals',proposalMutationOwner:'CompanyUpdateProposalsBackend',notificationOwner:'NotificationBuilder / notification queue',advisoryOnly:true,totalMs:Date.now()-t0}};
}
