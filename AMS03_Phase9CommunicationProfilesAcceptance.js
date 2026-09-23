/***********************************************************************
 * AMS03_Phase9CommunicationProfilesAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE9_COMM_PROFILES_R2_FEEDBACK_CONTRACT
 ***********************************************************************/
function RUN_AMS03_PHASE9_COMMUNICATION_PROFILES_ACCEPTANCE(){
 var h=String(getPlanningHandoverV5),d=String(PlanningCompanyProposalDraft_build),fb=String(PlanningCompanyFeedback_validate),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('companyProfileOwner',h.indexOf('getPlanningCompanyCommunicationV5')>=0);
 q('visitDetailOwner',h.indexOf('PlanningWorkspacePlannedAuditReadService_get')>=0);
 q('handoverStructured',h.indexOf('structured:true')>=0);
 q('handoverNotLifecycleTruth',h.indexOf('lifecycleTruth:false')>=0);
 q('handoverNotCrm',h.indexOf('genericCrm:false')>=0);
 q('proposalDateTime',d.indexOf('DATE_REQUIRED')>=0&&d.indexOf('TIME_BLOCK_REQUIRED')>=0);
 q('companyConfirmDeclineAlternative',d.indexOf("'CONFIRM','DECLINE','PARTIAL_AVAILABILITY','SUGGEST_ALTERNATIVE'")>=0);
 q('companyCannotCommit',d.indexOf('companyCanCommit:false')>=0&&d.indexOf('finalPlanningCommitted:false')>=0);
 q('feedbackReturnsWorkspace',d.indexOf('feedbackMustReturnToWorkspace:true')>=0);
 q('validatorsRerun',d.indexOf('validatorsRerunAtCommit:true')>=0);
 q('notificationQueueGovernance',d.indexOf('notificationQueueRequiredForFutureDelivery:true')>=0);
 q('draftHasNoStatusEffect',d.indexOf("status:'NONE'")>=0);
 q('draftHasNoAvailabilityEffect',d.indexOf("availability:'NONE'")>=0);
 q('draftDoesNotSend',d.indexOf('sends:false')>=0);
 q('noWrites',h.indexOf('setValue(')<0&&d.indexOf('setValue(')<0);
 q('feedbackActions',fb.indexOf("'CONFIRM','DECLINE','PARTIAL_AVAILABILITY','SUGGEST_ALTERNATIVE'")>=0);
 q('feedbackNoDirectCommit',fb.indexOf('companyCanCommit:false')>=0&&fb.indexOf('managerReviewRequired:true')>=0&&fb.indexOf('workspaceRevalidationRequired:true')>=0);
 q('feedbackNoUnprovenPersistence',fb.indexOf('persistenceImplemented:false')>=0&&fb.indexOf('externalAuthImplemented:false')>=0);
 q('noNewSsot',h.indexOf('newSsot:false')>=0&&d.indexOf('newSsot:false')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PHASE9_COMM_PROFILES_R2_FEEDBACK_CONTRACT',total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,companyFeedbackMutationImplemented:false,companyFeedbackContractImplemented:true}};Logger.log(JSON.stringify(o,null,2));return o;
}
