/***********************************************************************
 * PlanningWorkspaceRotationPreassignGuardTests.js
 * BUILD: 2026-09-17_ROTATION_PREASSIGN_GUARD_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_ROTATION_GUARD_TEST_BUILD='2026-09-17_ROTATION_PREASSIGN_GUARD_TESTS_R1';
function RUN_PLANNING_WORKSPACE_ROTATION_PREASSIGN_GUARD_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var guard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceRotationPreassignGuard.js').getContent();
  var drag=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  t('guardIncluded',ui.rotationPreassignGuardInclude==='PlanningWorkspaceRotationPreassignGuard.js',ui.rotationPreassignGuardInclude);
  t('guardRequired',ui.rotationPreassignGuardRequired===true);
  t('clientOnly',ui.rotationPreassignGuardClientOnly===true);
  t('visibleWarningDeclared',ui.rotationPreassignWarningVisible===true);
  t('canonicalRevalidationDeclared',ui.rotationCanonicalRevalidationRequired===true);
  t('usesExistingAdvisoryState',guard.indexOf('PlanningWorkspaceClient')>=0&&guard.indexOf('candidateAuditors')>=0);
  t('usesCanonicalRotationProjection',guard.indexOf('rotationWarning===true')>=0);
  t('warningIsVisibleAlert',guard.indexOf("setAttribute('role','alert')")>=0&&guard.indexOf("style.display='block'")>=0);
  t('warningOnAuditorChange',guard.indexOf("addEventListener('change',refresh)")>=0);
  t('warningExplainsCanonicalRecheck',guard.indexOf('canonical validation runs again on Plan')>=0);
  t('dragDropAlreadyWarnsRotation',drag.indexOf("c&&c.rotationWarning===true")>=0&&drag.indexOf("level:'WARNING'")>=0);
  t('noDirectSheetRead',guard.indexOf('SpreadsheetApp')<0&&guard.indexOf('getRange(')<0);
  t('noRpc',guard.indexOf('google.script.run')<0);
  t('noWrite',guard.indexOf('setValue')<0&&guard.indexOf('setValues')<0);
  t('noNewSsot',ui.newSsot===false);
  var failed=r.filter(function(x){return!x.ok}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_ROTATION_GUARD_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReads:false,liveWrites:false,guardScope:'Planning Workspace drag/drop and Individual Toolkit auditor preassignment',canonicalOwner:'EligibilityService / RotationGovernanceService / TieredRotationPolicy',behavior:'visible warning before concept save/plan; canonical validation remains authoritative'}};
  console.log(JSON.stringify(out,null,2));return out;
}
