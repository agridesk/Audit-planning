/***********************************************************************
 * PlanningWorkspacePointerDragFallbackTests.js
 * BUILD: 2026-09-13_WORKSPACE_POINTER_DRAG_AUTOSCROLL_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_POINTER_DRAG_AUTOSCROLL_TEST_BUILD='2026-09-13_WORKSPACE_POINTER_DRAG_AUTOSCROLL_TESTS_R1';
function RUN_PLANNING_WORKSPACE_POINTER_DRAG_AUTOSCROLL_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePointerDragFallback.js').getContent();
  t('buildR4',src.indexOf('WORKSPACE_POINTER_DRAG_FALLBACK_R4_AUTOSCROLL')>=0);
  t('edgeThresholdDeclared',src.indexOf('AUTO_SCROLL_EDGE=72')>=0);
  t('boundedScrollSpeed',src.indexOf('AUTO_SCROLL_MAX=22')>=0);
  t('verticalAndHorizontalScroll',src.indexOf('window.scrollBy(dx,dy)')>=0);
  t('edgeDrivenDelta',src.indexOf('function scrollDelta(pos,size)')>=0);
  t('animationFrameLoop',src.indexOf('requestAnimationFrame(autoScrollStep)')>=0);
  t('pointerMoveStartsAutoScroll',src.indexOf('updateAutoScroll(e.clientX,e.clientY)')>=0);
  t('dropTargetReevaluatedAfterScroll',src.indexOf('paintCell(cellFromPoint(lastX,lastY))')>=0);
  t('autoScrollStopsOnFinish',src.indexOf('active=null;stopAutoScroll();removeGhost()')>=0);
  t('selectionLockPreserved',src.indexOf('setSelectionLock(true)')>=0&&src.indexOf('setSelectionLock(false)')>=0);
  t('noServerRpc',src.indexOf('google.script.run')<0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_POINTER_DRAG_AUTOSCROLL_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,behavior:'Pointer drag auto-scrolls viewport near top/bottom and left/right edges while preserving the active audit and reevaluating the visible drop target.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
