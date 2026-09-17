/***********************************************************************
 * FILE: AuditorPortalScrollStabilityTests.js
 * BUILD: 2026-09-17_AUDITOR_PORTAL_SCROLL_STABILITY_TESTS_R1
 ***********************************************************************/
var AUDITOR_SCROLL_TEST_BUILD='2026-09-17_AUDITOR_PORTAL_SCROLL_STABILITY_TESTS_R1';
function RUN_AUDITOR_PORTAL_SCROLL_STABILITY_REGRESSION(){
  var src=HtmlService.createHtmlOutputFromFile('AuditorPortalV5').getContent(),r=[];
  function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var render=String(src.match(/function renderGrid\(rows\)[\s\S]*?\/\/ Client-side grid cache/)||'');
  var patch=String(src.match(/function patchRowInDom\(auditId\)[\s\S]*?function v5RemoveRowFromActiveGrid_/)||'');
  var feedback=String(src.match(/function auditorActionFeedback_\([\s\S]*?function v5_callAuditorAction_/)||'');
  var applyFresh=String(src.match(/function auditorUi_applyFreshRows_\([\s\S]*?function auditorUi_markInteraction_/)||'');
  var micro=String(src.match(/function auditorUi_applyActionMicroRefresh_\([\s\S]*?function auditorUi_pendingLabel_/)||'');
  t('renderGridFound',render.indexOf('function renderGrid(rows)')>=0);
  t('renderGridNoScrollIntoView',render.indexOf('scrollIntoView')<0);
  t('renderGridNoWindowScroll',render.indexOf('window.scroll')<0);
  t('rowPatchUsesOuterHtmlOnly',patch.indexOf('tr.outerHTML = renderRowHtml(r)')>=0&&patch.indexOf('renderGrid(')<0);
  t('feedbackScrollExplicitOptIn',feedback.indexOf('opts.scroll === true')>=0);
  t('feedbackNoDefaultAutoScroll',feedback.indexOf('if (msg && opts && opts.scroll === true)')>=0);
  t('freshRowsSkipRerenderWhenSignatureSame',applyFresh.indexOf('if (!same)')>=0&&applyFresh.indexOf('CURRENT_ROWS = rows.slice()')>=0);
  t('microRefreshPatchesRowFirst',micro.indexOf('patchRowInDom(auditId)')>=0);
  t('acceptMicroRefreshSupported',micro.indexOf("action === 'accept'")>=0);
  t('denyCancelMicroRefreshSupported',micro.indexOf("action === 'deny' || action === 'cancel'")>=0);
  t('noLocationReloadInMicroRefresh',micro.indexOf('location.reload')<0);
  t('noScrollIntoViewInMicroRefresh',micro.indexOf('scrollIntoView')<0);
  var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AUDITOR_SCROLL_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReads:false,liveWrites:false,contract:'Auditor Portal actions and refreshes preserve viewport by patching rows locally, avoiding unchanged-grid rerenders and requiring explicit opt-in for any scrollIntoView'}};Logger.log(JSON.stringify(out,null,2));return out;
}
