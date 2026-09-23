/***********************************************************************
 * AMS01_PlanningWorkspaceBootstrapPerformanceAcceptance.js
 * BUILD: 2026-09-23_AMS01_2_WORKSPACE_BOOTSTRAP_PERF_ACCEPTANCE_R2
 * Read-only repeated runtime measurement. Performance is reported as
 * evidence; architecture/fast-path correctness is gated separately.
 ***********************************************************************/
var AMS01_PW_BOOTSTRAP_PERF_BUILD='2026-09-23_AMS01_2_WORKSPACE_BOOTSTRAP_PERF_ACCEPTANCE_R2';
function AMS01_PW_BOOTSTRAP_percentile_(values,p){var a=values.slice().sort(function(x,y){return x-y});if(!a.length)return 0;var i=Math.ceil((p/100)*a.length)-1;return a[Math.max(0,Math.min(a.length-1,i))];}
function RUN_AMS01_2_WORKSPACE_BOOTSTRAP_PERFORMANCE_ACCEPTANCE(){
  var input={from:'2026-09-01',to:'2026-11-30',country:'',scope:'',auditorEmails:[],auditIds:[],includeCompanyMeta:false},samples=[];
  for(var i=0;i<5;i++){var t=Date.now(),x=PlanningWorkspaceRpc_bootstrap(input),wall=Date.now()-t,d=x&&x.data||{},m=d.meta||{},a=d.advisory||{},o=d.overlays||{};samples.push({n:i+1,ok:x&&x.ok===true,wallMs:wall,rpcDurationMs:Number(x&&x.durationMs||0),stageMs:m.stageMs||null,audits:a&&Array.isArray(a.rows)?a.rows.length:0,companyProjectionUsed:a.meta&&a.meta.companyProjectionUsed,preferredAuditMonthsRowsRead:Number(a.meta&&a.meta.preferredAuditMonthsRowsRead||0),availabilityContextBatchReads:Number(o.meta&&o.meta.availabilityContextBatchReads||0),availabilityContextMisses:Number(o.meta&&o.meta.availabilityContextMisses||0),conceptLifecycleBatchReads:Number(o.meta&&o.meta.conceptLifecycleBatchReads||0),payload:m.payload||null});}
  var ms=samples.map(function(x){return x.wallMs}),allOk=samples.every(function(x){return x.ok===true}),fastPathStable=samples.every(function(x){return x.companyProjectionUsed===false&&x.preferredAuditMonthsRowsRead===0&&x.availabilityContextBatchReads===0&&x.availabilityContextMisses===0&&x.conceptLifecycleBatchReads===0}),p50=AMS01_PW_BOOTSTRAP_percentile_(ms,50),p95=AMS01_PW_BOOTSTRAP_percentile_(ms,95);
  var out={ok:allOk&&fastPathStable,build:AMS01_PW_BOOTSTRAP_PERF_BUILD,readOnly:true,writesPerformed:false,input:input,samples:samples,performance:{p50Ms:p50,p95Ms:p95,minMs:Math.min.apply(null,ms),maxMs:Math.max.apply(null,ms),roadmapDecisionReadyTargetMs:2000,commonCachedTargetMs:1000,targetAssessment:{p50WithinDecisionReady:p50<=2000,p95WithinDecisionReady:p95<=2000,p50WithinCommonCached:p50<=1000}},checks:{allCallsSucceeded:allOk,fastPathStable:fastPathStable},meta:{performanceIsObservedNotCorrectnessGate:true,newSsot:false}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
