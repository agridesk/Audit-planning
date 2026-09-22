/**
 * FILE: AnnualWorkloadCapacity3SProjection.gs
 * BUILD: 2026-09-22_AMS03_ANNUAL_WORKLOAD_3S_R1
 * PURPOSE:
 *   Read-only 3S projection over the canonical annual workload read model.
 *
 * 3S:
 * - Speed: one canonical workload call; aggregation is in-memory only.
 * - Scalability: compact auditor/region/scope/month summaries; UI does not need
 *   to repeatedly rescan canonical sheets for overview metrics.
 * - Stability: deterministic sorting, reconciliation gates, no writes and no
 *   second planning/capacity truth.
 */
var ANNUAL_WORKLOAD_3S_BUILD='2026-09-22_AMS03_ANNUAL_WORKLOAD_3S_R1';

function getAnnualWorkloadCapacity3SV5(payload){
  payload=payload||{};
  var t0=Date.now();
  var base=getAnnualWorkloadCapacityV5(payload);
  return AnnualWorkload3S_project_(base,Date.now()-t0);
}

function AnnualWorkload3S_project_(base,baseCallMs){
  base=base||{};
  var out={
    success:false,
    build:ANNUAL_WORKLOAD_3S_BUILD,
    readOnly:true,
    writesPerformed:false,
    year:base.year||'',
    summary:base.summary||{},
    auditors:base.auditors||[],
    workload:base.workload||[],
    byRegion:[],
    byScope:[],
    byMonth:[],
    diagnostics:{
      baseBuild:base.build||'',
      baseServerMs:Number(base.__serverMs||0),
      baseCallMs:Number(baseCallMs||0),
      workloadRows:(base.workload||[]).length,
      auditorRows:(base.auditors||[]).length,
      reconciled:false
    },
    warnings:(base.warnings||[]).slice(),
    errors:(base.errors||[]).slice()
  };
  if(base.success!==true){out.errors.push('Base annual workload read model failed');return out;}

  var region={},scope={},month={};
  (base.workload||[]).forEach(function(w){
    AnnualWorkload3S_add_(region,String(w.region||'').trim()||'(No region)',w);
    AnnualWorkload3S_add_(scope,String(w.scope||'').trim()||'(No scope)',w);
    var monthKey=AnnualWorkload3S_monthKey_(w);
    AnnualWorkload3S_add_(month,monthKey,w);
  });

  out.byRegion=AnnualWorkload3S_toList_(region);
  out.byScope=AnnualWorkload3S_toList_(scope);
  out.byMonth=AnnualWorkload3S_toList_(month);

  var s=out.summary||{};
  var agg=AnnualWorkload3S_sum_(out.byScope);
  var expectedHours=Number(s.totalFormalHours||0);
  var expectedAudits=Number(s.obligations||0);
  var reconciles=Math.abs(agg.totalFormalHours-expectedHours)<0.001&&agg.totalAudits===expectedAudits;
  out.diagnostics.reconciled=reconciles;
  if(!reconciles)out.errors.push('3S aggregation does not reconcile with canonical workload summary');

  out.success=out.errors.length===0;
  return out;
}

function AnnualWorkload3S_add_(map,key,w){
  var x=map[key]||(map[key]={key:key,totalAudits:0,auditsPlanned:0,auditsToPlan:0,totalFormalHours:0,formalHoursPlanned:0,formalHoursToPlan:0,unallocatedAuditsToPlan:0,unallocatedFormalHoursToPlan:0});
  var h=Number(w.formalHours||0);
  x.totalAudits++;
  x.totalFormalHours+=h;
  if(w.planned){x.auditsPlanned++;x.formalHoursPlanned+=h;}
  else{
    x.auditsToPlan++;x.formalHoursToPlan+=h;
    if(w.unallocated){x.unallocatedAuditsToPlan++;x.unallocatedFormalHoursToPlan+=h;}
  }
}

function AnnualWorkload3S_monthKey_(w){
  var d=String((w&&w.plannedDate)||'').trim();
  if(/^\d{4}-\d{2}/.test(d))return d.slice(0,7);
  var f=String((w&&w.planningWindowFrom)||'').trim();
  var t=String((w&&w.planningWindowTo)||'').trim();
  if(/^\d{4}-\d{2}/.test(f)&&/^\d{4}-\d{2}/.test(t)&&f.slice(0,7)===t.slice(0,7))return f.slice(0,7);
  if(/^\d{4}-\d{2}/.test(f))return f.slice(0,7)+'+';
  return '(No month)';
}

function AnnualWorkload3S_toList_(map){
  return Object.keys(map||{}).map(function(k){
    var x=map[k];
    ['totalFormalHours','formalHoursPlanned','formalHoursToPlan','unallocatedFormalHoursToPlan'].forEach(function(p){x[p]=Math.round(Number(x[p]||0)*100)/100;});
    return x;
  }).sort(function(a,b){return String(a.key||'').localeCompare(String(b.key||''));});
}

function AnnualWorkload3S_sum_(rows){
  var o={totalAudits:0,totalFormalHours:0};
  (rows||[]).forEach(function(r){o.totalAudits+=Number(r.totalAudits||0);o.totalFormalHours+=Number(r.totalFormalHours||0);});
  o.totalFormalHours=Math.round(o.totalFormalHours*100)/100;
  return o;
}
