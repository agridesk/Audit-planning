/***********************************************************************
 * PlanningWorkspaceTwoAuditsPerDayTests.js
 * BUILD: 2026-09-13_WORKSPACE_TWO_AUDITS_PER_DAY_TESTS_R1
 * Contract-only, non-destructive.
 ***********************************************************************/
var PLANNING_WORKSPACE_TWO_AUDITS_PER_DAY_TEST_BUILD='2026-09-13_WORKSPACE_TWO_AUDITS_PER_DAY_TESTS_R1';
function RUN_PLANNING_WORKSPACE_TWO_AUDITS_PER_DAY_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var drag=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  var client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  var av=String(AvailabilityPeriodReadModel_get);
  var validator=String(CPV_availability);

  t('canonicalAvailabilityProjectsTwoSlots',av.indexOf("cS2=APRM_findCol_(headers,['Second_Audit_Start_Time'")>=0&&av.indexOf('if(s2)rec.slots.push(s2)')>=0);
  t('workspaceNoLongerTreatsOccupiedNoAsFullDay',drag.indexOf("clean(x.state).toUpperCase()==='NO'&&!slots.length")>=0);
  t('clientProjectsOccupiedNoAsPartial',client.indexOf("return partial?'PARTIAL':stateValue")>=0);
  t('partialDayNotStyledUnavailable',client.indexOf("no=av==='NO',partial=av==='PARTIAL'")>=0);
  t('freeSlotPlannerPresent',drag.indexOf('function findFreeStart(email,date,minsNeeded)')>=0);
  t('freeSlotUsesCanonicalOccupiedSlots',drag.indexOf("source:'canonical'")>=0);
  t('freeSlotUsesConceptOccupiedSlots',drag.indexOf("source:'concept'")>=0);
  t('freeSlotDayStarts0800',drag.indexOf('var start=8*60,end=18*60')>=0);
  t('dropBlocksOnlyWhenNoGap',drag.indexOf("reason:'No non-overlapping time slot remains on this date.'")>=0);
  t('multidayFindsNextDateWithCapacity',drag.indexOf('findFreeStart(email,date,minsNeeded)!=null')>=0);
  t('proposalUsesDetectedStart',drag.indexOf('start:hhmm(start),end:hhmm(start+minsForDay)')>=0);
  t('canonicalValidationStillMandatory',validator.indexOf('AvailabilityService.validate')>=0);
  t('noDirectSheetReadsInClient',drag.indexOf('SpreadsheetApp')<0&&client.indexOf('SpreadsheetApp')<0);
  t('noDirectSheetWritesInClient',drag.indexOf('setValue')<0&&drag.indexOf('setValues')<0&&client.indexOf('setValue')<0&&client.indexOf('setValues')<0);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_TWO_AUDITS_PER_DAY_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,liveReadsPerformed:false,liveWritesPerformed:false,canonicalOwner:'AvailabilityService',behavior:'A day containing an existing canonical or concept audit remains droppable when a non-overlapping 08:00-18:00 gap can contain the proposed audit. Final canonical Availability validation remains authoritative.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
