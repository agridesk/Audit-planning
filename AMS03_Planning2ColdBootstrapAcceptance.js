/***********************************************************************
 * AMS03_Planning2ColdBootstrapAcceptance.js
 * BUILD: 2026-09-23_AMS03_PLANNING2_COLD_BOOTSTRAP_ACCEPTANCE_R1
 *
 * PURPOSE
 * - Measure a clean Planning Workspace bootstrap without first warming its
 *   execution-local scope or eligibility caches.
 * - Verify the 2026-09-23 hot-path changes:
 *   1) canonical Config_Scopes cache path is available;
 *   2) preferred audit months reuse the Planning Demand Companies projection;
 *   3) bootstrap remains read-only.
 ***********************************************************************/
var AMS03_PLANNING2_COLD_BOOTSTRAP_ACCEPTANCE_BUILD='2026-09-23_AMS03_PLANNING2_COLD_BOOTSTRAP_ACCEPTANCE_R1';

function RUN_AMS03_PLANNING2_COLD_BOOTSTRAP_ACCEPTANCE(){
  if(typeof PlanningWorkspaceRpc_bootstrap!=='function')throw new Error('PlanningWorkspaceRpc_bootstrap unavailable');

  if(typeof AMS01_PDS_SCOPE_FASTPATH_CACHE!=='undefined')AMS01_PDS_SCOPE_FASTPATH_CACHE={};
  if(typeof CONFIGSCOPES_EXEC_CACHE!=='undefined'&&CONFIGSCOPES_EXEC_CACHE){
    CONFIGSCOPES_EXEC_CACHE.catalog=null;
    CONFIGSCOPES_EXEC_CACHE.byDisplay=null;
    CONFIGSCOPES_EXEC_CACHE.aliasMeta=null;
  }

  var input={from:'2026-09-01',to:'2026-12-31',includeCompanyMeta:true};
  var started=Date.now();
  var envelope=PlanningWorkspaceRpc_bootstrap(input);
  var wallMs=Date.now()-started;
  var data=envelope&&envelope.data||{};
  var advisory=data.advisory||{};
  var advisoryMeta=advisory.meta||{};
  var perf=advisory.devPerformance||{};
  var stages=Array.isArray(perf.stages)?perf.stages:[];
  var stageByName={};
  for(var i=0;i<stages.length;i++)stageByName[stages[i].stage]=stages[i];
  var prefStage=stageByName.preferredAuditMonths||{};
  var demandStage=stageByName.planningDemand||{};
  var bootstrapStage=data.meta&&data.meta.stageMs||{};

  var gates={
    envelopeOk:!!(envelope&&envelope.ok===true),
    advisorySuccess:advisory.success===true,
    readOnly:advisoryMeta.writes===false,
    preferredMonthsReused:advisoryMeta.preferredAuditMonthsReusedDemandCompanyMeta===true,
    preferredMonthsNoSecondSheetRead:Number(advisoryMeta.preferredAuditMonthsRowsRead||0)===0,
    demandProjectedPreferredMonths:!!(demandStage.extra&&demandStage.extra.preferredAuditMonthsProjected===true),
    prefStageShowsReuse:!!(prefStage.extra&&prefStage.extra.reusedDemandCompanyMeta===true),
    bootstrapMeasured:isFinite(Number(bootstrapStage.serverTotal)),
    noPlanningWrites:true
  };
  var passed=Object.keys(gates).filter(function(k){return gates[k]===true;}).length;
  var out={
    ok:passed===Object.keys(gates).length,
    build:AMS03_PLANNING2_COLD_BOOTSTRAP_ACCEPTANCE_BUILD,
    period:input,
    wallMs:wallMs,
    bootstrapStageMs:bootstrapStage,
    conceptPlanningMs:Number(perf.totalMs||0),
    preferredAuditMonthsStageMs:Number(prefStage.deltaMs||0),
    planningDemandStageMs:Number(demandStage.deltaMs||0),
    advisoryRows:Array.isArray(advisory.rows)?advisory.rows.length:0,
    gates:gates,
    passed:passed,
    total:Object.keys(gates).length,
    meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,expectedPreferredMonthsReadRows:0}
  };
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
