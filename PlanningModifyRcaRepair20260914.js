/***********************************************************************
 * PlanningModifyRcaRepair20260914.js
 * BUILD: 2026-09-14_MODIFY_RCA_REPAIR_R1
 *
 * One-time DEV repair after the 2026-09-14 Modify RCA:
 * - invalidate planning-window cache generation;
 * - rebuild persisted planning windows from canonical Config_Scopes;
 * - verify Monterosa resolves through 2026-09-30;
 * - verify legacy orphan Availability rows 16/17/18 Sep are no longer hard;
 * - run grouped Modify regressions.
 *
 * Config_Scopes itself is NOT changed here; it is the canonical data owner.
 ***********************************************************************/
var PLANNING_MODIFY_RCA_REPAIR_BUILD='2026-09-14_MODIFY_RCA_REPAIR_R1';

function RUN_PLANNING_MODIFY_RCA_REPAIR_AND_VERIFY(){
  var auditId='AUD_ViveirosMonterosaLda_HQ_1777531729533_86';
  var auditor='david@agriqa.es';
  var out={ok:false,build:PLANNING_MODIFY_RCA_REPAIR_BUILD,cacheGeneration:'',recalculate:null,monterosa:null,availability:null,regression:null,errors:[],meta:{writes:true,persistenceWrites:'Planning window derived columns only',cacheInvalidated:true,newSsot:false}};
  try{
    if(typeof _mp_pwGenBump_!=='function')throw new Error('_mp_pwGenBump_ unavailable');
    if(typeof AnnualCycleEngineV5_RecalculatePlanningWindowsAll!=='function')throw new Error('AnnualCycleEngineV5_RecalculatePlanningWindowsAll unavailable');
    if(typeof PlanningWorkspacePlannedAuditReadService_get!=='function')throw new Error('PlanningWorkspacePlannedAuditReadService_get unavailable');
    if(typeof RUN_PLANNING_MODIFY_WINDOW_VERIFICATION!=='function')throw new Error('RUN_PLANNING_MODIFY_WINDOW_VERIFICATION unavailable');
    if(typeof AvailabilityService==='undefined'||!AvailabilityService||typeof AvailabilityService.getAuditorAvailabilityRaw!=='function')throw new Error('AvailabilityService.getAuditorAvailabilityRaw unavailable');

    out.cacheGeneration=String(_mp_pwGenBump_()||'');
    out.recalculate=AnnualCycleEngineV5_RecalculatePlanningWindowsAll();
    out.monterosa=PlanningWorkspacePlannedAuditReadService_get({auditId:auditId});

    var raw=AvailabilityService.getAuditorAvailabilityRaw(auditor,'2026-09-16','2026-09-18',{}),days=raw&&raw.days||{},hard=[];
    ['2026-09-16','2026-09-17','2026-09-18'].forEach(function(d){
      var intervals=days[d]&&days[d].intervals||[];
      intervals.forEach(function(it){if(it&&it.hard!==false&&String(it.kind||'').toLowerCase()!=='soft')hard.push({date:d,reason:String(it.reason||''),auditId:String(it.auditId||'')});});
    });
    out.availability={success:true,hardConflicts:hard,daysChecked:['2026-09-16','2026-09-17','2026-09-18']};
    out.regression=RUN_PLANNING_MODIFY_WINDOW_VERIFICATION();

    var windowOk=out.monterosa&&out.monterosa.success===true&&String(out.monterosa.planningWindowTo||'')==='2026-09-30';
    var availabilityOk=hard.length===0;
    var recalcOk=out.recalculate&&out.recalculate.success===true;
    var regressionOk=out.regression&&out.regression.ok===true;
    out.ok=!!(windowOk&&availabilityOk&&recalcOk&&regressionOk);
    if(!windowOk)out.errors.push('Monterosa planningWindowTo expected 2026-09-30, got '+String(out.monterosa&&out.monterosa.planningWindowTo||''));
    if(!availabilityOk)out.errors.push('Legacy hard Availability rows remain on 16/17/18 Sep');
    if(!recalcOk)out.errors.push('Planning-window rebuild failed');
    if(!regressionOk)out.errors.push('Modify regression failed');
  }catch(e){out.errors.push(String(e&&e.message||e));}
  console.log(JSON.stringify(out,null,2));
  return out;
}
