/***********************************************************************
 * PlanningWorkspaceDecisionReadModelLiveAcceptance.js
 * BUILD: 2026-09-23_AMS01_3_WORKSPACE_DECISION_LIVE_ACCEPTANCE_R3_SHARED_CONTEXT_TELEMETRY
 * Read-only live integration acceptance for compact decision bootstrap.
 ***********************************************************************/
var PWDRM_LIVE_ACCEPTANCE_BUILD='2026-09-23_AMS01_3_WORKSPACE_DECISION_LIVE_ACCEPTANCE_R3_SHARED_CONTEXT_TELEMETRY';
function RUN_AMS01_3_WORKSPACE_DECISION_LIVE_ACCEPTANCE(){
 var input={from:'2026-09-01',to:'2026-11-30',country:'',scope:'',auditorEmails:[],auditIds:[],includeCompanyMeta:false},t=Date.now(),x=PlanningWorkspaceRpc_bootstrap(input),wall=Date.now()-t,d=x&&x.data||{},a=d.advisory||{},o=d.overlays||{},m=d.meta||{},r=[];function q(n,v,detail){r.push({name:n,ok:!!v,detail:v?'':String(detail||'failed')});}
 q('rpcOk',x&&x.ok===true,x&&x.error&&x.error.message);
 q('compactDecisionModel',m.compactDecisionModel===true,JSON.stringify(m));
 q('decisionBuildPresent',String(m.decisionReadModelBuild||'').indexOf('WORKSPACE_DECISION_READ_MODEL')>=0,m.decisionReadModelBuild);
 q('rowsPresent',Array.isArray(a.rows));
 q('candidateEmailsProjected',Array.isArray(a.candidateAuditorEmails));
 q('companyProjectionSkipped',a.meta&&a.meta.companyProjectionUsed===false,JSON.stringify(a.meta));
 q('preferredMonthsReadSkipped',Number(a.meta&&a.meta.preferredAuditMonthsRowsRead||0)===0,JSON.stringify(a.meta));
 q('availabilityContextNoBatchRead',Number(o.meta&&o.meta.availabilityContextBatchReads||0)===0,JSON.stringify(o.meta));
 q('availabilityContextNoMisses',Number(o.meta&&o.meta.availabilityContextMisses||0)===0,JSON.stringify(o.meta));
 q('lifecycleNoBatchRead',Number(o.meta&&o.meta.conceptLifecycleBatchReads||0)===0,JSON.stringify(o.meta));
 q('sharedContextUsed',o.meta&&o.meta.availabilityContextSharedDemandUsed===true,JSON.stringify(o.meta));
 q('stageDiagnostics',m.stageMs&&typeof m.stageMs.advisory==='number'&&typeof m.stageMs.overlays==='number',JSON.stringify(m.stageMs));
 var failed=r.filter(function(z){return!z.ok}).length,out={ok:failed===0,build:PWDRM_LIVE_ACCEPTANCE_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,performance:{wallMs:wall,rpcDurationMs:Number(x&&x.durationMs||0),stageMs:m.stageMs||null,payload:m.payload||null,audits:Array.isArray(a.rows)?a.rows.length:0,candidateAuditors:Array.isArray(a.candidateAuditorEmails)?a.candidateAuditorEmails.length:0},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
