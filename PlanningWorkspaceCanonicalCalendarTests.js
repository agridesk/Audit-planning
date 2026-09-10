/***********************************************************************
 * PlanningWorkspaceCanonicalCalendarTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_CANONICAL_CALENDAR_TEST_R1
 * Read-only live + contract regression. No business writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_CANONICAL_CALENDAR_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_CANONICAL_CALENDAR_TEST_R1';
function RUN_PLANNING_WORKSPACE_CANONICAL_CALENDAR_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceCanonicalCalendarReadModel_contract();
  t('canonicalOwner',c.source==='Audit planning.Planning JSON');
  t('plannedStatuses',Array.isArray(c.statuses)&&c.statuses.join('|')==='Pending Approval|Approved|Accepted');
  t('singleBatchRead',c.batchReads===1&&c.perAuditReads===0);
  t('readOnly',c.writes===false&&c.newSsot===false);
  var live=PlanningWorkspaceCanonicalCalendarReadModel_get({from:'2026-09-01',to:'2027-08-31'});
  t('liveSuccess',live&&live.success===true);
  t('rowsArray',live&&Array.isArray(live.rows));
  t('liveReadOnly',live&&live.meta&&live.meta.writes===false&&live.meta.readOnly===true);
  t('liveNoNplus1',live&&live.meta&&live.meta.batchReads===1&&live.meta.perAuditReads===0);
  var bad=[];(live.rows||[]).forEach(function(x){var s=String(x.status||'').toLowerCase(),ok=(s==='pending approval'||s==='approved'||s==='accepted')&&Array.isArray(x.blocks)&&x.blocks.length>0&&x.blocks.every(function(b){return /^\d{4}-\d{2}-\d{2}$/.test(String(b.date||''));});if(!ok)bad.push(x.auditId||'?');});
  t('rowContract',bad.length===0,bad.join(','));
  var overlaySrc=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceCalendarClient.js').getContent();
  var plannedClient=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedCalendarClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('calendarProjectsCanonical',overlaySrc.indexOf('canonicalItemsVisible:true')>=0&&overlaySrc.indexOf("data-pw-cal-source=\"'+x.source+'\"")>=0);
  t('plannedClickUsesReadjust',plannedClient.indexOf("calendarPlannedClick:'OPEN_EXISTING_READJUST'")>=0);
  t('plannedDragPreview',plannedClient.indexOf("calendarPlannedDrag:'SHIFT_READJUST_PREVIEW'")>=0&&plannedClient.indexOf('writeOnDrop:false')>=0);
  t('planningWindowGuard',plannedClient.indexOf('planningWindowGuard:true')>=0);
  t('managerOnlyReAdjust',plannedClient.indexOf('managerOnlyReAdjust:true')>=0);
  t('shellIncludesPlannedClient',shell.indexOf('PlanningWorkspacePlannedCalendarClient.js')>=0);
  var f=r.filter(function(x){return!x.ok;}).length;
  var out={ok:f===0,build:PLANNING_WORKSPACE_CANONICAL_CALENDAR_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,existingFunctionalityRemoved:false,canonicalPlannedCalendar:true,plannedReAdjustPreview:true,rowsRead:live&&live.meta?live.meta.rowsRead:0,plannedRows:live&&live.rows?live.rows.length:0}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
