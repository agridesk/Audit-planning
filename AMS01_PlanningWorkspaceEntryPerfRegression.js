/***********************************************************************
 * FILE: AMS01_PlanningWorkspaceEntryPerfRegression.js
 * BUILD: 2026-09-17_AMS01_PLANNING_WORKSPACE_ENTRY_PERF_REGRESSION_R2_NATIVE_TRANSPORT
 * Non-destructive structural/runtime gate for direct shell + one initial RPC.
 ***********************************************************************/
var AMS01_PW_ENTRY_PERF_TEST_BUILD='2026-09-17_AMS01_PLANNING_WORKSPACE_ENTRY_PERF_REGRESSION_R2_NATIVE_TRANSPORT';
function RUN_AMS01_PLANNING_WORKSPACE_ENTRY_PERF_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var route=RUN_PLANNING_WORKSPACE_ENTRY_ROUTE_REGRESSION();
  var client=RUN_PLANNING_WORKSPACE_CLIENT_BINDING_REGRESSION();
  t('routeRegression',route&&route.ok===true,JSON.stringify(route||{}));
  t('clientRegression',client&&client.ok===true,JSON.stringify(client||{}));
  var c=PlanningWorkspaceEntryRoute_contract();
  t('authOwnerPreserved',c.authenticatedEntryOwner==='EntryV5'&&c.authFunction==='V5_ENTRY_resolve',JSON.stringify(c));
  t('directShell',c.directDataIndependentShell===true,JSON.stringify(c));
  t('oneInitialRpc',c.initialAuthAndDataSingleRpc===true&&c.initialSerialRpcCount===1,JSON.stringify(c));
  t('noPlanningDataBeforeAuth',c.planningDataBeforeAuth===false,JSON.stringify(c));
  t('nativeAuthenticatedEnvelope',c.authenticatedDataEnvelope==='NATIVE_OBJECT'&&c.explicitJsonStringify===false&&c.browserJsonParse===false,JSON.stringify(c));
  var html='';
  try{var out=doGet({parameter:{action:'planningworkspace'}});html=out&&typeof out.getContent==='function'?out.getContent():String(out||'');}catch(e){html='__ERROR__'+String(e&&e.message||e);}
  t('directDoGetSuccess',html.indexOf('__ERROR__')!==0,html.slice(0,300));
  t('workspaceReturnedOnFirstHttp',html.indexOf('Planning Workspace')>=0,html.slice(0,300));
  t('directShellRuntimeFlag',html.indexOf('__PW_ENTRY_DIRECT_SHELL')>=0,html.slice(0,500));
  t('oldOpeningBootstrapBypassed',html.indexOf('Opening audit data...')<0,html.slice(0,500));
  t('noBusinessSeed',html.indexOf('serverSeed\":true')<0&&html.indexOf('serverSeed&quot;:true')<0,'unexpected business seed');
  t('clientHasTransportMetric',html.indexOf('Transport ')>=0,'transport metric missing');
  t('oldAuthDataMarkerAbsent',html.indexOf('__PW_AUTH_DATA__')<0,'old string marker still present');
  var failed=r.filter(function(x){return!x.ok;}).length;
  var result={ok:failed===0,build:AMS01_PW_ENTRY_PERF_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,businessReadsPerformed:false,businessWritesPerformed:false,notificationWritesPerformed:false,authOwner:'EntryV5',oldInitialSerialRpcCount:2,newInitialSerialRpcCount:1,directDataIndependentShell:true,authenticatedDataEnvelope:'NATIVE_OBJECT'}};
  Logger.log(JSON.stringify(result,null,2));return result;
}
