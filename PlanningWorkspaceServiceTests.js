/***********************************************************************
 * PlanningWorkspaceServiceTests.js
 * BUILD: 2026-09-16_PLANNING_WORKSPACE_2_0_SERVICE_FACADE_TESTS_R2_PRACTICAL_CLOSEOUT
 ***********************************************************************/
var PLANNING_WORKSPACE_SERVICE_TEST_BUILD='2026-09-16_PLANNING_WORKSPACE_2_0_SERVICE_FACADE_TESTS_R2_PRACTICAL_CLOSEOUT';
function RUN_PLANNING_WORKSPACE_SERVICE_FACADE_REGRESSION(){var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}var c=PlanningWorkspaceService_contract(),d=c.dependencies||{},e=c.endpoints||{},m=c.meta||{};
t('serviceBuild',c.build===PLANNING_WORKSPACE_SERVICE_BUILD,c.build);
t('advisoryOwner',d.advisory===true&&e.advisory==='ConceptPlanningService_get',JSON.stringify(c));
t('overlayOwner',d.overlays===true&&e.overlays==='PlanningWorkspaceOverlayBundle_get',JSON.stringify(c));
t('conceptUpsertOwner',d.conceptUpsert===true&&e.saveConcept==='ConceptReservationCommandService_upsert',JSON.stringify(c));
t('conceptReleaseOwner',d.conceptRelease===true&&e.releaseConcept==='ConceptReservationCommandService_release',JSON.stringify(c));
t('canonicalCommitOwner',d.canonicalCommit===true&&e.commit==='PlanningCanonicalCommitService_commit',JSON.stringify(c));
t('canonicalModifyOwner',d.canonicalModify===true&&e.modifyPlanned==='PlanningCanonicalModifyService_modify',JSON.stringify(c));
t('canonicalCancelOwner',d.canonicalCancel===true&&e.cancelPlanned==='PlanningCanonicalCancelService_cancel',JSON.stringify(c));
t('plannedDetailOwner',d.plannedDetail===true&&e.plannedDetail==='PlanningWorkspacePlannedAuditReadService_get',JSON.stringify(c));
t('thinFacade',m.thinFacade===true&&m.newBusinessRules===false,JSON.stringify(m));
t('pendingPlanningDemandOnly',m.workspaceDemandStatus==='Pending Planning'&&m.plannedAuditsExcludedFromAdvisory===true,JSON.stringify(m));
t('noNewSsot',m.newSsot===false,JSON.stringify(m));
t('noDirectSheetReads',m.directSheetReads===false,JSON.stringify(m));
t('noDirectSheetWrites',m.directSheetWrites===false,JSON.stringify(m));
t('canonicalCommitOnly',m.canonicalCommitOnly===true&&m.legacyPlanningWriterCalledDirectly===false,JSON.stringify(m));
t('canonicalModifyCommand',m.canonicalModifyCommand===true,JSON.stringify(m));
t('canonicalCancelCommand',m.canonicalCancelCommand===true,JSON.stringify(m));
t('plannedDetailOnDemand',m.plannedDetailOnDemand===true,JSON.stringify(m));
t('advisoryEndpointPresent',typeof PlanningWorkspaceService_getAdvisory==='function');
t('overlayEndpointPresent',typeof PlanningWorkspaceService_getOverlays==='function');
t('saveConceptEndpointPresent',typeof PlanningWorkspaceService_saveConcept==='function');
t('releaseConceptEndpointPresent',typeof PlanningWorkspaceService_releaseConcept==='function');
t('commitEndpointPresent',typeof PlanningWorkspaceService_commit==='function');
t('modifyEndpointPresent',typeof PlanningWorkspaceService_modifyPlanned==='function');
t('cancelEndpointPresent',typeof PlanningWorkspaceService_cancelPlanned==='function');
t('plannedDetailEndpointPresent',typeof PlanningWorkspaceService_getPlannedAudit==='function');
var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_SERVICE_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,facadeInvocationPerformed:false,contractOnly:true,roadmapLayer:'Practical Planning / Workspace 2.0'}};console.log(JSON.stringify(out,null,2));return out;}
