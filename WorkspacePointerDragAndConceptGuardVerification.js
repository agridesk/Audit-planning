/***********************************************************************
 * WorkspacePointerDragAndConceptGuardVerification.js
 * BUILD: 2026-09-12_WORKSPACE_POINTER_DRAG_CONCEPT_GUARD_VERIFY_R1
 *
 * Non-destructive contract verification for the latest Workspace UX fixes:
 * - pointer-drag fallback is included and client-only;
 * - native drag is disabled when pointer fallback is active;
 * - browser selection is locked during pointer drag;
 * - staged concepts are excluded from Planner attention;
 * - duplicate concept drops are blocked client-side;
 * - pointer fallback reuses the existing drop pipeline (no duplicate RPC).
 ***********************************************************************/
var WORKSPACE_POINTER_DRAG_CONCEPT_GUARD_VERIFY_BUILD='2026-09-12_WORKSPACE_POINTER_DRAG_CONCEPT_GUARD_VERIFY_R1';

function RUN_WORKSPACE_POINTER_DRAG_CONCEPT_GUARD_VERIFICATION(){
  var results=[];
  function t(name,ok,detail){results.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}

  var ui=PlanningWorkspaceUi_contract();
  var pointer=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePointerDragFallback.js').getContent();
  var drag=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  var attention=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAttentionEnhancer.js').getContent();

  t('pointerFallbackIncluded',ui.pointerDragFallbackInclude==='PlanningWorkspacePointerDragFallback.js',ui.pointerDragFallbackInclude);
  t('pointerFallbackClientOnly',ui.pointerDragFallbackClientOnly===true);
  t('pointerFallbackNoRpc',pointer.indexOf('google.script.run')<0);
  t('pointerFallbackNoSheetRead',pointer.indexOf('SpreadsheetApp')<0&&pointer.indexOf('getRange(')<0&&pointer.indexOf('getDataRange(')<0);
  t('pointerFallbackReusesExistingDrop',pointer.indexOf("new DragEvent('drop'")>=0&&pointer.indexOf('cell.dispatchEvent(ev)')>=0);
  t('pointerFallbackNoDuplicateSaveRpc',pointer.indexOf('PlanningWorkspaceRpc_saveConcept')<0&&pointer.indexOf('PlanningWorkspaceRpc_commit')<0);

  t('nativeDragDisabledWhenPointerActive',drag.indexOf('var pointerActive=!!window.PlanningWorkspacePointerDragFallback')>=0&&drag.indexOf("card.setAttribute('draggable','false')")>=0);
  t('selectionLockUsesWebkitAndStandard',pointer.indexOf('-webkit-user-select:none!important')>=0&&pointer.indexOf('user-select:none!important')>=0);
  t('selectionLockPreventsSelectStart',pointer.indexOf('function onSelectStart')>=0&&pointer.indexOf('e.preventDefault()')>=0);
  t('selectionClearedDuringMove',pointer.indexOf('clearSelection()')>=0&&pointer.indexOf('function onPointerMove')>=0);
  t('pointerMoveNonPassive',pointer.indexOf("document.addEventListener('pointermove',onPointerMove,{capture:true,passive:false})")>=0);
  t('nativeDragStartSuppressed',pointer.indexOf('function onDragStart')>=0&&pointer.indexOf("document.addEventListener('dragstart',onDragStart,true)")>=0);

  t('attentionBuildExcludesConcepts',attention.indexOf('EXCLUDE_CONCEPTS')>=0);
  t('attentionBuildReadsReservations',attention.indexOf('function reservedIds()')>=0&&attention.indexOf('o.reservations')>=0);
  t('attentionFiltersReservedAuditIds',attention.indexOf('return !reserved[clean(x&&x.auditId)]')>=0);
  t('attentionNoExtraRpc',attention.indexOf('google.script.run')<0);
  t('attentionNoSheetRead',attention.indexOf('SpreadsheetApp')<0&&attention.indexOf('getRange(')<0);

  t('duplicateDropGuardExists',drag.indexOf('if(reservationById(auditId))')>=0);
  t('duplicateDropGuardBeforeSaveRpc',drag.indexOf('if(reservationById(auditId))')>=0&&drag.indexOf('if(reservationById(auditId))')<drag.indexOf('PlanningWorkspaceRpc_saveConcept'));
  t('duplicateDropGuardRefreshesAttention',drag.indexOf("refreshAttention();return")>=0);
  t('localConceptApplyRefreshesAttention',drag.indexOf('refreshAttention();enhance();return true')>=0);

  var failed=results.filter(function(x){return !x.ok;}).length;
  var out={
    ok:failed===0,
    build:WORKSPACE_POINTER_DRAG_CONCEPT_GUARD_VERIFY_BUILD,
    total:results.length,
    passed:results.length-failed,
    failed:failed,
    results:results,
    meta:{
      nonDestructive:true,
      liveReadsPerformed:false,
      liveWritesPerformed:false,
      contractOnly:true,
      target:'Pointer drag without browser selection + no duplicate staging of an already reserved audit',
      noNewSsot:true
    }
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
