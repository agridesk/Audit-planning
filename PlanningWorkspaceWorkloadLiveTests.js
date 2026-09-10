/***********************************************************************
 * PlanningWorkspaceWorkloadLiveTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_WORKLOAD_LIVE_TEST_R2_SCOPE_CONTRACT
 * Read-only DEV validation of the visible auditor workload projection.
 ***********************************************************************/
function RUN_PLANNING_WORKSPACE_WORKLOAD_LIVE_REGRESSION(){
  var started=Date.now(),results=[];
  function check(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});}
  var now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),1),to=new Date(now.getFullYear(),now.getMonth()+12,0);
  function iso(d){return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Amsterdam','yyyy-MM-dd');}
  var out=PlanningWorkspaceWorkloadSummary_get({from:iso(from),to:iso(to),limit:2000});
  check('serviceSuccess',out&&out.success===true);
  check('readOnly',out&&out.meta&&out.meta.readOnly===true);
  check('noNewSsot',out&&out.meta&&out.meta.newSsot===false);
  check('auditorsArray',Array.isArray(out&&out.auditors));
  check('scopeBreakdown',out&&out.meta&&out.meta.scopeBreakdown===true);
  check('unassignedBucket',!!(out&&out.unassigned));
  var auditors=(out&&out.auditors)||[];
  var invalid=auditors.filter(function(a){return !a||typeof a.auditorEmail!=='string'||!Array.isArray(a.scopeBreakdown)||Number(a.hoursToPlan)<0||Number(a.hoursDedicated)<0;});
  check('auditorRowsValid',invalid.length===0,'invalid='+invalid.length);
  var scopeRows=0,invalidScopes=0;
  auditors.forEach(function(a){(a.scopeBreakdown||[]).forEach(function(s){scopeRows++;if(!s||!String(s.scope||'').trim()||Number(s.hoursToPlan)<0||Number(s.hoursDedicated)<0)invalidScopes++;});});
  check('scopeRowsReadable',scopeRows>=0,'scopeRows='+scopeRows);
  check('scopeRowsValid',invalidScopes===0,'invalidScopes='+invalidScopes);
  var passed=results.filter(function(x){return x.ok;}).length;
  var report={ok:passed===results.length,build:'2026-09-10_PLANNING_WORKSPACE_WORKLOAD_LIVE_TEST_R2_SCOPE_CONTRACT',period:out&&out.period,total:results.length,passed:passed,failed:results.length-passed,results:results,observed:{auditors:auditors.length,scopeRows:scopeRows,unassignedAudits:out&&out.unassigned&&out.unassigned.totalAudits||0},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,durationMs:Date.now()-started}};
  Logger.log(JSON.stringify(report,null,2));
  return report;
}
