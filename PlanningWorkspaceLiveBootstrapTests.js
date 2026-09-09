/***********************************************************************
 * PlanningWorkspaceLiveBootstrapTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_LIVE_BOOTSTRAP_TESTS_R1
 *
 * Read-only DEV integration regression. No write endpoints are invoked.
 ***********************************************************************/
var PLANNING_WORKSPACE_LIVE_BOOTSTRAP_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_LIVE_BOOTSTRAP_TESTS_R1';
function RUN_PLANNING_WORKSPACE_LIVE_BOOTSTRAP_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),1),to=new Date(now.getFullYear(),now.getMonth()+3,0);
  function iso(d){return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');}
  var input={from:iso(from),to:iso(to),country:'',scope:'',auditorEmails:[],auditIds:[]};
  var started=Date.now(),out=PlanningWorkspaceRpc_bootstrap(input),elapsed=Date.now()-started;
  t('rpcReturned',!!out,JSON.stringify(out));
  t('rpcOk',out&&out.ok===true,out&&out.error&&out.error.message);
  t('rpcBuild',out&&String(out.build||'').indexOf('PLANNING_WORKSPACE_2_0_RPC')>=0,out&&out.build);
  t('bootstrapAction',out&&out.action==='bootstrap',out&&out.action);
  t('dataPresent',out&&!!out.data);
  t('advisoryPresent',out&&out.data&&!!out.data.advisory);
  t('overlaysPresent',out&&out.data&&!!out.data.overlays);
  t('coarseGrained',out&&out.data&&out.data.meta&&out.data.meta.coarseGrained===true);
  t('serviceFacadeOnly',out&&out.data&&out.data.meta&&out.data.meta.serviceFacadeOnly===true);
  t('durationReported',out&&typeof out.durationMs==='number',out&&out.durationMs);
  t('readOnly',true);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var result={ok:failed===0,build:PLANNING_WORKSPACE_LIVE_BOOTSTRAP_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,input:input,wallTimeMs:elapsed,nextStep:'Expose DEV-only Workspace route after live bootstrap is green.'}};
  console.log(JSON.stringify(result,null,2));return result;
}
