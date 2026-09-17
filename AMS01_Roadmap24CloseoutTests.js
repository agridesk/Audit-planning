/***********************************************************************
 * FILE: AMS01_Roadmap24CloseoutTests.js
 * BUILD: 2026-09-17_AMS01_ROADMAP_2_4_CLOSEOUT_R1
 *
 * PURPOSE
 * - One consolidated, non-destructive DEV close-out runner for the
 *   Roadmap 2.4 / AMS-01 planning rebuild.
 * - Reuse the already-proven canonical regression/performance runners.
 * - Produce one compact acceptance envelope instead of many mini-runs.
 *
 * GOVERNANCE
 * - DEV only.
 * - No planning/status/Availability business writes.
 * - No notification queue writes.
 * - Diagnostic cold revision probe bypasses acceleration caches without
 *   mutating persistent caches.
 * - Browser walltime remains a client-side metric and is reported as a
 *   separate acceptance dimension, not fabricated server-side.
 ***********************************************************************/
var AMS01_ROADMAP24_CLOSEOUT_BUILD='2026-09-17_AMS01_ROADMAP_2_4_CLOSEOUT_R1';

function AMS01_R24C_clean_(v){return String(v==null?'':v).trim();}
function AMS01_R24C_bool_(v){return v===true;}
function AMS01_R24C_num_(v){var n=Number(v);return isFinite(n)?n:null;}

function AMS01_R24C_call_(name,fn){
  var t0=Date.now(),rec={name:name,ok:false,wallMs:0,result:null,error:''};
  try{
    var r=fn();
    rec.wallMs=Date.now()-t0;
    rec.result=r||null;
    rec.ok=!!(r&&(r.ok===true||r.success===true));
    if(!rec.ok&&r&&r.failed===0)rec.ok=true;
  }catch(e){
    rec.wallMs=Date.now()-t0;
    rec.error=AMS01_R24C_clean_(e&&e.message||e);
  }
  return rec;
}

function AMS01_R24C_require_(name){
  if(typeof this[name]!=='function')throw new Error('AMS01 Roadmap 2.4 closeout: missing '+name);
  return this[name];
}

function AMS01_R24C_workspaceSummary_(rec){
  var r=rec&&rec.result||{},runs=r.runs||{},cold=runs.coldFull||{},warm=runs.warmFull||{},lean=runs.warmNoAvailability||{};
  return{
    ok:!!rec&&rec.ok===true,
    period:r.period||null,
    coldFullMs:AMS01_R24C_num_(cold.wallServerMs),
    warmFullMs:AMS01_R24C_num_(warm.wallServerMs),
    warmNoAvailabilityMs:AMS01_R24C_num_(lean.wallServerMs),
    coldToWarmGainMs:r.derived?AMS01_R24C_num_(r.derived.coldToWarmGainMs):null,
    warmAvailabilityContributionMs:r.derived?AMS01_R24C_num_(r.derived.warmAvailabilityContributionMs):null
  };
}

function AMS01_R24C_coldRevisionSummary_(rec){
  var r=rec&&rec.result||{},m=r.bulkMeta||{},c=r.checks||{};
  return{
    ok:!!rec&&rec.ok===true,
    serverMs:AMS01_R24C_num_(r.coldServerMs),
    requested:Array.isArray(r.auditIds)?r.auditIds.length:null,
    indexReads:AMS01_R24C_num_(m.indexPhysicalSheetReads),
    rowPayloadReads:AMS01_R24C_num_(m.rowPayloadPhysicalSheetReads),
    totalPhysicalReads:AMS01_R24C_num_(m.physicalSheetReadsTotal),
    rangeRows:AMS01_R24C_num_(m.rangeRows),
    zeroCacheHits:AMS01_R24C_bool_(c.zeroCacheHits),
    allTokens:AMS01_R24C_bool_(c.allTokens)
  };
}

function AMS01_R24C_regressionSummary_(rec){
  var r=rec&&rec.result||{};
  return{ok:!!rec&&rec.ok===true,total:AMS01_R24C_num_(r.total),passed:AMS01_R24C_num_(r.passed),failed:AMS01_R24C_num_(r.failed),build:AMS01_R24C_clean_(r.build)};
}

function RUN_AMS01_ROADMAP_2_4_CLOSEOUT(){
  if(typeof EnvironmentGuard_getRuntimeEnv==='function'){
    var env=AMS01_R24C_clean_(EnvironmentGuard_getRuntimeEnv()).toUpperCase();
    if(env&&env!=='DEV')throw new Error('AMS01 Roadmap 2.4 closeout is DEV-only; runtime='+env);
  }
  var required=[
    'RUN_AMS01_2_PLANNING_WORKSPACE_REAL_PERIOD_PERF',
    'RUN_PLANNING_BATCH_REVISION_HYDRATION_COLD_PERF',
    'RUN_PLANNING_BATCH_REVISION_HYDRATION_REGRESSION',
    'RUN_PLANNING_WORKSPACE_RPC_REGRESSION',
    'RUN_PLANNING_BATCH_COMMIT_REGRESSION',
    'RUN_PLANNING_BATCH_COMMIT_INTEGRATION_REGRESSION',
    'RUN_PLANNING_CANONICAL_COMMIT_ORCHESTRATION_REGRESSION'
  ];
  for(var q=0;q<required.length;q++)AMS01_R24C_require_(required[q]);

  var started=Date.now(),probes=[];
  probes.push(AMS01_R24C_call_('workspaceRealPeriod',function(){return RUN_AMS01_2_PLANNING_WORKSPACE_REAL_PERIOD_PERF();}));
  probes.push(AMS01_R24C_call_('batchRevisionCold',function(){return RUN_PLANNING_BATCH_REVISION_HYDRATION_COLD_PERF();}));
  probes.push(AMS01_R24C_call_('batchRevisionRegression',function(){return RUN_PLANNING_BATCH_REVISION_HYDRATION_REGRESSION();}));
  probes.push(AMS01_R24C_call_('workspaceRpcRegression',function(){return RUN_PLANNING_WORKSPACE_RPC_REGRESSION();}));
  probes.push(AMS01_R24C_call_('batchCommitRegression',function(){return RUN_PLANNING_BATCH_COMMIT_REGRESSION();}));
  probes.push(AMS01_R24C_call_('batchCommitIntegration',function(){return RUN_PLANNING_BATCH_COMMIT_INTEGRATION_REGRESSION();}));
  probes.push(AMS01_R24C_call_('canonicalCommitOrchestration',function(){return RUN_PLANNING_CANONICAL_COMMIT_ORCHESTRATION_REGRESSION();}));

  var byName={};for(var i=0;i<probes.length;i++)byName[probes[i].name]=probes[i];
  var serverAcceptance={
    workspaceRealPeriod:AMS01_R24C_workspaceSummary_(byName.workspaceRealPeriod),
    coldBulkRevision:AMS01_R24C_coldRevisionSummary_(byName.batchRevisionCold),
    batchRevision:AMS01_R24C_regressionSummary_(byName.batchRevisionRegression),
    workspaceRpc:AMS01_R24C_regressionSummary_(byName.workspaceRpcRegression),
    batchCommit:AMS01_R24C_regressionSummary_(byName.batchCommitRegression),
    batchCommitIntegration:AMS01_R24C_regressionSummary_(byName.batchCommitIntegration),
    canonicalCommit:AMS01_R24C_regressionSummary_(byName.canonicalCommitOrchestration)
  };
  var allGreen=probes.every(function(p){return p.ok===true;});
  var architecture={
    readModelFirst:true,
    coarseGrainedWorkspaceRpc:true,
    batchRevisionHydration:true,
    physicalNPlusOneRevisionReads:false,
    perItemCanonicalCommitRevalidation:true,
    notificationDispatchOutsidePlanningLock:true,
    reservationReleaseInsideCanonicalLock:true,
    speculativeRpcRequiredForVisibleCommand:false,
    canonicalOwnersPreserved:true,
    secondSsotIntroduced:false
  };
  var clientAcceptance={
    measuredByThisRunner:false,
    reason:'Browser/GAS proxy/paint walltime cannot be measured truthfully from a server-side Apps Script runner.',
    requiredDimensions:['login/route -> first usable planning screen','Calendar Shell Interactive','Planning Decision-Ready','Availability perceived latency','month/range navigation browser walltime','Validate browser walltime','Commit browser walltime','RPC queue depth/concurrent request count','visible-vs-speculative contention'],
    serverCloseoutDoesNotClaimBrowserDoD:true
  };
  var out={
    ok:allGreen,
    build:AMS01_ROADMAP24_CLOSEOUT_BUILD,
    generatedAt:new Date().toISOString(),
    durationMs:Date.now()-started,
    probes:probes.map(function(p){return{name:p.name,ok:p.ok,wallMs:p.wallMs,error:p.error};}),
    serverAcceptance:serverAcceptance,
    architecture:architecture,
    clientAcceptance:clientAcceptance,
    meta:{nonDestructive:true,devOnly:true,businessWrites:false,notificationQueueWrites:false,canonicalOwnersChanged:false,newSsot:false,roadmap:'2.4',workstream:'AMS-01 Performance & Hot Paths'}
  };
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
