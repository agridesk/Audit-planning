/**
 * FILE: AnnualPlanningIntegratedReadModel.gs
 * BUILD: 2026-09-23_AMS03_ANNUAL_PLANNING_INTEGRATED_R1
 * PURPOSE:
 *   Read-only annual planning decision model combining the existing canonical
 *   workload projection and Availability-based capacity projection.
 *
 * GOVERNANCE:
 * - No new workload truth.
 * - No new capacity truth.
 * - Workload owner remains Model C / Audit_Obligations via
 *   getAnnualWorkloadCapacity3SV5().
 * - Capacity owner remains Auditor Availability + PlanningProfiles via
 *   getAnnualAvailabilityCapacityV5().
 * - This file only joins/project existing read models for planner UX.
 * - No writes, no status changes, no Availability mutation.
 ***********************************************************************/
var ANNUAL_PLANNING_INTEGRATED_BUILD='2026-09-23_AMS03_ANNUAL_PLANNING_INTEGRATED_R1';

function getAnnualPlanningIntegratedV5(payload){
  payload=payload||{};
  var year=Number(payload.year||new Date().getFullYear());
  if(!isFinite(year)||year<2000||year>3000)year=new Date().getFullYear();
  var t0=Date.now();
  var workload=getAnnualWorkloadCapacity3SV5({year:year});
  var capacity=getAnnualAvailabilityCapacityV5({year:year});
  return AnnualPlanningIntegrated_project_(year,workload,capacity,Date.now()-t0);
}

function AnnualPlanningIntegrated_project_(year,workload,capacity,totalMs){
  workload=workload||{};capacity=capacity||{};
  var out={
    success:false,
    build:ANNUAL_PLANNING_INTEGRATED_BUILD,
    year:year,
    readOnly:true,
    writesPerformed:false,
    summary:{},
    auditors:[],
    byRegion:workload.byRegion||[],
    byScope:workload.byScope||[],
    byMonth:workload.byMonth||[],
    workload:workload.workload||[],
    diagnostics:{
      workloadBuild:workload.build||'',
      capacityBuild:capacity.build||'',
      workloadReconciled:!!(workload.diagnostics&&workload.diagnostics.reconciled),
      workloadRows:(workload.workload||[]).length,
      capacityAuditors:(capacity.auditors||[]).length,
      joinedAuditors:0,
      totalMs:Number(totalMs||0),
      newSsot:false,
      writes:false
    },
    warnings:[],
    errors:[]
  };
  if(workload.success!==true)out.errors.push('Annual workload projection failed');
  if(capacity.success!==true)out.errors.push('Annual Availability capacity projection failed');
  (workload.errors||[]).forEach(function(e){out.errors.push('Workload: '+e);});
  (capacity.errors||[]).forEach(function(e){out.errors.push('Capacity: '+e);});
  (workload.warnings||[]).forEach(function(w){out.warnings.push('Workload: '+w);});
  (capacity.warnings||[]).forEach(function(w){out.warnings.push('Capacity: '+w);});
  if(out.errors.length)return out;

  var workloadByEmail={};
  (workload.auditors||[]).forEach(function(a){
    var e=AnnualPlanningIntegrated_normEmail_(a.auditorEmail);
    if(e)workloadByEmail[e]=a;
  });
  var capacityByEmail={};
  (capacity.auditors||[]).forEach(function(a){
    var e=AnnualPlanningIntegrated_normEmail_(a.auditorEmail);
    if(e)capacityByEmail[e]=a;
  });

  var keys={},k;
  Object.keys(workloadByEmail).forEach(function(e){keys[e]=true;});
  Object.keys(capacityByEmail).forEach(function(e){keys[e]=true;});

  Object.keys(keys).sort().forEach(function(email){
    var w=workloadByEmail[email]||{},c=capacityByEmail[email]||{};
    var plannedHours=Number(w.formalHoursPlanned||0);
    var toPlanHours=Number(w.formalHoursToPlan||0);
    var totalAssigned=Number(w.totalFormalHours||0);
    var available=Number(c.availableHours||0);
    var occupied=Number(c.occupiedAuditHours||0);
    var gross=Number(c.standardGrossHours||0);
    var remainingAfterAssigned=Math.max(0,available-toPlanHours);
    var allocationPct=available>0?(totalAssigned/available*100):null;
    out.auditors.push({
      auditorEmail:email,
      auditorName:String(c.auditorName||w.auditorName||email),
      obligationsPlanned:Number(w.auditsPlanned||0),
      obligationsToPlan:Number(w.auditsToPlan||0),
      totalObligations:Number(w.totalAudits||0),
      formalHoursPlanned:AnnualPlanningIntegrated_round_(plannedHours),
      formalHoursToPlan:AnnualPlanningIntegrated_round_(toPlanHours),
      totalFormalHours:AnnualPlanningIntegrated_round_(totalAssigned),
      standardGrossHours:AnnualPlanningIntegrated_round_(gross),
      availableHours:AnnualPlanningIntegrated_round_(available),
      occupiedAuditHours:AnnualPlanningIntegrated_round_(occupied),
      hardUnavailableHours:AnnualPlanningIntegrated_round_(c.hardUnavailableHours||0),
      softUnavailableHours:AnnualPlanningIntegrated_round_(c.softUnavailableHours||0),
      overrideableSoftHours:AnnualPlanningIntegrated_round_(c.overrideableSoftHours||0),
      remainingCapacityAfterToPlanHours:AnnualPlanningIntegrated_round_(remainingAfterAssigned),
      workloadVsAvailablePct:allocationPct==null?null:AnnualPlanningIntegrated_round_(allocationPct),
      regions:Array.isArray(w.regions)?w.regions:[],
      scopes:Array.isArray(w.scopes)?w.scopes:[]
    });
  });

  var ws=workload.summary||{},cs=capacity.summary||{};
  var totalAvailable=Number(cs.availableHours||0);
  var totalFormal=Number(ws.totalFormalHours||0);
  out.summary={
    obligations:Number(ws.obligations||0),
    obligationsPlanned:Number(ws.auditsPlanned||0),
    obligationsToPlan:Number(ws.auditsToPlan||0),
    totalFormalHours:AnnualPlanningIntegrated_round_(ws.totalFormalHours||0),
    formalHoursPlanned:AnnualPlanningIntegrated_round_(ws.formalHoursPlanned||0),
    formalHoursToPlan:AnnualPlanningIntegrated_round_(ws.formalHoursToPlan||0),
    unallocatedObligationsToPlan:Number(ws.unallocatedAuditsToPlan||0),
    unallocatedFormalHoursToPlan:AnnualPlanningIntegrated_round_(ws.unallocatedFormalHoursToPlan||0),
    activeAuditors:Number(cs.activeAuditors||out.auditors.length),
    standardGrossHours:AnnualPlanningIntegrated_round_(cs.standardGrossHours||0),
    availableHours:AnnualPlanningIntegrated_round_(totalAvailable),
    occupiedAuditHours:AnnualPlanningIntegrated_round_(cs.occupiedAuditHours||0),
    hardUnavailableHours:AnnualPlanningIntegrated_round_(cs.hardUnavailableHours||0),
    softUnavailableHours:AnnualPlanningIntegrated_round_(cs.softUnavailableHours||0),
    overrideableSoftHours:AnnualPlanningIntegrated_round_(cs.overrideableSoftHours||0),
    workloadVsAvailablePct:totalAvailable>0?AnnualPlanningIntegrated_round_(totalFormal/totalAvailable*100):null
  };
  out.diagnostics.joinedAuditors=out.auditors.length;
  out.success=true;
  return out;
}

function AnnualPlanningIntegrated_normEmail_(v){return String(v||'').trim().toLowerCase();}
function AnnualPlanningIntegrated_round_(v){return Math.round(Number(v||0)*100)/100;}
