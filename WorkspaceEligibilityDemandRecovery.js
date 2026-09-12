/***********************************************************************
 * WorkspaceEligibilityDemandRecovery.js
 * BUILD: 2026-09-12_WORKSPACE_ELIGIBILITY_DEMAND_RECOVERY_R1
 *
 * Purpose
 * - One-off DEV maintenance for Planning Workspace 2.0.
 * - Refresh only 2026 planning-demand eligibility rows that the canonical
 *   batch read model marks missing / refresh-required.
 * - Runs OUTSIDE the Workspace hot path.
 *
 * Governance
 * - EligibilityTargetedRefreshService remains refresh owner.
 * - Eligibility_Cache is derived acceleration only.
 * - No Audit planning, lifecycle, status or Availability writes.
 ***********************************************************************/
var WORKSPACE_ELIGIBILITY_DEMAND_RECOVERY_BUILD='2026-09-12_WORKSPACE_ELIGIBILITY_DEMAND_RECOVERY_R1';

function WEDR_clean_(v){return String(v==null?'':v).trim();}
function WEDR_ids_(rows){var out=[],seen={};for(var i=0;i<(rows||[]).length;i++){var id=WEDR_clean_(rows[i]&&rows[i].auditId);if(id&&!seen[id]){seen[id]=1;out.push(id);}}return out;}

function RUN_WORKSPACE_ELIGIBILITY_DEMAND_RECOVERY_2026(){
  if(typeof PlanningDemandService_get!=='function')throw new Error('PlanningDemandService_get unavailable');
  if(typeof EligibilityBatchReadModel_get!=='function')throw new Error('EligibilityBatchReadModel_get unavailable');
  if(typeof EligibilityTargetedRefreshService_refresh!=='function')throw new Error('EligibilityTargetedRefreshService_refresh unavailable');

  var demand=PlanningDemandService_get({from:'2026-01-01',to:'2026-12-31',includeCompanyMeta:false,limit:500});
  var demandIds=WEDR_ids_(demand&&demand.rows?demand.rows:[]);
  var before=EligibilityBatchReadModel_get({auditIds:demandIds});
  var targets=[],seen={};
  (before&&before.rows?before.rows:[]).forEach(function(r){
    if(r&&r.requiresCanonicalRefresh===true){var id=WEDR_clean_(r.auditId);if(id&&!seen[id]){seen[id]=1;targets.push(id);}}
  });
  (before&&before.missingAuditIds?before.missingAuditIds:[]).forEach(function(v){var id=WEDR_clean_(v);if(id&&!seen[id]){seen[id]=1;targets.push(id);}});

  var batches=[],refreshed=0,failed=0,orphaned=0;
  for(var offset=0;offset<targets.length;offset+=20){
    var ids=targets.slice(offset,offset+20);
    var res=EligibilityTargetedRefreshService_refresh({auditIds:ids,force:false,dryRun:false,maxRefresh:20});
    batches.push({
      index:batches.length+1,
      requested:ids.length,
      refreshed:Number(res&&res.refreshed||0),
      failed:Number(res&&res.failed||0),
      orphaned:Number(res&&res.orphaned||0),
      items:res&&res.items?res.items:[]
    });
    refreshed+=Number(res&&res.refreshed||0);
    failed+=Number(res&&res.failed||0);
    orphaned+=Number(res&&res.orphaned||0);
  }

  var after=EligibilityBatchReadModel_get({auditIds:demandIds});
  var remainingRefresh=Number(after&&after.meta&&after.meta.refreshRequired||0);
  var remainingMissing=Number(after&&after.meta&&after.meta.missing||0);
  var out={
    ok:failed===0,
    build:WORKSPACE_ELIGIBILITY_DEMAND_RECOVERY_BUILD,
    demandAudits:demandIds.length,
    selected:targets.length,
    refreshed:refreshed,
    failed:failed,
    orphaned:orphaned,
    batches:batches,
    verification:{
      returned:after&&after.rows?after.rows.length:0,
      missing:remainingMissing,
      refreshRequired:remainingRefresh,
      currentEligibilityBuild:after&&after.meta?after.meta.currentEligibilityBuild:''
    },
    meta:{
      derivedCacheOnly:true,
      hotPath:false,
      maxBatchSize:20,
      planningWrites:false,
      statusWrites:false,
      lifecycleWrites:false,
      availabilityWrites:false,
      canonicalRefreshOwner:'EligibilityTargetedRefreshService_refresh'
    }
  };
  console.log(JSON.stringify(out,null,2));
  return out;
}
