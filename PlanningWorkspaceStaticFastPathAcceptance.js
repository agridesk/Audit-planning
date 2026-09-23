/***********************************************************************
 * PlanningWorkspaceStaticFastPathAcceptance.js
 * BUILD: 2026-09-23_AMS01_2_WORKSPACE_STATIC_FASTPATH_R1
 * Non-destructive closure gate for the current Planning 2.0 browser path.
 ***********************************************************************/
var PLANNING_WORKSPACE_STATIC_FASTPATH_BUILD='2026-09-23_AMS01_2_WORKSPACE_STATIC_FASTPATH_R1';
function RUN_AMS01_2_WORKSPACE_STATIC_FASTPATH_ACCEPTANCE(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var client=RUN_PLANNING_WORKSPACE_CLIENT_BINDING_REGRESSION();
  var nav=RUN_WORKSPACE_CONCEPT_NAV_STATE_REGRESSION();
  var generated=RUN_WORKSPACE_GENERATED_NAVIGATION_REGRESSION();
  var entry=RUN_AMS01_PLANNING_WORKSPACE_ENTRY_PERF_REGRESSION();
  var closure=RUN_WORKSPACE_REDESIGN_CLOSURE_GATE();
  t('clientContract',client&&client.ok===true,JSON.stringify(client||{}));
  t('conceptNavigationContract',nav&&nav.ok===true,JSON.stringify(nav||{}));
  t('generatedNavigationContract',generated&&generated.ok===true,JSON.stringify(generated||{}));
  t('entryPerformanceContract',entry&&entry.ok===true,JSON.stringify(entry||{}));
  t('redesignClosureContract',closure&&closure.ok===true,JSON.stringify(closure||{}));
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  t('navigationHasNoBootstrapRpc',src.indexOf("state.gridStart=addDays(state.gridStart,-7);renderCalendar()")>=0&&src.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0,'navigation render contract missing');
  t('navigationPerfExport',src.indexOf('__AMS01_PLANNING_WORKSPACE_NAV_PERF')>=0&&src.indexOf("serverRpc:false")>=0,'navigation performance export missing');
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_STATIC_FASTPATH_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,browserRuntimeStillRequired:true,newSsot:false}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
