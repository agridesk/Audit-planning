/***********************************************************************
 * FILE: ManagerGridExportTests.js
 * BUILD: 2026-09-17_MANAGER_GRID_EXPORT_TESTS_R1
 ***********************************************************************/
function RUN_MANAGER_GRID_EXPORT_REGRESSION(){
  var ui=HtmlService.createHtmlOutputFromFile('ManagerGridExport').getContent();
  var hook=String(V5_ENTRY_resolve);
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  t('managerGridTargeted',ui.indexOf('singleGridTable')>=0&&ui.indexOf('singleGridBody')>=0);
  t('filteredVisibleRowsOnly',ui.indexOf('offsetParent!==null')>=0&&ui.indexOf("display!=='none'")>=0);
  t('columnSelectionPresent',ui.indexOf('mgeCols')>=0&&ui.indexOf('type="checkbox"')>=0);
  t('actionsDefaultOff',ui.indexOf("!/actions?/i.test")>=0);
  t('excelExportPresent',ui.indexOf('application/vnd.ms-excel')>=0&&ui.indexOf("+'.xls'")>=0);
  t('pdfExportPresent',ui.indexOf('window.print()')>=0&&ui.indexOf('@page{size:landscape')>=0);
  t('noExportRpc',ui.indexOf('google.script.run')<0);
  t('noSheetAccess',ui.indexOf('SpreadsheetApp')<0);
  t('noNewSsot',ui.indexOf('PropertiesService')<0&&ui.indexOf('CacheService')<0);
  t('managerOnlyComposition',hook.indexOf("action==='manager'")>=0&&hook.indexOf("createHtmlOutputFromFile('ManagerGridExport')")>=0);
  t('authFlowRetained',hook.indexOf('validateTrustedTokenByRole')>=0&&hook.indexOf('V5_ENTRY_isTestBypass_')>=0);
  t('existingRendererRetained',hook.indexOf('V5_ENTRY_renderApp(action,ctx)')>=0);
  var failed=r.filter(function(x){return !x.ok;});var out={ok:failed.length===0,build:'2026-09-17_MANAGER_GRID_EXPORT_TESTS_R1',total:r.length,passed:r.length-failed.length,failed:failed.length,results:r,meta:{nonDestructive:true,liveReads:false,liveWrites:false,contract:'Manager grid exports currently filtered visible rows to Excel or printable PDF with selectable columns and no extra RPC.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
