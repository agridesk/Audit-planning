/***********************************************************************
 * PlanningWorkspaceConceptReviewTests.js
 * BUILD: 2026-09-13_WORKSPACE_CONCEPT_REVIEW_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_CONCEPT_REVIEW_TEST_BUILD='2026-09-13_WORKSPACE_CONCEPT_REVIEW_TESTS_R1';
function RUN_PLANNING_WORKSPACE_CONCEPT_REVIEW_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var readSrc=String(ConceptReservationReadModel_get);
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceConceptReview.js').getContent();
  t('conceptReviewIncluded',ui.conceptReviewInclude==='PlanningWorkspaceConceptReview.js',ui.conceptReviewInclude);
  t('clientOnly',ui.conceptReviewClientOnly===true);
  t('thresholdSixMonths',ui.conceptReviewThresholdMonths===6&&src.indexOf('REVIEW_MONTHS=6')>=0);
  t('usesLoadedReservationMetadata',ui.conceptReviewUsesLoadedReservationMetadata===true);
  t('noExtraRpc',ui.conceptReviewExtraRpcs===0&&src.indexOf('google.script.run')<0);
  t('createdAtProjected',readSrc.indexOf("['Created At','Created_At']")>=0&&readSrc.indexOf('createdAt:')>=0);
  t('updatedAtProjected',readSrc.indexOf("['Updated At','Updated_At']")>=0&&readSrc.indexOf('updatedAt:')>=0);
  t('reviewFilterPresent',src.indexOf('conceptReviewOnly')>=0&&src.indexOf('Review >6m only')>=0);
  t('reviewBadgePresent',src.indexOf('REVIEW · ')>=0&&src.indexOf('concept-review-badge')>=0);
  t('reviewCountPresent',src.indexOf('conceptReviewMeta')>=0&&src.indexOf('need review')>=0);
  t('doesNotAutoRelease',src.indexOf('releaseConcept')<0&&src.indexOf('ConceptReservationCommandService_release')<0);
  t('doesNotChangeCanonicalStatus',src.indexOf('Status_applyAction')<0);
  t('readModelReadOnly',readSrc.indexOf('writes:false')>=0&&readSrc.indexOf('readOnly:true')>=0);
  t('noNewSsot',ui.newSsot===false);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_CONCEPT_REVIEW_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,liveReadsPerformed:false,liveWritesPerformed:false,threshold:'Concept reservation older than 6 calendar months is flagged REVIEW.',behavior:'Workspace filter/badge/count use already-loaded reservation metadata; no extra RPC and no automatic release or canonical status mutation.',trigger:'Automatic scheduled review trigger remains a later activation step.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
