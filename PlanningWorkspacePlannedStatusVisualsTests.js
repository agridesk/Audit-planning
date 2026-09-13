/***********************************************************************
 * PlanningWorkspacePlannedStatusVisualsTests.js
 * BUILD: 2026-09-13_WORKSPACE_PLANNED_STATUS_VISUALS_TESTS_R3_GUARDED_OVERLAY_ASSERT
 ***********************************************************************/
var PLANNING_WORKSPACE_PLANNED_STATUS_VISUALS_TEST_BUILD='2026-09-13_WORKSPACE_PLANNED_STATUS_VISUALS_TESTS_R3_GUARDED_OVERLAY_ASSERT';
function RUN_PLANNING_WORKSPACE_PLANNED_STATUS_VISUALS_REGRESSION(){
 var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
 var ui=PlanningWorkspaceUi_contract(),src=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedStatusVisuals.js').getContent(),ctx=String(PlanningWorkspaceAvailabilityContext_get),bundle=String(PWOB_availabilityIndex_);
 t('included',ui.plannedStatusVisualsInclude==='PlanningWorkspacePlannedStatusVisuals.js');
 t('clientOnly',ui.plannedStatusVisualsClientOnly===true);
 t('canonicalStatusProjected',ctx.indexOf("['Status']")>=0&&ctx.indexOf('status:cStatus')>=0);
 t('overlayPrefersCanonicalStatus',bundle.indexOf('status:PWOB_clean_')>=0&&bundle.indexOf('c&&c.status')>=0&&bundle.indexOf('s&&s.status')>=0&&bundle.indexOf('(c&&c.status)||(s&&s.status)')>=0,bundle);
 t('acceptedGreen',src.indexOf("status==='ACCEPTED'")>=0&&src.indexOf("label:'ACCEPTED'")>=0&&src.indexOf("#e8f5e9")>=0);
 t('approvedBlue',src.indexOf("status==='APPROVED'")>=0&&src.indexOf("label:'APPROVED'")>=0&&src.indexOf("#e8f1fb")>=0);
 t('pendingApprovalAmber',src.indexOf("status==='PENDING_APPROVAL'")>=0&&src.indexOf("label:'PENDING APPROVAL'")>=0&&src.indexOf("#fff3d9")>=0);
 t('statusBadge',src.indexOf('pw-canonical-status')>=0);
 t('cardAccent',src.indexOf("card.style.borderLeft='3px solid '")>=0);
 t('modifyBlue',src.indexOf("buttons[0].style.background='#e8f1fb'")>=0);
 t('cancelRed',src.indexOf("buttons[1].style.background='#fff0f0'")>=0);
 t('usesLoadedOverlay',src.indexOf('s.data&&s.data.overlays')>=0);
 t('noExtraRpc',src.indexOf('google.script.run')<0);
 t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
 var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_PLANNED_STATUS_VISUALS_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,canonicalStatusOwner:'Audit planning',ux:'Accepted green, Approved blue, Pending Approval amber; Modify blue and Cancel red.',extraRpcs:0,newSsot:false}};console.log(JSON.stringify(out,null,2));return out;
}
