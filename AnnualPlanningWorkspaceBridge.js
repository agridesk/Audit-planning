/**
 * FILE: AnnualPlanningWorkspaceBridge.gs
 * BUILD: 2026-09-23_AMS03_ANNUAL_WORKSPACE_BRIDGE_R1
 * PURPOSE:
 *   Read-only bridge from the Annual Planning projection into the existing
 *   Planning 2.0 / Concept Planning / Planning Workspace chain.
 *
 * GOVERNANCE:
 * - Annual Planning is not a second planning engine.
 * - Linked obligations launch the existing Workspace using their Audit ID.
 * - Unlinked obligations explicitly report MATERIALIZATION_REQUIRED.
 * - This bridge performs no materialization and no writes.
 * - Audit planning remains the operational compatibility projection.
 ***********************************************************************/
var ANNUAL_PLANNING_WORKSPACE_BRIDGE_BUILD='2026-09-23_AMS03_ANNUAL_WORKSPACE_BRIDGE_R1';

function getAnnualPlanningWorkspaceBridgeV5(payload){
  payload=payload||{};
  var year=Number(payload.year||new Date().getFullYear());
  if(!isFinite(year)||year<2000||year>3000)year=new Date().getFullYear();
  var obligationId=String(payload.obligationId||'').trim();
  var base=getAnnualPlanningIntegratedV5({year:year});
  var out={success:false,build:ANNUAL_PLANNING_WORKSPACE_BRIDGE_BUILD,year:year,readOnly:true,writesPerformed:false,items:[],counts:{total:0,workspaceReady:0,materializationRequired:0,blocked:0},diagnostics:{annualBuild:base&&base.build||'',workspaceOwner:'PlanningWorkspaceService / PlanningWorkspaceRpc',newPlanningEngine:false,newSsot:false,directPlanningWrites:false},errors:[],warnings:[]};
  if(!base||base.success!==true){out.errors.push('Annual Planning integrated model failed');return out;}
  var rows=Array.isArray(base.workload)?base.workload:[];
  if(obligationId)rows=rows.filter(function(w){return String(w&&w.obligationId||'').trim()===obligationId;});
  if(obligationId&&!rows.length){out.errors.push('Annual obligation not found for year '+year+': '+obligationId);return out;}
  rows.forEach(function(w){
    w=w||{};
    var auditId=String(w.auditId||'').trim(),formalHours=Number(w.formalHours||0),state='';
    if(!(formalHours>0))state='BLOCKED';
    else state=auditId?'WORKSPACE_READY':'MATERIALIZATION_REQUIRED';
    var from=String(w.planningWindowFrom||'').trim(),to=String(w.planningWindowTo||'').trim();
    var item={obligationId:String(w.obligationId||'').trim(),auditId:auditId,companyUid:String(w.companyUid||'').trim(),company:String(w.company||'').trim(),scope:String(w.scope||'').trim(),cycleKey:String(w.cycleKey||''),formalHours:formalHours,status:String(w.status||''),planningWindowFrom:from,planningWindowTo:to,state:state,workspaceRoute:auditId?{auditId:auditId,from:from,to:to,source:'ANNUAL_PLANNING'}:null,materialization:auditId?null:{required:true,reason:'OBLIGATION_HAS_NO_ACTIVE_VISIT',canonicalOwner:'Audit_Visit_Obligations',nextStep:'MATERIALIZE_OR_LINK_VISIT_THEN_OPEN_WORKSPACE'}};
    out.items.push(item);out.counts.total++;
    if(state==='WORKSPACE_READY')out.counts.workspaceReady++;
    else if(state==='MATERIALIZATION_REQUIRED')out.counts.materializationRequired++;
    else out.counts.blocked++;
  });
  out.success=out.errors.length===0;
  return out;
}

function AnnualPlanningWorkspaceBridge_contract(){return{build:ANNUAL_PLANNING_WORKSPACE_BRIDGE_BUILD,source:'getAnnualPlanningIntegratedV5',target:'PlanningWorkspaceService / PlanningWorkspaceRpc',states:['WORKSPACE_READY','MATERIALIZATION_REQUIRED','BLOCKED'],meta:{readOnly:true,directSheetReads:false,directSheetWrites:false,newSsot:false,newPlanningEngine:false,conceptPlanningReused:true,workspaceReused:true,canonicalCommitReused:true}};}
